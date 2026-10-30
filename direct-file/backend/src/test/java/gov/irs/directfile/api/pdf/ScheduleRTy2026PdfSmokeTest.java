package gov.irs.directfile.api.pdf;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
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
 * #89 / #124: 2026 Schedule R final (https://www.irs.gov/pub/irs-pdf/f1040sr.pdf, SHA-256 {@value #SCHEDULE_R_SHA},
 * published Oct 29 2026 ET) through the real PdfService, fact dictionary and application.yaml. The final has the
 * draft's 32 field names, no cover page, and no /TU tooltips, so the field map is checked by name and by page text.
 *
 * <p>Golden end-to-end scenario (synthetic data): single, under 65, retired on permanent and total disability, W-2
 * wages $17,000 that are taxable disability income, standard deduction. Worked figures (2026 Schedule R; 26 U.S.C.
 * 22; Instructions for Schedule R (2026) draft, PDF p. 7, Table 1; Rev. Proc. 2025-32 §4.01 and §4.14):
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
    static final String SCHEDULE_R_SHA = "945275e6be3cc7353a3faf165ddd7ccb79e3c8a43abe6678d4c47f8207594cb5";
    static final String SCHEDULE_R_PDF = "pdf/2026/SCHEDULE_R/en/f1040sr.pdf";
    static final String SCHEDULE_R_TITLE = "Credit for the Elderly or the Disabled";

    /** Every AcroForm node on the final, in tree order. Same 32 names as the 2026 draft. */
    static final List<String> FIELD_NAMES = List.of(
            "topmostSubform[0]",
            "topmostSubform[0].Page1[0]",
            "topmostSubform[0].Page1[0].f1_1[0]",
            "topmostSubform[0].Page1[0].f1_2[0]",
            "topmostSubform[0].Page1[0].c1_1[0]",
            "topmostSubform[0].Page1[0].c1_1[1]",
            "topmostSubform[0].Page1[0].Married[0]",
            "topmostSubform[0].Page1[0].Married[0].c1_1[0]",
            "topmostSubform[0].Page1[0].Married[0].c1_1[1]",
            "topmostSubform[0].Page1[0].Married[0].c1_1[2]",
            "topmostSubform[0].Page1[0].Married[0].c1_1[3]",
            "topmostSubform[0].Page1[0].Married[0].c1_1[4]",
            "topmostSubform[0].Page1[0].MarriedSeparate[0]",
            "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[0]",
            "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[1]",
            "topmostSubform[0].Page1[0].c1_2[0]",
            "topmostSubform[0].Page2[0]",
            "topmostSubform[0].Page2[0].f2_1[0]",
            "topmostSubform[0].Page2[0].f2_2[0]",
            "topmostSubform[0].Page2[0].f2_3[0]",
            "topmostSubform[0].Page2[0].f2_4[0]",
            "topmostSubform[0].Page2[0].f2_5[0]",
            "topmostSubform[0].Page2[0].f2_6[0]",
            "topmostSubform[0].Page2[0].f2_7[0]",
            "topmostSubform[0].Page2[0].f2_8[0]",
            "topmostSubform[0].Page2[0].f2_9[0]",
            "topmostSubform[0].Page2[0].f2_10[0]",
            "topmostSubform[0].Page2[0].f2_11[0]",
            "topmostSubform[0].Page2[0].f2_12[0]",
            "topmostSubform[0].Page2[0].f2_13[0]",
            "topmostSubform[0].Page2[0].f2_14[0]",
            "topmostSubform[0].Page2[0].f2_15[0]");

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
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "no draft cover sheet");
            assertFalse(text.contains("DRAFT—NOT FOR FILING"), "final form");
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

    /**
     * The final has no /TU tooltips. Each mapped field keeps the draft's name, and the page that holds its widget
     * still prints the line the field map fills.
     */
    @Test
    void mappedFieldsKeepTheirNamesAndPageTextNamesTheLines() throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("Page1[0].f1_1[0]", "Name(s) shown on return");
        expected.put("Page1[0].f1_2[0]", "Your social security number");
        expected.put("Page1[0].c1_1[0]", "You were 65 or older");
        expected.put("Page1[0].c1_1[1]", "You were under 65 and you retired on permanent and total disability");
        expected.put("Married[0].c1_1[0]", "Both spouses were 65 or older");
        expected.put("Married[0].c1_1[1]", "Both spouses were under 65, but only one spouse retired");
        expected.put("Married[0].c1_1[2]", "Both spouses were under 65, and both retired");
        expected.put(
                "Married[0].c1_1[3]", "the other spouse was under 65 and retired on permanent and total disability");
        expected.put("Married[0].c1_1[4]", "the other spouse was under 65 and not retired");
        expected.put("MarriedSeparate[0].c1_1[0]", "You were 65 or older and you lived apart");
        expected.put(
                "MarriedSeparate[0].c1_1[1]",
                "You were under 65, you retired on permanent and total disability, and you lived apart");
        expected.put("Page1[0].c1_2[0]", "have to get another statement for 2026");
        expected.put("Page2[0].f2_1[0]", "Box 1, 2, 4, or 7");
        expected.put("Page2[0].f2_2[0]", "Box 6, add $5,000 to the taxable disability income");
        expected.put("Page2[0].f2_3[0]", "If you completed line 11, enter the smaller of line 10 or line 11");
        expected.put("Page2[0].f2_4[0]", "Nontaxable part of social security benefits");
        expected.put("Page2[0].f2_5[0]", "Nontaxable veterans");
        expected.put("Page2[0].f2_6[0]", "Add lines 13a and 13b");
        expected.put("Page2[0].f2_7[0]", "Enter the amount from Form 1040 or 1040-SR");
        expected.put("Page2[0].f2_8[0]", "Box 1 or 2");
        expected.put("Page2[0].f2_9[0]", "Subtract line 15 from line 14");
        expected.put("Page2[0].f2_10[0]", "Enter one-half of line 16");
        expected.put("Page2[0].f2_11[0]", "Add lines 13c and 17");
        expected.put("Page2[0].f2_12[0]", "Subtract line 18 from line 12");
        expected.put("Page2[0].f2_13[0]", "Multiply line 19 by 15%");
        expected.put("Page2[0].f2_14[0]", "Tax liability limit");
        expected.put("Page2[0].f2_15[0]", "Credit for the elderly or the disabled");
        assertEquals(27, expected.size(), "every Part I box and Part III line");

        String config = new String(
                new ClassPathResource("pdf/2026/SCHEDULE_R/en/configuration.yml").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        assertTrue(config.contains("YEAR-BASED MAPPING"), "field map is flagged as year-based");
        assertTrue(config.contains(SCHEDULE_R_SHA), "configuration pins the final SHA-256");
        assertFalse(config.contains("skipLeadingPages"), "final has no cover page to drop");
        assertFalse(config.contains("pdf/2024/"), "field map does not point at the 2024 template");
        int mapped = 0;
        for (String line : config.split("\n")) {
            if (Pattern.compile("^\\s+\\S+:\\s*/").matcher(line).find()) {
                mapped++;
            }
        }
        assertEquals(expected.size(), mapped, "configuration maps each of these fields");

        byte[] pdf = new ClassPathResource(SCHEDULE_R_PDF).getContentAsByteArray();
        assertEquals(
                SCHEDULE_R_SHA,
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(pdf)),
                "committed final");
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(
                    "2026 Schedule R (Form 1040)", doc.getDocumentInformation().getTitle());
            Calendar created = doc.getDocumentInformation().getCreationDate();
            assertEquals(2026, created.get(Calendar.YEAR));
            assertEquals(Calendar.OCTOBER, created.get(Calendar.MONTH));
            assertEquals(29, created.get(Calendar.DAY_OF_MONTH), "published Oct 29 2026");
            assertEquals(2, doc.getNumberOfPages(), "no draft cover page");

            List<String> names = new ArrayList<>();
            for (PDField field : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                names.add(field.getFullyQualifiedName());
                String tooltip = field.getAlternateFieldName();
                assertTrue(tooltip == null || tooltip.isBlank(), field.getFullyQualifiedName() + " has no /TU tooltip");
            }
            assertEquals(FIELD_NAMES, names, "32 fields, same names as the draft");

            List<String> pages = new ArrayList<>();
            PDFTextStripper stripper = new PDFTextStripper();
            for (int i = 0; i < doc.getNumberOfPages(); i++) {
                stripper.setStartPage(i + 1);
                stripper.setEndPage(i + 1);
                pages.add(stripper.getText(doc).replaceAll("\\s+", " "));
            }
            assertFalse(pages.get(0).contains("The draft you are looking for begins on the next page"));
            assertFalse(String.join(" ", pages).contains("DRAFT—NOT FOR FILING"));
            Map<COSDictionary, Integer> widgetPage = new HashMap<>();
            int pageIndex = 0;
            for (PDPage page : doc.getPages()) {
                for (PDAnnotation annotation : page.getAnnotations()) {
                    widgetPage.put(annotation.getCOSObject(), pageIndex);
                }
                pageIndex++;
            }
            for (var e : expected.entrySet()) {
                PDField field = null;
                for (PDField candidate : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
                    if (candidate.getFullyQualifiedName().endsWith(e.getKey())) {
                        assertTrue(field == null, "suffix is unique: " + e.getKey());
                        field = candidate;
                    }
                }
                assertNotNull(field, e.getKey() + " exists on the final");
                assertEquals(1, field.getWidgets().size(), e.getKey());
                Integer page = widgetPage.get(field.getWidgets().get(0).getCOSObject());
                assertNotNull(page, e.getKey() + " widget page");
                assertTrue(
                        pages.get(page).contains(e.getValue()),
                        e.getKey() + " page text names the line: expected \"" + e.getValue() + "\"");
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
