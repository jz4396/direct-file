package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static gov.irs.directfile.api.pdf.Form8959Form8960Ty2026PdfSmokeTest.W2;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generatePublicPrint;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #89: 2026 draft Schedule R (https://www.irs.gov/pub/irs-dft/f1040sr--dft.pdf) through the real PdfService, fact
 * dictionary and application.yaml. Draft-based field map: re-verify when the final form is released.
 *
 * <p>Golden end-to-end scenario (synthetic data): single, under 65, retired on permanent and total disability, W-2
 * wages $17,000 that are taxable disability income, standard deduction. Worked figures (Schedule R (2026) draft;
 * 26 U.S.C. 22; Instructions for Schedule R (2026) draft, PDF p. 7, Table 1; Rev. Proc. 2025-32 §4.01 and §4.14):
 *
 * <pre>
 *   Part I box 2
 *   10  5,000     boxes 1, 2, 4, or 7 (IRC §22(c)(2)(A)(i))
 *   11  17,000    taxable disability income
 *   12  5,000     smaller of line 10 or line 11
 *   13a blank     no nontaxable social security
 *   13b blank
 *   13c 0         "enter -0-"
 *   14  17,000    Form 1040 line 11b
 *   15  7,500     box 1 or 2 (IRC §22(d), single)
 *   16  9,500
 *   17  4,750     one-half of line 16
 *   18  4,750
 *   19  250
 *   20  38        15% of line 19 (IRC §22(a)); $37.50 rounds half up to $38
 *   21  91        Form 1040 Tax Table on taxable income $900 ($17,000 − $16,100). Income under $3,000 uses
 *                 $25 rows; the midpoint of the $900 row is $912.50 (taxCalculations /roundedTaxableIncome).
 *                 10% of $912.50 is $91.25, which rounds half up to $91 (IRC §1(j)(2)(C); Rev. Proc. 2025-32 §4.01)
 *   22  38        smaller of line 20 or line 21 = Schedule 3 line 6d
 * </pre>
 *
 * AGI $17,000 is under the Table 1 single ceiling of $17,500. Nontaxable pensions are under the $5,000 ceiling.
 */
class ScheduleRTy2026PdfSmokeTest {
    static final String SCHEDULE_R_TITLE = "Credit for the Elderly or the Disabled";

    /** Single filer under 65 with taxable disability income inside the Table 1 limits and with tax to offset. */
    static Map<String, String> disabledSingle() {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("17000.00"));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/nonItemizerHadCashGifts", bool(false));
        m.put("/soldCapitalAssets", bool(false));
        // The shared fixture still lists Form 8949 rows. Those gains stay in AGI while the collection is non-empty
        // (scheduleD2), which would put this return over the Table 1 single ceiling of $17,500.
        m.put(
                "/form8949Transactions",
                "{\"$type\":\"gov.irs.factgraph.persisters.CollectionWrapper\",\"item\":{\"items\":[]}}");
        String p = "/filers/#" + W2 + "/";
        m.put(p + "isRetOnPermOrTotalDisability", bool(true));
        m.put(p + "employerHasMandatoryRetirementAge", bool(false));
        m.put(p + "hasMetEmployerMandatoryRetirementAge", bool(false));
        m.put(p + "arePaymentsTaxDisabilityIncome", bool(true));
        m.put(p + "writableTotalTaxableDisabilityAmount", dollar("17000.00"));
        m.put(p + "hasPhysicianStatementBothDisabledAndWillNotImprove", bool(true));
        m.put(p + "hasSelfCertPhysStatmntOrVetDisbltyVerified", bool(true));
        m.put("/writableHasSelfReportedNonTaxablePayments", bool(false));
        m.put("/writableEdcSelfReportedNonTaxablePaymentAmount", dollar("0.00"));
        return m;
    }

    @Test
    void line22EqualsSchedule3Line6d() throws Exception {
        byte[] bytes = generatePublicPrint(disabledSingle());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "schedule-r-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
            assertTrue(text.contains("by the end of 2026"), "2026 Schedule R, not the 2024 form");

            Map<String, String> scheduleR = fieldsOnPages(doc, SCHEDULE_R_TITLE, "Part III");
            Map<String, String> schedule3 = fieldsOnPages(doc, "Additional Credits and Payments");
            assertFalse(scheduleR.isEmpty(), "Schedule R is included when /isReceivingEdc");
            assertFalse(schedule3.isEmpty(), "Schedule 3 is included when the credit is positive");

            assertTrue(field(scheduleR, "Page1[0].f1_1[0]").contains("McTestface"), "name");
            assertEquals("555-55-5555", field(scheduleR, "Page1[0].f1_2[0]"), "SSN");
            assertFalse(checked(scheduleR, "Page1[0].c1_1[0]"), "box 1");
            assertTrue(checked(scheduleR, "Page1[0].c1_1[1]"), "box 2");
            assertFalse(checked(scheduleR, "Married[0].c1_1[0]"), "box 3");
            assertFalse(checked(scheduleR, "Married[0].c1_1[1]"), "box 4");
            assertFalse(checked(scheduleR, "Married[0].c1_1[2]"), "box 5");
            assertFalse(checked(scheduleR, "Married[0].c1_1[3]"), "box 6");
            assertFalse(checked(scheduleR, "Married[0].c1_1[4]"), "box 7");
            assertFalse(checked(scheduleR, "MarriedSeparate[0].c1_1[0]"), "box 8");
            assertFalse(checked(scheduleR, "MarriedSeparate[0].c1_1[1]"), "box 9");
            assertTrue(checked(scheduleR, "Page1[0].c1_2[0]"), "Part II: no new physician's statement");

            assertEquals(500000, line(scheduleR, "f2_1[0]"), "10");
            assertEquals(1700000, line(scheduleR, "f2_2[0]"), "11");
            assertEquals(500000, line(scheduleR, "f2_3[0]"), "12");
            assertEquals("", field(scheduleR, "Page2[0].f2_4[0]"), "13a blank");
            assertEquals("", field(scheduleR, "Page2[0].f2_5[0]"), "13b blank");
            assertEquals("0.00", field(scheduleR, "Page2[0].f2_6[0]"), "13c enter -0-");
            assertEquals(1700000, line(scheduleR, "f2_7[0]"), "14");
            assertEquals(750000, line(scheduleR, "f2_8[0]"), "15");
            assertEquals(950000, line(scheduleR, "f2_9[0]"), "16");
            assertEquals(475000, line(scheduleR, "f2_10[0]"), "17");
            assertEquals(475000, line(scheduleR, "f2_11[0]"), "18");
            assertEquals(25000, line(scheduleR, "f2_12[0]"), "19");
            assertEquals(3800, line(scheduleR, "f2_13[0]"), "20 = 15% of line 19");
            assertEquals(9100, line(scheduleR, "f2_14[0]"), "21 tax liability limit");
            assertEquals(3800, line(scheduleR, "f2_15[0]"), "22 smaller of line 20 or line 21");
            assertEquals(
                    line(scheduleR, "f2_15[0]"),
                    cents(field(schedule3, "Page1[0].f1_12[0]")),
                    "Schedule R line 22 equals Schedule 3 line 6d");
        }
    }

    /** Each mapped field's tooltip on the 2026 draft names the line the field map fills. */
    @Test
    void mappedFieldTooltipsNameTheIntendedLines() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("Page1[0].f1_1[0]", "Name(s) shown on return");
        expected.put("Page1[0].f1_2[0]", "Your social security number");
        expected.put("Page1[0].c1_1[0]", "1. You were 65 or older");
        expected.put("Page1[0].c1_1[1]", "2. You were under 65");
        expected.put("Married[0].c1_1[0]", "3. Both spouses were 65 or older");
        expected.put("Married[0].c1_1[1]", "4. Both spouses were under 65, but only one spouse");
        expected.put("Married[0].c1_1[2]", "5. Both spouses were under 65, and both retired");
        expected.put("Married[0].c1_1[3]", "6. One spouse was 65 or older, and the other spouse was under 65 and retired");
        expected.put("Married[0].c1_1[4]", "7. One spouse was 65 or older, and the other spouse was under 65 and not");
        expected.put("MarriedSeparate[0].c1_1[0]", "8. You were 65 or older and you lived apart");
        expected.put("MarriedSeparate[0].c1_1[1]", "9. You were under 65, you retired on permanent and total disability, and you lived apart");
        expected.put("Page1[0].c1_2[0]", "you don't have to get another statement for 2026");
        expected.put("Page2[0].f2_1[0]", "10. If you checked");
        expected.put("Page2[0].f2_2[0]", "11. If you checked");
        expected.put("Page2[0].f2_3[0]", "12. If you completed line 11");
        expected.put("Page2[0].f2_4[0]", "13a.");
        expected.put("Page2[0].f2_5[0]", "13b.");
        expected.put("Page2[0].f2_6[0]", "13c.");
        expected.put("Page2[0].f2_7[0]", "14. Enter the amount from Form 1040");
        expected.put("Page2[0].f2_8[0]", "15. If you checked");
        expected.put("Page2[0].f2_9[0]", "16. Subtract line 15 from line 14");
        expected.put("Page2[0].f2_10[0]", "17. Enter one-half of line 16");
        expected.put("Page2[0].f2_11[0]", "18. Add lines 13c and 17");
        expected.put("Page2[0].f2_12[0]", "19. Subtract line 18 from line 12");
        expected.put("Page2[0].f2_13[0]", "20. Multiply line 19 by 15%");
        expected.put("Page2[0].f2_14[0]", "21. Tax liability limit");
        expected.put("Page2[0].f2_15[0]", "22. Credit for the elderly or the disabled");
        assertEquals(27, expected.size(), "every Part I box and Part III line");

        String config = new String(
                new ClassPathResource("pdf/2026/SCHEDULE_R/en/configuration.yml").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        assertTrue(config.toLowerCase().contains("draft"), "field map is flagged as draft-based");
        assertFalse(config.contains("pdf/2024/"), "field map does not point at the 2024 template");
        int mapped = 0;
        for (String line : config.split("\n")) {
            if (Pattern.compile("^\\s+\\S+:\\s*/").matcher(line).find()) {
                mapped++;
            }
        }
        assertEquals(expected.size(), mapped, "configuration maps each of these fields");

        try (PDDocument doc = Loader.loadPDF(
                new ClassPathResource("pdf/2026/SCHEDULE_R/en/f1040sr--dft.pdf").getContentAsByteArray())) {
            for (var e : expected.entrySet()) {
                PDField field = null;
                for (PDField candidate : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                    if (candidate.getFullyQualifiedName().endsWith(e.getKey())) {
                        assertTrue(field == null, "suffix is unique: " + e.getKey());
                        field = candidate;
                    }
                }
                assertNotNull(field, e.getKey() + " exists on the draft");
                String tooltip = field.getAlternateFieldName();
                assertNotNull(tooltip, e.getKey() + " tooltip");
                String normalized = tooltip.replaceAll("\\s+", " ");
                assertTrue(
                        normalized.contains(e.getValue()),
                        e.getKey() + " tooltip names the line: expected \"" + e.getValue() + "\" in \"" + normalized
                                + "\"");
            }
        }
    }

    /**
     * Fields on pages whose text contains either marker. Schedule 3's line 6d caption says "Attach Schedule R", so
     * the Schedule R pages are the ones titled {@code Credit for the Elderly or the Disabled} or headed Part III, and
     * Schedule 3 is "Additional Credits and Payments".
     */
    static Map<String, String> fieldsOnPages(PDDocument doc, String... markers) throws Exception {
        Set<COSBase> widgets = new HashSet<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            String text = stripper.getText(doc);
            boolean hit = false;
            for (String marker : markers) {
                if (text.contains(marker)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                for (PDAnnotation a : doc.getPage(i).getAnnotations()) {
                    if (a instanceof PDAnnotationWidget) {
                        widgets.add(a.getCOSObject());
                    }
                }
            }
        }
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDTerminalField t) {
                for (PDAnnotationWidget w : t.getWidgets()) {
                    if (widgets.contains(w.getCOSObject())) {
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString() == null ? "" : f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    static String field(Map<String, String> fields, String suffix) {
        String found = null;
        for (var e : fields.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique: " + suffix);
                found = e.getValue() == null ? "" : e.getValue();
            }
        }
        assertTrue(found != null, "field present: " + suffix);
        return found;
    }

    static long line(Map<String, String> fields, String name) {
        return cents(field(fields, "Page2[0]." + name));
    }

    static boolean checked(Map<String, String> fields, String suffix) {
        String v = field(fields, suffix);
        return !v.isEmpty() && !"Off".equals(v);
    }
}
