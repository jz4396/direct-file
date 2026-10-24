package gov.irs.directfile.api.pdf;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.multipdf.PDFMergerUtility.AcroFormMergeMode;
import org.apache.pdfbox.multipdf.PDFMergerUtility.DocumentMergeMode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.test.util.ReflectionTestUtils;

import gov.irs.factgraph.Graph;

import gov.irs.directfile.api.errors.SubmissionBlockingFactsResponseStatusException;
import gov.irs.directfile.api.loaders.service.FactGraphService;
import gov.irs.directfile.api.pdf.load.ConfiguredPdfLookup;
import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.api.taxreturn.models.TaxReturn;
import gov.irs.directfile.models.FactEvaluationResult;
import gov.irs.directfile.models.FactTypeWithItem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Test-only template fill for a return whose only print refusal is
 * {@code /flowKnockoutForm8995WithoutTy2026Template}. Every return with Schedule C income has to attach Form 8995, and
 * there is no TY2026 Form 8995 template or MeF mapping yet, so the real print path refuses it. These tests still check
 * the Schedule C, Schedule SE, Schedules 1-3 and Schedule 8812 field maps those returns use. This helper first asserts
 * that {@link PdfService#getTaxReturn} refuses the return with that knockout and nothing else. It then fills the same
 * templates the same way {@link PdfService} does after its check. Production code has no path that skips the check.
 */
final class Form8995RefusedReturnTemplateFill {
    static final String FORM_8995_KNOCKOUT = "/flowKnockoutForm8995WithoutTy2026Template";

    private Form8995RefusedReturnTemplateFill() {}

    static byte[] fill(PdfService pdfService, FactGraphService factGraphService, TaxReturn taxReturn) throws Exception {
        Map<String, FactTypeWithItem> facts = taxReturn.getFacts();
        Graph graph = factGraphService.getGraph(facts);
        assertEquals(
                List.of(FORM_8995_KNOCKOUT),
                PrintRefusingKnockouts.refusingPaths(graph),
                "the Form 8995 knockout is the only print refusal");
        SubmissionBlockingFactsResponseStatusException refused = assertThrows(
                SubmissionBlockingFactsResponseStatusException.class,
                () -> pdfService.getTaxReturn("en", taxReturn, false));
        assertTrue(refused.getMessage().contains(FORM_8995_KNOCKOUT), refused.getMessage());

        String year = String.valueOf(taxReturn.getTaxYear());
        PdfLanguages language = PdfLanguages.fromString("en");
        ConfiguredPdfLookup lookup = (ConfiguredPdfLookup) ReflectionTestUtils.getField(pdfService, "lookup");
        Set<String> factPaths = new HashSet<>();
        for (PdfTemplate template : PdfTemplate.templateList) {
            for (String path : lookup.getBlankPdfStream(year, template.getTemplateName(), language.getCode())
                    .getConfig()
                    .getFactPathsForPdf()) {
                if (!FactEvaluationResult.isPseudoPath(path)) {
                    factPaths.add(FactEvaluationResult.collectionIndexToWildcard(path));
                }
            }
        }
        FactEvaluationResult values = factGraphService.extractFacts(factPaths, graph);
        List<PDDocument> parts = new ArrayList<>();
        for (PdfTemplate template : PdfTemplate.templateList) {
            PdfConfiguration config = lookup.getBlankPdfStream(year, template.getTemplateName(), language.getCode())
                    .getConfig();
            // Read as PdfService reads it; the lookup owns the stream.
            InputStream blank = lookup.getBlankPdfStream(year, template.getTemplateName(), language.getCode())
                    .getBlankPDF();
            parts.addAll(template.generateDocuments(values, blank.readAllBytes(), config, language));
        }
        try (PDDocument combined = new PDDocument()) {
            combined.getDocumentCatalog().setAcroForm(new PDAcroForm(combined));
            PDFMergerUtility merger = new PDFMergerUtility();
            merger.setDocumentMergeMode(DocumentMergeMode.PDFBOX_LEGACY_MODE);
            merger.setAcroFormMergeMode(AcroFormMergeMode.PDFBOX_LEGACY_MODE);
            for (PDDocument part : parts) {
                merger.appendDocument(combined, part);
                part.close();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            combined.save(out);
            return out.toByteArray();
        }
    }
}
