package gov.irs.directfile.api.pdf;

import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.selfEmployed;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
}
