package gov.irs.directfile.api.pdf;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.selfEmployed;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #239: 2026 Schedule C (https://www.irs.gov/pub/irs-pdf/f1040sc.pdf, SHA-256
 * cc44e7d1150e54d991835814c1191f60a32617730ca9e50e6f532b51293a86b4) through the real PdfService. The final has no
 * AcroForm /TU tooltips, so the field map is by field name.
 *
 * <p>Golden end-to-end scenario (synthetic data): single, one W-2 of $170,000 and one Schedule C business with
 * $30,000 of gross receipts and no expenses. 2026 Schedule C line 31: "If a profit, enter on both Schedule 1
 * (Form 1040), line 3, and on Schedule SE, line 2." Net earnings from self-employment: 26 U.S.C. 1402(a). Lines 2, 4,
 * 6 and 30 are blank, so lines 3, 5 and 7 equal line 1 and lines 29 and 31 equal line 7 minus line 28. No amount on
 * Form 1040 lines 27a, 28, 29 or 30, so Schedule 3-A is not printed.
 */
class ScheduleCTy2026PdfSmokeTest {
    static final String SC_FOOTER = "Schedule C (Form 1040) 2026";

    @Test
    void line31EqualsSchedule1Line3AndScheduleSeLine2() throws Exception {
        byte[] bytes = generate(selfEmployed("170000.00", "170000.00", "30000.00"));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            assertFalse(sc.isEmpty(), "Schedule C printed");
            assertTrue(value(sc, "Page1[0].f1_1[0]").toUpperCase().contains("EXAMPLETON"), "proprietor");
            assertEquals("900000001", value(sc, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "SSN");
            assertTrue(value(sc, "Page1[0].f1_5[0]").contains("Synthetic Consulting"), "C business name");
            amount(sc, "Page1[0].f1_13[0]", 30000, "1 gross receipts");
            amount(sc, "Page1[0].f1_15[0]", 30000, "3 = 1 (line 2 blank)");
            amount(sc, "Page1[0].f1_17[0]", 30000, "5 = 3 (line 4 blank)");
            amount(sc, "Page1[0].f1_19[0]", 30000, "7 = 5 (line 6 blank)");
            blank(sc, "Page1[0].f1_46[0]", "28 expenses are $0");
            amount(sc, "Page1[0].f1_47[0]", 30000, "29");
            amount(sc, "Page1[0].f1_51[0]", 30000, "31");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 30000, "Schedule 1 line 3 = Schedule C line 31");
            Map<String, String> se = fieldsOnPages(doc, ScheduleSETy2026PdfSmokeTest.SE_FOOTER);
            amount(se, "Page1[0].f1_5[0]", 30000, "Schedule SE line 2 = Schedule C line 31");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Schedule 3-A (Form 1040) 2026"), "no lines 27a-30, so no Schedule 3-A");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
            assertHeaderBlank(sc);
        }
    }

    /**
     * #89. Lines A–F stay blank when the filer has not answered them. 2026 draft Instructions for Schedule C, PDF
     * pp. 4–5. Cash is not assumed. An SSN is not written on line D.
     */
    @Test
    void headerLinesStayBlankWhenRequiredFactsAreMissing() throws Exception {
        byte[] bytes = generate(selfEmployed("170000.00", "170000.00", "30000.00"));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            assertHeaderBlank(sc);
            assertTrue(value(sc, "Page1[0].f1_5[0]").contains("Synthetic Consulting"), "C still prints");
            String page = scheduleCPage(doc);
            assertTrue(page.contains("Principal business or profession"), "line A caption");
            assertTrue(page.contains("Enter code from instructions"), "line B caption");
            assertTrue(page.contains("Employer ID number"), "line D caption");
            assertTrue(page.contains("Business address"), "line E caption");
            assertTrue(page.contains("Accounting method"), "line F caption");
        }
    }

    /**
     * #89. Cash, an EIN, and a separate address print on lines A, B, D, E, and F. Line C is the business name.
     * 2026 draft Instructions for Schedule C, PDF p. 4 Lines A, B, and D, and PDF p. 5 Lines E and F.
     */
    @Test
    void headerLinesAFPrintCashEinAndSeparateAddress() throws Exception {
        Map<String, String> facts = selfEmployed("170000.00", "170000.00", "30000.00");
        header(facts, "Consulting", "Tax preparation", "541213", true, "12", "3456789", false, "cash");
        facts.put(biz() + "businessAddress", address("200 Market", "Suite 4", "Harrisburg", "PA", "17101"));

        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            String lineA = value(sc, "Page1[0].f1_3[0]");
            assertTrue(lineA.contains("Consulting"), "A activity");
            assertTrue(lineA.contains("Tax preparation"), "A product");
            assertEquals("541213", value(sc, "Page1[0].f1_4[0]"), "B code");
            assertTrue(value(sc, "Page1[0].f1_5[0]").contains("Synthetic Consulting"), "C name");
            assertEquals("12-3456789", value(sc, "Page1[0].BoxD[0].f1_6[0]"), "D EIN");
            assertEquals("200 Market", value(sc, "Page1[0].f1_7[0]"), "E street");
            assertEquals("Suite 4", value(sc, "Page1[0].f1_8[0]"), "E apt");
            assertEquals("Harrisburg", value(sc, "Page1[0].f1_9[0]"), "E city");
            assertEquals("PA", value(sc, "Page1[0].f1_10[0]"), "E state");
            assertEquals("17101", value(sc, "Page1[0].f1_11[0]"), "E ZIP");
            assertTrue(checked(sc, "Page1[0].c1_1[0]"), "F cash");
            blank(sc, "Page1[0].c1_1[1]", "F accrual");
            blank(sc, "Page1[0].c1_1[2]", "F other");
            blank(sc, "Page1[0].f1_12[0]", "F specify");
        }
    }

    /**
     * At the return address, with no EIN, on the accrual method. Line D and line E stay blank. 2026 draft
     * Instructions for Schedule C, PDF p. 4, Line D, and PDF p. 5, Line E. 26 U.S.C. 446(c)(2).
     */
    @Test
    void headerAtHomeWithNoEinPrintsAccrualAndLeavesDAndEBlank() throws Exception {
        Map<String, String> facts = selfEmployed("170000.00", "170000.00", "30000.00");
        header(facts, "Consulting", "Tax preparation", "541213", false, null, null, true, "accrual");

        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            assertEquals("541213", value(sc, "Page1[0].f1_4[0]"), "B");
            blank(sc, "Page1[0].BoxD[0].f1_6[0]", "D no EIN");
            blank(sc, "Page1[0].f1_7[0]", "E street");
            blank(sc, "Page1[0].f1_8[0]", "E apt");
            blank(sc, "Page1[0].f1_9[0]", "E city");
            blank(sc, "Page1[0].f1_10[0]", "E state");
            blank(sc, "Page1[0].f1_11[0]", "E ZIP");
            blank(sc, "Page1[0].c1_1[0]", "F cash");
            assertTrue(checked(sc, "Page1[0].c1_1[1]"), "F accrual");
            blank(sc, "Page1[0].c1_1[2]", "F other");
        }
    }

    /**
     * Other stops the return instead of printing line F (3). 2026 draft Instructions for Schedule C, PDF p. 5, Line
     * F. 26 U.S.C. 446(c). No new print-refuse path was added.
     */
    @Test
    void headerOtherStopsInsteadOfPrinting() throws Exception {
        Map<String, String> other = selfEmployed("170000.00", "170000.00", "30000.00");
        header(other, "Consulting", "Tax preparation", "541213", false, null, null, true, "other");
        assertTrue(
                PrintRefusingKnockouts.refusingPaths(graphOf(other)).contains("/flowKnockoutScheduleCOutOfScope"),
                "other accounting method refuses the print");
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(other));
        assertTrue(
                e.getBody().getProperties().get("blockingFacts") instanceof List<?> blocking
                        && blocking.contains("/flowKnockoutScheduleCOutOfScope"),
                "public print lists the Schedule C stop");
    }

    /**
     * Line-item path. Lines 2 and 6 are entered, line 4 is zero because there is no inventory, line 24b is half of
     * the meals (26 U.S.C. 274(n)), and one Part V line is line 27b and line 48. A stored single expense total is
     * ignored. 2026 draft Instructions for Schedule C, PDF pp. 7, 11, and 17.
     */
    @Test
    void itemizedLinesPrintAndAStoredExpenseTotalIsIgnored() throws Exception {
        var facts = selfEmployed("170000.00", "170000.00", "10000.00");
        String id = ScheduleSETy2026PdfSmokeTest.BIZ;
        String b = "/scheduleCBusinesses/#" + id + "/";
        facts.put(b + "writableReturnsAndAllowances", ScheduleATy2026PdfSmokeTest.dollar("500.00"));
        facts.put(b + "writableOtherIncome", ScheduleATy2026PdfSmokeTest.dollar("200.00"));
        facts.put(b + "writableTotalExpenses", ScheduleATy2026PdfSmokeTest.dollar("9999.00"));
        facts.put(b + "otherIncomeNeedsAnotherForm", ScheduleATy2026PdfSmokeTest.bool(false));
        for (String stop : new String[] {
            "hasInventoryOrCogs",
            "hasCarTruckOrVehicleLoan",
            "hasDepreciationOrSection179",
            "hasDepletion",
            "hasVehicleMachineryEquipmentRent",
            "hasHomeOffice",
            "hasEnergyEfficientBuildingsDeduction"
        }) {
            facts.put(b + stop, ScheduleATy2026PdfSmokeTest.bool(false));
        }
        facts.put(b + "hasDeductibleExpenses", ScheduleATy2026PdfSmokeTest.bool(true));
        facts.put(
                b + "expenseLinesChosen",
                "{\"$type\":\"gov.irs.factgraph.persisters.MultEnumWrapper\",\"item\":{\"enumOptionsPath\":\"/scheduleCExpenseLineOptions\",\"values\":[\"advertising\",\"meals\",\"otherExpenses\"]}}");
        facts.put(b + "writableAdvertising", ScheduleATy2026PdfSmokeTest.dollar("100.00"));
        facts.put(b + "writableMeals", ScheduleATy2026PdfSmokeTest.dollar("200.00"));
        facts.put(b + "mealsAreStandardHalfLimit", ScheduleATy2026PdfSmokeTest.bool(true));
        facts.put(b + "partVIncludesNewAmortization", ScheduleATy2026PdfSmokeTest.bool(false));
        facts.put(b + "hasAnotherPartVExpense", ScheduleATy2026PdfSmokeTest.bool(false));
        facts.put(b + "partV1Description", ScheduleATy2026PdfSmokeTest.string("Bank fees"));
        facts.put(b + "partV1Amount", ScheduleATy2026PdfSmokeTest.dollar("40.00"));

        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            amount(sc, "Page1[0].f1_13[0]", 10000, "1");
            amount(sc, "Page1[0].f1_14[0]", 500, "2");
            amount(sc, "Page1[0].f1_15[0]", 9500, "3");
            blank(sc, "Page1[0].f1_16[0]", "4 zero");
            amount(sc, "Page1[0].f1_17[0]", 9500, "5");
            amount(sc, "Page1[0].f1_18[0]", 200, "6");
            amount(sc, "Page1[0].f1_19[0]", 9700, "7");
            amount(sc, "Page1[0].Lines8-16c_ReadOrder[0].f1_20[0]", 100, "8");
            blank(sc, "Page1[0].Lines8-16c_ReadOrder[0].f1_21[0]", "9 vehicle stays blank");
            amount(sc, "Page1[0].f1_41[0]", 100, "24b half of 200");
            amount(sc, "Page1[0].f1_45[0]", 40, "27b");
            amount(sc, "Page1[0].f1_46[0]", 240, "28");
            amount(sc, "Page1[0].f1_47[0]", 9460, "29");
            amount(sc, "Page1[0].f1_51[0]", 9460, "31");
            blank(sc, "Page1[0].c1_7[0]", "32a unchecked on a profit");
            blank(sc, "Page1[0].c1_7[1]", "32b unchecked on a profit");
            assertEquals("Bank fees", value(sc, "Page2[0].f2_15[0]").trim(), "Part V description");
            amount(sc, "Page2[0].f2_16[0]", 40, "Part V amount");
            blank(sc, "Page2[0].f2_17[0]", "second Part V description blank");
            amount(sc, "Page2[0].f2_33[0]", 40, "48");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 9460, "Schedule 1 line 3");
            Map<String, String> se = fieldsOnPages(doc, ScheduleSETy2026PdfSmokeTest.SE_FOOTER);
            amount(se, "Page1[0].f1_5[0]", 9460, "Schedule SE line 2");
            blank(sc, "Page1[0].f1_50[0]", "30 blank when there is no home office");
        }
    }

    /**
     * Simplified method. 2026 draft Instructions for Schedule C, PDF p. 14: $5 times allowable square feet, not more
     * than 300, and not more than worksheet line 1. Here line 29 is $10,000 and the business area is 100 square feet,
     * so line 30 is $500 and line 31 is $9,500. Line 30(b) is the area actually used.
     */
    @Test
    void simplifiedMethodPrintsLine30AndReducesLine31() throws Exception {
        var facts = selfEmployed("170000.00", "170000.00", "10000.00");
        String b = "/scheduleCBusinesses/#" + ScheduleSETy2026PdfSmokeTest.BIZ + "/";
        facts.put(b + "writableReturnsAndAllowances", dollar("0.00"));
        facts.put(b + "writableOtherIncome", dollar("0.00"));
        for (String stop : new String[] {
            "hasInventoryOrCogs",
            "hasCarTruckOrVehicleLoan",
            "hasDepreciationOrSection179",
            "hasDepletion",
            "hasVehicleMachineryEquipmentRent",
            "hasEnergyEfficientBuildingsDeduction"
        }) {
            facts.put(b + stop, bool(false));
        }
        facts.put(b + "hasHomeOffice", bool(true));
        facts.put(b + "homeOfficeUsesSimplifiedMethod", bool(true));
        facts.put(b + "simplifiedMethodSameAreaAllYear", bool(true));
        facts.put(b + "simplifiedMethodGrossIncomeIsLine29", bool(true));
        facts.put(b + "simplifiedMethodSpaceNotShared", bool(true));
        facts.put(b + "simplifiedMethodNotRentalUse", bool(true));
        facts.put(b + "simplifiedMethodNoPrior8829Carryover", bool(true));
        facts.put(b + "writableHomeTotalSquareFeet", dollar("1500.00"));
        facts.put(b + "writableBusinessUseSquareFeet", dollar("100.00"));
        facts.put(b + "hasDeductibleExpenses", bool(false));

        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            amount(sc, "Page1[0].f1_19[0]", 10000, "7");
            blank(sc, "Page1[0].f1_46[0]", "28 zero");
            amount(sc, "Page1[0].f1_47[0]", 10000, "29");
            assertEquals("1500", value(sc, "Page1[0].Line30_ReadOrder[0].f1_48[0]").trim(), "30(a)");
            assertEquals("100", value(sc, "Page1[0].Line30_ReadOrder[0].f1_49[0]").trim(), "30(b)");
            amount(sc, "Page1[0].f1_50[0]", 500, "30");
            amount(sc, "Page1[0].f1_51[0]", 9500, "31");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 9500, "Schedule 1 line 3");
        }
    }

    /**
     * Simple Part III. 2026 Schedule C, PDF p. 2: line 36 is purchases less personal use, line 40 adds lines 35
     * through 39, and line 42 (line 40 minus line 41) is line 4. Hand worksheet: 1,000 + (5,000 − 200) + 300 + 400 +
     * 50 = 6,550; 6,550 − 1,500 = 5,050. Line 7 and line 31 are 14,950. Rev. Proc. 2025-32 §4.30 does not stop line 1
     * of $20,000. Form 8995 prints (#17). Submission stays blocked because there is no MeF mapping.
     */
    @Test
    void simplePartIIIPrintsLine4AndDoesNotUseTheInventoryStop() throws Exception {
        Map<String, String> facts = partIII("20000.00", "cost", false, true);
        Graph graph = graphOf(facts);
        assertEquals(
                List.of(),
                PrintRefusingKnockouts.refusingPaths(graph),
                "supported Part III is not /flowKnockoutScheduleCOutOfScope");
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutForm8995WithoutTy2026Template").get());
        assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get());

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, SC_FOOTER);
            amount(sc, "Page1[0].f1_13[0]", 20000, "1");
            blank(sc, "Page1[0].f1_14[0]", "2 zero");
            amount(sc, "Page1[0].f1_15[0]", 20000, "3");
            amount(sc, "Page1[0].f1_16[0]", 5050, "4 from line 42");
            amount(sc, "Page1[0].f1_17[0]", 14950, "5");
            blank(sc, "Page1[0].f1_18[0]", "6 zero");
            amount(sc, "Page1[0].f1_19[0]", 14950, "7");
            blank(sc, "Page1[0].f1_46[0]", "28 zero");
            amount(sc, "Page1[0].f1_51[0]", 14950, "31");
            assertTrue(checked(sc, "Page2[0].c2_1[0]"), "33a Cost");
            blank(sc, "Page2[0].c2_2[0]", "33b");
            blank(sc, "Page2[0].c2_3[0]", "33c");
            blank(sc, "Page2[0].c2_4[0]", "34 Yes");
            assertTrue(checked(sc, "Page2[0].c2_4[1]"), "34 No");
            amount(sc, "Page2[0].f2_1[0]", 1000, "35");
            amount(sc, "Page2[0].f2_2[0]", 4800, "36");
            amount(sc, "Page2[0].f2_3[0]", 300, "37");
            amount(sc, "Page2[0].f2_4[0]", 400, "38");
            amount(sc, "Page2[0].f2_5[0]", 50, "39");
            amount(sc, "Page2[0].f2_6[0]", 6550, "40");
            amount(sc, "Page2[0].f2_7[0]", 1500, "41");
            amount(sc, "Page2[0].f2_8[0]", 5050, "42");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 14950, "Schedule 1 line 3");
            Map<String, String> se = fieldsOnPages(doc, ScheduleSETy2026PdfSmokeTest.SE_FOOTER);
            amount(se, "Page1[0].f1_5[0]", 14950, "Schedule SE line 2");
        }
    }

    /**
     * Line 33c, line 34 yes, a 3-prior-year average greater than $32,000,000, a tax shelter, line 42 below zero, a yes
     * on the line 35 screener, the section 471(c) method while Part III is required, and Part III after a no to
     * inventory all refuse the print. An unanswered line 33 stays incomplete and refuses too. No new path was added
     * to {@link PrintRefusingKnockouts#FACT_PATHS}.
     */
    @Test
    void partIIIStopsRefuseThePrint() throws Exception {
        refusesPartIII(partIII("20000.00", "other", false, false));
        refusesPartIII(partIII("20000.00", "cost", true, true));
        Map<String, String> overAverage = partIII("20000.00", "cost", false, false);
        overAverage.put(biz() + "writablePriorThreeYearAverageGrossReceipts", dollar("32000001.00"));
        refusesPartIII(overAverage);
        Map<String, String> shelter = partIII("20000.00", "cost", false, false);
        shelter.put(biz() + "isTaxShelter", bool(true));
        refusesPartIII(shelter);
        Map<String, String> negative = partIII("20000.00", "cost", false, false);
        negative.put(biz() + "writableInventoryAtEnd", dollar("100.00"));
        refusesPartIII(negative);
        Map<String, String> mismatch = partIII("20000.00", "cost", false, false);
        mismatch.put(biz() + "openingInventoryDiffersFromPriorClosing", bool(true));
        refusesPartIII(mismatch);
        refusesPartIII(partIII("20000.00", "nonincidentalMaterialsAndSupplies", false, false));

        Map<String, String> afterNo = partIII("20000.00", "cost", false, false);
        String b = biz();
        afterNo.put(b + "hasInventoryOrCogs", bool(false));
        afterNo.put(b + "writableInventoryAtBeginning", dollar("1000.00"));
        refusesPartIII(afterNo);

        Map<String, String> unanswered = partIII("20000.00", "cost", false, false);
        unanswered.remove(biz() + "inventoryAccountingMethod");
        assertTrue(
                PrintRefusingKnockouts.refusingPaths(graphOf(unanswered)).contains("/flowKnockoutScheduleCOutOfScope"),
                "unanswered line 33 refuses the print");
    }

    private static void refusesPartIII(Map<String, String> facts) throws Exception {
        assertTrue(
                PrintRefusingKnockouts.refusingPaths(graphOf(facts)).contains("/flowKnockoutScheduleCOutOfScope"),
                "print-refuse fact");
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(
                e.getBody().getProperties().get("blockingFacts") instanceof List<?> blocking
                        && blocking.contains("/flowKnockoutScheduleCOutOfScope"),
                "public print lists the Schedule C stop");
    }

    /**
     * Cost or lower of cost or market, line 34 no, and the seven Part III amounts. {@code withWorksheet} uses the
     * hand-worksheet dollars; otherwise every Part III amount is zero.
     */
    private static Map<String, String> partIII(
            String receipts, String method, boolean valuationChanged, boolean withWorksheet) {
        Map<String, String> facts = selfEmployed("20000.00", "20000.00", receipts);
        String b = biz();
        facts.put(b + "writableReturnsAndAllowances", dollar("0.00"));
        facts.put(b + "writableOtherIncome", dollar("0.00"));
        facts.put(b + "hasInventoryOrCogs", bool(true));
        for (String stop : new String[] {
            "hasCarTruckOrVehicleLoan",
            "hasDepreciationOrSection179",
            "hasDepletion",
            "hasVehicleMachineryEquipmentRent",
            "hasHomeOffice",
            "hasEnergyEfficientBuildingsDeduction"
        }) {
            facts.put(b + stop, bool(false));
        }
        facts.put(b + "hasDeductibleExpenses", bool(false));
        facts.put(
                b + "inventoryAccountingMethod",
                PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue(method, "/scheduleCInventoryMethodOptions"));
        facts.put(b + "inventoryValuationChanged", bool(valuationChanged));
        facts.put(b + "writablePriorThreeYearAverageGrossReceipts", dollar("0.00"));
        facts.put(b + "isTaxShelter", bool(false));
        facts.put(b + "openingInventoryDiffersFromPriorClosing", bool(false));
        facts.put(b + "writableInventoryAtBeginning", dollar(withWorksheet ? "1000.00" : "0.00"));
        facts.put(b + "writablePurchases", dollar(withWorksheet ? "5000.00" : "0.00"));
        facts.put(b + "writablePersonalUseWithdrawals", dollar(withWorksheet ? "200.00" : "0.00"));
        facts.put(b + "writableInventoryLabor", dollar(withWorksheet ? "300.00" : "0.00"));
        facts.put(b + "writableInventoryMaterials", dollar(withWorksheet ? "400.00" : "0.00"));
        facts.put(b + "writableInventoryOtherCosts", dollar(withWorksheet ? "50.00" : "0.00"));
        facts.put(b + "writableInventoryAtEnd", dollar(withWorksheet ? "1500.00" : "0.00"));
        return facts;
    }

    /**
     * Single expense total. 2026 draft Instructions for Form 461, PDF p. 2, Who Must File (ii): a loss of more than
     * $128,000 on Form 461, line 2 (Schedule 1 line 3). A loss of exactly $128,000 does not refuse the print.
     * $256,001 (single) and $512,001 (married filing jointly) do. 26 U.S.C. 461(l). Rev. Proc. 2025-32 §4.31, PDF
     * p. 23. No new print-refuse path was added.
     */
    @Test
    void singleExpenseTotalAboveTheForm461LineLimitRefusesPublicPrint() throws Exception {
        Map<String, String> atLimit = legacyLoss("170000.00", "128000.00", null);
        Graph allowed = graphOf(atLimit);
        assertEquals("128000.00", allowed.get("/form461SingleLineLossLimit").get().toString());
        assertEquals("256000.00", allowed.get("/excessBusinessLossThreshold").get().toString());
        assertEquals("-128000.00", allowed.get("/scheduleCNetProfitOrLoss").get().toString());
        assertEquals(Boolean.FALSE, allowed.get("/scheduleCNeedsForm461").get());
        assertFalse(
                PrintRefusingKnockouts.refusingPaths(allowed).contains("/flowKnockoutScheduleCOutOfScope"),
                "a loss of exactly $128,000 is not more than the Form 461 line 2 amount");
        generatePublicPrint(atLimit);

        assertForm461Refused(legacyLoss("170000.00", "128001.00", null));
        assertForm461Refused(legacyLoss("170000.00", "256001.00", null));

        Map<String, String> joint = legacyLoss("170000.00", "512001.00", "marriedFilingJointly");
        Graph mfj = graphOf(joint);
        assertEquals("512000.00", mfj.get("/excessBusinessLossThreshold").get().toString());
        assertEquals(Boolean.TRUE, mfj.get("/scheduleCNeedsForm461").get());
        assertForm461Refused(joint);
    }

    private static Map<String, String> legacyLoss(String wages, String expenses, String filingStatus) {
        Map<String, String> facts = selfEmployed(wages, wages, "0.00");
        facts.put(biz() + "writableTotalExpenses", dollar(expenses));
        if (filingStatus != null) {
            facts.put("/filingStatus", enumValue(filingStatus, "/filingStatusOptions"));
        }
        return facts;
    }

    private static void assertForm461Refused(Map<String, String> facts) throws Exception {
        assertTrue(
                PrintRefusingKnockouts.refusingPaths(graphOf(facts)).contains("/flowKnockoutScheduleCOutOfScope"),
                "Form 461 Who Must File stops public print");
        SubmissionBlockingFactsResponseStatusException refused =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(
                refused.getBody().getProperties().get("blockingFacts") instanceof List<?> blocking
                        && blocking.contains("/flowKnockoutScheduleCOutOfScope"),
                "public print lists the Schedule C stop");
    }

    private static String biz() {
        return "/scheduleCBusinesses/#" + ScheduleSETy2026PdfSmokeTest.BIZ + "/";
    }

    private static Graph graphOf(Map<String, String> extra) throws Exception {
        Map<String, FactTypeWithItem> facts =
                PrintRefusingKnockoutsTest.scheduleCReturn("20000.00", "20000.00", "0.00");
        ObjectMapper mapper = new ObjectMapper();
        for (var e : extra.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
    }

    /**
     * The final has no /TU tooltips. Part III lines 33-42 are the field names in configuration.yml, and PDF page 2
     * carries the printed captions those names fill.
     */
    @Test
    void partIIIFieldsAreNamedOnTheFinalAndThePageTextNamesTheLines() throws Exception {
        try (PDDocument doc =
                Loader.loadPDF(new ClassPathResource("pdf/2026/IRS1040SC/en/f1040sc.pdf").getContentAsByteArray())) {
            assertEquals(2, doc.getNumberOfPages(), "final has no draft cover sheet");
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "no draft cover");
            assertFalse(text.contains("DRAFT—NOT FOR FILING"), "no draft watermark");
            PDFTextStripper page2 = new PDFTextStripper();
            page2.setStartPage(2);
            page2.setEndPage(2);
            String partIII = page2.getText(doc);
            assertTrue(partIII.contains("Part III"), "PDF p. 2 is Part III");
            assertTrue(partIII.contains("Cost of Goods Sold"), "Part III caption");
            assertTrue(partIII.contains("Inventory at beginning of year"), "line 35 caption");
            assertTrue(partIII.contains("Purchases less cost of items withdrawn for personal use"), "line 36 caption");
            assertTrue(partIII.contains("Add lines 35 through 39"), "line 40 caption");
            assertTrue(partIII.contains("Subtract line 41 from line 40"), "line 42 caption");
            for (String name : List.of(
                    "topmostSubform[0].Page2[0].c2_1[0]",
                    "topmostSubform[0].Page2[0].c2_2[0]",
                    "topmostSubform[0].Page2[0].c2_3[0]",
                    "topmostSubform[0].Page2[0].c2_4[0]",
                    "topmostSubform[0].Page2[0].c2_4[1]",
                    "topmostSubform[0].Page2[0].f2_1[0]",
                    "topmostSubform[0].Page2[0].f2_2[0]",
                    "topmostSubform[0].Page2[0].f2_3[0]",
                    "topmostSubform[0].Page2[0].f2_4[0]",
                    "topmostSubform[0].Page2[0].f2_5[0]",
                    "topmostSubform[0].Page2[0].f2_6[0]",
                    "topmostSubform[0].Page2[0].f2_7[0]",
                    "topmostSubform[0].Page2[0].f2_8[0]")) {
                PDField field = doc.getDocumentCatalog().getAcroForm().getField(name);
                assertNotNull(field, name);
                assertTrue(
                        field.getAlternateFieldName() == null
                                || field.getAlternateFieldName().isBlank(),
                        name + " has no /TU tooltip");
            }
        }
    }

    private static boolean checked(Map<String, String> fields, String suffix) {
        String v = value(fields, suffix);
        return !v.isEmpty() && !"Off".equals(v);
    }

    private static void assertHeaderBlank(Map<String, String> sc) {
        blank(sc, "Page1[0].f1_3[0]", "A");
        blank(sc, "Page1[0].f1_4[0]", "B");
        blank(sc, "Page1[0].BoxD[0].f1_6[0]", "D");
        blank(sc, "Page1[0].f1_7[0]", "E street");
        blank(sc, "Page1[0].f1_8[0]", "E apt");
        blank(sc, "Page1[0].f1_9[0]", "E city");
        blank(sc, "Page1[0].f1_10[0]", "E state");
        blank(sc, "Page1[0].f1_11[0]", "E ZIP");
        blank(sc, "Page1[0].c1_1[0]", "F cash");
        blank(sc, "Page1[0].c1_1[1]", "F accrual");
        blank(sc, "Page1[0].c1_1[2]", "F other");
        blank(sc, "Page1[0].f1_12[0]", "F specify");
    }

    private static String scheduleCPage(PDDocument doc) throws Exception {
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            String page = stripper.getText(doc);
            if (page.contains(SC_FOOTER)) {
                return page;
            }
        }
        throw new AssertionError("Schedule C page missing");
    }

    static void header(
            Map<String, String> facts,
            String activity,
            String product,
            String code,
            boolean hasEin,
            String einPrefix,
            String einSerial,
            boolean atHome,
            String method) {
        String b = biz();
        facts.put(b + "principalBusinessActivity", string(activity));
        facts.put(b + "principalProductOrService", string(product));
        facts.put(b + "principalBusinessCode", string(code));
        facts.put(b + "hasEmployerIdNumber", bool(hasEin));
        if (hasEin) {
            facts.put(b + "employerIdNumber", ein(einPrefix, einSerial));
        }
        facts.put(b + "businessConductedAtHome", bool(atHome));
        facts.put(b + "accountingMethod", scheduleCEnum(method));
    }

    static String scheduleCEnum(String value) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EnumWrapper\",\"item\":{\"value\":[\"" + value
                + "\"],\"enumOptionsPath\":\"/scheduleCAccountingMethodOptions\"}}";
    }

    static String ein(String prefix, String serial) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.EinWrapper\",\"item\":{\"prefix\":\"" + prefix
                + "\",\"serial\":\"" + serial + "\"}}";
    }

    static String address(String street, String line2, String city, String state, String zip) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.AddressWrapper\",\"item\":{\"streetAddress\":\"" + street
                + "\",\"streetAddressLine2\":\"" + line2 + "\",\"city\":\"" + city + "\",\"postalCode\":\"" + zip
                + "\",\"stateOrProvence\":\"" + state + "\"}}";
    }
}
