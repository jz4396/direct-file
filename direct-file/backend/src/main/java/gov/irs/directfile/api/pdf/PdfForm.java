package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

@Slf4j
class PdfForm extends PdfTemplate {
    private static final String TEMPLATE_CUSTOM_MAP = "template";
    // Largest font size used for a fitTextToWidth field, and the side padding (points) inside its box.
    private static final float FIT_MAX_FONT_SIZE = 10f;
    private static final float FIT_PADDING = 4f;

    public PdfForm(final String templateName) {
        // Subclass constructors may modify the following defaults.
        super(templateName, false, false);
    }

    /**
     * 2026 draft Schedule 3-A (https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf, SHA-256
     * 787e1ae1eaa3e23a184074d0f437f6b2a8fe3f01290f366201f14eeecc82b8db) ships an AcroForm whose /Fields array is empty
     * and whose /Kids arrays are empty. Widgets still point at form1[0] through /Parent. PDFBox 3.0.3 builds a field
     * only when /Kids holds a dictionary with /T, or when the dictionary has /FT, and looks names up from /Fields.
     * This copies each /Parent link into that parent's /Kids, then registers the roots, after load and before the
     * first getField. The committed template bytes are not rewritten.
     */
    static void registerOrphanFieldRoots(PDDocument document) throws IOException {
        PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
        if (acroForm == null) {
            return;
        }
        COSArray fields = acroForm.getCOSObject().getCOSArray(COSName.FIELDS);
        if (fields != null && fields.size() > 0) {
            return;
        }
        COSArray roots = fields == null ? new COSArray() : fields;
        Set<COSDictionary> seen = new LinkedHashSet<>();
        for (PDPage page : document.getPages()) {
            for (PDAnnotation annot : page.getAnnotations()) {
                if (!(annot instanceof PDAnnotationWidget)) {
                    continue;
                }
                COSDictionary node = annot.getCOSObject();
                for (int guard = 0; guard < 32; guard++) {
                    COSBase parent = node.getDictionaryObject(COSName.PARENT);
                    if (!(parent instanceof COSDictionary parentDict)) {
                        break;
                    }
                    appendKid(parentDict, node);
                    node = parentDict;
                }
                if (node.containsKey(COSName.T) || node.containsKey(COSName.KIDS)) {
                    seen.add(node);
                }
            }
        }
        if (seen.isEmpty()) {
            return;
        }
        for (COSDictionary root : seen) {
            roots.add(root);
        }
        if (fields == null) {
            acroForm.getCOSObject().setItem(COSName.FIELDS, roots);
        }
    }

    /** Adds {@code child} to {@code parent}'s /Kids when that array does not already hold it. */
    private static void appendKid(COSDictionary parent, COSDictionary child) {
        COSArray kids = parent.getCOSArray(COSName.KIDS);
        if (kids == null) {
            kids = new COSArray();
            parent.setItem(COSName.KIDS, kids);
        }
        for (int i = 0; i < kids.size(); i++) {
            if (child.equals(kids.getObject(i))) {
                return;
            }
        }
        kids.add(child);
    }

    private static PDDocument loadTemplate(byte[] pdfTemplateBytes) throws IOException {
        PDDocument document = Loader.loadPDF(pdfTemplateBytes);
        registerOrphanFieldRoots(document);
        return document;
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
                newPdfDocument = loadTemplate(pdfTemplateBytes);
                populateFormFields(
                        newPdfDocument.getDocumentCatalog().getAcroForm(),
                        formMap,
                        facts,
                        language,
                        null,
                        fieldsToFitToWidth(pdfConfig));
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
                            newPdfDocument = loadTemplate(pdfTemplateBytes);
                            populateFormFields(
                                    newPdfDocument.getDocumentCatalog().getAcroForm(),
                                    formMap,
                                    facts,
                                    language,
                                    id,
                                    fieldsToFitToWidth(pdfConfig));
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
        if (custom == null || custom.get(TEMPLATE_CUSTOM_MAP) == null) {
            return 0;
        }
        final String value = custom.get(TEMPLATE_CUSTOM_MAP).get("skipLeadingPages");
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
        if (custom == null || custom.get(TEMPLATE_CUSTOM_MAP) == null) {
            return 0;
        }
        final String value = custom.get(TEMPLATE_CUSTOM_MAP).get("skipTrailingPages");
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

    /*
     * Some state form boxes use an automatic font size (DA "0 Tf"), which PDFBox sizes from the box height only, so a
     * long value is cut off at the right edge (PA-40 (2025) "Name of School District": "PHILIPSBURG-OSCEOLA AREA").
     * `customMaps: { template: { fitTextToWidth: "<field name>|<field name>" } }` lists fields whose font size is set so
     * the value fits the box width (at most FIT_MAX_FONT_SIZE). Absent key = no change.
     */
    static Set<String> fieldsToFitToWidth(final PdfConfiguration pdfConfig) {
        final Map<String, Map<String, String>> custom = pdfConfig.getCustomData();
        if (custom == null || custom.get(TEMPLATE_CUSTOM_MAP) == null) {
            return Set.of();
        }
        final String value = custom.get(TEMPLATE_CUSTOM_MAP).get("fitTextToWidth");
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(value.split("\\|")).map(String::trim).collect(Collectors.toUnmodifiableSet());
    }

    static void fitTextToWidth(final PDAcroForm acroForm, final PDTextField field, final String text)
            throws IOException {
        final PDResources resources = acroForm.getDefaultResources();
        final PDFont font = resources == null ? null : resources.getFont(COSName.getPDFName("Helv"));
        if (font == null || text.isEmpty() || field.getWidgets().isEmpty()) {
            return;
        }
        final PDRectangle box = field.getWidgets().get(0).getRectangle();
        final float widthAtOnePoint = font.getStringWidth(text) / 1000f;
        float size = FIT_MAX_FONT_SIZE;
        if (widthAtOnePoint > 0) {
            size = Math.min(size, (box.getWidth() - FIT_PADDING) / widthAtOnePoint);
        }
        field.setDefaultAppearance(String.format(Locale.US, "/Helv %.2f Tf 0 g", size));
    }

    private void populateFormFields(
            final PDAcroForm acroForm,
            final Map<String, String> map,
            final FactEvaluationResult facts,
            final PdfLanguages language,
            final UUID itemId,
            final Set<String> fitToWidth) {
        // Set the field values in the interactive PDF form.
        map.forEach((pdfFieldName, factExpression) -> {
            final Object factValue = determineFieldValue(pdfFieldName, factExpression, facts, language, itemId);
            final PDField field = acroForm.getField(pdfFieldName);
            if (field == null) {
                throw new RuntimeException("Failed to find field " + pdfFieldName);
            }
            if (factValue.toString().length() > 0) {
                try {
                    if (fitToWidth.contains(pdfFieldName) && field instanceof PDTextField textField) {
                        fitTextToWidth(acroForm, textField, factValue.toString().trim());
                    }
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
