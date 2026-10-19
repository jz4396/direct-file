package gov.irs.directfile.api.pdf;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.junit.jupiter.api.Test;

import gov.irs.directfile.models.FactEvaluationResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

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
}
