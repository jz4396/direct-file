package gov.irs.directfile.api.pdf;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.EvaluatedFactInfo;
import gov.irs.directfile.models.FactEvaluationResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #40: Form 8949 multi-row packing. One box per form (Form 8949 (2025) p. 1; instr. (2025) p. 3 / p. 4), up to 11
 * rows per Part, line 2 totals of columns (d), (e), (g), (h) per form (Form 8949 (2025) line 2).
 */
class Irs8949PdfFormTest {
    private static final String PDF = "src/main/resources/pdf/2026/IRS8949/en/f8949--dft.pdf";

    private static List<UUID> ids(int n) {
        List<UUID> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(new UUID(0, i + 1));
        return out;
    }

    @Test
    void twelveSameBoxRowsGiveTwoForms() {
        List<UUID> ids = ids(12);
        List<Irs8949PdfForm.Page> pages = Irs8949PdfForm.pack(ids, id -> "A");
        assertEquals(2, pages.size());
        assertEquals(11, pages.get(0).ids().size());
        assertEquals(1, pages.get(1).ids().size());
        assertEquals(ids.get(11), pages.get(1).ids().get(0));
        assertEquals("A", pages.get(1).box());
    }

    @Test
    void elevenSameBoxRowsFitOneForm() {
        assertEquals(1, Irs8949PdfForm.pack(ids(11), id -> "D").size());
    }

    @Test
    void mixedBoxesGiveSeparateForms() {
        List<UUID> ids = ids(5);
        Map<UUID, String> box =
                Map.of(ids.get(0), "A", ids.get(1), "G", ids.get(2), "A", ids.get(3), "D", ids.get(4), "G");
        List<Irs8949PdfForm.Page> pages = Irs8949PdfForm.pack(ids, box::get);
        assertEquals(
                List.of("A", "G", "D"),
                pages.stream().map(Irs8949PdfForm.Page::box).toList());
        assertEquals(List.of(ids.get(0), ids.get(2)), pages.get(0).ids());
        assertEquals(List.of(ids.get(1), ids.get(4)), pages.get(1).ids());
    }

    @Test
    void lineTwoTotalsArePerForm() {
        List<UUID> ids = ids(3);
        FactEvaluationResult facts = new FactEvaluationResult();
        String[][] rows = {{"10000.00", "6000.00", "0.00", "4000.00"}, {"500.00", "800.00", "100.00", "-200.00"}};
        for (int i = 0; i < 2; i++) {
            String p = "/form8949Transactions/#" + ids.get(i) + "/printPartI";
            facts.put(p + "Proceeds", rows[i][0]);
            facts.put(p + "CostBasis", rows[i][1]);
            facts.put(p + "Adjustment", rows[i][2]);
            facts.put(p + "GainOrLoss", rows[i][3]);
        }
        Irs8949PdfForm.putLine2Totals(facts, new Irs8949PdfForm.Page("B", ids.subList(0, 2)));
        assertEquals("10500.00", facts.getString("/~form8949Line2PartIProceeds"));
        assertEquals("6800.00", facts.getString("/~form8949Line2PartICostBasis"));
        assertEquals("100.00", facts.getString("/~form8949Line2PartIAdjustment"));
        assertEquals("3800.00", facts.getString("/~form8949Line2PartIGainOrLoss"));
        assertEquals("", facts.getString("/~form8949Line2PartIIGainOrLoss"));
        // A different form only sums its own rows.
        Irs8949PdfForm.putLine2Totals(facts, new Irs8949PdfForm.Page("B", ids.subList(2, 3)));
        assertEquals("0.00", facts.getString("/~form8949Line2PartIGainOrLoss"));
    }

    @Test
    void everyPackedRowFieldExistsAndFills() throws Exception {
        assertNull(Irs8949PdfForm.rowFieldName("topmostSubform[0].Page1[0].f1_91[0]", 2));
        assertEquals(
                "topmostSubform[0].Page1[0].Table_Line1_Part1[0].Row11[0].f1_90[0]",
                Irs8949PdfForm.rowFieldName("topmostSubform[0].Page1[0].Table_Line1_Part1[0].Row1[0].f1_10[0]", 11));
        try (PDDocument doc = Loader.loadPDF(new File(PDF))) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            for (String[] part :
                    new String[][] {{"Page1[0].Table_Line1_Part1[0]", "1"}, {"Page2[0].Table_Line1_Part2[0]", "2"}}) {
                for (int col = 3; col <= 10; col++) {
                    String row1 = String.format("topmostSubform[0].%s.Row1[0].f%s_%02d[0]", part[0], part[1], col);
                    for (int r = 1; r <= Irs8949PdfForm.ROWS_PER_PART; r++) {
                        String name = Irs8949PdfForm.rowFieldName(row1, r);
                        PDField field = form.getField(name);
                        assertNotNull(field, name);
                        PdfFieldHandler.setFieldInPDF(field, "1234");
                        assertEquals("1234", field.getValueAsString(), name);
                    }
                }
                // Row 12 does not exist: 11 is the form's row limit.
                assertNull(form.getField(Irs8949PdfForm.rowFieldName(
                        String.format("topmostSubform[0].%s.Row1[0].f%s_03[0]", part[0], part[1]), 12)));
            }
        }
    }

    /**
     * Schedule D instr. (2025) p. D-1, What's New: "New codes to use for reporting digital asset transactions. Codes
     * G, H, I, J, K, and L were added to lines 1b, 2, 3, 8b, 9, and 10 to represent the reporting of digital asset
     * transactions." Each code checks only its own Form 8949 box (Part I c1_1[0..5] = A, B, C, G, H, I; Part II
     * c2_1[0..5] = D, E, F, J, K, L).
     */
    @Test
    void digitalAssetBoxesFillOnlyTheirOwnCheckbox() throws Exception {
        String[] partI = {"A", "B", "C", "G", "H", "I"};
        String[] partII = {"D", "E", "F", "J", "K", "L"};
        for (String box : new String[] {"G", "H", "I", "J", "K", "L"}) {
            UUID id = new UUID(0, 1);
            FactEvaluationResult facts = new FactEvaluationResult();
            facts.put("/form8949Transactions", new EvaluatedFactInfo("java.util.List", List.of(id)));
            facts.put("/form8949Transactions/#" + id + "/printBox" + box, Boolean.TRUE);
            boolean shortTerm = "GHI".indexOf(box) >= 0;
            String part = shortTerm ? "PartI" : "PartII";
            String prefix = "/form8949Transactions/#" + id + "/print" + part;
            facts.put(prefix + "Description", "0.5 BTC");
            facts.put(prefix + "Proceeds", "3000.00");
            facts.put(prefix + "CostBasis", "2000.00");
            facts.put(prefix + "GainOrLoss", "1000.00");

            List<PDDocument> docs = generate(facts);
            try {
                assertEquals(1, docs.size(), box);
                PDAcroForm form = docs.get(0).getDocumentCatalog().getAcroForm();
                assertCheckedBox(form, "Page1[0].c1_1", partI, shortTerm ? box : null);
                assertCheckedBox(form, "Page2[0].c2_1", partII, shortTerm ? null : box);
                String description = shortTerm
                        ? "Page1[0].Table_Line1_Part1[0].Row1[0].f1_03[0]"
                        : "Page2[0].Table_Line1_Part2[0].Row1[0].f2_03[0]";
                assertEquals("0.5 BTC", text(form, description), box);
                String line2 = shortTerm ? "Page1[0].f1_95[0]" : "Page2[0].f2_95[0]";
                assertEquals("1000.00", text(form, line2), box + " line 2 (h)");
                String otherLine2 = shortTerm ? "Page2[0].f2_95[0]" : "Page1[0].f1_95[0]";
                assertEquals("", text(form, otherLine2), box + " other part line 2 stays blank");
            } finally {
                for (PDDocument doc : docs) {
                    doc.close();
                }
            }
        }
    }

    /**
     * Form 8949 (2025) p. 1: "If you have more short-term transactions than will fit on this page for one or more of
     * the boxes, complete as many forms with the same box checked as you need." Each Part has 11 rows.
     */
    @Test
    void twelveSameBoxRowsPackElevenThenOne() throws Exception {
        List<UUID> ids = ids(12);
        FactEvaluationResult facts = new FactEvaluationResult();
        facts.put("/form8949Transactions", new EvaluatedFactInfo("java.util.List", ids));
        for (int i = 0; i < ids.size(); i++) {
            String prefix = "/form8949Transactions/#" + ids.get(i) + "/printPartI";
            facts.put("/form8949Transactions/#" + ids.get(i) + "/printBoxG", Boolean.TRUE);
            facts.put(prefix + "Description", String.format("row%02d", i + 1));
            facts.put(prefix + "Proceeds", "10.00");
            facts.put(prefix + "CostBasis", "4.00");
            facts.put(prefix + "Adjustment", "1.00");
            facts.put(prefix + "GainOrLoss", "7.00");
        }
        List<PDDocument> docs = generate(facts);
        try {
            assertEquals(2, docs.size());
            PDAcroForm first = docs.get(0).getDocumentCatalog().getAcroForm();
            String description = "topmostSubform[0].Page1[0].Table_Line1_Part1[0].Row1[0].f1_03[0]";
            String gain = "topmostSubform[0].Page1[0].Table_Line1_Part1[0].Row1[0].f1_10[0]";
            assertEquals("row01", first.getField(Irs8949PdfForm.rowFieldName(description, 1)).getValueAsString());
            assertEquals("row11", first.getField(Irs8949PdfForm.rowFieldName(description, 11)).getValueAsString());
            assertEquals("7.00", first.getField(Irs8949PdfForm.rowFieldName(gain, 11)).getValueAsString());
            assertEquals("110.00", text(first, "Page1[0].f1_91[0]"), "11 rows x 10.00 proceeds");
            assertEquals("44.00", text(first, "Page1[0].f1_92[0]"), "11 rows x 4.00 basis");
            assertEquals("11.00", text(first, "Page1[0].f1_94[0]"), "11 rows x 1.00 adjustment");
            assertEquals("77.00", text(first, "Page1[0].f1_95[0]"), "11 rows x 7.00 gain");
            assertTrue(checked(first, "Page1[0].c1_1[3]"), "box G");
            assertFalse(checked(first, "Page1[0].c1_1[0]"), "box A stays clear");

            PDAcroForm second = docs.get(1).getDocumentCatalog().getAcroForm();
            assertEquals("row12", second.getField(description).getValueAsString());
            assertEquals("", second.getField(Irs8949PdfForm.rowFieldName(description, 2)).getValueAsString());
            assertEquals("7.00", text(second, "Page1[0].f1_95[0]"));
            assertTrue(checked(second, "Page1[0].c1_1[3]"), "second form still box G");
        } finally {
            for (PDDocument doc : docs) {
                doc.close();
            }
        }
    }

    private static List<PDDocument> generate(FactEvaluationResult facts) throws Exception {
        PdfConfiguration config;
        try (InputStream in = new FileInputStream("src/main/resources/pdf/2026/IRS8949/en/configuration.yml")) {
            config = PdfConfiguration.load(in);
        }
        byte[] template = Files.readAllBytes(Path.of(PDF));
        return new Irs8949PdfForm("IRS8949").generateDocuments(facts, template, config, PdfLanguages.EN);
    }

    private static void assertCheckedBox(PDAcroForm form, String prefix, String[] boxes, String expected) {
        for (int i = 0; i < boxes.length; i++) {
            boolean on = boxes[i].equals(expected);
            assertEquals(on, checked(form, prefix + "[" + i + "]"), prefix + " box " + boxes[i]);
        }
    }

    private static boolean checked(PDAcroForm form, String name) {
        PDField field = form.getField("topmostSubform[0]." + name);
        assertTrue(field instanceof PDCheckBox, name);
        return ((PDCheckBox) field).isChecked();
    }

    private static String text(PDAcroForm form, String name) throws Exception {
        return form.getField("topmostSubform[0]." + name).getValueAsString();
    }
}
