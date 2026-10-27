package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import gov.irs.directfile.api.config.PdfServiceProperties;
import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.io.IOLocationService;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.loaders.service.SubmissionBlockingFactsTest;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The printed package is the return, so a knockout that stops filing also stops the PDF. A return that claims the
 * earned income credit with a qualifying child needs Schedule EIC with each child's name, age and TIN (26 U.S.C.
 * 32(c)(3)(D)(i)). The 2026 Schedule EIC itself prints ({@link ScheduleEicTy2026PdfSmokeTest}), but {@link
 * PdfService#getTaxReturn} refuses that return rather than print an incomplete package. Schedule 3-A is pinned (#239)
 * and prints with an ACTC (Form 1040 line 28, 26 U.S.C. 24(d)). Returns without the Schedule EIC knockout still build
 * in English. A TY2026 Spanish print is refused when the resolved template is outside {@code pdf/2026/} and that form
 * has a 2026 English template (26 U.S.C. 6011(a)); language is not a fact.
 */
class PdfKnockoutRefusalTest {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final String SCHEDULE_EIC_KNOCKOUT = "/flowKnockoutScheduleEicWithoutTy2026Template";
    /** Head of household, two qualifying children, $50,000 of W-2 wages, child care expenses. */
    static final String FAMILY = "hoh-cdcc.json";
    /** Group 00 is never assigned by the SSA, so these are valid-format test SSNs that no person has. */
    static final String FILER_SSN = tin("444", "00", "4444");

    static FactGraphService factGraphService;
    static PdfService pdfService;

    @BeforeAll
    static void init() throws Exception {
        factGraphService = CreditFormsTy2026PdfSmokeTest.factGraphService();
        StandardEnvironment env = new StandardEnvironment();
        for (PropertySource<?> ps :
                new YamlPropertySourceLoader().load("app", new ClassPathResource("application.yaml"))) {
            env.getPropertySources().addLast(ps);
        }
        PdfServiceProperties props = Binder.get(env)
                .bind("direct-file.pdfs", PdfServiceProperties.class)
                .get();
        pdfService = new PdfService(props, new IOLocationService(null), factGraphService);
    }

    /** The family scenario with group-00 test SSNs for the filer, the W-2 and each child, so the EIC applies. */
    static Map<String, FactTypeWithItem> familyWithSsns() throws Exception {
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FAMILY);
        Map<String, String> m = new HashMap<>();
        int child = 0;
        for (String k : new ArrayList<>(facts.keySet())) {
            if (k.startsWith("/filers/#") && k.endsWith("/tin")) {
                m.put(k, FILER_SSN);
            }
            if (k.startsWith("/formW2s/#") && k.endsWith("/filer")) {
                m.put(k.substring(0, k.length() - "/filer".length()) + "/tin", FILER_SSN);
            }
            if (k.startsWith("/familyAndHousehold/#") && k.endsWith("/tin")) {
                child++;
                m.put(k, tin("444", "00", String.valueOf(child).repeat(4)));
            }
        }
        assertEquals(2, child, FAMILY + " has two dependents");
        for (var e : m.entrySet()) {
            facts.put(e.getKey(), MAPPER.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return facts;
    }

    static TaxReturn taxReturn(Map<String, FactTypeWithItem> facts) {
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        return taxReturn;
    }

    static void assertKnockout(Map<String, FactTypeWithItem> facts, boolean expected) throws Exception {
        var r = factGraphService.getGraph(facts).get(SCHEDULE_EIC_KNOCKOUT);
        assertTrue(r.complete(), SCHEDULE_EIC_KNOCKOUT + " is complete");
        assertEquals(expected, r.get(), SCHEDULE_EIC_KNOCKOUT);
    }

    static void assertBuilds(Map<String, FactTypeWithItem> facts) throws Exception {
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            assertTrue(doc.getNumberOfPages() > 0, "en package has pages");
        }
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(pdfService, taxReturn(facts));
    }

    @Test
    void eicWithQualifyingChildIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts = familyWithSsns();
        var graph = factGraphService.getGraph(facts);
        var eic = graph.get("/earnedIncomeCredit");
        assertTrue(eic.complete() && ((Number) eic.get()).doubleValue() > 0, "EIC is claimed: " + eic);
        assertTrue(Boolean.TRUE.equals(graph.get("/pdfIncludeScheduleEic").get()), "Schedule EIC would print");
        assertKnockout(facts, true);
        assertTrue(Boolean.TRUE.equals(graph.get("/flowIsKnockedOut").get()), "/flowIsKnockedOut");

        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn(facts), false));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        // Schedule 3-A prints with the EIC (#239). The qualifying-child return still stops on Schedule EIC.
        assertEquals(List.of(SCHEDULE_EIC_KNOCKOUT), e.getBody().getProperties().get("blockingFacts"));
        // Spanish is refused on the template, before the knockout list is evaluated (26 U.S.C. 6011(a)).
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(pdfService, taxReturn(facts));
    }

    /**
     * #89: the English print refuses with exactly {@code knockout}; with that one entry left out of the refusal check
     * the same English return prints, so taking it out of FACT_PATHS would print without the form. Spanish is refused
     * because the TY2026 template for that language is outside {@code pdf/2026/} (26 U.S.C. 6011(a)).
     */
    static void assertRefusedOnlyBy(Map<String, FactTypeWithItem> facts, String knockout) throws Exception {
        assertRefusedOnlyBy(facts, List.of(knockout));
    }

    /** {@link #assertRefusedOnlyBy(Map, String)} for a return refused by exactly {@code knockouts}. */
    static void assertRefusedOnlyBy(Map<String, FactTypeWithItem> facts, List<String> knockouts) throws Exception {
        assertTrue(
                Boolean.TRUE.equals(factGraphService
                        .getGraph(facts)
                        .get("/flowIsKnockedOut")
                        .get()),
                "/flowIsKnockedOut");
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !knockouts.contains(p))
                .toList();
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn(facts), false));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(knockouts, e.getBody().getProperties().get("blockingFacts"));
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            assertTrue(doc.getNumberOfPages() > 0, "en would print without " + knockouts);
        }
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(pdfService, taxReturn(facts));
    }

    /**
     * Instructions for Schedule C (2025), PDF p. 2: "Use Schedule C (Form 1040) to report income or (loss) from a
     * business you operated or a profession you practiced as a sole proprietor." Schedule C prints (#239). #87: the
     * same return attaches Form 8995 (Instructions for Form 1040 (2025) draft, PDF p. 35, "Attach whichever form you
     * use (Form 8995 or 8995-A) to your return."), which has no TY2026 template, so the Form 8995 knockout refuses it.
     */
    @Test
    void scheduleCBusinessIsRefused() throws Exception {
        assertRefusedOnlyBy(
                PrintRefusingKnockoutsTest.scheduleCOnly(), List.of(PrintRefusingKnockoutsTest.FORM_8995_KNOCKOUT));
    }

    /**
     * 2026 draft Form 1040, lines 32a-32c: "If you entered an amount on line 27a, 28, 29, or 30, attach Sch. 3-A".
     * An ACTC (line 28, 26 U.S.C. 24(d)) with no EIC prints Schedule 3-A in English (#239). Spanish is refused because
     * the TY2026 template is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void additionalChildTaxCreditWithoutEicPrints() throws Exception {
        Map<String, FactTypeWithItem> facts = PrintRefusingKnockoutsTest.schedule3AOnly();
        var graph = factGraphService.getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/pdfIncludeSchedule3A").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));
        assertBuilds(facts);
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            String text = new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
            assertTrue(text.contains("Schedule 3-A (Form 1040) 2026"), "en prints Schedule 3-A");
        }
    }

    @Test
    void familyWithoutEicStillBuilds() throws Exception {
        // The scenario's own 9xx TINs: an ITIN filer gets no EIC (26 U.S.C. 32(c)(1)(E), (m)).
        Map<String, FactTypeWithItem> facts = CreditFormsTy2026PdfSmokeTest.scenarioFacts(FAMILY);
        assertKnockout(facts, false);
        assertBuilds(facts);
    }

    /**
     * Form 2210 (2026) draft, p. 1: "If box B, C, or D applies, you must figure your penalty and file Form 2210." A
     * Part II box answered yes refuses the English package through the real print path; with every answer no the
     * English package builds. Spanish is refused either way (26 U.S.C. 6011(a)).
     */
    @Test
    void form2210PartIIYesIsRefusedByThePrintPath() throws Exception {
        Map<String, FactTypeWithItem> facts =
                CreditFormsTy2026PdfSmokeTest.scenarioFacts(PrintRefusingKnockoutsTest.FORM_2210_SCENARIO);
        assertBuilds(facts);
        facts.put(
                "/form2210WaiverRequested",
                MAPPER.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}",
                        FactTypeWithItem.class));
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn(facts), false));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(
                List.of(PrintRefusingKnockoutsTest.FORM_2210_KNOCKOUT),
                e.getBody().getProperties().get("blockingFacts"));
    }

    /**
     * #85. Schedule E Part III (estate or trust, Schedule K-1 (Form 1041)) is out of scope. 2026 draft Instructions
     * for Schedule E, PDF p. 14: report that income "even if not received." With /flowKnockoutScheduleEPartII left
     * out of the check, the English return prints, so the path is what stops the English package. Spanish is refused
     * because the TY2026 template is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void scheduleK1WithoutPartIIncomeIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts = new HashMap<>(SubmissionBlockingFactsTest.golden());
        FactTypeWithItem yes = MAPPER.readValue(
                "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}", FactTypeWithItem.class);
        facts.put("/scheduleEHasPartIIIncome", yes);
        facts.put("/scheduleEHasPartIIIIncome", yes);
        var graph = factGraphService.getGraph(facts);
        assertEquals(
                0,
                new java.math.BigDecimal(graph.get("/scheduleENetIncome").get().toString()).signum());
        assertEquals(
                0,
                new java.math.BigDecimal(
                                graph.get("/primaryFilerSeNetProfit").get().toString())
                        .signum());
        assertRefusedOnlyBy(facts, PrintRefusingKnockoutsTest.SCHEDULE_E_PART_II_KNOCKOUT);
    }

    /**
     * #238: leaving /scheduleEHasPartIIIncome unanswered is not a complete false, so the English print refuses with
     * only /flowKnockoutScheduleEPartII. An answered no still builds in English (the golden end-to-end scenario
     * below). Spanish is refused because the TY2026 template is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void unansweredScheduleK1QuestionIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts = new HashMap<>(SubmissionBlockingFactsTest.golden());
        facts.remove("/scheduleEHasPartIIIncome");
        var graph = factGraphService.getGraph(facts);
        assertFalse(graph.get(PrintRefusingKnockoutsTest.SCHEDULE_E_PART_II_KNOCKOUT)
                .complete());
        assertEquals(
                0,
                new java.math.BigDecimal(graph.get("/scheduleENetIncome").get().toString()).signum());
        assertEquals(
                0,
                new java.math.BigDecimal(
                                graph.get("/primaryFilerSeNetProfit").get().toString())
                        .signum());
        List<String> only = List.of(PrintRefusingKnockoutsTest.SCHEDULE_E_PART_II_KNOCKOUT);
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !only.contains(p))
                .toList();
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn(facts), false));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(only, e.getBody().getProperties().get("blockingFacts"));
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            assertTrue(doc.getNumberOfPages() > 0, "en would print without " + only);
        }
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(pdfService, taxReturn(facts));
    }

    @Test
    void goldenReturnStillBuilds() throws Exception {
        Map<String, FactTypeWithItem> facts = SubmissionBlockingFactsTest.golden();
        assertKnockout(facts, false);
        assertBuilds(facts);
    }

    /**
     * PA-40 line 1b needs PA Schedule UE (PA-40 IN (2025) p. 27, 72 P.S. §7303(a)(1)). A yes refuses the English
     * package through /flowKnockoutPaUnreimbursedEmployeeExpenses only. Spanish is refused because the TY2026 template
     * is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void paScheduleUeYesIsRefusedByThePrintPath() throws Exception {
        Map<String, String> extra = new HashMap<>(PaPit40ScheduleSpTy2026PdfSmokeTest.goldenScenario());
        extra.put("/paHasUnreimbursedEmployeeExpenses", ScheduleATy2026PdfSmokeTest.bool(true));
        assertRefusedOnlyBy(PrintRefusingKnockoutsTest.smoke(extra), PrintRefusingKnockoutsTest.PA_UE_KNOCKOUT);
    }

    /**
     * The fixture's Form 8949 sales are a PA Schedule D filing (PA-40 IN (2025) p. 17; PA Schedule D (2025), WHO MUST
     * COMPLETE, including a loss). The English package refuses with only /flowKnockoutPaScheduleD.
     */
    @Test
    void paScheduleDSaleIsRefusedByThePrintPath() throws Exception {
        assertRefusedOnlyBy(
                PrintRefusingKnockoutsTest.smoke(PaPit40ScheduleSpTy2026PdfSmokeTest.paResident()),
                PrintRefusingKnockoutsTest.PA_SCHEDULE_D_KNOCKOUT);
    }

    /**
     * PA-40 line 22 is the Schedule G-L credit (PA-40 IN (2025) p. 23). Yes to /paHasUnsupportedItems refuses the
     * English package with only that stop, so line 22 is not printed blank.
     */
    @Test
    void paScheduleGlYesIsRefusedByThePrintPath() throws Exception {
        Map<String, String> extra = new HashMap<>(PaPit40ScheduleSpTy2026PdfSmokeTest.goldenScenario());
        extra.put("/paHasUnsupportedItems", ScheduleATy2026PdfSmokeTest.bool(true));
        assertRefusedOnlyBy(
                PrintRefusingKnockoutsTest.smoke(extra), PrintRefusingKnockoutsTest.PA_UNSUPPORTED_ITEMS_KNOCKOUT);
    }

    /**
     * An unanswered line 1b question is not a complete false. The English print refuses because
     * /flowKnockoutPaUnreimbursedEmployeeExpenses is incomplete. /flowIsKnockedOut stays incomplete with it. Spanish
     * is refused because the TY2026 template is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void unansweredPaScheduleUeQuestionIsRefused() throws Exception {
        Map<String, FactTypeWithItem> facts =
                PrintRefusingKnockoutsTest.smoke(PaPit40ScheduleSpTy2026PdfSmokeTest.goldenScenario());
        facts.remove("/paHasUnreimbursedEmployeeExpenses");
        var graph = factGraphService.getGraph(facts);
        assertFalse(graph.get(PrintRefusingKnockoutsTest.PA_UE_KNOCKOUT).complete());
        assertFalse(graph.get("/flowIsKnockedOut").complete());
        List<String> only = List.of(PrintRefusingKnockoutsTest.PA_UE_KNOCKOUT);
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !only.contains(p))
                .toList();
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn(facts), false));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(only, e.getBody().getProperties().get("blockingFacts"));
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            assertTrue(doc.getNumberOfPages() > 0, "en would print without " + only);
        }
        Ty2026SpanishTemplateRefusalTest.assertSpanishPrintRefused(pdfService, taxReturn(facts));
    }

    /**
     * #89. Form 6251 (2026) draft, PDF p. 2 (form p. 1), line 2i: "Exercise of incentive stock options (excess of AMT
     * income over regular tax income)"; line 3: "Other adjustments, including income-based related adjustments"; line
     * 4: "Combine lines 1b through 3." A yes leaves lines 2c-2t, 3 and 8 blank (26 U.S.C. 55(b)(2), 56, 57). The
     * English print refuses on /flowKnockoutAmtPreferenceItems. Without that entry the same return would print Form
     * 6251 with those lines blank, not $0. Spanish is refused because the TY2026 template is outside pdf/2026/
     * (26 U.S.C. 6011(a)).
     */
    @Test
    void amtPreferenceItemsYesRefusesAPartial6251() throws Exception {
        Map<String, FactTypeWithItem> facts =
                PrintRefusingKnockoutsTest.smoke(Form6251Ty2026PdfSmokeTest.amtScenario());
        facts.put(
                "/hasAmtPreferenceItems",
                MAPPER.readValue(
                        "{\"$type\":\"gov.irs.factgraph.persisters.BooleanWrapper\",\"item\":true}",
                        FactTypeWithItem.class));
        assertRefusedOnlyBy(facts, PrintRefusingKnockoutsTest.AMT_PREFERENCE_KNOCKOUT);
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !p.equals(PrintRefusingKnockoutsTest.AMT_PREFERENCE_KNOCKOUT))
                .toList();
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            Map<String, String> f = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f.isEmpty(), "without the stop, Form 6251 would print");
            for (String suffix : List.of(
                    "Page1[0].f1_13[0]", // 2i
                    "Page1[0].f1_25[0]", // 3
                    "Page1[0].f1_30[0]", // 8
                    "Page2[0].f2_3[0]")) { // 14
                assertEquals("", Form6251Ty2026PdfSmokeTest.field(f, suffix), suffix + " blank, not $0");
            }
            assertTrue(Form6251Ty2026PdfSmokeTest.line(f, "f1_26[0]") > 0, "line 4 would still print");
        }
    }

    /**
     * #89. Form 6251 (2026) draft, PDF p. 2 (form p. 1), line 4: "(If married filing separately and line 4 is more
     * than $640,200, see instructions.)" 26 U.S.C. 55(d)(2) last sentence increases AMTI for a married individual
     * filing a separate return once the exemption is fully phased out. That add-back is not computed. The English
     * print refuses on /flowKnockoutAmtMfsAddBack; without that entry the same return would print Form 6251. Spanish
     * is refused because the TY2026 template is outside pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void mfsAmtiOverAddBackThresholdRefusesThePrint() throws Exception {
        Map<String, FactTypeWithItem> supported =
                PrintRefusingKnockoutsTest.smoke(Form6251Ty2026PdfSmokeTest.amtScenario());
        Map<String, FactTypeWithItem> facts = PrintRefusingKnockoutsTest.mfsAboveAddBack(supported);
        var graph = factGraphService.getGraph(facts);
        assertTrue(
                new java.math.BigDecimal(graph.get("/form6251Line4").get().toString())
                                .compareTo(new java.math.BigDecimal("640200"))
                        > 0,
                "line 4");
        assertRefusedOnlyBy(facts, PrintRefusingKnockoutsTest.AMT_MFS_ADD_BACK_KNOCKOUT);
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !p.equals(PrintRefusingKnockoutsTest.AMT_MFS_ADD_BACK_KNOCKOUT))
                .toList();
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            Map<String, String> f = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f.isEmpty(), "without the stop, Form 6251 would print");
            assertTrue(Form6251Ty2026PdfSmokeTest.line(f, "f1_26[0]") > 64020000, "line 4 in cents, over $640,200");
        }
    }

    /**
     * #89. Instructions for Form 6251 (2025), p. 1, "Who Must File", item 1: attach Form 6251 when line 7 is greater
     * than line 10 (/form6251Required). Form 6251 (2026) draft, PDF p. 2 (form p. 1), line 2c: "Investment interest
     * expense (difference between regular tax and AMT)."; line 4: "Combine lines 1b through 3." An unanswered
     * /hasAmtPreferenceItems is not a complete false on the yes stop, so without
     * /flowKnockoutAmtPreferenceItemsUnanswered the English package would print Form 6251 with lines 2c-3 blank and
     * line 4 combining only lines 1b and 2a. The English print refuses on that stop. A complete false still prints
     * (the supported golden end-to-end scenario). Spanish is refused because the TY2026 template is outside
     * pdf/2026/ (26 U.S.C. 6011(a)).
     */
    @Test
    void unansweredAmtPreferenceItemsWhen6251IsRequiredRefusesThePrint() throws Exception {
        Map<String, FactTypeWithItem> facts =
                PrintRefusingKnockoutsTest.smoke(Form6251Ty2026PdfSmokeTest.amtScenario());
        facts.remove("/hasAmtPreferenceItems");
        var graph = factGraphService.getGraph(facts);
        assertEquals(Boolean.TRUE, graph.get("/form6251Required").get());
        assertFalse(graph.get("/hasAmtPreferenceItems").complete());
        assertEquals(
                Boolean.FALSE,
                graph.get(PrintRefusingKnockoutsTest.AMT_PREFERENCE_KNOCKOUT).get(),
                "unanswered is not the yes stop");
        assertEquals(Boolean.TRUE, graph.get(PrintRefusingKnockoutsTest.AMT_PREFERENCE_UNANSWERED_KNOCKOUT)
                .get());
        assertRefusedOnlyBy(facts, PrintRefusingKnockoutsTest.AMT_PREFERENCE_UNANSWERED_KNOCKOUT);
        List<String> without = PrintRefusingKnockouts.FACT_PATHS.stream()
                .filter(p -> !p.equals(PrintRefusingKnockoutsTest.AMT_PREFERENCE_UNANSWERED_KNOCKOUT))
                .toList();
        try (InputStream in = pdfService.getTaxReturn("en", taxReturn(facts), false, without);
                PDDocument doc = Loader.loadPDF(in.readAllBytes())) {
            Map<String, String> f = Form6251Ty2026PdfSmokeTest.form6251Fields(doc);
            assertFalse(f.isEmpty(), "without the stop, Form 6251 would print");
            for (String suffix : List.of(
                    "Page1[0].f1_7[0]", // 2c
                    "Page1[0].f1_13[0]", // 2i
                    "Page1[0].f1_25[0]", // 3
                    "Page1[0].f1_30[0]", // 8
                    "Page2[0].f2_3[0]")) { // 14
                assertEquals("", Form6251Ty2026PdfSmokeTest.field(f, suffix), suffix + " blank, not $0");
            }
            assertTrue(Form6251Ty2026PdfSmokeTest.line(f, "f1_26[0]") > 0, "line 4 would still print");
        }
    }

    @Test
    void printRefusingKnockoutsAreSubmissionBlockingFacts() throws Exception {
        assertTrue(PrintRefusingKnockouts.FACT_PATHS.stream()
                .allMatch(p -> factGraphService.getDigest().getSubmissionBlockingFacts().stream()
                        .anyMatch(f -> f.path().equals(p))));
    }
}
