package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.day;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.tin;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.BIZ;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.W2;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.amount;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.blank;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.selfEmployed;
import static gov.irs.directfile.api.pdf.ScheduleSETy2026PdfSmokeTest.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #17: 2026 draft Form 8995 (https://www.irs.gov/pub/irs-dft/f8995--dft.pdf, Created 5/1/26, SHA-256
 * d698390e2990de21b8df9ccb485f9309b817707d4871581118337bf7c1b14fd8) through the real PdfService. The cover sheet is
 * dropped. Column (c) is Schedule C net profit or loss minus that row's share of the deductible part of
 * self-employment tax, and the rows sum to line 2. Lines 18 and 19 print the absolute value inside the preprinted
 * parentheses. Sign and submit stay blocked: there is no MeF mapping.
 *
 * <p>Golden end-to-end scenarios (synthetic data; made-up name, test-only 900-area number), Florida, single, no
 * W-2 wages, standard deduction. Line 14 caps the deduction: Schedule C gross receipts $60,000 and expenses
 * $10,000. Loss year: gross receipts $1,000 and expenses $6,000, so line 16 is blank and line 18 carries $5,000.
 */
class Form8995Ty2026PdfSmokeTest {
    static final String FOOTER = "Form 8995 (2026)";
    static final String ROW_I = "Table[0].Row1i[0].";
    static final String ROW_II = "Table[0].Row1ii[0].";

    /** One Schedule C business, wages $0, Florida, so the public print is not a PA-40. */
    static Map<String, String> florida(String gross, String expenses) {
        Map<String, String> m = selfEmployed("0.00", "0.00", gross);
        m.put("/scheduleCBusinesses/#" + BIZ + "/writableTotalExpenses", dollar(expenses));
        m.put("/filerResidenceAndIncomeState", enumValue("fl", "/scopedStateOptions"));
        return m;
    }

    static String dollars(Graph graph, String path) {
        var r = graph.get(path);
        assertTrue(r.complete(), path + " complete, was " + r);
        return new BigDecimal(r.get().toString()).setScale(2).toPlainString();
    }

    static void submissionStillBlocked(Graph graph) {
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph), "Form 8995 prints");
        assertEquals(Boolean.TRUE, graph.get("/form8995Required").get());
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutForm8995WithoutTy2026Template").get());
        assertEquals(Boolean.TRUE, graph.get("/flowIsKnockedOut").get(), "no MeF mapping");
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutPaScheduleC").get());
    }

    /**
     * Line 14 caps line 17. Worked figures, whole dollars: net profit $50,000; deductible SE tax $3,533; line 2
     * $46,467; line 5 round(20% x 46,467) = $9,293; line 11 $46,467 − $16,100 = $30,367; line 14 round(20% x
     * 30,367) = $6,073. One business, so column (c) equals line 2. 26 U.S.C. 199A(a), (b)(2)(A).
     */
    @Test
    void line14CapsTheDeductionAndColumnCEqualsLine2() throws Exception {
        Map<String, String> facts = florida("60000.00", "10000.00");
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        assertEquals("46467.00", dollars(graph, "/form8995Line2"));
        assertEquals("9293.00", dollars(graph, "/form8995Line5"));
        assertEquals("9293.00", dollars(graph, "/form8995Line10"));
        assertEquals("30367.00", dollars(graph, "/form8995Line11"));
        assertEquals("6073.00", dollars(graph, "/form8995Line14"));
        assertEquals("6073.00", dollars(graph, "/form8995Line15"));
        assertEquals("400.00", dollars(graph, "/form8995Line16"));
        assertEquals("6073.00", dollars(graph, "/form8995Line17"));
        assertEquals(dollars(graph, "/form8995Line2"), dollars(graph, "/form8995Line1iQbi"));
        assertFalse(graph.get("/form8995Line1iiName").complete(), "no second business");
        assertEquals("0.00", dollars(graph, "/form8995Line18Pdf"));
        assertEquals("0.00", dollars(graph, "/form8995Line19Pdf"));
        submissionStillBlocked(graph);

        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            Map<String, String> f = fieldsOnPages(doc, FOOTER);
            assertFalse(f.isEmpty(), "Form 8995 printed");
            assertTrue(value(f, "Page1[0].f1_1[0]").toUpperCase().contains("EXAMPLETON"), "name");
            assertEquals("900000001", value(f, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "TIN");
            assertTrue(value(f, ROW_I + "f1_3[0]").contains("Synthetic Consulting"), "1(i)(a)");
            assertEquals("900000001", value(f, ROW_I + "f1_4[0]").replaceAll("\\D", ""), "1(i)(b)");
            amount(f, ROW_I + "f1_5[0]", 46467, "1(i)(c)");
            blank(f, ROW_II + "f1_6[0]", "1(ii)(a)");
            blank(f, ROW_II + "f1_7[0]", "1(ii)(b)");
            blank(f, ROW_II + "f1_8[0]", "1(ii)(c)");
            blank(f, "Table[0].Row1iii[0].f1_9[0]", "1(iii)");
            blank(f, "Table[0].Row1iv[0].f1_12[0]", "1(iv)");
            blank(f, "Table[0].Row1v[0].f1_15[0]", "1(v)");
            amount(f, "Page1[0].f1_18[0]", 46467, "2");
            blank(f, "Page1[0].f1_19[0]", "3");
            amount(f, "Page1[0].f1_20[0]", 46467, "4");
            amount(f, "Page1[0].f1_21[0]", 9293, "5");
            blank(f, "Page1[0].f1_22[0]", "6");
            blank(f, "Page1[0].f1_23[0]", "7");
            amount(f, "Page1[0].f1_24[0]", 0, "8");
            blank(f, "Page1[0].f1_25[0]", "9");
            amount(f, "Page1[0].f1_26[0]", 9293, "10");
            amount(f, "Page1[0].f1_27[0]", 30367, "11");
            blank(f, "Page1[0].f1_28[0]", "12");
            amount(f, "Page1[0].f1_29[0]", 30367, "13");
            amount(f, "Page1[0].f1_30[0]", 6073, "14");
            amount(f, "Page1[0].f1_31[0]", 6073, "15");
            amount(f, "Page1[0].f1_32[0]", 400, "16");
            amount(f, "Page1[0].f1_33[0]", 6073, "17");
            amount(f, "Page1[0].f1_34[0]", 0, "18");
            assertFalse(value(f, "Page1[0].f1_34[0]").startsWith("-"), "18 absolute");
            amount(f, "Page1[0].f1_35[0]", 0, "19");
            Map<String, String> f1040 = fieldsOnPages(doc, "Form 1040 (2026)");
            amount(f1040, "Page2[0].f2_05[0]", 6073, "Form 1040 line 13b");
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    /**
     * Two positive businesses. The larger net is the plug. Round(3,533 x 20,000 / 50,000) = 1,413, so column (c) is
     * 30,000 − 2,120 = 27,880 and 20,000 − 1,413 = 18,587, which sum to line 2. 26 U.S.C. 6102(a).
     */
    @Test
    void twoPositiveBusinessesSplitTheDeductibleSelfEmploymentTax() throws Exception {
        Map<String, String> facts = florida("30000.00", "0.00");
        String biz2 = "b0000000-5e00-4000-8000-000000000002";
        facts.put("/scheduleCBusinesses", collection(BIZ, biz2));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/filer", collectionItem(W2));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/businessName", string("Second Consulting"));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/writableGrossReceipts", dollar("20000.00"));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/writableTotalExpenses", dollar("0.00"));
        ScheduleSETy2026PdfSmokeTest.qbiAnswers(facts, biz2);
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        assertEquals("46467.00", dollars(graph, "/form8995Line2"));
        assertEquals("27880.00", dollars(graph, "/form8995Line1iQbi"));
        assertEquals("18587.00", dollars(graph, "/form8995Line1iiQbi"));
        submissionStillBlocked(graph);
    }

    /**
     * A loss year still prints Form 8995. Line 16 does not say "enter -0-", so $0 is blank. Line 18 carries the
     * loss forward inside preprinted parentheses (26 U.S.C. 199A(c)(2)). Form 1040 line 13b stays blank.
     */
    @Test
    void lossYearLeavesLine16BlankAndPrintsLine18Carryforward() throws Exception {
        Map<String, String> facts = florida("1000.00", "6000.00");
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        assertEquals("-5000.00", dollars(graph, "/form8995Line2"));
        assertEquals("-5000.00", dollars(graph, "/form8995Line1iQbi"));
        assertEquals("0.00", dollars(graph, "/form8995Line4"));
        assertEquals("0.00", dollars(graph, "/form8995Line16"));
        assertEquals("0.00", dollars(graph, "/form8995Line17"));
        assertEquals("-5000.00", dollars(graph, "/form8995Line18"));
        assertEquals("5000.00", dollars(graph, "/form8995Line18Pdf"));
        assertEquals("0.00", dollars(graph, "/form8995Line19Pdf"));
        submissionStillBlocked(graph);

        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            Map<String, String> f = fieldsOnPages(doc, FOOTER);
            String columnC = value(f, ROW_I + "f1_5[0]");
            assertTrue(columnC.startsWith("-"), "1(i)(c) is a loss: " + columnC);
            amount(f, ROW_I + "f1_5[0]", 5000, "1(i)(c)");
            String line2 = value(f, "Page1[0].f1_18[0]");
            assertTrue(line2.startsWith("-"), "line 2 is a loss: " + line2);
            amount(f, "Page1[0].f1_18[0]", 5000, "2");
            amount(f, "Page1[0].f1_20[0]", 0, "4");
            blank(f, "Page1[0].f1_32[0]", "16");
            blank(f, "Page1[0].f1_33[0]", "17");
            amount(f, "Page1[0].f1_34[0]", 5000, "18");
            assertFalse(value(f, "Page1[0].f1_34[0]").startsWith("-"), "18 absolute");
            amount(f, "Page1[0].f1_35[0]", 0, "19");
            Map<String, String> f1040 = fieldsOnPages(doc, "Form 1040 (2026)");
            blank(f1040, "Page2[0].f2_05[0]", "Form 1040 line 13b");
        }
    }

    /**
     * Lines 1(i) through 1(v) are the only rows. 2026 Instructions for Form 8995 draft, PDF p. 5, line 2: a return
     * with more than five trades or businesses must attach a statement. This package does not, so six businesses
     * refuse the print. Five still print.
     */
    @Test
    void moreThanFiveBusinessesRefusesThePrint() throws Exception {
        Map<String, String> five = businesses(5);
        Graph fiveGraph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(five));
        assertEquals(Boolean.FALSE, fiveGraph.get("/flowKnockoutForm8995MoreThanFiveBusinesses").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(fiveGraph), "five businesses still print");

        Map<String, String> six = businesses(6);
        Graph sixGraph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(six));
        assertEquals(Boolean.TRUE, sixGraph.get("/flowKnockoutForm8995MoreThanFiveBusinesses").get());
        assertEquals(Boolean.TRUE, sixGraph.get("/flowIsKnockedOut").get());
        assertEquals(
                List.of("/flowKnockoutForm8995MoreThanFiveBusinesses"),
                PrintRefusingKnockouts.refusingPaths(sixGraph));
        SubmissionBlockingFactsResponseStatusException e = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(six));
        assertEquals(
                List.of("/flowKnockoutForm8995MoreThanFiveBusinesses"),
                e.getBody().getProperties().get("blockingFacts"));
    }

    /**
     * Treas. Reg. 1.199A-3(b)(1)(vi): each trade is reduced by the deductible part of self-employment tax
     * attributable to that trade. The spouse's net profit is $350, under the $400 net-earnings threshold
     * (26 U.S.C. 1402(b)(2)), so that filer's deductible self-employment tax is $0 and column (c) stays $350.
     * Pooling both filers' deductible tax would reduce that row.
     */
    @Test
    void marriedFilingJointlySplitsDeductibleSelfEmploymentTaxPerFiler() throws Exception {
        Map<String, String> facts = florida("60000.00", "10000.00");
        String spouse = "859c03d1-af4a-447f-96aa-d19397048a48";
        String biz2 = "b0000000-5e00-4000-8000-000000000002";
        facts.put("/filingStatus", enumValue("marriedFilingJointly", "/filingStatusOptions"));
        facts.put("/maritalStatus", enumValue("married", "/maritalStatusOptions"));
        String s = "/filers/#" + spouse + "/";
        facts.put(s + "firstName", string("Blair"));
        facts.put(s + "writableMiddleInitial", string("R"));
        facts.put(s + "lastName", string("Exampleton"));
        facts.put(s + "tin", tin("900", "00", "0002"));
        facts.put(s + "dateOfBirth", day("1987-06-06"));
        facts.put(s + "isUsCitizenFullYear", bool(true));
        facts.put(s + "isBlind", bool(false));
        facts.put(s + "isDisabled", bool(false));
        facts.put(s + "isStudent", bool(false));
        facts.put(s + "occupation", string("writer"));
        facts.put(s + "canBeClaimed", bool(false));
        facts.put("/MFJRequiredToFile", bool(true));
        facts.put("/MFJDependentsFilingForCredits", bool(false));
        facts.put("/scheduleCBusinesses", collection(BIZ, biz2));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/filer", collectionItem(spouse));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/businessName", string("Spouse Consulting"));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/writableGrossReceipts", dollar("350.00"));
        facts.put("/scheduleCBusinesses/#" + biz2 + "/writableTotalExpenses", dollar("0.00"));
        ScheduleSETy2026PdfSmokeTest.qbiAnswers(facts, biz2);
        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        assertEquals("3533.00", dollars(graph, "/primaryFilerDeductibleSelfEmploymentTax"));
        assertEquals("0.00", dollars(graph, "/secondaryFilerDeductibleSelfEmploymentTax"));
        assertEquals("46467.00", dollars(graph, "/form8995Line1iQbi"));
        assertEquals("350.00", dollars(graph, "/form8995Line1iiQbi"));
        assertEquals("46817.00", dollars(graph, "/form8995Line2"));
        assertEquals(Boolean.TRUE, graph.get("/flowKnockoutScheduleCSpouseBusiness").get());
        assertEquals(List.of(), PrintRefusingKnockouts.refusingPaths(graph), "spouse Schedule C still prints");

        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            Map<String, String> f = fieldsOnPages(doc, FOOTER);
            amount(f, ROW_I + "f1_5[0]", 46467, "1(i)(c) primary");
            amount(f, ROW_II + "f1_8[0]", 350, "1(ii)(c) spouse, no SE tax");
            amount(f, "Page1[0].f1_18[0]", 46817, "2");
        }
    }

    /** count simple primary-filer Schedule C businesses, each with $1,000 of gross receipts and no expenses. */
    static Map<String, String> businesses(int count) {
        Map<String, String> facts = florida("1000.00", "0.00");
        String[] ids = new String[count];
        for (int i = 0; i < count; i++) {
            ids[i] = String.format("b0000000-5e00-4000-8000-00000000000%d", i + 1);
        }
        facts.put("/scheduleCBusinesses", collection(ids));
        for (int i = 0; i < count; i++) {
            String id = ids[i];
            facts.put("/scheduleCBusinesses/#" + id + "/filer", collectionItem(W2));
            facts.put("/scheduleCBusinesses/#" + id + "/businessName", string("Consulting " + (i + 1)));
            facts.put("/scheduleCBusinesses/#" + id + "/writableGrossReceipts", dollar("1000.00"));
            facts.put("/scheduleCBusinesses/#" + id + "/writableTotalExpenses", dollar("0.00"));
            ScheduleSETy2026PdfSmokeTest.qbiAnswers(facts, id);
        }
        return facts;
    }

    /**
     * Section 162 rental on Form 8995 line 1. Wages $50,000 plus rents $18,000 and expenses $6,000. Column (b) stays
     * blank. 26 U.S.C. 199A(c)(1), 1402(a)(1). Rev. Proc. 2025-32 §4.14 standard deduction $16,100. Line 11 is
     * $45,900. Line 5 is $2,400. Line 14 is $9,180. Line 17 is $2,400.
     */
    @Test
    void scheduleESection162RentalPrintsOnLine1WithTinBlank() throws Exception {
        String prop = "e0000000-5e00-4000-8000-000000000001";
        Map<String, String> facts = ScheduleBAndETy2026PdfSmokeTest.partI();
        facts.put("/filerResidenceAndIncomeState", enumValue("fl", "/scopedStateOptions"));
        facts.put("/scheduleERentalIsTradeOrBusiness", bool(true));
        facts.put("/scheduleEWritableRents", dollar("18000.00"));
        facts.put("/scheduleEWritableRoyalties", dollar("0.00"));
        facts.put("/scheduleEWritableExpenses", dollar("6000.00"));
        facts.put("/qbiHasPriorYearLossCarryforward", bool(false));
        facts.put("/qbiIsCooperativePatron", bool(false));
        facts.put("/scheduleEProperties", collection(prop));
        facts.put("/scheduleEPropertiesIsDone", bool(true));
        String p = "/scheduleEProperties/#" + prop + "/";
        facts.put(p + "propertyName", string("Oak Street Rental"));
        facts.put(p + "writableRents", dollar("18000.00"));
        facts.put(p + "writableRoyalties", dollar("0.00"));
        facts.put(p + "writableExpenses", dollar("6000.00"));
        facts.put(p + "materiallyParticipates", bool(true));
        facts.put(p + "reliesOnRp201938SafeHarbor", bool(false));
        facts.put(p + "isAggregated", bool(false));
        facts.put(p + "hasSuspendedPassiveLoss", bool(false));

        Graph graph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(facts));
        assertEquals("12000.00", dollars(graph, "/form8995Line2"));
        assertEquals("12000.00", dollars(graph, "/form8995Line1iQbi"));
        assertTrue(graph.get("/form8995Line1iTin").complete(), "column (b) is the filer's SSN");
        assertEquals("2400.00", dollars(graph, "/form8995Line5"));
        assertEquals("45900.00", dollars(graph, "/form8995Line11"));
        assertEquals("9180.00", dollars(graph, "/form8995Line14"));
        assertEquals("2400.00", dollars(graph, "/form8995Line15"));
        assertEquals("400.00", dollars(graph, "/form8995Line16"));
        assertEquals("2400.00", dollars(graph, "/form8995Line17"));
        assertEquals(Boolean.FALSE, graph.get("/flowKnockoutScheduleETradeOrBusinessQbi").get());
        submissionStillBlocked(graph);
        for (String stop : new String[] {
            "reliesOnRp201938SafeHarbor", "isAggregated", "hasSuspendedPassiveLoss"
        }) {
            Map<String, String> stopped = new java.util.HashMap<>(facts);
            stopped.put(p + stop, bool(true));
            Graph stoppedGraph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                    .getGraph(PrintRefusingKnockoutsTest.smoke(stopped));
            assertEquals(Boolean.TRUE, stoppedGraph.get("/flowKnockoutScheduleETradeOrBusinessQbi").get(), stop);
            if (stop.equals("isAggregated")) {
                assertFalse(stoppedGraph.get("/form8995Line1iTin").complete(), "aggregated line 1(b) blank");
            } else {
                assertTrue(stoppedGraph.get("/form8995Line1iTin").complete(), stop);
            }
        }
        Map<String, String> rentsOver = new java.util.HashMap<>(facts);
        rentsOver.put("/scheduleEWritableRents", dollar("10000.00"));
        Graph rentsOverGraph = CreditFormsTy2026PdfSmokeTest.factGraphService()
                .getGraph(PrintRefusingKnockoutsTest.smoke(rentsOver));
        assertEquals(Boolean.TRUE, rentsOverGraph.get("/flowKnockoutScheduleETradeOrBusinessQbi").get(), "rents");

        try (PDDocument doc = Loader.loadPDF(generatePublicPrint(facts))) {
            Map<String, String> f = fieldsOnPages(doc, FOOTER);
            assertTrue(value(f, ROW_I + "f1_3[0]").contains("Oak Street Rental"), "1(i)(a)");
            assertEquals("900000001", value(f, ROW_I + "f1_4[0]").replaceAll("\\D", ""), "1(i)(b)");
            amount(f, ROW_I + "f1_5[0]", 12000, "1(i)(c)");
            amount(f, "Page1[0].f1_18[0]", 12000, "2");
            amount(f, "Page1[0].f1_33[0]", 2400, "17");
            Map<String, String> f1040 = fieldsOnPages(doc, "Form 1040 (2026)");
            amount(f1040, "Page2[0].f2_05[0]", 2400, "Form 1040 line 13b");
        }
    }
}
