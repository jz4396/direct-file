package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
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
}
