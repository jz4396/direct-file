package gov.irs.directfile.api.pdf;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.models.FactTypeWithItem;
import gov.irs.factgraph.Graph;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.selfEmployed;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #239: 2026 draft Schedule C (https://www.irs.gov/pub/irs-dft/f1040sc--dft.pdf, created 5/15/26, SHA-256
 * 287b4510dd847c11f6cbbcc98fee05ac5ff187cc18e1413f8759a4a7cd802224) through the real PdfService. Draft-based field
 * map: re-verify when the final form is released (#124).
 *
 * <p>Golden end-to-end scenario (synthetic data): single, one W-2 of $170,000 and one Schedule C business with
 * $30,000 of gross receipts and no expenses. 2026 draft Schedule C line 31: "If a profit, enter on both Schedule 1
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
        }
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
        }
    }

    /**
     * Simple Part III. 2026 draft Schedule C, PDF p. 3: line 36 is purchases less personal use, line 40 adds lines 35
     * through 39, and line 42 (line 40 minus line 41) is line 4. Hand worksheet: 1,000 + (5,000 − 200) + 300 + 400 +
     * 50 = 6,550; 6,550 − 1,500 = 5,050. Line 7 and line 31 are 14,950. Rev. Proc. 2025-32 §4.30 does not stop line 1
     * of $20,000. Form 8995 still has no 2026 template, so the public package is refused for that path only.
     */
    @Test
    void simplePartIIIPrintsLine4AndDoesNotUseTheInventoryStop() throws Exception {
        Map<String, String> facts = partIII("20000.00", "cost", false, true);
        Graph graph = graphOf(facts);
        assertEquals(
                List.of("/flowKnockoutForm8995WithoutTy2026Template"),
                PrintRefusingKnockouts.refusingPaths(graph),
                "supported Part III is not /flowKnockoutScheduleCOutOfScope");
        SubmissionBlockingFactsResponseStatusException refused = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(
                List.of("/flowKnockoutForm8995WithoutTy2026Template"),
                refused.getBody().getProperties().get("blockingFacts"));

        byte[] bytes = generate(facts);
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
                PrintRefusingKnockouts.refusingPaths(graphOf(unanswered))
                        .contains("/flowKnockoutScheduleCOutOfScope"),
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
    private static Map<String, String> partIII(String receipts, String method, boolean valuationChanged, boolean withWorksheet) {
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

    private static String biz() {
        return "/scheduleCBusinesses/#" + ScheduleSETy2026PdfSmokeTest.BIZ + "/";
    }

    private static Graph graphOf(Map<String, String> extra) throws Exception {
        Map<String, FactTypeWithItem> facts = PrintRefusingKnockoutsTest.scheduleCReturn("20000.00", "20000.00", "0.00");
        ObjectMapper mapper = new ObjectMapper();
        for (var e : extra.entrySet()) {
            facts.put(e.getKey(), mapper.readValue(e.getValue(), FactTypeWithItem.class));
        }
        return CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(facts);
    }

    private static boolean checked(Map<String, String> fields, String suffix) {
        String v = value(fields, suffix);
        return !v.isEmpty() && !"Off".equals(v);
    }
}
