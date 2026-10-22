package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.field;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.highIncomeScenario;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #119: 2026 draft Schedules 1, 2 and 3 (https://www.irs.gov/pub/irs-dft/f1040s1--dft.pdf, f1040s2--dft.pdf,
 * f1040s3--dft.pdf) end-to-end through the real PdfService, fact dictionary and application.yaml. Draft-based field
 * maps: re-verify when the final forms are released (#124).
 *
 * <p>Golden end-to-end scenarios (synthetic data), all on the Schedule D smoke fixture's single filer and its two Form
 * 8949 sales ($9,000 on Form 1040 line 7a), standard deduction ($16,100):
 *
 * <pre>
 * A. Wages and interest (supported return): W-2 $250,000 wages, $184,500 social security wages, $250,000 Medicare
 *    wages; 1099-INT $10,000 interest with a $150 early withdrawal penalty.
 *    Schedule 1: 18 150, 26 150 (lines 3, 10, 15 blank).
 *    Schedule 2: 6 716 (Form 8960 line 17), 15 716, 17b 450 (Form 8959 line 12), 17d 450, 20 450,
 *                21 1,166 = 15 + 20 (Form 1040 line 23). Line 4 and line 11 blank.
 * B. Self-employment over the Additional Medicare Tax threshold: A plus a Schedule C with $50,000 gross receipts and
 *    $10,000 expenses ($40,000 net). The return is stopped by form8960 /flowKnockoutForm8960Unsupported (a Schedule C
 *    business above the 26 U.S.C. 1411(b) threshold): Schedule 2 line 11 can only be more than $0 when wages plus
 *    self-employment income are over the threshold, which puts MAGI over the same threshold. Printed here only to
 *    check the line 4 / 11 / 15 fields.
 *    Schedule SE: net earnings 40,000 x 92.35% = 36,940; social security part 0 (W-2 already at the $184,500 base);
 *    Medicare part 36,940 x 2.9% = 1,071.26 -> 1,071.
 *    Schedule 1: 3 40,000, 10 40,000, 15 536 (1,071 / 2 = 535.50, whole dollars), 18 150, 26 686.
 *    Schedule 2: 4 1,071, 6 2,236 (Form 8960 line 4a includes the Schedule C: (10,000 + 9,000 + 40,000 - 150) x 3.8%
 *                = 2,236.30), 11 332 (Form 8959 line 18: 36,940 x 0.9% = 332.46; line 10 is 0 since wages are over
 *                $200,000), 15 3,639, 17b 450, 20 450, 21 4,089.
 * C. Self-employment and foreign tax (supported return): W-2 $50,000 (all three wage boxes); Schedule C $12,000
 *    gross, $2,000 expenses ($10,000 net); 1099-DIV $1,000 box 1a, $50 box 7, 26 U.S.C. 904(j) election made.
 *    Schedule SE: 10,000 x 92.35% = 9,235; 9,235 x 12.4% = 1,145.14 -> 1,145; 9,235 x 2.9% = 267.82 -> 268; 1,413.
 *    Schedule 1: 3 10,000, 10 10,000, 15 707 (706.50, whole dollars), 26 707.
 *    Schedule 2: 4 1,413, 15 1,413, 21 1,413 (lines 17b, 17d and 20 blank).
 *    Schedule 3: 1 50 (no Form 1116; Form 6251 line 7 is 0), 8 50 (Form 1040 line 20). Lines 7, 9 and 15 blank.
 * D. Early distribution (#116): the smoke fixture's W-2 plus one Form 1099-R, box 1 and box 2a $10,000, box 7 code 1
 *    alone, no exception. 26 U.S.C. 72(t)(1): 10% of the taxable amount = 1,000; the 2026 draft Instructions for Form
 *    5329, PDF p. 2, send it to Schedule 2 line 5 with no Form 5329 when code 1 is on all Forms 1099-R.
 *    Schedule 2: 5 1,000 with the "If not required, check here" box checked, 15 1,000, 21 1,000 (Form 1040 line 23).
 * </pre>
 */
class Schedules123Ty2026PdfSmokeTest {
    static final String W2 = Form8959Form8960Ty2026PdfSmokeTest.W2;
    static final String BIZ = "c1190000-0000-4000-8000-000000000001";
    static final String DIV = "d1190000-0000-4000-8000-000000000001";
    static final String R1 = "e1160000-0000-4000-8000-000000000001";
    static final String SCH1 = "Schedule 1 (Form 1040) 2026";
    static final String SCH2 = "Schedule 2 (Form 1040) 2026";
    static final String SCH3 = "Schedule 3 (Form 1040) 2026";
    static final String F1040 = "Form 1040 (2026)";

    static Map<String, String> standardDeduction(Map<String, String> m) {
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/nonItemizerHadCashGifts", bool(false));
        return m;
    }

    static Map<String, String> wagesAndInterest() {
        Map<String, String> m = standardDeduction(highIncomeScenario());
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar("184500.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWithholding", dollar("11439.00"));
        return m;
    }

    static Map<String, String> scheduleC(Map<String, String> m, String gross, String expenses) {
        m.put("/hadSelfEmploymentIncome", bool(true));
        m.put("/wantsQbiDeduction", bool(false));
        m.put("/scheduleCBusinesses", collection(BIZ));
        m.put("/scheduleCBusinesses/#" + BIZ + "/businessName", string("Synthetic Consulting"));
        m.put("/scheduleCBusinesses/#" + BIZ + "/filer", collectionItem(W2));
        m.put("/scheduleCBusinesses/#" + BIZ + "/writableGrossReceipts", dollar(gross));
        m.put("/scheduleCBusinesses/#" + BIZ + "/writableTotalExpenses", dollar(expenses));
        m.put("/scheduleCBusinessesIsDone", bool(true));
        return m;
    }

    static Map<String, String> selfEmployedOverThreshold() {
        return scheduleC(wagesAndInterest(), "50000.00", "10000.00");
    }

    static Map<String, String> selfEmployedWithForeignTax() {
        Map<String, String> m = scheduleC(standardDeduction(new HashMap<>()), "12000.00", "2000.00");
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar("50000.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWithholding", dollar("3100.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("50000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("725.00"));
        m.put("/dividendReports", collection(DIV));
        m.put("/dividendReports/#" + DIV + "/filer", collectionItem(W2));
        m.put("/dividendReports/#" + DIV + "/payer", string("Synthetic Index Fund"));
        m.put("/dividendReports/#" + DIV + "/ordinaryDividends", dollar("1000.00"));
        m.put("/dividendReports/#" + DIV + "/writableForeignTaxPaid", dollar("50.00"));
        m.put("/dividendReports/#" + DIV + "/foreignTaxElectionRequirementsMet", bool(true));
        m.put("/dividendReports/#" + DIV + "/hasUnsupportedBoxes", bool(false));
        m.put("/dividendReports/#" + DIV + "/receivedAsNominee", bool(false));
        m.put("/dividendReports/#" + DIV + "/hasSeenLastAvailableScreen", bool(true));
        m.put("/dividendReportsIsDone", bool(true));
        return m;
    }

    static Map<String, String> earlyDistribution() {
        Map<String, String> m = standardDeduction(new HashMap<>());
        String r = "/form1099Rs/#" + R1;
        m.put("/form1099Rs", collection(R1));
        m.put("/hasCompleted1099RSection", bool(true));
        m.put(r + "/filer", collectionItem(W2));
        m.put(r + "/writableGrossDistribution", dollar("10000.00"));
        m.put(r + "/writableTaxableAmount", dollar("10000.00"));
        m.put(r + "/writableTaxableAmountNotDetermined", bool(false));
        m.put(r + "/writableTotalDistribution", bool(false));
        m.put(r + "/iraSepSimple", bool(false));
        m.put(r + "/writableDistributionCode", string("1"));
        m.put(r + "/writableQualifiedEarlyDistribution", bool(false));
        m.put(r + "/writableIsIndirectRollover", bool(false));
        m.put(r + "/writableQualifiedDisasterDistribution", bool(false));
        m.put(r + "/writableIsDistributionFromMilitaryRetirementPlan", bool(false));
        m.put(r + "/hasSeenLastAvailableScreen", bool(true));
        return m;
    }

    static Map<String, String> page(PDDocument doc, String footer) throws Exception {
        Map<String, String> f = fieldsOnPages(doc, footer);
        assertFalse(f.isEmpty(), footer + " printed");
        return f;
    }

    /** Form 1040 page 1 and page 2 fields (the field() helper looks under Page1[0] only). */
    static long f1040(Map<String, String> f, String pageAndName) {
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(pageAndName)) {
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null && !found.isEmpty(), "Form 1040 " + pageAndName + " printed");
        return cents(found) / 100;
    }

    static String any(Map<String, String> f, String name) {
        String suffix = "." + name;
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field is unique on the form: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present on the form: " + suffix);
        return found;
    }

    static void amount2(Map<String, String> f, String name, long dollars, String line) {
        String v = any(f, name);
        assertFalse(v.isEmpty(), line + " printed");
        assertEquals(dollars * 100, cents(v), line);
    }

    static void blank2(Map<String, String> f, String name, String line) {
        assertEquals("", any(f, name), line + " blank");
    }

    @Test
    void wagesAndInterestPrintSchedules1And2() throws Exception {
        byte[] bytes = generate(wagesAndInterest());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedules123-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> s1 = page(doc, SCH1);
            assertTrue(field(s1, "f1_01[0]").contains("McTestface"), "Schedule 1 name");
            blank(s1, "f1_07[0]", "Schedule 1 line 3 (no Schedule C)");
            blank(s1, "f1_38[0]", "Schedule 1 line 10 ($0)");
            Map<String, String> s1p2 = fieldsOnPages(doc, SCH1);
            blank2(s1p2, "f2_05[0]", "Schedule 1 line 15 (no Schedule SE)");
            amount2(s1p2, "f2_08[0]", 150, "Schedule 1 line 18 early withdrawal penalty");
            amount2(s1p2, "f2_30[0]", 150, "Schedule 1 line 26");

            Map<String, String> s2 = page(doc, SCH2);
            assertTrue(field(s2, "f1_01[0]").contains("McTestface"), "Schedule 2 name");
            blank2(s2, "f1_03[0]", "Schedule 2 line 1a (inside Line1_ReadOrder)");
            blank(s2, "f1_13[0]", "Schedule 2 line 3 ($0)");
            blank(s2, "f1_15[0]", "Schedule 2 line 4 (no Schedule SE)");
            amount(s2, "f1_17[0]", 716, "Schedule 2 line 6 NIIT (Form 8960 line 17)");
            blank(s2, "f1_22[0]", "Schedule 2 line 11 (no SE income)");
            amount2(s2, "f2_07[0]", 716, "Schedule 2 line 15");
            amount2(s2, "f2_12[0]", 450, "Schedule 2 line 17b (Form 8959 line 12)");
            amount2(s2, "f2_14[0]", 450, "Schedule 2 line 17d");
            amount2(s2, "f2_19[0]", 450, "Schedule 2 line 20");
            amount2(s2, "f2_20[0]", 1166, "Schedule 2 line 21 = 15 + 20");
            
            Map<String, String> f = fieldsOnPages(doc, F1040);
            assertEquals(1166, f1040(f, "Page2[0].f2_16[0]"), "Form 1040 line 23 = Schedule 2 line 21");
            assertEquals(150, f1040(f, "Page1[0].f1_74[0]"), "Form 1040 line 10 = Schedule 1 line 26");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains(SCH3), "no Schedule 3 without credits or payments");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheets dropped");
        }
    }

    @Test
    void selfEmploymentOverTheThresholdPrintsLines4And11() throws Exception {
        byte[] bytes = generate(selfEmployedOverThreshold());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> s1 = page(doc, SCH1);
            amount(s1, "f1_07[0]", 40000, "Schedule 1 line 3 (Schedule C)");
            amount(s1, "f1_38[0]", 40000, "Schedule 1 line 10");
            amount2(s1, "f2_05[0]", 536, "Schedule 1 line 15 deductible part of SE tax");
            amount2(s1, "f2_30[0]", 686, "Schedule 1 line 26 = 15 + 18");

            Map<String, String> s2 = page(doc, SCH2);
            amount(s2, "f1_15[0]", 1071, "Schedule 2 line 4 SE tax (Medicare part only)");
            amount(s2, "f1_17[0]", 2236, "Schedule 2 line 6");
            amount(s2, "f1_22[0]", 332, "Schedule 2 line 11 (Form 8959 line 18)");
            amount2(s2, "f2_07[0]", 3639, "Schedule 2 line 15 = 4 + 6 + 11");
            amount2(s2, "f2_19[0]", 450, "Schedule 2 line 20");
            amount2(s2, "f2_20[0]", 4089, "Schedule 2 line 21");

            Map<String, String> f = fieldsOnPages(doc, F1040);
            assertEquals(40000, f1040(f, "Page1[0].f1_72[0]"), "Form 1040 line 8 = Schedule 1 line 10");
            assertEquals(686, f1040(f, "Page1[0].f1_74[0]"), "Form 1040 line 10 = Schedule 1 line 26");
            assertEquals(4089, f1040(f, "Page2[0].f2_16[0]"), "Form 1040 line 23 = Schedule 2 line 21");
        }
    }

    @Test
    void selfEmploymentAndForeignTaxPrintSchedule3() throws Exception {
        byte[] bytes = generate(selfEmployedWithForeignTax());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> s1 = page(doc, SCH1);
            amount(s1, "f1_07[0]", 10000, "Schedule 1 line 3");
            amount(s1, "f1_38[0]", 10000, "Schedule 1 line 10");
            amount2(s1, "f2_05[0]", 707, "Schedule 1 line 15");
            blank2(s1, "f2_08[0]", "Schedule 1 line 18");
            amount2(s1, "f2_30[0]", 707, "Schedule 1 line 26");

            Map<String, String> s2 = page(doc, SCH2);
            amount(s2, "f1_15[0]", 1413, "Schedule 2 line 4 SE tax");
            blank(s2, "f1_17[0]", "Schedule 2 line 6");
            blank(s2, "f1_22[0]", "Schedule 2 line 11");
            amount2(s2, "f2_07[0]", 1413, "Schedule 2 line 15");
            blank2(s2, "f2_12[0]", "Schedule 2 line 17b");
            blank2(s2, "f2_14[0]", "Schedule 2 line 17d");
            blank2(s2, "f2_19[0]", "Schedule 2 line 20");
            amount2(s2, "f2_20[0]", 1413, "Schedule 2 line 21");

            Map<String, String> s3 = page(doc, SCH3);
            assertTrue(field(s3, "f1_01[0]").contains("McTestface"), "Schedule 3 name");
            amount(s3, "f1_03[0]", 50, "Schedule 3 line 1 foreign tax credit (26 U.S.C. 904(j))");
            blank(s3, "f1_04[0]", "Schedule 3 line 2");
            blank(s3, "f1_06[0]", "Schedule 3 line 4");
            blank(s3, "f1_24[0]", "Schedule 3 line 7 ($0)");
            amount(s3, "f1_25[0]", 50, "Schedule 3 line 8");
            blank(s3, "f1_26[0]", "Schedule 3 line 9 (the 2024 map's line 8 field)");
            blank(s3, "f1_38[0]", "Schedule 3 line 15 ($0)");

            Map<String, String> f = fieldsOnPages(doc, F1040);
            assertEquals(50, f1040(f, "Page2[0].f2_13[0]"), "Form 1040 line 20 = Schedule 3 line 8");
            assertEquals(1413, f1040(f, "Page2[0].f2_16[0]"), "Form 1040 line 23 = Schedule 2 line 21");
        }
    }

    @Test
    void earlyDistributionPrintsLine5WithTheBoxChecked() throws Exception {
        byte[] bytes = generate(earlyDistribution());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> s2 = page(doc, SCH2);
            amount(s2, "f1_16[0]", 1000, "Schedule 2 line 5 = 10% of the code 1 taxable amount");
            assertEquals("1", any(s2, "c1_6[0]"), "Schedule 2 line 5 Form 5329 not required box");
            blank(s2, "f1_15[0]", "Schedule 2 line 4 (no Schedule SE)");
            amount2(s2, "f2_07[0]", 1000, "Schedule 2 line 15");
            amount2(s2, "f2_20[0]", 1000, "Schedule 2 line 21");

            Map<String, String> f = fieldsOnPages(doc, F1040);
            assertEquals(1000, f1040(f, "Page2[0].f2_16[0]"), "Form 1040 line 23 = Schedule 2 line 21");
        }
    }

    @Test
    void noEarlyDistributionLeavesLine5BlankAndUnchecked() throws Exception {
        byte[] bytes = generate(wagesAndInterest());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> s2 = page(doc, SCH2);
            blank(s2, "f1_16[0]", "Schedule 2 line 5");
            assertTrue(!"1".equals(any(s2, "c1_6[0]")), "Schedule 2 line 5 box not checked");
        }
    }
}
