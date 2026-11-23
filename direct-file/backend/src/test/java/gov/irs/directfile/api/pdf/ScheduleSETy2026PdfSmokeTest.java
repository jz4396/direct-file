package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.collectionItem;
import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.fieldsOnPages;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #89: 2026 draft Schedule SE (https://www.irs.gov/pub/irs-dft/f1040sse--dft.pdf, created 4/27/26) end-to-end through
 * the real PdfService, fact dictionary and application.yaml for tax year 2026. Draft-based field map: re-verify when the
 * final form is released.
 *
 * <p>Golden end-to-end scenario (synthetic data; made-up name, test-only 900-area SSN): single, one Schedule C business,
 * one W-2 (boxes 1, 3 and 5 equal). Worked figures, whole dollars, rounded half up:
 *
 * <pre>
 *   W-2 $170,000, Schedule C $30,000:
 *     2 30,000  3 30,000  4a 27,705 (x 92.35%, 26 U.S.C. 1402(a)(12))  4c 27,705  6 27,705
 *     7 $184,500 preprinted (90 FR 49047, p. 49050)  8a 170,000  8d 170,000  9 14,500
 *     10 1,798 (14,500 x 12.4%, 26 U.S.C. 1401(a))  11 803 (27,705 x 2.9% = 803.445, 26 U.S.C. 1401(b)(1))
 *     12 2,601 = Schedule 2 line 4 (26 U.S.C. 1401)  13 1,301 (2,601 x 50% = 1,300.50) = Schedule 1 line 15
 *     (26 U.S.C. 164(f)(1))
 *   W-2 $190,000 with $184,500 social security wages, Schedule C $20,000 (line 8a at the wage base, so the form
 *   says skip lines 8b through 10):
 *     4a 18,470  8a 184,500  8d, 9, 10 blank  11 536 (18,470 x 2.9% = 535.63)  12 536  13 268
 *   Schedule C $400: 4a = 369 is under $400 (line 4c; 26 U.S.C. 1402(b)(2)), so no Schedule SE prints and Schedule 2
 *   line 4 stays blank.
 * </pre>
 */
class ScheduleSETy2026PdfSmokeTest {
    static final String W2 = Form8959Form8960Ty2026PdfSmokeTest.W2;
    static final String BIZ = "b0000000-5e00-4000-8000-000000000001";
    static final String SE_FOOTER = "Schedule SE (Form 1040) 2026";
    static final String TEMPLATE = "pdf/2026/IRS1040SSE/en/f1040sse--dft.pdf";

    /** Single filer with one W-2 (boxes 1, 3 and 5 as given) and one Schedule C business with the given profit. */
    static Map<String, String> selfEmployed(String wages, String oasdiWages, String profit) {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar(wages));
        m.put("/formW2s/#" + W2 + "/writableOasdiWages", dollar(oasdiWages));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar(wages));
        m.put("/form8949Transactions", PaPit40ScheduleSpTy2026PdfSmokeTest.EMPTY_COLLECTION);
        m.put("/hadSelfEmploymentIncome", bool(true));
        m.put("/wantsQbiDeduction", bool(false));
        m.put("/scheduleCBusinesses", collection(BIZ));
        m.put("/scheduleCBusinesses/#" + BIZ + "/filer", collectionItem(W2));
        m.put("/scheduleCBusinesses/#" + BIZ + "/businessName", string("Synthetic Consulting"));
        m.put("/scheduleCBusinesses/#" + BIZ + "/writableGrossReceipts", dollar(profit));
        m.put("/scheduleCBusinesses/#" + BIZ + "/writableTotalExpenses", dollar("0.00"));
        m.put("/scheduleCBusinessesIsDone", bool(true));
        qbiAnswers(m, BIZ);
        Schedules123Ty2026PdfSmokeTest.standardDeduction(m);
        return Ty2026PdfPackageTest.syntheticFiler(m);
    }

    /**
     * Joint return: primary W-2 $80,000 (boxes 1, 3, and 5) with $8,000 withheld, spouse Schedule C net $20,000.
     * Group-00 test SSNs. Florida, so the community-property stop is not true. The spouse is not electing a
     * qualified joint venture.
     */
    static Map<String, String> spouseOwnedScheduleC() {
        String spouse = "859c03d1-af4a-447f-96aa-d19397048a48";
        Map<String, String> m = selfEmployed("80000.00", "80000.00", "20000.00");
        m.put("/formW2s/#" + W2 + "/writableFederalWithholding", dollar("8000.00"));
        m.put("/filingStatus", PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue("marriedFilingJointly", "/filingStatusOptions"));
        m.put("/maritalStatus", PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue("married", "/maritalStatusOptions"));
        m.put("/filerResidenceAndIncomeState", PaPit40ScheduleSpTy2026PdfSmokeTest.enumValue("fl", "/scopedStateOptions"));
        m.put("/scheduleCIsQualifiedJointVenture", bool(false));
        m.put("/hadSecondaryFilerChurchEmployeeIncome", bool(false));
        m.put("/livedTogetherAllYearWithSpouse", bool(true));
        m.put("/MFJRequiredToFile", bool(true));
        m.put("/MFJDependentsFilingForCredits", bool(false));
        String s = "/filers/#" + spouse + "/";
        m.put(s + "firstName", string("Blair"));
        m.put(s + "writableMiddleInitial", string("R"));
        m.put(s + "lastName", string(Ty2026PdfPackageTest.LAST_NAME));
        m.put(s + "tin", PaPit40ScheduleSpTy2026PdfSmokeTest.tin("900", "00", "0002"));
        m.put(s + "dateOfBirth", PaPit40ScheduleSpTy2026PdfSmokeTest.day("1987-06-06"));
        m.put(s + "isUsCitizenFullYear", bool(true));
        m.put(s + "isBlind", bool(false));
        m.put(s + "isDisabled", bool(false));
        m.put(s + "isStudent", bool(false));
        m.put(s + "occupation", string("writer"));
        m.put(s + "canBeClaimed", bool(false));
        m.put("/scheduleCBusinesses/#" + BIZ + "/filer", collectionItem(spouse));
        return m;
    }

    /**
     * The Form 8995 questions for one Schedule C business: the filer materially participates, has no prior-year
     * qualified business loss carryforward and is not a cooperative patron (26 U.S.C. 199A(c)(2), 199A(g)). Also the
     * Schedule SE questions answered no (26 U.S.C. 1402(a), 1402(c)(1), 1402(e), 1402(g), 1402(j), 1402(l)), so lines
     * 1a, 1b, 4b, 5a, 5b, checkbox A, and 8c stay blank.
     */
    static Map<String, String> qbiAnswers(Map<String, String> m, String biz) {
        m.put("/scheduleCBusinesses/#" + biz + "/materiallyParticipates", bool(true));
        m.put("/qbiHasPriorYearLossCarryforward", bool(false));
        m.put("/qbiIsCooperativePatron", bool(false));
        // Answered no: Schedule SE lines 1a, 1b, 4b, 5a, 5b, checkbox A, and 8c stay blank.
        m.put("/hadFarmSelfEmploymentIncome", bool(false));
        m.put("/hadChurchEmployeeIncome", bool(false));
        m.put("/hadSecondaryFilerChurchEmployeeIncome", bool(false));
        m.put("/usesSeOptionalMethod", bool(false));
        m.put("/hasMinisterOrSeExemption", bool(false));
        m.put("/hasNotarySeExclusion", bool(false));
        m.put("/hadForm8919Wages", bool(false));
        return m;
    }

    /** Value of the one field on these pages whose fully qualified name ends with {@code suffix}. */
    static String value(Map<String, String> f, String suffix) {
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field is unique on the form: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertNotNull(found, "field present on the form: " + suffix);
        return found;
    }

    static void amount(Map<String, String> f, String suffix, long dollars, String line) {
        String v = value(f, suffix);
        assertFalse(v.isEmpty(), line + " printed");
        assertEquals(dollars * 100, cents(v), line);
    }

    static void blank(Map<String, String> f, String suffix, String line) {
        String v = value(f, suffix);
        assertTrue(v.isEmpty() || "Off".equals(v), line + " blank, was " + v);
    }

    static void assertUnsupportedLinesBlank(Map<String, String> se) {
        blank(se, "Page1[0].c1_1[0]", "A Form 4361 checkbox");
        blank(se, "Page1[0].f1_3[0]", "1a farm profit");
        blank(se, "Page1[0].f1_4[0]", "1b Conservation Reserve Program payments");
        blank(se, "Page1[0].f1_8[0]", "4b optional methods");
        blank(se, "Page1[0].f1_10[0]", "5a church employee income");
        blank(se, "Page1[0].f1_11[0]", "5b");
        blank(se, "Page1[0].f1_15[0]", "8b Form 4137");
        blank(se, "Page1[0].f1_16[0]", "8c Form 8919");
        for (String p2 : new String[] {"f2_1[0]", "f2_2[0]", "f2_3[0]", "f2_4[0]"}) {
            blank(se, "Page2[0]." + p2, "Part II optional methods");
        }
    }

    @Test
    void scheduleSEPrintsPartIAndTiesToSchedules1And2() throws Exception {
        byte[] bytes = generate(selfEmployed("170000.00", "170000.00", "30000.00"));
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedule-se-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule SE printed");
            assertTrue(value(se, "Page1[0].f1_1[0]").toUpperCase().contains("EXAMPLETON"), "name");
            assertTrue(value(se, "Page1[0].f1_2[0]").replaceAll("\\D", "").equals("900000001"), "SSN");
            amount(se, "Page1[0].f1_5[0]", 30000, "2 Schedule C line 31");
            amount(se, "Page1[0].f1_6[0]", 30000, "3");
            amount(se, "Page1[0].f1_7[0]", 27705, "4a = 3 x 92.35%");
            amount(se, "Page1[0].f1_9[0]", 27705, "4c");
            amount(se, "Page1[0].f1_12[0]", 27705, "6");
            amount(se, "Page1[0].f1_14[0]", 170000, "8a W-2 box 3 + box 7");
            amount(se, "Page1[0].f1_17[0]", 170000, "8d");
            amount(se, "Page1[0].f1_18[0]", 184500 - 170000, "9 = 7 - 8d");
            amount(se, "Page1[0].f1_19[0]", 1798, "10 = smaller of 6 or 9 x 12.4%");
            amount(se, "Page1[0].f1_20[0]", 803, "11 = 6 x 2.9%");
            amount(se, "Page1[0].f1_21[0]", 2601, "12 = 10 + 11");
            amount(se, "Page1[0].f1_22[0]", 1301, "13 = 12 x 50%");
            assertUnsupportedLinesBlank(se);

            Map<String, String> s2 = fieldsOnPages(doc, "Schedule 2 (Form 1040) 2026");
            amount(s2, "Page1[0].f1_15[0]", 2601, "Schedule 2 line 4 = Schedule SE line 12");
            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page2[0].f2_05[0]", 1301, "Schedule 1 line 15 = Schedule SE line 13");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
            assertFalse(text.contains("Exempt\u2014Notary"), "no notary annotation when the amount is $0");
        }
    }

    /**
     * Schedule C line 31 $20,000, of which $3,000 is notary net profit. Line 2 stays $20,000 and line 3 is $17,000.
     * round(17,000 × 0.9235) = 15,700. 26 U.S.C. 1402(a)(12), 1402(c)(1). 2026 draft Instructions for Schedule SE,
     * PDF p. 5, Line 2 item 2. The draft PDF has no field for the dotted line, so the annotation is stamped there.
     */
    @Test
    void notaryProfitIsSubtractedOnLine3AndStampedOnTheDottedLine() throws Exception {
        Map<String, String> facts = selfEmployed("170000.00", "170000.00", "20000.00");
        facts.put("/scheduleCBusinesses/#" + BIZ + "/notaryNetProfit", dollar("3000.00"));
        byte[] bytes = generate(facts);
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedule-se-ty2026-notary.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            amount(se, "Page1[0].f1_5[0]", 20000, "2 keeps Schedule C line 31");
            amount(se, "Page1[0].f1_6[0]", 17000, "3 = 20,000 - 3,000");
            amount(se, "Page1[0].f1_7[0]", 15700, "4a = 17,000 x 92.35%");
            // The form's dotted leaders share this baseline, so a text stripper interleaves the dots with the stamp.
            // The content stream has the stamp's own position. f1_6, line 3, starts at x = 505.
            String annotation = Irs1040SsePdfForm.exemptNotaryAnnotation(new BigDecimal("3000.00"));
            float[] at = stampOrigin(doc, annotation);
            float width = new PDType1Font(Standard14Fonts.FontName.HELVETICA).getStringWidth(annotation)
                    / 1000f
                    * Irs1040SsePdfForm.FONT_SIZE;
            assertTrue(at[0] + width < 505f, "annotation ends left of the line 3 box, was " + (at[0] + width));
            assertTrue(at[1] > 516f && at[1] < 528f, "annotation baseline " + at[1]);
        }
    }

    /** Origin of the "Exempt—Notary" text operator, from the page content stream. */
    static float[] stampOrigin(PDDocument doc, String annotation) throws IOException {
        String hex = winAnsiHex(annotation);
        Pattern operator = Pattern.compile("([0-9.]+) ([0-9.]+) Td\\s*<" + hex + "> Tj");
        for (PDPage page : doc.getPages()) {
            Iterator<PDStream> streams = page.getContentStreams();
            while (streams.hasNext()) {
                String data = new String(streams.next().toByteArray(), StandardCharsets.ISO_8859_1);
                Matcher matcher = operator.matcher(data);
                if (matcher.find()) {
                    return new float[] {Float.parseFloat(matcher.group(1)), Float.parseFloat(matcher.group(2))};
                }
            }
        }
        throw new AssertionError("dotted-line annotation was not stamped");
    }

    /** WinAnsi hex of the stamp, including the em dash at byte 0x97. */
    static String winAnsiHex(String text) {
        byte[] bytes = text.getBytes(Charset.forName("Cp1252"));
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) {
            hex.append(String.format("%02X", b));
        }
        return hex.toString();
    }

    /** An entered $0 is the same line 2 and line 3 as leaving the notary amount unanswered. */
    @Test
    void zeroNotaryPrintsTheSameLine3AsAnUnansweredAmount() throws Exception {
        byte[] omitted = generate(selfEmployed("170000.00", "170000.00", "20000.00"));
        Map<String, String> zeroFacts = selfEmployed("170000.00", "170000.00", "20000.00");
        zeroFacts.put("/scheduleCBusinesses/#" + BIZ + "/notaryNetProfit", dollar("0.00"));
        byte[] zero = generate(zeroFacts);
        try (PDDocument omittedDoc = Loader.loadPDF(omitted);
                PDDocument zeroDoc = Loader.loadPDF(zero)) {
            Map<String, String> omittedFields = fieldsOnPages(omittedDoc, SE_FOOTER);
            Map<String, String> zeroFields = fieldsOnPages(zeroDoc, SE_FOOTER);
            amount(omittedFields, "Page1[0].f1_5[0]", 20000, "2");
            amount(omittedFields, "Page1[0].f1_6[0]", 20000, "3");
            amount(zeroFields, "Page1[0].f1_5[0]", 20000, "2 with $0 notary");
            amount(zeroFields, "Page1[0].f1_6[0]", 20000, "3 with $0 notary");
            assertFalse(new PDFTextStripper().getText(zeroDoc).contains("Exempt\u2014Notary"));
        }
    }

    /**
     * Gross receipts $9,000 and expenses $3,500. Line 31 is $5,500, under $8,186 and under 72.189% of line 7.
     * Line 17 is two-thirds of $9,000, $6,000, which is under line 16 ($7,560) and at least actual net earnings of
     * $5,079. Line 2 is skipped, so lines 2, 3, and 4a are blank and line 4c is line 4b. 2026 draft Schedule SE, PDF
     * p. 3. 26 U.S.C. 1402(a), 1402(l)(1). Wages of $170,000 keep the earned income credit and the additional child
     * tax credit off this return, so the election prints. Line 10 is still 12.4% of $6,000 because that amount is
     * under the remaining wage base.
     */
    @Test
    void nonfarmOptionalMethodPrintsLines16And17OnLine4b() throws Exception {
        Map<String, String> facts = selfEmployed("170000.00", "170000.00", "9000.00");
        facts.put("/scheduleCBusinesses/#" + BIZ + "/writableTotalExpenses", dollar("3500.00"));
        facts.put("/usesSeOptionalMethod", bool(true));
        facts.put("/hadAtLeast400NetEarningsInTwoOfPriorThreeYears", bool(true));
        facts.put("/nonfarmOptionalMethodUsedFewerThanFivePriorYears", bool(true));
        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule SE printed");
            blank(se, "Page1[0].f1_5[0]", "2 skipped");
            blank(se, "Page1[0].f1_6[0]", "3 skipped");
            blank(se, "Page1[0].f1_7[0]", "4a skipped");
            amount(se, "Page1[0].f1_8[0]", 6000, "4b = line 17");
            amount(se, "Page1[0].f1_9[0]", 6000, "4c = 4b");
            amount(se, "Page1[0].f1_12[0]", 6000, "6");
            amount(se, "Page1[0].f1_19[0]", 744, "10 = 6,000 x 12.4%");
            amount(se, "Page1[0].f1_20[0]", 174, "11 = 6,000 x 2.9%");
            amount(se, "Page1[0].f1_21[0]", 918, "12");
            amount(se, "Page1[0].f1_22[0]", 459, "13 = 918 x 50%");
            blank(se, "Page2[0].f2_1[0]", "14 preprinted");
            blank(se, "Page2[0].f2_2[0]", "15 farm optional method");
            amount(se, "Page2[0].f2_3[0]", 7560, "16");
            amount(se, "Page2[0].f2_4[0]", 6000, "17");
        }
    }

    @Test
    void scheduleSESkipsLines8dTo10AtTheWageBase() throws Exception {
        byte[] bytes = generate(selfEmployed("190000.00", "184500.00", "20000.00"));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule SE printed");
            amount(se, "Page1[0].f1_7[0]", 18470, "4a");
            amount(se, "Page1[0].f1_14[0]", 184500, "8a");
            blank(se, "Page1[0].f1_17[0]", "8d (skipped: 8a is $184,500 or more)");
            blank(se, "Page1[0].f1_18[0]", "9 (skipped)");
            blank(se, "Page1[0].f1_19[0]", "10 (skipped)");
            amount(se, "Page1[0].f1_20[0]", 536, "11 = 6 x 2.9%");
            amount(se, "Page1[0].f1_21[0]", 536, "12 = 10 + 11");
            amount(se, "Page1[0].f1_22[0]", 268, "13 = 12 x 50%");
            Map<String, String> s2 = fieldsOnPages(doc, "Schedule 2 (Form 1040) 2026");
            amount(s2, "Page1[0].f1_15[0]", 536, "Schedule 2 line 4 = Schedule SE line 12");
        }
    }

    /**
     * Church employee income of $10,000 with Schedule C profit of $30,000. Line 5b is round($10,000 × 0.9235) =
     * $9,235. Line 4c stays $27,705 because it is at least $400. Line 6 is $36,940. 2026 draft Schedule SE, PDF p. 2,
     * lines 5a, 5b, and 6. 26 U.S.C. 1402(a)(12), 1402(j)(2), 1402(j)(3). W-2 social security wages of $170,000 still
     * limit line 10 to the remaining wage base.
     */
    @Test
    void churchEmployeeIncomeIsAddedOnLine6() throws Exception {
        Map<String, String> facts = selfEmployed("170000.00", "170000.00", "30000.00");
        facts.put("/hadChurchEmployeeIncome", bool(true));
        facts.put("/churchEmployeeIncome", dollar("10000.00"));
        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule SE printed");
            amount(se, "Page1[0].f1_7[0]", 27705, "4a");
            amount(se, "Page1[0].f1_9[0]", 27705, "4c");
            amount(se, "Page1[0].f1_10[0]", 10000, "5a");
            amount(se, "Page1[0].f1_11[0]", 9235, "5b = 10,000 x 92.35%");
            amount(se, "Page1[0].f1_12[0]", 36940, "6 = 4c + 5b");
            amount(se, "Page1[0].f1_19[0]", 1798, "10 still limited by line 9");
            amount(se, "Page1[0].f1_20[0]", 1071, "11 = 36,940 x 2.9%");
            amount(se, "Page1[0].f1_21[0]", 2869, "12");
            amount(se, "Page1[0].f1_22[0]", 1435, "13 = 2,869 x 50%");
        }
    }

    /**
     * Only church employee income of $108.28. That amount times 92.35% is $100, so line 5b is $100. Line 4c is under
     * $400 and prints blank. 2026 draft Instructions for Schedule SE, PDF p. 2 and PDF p. 4. 26 U.S.C. 1402(j)(2)(B).
     */
    @Test
    void churchEmployeeIncomeAtThe100FloorPrintsLine5b() throws Exception {
        Map<String, String> facts = selfEmployed("0.00", "0.00", "0.00");
        facts.put("/hadChurchEmployeeIncome", bool(true));
        facts.put("/churchEmployeeIncome", dollar("108.28"));
        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertFalse(se.isEmpty(), "Schedule SE printed");
            blank(se, "Page1[0].f1_9[0]", "4c under $400");
            assertEquals(10828, cents(value(se, "Page1[0].f1_10[0]")), "5a");
            amount(se, "Page1[0].f1_11[0]", 100, "5b");
            amount(se, "Page1[0].f1_12[0]", 100, "6 = 5b");
            amount(se, "Page1[0].f1_19[0]", 12, "10 = 100 x 12.4%");
            amount(se, "Page1[0].f1_20[0]", 3, "11 = 100 x 2.9%");
            amount(se, "Page1[0].f1_21[0]", 15, "12");
            amount(se, "Page1[0].f1_22[0]", 8, "13");
        }
    }

    /** Church employee income of $100 produces line 5b under $100, and line 4c under $400, so no Schedule SE. */
    @Test
    void churchEmployeeIncomeUnder100DoesNotPrintScheduleSE() throws Exception {
        Map<String, String> facts = selfEmployed("50000.00", "50000.00", "400.00");
        facts.put("/hadChurchEmployeeIncome", bool(true));
        facts.put("/churchEmployeeIncome", dollar("100.00"));
        byte[] bytes = generate(facts);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(
                    text.contains(SE_FOOTER), "no Schedule SE when line 5b is under $100 and line 4c is under $400");
        }
    }

    @Test
    void noScheduleSEUnder400NetEarnings() throws Exception {
        byte[] bytes = generate(selfEmployed("50000.00", "50000.00", "400.00"));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains(SE_FOOTER), "no Schedule SE when line 4c is under $400");
        }
    }

    /** Every mapped field's tooltip (AcroForm /TU) names the line the field map puts there. */
    @Test
    void mappedFieldTooltipsNameTheIntendedLines() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("f1_1[0]", "Name of person with self-employment income");
        expected.put("f1_2[0]", "Social security number of person with self-employment income");
        expected.put("f1_5[0]", "2. Net profit or (loss) from Schedule C, line 31");
        expected.put("f1_6[0]", "3. Combine lines 1a, 1b, and 2");
        expected.put("f1_7[0]", "4a. If line 3 is more than zero, multiply line 3 by 92.35% (0.9235)");
        expected.put(
                "f1_8[0]", "4b. If you elect one or both of the optional methods, enter the total of lines 15 and 17");
        expected.put("f1_9[0]", "4c. Combine lines 4a and 4b");
        expected.put("f1_10[0]", "5a. Enter your church employee income from Form W-2");
        expected.put("f1_11[0]", "5b. Multiply line 5a by 92.35% (0.9235). If less than $100");
        expected.put("f2_3[0]", "16. Subtract line 15 from line 14");
        expected.put("f2_4[0]", "17. Enter the smaller of: two-thirds (2/3) of gross nonfarm income");
        expected.put("f1_12[0]", "6. Add lines 4c and 5b");
        expected.put("f1_14[0]", "8a. Total social security wages and tips (total of boxes 3 and 7 on Form(s) W-2)");
        expected.put("f1_17[0]", "8d. Add lines 8a, 8b, and 8c");
        expected.put("f1_18[0]", "9. Subtract line 8d from line 7");
        expected.put("f1_19[0]", "10. Multiply the smaller of line 6 or line 9 by 12.4% (0.124)");
        expected.put("f1_20[0]", "11. Multiply line 6 by 2.9% (0.029)");
        expected.put(
                "f1_21[0]",
                "12. Self-employment tax. Add lines 10 and 11. Enter here and on Schedule 2 (Form 1040), line 4");
        expected.put(
                "f1_22[0]",
                "13. Deduction for one-half of self-employment tax. Multiply line 12 by 50% (0.50). Enter here and on Schedule 1 (Form 1040), line 15");

        String config = new String(
                new ClassPathResource("pdf/2026/IRS1040SSE/en/configuration.yml").getContentAsByteArray(),
                java.nio.charset.StandardCharsets.UTF_8);
        try (PDDocument doc = Loader.loadPDF(new ClassPathResource(TEMPLATE).getContentAsByteArray())) {
            var form = doc.getDocumentCatalog().getAcroForm();
            int mapped = 0;
            for (String line : config.split("\n")) {
                var m = java.util.regex.Pattern.compile("^\\s+(f[12]_\\d+\\[0\\]):\\s*/")
                        .matcher(line);
                if (m.find()) {
                    mapped++;
                    String name = m.group(1);
                    assertTrue(expected.containsKey(name), "tooltip expectation for mapped field " + name);
                    String page = name.startsWith("f2_") ? "Page2[0]." : "Page1[0].";
                    PDField field = form.getField("topmostSubform[0]." + page + name);
                    assertNotNull(field, name + " exists in the draft");
                    String tooltip = field.getAlternateFieldName().replaceAll("\\s+", " ");
                    assertTrue(
                            tooltip.contains(expected.get(name)),
                            name + " tooltip names the line: expected \"" + expected.get(name) + "\" in \"" + tooltip
                                    + "\"");
                }
            }
            assertEquals(expected.size(), mapped, "every expected field is mapped");
        }
    }

    /**
     * One spouse-owned Schedule C on a joint return prints under the spouse's name and SSN, and that spouse's
     * Schedule SE uses only the spouse's own wage base. Primary W-2 $80,000, withholding $8,000, spouse net
     * $20,000. 2026 Instructions for Schedule SE, p. 2. 26 U.S.C. 1402(b)(1). The spouse has no W-2, so line 8a
     * is blank and line 10 is the full 12.4%. Owes $1,851.
     */
    @Test
    void spouseScheduleCPrintsTheSpousesOwnScheduleCAndScheduleSE() throws Exception {
        byte[] bytes = generate(spouseOwnedScheduleC());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, "Schedule C (Form 1040) 2026");
            assertTrue(value(sc, "Page1[0].f1_1[0]").toUpperCase().contains("BLAIR"), "Schedule C proprietor");
            assertEquals("900000002", value(sc, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "Schedule C SSN");
            amount(sc, "Page1[0].f1_51[0]", 20000, "Schedule C line 31");

            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertTrue(value(se, "Page1[0].f1_1[0]").toUpperCase().contains("BLAIR"), "Schedule SE name");
            assertEquals("900000002", value(se, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "Schedule SE SSN");
            amount(se, "Page1[0].f1_5[0]", 20000, "2");
            amount(se, "Page1[0].f1_7[0]", 18470, "4a");
            blank(se, "Page1[0].f1_14[0]", "8a (spouse has no W-2)");
            amount(se, "Page1[0].f1_19[0]", 2290, "10");
            amount(se, "Page1[0].f1_20[0]", 536, "11");
            amount(se, "Page1[0].f1_21[0]", 2826, "12");
            amount(se, "Page1[0].f1_22[0]", 1413, "13");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 20000, "Schedule 1 line 3");
            amount(s1, "Page2[0].f2_05[0]", 1413, "Schedule 1 line 15");
            Map<String, String> s2 = fieldsOnPages(doc, "Schedule 2 (Form 1040) 2026");
            amount(s2, "Page1[0].f1_15[0]", 2826, "Schedule 2 line 4");

            Map<String, String> f8995 = fieldsOnPages(doc, "Form 8995 (2026)");
            amount(f8995, "Table[0].Row1i[0].f1_5[0]", 18587, "Form 8995 line 1(i)(c)");
            amount(f8995, "Page1[0].f1_21[0]", 3717, "line 5 = round(18,587 x 20%)");
            amount(f8995, "Page1[0].f1_27[0]", 66387, "line 11");
            amount(f8995, "Page1[0].f1_30[0]", 13277, "line 14 = round(66,387 x 20%)");
            amount(f8995, "Page1[0].f1_33[0]", 3717, "line 17");

            Map<String, String> f1040 = fieldsOnPages(doc, "Form 1040 (2026)");
            amount(f1040, "Page1[0].f1_75[0]", 98587, "AGI");
            amount(f1040, "Page2[0].f2_17[0]", 9851, "total tax");
            amount(f1040, "Page2[0].f2_40[0]", 1851, "balance due");
        }
    }

    /**
     * Golden T (#135). Florida, married filing jointly. Primary W-2 $120,000. Spouse Schedule C $40,000, no expenses.
     * Form 1099-DIV box 1a $5,000, box 1b $3,000, box 2a $4,000, box 2d $1,000. Estimated payments $8,000. The facts
     * are {@code golden-profileT-complete.json}. Form 8995 has no MeF mapping, so submission stops. The print path
     * still fills the forms.
     *
     * <p>Spouse Schedule SE: line 4a $36,940, line 10 $4,581, line 11 $1,071, line 12 $5,652, line 13 $2,826. The
     * spouse has no W-2, so line 8a is blank. QBI is $37,174. Form 8995 line 5 is $7,435 and line 14 is $25,395. Form
     * 1040 line 13b is $7,435 and line 13a is blank. Taxable income is $126,539. Schedule D line 18 is $1,000, so line
     * 20 is No and the tax on line 16 is $16,843. Total tax is $22,495. Payments are $22,000. Balance due is $495.
     */
    @Test
    void goldenTPrintsSpouseScheduleCScheduleSeScheduleDScheduleBAndForm8995() throws Exception {
        byte[] bytes = ScheduleATy2026PdfSmokeTest.generatePublicPrintOf(
                "submission-blocking/golden-profileT-complete.json");
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> sc = fieldsOnPages(doc, "Schedule C (Form 1040) 2026");
            assertTrue(value(sc, "Page1[0].f1_1[0]").toUpperCase().contains("EDEN"), "Schedule C proprietor");
            assertEquals("444002014", value(sc, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "Schedule C SSN");
            assertEquals("Example Studio", value(sc, "Page1[0].f1_5[0]").trim(), "Schedule C business name");
            amount(sc, "Page1[0].f1_13[0]", 40000, "Schedule C line 1");
            amount(sc, "Page1[0].f1_19[0]", 40000, "Schedule C line 7");
            amount(sc, "Page1[0].f1_47[0]", 40000, "Schedule C line 29");
            amount(sc, "Page1[0].f1_51[0]", 40000, "Schedule C line 31");

            Map<String, String> se = fieldsOnPages(doc, SE_FOOTER);
            assertTrue(value(se, "Page1[0].f1_1[0]").toUpperCase().contains("EDEN"), "Schedule SE name");
            assertEquals("444002014", value(se, "Page1[0].f1_2[0]").replaceAll("\\D", ""), "Schedule SE SSN");
            amount(se, "Page1[0].f1_5[0]", 40000, "2");
            amount(se, "Page1[0].f1_7[0]", 36940, "4a");
            blank(se, "Page1[0].f1_14[0]", "8a (spouse has no W-2)");
            amount(se, "Page1[0].f1_19[0]", 4581, "10");
            amount(se, "Page1[0].f1_20[0]", 1071, "11");
            amount(se, "Page1[0].f1_21[0]", 5652, "12");
            amount(se, "Page1[0].f1_22[0]", 2826, "13");

            Map<String, String> sd = fieldsOnPages(doc, "Schedule D (Form 1040) 2026");
            amount(sd, "Page1[0].f1_41[0]", 4000, "Schedule D line 13");
            amount(sd, "Page1[0].f1_43[0]", 4000, "Schedule D line 15");
            amount(sd, "Page2[0].f2_1[0]", 4000, "Schedule D line 16");
            amount(sd, "Page2[0].f2_2[0]", 1000, "Schedule D line 18");
            blank(sd, "Page2[0].f2_3[0]", "Schedule D line 19");
            assertTrue(Ty2026PdfPackageTest.checked(sd, "Page2[0].c2_1[0]"), "Schedule D line 17 Yes");
            assertFalse(Ty2026PdfPackageTest.checked(sd, "Page2[0].c2_1[1]"), "Schedule D line 17 No");
            assertFalse(Ty2026PdfPackageTest.checked(sd, "Page2[0].c2_2[0]"), "Schedule D line 20 Yes");
            assertTrue(Ty2026PdfPackageTest.checked(sd, "Page2[0].c2_2[1]"), "Schedule D line 20 No");

            Map<String, String> sb = fieldsOnPages(doc, "Schedule B (Form 1040) 2026");
            // Part II row 0 sits under ReadOrderControl, so the payer name does not end with Page1[0].f1_34.
            assertEquals("Example Dividend Fund", value(sb, "f1_34[0]").trim(), "Schedule B payer");
            amount(sb, "f1_35[0]", 5000, "Schedule B line 5");
            amount(sb, "f1_64[0]", 5000, "Schedule B line 6");
            assertFalse(Ty2026PdfPackageTest.checked(sb, "c1_1[0]"), "Schedule B line 7a Yes");
            assertTrue(Ty2026PdfPackageTest.checked(sb, "c1_1[1]"), "Schedule B line 7a No");

            Map<String, String> s1 = fieldsOnPages(doc, "Schedule 1 (Form 1040) 2026");
            amount(s1, "Page1[0].f1_07[0]", 40000, "Schedule 1 line 3");
            amount(s1, "Page2[0].f2_05[0]", 2826, "Schedule 1 line 15");
            Map<String, String> s2 = fieldsOnPages(doc, "Schedule 2 (Form 1040) 2026");
            amount(s2, "Page1[0].f1_15[0]", 5652, "Schedule 2 line 4");

            Map<String, String> f8995 = fieldsOnPages(doc, "Form 8995 (2026)");
            assertEquals("Example Studio", value(f8995, "Table[0].Row1i[0].f1_3[0]").trim(), "Form 8995 name");
            amount(f8995, "Table[0].Row1i[0].f1_5[0]", 37174, "Form 8995 line 1(i)(c)");
            amount(f8995, "Page1[0].f1_18[0]", 37174, "line 2");
            amount(f8995, "Page1[0].f1_21[0]", 7435, "line 5");
            amount(f8995, "Page1[0].f1_27[0]", 133974, "line 11");
            amount(f8995, "Page1[0].f1_28[0]", 7000, "line 12");
            amount(f8995, "Page1[0].f1_30[0]", 25395, "line 14");
            amount(f8995, "Page1[0].f1_32[0]", 400, "line 16");
            amount(f8995, "Page1[0].f1_33[0]", 7435, "line 17");

            Map<String, String> f1040 = fieldsOnPages(doc, "Form 1040 (2026)");
            assertTrue(value(f1040, "Page1[0].f1_14[0]").toUpperCase().contains("WREN"), "Form 1040 first name");
            assertTrue(value(f1040, "Page1[0].f1_17[0]").toUpperCase().contains("EDEN"), "Form 1040 spouse");
            amount(f1040, "Page1[0].f1_47[0]", 120000, "line 1a");
            amount(f1040, "Page1[0].f1_60[0]", 3000, "line 3a");
            amount(f1040, "Page1[0].f1_61[0]", 5000, "line 3b");
            amount(f1040, "Page1[0].f1_70[0]", 4000, "line 7a");
            amount(f1040, "Page1[0].f1_73[0]", 169000, "line 9");
            amount(f1040, "Page1[0].f1_74[0]", 2826, "line 10");
            amount(f1040, "Page1[0].f1_75[0]", 166174, "line 11a");
            amount(f1040, "Page2[0].f2_02[0]", 32200, "line 12e");
            blank(f1040, "Page2[0].f2_04[0]", "line 13a");
            amount(f1040, "Page2[0].f2_05[0]", 7435, "line 13b");
            amount(f1040, "Page2[0].f2_06[0]", 39635, "line 14");
            amount(f1040, "Page2[0].f2_07[0]", 126539, "line 15");
            amount(f1040, "Page2[0].f2_09[0]", 16843, "line 16");
            amount(f1040, "Page2[0].f2_16[0]", 5652, "line 23");
            amount(f1040, "Page2[0].f2_17[0]", 22495, "line 24a");
            // Line 25a sits under Line25_ReadOrder, so the name does not end with Page2[0].f2_20.
            amount(f1040, "f2_20[0]", 14000, "line 25a");
            amount(f1040, "Page2[0].f2_24[0]", 8000, "line 26");
            amount(f1040, "Page2[0].f2_34[0]", 22000, "line 33");
            blank(f1040, "Page2[0].f2_35[0]", "line 34");
            amount(f1040, "Page2[0].f2_40[0]", 495, "line 37");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Form 6251 (2026)"), "no Form 6251");
            assertFalse(text.contains("Form 8959 (2026)"), "no Form 8959");
            assertFalse(text.contains("Form 8960 (2026)"), "no Form 8960");
            assertFalse(text.contains("SCHEDULE A (Form 1040) 2026"), "no Schedule A");
            assertFalse(
                    PaPit40ScheduleSpTy2026PdfSmokeTest.pageWith(doc, PaPit40ScheduleSpTy2026PdfSmokeTest.PA40_PAGE1),
                    "no PA-40");
        }
    }
}
