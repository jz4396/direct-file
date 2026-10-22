package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.util.ReflectionTestUtils;
import org.yaml.snakeyaml.Yaml;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #120: 2026 draft Schedule 8812 (https://www.irs.gov/pub/irs-dft/f1040s8--dft.pdf), Form 2441
 * (https://www.irs.gov/pub/irs-dft/f2441--dft.pdf), Form 8880 (https://www.irs.gov/pub/irs-dft/f8880--dft.pdf) and
 * Form 8889 (https://www.irs.gov/pub/irs-dft/f8889--dft.pdf) end-to-end through the real PdfService, fact dictionary
 * and application.yaml. Draft-based field maps: re-verify when the final forms are released.
 *
 * <p>Golden returns are the synthetic scenarios under src/test/resources/scenarios. Every TIN in them is rewritten to a
 * test-only 9xx area number before the return is built, so no printed SSN, ITIN or EIN can be a real one. Facts that
 * those scenarios predate (TY2026 interview questions with an obvious "none" answer) are added as empty / false.
 *
 * <p>These scenarios prove PDF printing only. A 9xx number is never an SSN in the fact graph ({@code Tin.isSSN} is
 * false for every area starting with 9), so a 9xx filer is an ITIN holder and a child declared {@code tinType = ssn}
 * with a 9xx number makes {@code /familyAndHouseholdHasInvalidTIN} (submission-blocking) true. The Child Tax Credit
 * needs both SSNs: 26 U.S.C. 24(h)(7) (https://www.law.cornell.edu/uscode/text/26/24), as amended by P.L. 119-21,
 * allows no credit for a qualifying child "unless the taxpayer includes on the return of tax for the taxable year—
 * (i) the taxpayer's social security number ..., and (ii) the social security number of such qualifying child." So
 * the CTC scenario ({@link #scenarioFactsWithCtcSsns}) gives the primary filer and each dependent declared ssn a
 * group-00 test SSN instead of a 9xx number; the SSA never assigns group 00
 * (https://www.ssa.gov/employer/randomization.html). Other scenarios keep 9xx numbers throughout.
 */
class CreditFormsTy2026PdfSmokeTest {
    static final String DRAFT_MARK = "OMB USE ONLY DRAFT";
    static final String COVER_SHEET = "The draft you are looking for begins on the next page";

    /** Submission-blocking: a dependent's TIN does not match its declared type. */
    static final String INVALID_TIN = "/familyAndHouseholdHasInvalidTIN";

    private static FactGraphService factGraphService;

    static synchronized FactGraphService factGraphService() throws Exception {
        if (factGraphService != null) {
            return factGraphService;
        }
        ObjectMapper mapper = new ObjectMapper();
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        FactGraphService fgs = new FactGraphService(mapper, ctx);
        ReflectionTestUtils.setField(fgs, "loadAtStartup", true);
        ReflectionTestUtils.setField(fgs, "factDictionaryXmlPattern", "classpath:/tax/*.xml");
        Method init = FactGraphService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(fgs);
        factGraphService = fgs;
        return fgs;
    }

    /** Whether a boolean fact of the scenario's graph is true. */
    static boolean factIsTrue(String scenario, String path) throws Exception {
        var r = factGraphService().getGraph(scenarioFacts(scenario)).get(path);
        return r.hasValue() && Boolean.TRUE.equals(r.get());
    }

    /** Group-00 test SSN for the primary filer in the CTC scenario. */
    static final String CTC_FILER_SSN = "444-00-4444";

    /** Group-00 test SSNs for the dependents declared ssn in the CTC scenario, in the scenario file's order. */
    static final List<String> CTC_CHILD_SSNS = List.of("444-00-1111", "444-00-2222", "444-00-3333");

    /**
     * {@link #scenarioFacts}, then the primary filer gets {@link #CTC_FILER_SSN} and each dependent declared
     * {@code tinType = ssn} gets the next of {@link #CTC_CHILD_SSNS}, so 26 U.S.C. 24(h)(7) is met. Every other number
     * (care providers, employers) stays 9xx.
     */
    static Map<String, FactTypeWithItem> scenarioFactsWithCtcSsns(String scenario) throws Exception {
        Map<String, FactTypeWithItem> facts = scenarioFacts(scenario);
        ObjectMapper mapper = new ObjectMapper();
        Map<String, FactTypeWithItem> overrides = new LinkedHashMap<>();
        int child = 0;
        for (String k : new ArrayList<>(facts.keySet())) {
            if (k.startsWith("/filers/#")
                    && k.endsWith("/isPrimaryFiler")
                    && facts.get(k).item().asBoolean(false)) {
                overrides.put(k.substring(0, k.length() - "/isPrimaryFiler".length()) + "/tin", tinFact(CTC_FILER_SSN));
            }
            if (k.startsWith("/familyAndHousehold/#")
                    && k.endsWith("/tinType")
                    && mapper.writeValueAsString(facts.get(k)).contains("\"ssn\"")) {
                overrides.put(
                        k.substring(0, k.length() - "/tinType".length()) + "/tin",
                        tinFact(CTC_CHILD_SSNS.get(child++)));
            }
        }
        facts.putAll(overrides);
        return facts;
    }

    static FactTypeWithItem tinFact(String dashed) throws Exception {
        String[] p = dashed.split("-");
        return new ObjectMapper()
                .readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.TinWrapper\",\"item\":{\"area\":\"" + p[0]
                                + "\",\"group\":\"" + p[1] + "\",\"serial\":\"" + p[2] + "\"}}",
                        FactTypeWithItem.class);
    }

    /**
     * 26 U.S.C. 24(h)(7): /filerSsnRequirementForCtcMet is complete and true, and no dependent has an invalid TIN
     * (/familyAndHouseholdHasInvalidTIN complete and false).
     */
    static void assertCtcSsnRequirementMet(Map<String, FactTypeWithItem> facts) throws Exception {
        var graph = factGraphService().getGraph(facts);
        var met = graph.get("/filerSsnRequirementForCtcMet");
        assertTrue(met.complete() && Boolean.TRUE.equals(met.get()), "/filerSsnRequirementForCtcMet");
        var invalid = graph.get(INVALID_TIN);
        assertTrue(invalid.complete() && Boolean.FALSE.equals(invalid.get()), INVALID_TIN);
    }

    static byte[] generateScenario(String scenario) throws Exception {
        return generate(scenario, scenarioFacts(scenario));
    }

    static byte[] generate(String scenario, Map<String, FactTypeWithItem> typed) throws Exception {
        FactGraphService fgs = factGraphService();
        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        PdfService pdfService = new PdfService(props, new IOLocationService(null), fgs);

        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(typed);
        byte[] bytes;
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
            bytes = in.readAllBytes();
        }
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "credit-forms-ty2026-" + scenario.replace(".json", ".pdf")), bytes);
        }
        return bytes;
    }

    /**
     * Facts of a scenario under src/test/resources/scenarios, with every TIN moved to a test-only 9xx area and the
     * TY2026 interview facts the scenario predates filled in as none / false.
     */
    static Map<String, FactTypeWithItem> scenarioFacts(String scenario) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(new ClassPathResource("scenarios/" + scenario).getInputStream());
        ObjectNode facts = (ObjectNode) root.get("facts");
        Map<String, String> defaults = new LinkedHashMap<>();
        for (String c : new String[] {
            "/form1099Miscs",
            "/offeredFormW2s",
            "/offeredInterestReports",
            "/scheduleCBusinesses",
            "/form8949Transactions"
        }) {
            defaults.put(c, "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        }
        defaults.put("/soldCapitalAssets", ScheduleATy2026PdfSmokeTest.bool(false));
        defaults.put("/scheduleAWantsToItemize", ScheduleATy2026PdfSmokeTest.bool(false));
        defaults.put(
                "/primaryFilerSsnEmploymentValidity",
                "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"neither\"],"
                        + "\"enumOptionsPath\":\"/primaryFilerSsnEmploymentValidityOptions\"}}");
        for (Iterator<Map.Entry<String, JsonNode>> it = facts.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            if (e.getKey().startsWith("/formW2s/#") && e.getKey().endsWith("/filer")) {
                String w2 = e.getKey().substring(0, e.getKey().length() - "/filer".length());
                defaults.put(w2 + "/writableCombatPay", ScheduleATy2026PdfSmokeTest.dollar("0.00"));
                defaults.put(w2 + "/writableDependentCareBenefits", ScheduleATy2026PdfSmokeTest.dollar("0.00"));
            }
            if (e.getValue().path("$type").asText().endsWith("TinWrapper")) {
                ObjectNode tin = (ObjectNode) e.getValue().get("item");
                tin.put("area", "9" + tin.get("area").asText().substring(1));
            }
        }
        for (var d : defaults.entrySet()) {
            if (!facts.has(d.getKey())) {
                facts.set(d.getKey(), mapper.readTree(d.getValue()));
            }
        }
        return mapper.convertValue(facts, new TypeReference<Map<String, FactTypeWithItem>>() {});
    }

    static List<String> pageTexts(PDDocument doc) throws Exception {
        List<String> texts = new ArrayList<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            texts.add(stripper.getText(doc).replaceAll("\\s+", " "));
        }
        return texts;
    }

    static List<Integer> pages(List<String> texts, Predicate<String> isFormPage) {
        List<Integer> found = new ArrayList<>();
        for (int i = 0; i < texts.size(); i++) {
            if (isFormPage.test(texts.get(i))) {
                found.add(i);
            }
        }
        return found;
    }

    /** Field values on the given pages only (fully qualified name -> value), so other forms cannot collide. */
    static Map<String, String> fieldsOn(PDDocument doc, List<Integer> pageIndexes) {
        Set<COSBase> widgets = new HashSet<>();
        for (int i : pageIndexes) {
            for (PDAnnotation a : getAnnotations(doc, i)) {
                if (a instanceof PDAnnotationWidget) {
                    widgets.add(a.getCOSObject());
                }
            }
        }
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDTerminalField t) {
                for (PDAnnotationWidget w : t.getWidgets()) {
                    if (widgets.contains(w.getCOSObject())) {
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    private static List<PDAnnotation> getAnnotations(PDDocument doc, int page) {
        try {
            return doc.getPage(page).getAnnotations();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static String field(Map<String, String> f, String suffix) {
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique on the form: " + suffix);
                found = e.getValue() == null ? "" : e.getValue();
            }
        }
        assertTrue(found != null, "field present on the form: " + suffix);
        return found;
    }

    static long amt(Map<String, String> f, String suffix) {
        return ScheduleATy2026PdfSmokeTest.cents(field(f, suffix));
    }

    /** Every printed SSN-shaped number is a test-only 9xx or group-00 number (the SSA assigns neither as an SSN). */
    static void assertOnlyTestTins(Map<String, String> f) {
        for (var e : f.entrySet()) {
            String v = e.getValue() == null ? "" : e.getValue();
            if (v.matches("\\d{3}-\\d{2}-\\d{4}")) {
                assertTrue(
                        v.startsWith("9") || v.substring(4, 6).equals("00"),
                        "test-only 9xx or group-00 TIN printed in " + e.getKey() + ": " + v);
            }
        }
    }

    static boolean is2441(String t) {
        return t.contains(DRAFT_MARK)
                && t.contains("Form 2441")
                && (t.contains("Child and Dependent Care Expenses") || t.contains("Form 2441 (2026) Page 2"));
    }

    static boolean is8812(String t) {
        return t.contains(DRAFT_MARK) && (t.contains("SCHEDULE 8812") || t.contains("Schedule 8812 (Form 1040) 2026"));
    }

    static boolean is8880(String t) {
        return t.contains(DRAFT_MARK)
                && t.contains("Form 8880")
                && (t.contains("Credit for Qualified Retirement Savings Contributions")
                        || t.contains("Form 8880 (2026)"));
    }

    static boolean is8889(String t) {
        return t.contains(DRAFT_MARK) && t.contains("8889") && t.contains("Health Savings Accounts");
    }

    @Test
    void childCareAndChildTaxCreditReturnPrints2026Form2441AndSchedule8812() throws Exception {
        // hoh-cdcc.json: head of household, $50,000 W-2 wages, two qualifying children under 13 (ages 10 and 7 at the
        // end of 2026), one care provider paid $2,000 for the younger child, no dependent care benefits.
        // The filer and both children have group-00 test SSNs, so 26 U.S.C. 24(h)(7) is met (see the class comment).
        Map<String, FactTypeWithItem> facts = scenarioFactsWithCtcSsns("hoh-cdcc.json");
        assertCtcSsnRequirementMet(facts);
        assertFalse(
                factGraphService()
                        .submissionBlockingFactPaths(factGraphService().getGraph(facts))
                        .contains(INVALID_TIN),
                "sign/submit gate doesn't name " + INVALID_TIN);
        try (PDDocument doc = Loader.loadPDF(generate("hoh-cdcc.json", facts))) {
            List<String> texts = pageTexts(doc);
            assertFalse(String.join(" ", texts).contains(COVER_SHEET), "draft cover sheets dropped");

            List<Integer> p2441 = pages(texts, CreditFormsTy2026PdfSmokeTest::is2441);
            assertEquals(2, p2441.size(), "Form 2441 prints its two form pages (cover sheet dropped)");
            Map<String, String> f = fieldsOn(doc, p2441);
            assertOnlyTestTins(f);
            assertTrue(field(f, "Page1[0].f1_1[0]").contains("Testerface"), "name line");
            assertEquals(CTC_FILER_SSN, field(f, "Page1[0].f1_2[0]"), "SSN (group-00 test SSN)");
            // Part I, 2026 layout: one column per provider.
            assertEquals("Mrs Doubtfire", field(f, "Row1a[0].Provider1[0].f1_3[0]"), "1a provider 1 name");
            assertFalse(field(f, "Row1b[0].Provider1[0].f1_6[0]").isBlank(), "1b provider 1 address");
            assertEquals("903-00-1101", field(f, "Row1c[0].f1_9[0]"), "1c provider 1 identifying number");
            assertEquals("Off", field(f, "Row1d[0].Provider1[0].c1_4[0]"), "1d provider 1 household employee: not Yes");
            assertEquals("2", field(f, "Row1d[0].Provider1[0].c1_4[1]"), "1d provider 1 household employee: No");
            assertEquals(200000, amt(f, "Row1e[0].f1_12[0]"), "1e provider 1 amount paid");
            assertEquals("", field(f, "Row1a[0].Provider2[0].f1_4[0]"), "no provider 2");
            // Line 2
            assertEquals("Uno", field(f, "Table_Line2[0].Row1[0].f1_15[0]"), "2(a) first name, person 1");
            String person1Ssn = field(f, "Table_Line2[0].Row1[0].f1_17[0]");
            assertTrue(CTC_CHILD_SSNS.contains(person1Ssn), "2(b) SSN, person 1 (group-00 test SSN): " + person1Ssn);
            assertEquals("Duo", field(f, "Table_Line2[0].Row2[0].f1_19[0]"), "2(a) first name, person 2");
            assertEquals(200000, amt(f, "Table_Line2[0].Row2[0].f1_22[0]"), "2(d) expenses, person 2");
            // Lines 3-11
            assertEquals(200000, amt(f, "Page1[0].f1_27[0]"), "3 = column (d) total");
            assertEquals(5000000, amt(f, "Page1[0].f1_28[0]"), "4 earned income");
            assertEquals(5000000, amt(f, "Page1[0].f1_29[0]"), "5 = line 4 (not MFJ)");
            assertEquals(200000, amt(f, "Page1[0].f1_30[0]"), "6 = smallest of 3, 4, 5");
            assertEquals(5000000, amt(f, "Page1[0].f1_31[0]"), "7 = Form 1040 line 11a");
            // §21(a)(2) as amended by P.L. 119-21: 50% less 1 point per $2,000 over $15,000, not below 35%.
            assertEquals("35", field(f, "Page1[0].f1_32[0]"), "8 decimal .35 at $50,000 AGI");
            assertEquals(70000, amt(f, "Page1[0].f1_33[0]"), "9a = 6 x .35");
            assertEquals(70000, amt(f, "Page1[0].f1_35[0]"), "9c = 9a + 9b");
            long line10 = amt(f, "Page1[0].f1_36[0]");
            assertTrue(line10 > 70000, "10 credit limit worksheet exceeds 9c");
            assertEquals(70000, amt(f, "Page1[0].f1_37[0]"), "11 = smaller of 9c or 10");

            Map<String, String> sch3 =
                    fieldsOn(doc, pages(texts, t -> t.contains(DRAFT_MARK) && t.contains("SCHEDULE 3 (Form 1040)")));
            assertEquals(70000, amt(sch3, "f1_04[0]"), "Schedule 3 line 2 = Form 2441 line 11");

            List<Integer> p8812 = pages(texts, CreditFormsTy2026PdfSmokeTest::is8812);
            assertEquals(2, p8812.size(), "Schedule 8812 prints two pages (this draft has no cover sheet)");
            Map<String, String> s = fieldsOn(doc, p8812);
            assertOnlyTestTins(s);
            assertEquals(CTC_FILER_SSN, field(s, "Page1[0].f1_2[0]"), "SSN");
            assertEquals(5000000, amt(s, "Page1[0].f1_3[0]"), "1 = Form 1040 line 11b");
            assertEquals(5000000, amt(s, "Page1[0].f1_8[0]"), "3");
            assertEquals("2", field(s, "Page1[0].f1_9[0]"), "4 qualifying children");
            // Rev. Proc. 2025-32 §4.05 p. 14: "the maximum amount of the credit allowed under § 24(a) is $2,200".
            assertEquals(440000, amt(s, "Page1[0].f1_10[0]"), "5 = line 4 x $2,200");
            assertEquals(440000, amt(s, "Page1[0].f1_13[0]"), "8 = 5 + 7");
            assertEquals(20000000, amt(s, "Page1[0].f1_14[0]"), "9 $200,000 (not MFJ)");
            assertEquals(440000, amt(s, "Page1[0].f1_17[0]"), "12 = 8 - 11");
            assertEquals("2", field(s, "Page1[0].c1_1[1]"), "12 Yes: line 8 is more than line 11");
            long line14 = amt(s, "Page1[0].f1_19[0]");
            assertEquals(amt(s, "Page1[0].f1_18[0]"), line14, "14 = smaller of 12 or 13");
            assertEquals(line10 - 70000, line14, "13 Credit Limit Worksheet A = tax less the Form 2441 credit");
            // Page 2: line 15 is "Reserved for future use" (f2_1), so every later field moved up by one.
            assertEquals("", field(s, "Page2[0].f2_1[0]"), "15 reserved, blank");
            long line16a = amt(s, "Page2[0].f2_2[0]");
            assertEquals(440000 - line14, line16a, "16a = 12 - 14");
            assertEquals("2", field(s, "Page2[0].f2_3[0]"), "16b children");
            // Rev. Proc. 2025-32 §4.05 p. 14: refundable "§ 24(d)(1)(A) ... is $1,700".
            assertEquals(340000, amt(s, "Page2[0].f2_4[0]"), "16b x $1,700");
            assertEquals(Math.min(line16a, 340000), amt(s, "Page2[0].f2_5[0]"), "17 = smaller of 16a or 16b");
            assertEquals(5000000, amt(s, "Page2[0].f2_6[0]"), "18a earned income");
            assertEquals("2", field(s, "Page2[0].c2_1[1]"), "19 Yes: 18a is more than $2,500");
            assertEquals(4750000, amt(s, "Page2[0].f2_8[0]"), "19 = 18a - $2,500");
            assertEquals(712500, amt(s, "Page2[0].f2_9[0]"), "20 = 15% of 19");
            assertEquals("1", field(s, "Page2[0].c2_2[0]"), "20 No: line 16b is less than $5,100");
            assertEquals("", field(s, "Page2[0].f2_10[0]"), "21 blank (Part II-B skipped)");
            assertEquals(Math.min(line16a, 340000), amt(s, "Page2[0].f2_16[0]"), "27 = smaller of 17 or 20");

            Map<String, String> f1040 = fieldsOn(doc, List.of(0, 1));
            assertEquals(line14, amt(f1040, "Page2[0].f2_12[0]"), "Form 1040 line 19 = Schedule 8812 line 14");
            assertEquals(
                    amt(s, "Page2[0].f2_16[0]"), amt(f1040, "Page2[0].f2_27[0]"), "Form 1040 line 28 = 8812 line 27");
        }
    }

    /**
     * Negative case for the filer SSN requirement of 26 U.S.C. 24(h)(7)(A)(i): the hoh-cdcc.json children keep their
     * group-00 test SSNs and pass the child tests, but the filer has an ITIN (900-70-0001: area 9xx, group in the
     * 70-88 ITIN range of IRS Publication 4757, the range Tin.isITIN checks). /filerSsnRequirementForCtcMet is false, so no child is eligibleCtc and each falls to the
     * credit for other dependents, $500 per dependent under 24(h)(4)(A). An ITIN filer gets no earned income credit
     * either (26 U.S.C. 32(c)(1)(E) and 32(m)), so no Schedule EIC prints.
     */
    @Test
    void itinFilerWithQualifyingChildrenGetsOdcOnly() throws Exception {
        Map<String, FactTypeWithItem> facts = scenarioFactsWithCtcSsns("hoh-cdcc.json");
        String primary = null;
        for (String k : facts.keySet()) {
            if (k.startsWith("/filers/#")
                    && k.endsWith("/isPrimaryFiler")
                    && facts.get(k).item().asBoolean(false)) {
                primary = k.substring(0, k.length() - "/isPrimaryFiler".length());
            }
        }
        assertTrue(primary != null, "primary filer");
        facts.put(primary + "/tin", tinFact("900-70-0001"));

        var graph = factGraphService().getGraph(facts);
        var met = graph.get("/filerSsnRequirementForCtcMet");
        assertTrue(
                met.complete() && Boolean.FALSE.equals(met.get()), "/filerSsnRequirementForCtcMet complete and false");
        var invalid = graph.get(INVALID_TIN);
        assertTrue(invalid.complete() && Boolean.FALSE.equals(invalid.get()), INVALID_TIN + " (children have SSNs)");
        var unresolved = graph.get("/flowKnockoutCtcFilerSsnUnresolved");
        assertTrue(
                unresolved.complete() && Boolean.FALSE.equals(unresolved.get()),
                "/flowKnockoutCtcFilerSsnUnresolved complete and false: an ITIN is decided, not unresolved");
        int children = 0;
        for (String k : facts.keySet()) {
            if (k.startsWith("/familyAndHousehold/#") && k.endsWith("/tinType")) {
                String child = k.substring(0, k.length() - "/tinType".length());
                children++;
                var meets = graph.get(child + "/meetsChildCtcTests");
                assertTrue(meets.complete() && Boolean.TRUE.equals(meets.get()), child + " meetsChildCtcTests");
                var ctc = graph.get(child + "/eligibleCtc");
                assertTrue(
                        ctc.complete() && Boolean.FALSE.equals(ctc.get()), child + " eligibleCtc complete and false");
                var odc = graph.get(child + "/eligibleOdc");
                assertTrue(odc.complete() && Boolean.TRUE.equals(odc.get()), child + " eligibleOdc");
            }
        }
        assertEquals(2, children, "two children");
        var eic = graph.get("/pdfIncludeScheduleEic");
        assertTrue(eic.complete() && Boolean.FALSE.equals(eic.get()), "/pdfIncludeScheduleEic complete and false");

        try (PDDocument doc = Loader.loadPDF(generate("hoh-cdcc-itin-filer.json", facts))) {
            List<String> texts = pageTexts(doc);
            assertFalse(
                    String.join(" ", texts).contains("Qualifying Child Information"), "no Schedule EIC in the package");
            List<Integer> p8812 = pages(texts, CreditFormsTy2026PdfSmokeTest::is8812);
            assertEquals(2, p8812.size(), "Schedule 8812 prints (ODC)");
            Map<String, String> s = fieldsOn(doc, p8812);
            assertOnlyTestTins(s);
            assertEquals("900-70-0001", field(s, "Page1[0].f1_2[0]"), "filer ITIN");
            assertTrue(Set.of("", "0").contains(field(s, "Page1[0].f1_9[0]")), "4 no CTC children");
            assertEquals("", field(s, "Page1[0].f1_10[0]"), "5 no CTC (zero prints blank)");
            assertEquals("2", field(s, "Page1[0].Line6ReadOrder[0].f1_11[0]"), "6 ODC dependents");
            assertEquals(2 * 50000, amt(s, "Page1[0].f1_12[0]"), "7 = line 6 x $500 (24(h)(4)(A))");
            assertEquals(2 * 50000, amt(s, "Page1[0].f1_13[0]"), "8 = 5 + 7");
            assertEquals("", field(s, "Page2[0].f2_4[0]"), "16b no refundable CTC");
            assertEquals("", field(s, "Page2[0].f2_16[0]"), "27 no additional CTC");
        }
    }

    @Test
    void moreThanThreeCareProvidersAndQualifyingPersonsFillProviderColumnsAndStatements() throws Exception {
        // Printing only, not a fileable return: the children are declared tinType = ssn with 9xx numbers (#182), so
        // sign and submit refuse it.
        assertTrue(
                factIsTrue("hoh-cdcc-multiple-careproviders.json", INVALID_TIN),
                INVALID_TIN + " (9xx children declared ssn)");
        // hoh-cdcc-multiple-careproviders.json: four care providers and five qualifying persons, dependent care
        // benefits (Part III).
        try (PDDocument doc = Loader.loadPDF(generateScenario("hoh-cdcc-multiple-careproviders.json"))) {
            List<String> texts = pageTexts(doc);
            List<Integer> p2441 = pages(texts, CreditFormsTy2026PdfSmokeTest::is2441);
            assertEquals(2, p2441.size(), "Form 2441 pages");
            Map<String, String> f = fieldsOn(doc, p2441);
            assertOnlyTestTins(f);
            assertEquals("1", field(f, "PartI[0].c1_3[0]"), "Part I: more than three care providers box");
            assertEquals("Loyal Non-profit", field(f, "Row1a[0].Provider1[0].f1_3[0]"), "1a provider 1");
            assertEquals("Mama Goose", field(f, "Row1a[0].Provider2[0].f1_4[0]"), "1a provider 2");
            assertFalse(field(f, "Row1a[0].Provider3[0].f1_5[0]").isBlank(), "1a provider 3");
            assertFalse(field(f, "Row1b[0].Provider2[0].f1_7[0]").isBlank(), "1b provider 2 address");
            assertEquals("Tax-Exempt", field(f, "Row1c[0].f1_9[0]"), "1c provider 1 (tax-exempt organization)");
            assertEquals("2", field(f, "Row1d[0].Provider2[0].c1_5[1]"), "1d provider 2: No");
            assertEquals("2", field(f, "Row1d[0].Provider3[0].c1_6[1]"), "1d provider 3: No");
            assertEquals(50100, amt(f, "Row1e[0].f1_12[0]"), "1e provider 1");
            assertEquals(20100, amt(f, "Row1e[0].f1_13[0]"), "1e provider 2");
            assertEquals("1", field(f, "Page1[0].c1_7[0]"), "line 2: more than three qualifying persons box");
            assertEquals("1", field(f, "Table_Line2[0].Row2[0].c1_9[0]"), "2(c) over 12 and disabled, person 2");
            // Part III (page 2): line 3 comes from line 31 when Part III is completed.
            assertEquals(amt(f, "Page2[0].f2_20[0]"), amt(f, "Page1[0].f1_27[0]"), "3 = line 31");
            assertEquals(600000, amt(f, "Page2[0].f2_16[0]"), "27 $6,000 (two or more qualifying persons)");
            assertEquals(amt(f, "Page2[0].f2_1[0]") + amt(f, "Page2[0].f2_2[0]"), amt(f, "Page2[0].f2_4[0]"), "15");
            // Statements still print after the form (2024-folder templates; see the PR for their year wording).
            String all = String.join(" ", texts);
            assertTrue(all.contains("Form 2441 Additional Qualifying Persons"), "qualifying persons statement");
            assertTrue(all.contains("Form 2441 Additional Care Providers"), "care providers statement");
            assertTrue(all.contains("Form 2441 Due Diligence Statement"), "due diligence statement");
            assertFalse(all.contains(COVER_SHEET), "draft cover sheets dropped");
        }
    }

    @Test
    void saversCreditReturnPrints2026Form8880OnOnePage() throws Exception {
        // single-simple-savers-credit.json: single, $24,469 W-2 wages with $4,000 elective deferrals (box 12 AA).
        try (PDDocument doc = Loader.loadPDF(generateScenario("single-simple-savers-credit.json"))) {
            List<String> texts = pageTexts(doc);
            assertFalse(String.join(" ", texts).contains(COVER_SHEET), "draft cover sheet dropped");
            List<Integer> p8880 = pages(texts, CreditFormsTy2026PdfSmokeTest::is8880);
            assertEquals(1, p8880.size(), "Form 8880 page 1 only (cover sheet and instructions page dropped)");
            assertFalse(
                    String.join(" ", texts).contains("Form 8880 (2026) Page 2"),
                    "page 2 (instructions, worksheet) dropped");
            Map<String, String> f = fieldsOn(doc, p8880);
            assertOnlyTestTins(f);
            assertEquals("900-00-1032", field(f, "Page1[0].f1_2[0]"), "SSN (rewritten to 9xx)");
            assertEquals(400000, amt(f, "BodyRow2[0].f1_5[0]"), "2 elective deferrals, you");
            assertEquals(400000, amt(f, "BodyRow3[0].f1_7[0]"), "3 = 1 + 2");
            assertEquals(400000, amt(f, "BodyRow5[0].f1_11[0]"), "5 = 3 - 4");
            assertEquals(200000, amt(f, "BodyRow6[0].f1_13[0]"), "6 smaller of 5 or $2,000");
            assertEquals(200000, amt(f, "Page1[0].f1_15[0]"), "7 = 6a + 6b");
            assertEquals(2446900, amt(f, "Page1[0].f1_16[0]"), "8 = Form 1040 line 11a");
            // Notice 2025-67 p. 4: single 50% limit $24,250, 20% limit $26,250 (/saversCreditAgiLimitFor*).
            assertEquals("2", field(f, "Page1[0].f1_17[0]"), "9 decimal .2 for $24,250.01-$26,250");
            assertEquals(40000, amt(f, "Page1[0].f1_18[0]"), "10 = 7 x .2");
            assertTrue(amt(f, "Page1[0].f1_19[0]") >= 40000, "11 credit limit");
            assertEquals(40000, amt(f, "Page1[0].f1_20[0]"), "12 = smaller of 10 or 11");
            Map<String, String> sch3 =
                    fieldsOn(doc, pages(texts, t -> t.contains(DRAFT_MARK) && t.contains("SCHEDULE 3 (Form 1040)")));
            assertEquals(40000, amt(sch3, "f1_06[0]"), "Schedule 3 line 4 = Form 8880 line 12");
        }
    }

    @Test
    void hsaReturnPrints2026Form8889() throws Exception {
        // hsa-single-filer-contributions-only.json: single, self-only HDHP all year, $770 own contributions and $260
        // employer contributions (W-2 box 12 W).
        try (PDDocument doc = Loader.loadPDF(generateScenario("hsa-single-filer-contributions-only.json"))) {
            List<String> texts = pageTexts(doc);
            assertFalse(String.join(" ", texts).contains(COVER_SHEET), "draft cover sheet dropped");
            List<Integer> p8889 = pages(texts, CreditFormsTy2026PdfSmokeTest::is8889);
            assertEquals(1, p8889.size(), "Form 8889 is one page (cover sheet dropped)");
            Map<String, String> f = fieldsOn(doc, p8889);
            assertOnlyTestTins(f);
            assertEquals("900-00-1032", field(f, "Page1[0].f1_2[0]"), "SSN (rewritten to 9xx)");
            assertEquals("1", field(f, "Page1[0].c1_1[0]"), "1 self-only coverage");
            assertEquals(77000, amt(f, "Page1[0].f1_3[0]"), "2 own contributions");
            // Rev. Proc. 2025-19 §2.01 p. 2: self-only limit for 2026 "is $4,400".
            assertEquals(440000, amt(f, "Page1[0].f1_4[0]"), "3 self-only limit $4,400");
            assertEquals(440000, amt(f, "Page1[0].f1_9[0]"), "8 = 6 + 7");
            assertEquals(26000, amt(f, "Page1[0].f1_10[0]"), "9 employer contributions");
            assertEquals(26000, amt(f, "Page1[0].f1_12[0]"), "11 = 9 + 10");
            assertEquals(414000, amt(f, "Page1[0].f1_13[0]"), "12 = 8 - 11");
            assertEquals(77000, amt(f, "Page1[0].f1_14[0]"), "13 HSA deduction = smaller of 2 or 12");
            assertEquals("", field(f, "Page1[0].f1_20[0]"), "17b blank (unqualified distributions stop the return)");
            assertEquals("", field(f, "Page1[0].f1_24[0]"), "21 blank (testing-period income stops the return)");
            Map<String, String> sch1 = fieldsOn(
                    doc, pages(texts, t -> t.contains(DRAFT_MARK) && t.contains("Schedule 1 (Form 1040) 2026 Page 2")));
            assertEquals(77000, amt(sch1, "Page2[0].f2_03[0]"), "Schedule 1 line 13 = Form 8889 line 13");
        }
    }

    /** Every field named in the four 2026 configurations exists in the committed draft it points at. */
    @Test
    void everyMappedFieldExistsInTheCommittedDraft() throws Exception {
        Map<String, String> drafts = Map.of(
                "IRS1040S8812", "f1040s8--dft.pdf",
                "IRS2441", "f2441--dft.pdf",
                "IRS8880", "f8880--dft.pdf",
                "IRS8889", "f8889--dft.pdf");
        for (var d : drafts.entrySet()) {
            String dir = "pdf/2026/" + d.getKey() + "/en/";
            Map<String, Object> config;
            try (InputStream in = new ClassPathResource(dir + "configuration.yml").getInputStream()) {
                config = new Yaml().load(in);
            }
            List<String> mapped = new ArrayList<>();
            collect("", (Map<?, ?>) config.get("form"), mapped);
            assertFalse(mapped.isEmpty(), d.getKey() + " maps fields");
            Set<String> inPdf = new HashSet<>();
            try (PDDocument doc = Loader.loadPDF(
                    new ClassPathResource(dir + d.getValue()).getInputStream().readAllBytes())) {
                for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                    inPdf.add(f.getFullyQualifiedName());
                }
            }
            for (String name : mapped) {
                assertTrue(inPdf.contains(name), d.getKey() + " field exists in the draft: " + name);
            }
        }
    }

    private static void collect(String prefix, Map<?, ?> node, List<String> out) {
        for (var e : node.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey().toString() : prefix + "." + e.getKey();
            if (e.getValue() instanceof Map<?, ?> m) {
                collect(name, m, out);
            } else {
                out.add(name);
            }
        }
    }
}
