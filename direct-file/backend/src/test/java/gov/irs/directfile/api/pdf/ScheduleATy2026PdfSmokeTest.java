package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #67: 2026 draft Schedule A (irs.gov/pub/irs-dft/f1040sa--dft.pdf) end-to-end, same synthetic filer as #65.
 * Itemizer fixture: $9,000 medical, $9,000 state income tax, $6,000 real estate tax, $12,000 Form 1098 mortgage
 * interest, $800 cash gifts. Synthetic PII only. Asserts lines tie out on the face of the form and the cover is dropped.
 */
class ScheduleATy2026PdfSmokeTest {

    static byte[] generate(Map<String, String> extraFactsJson) throws Exception {
        return generate(extraFactsJson, false);
    }

    /** The public print path only, with no field-map fill: refused returns throw. */
    static byte[] generatePublicPrint(Map<String, String> extraFactsJson) throws Exception {
        return generate(extraFactsJson, true);
    }

    /**
     * Public print of a complete return on the classpath ({@code {"facts": ...}}), with no Schedule D smoke overlay.
     * Refused returns throw.
     */
    static byte[] generatePublicPrintOf(String classpathJson) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(new ClassPathResource(classpathJson).getInputStream());
        Map<String, FactTypeWithItem> facts =
                mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
        return printFacts(facts, true);
    }

    private static byte[] generate(Map<String, String> extraFactsJson, boolean publicPrintOnly) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root =
                mapper.readTree(new ClassPathResource("pdf-smoke/schedule-d-8949-synthetic.json").getInputStream());
        Map<String, FactTypeWithItem> facts =
                mapper.convertValue(root.get("facts"), new TypeReference<Map<String, FactTypeWithItem>>() {});
        for (var e : extraFactsJson.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return printFacts(facts, publicPrintOnly);
    }

    private static byte[] printFacts(Map<String, FactTypeWithItem> facts, boolean publicPrintOnly) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        GenericApplicationContext ctx = new GenericApplicationContext();
        ctx.refresh();
        FactGraphService factGraphService = new FactGraphService(mapper, ctx);
        ReflectionTestUtils.setField(factGraphService, "loadAtStartup", true);
        ReflectionTestUtils.setField(factGraphService, "factDictionaryXmlPattern", "classpath:/tax/*.xml");
        Method init = FactGraphService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(factGraphService);

        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        PdfService pdfService = new PdfService(props, new IOLocationService(null), factGraphService);

        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026); // configured-pdfs bucket; the IRS1040 en template itself is the 2026 draft
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        if (publicPrintOnly) {
            try (InputStream in = pdfService.getTaxReturn("en", taxReturn, false)) {
                return in.readAllBytes();
            }
        }
        // Form 8995 prints (#17). A return another knockout still refuses is filled here for its field maps.
        return PrintRefusingKnockoutsTest.printForFieldMaps(pdfService, taxReturn, factGraphService.getGraph(facts));
    }

    static String bool(boolean b) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":" + b + "}";
    }

    static String dollar(String d) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.DollarWrapper\",\"item\":\"" + d + "\"}";
    }

    static String string(String s) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.StringWrapper\",\"item\":\"" + s + "\"}";
    }

    static String collection(String... ids) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[\""
                + String.join("\",\"", ids) + "\"]}}";
    }

    static Map<String, String> fields(PDDocument doc) {
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            byName.put(f.getFullyQualifiedName(), f.getValueAsString());
        }
        return byName;
    }

    static String value(Map<String, String> byName, String suffix) {
        for (var e : byName.entrySet()) {
            if (e.getKey().endsWith(suffix)
                    && e.getValue() != null
                    && !e.getValue().isEmpty()) {
                return e.getValue();
            }
        }
        return "";
    }

    static long cents(String v) {
        String d = v.replaceAll("[^0-9.]", "");
        return d.isEmpty() ? 0 : Math.round(Double.parseDouble(d) * 100);
    }

    static Map<String, String> itemizer() {
        Map<String, String> m = new HashMap<>();
        m.put("/scheduleAWantsToItemize", bool(true));
        m.put("/scheduleAHasUnsupportedItems", bool(false));
        m.put("/scheduleAWritableMedical", dollar("9000.00"));
        m.put("/scheduleAWritableStateLocalIncomeOrSalesTax", dollar("9000.00"));
        m.put("/scheduleAWritableRealEstateTaxes", dollar("6000.00"));
        m.put("/scheduleAWritablePersonalPropertyTaxes", dollar("0.00"));
        m.put("/scheduleAWritableMortgageInterest", dollar("12000.00"));
        m.put("/scheduleAWritableCashGifts", dollar("800.00"));
        m.put("/scheduleAWritableElectsToItemize", bool(false));
        return m;
    }

    @Test
    void itemizedLinesTieOutAndDraftCoverIsDropped() throws Exception {
        byte[] bytes = generate(itemizer());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedulea-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fields(doc);
            long l1 = cents(value(f, "form1[0].Page1[0].f1_03[0]"));
            long l2 = cents(value(f, "form1[0].Page1[0].f1_04[0]"));
            long l3 = cents(value(f, "form1[0].Page1[0].f1_05[0]"));
            long l4 = cents(value(f, "form1[0].Page1[0].f1_06[0]"));
            assertEquals(900000, l1, "line 1 medical");
            assertTrue(l2 > 0, "line 2 = 1040 line 11b printed");
            assertEquals(Math.round(l2 * 0.075 / 100.0) * 100, l3, "line 3 = line 2 x 7.5%");
            assertEquals(Math.max(0, l1 - l3), l4, "line 4 = line 1 - line 3, not below 0");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_10[0]")), "5d = 5a + 5b + 5c");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_11[0]")), "5e = smaller of 5d or $40,400");
            assertEquals(1500000, cents(value(f, "form1[0].Page1[0].f1_14[0]")), "7 = 5e + 6");
            assertEquals(1200000, cents(value(f, "form1[0].Page1[0].f1_15[0]")), "8a Form 1098 interest");
            assertEquals(1200000, cents(value(f, "form1[0].Page1[0].f1_22[0]")), "10 = 8e + 9");
            assertEquals(80000, cents(value(f, "form1[0].Page2[0].Line11_ReadOrder[0].f2_01[0]")), "11 cash gifts");
            long l15 = cents(value(f, "form1[0].Page2[0].f2_05[0]"));
            long l18 = cents(value(f, "form1[0].Page2[0].f2_19[0]"));
            assertEquals(l4 + 1500000 + 1200000 + l15, l18, "18 = 4 + 7 + 10 + 15");
            // Issue #67: Schedule A line 18 (older forms: line 17) equals Form 1040 line 12e.
            // #178: on the 2026 Form 1040 draft line 12e is Page 2 f2_02 (tooltip "12e. Standard deduction or itemized
            // deductions (from Schedule A)."); f1_57 is line 1z ("1z. Add lines 1a through 1h."). The full name keeps
            // Schedule A's own form1[0].Page2[0].f2_02[0] (line 12) out of the match.
            assertEquals(
                    l18,
                    cents(value(f, "topmostSubform[0].Page2[0].f2_02[0]")),
                    "Sch A line 18 == 1040 line 12e (/standardOrItemizedDeductions)");
            String no = value(f, "form1[0].Page2[0].c2_1[0]");
            assertFalse(no.isEmpty() || "Off".equals(no), "line 18 No box checked");
            // Unsupported lines stay blank, not a silent 0.
            assertEquals("", value(f, "form1[0].Page1[0].f1_21[0]"), "line 9 blank");
            assertEquals("", value(f, "form1[0].Page2[0].f2_04[0]"), "line 14 blank");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    /**
     * Golden R (#135), public print path. The facts are {@code golden-profileR-complete.json}, the persisted client
     * profile {@code profileRFlHohItemizerAmt}: Alex Example, full-year Florida, head of household, one qualifying
     * child (Eden, age 10). One W-2, boxes 1, 3, and 5 $180,000, box 2 $31,000. One Form 1099-INT, box 8 and box 9
     * $60,000. Schedule A: real estate tax $9,000, Form 1098 interest $15,000, cash gifts $5,000.
     *
     * <p>Form 1040 line 2a is $60,000. Line 2b is blank. Line 11 is $180,000. Tax-exempt interest is not gross income.
     * 26 U.S.C. §103(a). Schedule A line 5e and line 7 are $9,000, under the $40,400 cap. IRC §164(b)(7). MAGI is under
     * $505,000, so there is no phase-down. Line 8a is $15,000. The 0.5% charitable floor is 0.5% × $180,000 = $900, so
     * lines 13 and 15 are $4,100. IRC §170(b)(1)(I). The cite's "line 17" is this draft's line 18, $28,100, which is
     * more than the $24,150 head-of-household standard deduction. Rev. Proc. 2025-32 §4.14(1), PDF p. 18. Line 15 is
     * $151,900. The Tax Computation Worksheet tax is $16,155 + 24% × $46,200 = $27,243. Rev. Proc. 2025-32 §4.01 Table
     * 2, PDF p. 10. Instructions for Form 1040 (2025), PDF p. 36.
     *
     * <p>Form 6251 line 1a is $28,100 (Form 1040 line 14; no Schedule 1-A). The cite's "L1a $151,900" is draft line 1b.
     * Line 2a is $9,000. Line 2g is box 9, $60,000. 26 U.S.C. §57(a)(5). Line 4 is $220,900. Line 5 is the $90,100
     * exemption. Rev. Proc. 2025-32 §4.10, PDF p. 16. Line 6 is $130,800. Line 7 is 26% × $130,800 = $34,008. Line 11
     * is $6,765. Schedule 2 line 2 is $6,765 and line 3 is $6,765 (the cite's "line 1/2"; line 1z is blank). Form 1040
     * line 17 is $6,765. Line 18 is $34,008. Schedule 8812 line 13 is that $34,008, so the $2,200 child tax credit
     * applies in full. Rev. Proc. 2025-32 §4.05, PDF p. 14. The head-of-household phaseout threshold is $200,000. 26
     * U.S.C. §24(h)(3). Line 19 is $2,200. Line 24 is $31,808. Line 25a is $31,000. Line 37 is $808. No Schedule B:
     * taxable interest is not over $1,500. No Form 2210: the amount owed is under $1,000. 26 U.S.C. §6654(e)(1). No
     * Form 8959, Form 8960, or state return.
     *
     * <p>Group-00 test SSNs (the SSA never assigns group 00). A 9xx area is not an SSN, and 26 U.S.C. §24(h)(7)
     * requires one for the credit. The cite names 9xx SSNs. The same pattern is Golden G and Golden Q.
     */
    @Test
    void goldenRPrintsForm1040ScheduleAForm6251Schedule2AndSchedule8812OnThePublicPath() throws Exception {
        byte[] bytes = generatePublicPrintOf("submission-blocking/golden-profileR-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages(
                    doc, Schedules123Ty2026PdfSmokeTest.F1040);
            assertTrue(
                    Schedules123Ty2026PdfSmokeTest.any(f, "f1_14[0]").toUpperCase().contains("ALEX"),
                    "Form 1040 first name");
            assertEquals("Off", fieldEnding(f, "Page1[0].c1_8[0]"), "single is not checked");
            assertEquals("Off", fieldEnding(f, "Page1[0].c1_8[1]"), "married filing jointly is not checked");
            assertEquals("Off", fieldEnding(f, "Page1[0].c1_8[2]"), "married filing separately is not checked");
            assertFalse(
                    Set.of("", "Off").contains(fieldEnding(f, "HOH-QSS_ReadOrder[0].c1_8[0]")),
                    "head of household is checked");
            assertEquals("Eden", Schedules123Ty2026PdfSmokeTest.any(f, "f1_31[0]"), "dependent");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_47[0]", 180000, "Form 1040 line 1a wages");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_58[0]", 60000, "Form 1040 line 2a tax-exempt interest");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_59[0]", "Form 1040 line 2b ($0 taxable interest)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_73[0]", 180000, "Form 1040 line 9");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f1_74[0]", "Form 1040 line 10 ($0 adjustments)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f1_75[0]", 180000, "Form 1040 line 11a AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_01[0]", 180000, "Form 1040 line 11b AGI");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_02[0]", 28100, "Form 1040 line 12e itemized deductions");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_07[0]", 151900, "Form 1040 line 15 taxable income");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_09[0]", 27243, "Form 1040 line 16 tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_10[0]", 6765, "Form 1040 line 17 AMT");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_11[0]", 34008, "Form 1040 line 18");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_12[0]", 2200, "Form 1040 line 19 child tax credit");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_15[0]", 31808, "Form 1040 line 22 tax after credits");
            // /line21OfSchedule2 has ExportZero, so $0 other taxes prints "0.00" rather than a blank.
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_16[0]", 0, "Form 1040 line 23 ($0 other taxes)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_17[0]", 31808, "Form 1040 line 24a total tax");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_20[0]", 31000, "Form 1040 line 25a withholding");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_26[0]", "Form 1040 line 27a EITC ($0)");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_27[0]", "Form 1040 line 28 additional child tax credit ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_23[0]", 31000, "Form 1040 line 25d");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_34[0]", 31000, "Form 1040 line 33 payments");
            Schedules123Ty2026PdfSmokeTest.blank2(f, "f2_35[0]", "Form 1040 line 34 overpayment ($0)");
            Schedules123Ty2026PdfSmokeTest.amount2(f, "f2_40[0]", 808, "Form 1040 line 37 amount owed");

            Map<String, String> schA = scheduleAOn(doc);
            assertEquals(900000, cents(scheduleAField(schA, "Page1[0].f1_08[0]")), "Schedule A line 5b");
            assertEquals(900000, cents(scheduleAField(schA, "Page1[0].f1_10[0]")), "Schedule A line 5d");
            assertEquals(900000, cents(scheduleAField(schA, "Page1[0].f1_11[0]")), "Schedule A line 5e");
            assertEquals(900000, cents(scheduleAField(schA, "Page1[0].f1_14[0]")), "Schedule A line 7");
            assertEquals(1500000, cents(scheduleAField(schA, "Page1[0].f1_15[0]")), "Schedule A line 8a");
            assertEquals(1500000, cents(scheduleAField(schA, "Page1[0].f1_22[0]")), "Schedule A line 10");
            assertEquals(
                    500000,
                    cents(scheduleAField(schA, "Page2[0].Line11_ReadOrder[0].f2_01[0]")),
                    "Schedule A line 11");
            assertEquals(410000, cents(scheduleAField(schA, "Page2[0].f2_03[0]")), "Schedule A line 13");
            assertEquals(410000, cents(scheduleAField(schA, "Page2[0].f2_05[0]")), "Schedule A line 15");
            assertEquals(2810000, cents(scheduleAField(schA, "Page2[0].f2_19[0]")), "Schedule A line 18");
            String no = scheduleAField(schA, "Page2[0].c2_1[0]");
            assertFalse(no.isEmpty() || "Off".equals(no), "Schedule A line 18 No box checked");
            assertEquals("", scheduleAField(schA, "Page1[0].f1_07[0]"), "Schedule A line 5a blank");
            assertEquals("", scheduleAField(schA, "Page1[0].f1_09[0]"), "Schedule A line 5c blank");

            Map<String, String> f6251 = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f6251.isEmpty(), "Form 6251 is attached when line 7 is greater than line 10");
            assertEquals(2810000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_3[0]"), "Form 6251 line 1a");
            assertEquals(15190000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_4[0]"), "Form 6251 line 1b");
            assertEquals(900000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_5[0]"), "Form 6251 line 2a");
            assertEquals(6000000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_11[0]"), "Form 6251 line 2g");
            assertEquals(22090000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_26[0]"), "Form 6251 line 4");
            assertEquals(9010000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_27[0]"), "Form 6251 line 5");
            assertEquals(13080000, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_28[0]"), "Form 6251 line 6");
            assertEquals(3400800, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_29[0]"), "Form 6251 line 7");
            assertEquals(3400800, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_31[0]"), "Form 6251 line 9");
            assertEquals(2724300, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_32[0]"), "Form 6251 line 10");
            assertEquals(676500, Form6251Ty2026PdfSmokeTest.line(f6251, "f1_33[0]"), "Form 6251 line 11");
            assertEquals("", Form6251Ty2026PdfSmokeTest.field(f6251, "Page2[0].f2_1[0]"), "Form 6251 Part III blank");

            Map<String, String> s2 =
                    Schedules123Ty2026PdfSmokeTest.page(doc, Schedules123Ty2026PdfSmokeTest.SCH2);
            assertTrue(
                    Form8959Form8960Ty2026PdfSmokeTest.field(s2, "f1_01[0]").toUpperCase().contains("ALEX"),
                    "Schedule 2 name");
            Form8959Form8960Ty2026PdfSmokeTest.blank(s2, "f1_11[0]", "Schedule 2 line 1z");
            Form8959Form8960Ty2026PdfSmokeTest.amount(s2, "f1_12[0]", 6765, "Schedule 2 line 2 AMT");
            Form8959Form8960Ty2026PdfSmokeTest.amount(s2, "f1_13[0]", 6765, "Schedule 2 line 3");
            Form8959Form8960Ty2026PdfSmokeTest.blank(s2, "f1_15[0]", "Schedule 2 line 4 (no Schedule SE)");
            Form8959Form8960Ty2026PdfSmokeTest.blank(s2, "f1_17[0]", "Schedule 2 line 6 (no NIIT)");

            List<String> texts = CreditFormsTy2026PdfSmokeTest.pageTexts(doc);
            List<Integer> p8812 = CreditFormsTy2026PdfSmokeTest.pages(texts, CreditFormsTy2026PdfSmokeTest::is8812);
            assertEquals(2, p8812.size(), "Schedule 8812 prints both pages");
            Map<String, String> s8812 = CreditFormsTy2026PdfSmokeTest.fieldsOn(doc, p8812);
            assertEquals("1", CreditFormsTy2026PdfSmokeTest.field(s8812, "Page1[0].f1_9[0]"), "line 4 children");
            assertEquals(220000, CreditFormsTy2026PdfSmokeTest.amt(s8812, "Page1[0].f1_10[0]"), "line 5");
            assertEquals(
                    20000000, CreditFormsTy2026PdfSmokeTest.amt(s8812, "Page1[0].f1_14[0]"), "line 9 threshold");
            assertEquals(220000, CreditFormsTy2026PdfSmokeTest.amt(s8812, "Page1[0].f1_17[0]"), "line 12");
            assertEquals(
                    3400800, CreditFormsTy2026PdfSmokeTest.amt(s8812, "Page1[0].f1_18[0]"), "line 13 credit limit");
            assertEquals(220000, CreditFormsTy2026PdfSmokeTest.amt(s8812, "Page1[0].f1_19[0]"), "line 14");
            assertEquals("", CreditFormsTy2026PdfSmokeTest.field(s8812, "Page2[0].f2_16[0]"), "line 27 no ACTC");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Schedule B (Form 1040) 2026"), "no Schedule B");
            assertFalse(text.contains("Schedule 1 (Form 1040) 2026"), "no Schedule 1");
            assertFalse(text.contains("Form 8960 (2026)"), "no Form 8960");
            assertFalse(text.contains("Form 8959 (2026)"), "no Form 8959");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheets dropped");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "no PA-40 for a full-year Florida resident");
        }
    }

    /**
     * Schedule A pages on a public print. The filled copy's root is {@code dummyFieldNameN} when {@code form1} is
     * already taken. Page 1's header is "SCHEDULE A (Form 1040) 2026"; page 2's is "Schedule A (Form 1040) 2026".
     */
    private static Map<String, String> scheduleAOn(PDDocument doc) throws Exception {
        List<String> pageText = CreditFormsTy2026PdfSmokeTest.pageTexts(doc);
        List<Integer> pages = CreditFormsTy2026PdfSmokeTest.pages(
                pageText,
                t -> t.contains("SCHEDULE A (Form 1040) 2026") || t.contains("Schedule A (Form 1040) 2026"));
        assertEquals(2, pages.size(), "Schedule A prints both pages");
        return CreditFormsTy2026PdfSmokeTest.fieldsOn(doc, pages);
    }

    /** The filled field when the public print renamed the root, otherwise the template field. */
    private static String scheduleAField(Map<String, String> f, String suffix) {
        String template = null;
        String filled = null;
        for (var e : f.entrySet()) {
            if (!e.getKey().endsWith(suffix)) {
                continue;
            }
            String v = e.getValue() == null ? "" : e.getValue().trim();
            if (e.getKey().startsWith("dummyFieldName")) {
                assertTrue(filled == null, "one filled Schedule A field: " + suffix);
                filled = v;
            } else {
                assertTrue(template == null, "one template Schedule A field: " + suffix);
                template = v;
            }
        }
        assertTrue(filled != null || template != null, "Schedule A field present: " + suffix);
        return filled != null ? filled : template;
    }

    /** The one field whose fully qualified name ends with {@code suffix}. */
    private static String fieldEnding(Map<String, String> f, String suffix) {
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present: " + suffix);
        return found;
    }
}
