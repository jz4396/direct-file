package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
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

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.highIncomeScenario;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION;
import static gov.irs.directfile.api.pdf.PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.INTEREST_SUBTRACTION_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_B_PART_III_PRINT_REFUSE;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_DEPRECIATION_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_LOSS_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_PART_III_MORE_THAN_TWO_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_PART_II_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_PART_II_MORE_THAN_FOUR_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_PERSONAL_USE_KNOCKOUT;
import static gov.irs.directfile.api.pdf.PrintRefusingKnockoutsTest.SCHEDULE_E_SUBSTANTIAL_SERVICES_KNOCKOUT;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static gov.irs.directfile.api.pdf.Schedules123Ty2026PdfSmokeTest.standardDeduction;
import static gov.irs.directfile.api.pdf.Ty2026PdfPackageTest.checked;
import static gov.irs.directfile.api.pdf.Ty2026PdfPackageTest.syntheticFiler;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #17: 2026 draft Schedule B (https://www.irs.gov/pub/irs-dft/f1040sb--dft.pdf, created 4/7/26) and Schedule E
 * (https://www.irs.gov/pub/irs-dft/f1040se--dft.pdf, created 5/6/26) end-to-end through the real PdfService, fact
 * dictionary and application.yaml for tax year 2026. Draft-based field maps: re-verify when the final forms are
 * released.
 *
 * <p>Golden end-to-end scenario (synthetic data; made-up name, test-only 900-area SSN). Schedule B: one 1099-INT of
 * $10,000, so line 2 and line 4 are $10,000 (line 3, Form 8815, is not claimed). Schedule E Part I: $12,000 rents +
 * $500 royalties − $4,000 expenses = $8,500 (26 U.S.C. 61(a)(5), 61(a)(6), 212). Wages stay at $50,000 so modified
 * AGI is under the 26 U.S.C. 1411(b) threshold and Form 8960 does not stop the return. A supported Part II K-1 of
 * $12,000 makes line 41 and Schedule 1 line 5 $20,500 (26 U.S.C. 702(a)). A supported Part III estate, box 6
 * $9,000 in column (f), makes line 37 $9,000 and, with Part I, line 41 $17,500 (26 U.S.C. 652(a), 662(a)).
 * /scheduleEHasPartIVIncome is answered no on every printable fixture. A REMIC yes refuses the print even when
 * the K-1 answer is no (26 U.S.C. 860C).
 */
class ScheduleBAndETy2026PdfSmokeTest {
    static final String W2 = Form8959Form8960Ty2026PdfSmokeTest.W2;
    static final String INT = Form8959Form8960Ty2026PdfSmokeTest.INT;
    static final String K1 = "b7e1c2a0-1111-4222-8333-444455556666";
    static final String ESTATE = "c8f2d3b1-2222-4333-8444-555566667777";
    static final String ESTATE_2 = "c8f2d3b1-2222-4333-8444-555566667778";
    static final String SB_FOOTER = "Schedule B (Form 1040) 2026";
    static final String SE_FOOTER = "Schedule E (Form 1040) 2026";
    static final String SB_TEMPLATE = "pdf/2026/IRS1040SB/en/f1040sb--dft.pdf";
    static final String SE_TEMPLATE = "pdf/2026/IRS1040SE/en/f1040se--dft.pdf";

    /** Part I only, K-1 answered no, wages $50,000, no capital-gain sales. Under the NIIT threshold. */
    static Map<String, String> partI() {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("50000.00"));
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar("50000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("50000.00"));
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/soldCapitalAssets", bool(false));
        standardDeduction(m);
        partIScreeners(m, "12000.00", "500.00", "4000.00");
        m.put("/scheduleEHasPartIIIncome", bool(false));
        // #257: the Part II stop is also true when the REMIC answer is yes, even if the K-1 answer is no.
        // An unanswered REMIC question leaves that stop incomplete, so a printable fixture answers it no.
        m.put("/scheduleEHasPartIIIIncome", bool(false));
        m.put("/scheduleEHasPartIVIncome", bool(false));
        return syntheticFiler(m);
    }

    static void partIScreeners(Map<String, String> m, String rents, String royalties, String expenses) {
        m.put("/hadScheduleEIncome", bool(true));
        m.put("/scheduleEWritableRents", dollar(rents));
        m.put("/scheduleEWritableRoyalties", dollar(royalties));
        m.put("/scheduleEWritableExpenses", dollar(expenses));
        m.put("/scheduleEAnyPropertyLoss", bool(false));
        m.put("/scheduleEHasDepreciation", bool(false));
        m.put("/scheduleEHasPersonalUse", bool(false));
        m.put("/scheduleEProvidesSubstantialServices", bool(false));
        m.put("/scheduleERentalIsTradeOrBusiness", bool(false));
    }

    /** Supported Part II entity: domestic, box 1 only, material participation, every other box zero. */
    static void k1(Map<String, String> m, String id, String name, String type, String box1) {
        String p = "/scheduleEK1s/#" + id + "/";
        m.put(p + "entityName", string(name));
        m.put(p + "entityType", enumValue(type, "/scheduleEK1EntityTypeOptions"));
        m.put(p + "isForeignPartnership", bool(false));
        m.put(p + "isPubliclyTradedPartnership", bool(false));
        m.put(p + "isTradingBusiness", bool(false));
        m.put(p + "box1", dollar(box1));
        m.put(p + "materiallyParticipates", bool(true));
        m.put(p + "box14CodeA", dollar("0.00"));
        m.put(p + "box14CodeAWasReduced", bool(false));
        m.put(p + "box14CodeAIsFarm", bool(false));
        m.put(p + "box14CodeANotLimitedPartnerAmount", bool(false));
        m.put(p + "hasQbiStatement", bool(false));
        m.put(p + "hasOtherK1Amount", bool(false));
        m.put(p + "basisComputationRequired", bool(false));
        m.put(p + "anyAmountNotAtRisk", bool(false));
        // Form 1065 boxes 5, 6a, and 6b and Form 1120-S boxes 4, 5a, and 5b are Form 1040 lines 2b, 3b, and 3a.
        // A supported entity has them at zero. 26 U.S.C. 469(e)(1)(A).
        m.put(p + "form1065Box5", dollar("0.00"));
        m.put(p + "form1065Box6a", dollar("0.00"));
        m.put(p + "form1065Box6b", dollar("0.00"));
        m.put(p + "form1120sBox4", dollar("0.00"));
        m.put(p + "form1120sBox5a", dollar("0.00"));
        m.put(p + "form1120sBox5b", dollar("0.00"));
        m.put(p + "dividendIncludesPtep", bool(false));
        m.put(p + "box5IncludesCleanRenewableEnergyBondInterest", bool(false));
    }

    static Map<String, String> partIIGate(Map<String, String> m) {
        m.put("/scheduleEHasPartIIIncome", bool(true));
        m.put("/scheduleEPartIILine27", bool(false));
        m.put("/scheduleEHasPartIIIIncome", bool(false));
        m.put("/scheduleEHasPartIVIncome", bool(false));
        m.put("/scheduleEK1sIsDone", bool(true));
        return m;
    }

    /** Part I $8,500 plus one supported K-1 of $12,000. Line 41 = $20,500. */
    static Map<String, String> partIAndPartII() {
        Map<String, String> m = partI();
        partIIGate(m);
        m.put("/scheduleEK1s", collection(K1));
        k1(m, K1, "Northwind Partners", "P", "12000.00");
        return m;
    }

    /** Supported Part III estate: domestic, box 6 only, material participation. Box 8 is zero. */
    static void estate(Map<String, String> m, String id, String name, String box6) {
        String p = "/scheduleEEstates/#" + id + "/";
        m.put(p + "entityName", string(name));
        m.put(p + "isForeignBeneficiary", bool(false));
        m.put(p + "isForeignTrust", bool(false));
        m.put(p + "inconsistentTreatment", bool(false));
        m.put(p + "box1", dollar("0.00"));
        m.put(p + "box2a", dollar("0.00"));
        m.put(p + "box2b", dollar("0.00"));
        m.put(p + "box3", dollar("0.00"));
        m.put(p + "box4a", dollar("0.00"));
        m.put(p + "box5", dollar("0.00"));
        m.put(p + "box6", dollar(box6));
        m.put(p + "box7", dollar("0.00"));
        m.put(p + "box8", dollar("0.00"));
        m.put(p + "materiallyParticipates", bool(true));
        // Box 12 code A is Form 6251 line 2j. Codes B through I are a separate stop. Code J is not a stop.
        m.put(p + "box12CodeA", dollar("0.00"));
        m.put(p + "hasBox12CodesBThroughI", bool(false));
        m.put(p + "hasBox12CodeJ", bool(false));
        m.put(p + "hasOtherK1Amount", bool(false));
        m.put(p + "basisLimitApplies", bool(false));
        m.put(p + "anyAmountNotAtRisk", bool(false));
        m.put(p + "passiveDeductionOrLoss", bool(false));
        m.put(p + "hasPriorYearUnallowedPassiveLoss", bool(false));
    }

    /** Part I $8,500 plus one supported estate, box 6 $9,000. Line 41 = $17,500. */
    static Map<String, String> partIAndPartIII() {
        Map<String, String> m = partI();
        partIIGate(m);
        m.put("/scheduleEHasPartIIIIncome", bool(true));
        m.put("/scheduleEEstatesIsDone", bool(true));
        m.put("/scheduleEK1s", EMPTY_COLLECTION);
        m.put("/scheduleEEstates", collection(ESTATE));
        estate(m, ESTATE, "Harbor Trust", "9000.00");
        return m;
    }

    static void amount(Map<String, String> f, String suffix, long dollars, String line) {
        String v = ScheduleSETy2026PdfSmokeTest.value(f, suffix);
        assertFalse(v.isEmpty(), line + " printed");
        assertEquals(dollars * 100, cents(v), line);
    }

    static void blank(Map<String, String> f, String suffix, String line) {
        ScheduleSETy2026PdfSmokeTest.blank(f, suffix, line);
    }

    static void refuses(Map<String, String> facts, String knockout) throws Exception {
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(facts));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals(List.of(knockout), e.getBody().getProperties().get("blockingFacts"));
    }

    @Test
    void scheduleBPrintsThe2026DraftAndLeavesUnsupportedLinesBlank() throws Exception {
        Map<String, String> m = syntheticFiler(standardDeduction(highIncomeScenario()));
        byte[] bytes = generate(m);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sb = fieldsOnPages(doc, SB_FOOTER);
            assertFalse(sb.isEmpty(), "Schedule B printed");
            assertTrue(
                    ScheduleSETy2026PdfSmokeTest.value(sb, "f1_01[0]")
                            .toUpperCase()
                            .contains("EXAMPLETON"),
                    "name");
            assertEquals(
                    "Synthetic Savings Bank",
                    ScheduleSETy2026PdfSmokeTest.value(sb, "f1_03[0]").trim());
            amount(sb, "f1_04[0]", 10000, "line 1");
            amount(sb, "f1_31[0]", 10000, "line 2");
            amount(sb, "f1_33[0]", 10000, "line 4 = line 2 (line 3 not claimed)");
            blank(sb, "f1_32[0]", "line 3 Form 8815");
            assertFalse(checked(sb, "c1_1[0]"), "7a Yes");
            assertTrue(checked(sb, "c1_1[1]"), "7a No");
            blank(sb, "c1_2[0]", "7a question 2 Yes stays blank when line 7a is No");
            blank(sb, "c1_2[1]", "7a question 2 No stays blank when line 7a is No");
            blank(sb, "f1_65[0]", "7b country");
            blank(sb, "f1_66[0]", "7b country line 2");
            assertFalse(checked(sb, "c1_3[0]"), "line 8 Yes");
            assertTrue(checked(sb, "c1_3[1]"), "line 8 No");
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains(SB_FOOTER), "2026 Schedule B");
            assertFalse(text.contains("Schedule B (Form 1040) 2024"), "TY2026 does not print the 2024 Schedule B");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    @Test
    void scheduleBPrintsK1Form1041InterestAndOrdinaryDividends() throws Exception {
        // Schedule K-1 (Form 1041) (2025) page 2: box 1 is Form 1040 line 2b; box 2a is line 3b.
        // Beneficiary's Instructions (2025) PDF p. 2: box 1 on Schedule B Part I line 1, box 2a on Part II line 5,
        // if applicable. Box 2a $1,600 is over the $1,500 threshold. Instructions for Schedule B (2025) p. 1.
        Map<String, String> m = partIAndPartIII();
        estate(m, ESTATE, "Harbor Trust", "0.00");
        m.put("/scheduleEEstates/#" + ESTATE + "/box1", dollar("900.00"));
        m.put("/scheduleEEstates/#" + ESTATE + "/box2a", dollar("1600.00"));
        m.put("/scheduleEEstates/#" + ESTATE + "/box2b", dollar("800.00"));
        byte[] bytes = generate(m);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sb = fieldsOnPages(doc, SB_FOOTER);
            assertFalse(sb.isEmpty(), "Schedule B printed");
            assertEquals("Harbor Trust", ScheduleSETy2026PdfSmokeTest.value(sb, "f1_03[0]").trim());
            amount(sb, "f1_04[0]", 900, "Part I box 1");
            amount(sb, "f1_31[0]", 900, "line 2");
            amount(sb, "f1_33[0]", 900, "line 4");
            assertEquals("Harbor Trust", ScheduleSETy2026PdfSmokeTest.value(sb, "f1_34[0]").trim());
            amount(sb, "f1_35[0]", 1600, "Part II box 2a");
            amount(sb, "f1_64[0]", 1600, "line 6");
        }
    }

    @Test
    void scheduleEPartIPrintsColumnAAndTiesToSchedule1Line5() throws Exception {
        byte[] bytes = generate(partI());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule E printed");
            assertTrue(
                    ScheduleSETy2026PdfSmokeTest.value(se, "f1_1[0]")
                            .toUpperCase()
                            .contains("EXAMPLETON"),
                    "name");
            assertEquals(
                    "900000001",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f1_2[0]").replaceAll("\\D", ""),
                    "SSN");
            amount(se, "f1_28[0]", 12000, "line 3 column A rents");
            amount(se, "f1_31[0]", 500, "line 4 column A royalties");
            amount(se, "f1_83[0]", 4000, "line 19 other expenses");
            amount(se, "f1_86[0]", 4000, "line 20 = line 19");
            amount(se, "f1_89[0]", 8500, "line 21");
            blank(se, "f1_92[0]", "line 22");
            amount(se, "f1_95[0]", 12000, "line 23a");
            amount(se, "f1_96[0]", 500, "line 23b");
            blank(se, "f1_97[0]", "line 23c");
            blank(se, "f1_98[0]", "line 23d");
            amount(se, "f1_99[0]", 4000, "line 23e");
            amount(se, "f2_3[0]", 8500, "line 24");
            blank(se, "f2_4[0]", "line 25");
            amount(se, "f2_5[0]", 8500, "line 26");
            assertFalse(checked(se, "c2_1[0]"), "line 27 Yes");
            assertFalse(checked(se, "c2_1[1]"), "line 27 No stays unchecked when Part II is no");
            blank(se, "f2_6[0]", "line 28A name");
            blank(se, "f2_49[0]", "line 31");
            blank(se, "f2_50[0]", "line 32");
            blank(se, "f2_51[0]", "line 33A name");
            blank(se, "f2_58[0]", "line 33A column (f)");
            amount(se, "f2_64[0]", 0, "line 34a column (d) is zero");
            amount(se, "f2_66[0]", 0, "line 34a column (f) is zero");
            blank(se, "f2_71[0]", "line 35");
            blank(se, "f2_72[0]", "line 36");
            blank(se, "f2_73[0]", "line 37");
            blank(se, "f2_79[0]", "line 39 Part IV");
            blank(se, "f3_3[0]", "line 40");
            amount(se, "f3_4[0]", 8500, "line 41");
            blank(se, "f3_5[0]", "line 42");
            blank(se, "f3_6[0]", "line 43");
            assertTrue(
                    ScheduleSETy2026PdfSmokeTest.value(se, "f3_1[0]")
                            .toUpperCase()
                            .contains("EXAMPLETON"),
                    "page 3 name");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 8500, "Schedule 1 line 5 = Schedule E line 41");
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains(SE_FOOTER), "2026 Schedule E");
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    @Test
    void scheduleEPartIIPrintsColumnKAndFootsToLine41() throws Exception {
        byte[] bytes = generate(partIAndPartII());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            amount(se, "f1_89[0]", 8500, "line 21");
            amount(se, "f2_5[0]", 8500, "line 26");
            assertTrue(checked(se, "c2_1[1]"), "line 27 No");
            assertEquals(
                    "Northwind Partners",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f2_6[0]").trim());
            assertEquals("P", ScheduleSETy2026PdfSmokeTest.value(se, "f2_7[0]").trim(), "column (b)");
            blank(se, "f2_8[0]", "column (d) EIN");
            amount(se, "f2_22[0]", 12000, "column (k)");
            amount(se, "f2_42[0]", 12000, "line 29a column (k)");
            amount(se, "f2_48[0]", 12000, "line 30");
            blank(se, "f2_49[0]", "line 31");
            amount(se, "f2_50[0]", 12000, "line 32");
            blank(se, "f2_51[0]", "line 33A name");
            amount(se, "f2_64[0]", 0, "line 34a column (d)");
            amount(se, "f2_66[0]", 0, "line 34a column (f)");
            blank(se, "f2_73[0]", "line 37 Part III");
            blank(se, "f2_79[0]", "line 39 Part IV");
            amount(se, "f3_4[0]", 20500, "line 41 = 8,500 + 12,000");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 20500, "Schedule 1 line 5 = line 41");
        }
    }

    @Test
    void scheduleEPartIIIPrintsColumnFAndFootsToLine41() throws Exception {
        byte[] bytes = generate(partIAndPartIII());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            amount(se, "f2_5[0]", 8500, "line 26");
            assertEquals(
                    "Harbor Trust",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f2_51[0]").trim());
            blank(se, "f2_52[0]", "line 33A EIN");
            blank(se, "f2_56[0]", "line 33A column (d)");
            amount(se, "f2_58[0]", 9000, "line 33A column (f)");
            blank(se, "f2_53[0]", "line 33B name");
            amount(se, "f2_64[0]", 0, "line 34a column (d)");
            amount(se, "f2_66[0]", 9000, "line 34a column (f)");
            amount(se, "f2_71[0]", 9000, "line 35");
            blank(se, "f2_72[0]", "line 36");
            amount(se, "f2_73[0]", 9000, "line 37");
            blank(se, "f2_74[0]", "Part IV name");
            blank(se, "f2_79[0]", "line 39");
            amount(se, "f3_4[0]", 17500, "line 41 = 8,500 + 9,000");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 17500, "Schedule 1 line 5 = line 41");
        }

        Map<String, String> two = partI();
        partIIGate(two);
        two.put("/scheduleEHasPartIIIIncome", bool(true));
        two.put("/scheduleEEstatesIsDone", bool(true));
        two.put("/scheduleEK1s", EMPTY_COLLECTION);
        two.put("/scheduleEEstates", collection(ESTATE, ESTATE_2));
        estate(two, ESTATE, "Harbor Trust", "3000.00");
        estate(two, ESTATE_2, "Cedar Trust", "2500.00");
        byte[] both = generate(two);
        try (PDDocument doc = Loader.loadPDF(both)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertEquals(
                    "Harbor Trust",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f2_51[0]").trim());
            amount(se, "f2_58[0]", 3000, "row A column (f)");
            assertEquals(
                    "Cedar Trust",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f2_53[0]").trim());
            amount(se, "f2_62[0]", 2500, "row B column (f)");
            amount(se, "f2_66[0]", 5500, "line 34a column (f)");
            amount(se, "f2_73[0]", 5500, "line 37");
            amount(se, "f3_4[0]", 14000, "line 41 = 8,500 + 5,500");
        }
    }

    @Test
    void scheduleERefusesUnsupportedPartIPaths() throws Exception {
        Map<String, String> loss = partI();
        loss.put("/scheduleEWritableExpenses", dollar("20000.00"));
        refuses(loss, SCHEDULE_E_LOSS_KNOCKOUT);

        Map<String, String> depreciation = partI();
        depreciation.put("/scheduleEHasDepreciation", bool(true));
        refuses(depreciation, SCHEDULE_E_DEPRECIATION_KNOCKOUT);

        Map<String, String> personalUse = partI();
        personalUse.put("/scheduleEHasPersonalUse", bool(true));
        refuses(personalUse, SCHEDULE_E_PERSONAL_USE_KNOCKOUT);

        Map<String, String> services = partI();
        services.put("/scheduleEProvidesSubstantialServices", bool(true));
        refuses(services, SCHEDULE_E_SUBSTANTIAL_SERVICES_KNOCKOUT);
    }

    @Test
    void scheduleERefusesPartIIIAndAFifthK1() throws Exception {
        Map<String, String> estate = partI();
        partIIGate(estate);
        estate.put("/scheduleEHasPartIIIIncome", bool(true));
        refuses(estate, SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> five = partI();
        partIIGate(five);
        String[] ids = {
            "e1000000-0000-4000-8000-000000000001",
            "e1000000-0000-4000-8000-000000000002",
            "e1000000-0000-4000-8000-000000000003",
            "e1000000-0000-4000-8000-000000000004",
            "e1000000-0000-4000-8000-000000000005"
        };
        five.put("/scheduleEK1s", collection(ids));
        for (int i = 0; i < ids.length; i++) {
            k1(five, ids[i], "Entity " + (i + 1), "P", "100.00");
        }
        refuses(five, SCHEDULE_E_PART_II_MORE_THAN_FOUR_KNOCKOUT);

        Map<String, String> box8 = partIAndPartIII();
        box8.put("/scheduleEEstates/#" + ESTATE + "/box8", dollar("1500.00"));
        refuses(box8, SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> remic = partI();
        remic.put("/scheduleEHasPartIVIncome", bool(true));
        refuses(remic, SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> third = partIAndPartIII();
        String thirdId = "c8f2d3b1-2222-4333-8444-555566667779";
        third.put("/scheduleEEstates", collection(ESTATE, ESTATE_2, thirdId));
        estate(third, ESTATE_2, "Cedar Trust", "2500.00");
        estate(third, thirdId, "Elm Trust", "100.00");
        refuses(third, SCHEDULE_E_PART_III_MORE_THAN_TWO_KNOCKOUT);

        Map<String, String> box7Loss = floridaBox7("4000.00");
        box7Loss.put("/scheduleEEstates/#" + ESTATE + "/box7", dollar("-1.00"));
        refuses(box7Loss, SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> carryover = floridaBox7("4000.00");
        carryover.put("/scheduleEEstates/#" + ESTATE + "/hasPriorYearUnallowedPassiveLoss", bool(true));
        refuses(carryover, SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> blankBox7 = floridaBox7("0.00");
        blankBox7.remove("/scheduleEEstates/#" + ESTATE + "/box7");
        refuses(blankBox7, SCHEDULE_E_PART_II_KNOCKOUT);
    }

    /**
     * Florida single filer, no Schedule E Part I. Schedule K-1 (Form 1041) box 7 of $4,000 is line 33 column (d),
     * line 37, Schedule 1 line 5, and Form 8960 line 4a. Wages are $210,000, so MAGI is over the $200,000 single
     * threshold. 26 U.S.C. 469(c)(2); 26 U.S.C. 1411(b); 26 U.S.C. 1411(c)(1)(A)(i). A zero box 7 prints column (d)
     * blank. A PA-40 with the same box 7 refuses the print. PA-40 IN (2025) p. 19, LINE 7. 72 P.S. §7303(a)(8).
     */
    @Test
    void scheduleEPartIIIBox7PrintsColumnDAndForm8960Line4a() throws Exception {
        byte[] bytes = generate(floridaBox7("4000.00"));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertEquals(
                    "Harbor Trust",
                    ScheduleSETy2026PdfSmokeTest.value(se, "f2_51[0]").trim());
            amount(se, "f2_56[0]", 4000, "line 33A column (d)");
            blank(se, "f2_58[0]", "line 33A column (f)");
            amount(se, "f2_64[0]", 4000, "line 34a column (d)");
            amount(se, "f2_71[0]", 4000, "line 35");
            amount(se, "f2_73[0]", 4000, "line 37");
            amount(se, "f3_4[0]", 4000, "line 41");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 4000, "Schedule 1 line 5");
            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            amount(f8960, "f1_6[0]", 4000, "Form 8960 line 4a");
        }

        byte[] zeroBytes = generate(floridaBox7("0.00"));
        try (PDDocument doc = Loader.loadPDF(zeroBytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            blank(se, "f2_56[0]", "line 33A column (d) is blank at zero");
            blank(se, "f2_73[0]", "line 37 is blank at zero");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            blank(s1, "f1_09[0]", "Schedule 1 line 5 is blank at zero");
            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            blank(f8960, "f1_6[0]", "Form 8960 line 4a is blank at zero");
        }

        Map<String, String> pa = floridaBox7("4000.00");
        pa.put("/filerResidenceAndIncomeState", enumValue("pa", "/scopedStateOptions"));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(pa));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(
                e.getBody().getProperties().get("blockingFacts").toString().contains("/flowKnockoutPaK11041Box7"),
                e.getBody().toString());
    }

    /**
     * No Schedule E Part I. Wages $210,000 keep MAGI over the single $200,000 threshold without Part I rents, so
     * Form 8960 is not the unsupported-income stop. Box 7 is the only Schedule E amount.
     */
    static Map<String, String> floridaBox7(String box7) {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("210000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("210000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("3045.00"));
        m.put("/form8949Transactions", EMPTY_COLLECTION);
        m.put("/soldCapitalAssets", bool(false));
        standardDeduction(m);
        m.put("/hadScheduleEIncome", bool(false));
        partIIGate(m);
        m.put("/scheduleEHasPartIIIIncome", bool(true));
        m.put("/scheduleEEstatesIsDone", bool(true));
        m.put("/scheduleEK1s", EMPTY_COLLECTION);
        m.put("/scheduleEEstates", collection(ESTATE));
        estate(m, ESTATE, "Harbor Trust", "0.00");
        m.put("/scheduleEEstates/#" + ESTATE + "/box7", dollar(box7));
        m.put("/filerResidenceAndIncomeState", enumValue("fl", "/scopedStateOptions"));
        return syntheticFiler(m);
    }

    /**
     * Florida single filer, no Schedule E Part I. Schedule K-1 (Form 1041) box 5 of $1,000 is line 33 column (f),
     * line 37, Schedule 1 line 5, and Form 8960 line 4a. Box 5 of $1,000 plus material-participation box 6 of $5,000
     * is column (f) $6,000 and Schedule 1 line 5 $6,000, and Form 8960 line 4a stays $1,000. 2026 draft Schedule K-1
     * (Form 1041), page 2. 26 U.S.C. 469(e)(1)(A); 26 U.S.C. 1411(c)(1)(A); 26 U.S.C. 1411(c)(2). A negative box 5
     * refuses the print. A PA-40 with nonzero box 5 refuses the print through /flowKnockoutPaUnsupportedItems, and
     * PA-40 line 7 stays $0. 72 P.S. §7303(a)(8).
     */
    @Test
    void scheduleEPartIIIBox5PrintsColumnFAndForm8960Line4a() throws Exception {
        byte[] alone = generate(floridaEstate("1000.00", "0.00"));
        try (PDDocument doc = Loader.loadPDF(alone)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            blank(se, "f2_56[0]", "line 33A column (d)");
            amount(se, "f2_58[0]", 1000, "line 33A column (f)");
            amount(se, "f2_66[0]", 1000, "line 34a column (f)");
            amount(se, "f2_71[0]", 1000, "line 35");
            amount(se, "f2_73[0]", 1000, "line 37");
            amount(se, "f3_4[0]", 1000, "line 41");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 1000, "Schedule 1 line 5");
            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            amount(f8960, "f1_6[0]", 1000, "Form 8960 line 4a");
        }

        byte[] both = generate(floridaEstate("1000.00", "5000.00"));
        try (PDDocument doc = Loader.loadPDF(both)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            amount(se, "f2_58[0]", 6000, "line 33A column (f) is box 5 plus box 6");
            amount(se, "f2_73[0]", 6000, "line 37");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "f1_09[0]", 6000, "Schedule 1 line 5");
            Map<String, String> f8960 = fieldsOnPages(doc, "Form 8960 (2026)");
            amount(f8960, "f1_6[0]", 1000, "Form 8960 line 4a includes box 5 only");
        }

        refuses(floridaEstate("-1.00", "0.00"), SCHEDULE_E_PART_II_KNOCKOUT);

        Map<String, String> pa = floridaEstate("1000.00", "0.00");
        pa.put("/filerResidenceAndIncomeState", enumValue("pa", "/scopedStateOptions"));
        pa.put("/paHasUnsupportedItems", bool(false));
        pa.put("/paHasEstimatedInstallmentPayments", bool(false));
        SubmissionBlockingFactsResponseStatusException e =
                assertThrows(SubmissionBlockingFactsResponseStatusException.class, () -> generatePublicPrint(pa));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(
                e.getBody().getProperties().get("blockingFacts").toString().contains("/flowKnockoutPaUnsupportedItems"),
                e.getBody().toString());
    }

    /** Box 5 and box 6 on the Florida wages scenario used for Form 8960. Box 7 stays zero. */
    static Map<String, String> floridaEstate(String box5, String box6) {
        Map<String, String> m = floridaBox7("0.00");
        m.put("/scheduleEEstates/#" + ESTATE + "/box5", dollar(box5));
        m.put("/scheduleEEstates/#" + ESTATE + "/box6", dollar(box6));
        return m;
    }

    @Test
    void scheduleBPrintsLine7aYesWithQuestion2AndCountries() throws Exception {
        Map<String, String> fbarYes = partI();
        fbarYes.put("/hasForeignAccounts", bool(true));
        fbarYes.put("/requiredToFileFinCENForm114", bool(true));
        fbarYes.put("/foreignAccountCountryLine1", string("France"));
        fbarYes.put("/foreignAccountCountryLine2", string("Japan"));
        fbarYes.put("/foreignAccountCountriesFitOnLine7b", bool(true));
        fbarYes.put("/requiredToFileForm8938", bool(false));
        byte[] yesBytes = generate(fbarYes);
        try (PDDocument doc = Loader.loadPDF(yesBytes)) {
            Map<String, String> sb = fieldsOnPages(doc, SB_FOOTER);
            assertTrue(checked(sb, "c1_1[0]"), "7a Yes");
            assertFalse(checked(sb, "c1_1[1]"), "7a No");
            assertTrue(checked(sb, "c1_2[0]"), "7a question 2 Yes");
            assertFalse(checked(sb, "c1_2[1]"), "7a question 2 No");
            assertEquals(
                    "France", ScheduleSETy2026PdfSmokeTest.value(sb, "f1_65[0]").trim());
            assertEquals(
                    "Japan", ScheduleSETy2026PdfSmokeTest.value(sb, "f1_66[0]").trim());
            assertFalse(checked(sb, "c1_3[0]"), "line 8 Yes");
            assertTrue(checked(sb, "c1_3[1]"), "line 8 No");
        }

        Map<String, String> fbarNo = partI();
        fbarNo.put("/hasForeignAccounts", bool(true));
        fbarNo.put("/requiredToFileFinCENForm114", bool(false));
        fbarNo.put("/requiredToFileForm8938", bool(false));
        byte[] noBytes = generate(fbarNo);
        try (PDDocument doc = Loader.loadPDF(noBytes)) {
            Map<String, String> sb = fieldsOnPages(doc, SB_FOOTER);
            assertTrue(checked(sb, "c1_1[0]"), "7a Yes");
            assertFalse(checked(sb, "c1_2[0]"), "7a question 2 Yes");
            assertTrue(checked(sb, "c1_2[1]"), "7a question 2 No");
            blank(sb, "f1_65[0]", "7b blank when FBAR is not required");
            blank(sb, "f1_66[0]", "7b line 2 blank when FBAR is not required");
            assertTrue(checked(sb, "c1_3[1]"), "line 8 No");
        }
    }

    @Test
    void scheduleBRefusesPartIIIStopsAndAnInterestSubtraction() throws Exception {
        Map<String, String> unansweredQ2 = partI();
        unansweredQ2.put("/hasForeignAccounts", bool(true));
        refuses(unansweredQ2, SCHEDULE_B_PART_III_PRINT_REFUSE);

        Map<String, String> countriesOpen = partI();
        countriesOpen.put("/hasForeignAccounts", bool(true));
        countriesOpen.put("/requiredToFileFinCENForm114", bool(true));
        countriesOpen.put("/foreignAccountCountryLine1", string("France"));
        refuses(countriesOpen, SCHEDULE_B_PART_III_PRINT_REFUSE);

        Map<String, String> countriesDoNotFit = partI();
        countriesDoNotFit.put("/hasForeignAccounts", bool(true));
        countriesDoNotFit.put("/requiredToFileFinCENForm114", bool(true));
        countriesDoNotFit.put("/foreignAccountCountryLine1", string("France"));
        countriesDoNotFit.put("/foreignAccountCountriesFitOnLine7b", bool(false));
        refuses(countriesDoNotFit, SCHEDULE_B_PART_III_PRINT_REFUSE);

        Map<String, String> form8938 = partI();
        form8938.put("/hasForeignAccounts", bool(true));
        form8938.put("/requiredToFileFinCENForm114", bool(false));
        form8938.put("/requiredToFileForm8938", bool(true));
        refuses(form8938, SCHEDULE_B_PART_III_PRINT_REFUSE);

        Map<String, String> line8 = partI();
        line8.put("/isForeignTrustsGrantor", bool(true));
        refuses(line8, SCHEDULE_B_PART_III_PRINT_REFUSE);

        Map<String, String> nominee = partI();
        nominee.put("/interestReports", collection(INT));
        nominee.put("/interestReports/#" + INT + "/payer", string("Synthetic Savings Bank"));
        nominee.put("/interestReports/#" + INT + "/filer", collectionItem(W2));
        nominee.put("/interestReports/#" + INT + "/has1099", bool(true));
        nominee.put("/interestReports/#" + INT + "/writable1099Amount", dollar("100.00"));
        nominee.put("/interestReports/#" + INT + "/receivedAsNominee", bool(true));
        nominee.put("/interestReports/#" + INT + "/hasSeenLastAvailableScreen", bool(true));
        refuses(nominee, INTEREST_SUBTRACTION_KNOCKOUT);
    }

    /** Every mapped field exists on the draft and its tooltip still names the line the map intends. */
    @Test
    void mappedFieldTooltipsNameTheIntendedLines() throws Exception {
        assertTooltips(
                "pdf/2026/IRS1040SB/en/configuration.yml",
                SB_TEMPLATE,
                Map.ofEntries(
                        Map.entry("f1_31[0]", "2. Add the amounts on line 1"),
                        Map.entry("f1_33[0]", "4. Subtract line 3 from line 2"),
                        Map.entry("f1_64[0]", "6. Add the amounts on line 5"),
                        Map.entry("c1_1[0]", "Foreign Accounts"),
                        Map.entry("c1_1[1]", "7a. No"),
                        Map.entry("c1_2[0]", "Form 114"),
                        Map.entry("c1_2[1]", "7a. No"),
                        Map.entry("f1_65[0]", "foreign country"),
                        Map.entry("f1_66[0]", "7b. Line 2"),
                        Map.entry("c1_3[0]", "foreign trust"),
                        Map.entry("c1_3[1]", "8. No")));
        assertTooltips(
                "pdf/2026/IRS1040SE/en/configuration.yml",
                SE_TEMPLATE,
                Map.ofEntries(
                        Map.entry("f1_28[0]", "3. Rents received"),
                        Map.entry("f1_31[0]", "4. Royalties received"),
                        Map.entry("f1_83[0]", "19. Other"),
                        Map.entry("f1_86[0]", "20. Total expenses"),
                        Map.entry("f1_89[0]", "21. Subtract line 20"),
                        Map.entry("f1_95[0]", "23a."),
                        Map.entry("f1_96[0]", "23b."),
                        Map.entry("f1_99[0]", "23e."),
                        Map.entry("f2_3[0]", "24. Income"),
                        Map.entry("f2_5[0]", "26. Total rental"),
                        Map.entry("c2_1[1]", "27. No"),
                        Map.entry("f2_6[0]", "Column: (a) Name"),
                        Map.entry("f2_7[0]", "Enter P for partnership"),
                        Map.entry("f2_22[0]", "(k) Nonpassive income"),
                        Map.entry("f2_42[0]", "29a. (k)"),
                        Map.entry("f2_48[0]", "30. Add columns"),
                        Map.entry("f2_50[0]", "32. Total partnership"),
                        Map.entry("f2_51[0]", "33."),
                        Map.entry("f2_58[0]", "(f) Other income"),
                        Map.entry("f2_64[0]", "34a. (d)"),
                        Map.entry("f2_66[0]", "34a. (f)"),
                        Map.entry("f2_71[0]", "35. Add columns"),
                        Map.entry("f2_72[0]", "36. Add columns"),
                        Map.entry("f2_73[0]", "37. Total estate"),
                        Map.entry("f3_4[0]", "41. Total income")));
    }

    static void assertTooltips(String configPath, String template, Map<String, String> expected) throws Exception {
        String config = new String(new ClassPathResource(configPath).getContentAsByteArray(), StandardCharsets.UTF_8);
        assertFalse(config.contains("pdf/2024/"), configPath);
        try (PDDocument doc = Loader.loadPDF(new ClassPathResource(template).getContentAsByteArray())) {
            var form = doc.getDocumentCatalog().getAcroForm();
            Map<String, PDField> byShort = new LinkedHashMap<>();
            for (PDField field : form.getFieldTree()) {
                String name = field.getFullyQualifiedName();
                int dot = name.lastIndexOf('.');
                byShort.put(dot < 0 ? name : name.substring(dot + 1), field);
            }
            int mapped = 0;
            for (String line : config.split("\n")) {
                var m = java.util.regex.Pattern.compile("^\\s+(\\S+):\\s*/").matcher(line);
                if (!m.find()) {
                    continue;
                }
                mapped++;
                String name = m.group(1);
                PDField field = byShort.get(name);
                assertNotNull(field, name + " exists on " + template);
                String tooltip = field.getAlternateFieldName();
                assertNotNull(tooltip, name + " tooltip");
                assertFalse(tooltip.isBlank(), name + " tooltip");
                if (expected.containsKey(name)) {
                    String normalized = tooltip.replaceAll("\\s+", " ");
                    assertTrue(
                            normalized.contains(expected.get(name)),
                            name + " tooltip names the line: expected \"" + expected.get(name) + "\" in \"" + normalized
                                    + "\"");
                }
            }
            assertEquals(
                    expected.size(),
                    expected.keySet().stream()
                            .filter(k -> config.contains(k + ":"))
                            .count());
            assertTrue(mapped >= expected.size(), template + " mapped fields");
        }
    }
}
