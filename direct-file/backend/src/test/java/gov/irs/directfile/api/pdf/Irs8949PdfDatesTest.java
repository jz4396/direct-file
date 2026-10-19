package gov.irs.directfile.api.pdf;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.Test;

import gov.irs.factgraph.types.Day;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.EvaluatedFactInfo;
import gov.irs.directfile.models.FactEvaluationResult;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * #48: Form 8949 columns (b) "Date acquired" and (c) "Date sold or disposed of" are headed "(Mo., day, yr.)" on
 * Form 8949 (2025); Day facts must print as MM/DD/YYYY on every packed row (#49), in both Parts.
 */
class Irs8949PdfDatesTest {
    private static final String DIR = "src/main/resources/pdf/2026/IRS8949/en/";
    private static final String TX = "/form8949Transactions/#";

    private static void day(FactEvaluationResult f, String path, String iso) {
        f.put(path, new EvaluatedFactInfo("gov.irs.factgraph.types.Day", new Day(LocalDate.parse(iso))));
    }

    private static void row(FactEvaluationResult f, UUID id, String box, String part, String acquired, String sold) {
        f.put(TX + id + "/printBox" + box, Boolean.TRUE);
        day(f, TX + id + "/print" + part + "DateAcquired", acquired);
        day(f, TX + id + "/print" + part + "DateSold", sold);
    }

    @Test
    void datesFillOnRowsOneAndTwoOfBothParts() throws Exception {
        UUID s1 = new UUID(0, 1), s2 = new UUID(0, 2), l1 = new UUID(0, 3), l2 = new UUID(0, 4);
        FactEvaluationResult facts = new FactEvaluationResult();
        facts.put("/form8949Transactions", new EvaluatedFactInfo("java.util.List", List.of(s1, s2, l1, l2)));
        row(facts, s1, "A", "PartI", "2026-02-02", "2026-05-05");
        row(facts, s2, "A", "PartI", "2026-01-15", "2026-12-31");
        row(facts, l1, "D", "PartII", "2023-03-03", "2026-06-06");
        row(facts, l2, "D", "PartII", "2020-11-09", "2026-07-04");

        PdfConfiguration config;
        try (InputStream in = new FileInputStream(DIR + "configuration.yml")) {
            config = PdfConfiguration.load(in);
        }
        byte[] template = Files.readAllBytes(Path.of(DIR + "f8949--dft.pdf"));
        List<PDDocument> docs =
                new Irs8949PdfForm("IRS8949").generateDocuments(facts, template, config, PdfLanguages.EN);
        try {
            assertEquals(2, docs.size(), "one Form 8949 for box A, one for box D");
            for (PDDocument doc : docs) {
                // #35: the draft cover sheet (file page 1) is dropped; each form keeps its two form pages.
                assertEquals(2, doc.getNumberOfPages(), "Form 8949 Part I and Part II pages only");
            }
            PDAcroForm a = docs.get(0).getDocumentCatalog().getAcroForm();
            String p1 = "topmostSubform[0].Page1[0].Table_Line1_Part1[0].";
            assertEquals("02/02/2026", a.getField(p1 + "Row1[0].f1_04[0]").getValueAsString());
            assertEquals("05/05/2026", a.getField(p1 + "Row1[0].f1_05[0]").getValueAsString());
            assertEquals("01/15/2026", a.getField(p1 + "Row2[0].f1_12[0]").getValueAsString());
            assertEquals("12/31/2026", a.getField(p1 + "Row2[0].f1_13[0]").getValueAsString());
            PDAcroForm d = docs.get(1).getDocumentCatalog().getAcroForm();
            String p2 = "topmostSubform[0].Page2[0].Table_Line1_Part2[0].";
            assertEquals("03/03/2023", d.getField(p2 + "Row1[0].f2_04[0]").getValueAsString());
            assertEquals("06/06/2026", d.getField(p2 + "Row1[0].f2_05[0]").getValueAsString());
            assertEquals("11/09/2020", d.getField(p2 + "Row2[0].f2_12[0]").getValueAsString());
            assertEquals("07/04/2026", d.getField(p2 + "Row2[0].f2_13[0]").getValueAsString());
            assertEquals("", d.getField(p2 + "Row3[0].f2_20[0]").getValueAsString(), "row 3 stays blank");
        } finally {
            for (PDDocument doc : docs) doc.close();
        }
    }
}
