package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

@Slf4j
class PdfForm extends PdfTemplate {
    public PdfForm(final String templateName) {
        // Subclass constructors may modify the following defaults.
        super(templateName, false, false);
    }

    @Override
    public List<PDDocument> generateDocuments(
            final FactEvaluationResult facts,
            final byte[] pdfTemplateBytes,
            final PdfConfiguration pdfConfig,
            final PdfLanguages language)
            throws PdfCreationException {
        final var results = new ArrayList<PDDocument>();

        // Most often, a fact indicates if the form should be included.
        final String includeWhenPath = pdfConfig.getIncludeWhenFactPath();
        // Alternatively, a form can be generated for each item in a collection.
        final String includeForEachPath = pdfConfig.getIncludeForEachCollectionFactPath();

        // Exactly one of those should be specified.
        if (includeWhenPath == null && includeForEachPath == null) {
            log.warn("Ignoring PDF config that specifies neither `includeWhen` nor `includeForEach`");
            return results;
        }
        if (includeWhenPath != null && includeForEachPath != null) {
            log.warn("Ignoring PDF config that specifies both `includeWhen` and `includeForEach`");
            return results;
        }

        final Map<String, String> formMap = pdfConfig.getMapPdfFieldsToFactExpressions();

        @SuppressWarnings("PMD.CloseResource")
        PDDocument newPdfDocument = null;
        try {
            if (includeWhenPath != null
                    && facts.getBoolean(includeWhenPath)
                    && computePseudoFacts(facts, null, pdfConfig)) {
                newPdfDocument = Loader.loadPDF(pdfTemplateBytes);
                populateFormFields(newPdfDocument.getDocumentCatalog().getAcroForm(), formMap, facts, language, null);
                skipLeadingPages(newPdfDocument, pdfConfig);
                skipTrailingPages(newPdfDocument, pdfConfig);
                results.add(newPdfDocument);
            }

            if (includeForEachPath != null) {
                final Optional<Object> collectionOptional = facts.getOptional(includeForEachPath);
                if (!collectionOptional.isEmpty()) {
                    // For each collection item ...
                    final List<UUID> itemIds = (List<UUID>) collectionOptional.get();
                    for (UUID id : itemIds) {
                        // For some forms, we compute pseudofacts; skip form in case of trouble.
                        if (computePseudoFacts(facts, id, pdfConfig)) {
                            newPdfDocument = Loader.loadPDF(pdfTemplateBytes);
                            populateFormFields(
                                    newPdfDocument.getDocumentCatalog().getAcroForm(), formMap, facts, language, id);
                            skipLeadingPages(newPdfDocument, pdfConfig);
                            skipTrailingPages(newPdfDocument, pdfConfig);
                            results.add(newPdfDocument);
                        }
                    }
                }
            }
        } catch (IOException e) {
            throw new PdfCreationException("Could not load PDF form template input stream", e);
        }
        return results;
    }

    /*
     * IRS early-release drafts (irs.gov/pub/irs-dft) start with a "Caution: DRAFT—NOT FOR FILING" cover page that has
     * no form fields. Templates are committed byte-identical to irs.gov, so the cover page is dropped here instead:
     * `customMaps: { template: { skipLeadingPages: "1" } }` in the template's configuration.yml removes that many
     * leading pages after the fields are filled. Absent key = 0 (no change for existing templates).
     */
    static int leadingPagesToSkip(final PdfConfiguration pdfConfig) {
        final Map<String, Map<String, String>> custom = pdfConfig.getCustomData();
        if (custom == null || custom.get("template") == null) {
            return 0;
        }
        final String value = custom.get("template").get("skipLeadingPages");
        return value == null ? 0 : Integer.parseInt(value.trim());
    }

    static void skipLeadingPages(final PDDocument document, final PdfConfiguration pdfConfig) {
        final int skip = leadingPagesToSkip(pdfConfig);
        if (skip >= document.getNumberOfPages()) {
            throw new IllegalStateException("skipLeadingPages would remove every page of the template");
        }
        for (int i = 0; i < skip; i++) {
            document.removePage(0);
        }
    }

    /*
     * Some state forms are published as one file with the form pages followed by instruction pages (PA-40 Schedule SP
     * (2025): pages 1-2 are the schedule, pages 3-8 its instructions). `customMaps: { template: { skipTrailingPages:
     * "6" } }` removes that many trailing pages after the fields are filled. Absent key = 0.
     */
    static int trailingPagesToSkip(final PdfConfiguration pdfConfig) {
        final Map<String, Map<String, String>> custom = pdfConfig.getCustomData();
        if (custom == null || custom.get("template") == null) {
            return 0;
        }
        final String value = custom.get("template").get("skipTrailingPages");
        return value == null ? 0 : Integer.parseInt(value.trim());
    }

    static void skipTrailingPages(final PDDocument document, final PdfConfiguration pdfConfig) {
        final int skip = trailingPagesToSkip(pdfConfig);
        if (skip >= document.getNumberOfPages()) {
            throw new IllegalStateException("skipTrailingPages would remove every page of the template");
        }
        for (int i = 0; i < skip; i++) {
            document.removePage(document.getNumberOfPages() - 1);
        }
    }

    private void populateFormFields(
            final PDAcroForm acroForm,
            final Map<String, String> map,
            final FactEvaluationResult facts,
            final PdfLanguages language,
            final UUID itemId) {
        // Set the field values in the interactive PDF form.
        map.forEach((pdfFieldName, factExpression) -> {
            final Object factValue = determineFieldValue(pdfFieldName, factExpression, facts, language, itemId);
            final PDField field = acroForm.getField(pdfFieldName);
            if (field == null) {
                throw new RuntimeException("Failed to find field " + pdfFieldName);
            }
            if (factValue.toString().length() > 0) {
                try {
                    PdfFieldHandler.setFieldInPDF(field, factValue);
                } catch (IOException | PdfCreationException e) {
                    throw new RuntimeException(
                            String.format(
                                    "Error setting [Form %s]: %s; %s", this.templateName, pdfFieldName, e.getMessage()),
                            e);
                }
            }
        });
    }

    /*
     * Default implementation does nothing. Subclasses can override this to add pseudofacts to the FactEvaluationResult.
     * Return `false` in situations where the form should not be included in the tax return PDF.
     */
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, PdfConfiguration pdfConfig) {
        return true;
    }
}
