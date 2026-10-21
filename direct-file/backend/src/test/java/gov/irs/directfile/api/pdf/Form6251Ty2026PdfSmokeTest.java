package gov.irs.directfile.api.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.bool;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.cents;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.collection;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.dollar;
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.generate;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #122(a): 2026 draft Form 6251 (https://www.irs.gov/pub/irs-dft/f6251--dft.pdf) end-to-end through the real
 * PdfService, fact dictionary and application.yaml. Draft-based field map: re-verify when the final form is released.
 *
 * <p>Golden scenario (synthetic data, same filer as the Schedule D smoke fixture): single, $100,000 W-2 wages and one
 * $1,000,000 long-term gain (Form 8949 box D), standard deduction. Worked figures (Form 6251 (2026) draft; same numbers
 * as form6251.test.ts "single, $100,000 wages + $1,000,000 LTCG"):
 *
 * <pre>
 *   1a 16,100 (std deduction)    1b 1,083,900    2a 16,100    4 AMTI 1,100,000
 *   5  0 (phased out above $680,200)      6 1,100,000
 *   Part III: 12 1,100,000  13 1,000,000  15 1,000,000  16 1,000,000  17 100,000  18 26,000 (26%)
 *             19 49,450  20 83,900  21 0  22 1,000,000  23 0  24 1,000,000  25 545,500  26 0  27 83,900
 *             28 83,900  29 461,600  30 461,600  31 69,240  32 461,600  33 538,400  34 107,680
 *             38 202,920  39 303,110 (28% x 1,100,000 - 4,890)  40 202,920
 *   7 202,920   9 202,920   10 190,096 (regular tax)   11 AMT 12,824 (= Schedule 2 line 2)
 * </pre>
 */
class Form6251Ty2026PdfSmokeTest {
    static final String LT = "a2222222-2222-4222-8222-222222222222";
    static final String FORM_6251_TITLE = "Alternative Minimum Tax";

    static Map<String, String> amtScenario() {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#959c03d1-af4a-447f-96aa-d19397048a44/writableWages", dollar("100000.00"));
        m.put("/soldCapitalAssets", bool(true));
        m.put("/soldCollectibles", bool(false));
        m.put("/hasUnrecapturedSection1250Gain", bool(false));
        m.put("/hasAmtPreferenceItems", bool(false));
        m.put("/scheduleAWantsToItemize", bool(false));
        m.put("/form8949Transactions", collection(LT));
        m.put("/form8949Transactions/#" + LT + "/proceeds", dollar("1001000.00"));
        m.put("/form8949Transactions/#" + LT + "/costBasis", dollar("1000.00"));
        return m;
    }

    /** Field values of the Form 6251 pages only (fully qualified name -> value), so other forms cannot collide. */
    static Map<String, String> form6251Fields(PDDocument doc) throws Exception {
        Set<COSBase> widgetsOn6251 = new HashSet<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            String text = stripper.getText(doc);
            if (text.contains("Form 6251") && (text.contains(FORM_6251_TITLE) || text.contains("Part III"))) {
                PDPage page = doc.getPage(i);
                for (PDAnnotation a : page.getAnnotations()) {
                    if (a instanceof PDAnnotationWidget) {
                        widgetsOn6251.add(a.getCOSObject());
                    }
                }
            }
        }
        Map<String, String> byName = new HashMap<>();
        for (PDField f : doc.getDocumentCatalog().getAcroForm().getFieldTree()) {
            if (f instanceof PDTerminalField t) {
                for (PDAnnotationWidget w : t.getWidgets()) {
                    if (widgetsOn6251.contains(w.getCOSObject())) {
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    static String field(Map<String, String> f, String suffix) {
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field suffix is unique on Form 6251: " + suffix);
                found = e.getValue() == null ? "" : e.getValue();
            }
        }
        assertTrue(found != null, "Form 6251 field present: " + suffix);
        return found;
    }

    static long line(Map<String, String> f, String fieldName) {
        String page = fieldName.startsWith("f1_") ? "Page1[0]." : "Page2[0].";
        return cents(field(f, page + fieldName));
    }

    @Test
    void amtReturnPrints6251PartIAndPartIIIAndTiesToSchedule2() throws Exception {
        byte[] bytes = generate(amtScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form6251-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = form6251Fields(doc);
            assertFalse(f.isEmpty(), "Form 6251 is included when AMT > 0 (i6251 (2025) p. 1, Who Must File, item 1)");
            assertTrue(field(f, "Page1[0].f1_1[0]").contains("McTestface"), "name line");
            assertEquals("555-55-5555", field(f, "Page1[0].f1_2[0]"), "SSN");

            // Part I
            assertEquals(1610000, line(f, "f1_3[0]"), "1a = Form 1040 line 14 - Schedule 1-A line 43");
            assertEquals(108390000, line(f, "f1_4[0]"), "1b = Form 1040 line 11b - line 1a");
            assertEquals(1610000, line(f, "f1_5[0]"), "2a = Form 1040 line 12e (no Schedule A)");
            assertEquals(110000000, line(f, "f1_26[0]"), "4 AMTI = 1b + 2a");
            // $0 amounts print blank unless the form says to enter -0- (those facts carry ExportZero).
            assertEquals("", field(f, "Page1[0].f1_27[0]"), "5 exemption fully phased out: $0, blank");
            assertEquals(110000000, line(f, "f1_28[0]"), "6 = 4 - 5");
            assertEquals(20292000, line(f, "f1_29[0]"), "7 = Part III line 40");
            assertEquals(20292000, line(f, "f1_31[0]"), "9 = 7 - 8");
            assertEquals(19009600, line(f, "f1_32[0]"), "10 regular tax (Form 1040 line 16)");
            assertEquals(1282400, line(f, "f1_33[0]"), "11 AMT = 9 - 10");

            // Part III
            assertEquals(110000000, line(f, "f2_1[0]"), "12 = line 6");
            assertEquals(100000000, line(f, "f2_2[0]"), "13 = QDCG worksheet line 4");
            assertEquals(100000000, line(f, "f2_4[0]"), "15 = line 13");
            assertEquals(100000000, line(f, "f2_5[0]"), "16 = smaller of 12 or 15");
            assertEquals(10000000, line(f, "f2_6[0]"), "17 = 12 - 16");
            assertEquals(2600000, line(f, "f2_7[0]"), "18 = 26% of 17");
            assertEquals(4945000, line(f, "f2_8[0]"), "19 single zero-rate amount $49,450");
            assertEquals(8390000, line(f, "f2_9[0]"), "20 = QDCG worksheet line 5");
            assertEquals("0.00", field(f, "Page2[0].f2_10[0]"), "21 = 19 - 20; \"If zero or less, enter -0-\"");
            assertEquals(100000000, line(f, "f2_11[0]"), "22 = smaller of 12 or 13");
            assertEquals("", field(f, "Page2[0].f2_12[0]"), "23 = smaller of 21 or 22: $0, blank");
            assertEquals(100000000, line(f, "f2_13[0]"), "24 = 22 - 23");
            assertEquals(54550000, line(f, "f2_14[0]"), "25 single 15%-rate amount $545,500");
            assertEquals("0.00", field(f, "Page2[0].f2_15[0]"), "26 = line 21");
            assertEquals(8390000, line(f, "f2_16[0]"), "27 = QDCG worksheet line 5");
            assertEquals(8390000, line(f, "f2_17[0]"), "28 = 26 + 27");
            assertEquals(46160000, line(f, "f2_18[0]"), "29 = 25 - 28");
            assertEquals(46160000, line(f, "f2_19[0]"), "30 = smaller of 24 or 29");
            assertEquals(6924000, line(f, "f2_20[0]"), "31 = 15% of 30");
            assertEquals(46160000, line(f, "f2_21[0]"), "32 = 23 + 30");
            assertEquals(53840000, line(f, "f2_22[0]"), "33 = 22 - 32 (lines 32 and 12 differ)");
            assertEquals(10768000, line(f, "f2_23[0]"), "34 = 20% of 33");
            assertEquals(20292000, line(f, "f2_27[0]"), "38 = 18 + 31 + 34 + 37");
            assertEquals(30311000, line(f, "f2_28[0]"), "39 = 28% of 12 - $4,890");
            assertEquals(20292000, line(f, "f2_29[0]"), "40 = smaller of 38 or 39");

            // Lines that stay blank (each nonzero case is a submission-blocking stop, or the form says to skip).
            assertEquals("", field(f, "Page1[0].f1_6[0]"), "2b blank");
            assertEquals("", field(f, "Page1[0].f1_13[0]"), "2i blank");
            assertEquals("", field(f, "Page1[0].f1_25[0]"), "3 blank");
            assertEquals("", field(f, "Page1[0].f1_30[0]"), "8 blank");
            assertEquals("", field(f, "Page2[0].f2_3[0]"), "14 blank");
            assertEquals("", field(f, "Page2[0].f2_24[0]"), "35 blank (line 14 is zero or blank)");
            assertEquals("", field(f, "Page2[0].f2_26[0]"), "37 blank");
            assertNoCents(f);

            // Draft cover sheet dropped; Form 6251 is two pages.
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    /**
     * Every amount on the printed Form 6251 is in whole dollars, as on the rest of the return (#178): blank, or a
     * number whose fractional part is .00. Other fields (name, SSN) have no decimal point.
     */
    static void assertNoCents(Map<String, String> f) {
        assertTrue(f.keySet().stream().anyMatch(k -> k.contains("Page1[0]")), "Form 6251 page 1 fields read");
        assertTrue(f.keySet().stream().anyMatch(k -> k.contains("Page2[0]")), "Form 6251 page 2 fields read");
        for (var e : f.entrySet()) {
            String v = e.getValue() == null ? "" : e.getValue().trim();
            if (v.contains(".")) {
                assertTrue(v.matches("-?[0-9,]+\\.00"), "whole dollars on Form 6251: " + e.getKey() + " = " + v);
            }
        }
    }

    /** $100,010 wages: Part III lines 18, 31 and 39 have cents before rounding; line 31 is exactly x.50 (#178). */
    static Map<String, String> centsScenario() {
        Map<String, String> m = new HashMap<>(amtScenario());
        m.put("/formW2s/#959c03d1-af4a-447f-96aa-d19397048a44/writableWages", dollar("100010.00"));
        return Ty2026PdfPackageTest.syntheticFiler(m);
    }

    /**
     * #178: Part III prints whole dollars. Same return as the golden scenario above with $100,010 wages (synthetic data,
     * the package test's synthetic filer). Hand computation, Form 6251 (2026) draft. Each amount entered on a line is
     * rounded to the nearest dollar, half a dollar up: IRC 6102(a)(2); 26 CFR 301.6102-1(a); Form 1040 instr. (2025)
     * p. 23, "If you do round to whole dollars, you must round all amounts. To round, drop amounts under 50 cents and
     * increase amounts from 50 to 99 cents to the next dollar."
     *
     * <pre>
     *   1a 16,100   1b 1,083,910   2a 16,100   4 AMTI 1,100,010   5 0   6 1,100,010
     *   12 1,100,010  13 1,000,000  15 1,000,000  16 1,000,000  17 100,010
     *   18 26% x 100,010 = 26,002.60 -> 26,003
     *   19 49,450  20 83,910 (QDCG worksheet line 5)  21 0  22 1,000,000  23 0  24 1,000,000  25 545,500  26 0
     *   27 83,910  28 83,910  29 461,590  30 461,590
     *   31 15% x 461,590 = 69,238.50 -> 69,239 (half a dollar rounds up)
     *   32 461,590  33 538,410
     *   34 20% x 538,410 = 107,682
     *   38 26,003 + 69,239 + 107,682 = 202,924
     *   39 28% x 1,100,010 - 4,890 = 303,112.80 -> 303,113
     *   40 = 7 = 9 = 202,924
     *   10 regular tax: QDCG worksheet line 25 = 69,238.50 + 107,682 + 13,176 (Tax Table, $83,900-$83,950 row)
     *      = 190,096.50 -> 190,097
     *   11 AMT 202,924 - 190,097 = 12,827
     * </pre>
     *
     * Before #178, lines 18, 31 and 39 printed 26002.60, 69238.50 and 303112.80, and line 40 was the unrounded
     * 202,923.10, so line 7 was 202,923 and the AMT 12,826: $1 less, and line 38 did not equal the sum of the printed
     * lines 18, 31 and 34.
     */
    @Test
    void partIIIPrintsWholeDollars() throws Exception {
        byte[] bytes = generate(centsScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form6251-ty2026-whole-dollars.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = form6251Fields(doc);
            assertFalse(f.isEmpty(), "Form 6251 is included when AMT > 0");
            assertTrue(field(f, "Page1[0].f1_1[0]").contains(Ty2026PdfPackageTest.LAST_NAME), "name line");
            assertEquals(Ty2026PdfPackageTest.SSN_DASHED, field(f, "Page1[0].f1_2[0]"), "test-only TIN");
            assertNoCents(f);

            assertEquals(108391000, line(f, "f1_4[0]"), "1b");
            assertEquals(110001000, line(f, "f1_26[0]"), "4 AMTI");
            assertEquals(110001000, line(f, "f1_28[0]"), "6");
            assertEquals(110001000, line(f, "f2_1[0]"), "12 = line 6");
            assertEquals(10001000, line(f, "f2_6[0]"), "17 = 12 - 16");
            assertEquals(2600300, line(f, "f2_7[0]"), "18 = 26% of 17 = 26,002.60, rounded");
            assertEquals(8391000, line(f, "f2_9[0]"), "20 = QDCG worksheet line 5");
            assertEquals(46159000, line(f, "f2_19[0]"), "30 = smaller of 24 or 29");
            assertEquals("69239.00", field(f, "Page2[0].f2_20[0]"), "31 = 15% of 30 = 69,238.50, rounded up");
            assertEquals(53841000, line(f, "f2_22[0]"), "33 = 22 - 32");
            assertEquals(10768200, line(f, "f2_23[0]"), "34 = 20% of 33");
            assertEquals(2600300 + 6923900 + 10768200, line(f, "f2_27[0]"), "38 = 18 + 31 + 34 as printed");
            assertEquals(30311300, line(f, "f2_28[0]"), "39 = 28% of 12 - $4,890 = 303,112.80, rounded");
            assertEquals(20292400, line(f, "f2_29[0]"), "40 = smaller of 38 or 39");
            assertEquals(20292400, line(f, "f1_29[0]"), "7 = line 40");
            assertEquals(20292400, line(f, "f1_31[0]"), "9 = 7 - 8");
            assertEquals(19009700, line(f, "f1_32[0]"), "10 regular tax");
            assertEquals(1282700, line(f, "f1_33[0]"), "11 AMT = 9 - 10");
        }
    }

    @Test
    void noAmtMeansNo6251() throws Exception {
        // Fixture as-is: single, $50,000 wages, $9,000 capital gain. AMTI is below the $90,100 exemption, so AMT is $0
        // and Who Must File item 1 is false.
        byte[] bytes = generate(Map.of(
                "/hasAmtPreferenceItems",
                bool(false),
                "/soldCapitalAssets",
                bool(true),
                "/scheduleAWantsToItemize",
                bool(false)));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertTrue(form6251Fields(doc).isEmpty(), "Form 6251 not included when AMT is $0");
        }
    }

    @Test
    void partIIIStaysBlankWhenLine7DoesNotRequireIt() throws Exception {
        Irs6251PdfForm form = new Irs6251PdfForm("IRS6251");
        gov.irs.directfile.models.FactEvaluationResult facts = new gov.irs.directfile.models.FactEvaluationResult();
        facts.put("/form6251UsesPartIII", false);
        facts.put("/form6251Line12", "300000.00");
        facts.put("/form6251Line21", "49450.00");
        form.computePseudoFacts(facts, null, null);
        for (int n : Irs6251PdfForm.PART_III_LINES) {
            assertEquals(
                    "", facts.getOptional("~form6251PartIIILine" + n).orElse("").toString(), "line " + n);
        }
        assertEquals("", facts.getOptional("~form6251PartIIILine26").orElse("").toString(), "line 26");
    }

    @Test
    void lines33And34SkippedWhenLine32EqualsLine12() throws Exception {
        Irs6251PdfForm form = new Irs6251PdfForm("IRS6251");
        gov.irs.directfile.models.FactEvaluationResult facts = new gov.irs.directfile.models.FactEvaluationResult();
        facts.put("/form6251UsesPartIII", true);
        facts.put("/form6251Line12", "300000.00");
        facts.put("/form6251Line21", "1000.00");
        facts.put("/form6251Line32", "300000.00");
        facts.put("/form6251Line33", "0.00");
        facts.put("/form6251Line34", "0.00");
        form.computePseudoFacts(facts, null, null);
        assertEquals(
                "300000.00", facts.getOptional("~form6251PartIIILine12").get().toString());
        assertEquals(
                "1000.00", facts.getOptional("~form6251PartIIILine26").get().toString(), "26 = line 21");
        assertEquals("", facts.getOptional("~form6251PartIIILine33").orElse("").toString(), "33 skipped");
        assertEquals("", facts.getOptional("~form6251PartIIILine34").orElse("").toString(), "34 skipped");
    }
}
