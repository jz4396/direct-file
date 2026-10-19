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
import static gov.irs.directfile.api.pdf.ScheduleATy2026PdfSmokeTest.string;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 2026 draft Forms 8959 (https://www.irs.gov/pub/irs-dft/f8959--dft.pdf) and 8960
 * (https://www.irs.gov/pub/irs-dft/f8960--dft.pdf) end-to-end through the real PdfService, fact dictionary and
 * application.yaml. Draft-based field maps: re-verify when the final forms are released.
 *
 * <p>Golden end-to-end scenario (synthetic data, same filer as the Schedule D smoke fixture): single, one W-2 with
 * $250,000 wages and Medicare wages and $4,075 Medicare tax withheld, one Form 1099-INT with $10,000 interest (box 1)
 * and a $150 early withdrawal penalty (box 2), and the fixture's two Form 8949 sales ($4,000 short-term and $5,000
 * long-term gain, $9,000 on Form 1040 line 7a). Worked figures:
 *
 * <pre>
 *   Form 8959: 1 250,000  4 250,000  5 200,000  6 50,000  7 450 (0.9%)  12 450 (Schedule 2 line 17b)
 *              13 0  14 200,000  15 250,000  16 0  17 0  18 blank (0)
 *              19 4,075  20 250,000  21 3,625 (1.45%)  22 450  24 450 (Form 1040 line 25c)
 *   Form 8960: 1 10,000  5a 9,000  5d 9,000  8 19,000  10 150 (Schedule 1 line 18)  11 150  12 18,850
 *              13 268,850 (AGI = 250,000 + 10,000 + 9,000 - 150)  14 200,000  15 68,850  16 18,850
 *              17 716 (18,850 x 3.8% = 716.30, whole dollars; Schedule 2 line 6)
 * </pre>
 */
class Form8959Form8960Ty2026PdfSmokeTest {
    static final String W2 = "959c03d1-af4a-447f-96aa-d19397048a44";
    static final String INT = "b8960000-0000-4000-8000-000000000001";

    static Map<String, String> highIncomeScenario() {
        Map<String, String> m = new HashMap<>();
        m.put("/formW2s/#" + W2 + "/writableWages", dollar("250000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWages", dollar("250000.00"));
        m.put("/formW2s/#" + W2 + "/writableMedicareWithholding", dollar("4075.00"));
        m.put("/interestReports", collection(INT));
        m.put("/interestReports/#" + INT + "/payer", string("Synthetic Savings Bank"));
        m.put("/interestReports/#" + INT + "/filer", collectionItem(W2));
        m.put("/interestReports/#" + INT + "/has1099", bool(true));
        m.put("/interestReports/#" + INT + "/writable1099Amount", dollar("10000.00"));
        m.put("/interestReports/#" + INT + "/writableEarlyWithdrawlPenaltyAmount", dollar("150.00"));
        m.put("/interestReports/#" + INT + "/hasSeenLastAvailableScreen", bool(true));
        return m;
    }

    static String collectionItem(String id) {
        return "{\"$type\":\"gov.irs.factgraph.persisters.CollectionItemWrapper\",\"item\":{\"id\":\"" + id + "\"}}";
    }

    /** Field values on the pages whose text contains {@code footer} (fully qualified name -> value). */
    static Map<String, String> fieldsOnPages(PDDocument doc, String footer) throws Exception {
        Set<COSBase> widgets = new HashSet<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < doc.getNumberOfPages(); i++) {
            stripper.setStartPage(i + 1);
            stripper.setEndPage(i + 1);
            if (stripper.getText(doc).contains(footer)) {
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
                        byName.put(f.getFullyQualifiedName(), f.getValueAsString());
                    }
                }
            }
        }
        return byName;
    }

    /** Value of the one field on these pages whose name ends with {@code Page1[0].<name>}. */
    static String field(Map<String, String> f, String name) {
        String suffix = "Page1[0]." + name;
        String found = null;
        for (var e : f.entrySet()) {
            if (e.getKey().endsWith(suffix)) {
                assertTrue(found == null, "field is unique on the form: " + suffix);
                found = e.getValue() == null ? "" : e.getValue().trim();
            }
        }
        assertTrue(found != null, "field present on the form: " + suffix);
        return found;
    }

    static void amount(Map<String, String> f, String name, long dollars, String line) {
        String v = field(f, name);
        assertFalse(v.isEmpty(), line + " printed");
        assertEquals(dollars * 100, cents(v), line);
    }

    static void blank(Map<String, String> f, String name, String line) {
        assertEquals("", field(f, name), line + " blank");
    }

    @Test
    void form8959PrintsPartsIIIIVAndVFromTheFacts() throws Exception {
        byte[] bytes = generate(highIncomeScenario());
        String out = System.getProperty("pdf.smoke.out");
        if (out != null) {
            Files.write(Path.of(out, "form8959-form8960-ty2026-smoke.pdf"), bytes);
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, "Form 8959 (2026)");
            assertFalse(f.isEmpty(), "Form 8959 page printed");
            assertTrue(field(f, "f1_1[0]").contains("McTestface"), "name");
            amount(f, "f1_3[0]", 250000, "line 1 Medicare wages (W-2 box 5)");
            blank(f, "f1_4[0]", "line 2 Form 4137");
            blank(f, "f1_5[0]", "line 3 Form 8919");
            amount(f, "f1_6[0]", 250000, "line 4");
            amount(f, "f1_7[0]", 200000, "line 5 threshold (single)");
            amount(f, "f1_8[0]", 50000, "line 6");
            amount(f, "f1_9[0]", 450, "line 7");
            for (String rrta : new String[] {"f1_10[0]", "f1_11[0]", "f1_12[0]", "f1_13[0]", "f1_25[0]"}) {
                blank(f, rrta, "RRTA lines 8-11 and 23");
            }
            amount(f, "f1_14[0]", 450, "line 12");
            amount(f, "f1_15[0]", 0, "line 13 (enter -0-)");
            amount(f, "f1_16[0]", 200000, "line 14 threshold");
            amount(f, "f1_17[0]", 250000, "line 15 = line 4");
            amount(f, "f1_18[0]", 0, "line 16 (enter -0-)");
            amount(f, "f1_19[0]", 0, "line 17 (enter -0-)");
            blank(f, "f1_20[0]", "line 18 ($0)");
            amount(f, "f1_21[0]", 4075, "line 19 Medicare tax withheld (W-2 box 6)");
            amount(f, "f1_22[0]", 250000, "line 20 = line 1");
            amount(f, "f1_23[0]", 3625, "line 21");
            amount(f, "f1_24[0]", 450, "line 22");
            amount(f, "f1_26[0]", 450, "line 24");

            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("The draft you are looking for begins on the next page"), "cover sheet dropped");
        }
    }

    @Test
    void form8960PrintsPartsIIIAndIIIFromTheFacts() throws Exception {
        byte[] bytes = generate(highIncomeScenario());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            Map<String, String> f = fieldsOnPages(doc, "Form 8960 (2026)");
            assertFalse(f.isEmpty(), "Form 8960 page printed");
            assertTrue(field(f, "f1_1[0]").contains("McTestface"), "name");
            amount(f, "f1_3[0]", 10000, "line 1 taxable interest");
            blank(f, "f1_4[0]", "line 2 ($0 ordinary dividends)");
            blank(f, "f1_5[0]", "line 3");
            blank(f, "f1_7[0]", "line 4b");
            blank(f, "f1_10[0]", "line 5b");
            blank(f, "f1_11[0]", "line 5c");
            blank(f, "f1_13[0]", "line 6");
            blank(f, "f1_14[0]", "line 7");
            amount(f, "f1_9[0]", 9000, "line 5a (Form 1040 line 7a)");
            amount(f, "f1_12[0]", 9000, "line 5d = 5a");
            amount(f, "f1_15[0]", 19000, "line 8");
            blank(f, "f1_16[0]", "line 9a");
            blank(f, "f1_19[0]", "line 9d");
            amount(f, "f1_20[0]", 150, "line 10 (Schedule 1 line 18 early withdrawal penalty)");
            amount(f, "f1_21[0]", 150, "line 11 = 9d + 10");
            amount(f, "f1_22[0]", 18850, "line 12");
            amount(f, "f1_23[0]", 268850, "line 13 MAGI");
            amount(f, "f1_24[0]", 200000, "line 14 threshold (single)");
            amount(f, "f1_25[0]", 68850, "line 15");
            amount(f, "f1_26[0]", 18850, "line 16 = smaller of 12 or 15");
            amount(f, "f1_27[0]", 716, "line 17 = line 16 x 3.8%, whole dollars");
            blank(f, "f1_6[0]", "line 4a");
            blank(f, "f1_8[0]", "line 4c");
            for (String et : new String[] {"f1_28[0]", "f1_30[0]", "f1_34[0]", "f1_35[0]"}) {
                blank(f, et, "estates and trusts lines 18a-21");
            }
        }
    }

    @Test
    void neitherFormPrintsBelowTheThresholds() throws Exception {
        byte[] bytes = generate(Map.of());
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(doc);
            assertFalse(text.contains("Form 8959 (2026)"), "no Form 8959 at $50,000 wages");
            assertFalse(text.contains("Form 8960 (2026)"), "no Form 8960 at $50,000 wages");
        }
    }
}
