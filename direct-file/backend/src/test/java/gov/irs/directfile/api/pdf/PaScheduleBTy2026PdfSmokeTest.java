package gov.irs.directfile.api.pdf;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.is;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.paResident;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.partYearScenario;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * PA-40 Schedule B (PA-40 B (EX) 04-25, SHA-256 c6d8f5cdd63045e1e40b6deeced2c80b23006b7700befe3b8f0c430f2b40a0d4)
 * through the real PdfService. A full-year resident who is not filing jointly prints box 2a on line 10 and line 12,
 * and PA-40 line 3 matches line 12. Joint, part-year, exempt-obligation, and unanswered cases still refuse.
 *
 * <p>72 P.S. §7303(a)(5). PA-40 IN (2025) p. 4, p. 15 LINE 3, and p. 32. PA-40 B (2025) WHO MUST COMPLETE and lines 1,
 * 6, 10, and 12.
 */
class PaScheduleBTy2026PdfSmokeTest {
    static final String PAGE = "2501510057";
    static final String FILER = PaPit40ScheduleSpTy2026PdfSmokeTest.W2;
    static final String DIV = "d1190000-0000-4000-8000-0000000000b1";
    static final String DIV2 = "d1190000-0000-4000-8000-0000000000b2";

    static final String LINE1 = "1. Dividend income from Line 3b of your federal return";
    static final String LINE6 = "6. Subtract the amount on Line 5 from the amount on Line 1 and enter the result";
    static final String LINE10 = "10. Enter the amount of any capital gains distributions - See the instructions";
    static final String LINE12 =
            "12. Add the amounts on Lines 6, 7, 8, 9c, 10 and 11 and enter the result here and include on Line 3 of your PA-40";
    static final String OVAL =
            "Click on the appropriate oval for taxpayer/spouse/joint to indicate who is reporting the dividend and capital gains distributions income";
    static final String NAME = "Name (if filing jointly, use name shown first on the PA-40)";
    static final String SSN = "Enter the Social Security number shown first on the PA-40";
    static final String PA_LINE3 = "3. Dividend  and Capital Gains Distributions Income";

    /** Full-year single PA resident. Box 1a and box 2a are whole dollars unless the strings say otherwise. */
    static Map<String, String> capitalGainDistributions() {
        return dividends("800.00", "200.00", true);
    }

    @Test
    void fullYearSinglePrintsScheduleBAndLiftsTheKnockout() throws Exception {
        Map<String, String> facts = capitalGainDistributions();
        Graph graph = graph(facts);
        assertEquals(Boolean.TRUE, graph.get("/paScheduleBSupported").get());
        assertEquals("800.00", graph.get("/paScheduleBTaxpayerLine1").get().toString());
        assertEquals("800.00", graph.get("/paScheduleBTaxpayerLine6").get().toString());
        assertEquals("200.00", graph.get("/paScheduleBTaxpayerLine10").get().toString());
        assertEquals("1000.00", graph.get("/paScheduleBTaxpayerLine12").get().toString());
        assertEquals("0.00", graph.get("/paScheduleBSpouseLine12").get().toString());
        assertEquals("1000.00", graph.get("/paLine3").get().toString());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaDividends").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> b = fieldsOnPages(doc, PAGE);
            assertFalse(b.isEmpty(), "PA-40 B page printed");
            assertTrue(field(b, NAME).contains("FAKEY"), "name");
            assertTrue(field(b, NAME).contains("MCTESTFACE"), "last name");
            is(b, SSN, "555555555", "SSN");
            is(b, OVAL, "1", "taxpayer oval");
            is(b, LINE1, "800.00", "line 1");
            is(b, LINE6, "800.00", "line 6");
            is(b, LINE10, "200.00", "line 10");
            is(b, LINE12, "1,000.00", "line 12");
            blank(b, "2. Enter the amount of dividend income from federal Schedule K-1(s)", "line 2");
            blank(
                    b,
                    "3. Enter the amount of Pennsylvania exempt-interest dividend income. See the instructions",
                    "line 3");
            blank(b, "4. Enter the amount of any other reduction adjustments - See the instructions", "line 4");
            blank(b, "5. Add the amounts on Lines 2, 3 and 4 and enter the result", "line 5");
            blank(b, "7. Enter the amount of any tax exempt-interest dividends - See the instructions", "line 7");
            blank(b, "8. Enter the amount of any other addition adjustments - See the instructions", "line 8");
            blank(
                    b,
                    "11. Enter the amount of any dividend income from PA S corporation(s) and partnerships, from your PA Schedule(s) RK-1 or federal Schedule(s) K-1",
                    "line 11");

            Map<String, String> pa = fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            is(pa, PA_LINE3, "1,000.00", "PA-40 line 3 = line 12");
            assertFalse(
                    new PDFTextStripper().getText(doc).contains("Instructions for PA-40 Schedule B"),
                    "instructions pages are not in the package");
        }
    }

    @Test
    void box2aOnlyPrintsLine10WithoutTheExemptQuestion() throws Exception {
        Map<String, String> facts = dividends("0.00", "10.00", false);
        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get("/hasDividendIncome").get());
        assertFalse(graph.get("/paHasExemptObligationDividends").complete(), "exempt question is not required");
        assertEquals(Boolean.TRUE, graph.get("/paScheduleBSupported").get());
        assertEquals("10.00", graph.get("/paLine3").get().toString());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> b = fieldsOnPages(doc, PAGE);
            blank(b, LINE1, "line 1 is $0");
            blank(b, LINE6, "line 6 is $0");
            is(b, LINE10, "10.00", "line 10");
            is(b, LINE12, "10.00", "line 12");
            is(fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1), PA_LINE3, "10.00", "PA-40 line 3");
        }
    }

    @Test
    void halfUpRoundingDecidesWhetherScheduleBIsRequired() throws Exception {
        Graph under = graph(dividends("100.00", "0.49", true));
        assertEquals("0.00", under.get("/paScheduleBLine10").get().toString());
        assertEquals(Boolean.FALSE, under.get("/paScheduleBSupported").get());
        assertEquals(Boolean.FALSE, under.get("/flowKnockoutPaScheduleB").get());
        assertEquals("100.00", under.get("/paLine3").get().toString());

        Graph half = graph(dividends("100.00", "0.50", true));
        assertEquals("1.00", half.get("/paScheduleBLine10").get().toString());
        assertEquals("101.00", half.get("/paLine3").get().toString());
        assertEquals(Boolean.FALSE, half.get("/flowKnockoutPaScheduleB").get());

        Map<String, String> two = paBase(true);
        dividend(two, DIV, "0.00", "0.40");
        dividend(two, DIV2, "0.00", "0.40");
        two.put("/dividendReports", collection(DIV, DIV2));
        Graph summed = graph(two);
        assertEquals("1.00", summed.get("/paScheduleBLine10").get().toString(), "0.40 + 0.40 rounds once");
        assertEquals("1.00", summed.get("/paLine3").get().toString());
        assertEquals(Boolean.TRUE, summed.get("/paScheduleBSupported").get());
    }

    @Test
    void ordinaryDividendsAloneDoNotPrintScheduleB() throws Exception {
        Map<String, String> facts = dividends("800.00", null, true);
        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get("/paScheduleBSupported").get());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleB").get());
        assertEquals("800.00", graph.get("/paLine3").get().toString());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));
        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            assertFalse(new PDFTextStripper().getText(doc).contains(PAGE), "no PA-40 B");
        }
    }

    @Test
    void jointPartYearAndExemptStillRefuse() throws Exception {
        Map<String, String> joint = dividends("500.00", "10.00", true);
        joint.put("/filingStatus", enumValue("marriedFilingJointly", "/filingStatusOptions"));
        Graph jointGraph = graph(joint);
        assertEquals(Boolean.FALSE, jointGraph.get("/paScheduleBSupported").get());
        assertEquals(Boolean.TRUE, jointGraph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(
                "510.00",
                jointGraph.get("/paLine3").get().toString(),
                "joint line 3 still includes line 12; the schedule is not printed");
        assertRefused(joint, "/flowKnockoutPaScheduleB");

        Map<String, String> exempt = dividends("100.00", "10.00", true);
        exempt.put("/paHasExemptObligationDividends", bool(true));
        Graph exemptGraph = graph(exempt);
        assertEquals(Boolean.FALSE, exemptGraph.get("/paScheduleBSupported").get());
        assertEquals(Boolean.TRUE, exemptGraph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(Boolean.TRUE, exemptGraph.get("/flowKnockoutPaDividends").get());
        assertEquals("110.00", exemptGraph.get("/paLine3").get().toString(), "line 3 still includes line 12");
        assertRefused(exempt, "/flowKnockoutPaScheduleB");

        Map<String, String> partYear = partYearScenario();
        partYear.put("/paSchoolDistrictCode", string("22275"));
        partYear.put("/paHasExemptObligationDividends", bool(false));
        partYear.put("/paPartYearResidentDividends", dollar("2000.00"));
        dividend(partYear, DIV, "2000.00", "10.00");
        partYear.put("/dividendReports", collection(DIV));
        partYear.put("/dividendReportsIsDone", bool(true));
        Graph partYearGraph = graph(partYear);
        assertEquals(Boolean.FALSE, partYearGraph.get("/paScheduleBSupported").get());
        assertEquals(Boolean.TRUE, partYearGraph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(
                "2000.00",
                partYearGraph.get("/paLine3").get().toString(),
                "part-year line 3 does not include box 2a");
        assertRefused(partYear, "/flowKnockoutPaScheduleB");
    }

    @Test
    void unansweredExemptQuestionStaysIncomplete() throws Exception {
        Map<String, String> facts = dividends("100.00", "10.00", false);
        Graph graph = graph(facts);
        assertFalse(graph.get("/paScheduleBSupported").complete());
        assertFalse(graph.get("/flowKnockoutPaScheduleB").complete());
        assertFalse(graph.get("/flowKnockoutPaDividends").complete());
        assertEquals("110.00", graph.get("/paLine3").get().toString(), "line 3 is still line 12");
        assertRefused(facts, "/flowKnockoutPaScheduleB");
    }

    @Test
    void nonPennsylvaniaBox2aDoesNotPrintScheduleB() throws Exception {
        Map<String, String> facts = new java.util.HashMap<>();
        facts.put("/filerResidenceAndIncomeState", enumValue("nj", "/scopedStateOptions"));
        facts.put("/paHasExemptObligationDividends", bool(false));
        facts.put("/form8949Transactions", EMPTY_COLLECTION);
        dividend(facts, DIV, "100.00", "50.00");
        facts.put("/dividendReports", collection(DIV));
        facts.put("/dividendReportsIsDone", bool(true));
        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleB").get());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaDividends").get());
        assertEquals(Boolean.FALSE, graph.get("/paScheduleBSupported").get());
        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            assertFalse(new PDFTextStripper().getText(doc).contains(PAGE), "no PA-40 B");
        }
    }

    /** Every mapped field's tooltip (AcroForm /TU) names the line the field map puts there. */
    @Test
    void mappedFieldTooltipsNameTheIntendedLines() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put(NAME, "Name (if filing jointly");
        expected.put(SSN, "Social Security number shown first");
        expected.put(OVAL, "taxpayer/spouse/joint");
        expected.put(LINE1, "Line 3b of your federal return");
        expected.put(LINE6, "Subtract the amount on Line 5");
        expected.put(LINE10, "capital gains distributions");
        expected.put(LINE12, "Line 3 of your PA-40");

        try (PDDocument doc = Loader.loadPDF(
                new ClassPathResource("pdf/2026/PA40B/en/2025_pa-40b.pdf").getContentAsByteArray())) {
            var form = doc.getDocumentCatalog().getAcroForm();
            for (var e : expected.entrySet()) {
                PDField field = form.getField(e.getKey());
                assertTrue(field != null, "mapped field exists: " + e.getKey());
                String tooltip = field.getAlternateFieldName() == null
                        ? ""
                        : field.getAlternateFieldName().replaceAll("\\s+", " ");
                assertTrue(
                        tooltip.contains(e.getValue()),
                        e.getKey() + " tooltip names the line: expected \"" + e.getValue() + "\" in \"" + tooltip
                                + "\"");
            }
        }
    }

    private static Map<String, String> dividends(String box1a, String box2a, boolean exemptAnsweredNo) {
        Map<String, String> m = paBase(exemptAnsweredNo);
        dividend(m, DIV, box1a, box2a);
        m.put("/dividendReports", collection(DIV));
        m.put("/dividendReportsIsDone", bool(true));
        return m;
    }

    private static Map<String, String> paBase(boolean exemptAnsweredNo) {
        Map<String, String> m = paResident();
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/paSchoolDistrictCode", string("22275"));
        if (exemptAnsweredNo) {
            m.put("/paHasExemptObligationDividends", bool(false));
        }
        return m;
    }

    private static void dividend(Map<String, String> m, String id, String box1a, String box2a) {
        String p = "/dividendReports/#" + id + "/";
        m.put(p + "filer", collectionItem(FILER));
        m.put(p + "payer", string("Synthetic Index Fund"));
        m.put(p + "ordinaryDividends", dollar(box1a));
        if (box2a != null) {
            m.put(p + "writableCapitalGainDistributions", dollar(box2a));
        }
        m.put(p + "hasUnsupportedBoxes", bool(false));
        m.put(p + "receivedAsNominee", bool(false));
        m.put(p + "hasSeenLastAvailableScreen", bool(true));
    }

    private static Graph graph(Map<String, String> extra) throws Exception {
        return CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(PrintRefusingKnockoutsTest.smoke(extra));
    }

    private static String field(Map<String, String> fields, String name) {
        return PaPit40ScheduleSpTy2026PdfSmokeTest.field(fields, name);
    }

    private static void assertRefused(Map<String, String> facts, String path) {
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        @SuppressWarnings("unchecked")
        List<String> blocking = (List<String>) e.getBody().getProperties().get("blockingFacts");
        assertTrue(blocking.contains(path), "refused by " + path + ": " + blocking);
    }
}
