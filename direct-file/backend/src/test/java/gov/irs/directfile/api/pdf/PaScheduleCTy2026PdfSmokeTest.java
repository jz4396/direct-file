package gov.irs.directfile.api.pdf;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactTypeWithItem;

import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.is;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.paResident;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.selfEmployed;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * PA-40 Schedule C (PA-40 C (EX) 03-26, SHA-256 520555065fec4b85f757fa5cd2f3564c507464954553e376d1922bc7a75b8098)
 * through the real PdfService. Full-year line-item businesses print the schedule. Meals are deducted at 100 percent
 * (line 31). Federal line 25 utilities print on line 32 only. A single-expense-total business and a part-year return
 * still refuse public print and do not emit the schedule.
 *
 * <p>72 P.S. §7303(a)(2). PA-40 IN (2025) p. 17, LINE 4. PA-40 C (EX) 03-26 lines 31, 32, and 39.
 */
class PaScheduleCTy2026PdfSmokeTest {
    static final String PAGE1 = "2503110054";
    static final String PAGE2 = "2503210052";
    static final String BIZ = ScheduleSETy2026PdfSmokeTest.BIZ;
    static final String BIZ2 = "b0000000-5e00-4000-8000-000000000002";

    /** Full-year PA resident, one line-item Schedule C with the given receipts and no expenses. */
    static Map<String, String> lineItemPa(String wages, String receipts) {
        Map<String, String> m = selfEmployed(wages, wages, receipts);
        m.putAll(paResident());
        m.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableWages", dollar(wages));
        m.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableOasdiWages", dollar(wages));
        m.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableMedicareWages", dollar(wages));
        m.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableStateWages", dollar(wages));
        m.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableStateWithholding", dollar("1535.00"));
        m.put("/filerResidenceAndIncomeState", enumValue("pa", "/scopedStateOptions"));
        m.put("/paSchoolDistrictCode", string("22275"));
        m.put("/paHasScheduleCTaxShelter", bool(false));
        m.put("/form8949Transactions", PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION);
        answeredStops(m);
        m.put(biz() + "writableReturnsAndAllowances", dollar("0.00"));
        m.put(biz() + "writableOtherIncome", dollar("0.00"));
        m.put(biz() + "otherIncomeNeedsAnotherForm", bool(false));
        m.put(biz() + "hasDeductibleExpenses", bool(false));
        return m;
    }

    @Test
    void fullYearLineItemPrintsScheduleCAndLiftsTheKnockout() throws Exception {
        Map<String, String> facts = lineItemPa("50000.00", "20000.00");
        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals(
                Boolean.FALSE, graph.get("/scheduleCHasLegacyExpenseBucket").get());
        assertEquals("20000.00", graph.get("/paLine4").get().toString());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PAGE1);
            assertFalse(p1.isEmpty(), "PA-40 C page 1 printed");
            assertTrue(isUpper(p1, "Name of Owner as shown PA tax return").contains("EXAMPLETON"), "owner");
            assertEquals("900000001", fieldDigits(p1, "Owner's Social Security Number"), "SSN");
            assertEquals("SYNTHETIC CONSULTING", isUpper(p1, "Business Name"), "business name");
            is(p1, "Year", "26", "year");
            is(p1, "1. a Gross receipts or sales", "20,000.00", "1a");
            blank(p1, "1. b. Returns & allowances", "1b zero");
            is(p1, "1. c. Balance", "20,000.00", "1c");
            blank(p1, "2. Cost", "no inventory");
            is(p1, "5. Total Income", "20,000.00", "line 5");
            blank(p1, "30. Telephone", "telephone stays blank");
            blank(p1, "32. Utilities", "utilities not collected");
            blank(p1, "38. Total Expenses. Add Lines 6 through 37", "no expenses");
            is(p1, "39. Net Profit of Loss", "20,000.00", "line 39");
            is(p1, "41. Loss", "Off", "profit");
            is(p1, "E. Method(s)", "Off", "no inventory method");
            is(p1, "C2. Yes/No", "4", "office in home: No");

            Map<String, String> pa = fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            is(
                    pa,
                    "4. Net Income or Loss from the Operation of a Business, etc",
                    "20,000.00",
                    "PA-40 line 4 = line 39");
        }
    }

    /**
     * Receipts $20,000; advertising $100; utilities $75; mortgage interest $30; other interest $10; meals $400;
     * Part V bank fees $40. Federal line 28 is $455 (meals at 50% = $200). PA line 38 is $655 and line 39 is $19,345.
     * Line 32 is utilities only. Line 30 stays blank. Line 31 is travel $0 plus meals at 100% ($400).
     */
    @Test
    void mealsAtOneHundredPercentAndUtilitiesOnLine32() throws Exception {
        Map<String, String> facts = lineItemPa("50000.00", "20000.00");
        String b = biz();
        facts.put(b + "hasDeductibleExpenses", bool(true));
        facts.put(
                b + "expenseLinesChosen",
                "{\"$type\":\"gov.irs.factgraph.persisters.MultEnumWrapper\",\"item\":{\"enumOptionsPath\":\"/scheduleCExpenseLineOptions\",\"values\":[\"advertising\",\"utilities\",\"meals\",\"mortgageInterest\",\"otherInterest\",\"otherExpenses\"]}}");
        facts.put(b + "writableAdvertising", dollar("100.00"));
        facts.put(b + "writableUtilities", dollar("75.00"));
        facts.put(b + "writableMeals", dollar("400.00"));
        facts.put(b + "mealsAreStandardHalfLimit", bool(true));
        facts.put(b + "writableMortgageInterest", dollar("30.00"));
        facts.put(b + "writableOtherInterest", dollar("10.00"));
        facts.put(b + "interestNeedsAllocation", bool(false));
        facts.put(b + "partVIncludesNewAmortization", bool(false));
        facts.put(b + "hasAnotherPartVExpense", bool(false));
        facts.put(b + "partV1Description", string("Bank fees"));
        facts.put(b + "partV1Amount", dollar("40.00"));

        Graph graph = graph(facts);
        assertEquals("200.00", graph.get(b + "line24bDeductibleMeals").get().toString());
        assertEquals("200.00", graph.get(b + "paMealsAddBack").get().toString());
        assertEquals("400.00", graph.get(b + "paTravelAndEntertainment").get().toString());
        assertEquals("40.00", graph.get(b + "paInterest").get().toString());
        assertEquals("655.00", graph.get(b + "paTotalExpenses").get().toString());
        assertEquals("19345.00", graph.get(b + "paNetProfitOrLoss").get().toString());
        assertEquals("19345.00", graph.get("/paLine4").get().toString());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PAGE1);
            is(p1, "6. Advertising", "100.00", "line 6");
            is(p1, "18. Interest on business indebtedness", "40.00", "line 18 = 16a + 16c");
            blank(p1, "30. Telephone", "line 30");
            is(p1, "31. Travel and entertainment", "400.00", "line 31 meals at 100%");
            is(p1, "32. Utilities", "75.00", "line 32 utilities only");
            is(p1, "37a. Other expenses (specify)", "BANK FEES", "line 37a");
            is(p1, "37a-2. Other expenses/amount", "40.00", "line 37a amount");
            is(p1, "37. Total other expenses", "40.00", "line 37");
            is(p1, "38. Total Expenses. Add Lines 6 through 37", "655.00", "line 38");
            is(p1, "39. Net Profit of Loss", "19,345.00", "line 39");
            is(p1, "41. Loss", "Off", "profit");

            Map<String, String> pa = fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            is(pa, "4. Net Income or Loss from the Operation of a Business, etc", "19,345.00", "PA-40 line 4");

            Map<String, String> federal = fieldsOnPages(doc, ScheduleCTy2026PdfSmokeTest.SC_FOOTER);
            amount(federal, "f1_41[0]", 200, "federal line 24b stays at 50%");
        }
    }

    @Test
    void partIIIPrintsScheduleC1AndAgreesWithLine4() throws Exception {
        Map<String, String> facts = lineItemPa("50000.00", "20000.00");
        String b = biz();
        facts.put(b + "hasInventoryOrCogs", bool(true));
        facts.put(b + "inventoryAccountingMethod", enumValue("cost", "/scheduleCInventoryMethodOptions"));
        facts.put(b + "inventoryValuationChanged", bool(false));
        facts.put(b + "isTaxShelter", bool(false));
        facts.put(b + "openingInventoryDiffersFromPriorClosing", bool(false));
        facts.put(b + "writablePriorThreeYearAverageGrossReceipts", dollar("0.00"));
        facts.put(b + "writableInventoryAtBeginning", dollar("1000.00"));
        facts.put(b + "writablePurchases", dollar("5000.00"));
        facts.put(b + "writablePersonalUseWithdrawals", dollar("200.00"));
        facts.put(b + "writableInventoryLabor", dollar("300.00"));
        facts.put(b + "writableInventoryMaterials", dollar("400.00"));
        facts.put(b + "writableInventoryOtherCosts", dollar("50.00"));
        facts.put(b + "writableInventoryAtEnd", dollar("1500.00"));

        Graph graph = graph(facts);
        assertEquals("5050.00", graph.get(b + "line42CostOfGoodsSold").get().toString());
        assertEquals("14950.00", graph.get("/paLine4").get().toString());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleC").get());

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> p1 = fieldsOnPages(doc, PAGE1);
            is(p1, "E. Method(s)", "1", "cost");
            is(p1, "C1. Yes/No", "2", "inventory change: No");
            is(p1, "2. Cost", "5,050.00", "line 2");
            is(p1, "3. Gross profit", "14,950.00", "line 3");
            is(p1, "39. Net Profit of Loss", "14,950.00", "line 39");
            Map<String, String> p2 = fieldsOnPages(doc, PAGE2);
            is(p2, "Schedule C-1 1. Inventory", "1,000.00", "C-1 line 1");
            is(p2, "2a. Purchases", "5,000.00", "C-1 line 2a");
            is(p2, "2b. Cost of items withdrawn for personal use", "200.00", "C-1 line 2b");
            is(p2, "2c. Balance", "4,800.00", "C-1 line 2c");
            is(p2, "3. Cost of labor", "300.00", "C-1 line 3");
            is(p2, "4. Materials & supplies", "400.00", "C-1 line 4");
            is(p2, "5. Other costs", "50.00", "C-1 line 5");
            is(p2, "6. Add Lines 1, 2c, 3, 4, &  5", "6,550.00", "C-1 line 6");
            is(p2, "7. Inventory at end of year", "1,500.00", "C-1 line 7");
            is(p2, "8. Cost of goods sold and or operations", "5,050.00", "C-1 line 8");
            Map<String, String> pa = fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            is(pa, "4. Net Income or Loss from the Operation of a Business, etc", "14,950.00", "PA-40 line 4");
        }
    }

    @Test
    void legacySingleTotalRefusesPublicPrintAndOmitsTheSchedule() throws Exception {
        Map<String, String> facts = selfEmployed("50000.00", "50000.00", "20000.00");
        facts.putAll(paResident());
        facts.put("/filerResidenceAndIncomeState", enumValue("pa", "/scopedStateOptions"));
        facts.put("/paSchoolDistrictCode", string("22275"));
        facts.put("/paHasScheduleCTaxShelter", bool(false));
        facts.put("/form8949Transactions", PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION);
        facts.put("/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableStateWages", dollar("50000.00"));
        facts.put(
                "/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/writableStateWithholding", dollar("1535.00"));

        Graph graph = graph(facts);
        assertEquals(Boolean.TRUE, graph.get("/scheduleCHasLegacyExpenseBucket").get());
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals("20000.00", graph.get("/paLine4").get().toString());
        assertEquals(List.of("/flowKnockoutPaScheduleC"), PrintRefusingKnockouts.refusingPaths(graph));

        SubmissionBlockingFactsResponseStatusException refused =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(
                List.of("/flowKnockoutPaScheduleC"),
                refused.getBody().getProperties().get("blockingFacts"));

        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertFalse(new PDFTextStripper().getText(doc).contains(PAGE1), "legacy path does not print PA-40 C");
        }
    }

    /**
     * Two full-year line-item businesses. Each prints its own PA-40 C. PA-40 line 4 is the sum of the two line 39
     * amounts ($20,000 + $8,000). 72 P.S. §7303(a)(2). PA-40 IN (2025) p. 17, LINE 4.
     */
    @Test
    void twoLineItemBusinessesPrintTwoSchedulesAndSumLine4() throws Exception {
        Map<String, String> facts = lineItemPa("50000.00", "20000.00");
        facts.put("/scheduleCBusinesses", collection(BIZ, BIZ2));
        String second = "/scheduleCBusinesses/#" + BIZ2 + "/";
        facts.put(second + "filer", Form8959Form8960Ty2026PdfSmokeTest.collectionItem(ScheduleSETy2026PdfSmokeTest.W2));
        facts.put(second + "businessName", string("Second Consulting"));
        facts.put(second + "writableGrossReceipts", dollar("8000.00"));
        facts.put(second + "writableTotalExpenses", dollar("0.00"));
        ScheduleSETy2026PdfSmokeTest.qbiAnswers(facts, BIZ2);
        answeredStops(facts, BIZ2);
        facts.put(second + "writableReturnsAndAllowances", dollar("0.00"));
        facts.put(second + "writableOtherIncome", dollar("0.00"));
        facts.put(second + "otherIncomeNeedsAnotherForm", bool(false));
        facts.put(second + "hasDeductibleExpenses", bool(false));

        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get("/scheduleCHasLegacyExpenseBucket").get());
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals("20000.00", graph.get(biz() + "paNetProfitOrLoss").get().toString());
        assertEquals("8000.00", graph.get(second + "paNetProfitOrLoss").get().toString());
        assertEquals("28000.00", graph.get("/paLine4").get().toString());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph));

        byte[] bytes = generatePublicPrint(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            List<Map<String, String>> schedules = pagesWith(doc, PAGE1);
            assertEquals(2, schedules.size(), "one PA-40 C page 1 per line-item business");
            Map<String, String> first = pageContaining(schedules, "SYNTHETIC CONSULTING");
            Map<String, String> other = pageContaining(schedules, "SECOND CONSULTING");
            is(first, "1. a Gross receipts or sales", "20,000.00", "first 1a");
            is(first, "39. Net Profit of Loss", "20,000.00", "first line 39");
            is(other, "1. a Gross receipts or sales", "8,000.00", "second 1a");
            is(other, "39. Net Profit of Loss", "8,000.00", "second line 39");

            Map<String, String> pa = fieldsOnPages(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1);
            is(pa, "4. Net Income or Loss from the Operation of a Business, etc", "28,000.00", "PA-40 line 4 sums both");
        }
    }

    /**
     * One line-item business and one single-expense-total business. Line 4 is one sum, so the legacy business keeps
     * /flowKnockoutPaScheduleC true and public print refuses.
     */
    @Test
    void mixedLegacyAndLineItemStaysKnockedOut() throws Exception {
        Map<String, String> facts = lineItemPa("50000.00", "20000.00");
        facts.put("/scheduleCBusinesses", collection(BIZ, BIZ2));
        String second = "/scheduleCBusinesses/#" + BIZ2 + "/";
        facts.put(second + "filer", Form8959Form8960Ty2026PdfSmokeTest.collectionItem(ScheduleSETy2026PdfSmokeTest.W2));
        facts.put(second + "businessName", string("Legacy Shop"));
        facts.put(second + "writableGrossReceipts", dollar("5000.00"));
        facts.put(second + "writableTotalExpenses", dollar("1000.00"));
        ScheduleSETy2026PdfSmokeTest.qbiAnswers(facts, BIZ2);

        Graph graph = graph(facts);
        assertEquals(Boolean.FALSE, graph.get(biz() + "usesLegacyExpenseBucket").get());
        assertEquals(Boolean.TRUE, graph.get(second + "usesLegacyExpenseBucket").get());
        assertEquals(Boolean.TRUE, graph.get("/scheduleCHasLegacyExpenseBucket").get());
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals(List.of("/flowKnockoutPaScheduleC"), PrintRefusingKnockouts.refusingPaths(graph));

        SubmissionBlockingFactsResponseStatusException refused =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(
                List.of("/flowKnockoutPaScheduleC"),
                refused.getBody().getProperties().get("blockingFacts"));
    }

    @Test
    void partYearLineItemDoesNotPrintTheSchedule() throws Exception {
        Map<String, String> facts = lineItemPa("30000.00", "20000.00");
        facts.put("/filerResidenceAndIncomeState", enumValue("moreThanOne", "/scopedStateOptions"));
        facts.put("/paPartYearMove", enumValue("paToFl", "/paPartYearMoveOptions"));
        facts.put("/paPartYearMoveDate", PaPit40ScheduleSpTy2026PdfSmokeTest.day("2026-07-01"));
        facts.put(
                "/formW2s/#" + PaPit40ScheduleSpTy2026PdfSmokeTest.W2 + "/paPartYearW2State",
                enumValue("pa", "/paPartYearW2StateOptions"));
        facts.put("/paPartYearHasNonresidentPaSourcePay", bool(false));

        Graph graph = graph(facts);
        assertEquals(
                Boolean.FALSE, graph.get("/scheduleCHasLegacyExpenseBucket").get());
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutPaScheduleC").get());
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutPaUnsupportedIncome").get());
        SubmissionBlockingFactsResponseStatusException refused =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertTrue(
                refused.getBody().getProperties().get("blockingFacts") instanceof List<?> blocking
                        && blocking.contains("/flowKnockoutPaScheduleC")
                        && blocking.contains("/flowKnockoutPaUnsupportedIncome"),
                "part-year Schedule C refuses the print");

        // Fill the other forms anyway. The schedule itself stays out because the return is not full-year.
        byte[] bytes = fillIgnoring(facts, "/flowKnockoutPaUnsupportedIncome");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertFalse(new PDFTextStripper().getText(doc).contains(PAGE1), "part-year path does not print PA-40 C");
        }
    }

    /** Field-map fill that also ignores {@code extraKnockout}, which {@code generate} would still refuse. */
    private static byte[] fillIgnoring(Map<String, String> extra, String extraKnockout) throws Exception {
        FactGraphService fgs = CreditFormsTy2026PdfSmokeTest.factGraphService();
        Map<String, FactTypeWithItem> facts = PrintRefusingKnockoutsTest.smoke(extra);
        TaxReturn taxReturn = new TaxReturn();
        taxReturn.setTaxYear(2026);
        taxReturn.setFactsWithoutDirtyingEntity(facts);
        List<String> checks = new ArrayList<>(PrintRefusingKnockoutsTest.FIELD_MAP_CHECKS);
        checks.remove(extraKnockout);
        try (InputStream in =
                CreditFormsTy2026PdfSmokeTest.pdfService(fgs).getTaxReturn("en", taxReturn, false, checks)) {
            return in.readAllBytes();
        }
    }

    private static void answeredStops(Map<String, String> m) {
        answeredStops(m, BIZ);
    }

    private static void answeredStops(Map<String, String> m, String id) {
        String base = "/scheduleCBusinesses/#" + id + "/";
        for (String stop : new String[] {
            "hasInventoryOrCogs",
            "hasCarTruckOrVehicleLoan",
            "hasDepreciationOrSection179",
            "hasDepletion",
            "hasVehicleMachineryEquipmentRent",
            "hasHomeOffice",
            "hasEnergyEfficientBuildingsDeduction"
        }) {
            m.put(base + stop, bool(false));
        }
    }

    /** One field map per PDF page whose text contains {@code marker}. A second copy's fields may be renamed. */
    private static List<Map<String, String>> pagesWith(PDDocument doc, String marker) throws Exception {
        List<Map<String, String>> pages = new ArrayList<>();
        PDFTextStripper stripper = new PDFTextStripper();
        var form = doc.getDocumentCatalog().getAcroForm();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            if (!stripper.getText(doc).contains(marker)) {
                continue;
            }
            Set<COSBase> widgets = new HashSet<>();
            for (PDAnnotation annotation : doc.getPage(i).getAnnotations()) {
                if (annotation instanceof PDAnnotationWidget widget) {
                    widgets.add(widget.getCOSObject());
                }
            }
            Map<String, String> values = new HashMap<>();
            for (PDField field : form.getFieldTree()) {
                if (field instanceof PDTerminalField terminal) {
                    for (PDAnnotationWidget widget : terminal.getWidgets()) {
                        if (widgets.contains(widget.getCOSObject())) {
                            String value = field.getValueAsString();
                            values.put(field.getFullyQualifiedName(), value == null ? "" : value.trim());
                        }
                    }
                }
            }
            pages.add(values);
        }
        return pages;
    }

    private static Map<String, String> pageContaining(List<Map<String, String>> pages, String needle) {
        Map<String, String> found = null;
        for (Map<String, String> page : pages) {
            boolean hit = page.values().stream().anyMatch(value -> value.toUpperCase().contains(needle));
            if (!hit) {
                continue;
            }
            assertTrue(found == null, "one PA-40 C page contains " + needle);
            found = page;
        }
        assertTrue(found != null, "a PA-40 C page contains " + needle);
        return found;
    }

    private static String biz() {
        return "/scheduleCBusinesses/#" + BIZ + "/";
    }

    private static Graph graph(Map<String, String> extra) throws Exception {
        return CreditFormsTy2026PdfSmokeTest.factGraphService().getGraph(PrintRefusingKnockoutsTest.smoke(extra));
    }

    private static String isUpper(Map<String, String> fields, String name) {
        return PaPit40ScheduleSpTy2026PdfSmokeTest.field(fields, name);
    }

    private static String fieldDigits(Map<String, String> fields, String name) {
        return isUpper(fields, name).replaceAll("\\D", "");
    }
}
