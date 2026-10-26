package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.factgraph.Graph;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.day;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.value;
import static gov.irs.directfile.api.pdf.Ty2026PdfPackageTest.checked;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #239: 2026 draft Schedule 3-A (https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf, created 6/24/26, SHA-256
 * 787e1ae1eaa3e23a184074d0f437f6b2a8fe3f01290f366201f14eeecc82b8db) through the real PdfService. No Schedule 3-A
 * instructions are posted yet; the lines follow the draft form. Draft-based field map: re-verify when the final form
 * is released (#124).
 *
 * <p>Golden end-to-end scenario (synthetic data): single, one W-2 of $10,000, no qualifying child, born in 1987 so
 * the childless earned income credit applies (26 U.S.C. 32). Wages are below the standard deduction, so Form 1040
 * line 24a is $0 and Schedule 3-A line 6 is line 2. A group-00 test SSN meets 26 U.S.C. 32(c)(1)(E) and (m); the SSA
 * never assigns group 00. The EIC dollar amount is whatever the fact graph computes; this test does not hard-code it.
 *
 * <p>Line 8 "Are you or your spouse a U.S. citizen, U.S. national, or qualified alien?" Qualified alien: 8 U.S.C.
 * 1641(b). Yes enters -0- on line 8 and on Form 1040 line 32b ($0 prints blank). No enters line 6 on line 8 and on
 * line 32b. Line 7 "No" enters line 6 on line 32b and leaves line 8 blank. 2026 draft Form 1040 line 32c subtracts
 * line 32b from line 32a; line 33 adds lines 25d, 26 and 32c.
 */
class Schedule3ATy2026PdfSmokeTest {
    static final String S3A_FOOTER = "Schedule 3-A (Form 1040) 2026";
    static final String F1040_FOOTER = "Form 1040 (2026)";

    /**
     * Childless EIC. {@code line7Yes} null leaves line 7 unanswered. {@code line8Yes} is read only after a line 7 yes.
     */
    static Map<String, String> childlessEic(Boolean line7Yes, Boolean line8Yes) {
        Map<String, String> m = new HashMap<>();
        String w2 = Form8959Form8960Ty2026PdfSmokeTest.W2;
        m.put("/formW2s/#" + w2 + "/writableWages", dollar("10000.00"));
        m.put("/formW2s/#" + w2 + "/writableOasdiWages", dollar("10000.00"));
        m.put("/formW2s/#" + w2 + "/writableMedicareWages", dollar("10000.00"));
        m.put("/form8949Transactions", PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION);
        m.put("/eitcQcOfAnother", bool(false));
        m.put("/eitcHadImproperClaims", bool(false));
        m.put("/filers/#" + w2 + "/canBeClaimed", bool(false));
        m.put("/filers/#" + w2 + "/dateOfBirth", day("1987-06-06"));
        Schedules123Ty2026PdfSmokeTest.standardDeduction(m);
        Ty2026PdfPackageTest.syntheticFiler(m);
        // A 9xx number is an ITIN (26 U.S.C. 32(m)), so the filer and the W-2 use a group-00 test SSN.
        m.put("/filers/#" + w2 + "/tin", tin("444", "00", "4444"));
        m.put("/formW2s/#" + w2 + "/tin", tin("444", "00", "4444"));
        if (line7Yes != null) {
            m.put("/schedule3AWantsFederalPublicBenefit", bool(line7Yes));
        }
        if (line8Yes != null) {
            m.put("/schedule3AIsCitizenNationalOrQualifiedAlien", bool(line8Yes));
        }
        return m;
    }

    static String dollars(Graph graph, String path) {
        var r = graph.get(path);
        assertTrue(r.complete(), path + " complete, was " + r);
        return new BigDecimal(r.get().toString()).setScale(2).toPlainString();
    }

    @Test
    void line8YesPutsZeroOnLine32bAndLine8NoCarriesLine6() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, String> yesFacts = childlessEic(true, true);
        Graph yes = fgs.getGraph(PrintRefusingKnockoutsTest.smoke(yesFacts));
        assertEquals(Boolean.TRUE, yes.get("/pdfIncludeSchedule3A").get());
        assertTrue(new BigDecimal(dollars(yes, "/earnedIncomeCredit")).signum() > 0, "line 27a");
        String line6 = dollars(yes, "/schedule3ALine6");
        assertTrue(new BigDecimal(line6).signum() > 0, "line 6");
        assertEquals("0.00", dollars(yes, "/schedule3AAmountForForm1040Line32b"), "line 8 yes: line 32b is -0-");
        assertEquals("0.00", dollars(yes, "/schedule3ALine8"));
        assertEquals(dollars(yes, "/totalOtherPaymentsRefundableCredits"), dollars(yes, "/form1040Line32c"), "32c = 32a");

        try (PDDocument doc = Loader.loadPDF(generate(yesFacts))) {
            Map<String, String> s3a = fieldsOnPages(doc, S3A_FOOTER);
            assertFalse(s3a.isEmpty(), "EIC prints Schedule 3-A");
            assertTrue(checked(s3a, "Page1[0].c1_3[0]"), "line 8 Yes");
            blank(s3a, "Page1[0].f1_10[0]", "line 8 amount is -0- and prints blank");
            Map<String, String> f1040 = fieldsOnPages(doc, F1040_FOOTER);
            blank(f1040, "Page2[0].f2_32[0]", "Form 1040 line 32b is -0- and prints blank");
            assertFalse(
                    value(f1040, "Line31-32_ReadOrder[0].f2_31[0]").isEmpty(), "line 32a printed");
        }

        Map<String, String> noFacts = childlessEic(true, false);
        Graph no = fgs.getGraph(PrintRefusingKnockoutsTest.smoke(noFacts));
        assertEquals(line6, dollars(no, "/schedule3ALine6"));
        assertEquals(line6, dollars(no, "/schedule3ALine8"), "line 8 no: line 6 on line 8");
        assertEquals(line6, dollars(no, "/schedule3AAmountForForm1040Line32b"), "line 8 no: line 6 on line 32b");
        try (PDDocument doc = Loader.loadPDF(generate(noFacts))) {
            Map<String, String> s3a = fieldsOnPages(doc, S3A_FOOTER);
            assertTrue(checked(s3a, "Page1[0].c1_3[1]"), "line 8 No");
            assertEquals(value(s3a, "Page1[0].f1_09[0]"), value(s3a, "Page1[0].f1_10[0]"), "line 8 amount = line 6");
            Map<String, String> f1040 = fieldsOnPages(doc, F1040_FOOTER);
            assertEquals(
                    value(s3a, "Page1[0].f1_09[0]"),
                    value(f1040, "Page2[0].f2_32[0]"),
                    "Form 1040 line 32b = Schedule 3-A line 6");
        }
    }

    @Test
    void line7NoCarriesLine6ToLine32bAndLeavesLine8Blank() throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, String> facts = childlessEic(false, null);
        Graph graph = fgs.getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        String line6 = dollars(graph, "/schedule3ALine6");
        assertEquals(line6, dollars(graph, "/schedule3AAmountForForm1040Line32b"));
        assertEquals(Boolean.FALSE, graph.get("/schedule3ALine8Applies").get());
        assertFalse(graph.get("/schedule3ALine8").complete(), "line 8 is not reached");
        try (PDDocument doc = Loader.loadPDF(generate(facts))) {
            Map<String, String> s3a = fieldsOnPages(doc, S3A_FOOTER);
            assertTrue(checked(s3a, "Page1[0].c1_2[1]"), "line 7 No");
            blank(s3a, "Page1[0].c1_3[0]", "line 8 Yes not reached");
            blank(s3a, "Page1[0].c1_3[1]", "line 8 No not reached");
            blank(s3a, "Page1[0].f1_10[0]", "line 8 amount blank");
            Map<String, String> f1040 = fieldsOnPages(doc, F1040_FOOTER);
            assertEquals(value(s3a, "Page1[0].f1_09[0]"), value(f1040, "Page2[0].f2_32[0]"), "line 32b = line 6");
        }
    }
}
