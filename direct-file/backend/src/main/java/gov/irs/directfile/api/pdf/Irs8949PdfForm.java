package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #40: multi-row Form 8949. Transactions are grouped by their Form 8949 box (A–L) and packed up to ROWS_PER_PART rows
 * per form; a new form starts when the box changes or the Part is full. Line 2 totals (columns d, e, g, h) are summed
 * per form.
 *
 * <p>Form 8949 (2025) p. 1: "Check only one box. If more than one box applies for your short-term transactions,
 * complete a separate Form 8949, page 1, for each applicable box. If you have more short-term transactions than will
 * fit on this page for one or more of the boxes, complete as many forms with the same box checked as you need." (p. 2
 * says the same for long-term). Form 8949 instr. (2025) p. 3: "Check only one box on each Part I."; p. 4: "Check only
 * one box on each Part II." Form 8949 (2025) line 2: "Totals. Add the amounts in columns (d), (e), (g), and (h)
 * (subtract negative amounts). Enter each total here".
 *
 * <p>The configuration maps row 1 only (Row1[0], fields f1_03..f1_10 / f2_03..f2_10). Row r of the committed PDF uses
 * the same columns with field numbers offset by 8 * (r - 1), up to Row11 (f1_83..f1_90 / f2_83..f2_90); verified with
 * pypdf. Line 2 totals are pseudo facts /~form8949Line2Part{I,II}{Proceeds,CostBasis,Adjustment,GainOrLoss}.
 */
class Irs8949PdfForm extends PdfForm {
    static final int ROWS_PER_PART = 11;
    static final List<String> BOXES = List.of("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L");
    private static final String TX = "/form8949Transactions/";
    private static final Pattern ROW1_FIELD = Pattern.compile("^(.*\\.)Row1\\[0\\]\\.f([12])_(\\d{2})\\[0\\]$");
    /** Line 2 columns (d), (e), (g), (h); column (f) is a code and has no total. */
    private static final List<String> TOTALS = List.of("Proceeds", "CostBasis", "Adjustment", "GainOrLoss");

    public Irs8949PdfForm(final String templateName) {
        super(templateName);
    }

    /** One packed Form 8949: a box and up to ROWS_PER_PART transaction ids, in input order. */
    record Page(String box, List<UUID> ids) {}

    /** Groups ids by box (first-seen order of boxes, input order within a box) and splits each group into pages. */
    static List<Page> pack(final List<UUID> ids, final Function<UUID, String> boxOf) {
        final Map<String, List<UUID>> byBox = new LinkedHashMap<>();
        for (UUID id : ids) {
            final String box = boxOf.apply(id);
            if (box == null) continue;
            byBox.computeIfAbsent(box, b -> new ArrayList<>()).add(id);
        }
        final List<Page> pages = new ArrayList<>();
        byBox.forEach((box, group) -> {
            for (int i = 0; i < group.size(); i += ROWS_PER_PART) {
                pages.add(new Page(box, List.copyOf(group.subList(i, Math.min(i + ROWS_PER_PART, group.size())))));
            }
        });
        return pages;
    }

    static boolean isShortTermBox(final String box) {
        return "ABCGHI".contains(box);
    }

    /** Field name for row r (1-based) given the configured Row1 field name, or null if not a Row1 field. */
    static String rowFieldName(final String row1Field, final int row) {
        final Matcher m = ROW1_FIELD.matcher(row1Field);
        if (!m.matches()) return null;
        final int n = Integer.parseInt(m.group(3)) + 8 * (row - 1);
        return String.format("%sRow%d[0].f%s_%02d[0]", m.group(1), row, m.group(2), n);
    }

    private static String boxOf(final FactEvaluationResult facts, final UUID id) {
        for (String b : BOXES) {
            if (facts.getBoolean(TX + "#" + id + "/printBox" + b)) return b;
        }
        return null;
    }

    private static BigDecimal amount(final FactEvaluationResult facts, final String path) {
        final Optional<Object> v = facts.getOptional(path);
        if (v.isEmpty()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(v.get().toString().trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    /** Puts the line 2 pseudo facts (sums of the page's rows) for the page's Part. */
    static void putLine2Totals(final FactEvaluationResult facts, final Page page) {
        final String part = isShortTermBox(page.box()) ? "PartI" : "PartII";
        final String other = isShortTermBox(page.box()) ? "PartII" : "PartI";
        for (String col : TOTALS) {
            BigDecimal sum = BigDecimal.ZERO;
            for (UUID id : page.ids()) {
                sum = sum.add(amount(facts, TX + "#" + id + "/print" + part + col));
            }
            facts.put(
                    "/~form8949Line2" + part + col,
                    sum.setScale(2, RoundingMode.HALF_EVEN).toPlainString());
            facts.put("/~form8949Line2" + other + col, "");
        }
    }

    @Override
    public List<PDDocument> generateDocuments(
            final FactEvaluationResult facts,
            final byte[] pdfTemplateBytes,
            final PdfConfiguration pdfConfig,
            final PdfLanguages language)
            throws PdfCreationException {
        final List<PDDocument> results = new ArrayList<>();
        final String collectionPath = pdfConfig.getIncludeForEachCollectionFactPath();
        if (collectionPath == null) return results;
        final Optional<Object> collection = facts.getOptional(collectionPath);
        if (collection.isEmpty()) return results;
        @SuppressWarnings("unchecked")
        final List<UUID> ids = (List<UUID>) collection.get();
        final Map<String, String> formMap = pdfConfig.getMapPdfFieldsToFactExpressions();
        try {
            for (Page page : pack(ids, id -> boxOf(facts, id))) {
                putLine2Totals(facts, page);
                @SuppressWarnings("PMD.CloseResource")
                final PDDocument doc = Loader.loadPDF(pdfTemplateBytes);
                final PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
                for (Map.Entry<String, String> e : formMap.entrySet()) {
                    if (rowFieldName(e.getKey(), 1) == null) {
                        // Header, checkbox and line 2 fields: same for every row on the page; use the first row.
                        set(
                                form,
                                e.getKey(),
                                determineFieldValue(
                                        e.getKey(),
                                        e.getValue(),
                                        facts,
                                        language,
                                        page.ids().get(0)));
                    } else {
                        for (int r = 1; r <= page.ids().size(); r++) {
                            final String name = rowFieldName(e.getKey(), r);
                            set(
                                    form,
                                    name,
                                    determineFieldValue(
                                            name,
                                            e.getValue(),
                                            facts,
                                            language,
                                            page.ids().get(r - 1)));
                        }
                    }
                }
                // #35: the 2026 draft template starts with the irs.gov "DRAFT-NOT FOR FILING" cover sheet; drop it
                // (and any configured trailing pages) on every packed form, as PdfForm does for other templates.
                skipLeadingPages(doc, pdfConfig);
                skipTrailingPages(doc, pdfConfig);
                results.add(doc);
            }
        } catch (IOException e) {
            throw new PdfCreationException("Could not load PDF form template input stream", e);
        }
        return results;
    }

    private void set(final PDAcroForm form, final String name, final Object value) {
        final PDField field = form.getField(name);
        if (field == null) {
            throw new RuntimeException("Failed to find field " + name);
        }
        if (value.toString().isEmpty()) return;
        try {
            PdfFieldHandler.setFieldInPDF(field, value);
        } catch (IOException | PdfCreationException ex) {
            throw new RuntimeException(
                    String.format("Error setting [Form %s]: %s; %s", this.templateName, name, ex.getMessage()), ex);
        }
    }
}
