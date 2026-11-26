package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;

import gov.irs.directfile.models.FactEvaluationResult;

/**
 * 2026 draft Schedule E. Line 28 has four rows and line 33 has two. 2026 draft Instructions for Schedule E
 * (https://www.irs.gov/pub/irs-dft/i1040se--dft.pdf, SHA-256 prefix 71d19faaf741cf3c), PDF p. 10: "If you need more
 * space in Part II or III to list your income or losses, attach a continuation sheet using the same format as shown
 * in Part II or III." Rows from E on (Part II) and from C on (Part III) are drawn on one extra page of this form.
 * Lines 29a, 30, 32, 34a, 35, 37, and 41 stay on the form and already total every row.
 */
class Irs1040SePdfForm extends PdfForm {
    /** Line 28 rows A-D. */
    static final int PART_II_ROWS_ON_FORM = 4;
    /** Line 33 rows A-B. */
    static final int PART_III_ROWS_ON_FORM = 2;

    static final String PART_II_HEADER = "Schedule E (Form 1040) 2026, Part II continuation";
    /** The spec quotes this shorter string for Part III. */
    static final String PART_III_HEADER = "Part III continuation";

    private static final float LEFT = 36f;
    private static final float LEAD = 12f;

    Irs1040SePdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected void afterFieldsFilled(final PDDocument document, final FactEvaluationResult facts) throws IOException {
        final List<UUID> partnerships = collection(facts, "/scheduleEK1s");
        final List<UUID> estates = collection(facts, "/scheduleEEstates");
        if (partnerships.size() <= PART_II_ROWS_ON_FORM && estates.size() <= PART_III_ROWS_ON_FORM) {
            return;
        }
        final PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        final PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        final PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
            float y = 748f;
            y = text(stream, bold, 11f, LEFT, y, namesLine(facts));
            y = text(stream, font, 9f, LEFT, y, "Your social security number: " + PaPdfForm.text(facts, "/primaryFiler/tin"));
            y -= 6f;
            if (partnerships.size() > PART_II_ROWS_ON_FORM) {
                y = partII(stream, bold, font, y, facts, partnerships);
            }
            if (estates.size() > PART_III_ROWS_ON_FORM) {
                y = partIII(stream, bold, font, y, facts, estates);
            }
            if (y < 36f) {
                throw new IOException("Schedule E continuation does not fit on one page");
            }
        }
    }

    private static float partII(
            final PDPageContentStream stream,
            final PDType1Font bold,
            final PDType1Font font,
            final float y,
            final FactEvaluationResult facts,
            final List<UUID> ids)
            throws IOException {
        float line = text(stream, bold, 11f, LEFT, y, PART_II_HEADER);
        line = text(
                stream,
                font,
                7f,
                LEFT,
                line,
                "(a) Name. (b) Enter P for partnership; S for S corporation. (d) Employer identification number.");
        line = text(
                stream,
                font,
                7f,
                LEFT,
                line,
                "(h) Passive income from Schedule K-1. (k) Nonpassive income from Schedule K-1.");
        line = text(stream, font, 7f, LEFT, line, "(c)  (e)  (f)  (g)  (i)  (j)");
        final float[] x = {LEFT, 54f, 176f, 198f, 218f, 292f, 312f, 332f, 352f, 390f, 428f, 470f};
        final String[] headers = {
            "", "(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)", "(k)"
        };
        line = cells(stream, bold, 7f, line, x, headers);
        for (int i = PART_II_ROWS_ON_FORM; i < ids.size(); i++) {
            final String p = "/scheduleEK1s/#" + ids.get(i) + "/";
            line = cells(
                    stream,
                    font,
                    8f,
                    line,
                    x,
                    new String[] {
                        rowLetter(i),
                        PaPdfForm.text(facts, p + "entityName"),
                        PaPdfForm.text(facts, p + "entityType"),
                        "",
                        PaPdfForm.text(facts, p + "employerIdentificationNumber"),
                        "",
                        "",
                        "",
                        PaPdfForm.text(facts, p + "columnH"),
                        "",
                        "",
                        PaPdfForm.text(facts, p + "columnK")
                    });
        }
        return line - 8f;
    }

    private static float partIII(
            final PDPageContentStream stream,
            final PDType1Font bold,
            final PDType1Font font,
            final float y,
            final FactEvaluationResult facts,
            final List<UUID> ids)
            throws IOException {
        float line = text(stream, bold, 11f, LEFT, y, PART_III_HEADER);
        line = text(
                stream,
                font,
                7f,
                LEFT,
                line,
                "(a) Name. (d) Passive income from Schedule K-1. (f) Other income from Schedule K-1.");
        line = text(stream, font, 7f, LEFT, line, "(b)  (c)  (e)");
        final float[] x = {LEFT, 54f, 210f, 250f, 290f, 380f, 430f};
        final String[] headers = {"", "(a)", "(b)", "(c)", "(d)", "(e)", "(f)"};
        line = cells(stream, bold, 7f, line, x, headers);
        for (int i = PART_III_ROWS_ON_FORM; i < ids.size(); i++) {
            final String p = "/scheduleEEstates/#" + ids.get(i) + "/";
            line = cells(
                    stream,
                    font,
                    8f,
                    line,
                    x,
                    new String[] {
                        rowLetter(i),
                        PaPdfForm.text(facts, p + "entityName"),
                        "",
                        "",
                        PaPdfForm.text(facts, p + "columnD"),
                        "",
                        PaPdfForm.text(facts, p + "columnF")
                    });
        }
        return line;
    }

    /** 0 is A. The printed cap is 20 Part II rows, which is T. */
    static String rowLetter(final int index) {
        return String.valueOf((char) ('A' + index));
    }

    private static String namesLine(final FactEvaluationResult facts) {
        final String primary = PaPdfForm.text(facts, "/primaryFiler/fullName");
        final String secondary = PaPdfForm.text(facts, "/pdfSecondaryFiler/fullName");
        final String names = secondary.isEmpty() ? primary : primary + "  " + secondary;
        return "Name(s) shown on return: " + names;
    }

    private static float cells(
            final PDPageContentStream stream,
            final PDType1Font font,
            final float size,
            final float y,
            final float[] x,
            final String[] values)
            throws IOException {
        for (int i = 0; i < values.length; i++) {
            if (values[i] != null && !values[i].isEmpty()) {
                text(stream, font, size, x[i], y, values[i]);
            }
        }
        return y - LEAD;
    }

    private static float text(
            final PDPageContentStream stream,
            final PDType1Font font,
            final float size,
            final float x,
            final float y,
            final String value)
            throws IOException {
        if (value == null || value.isEmpty()) {
            return y - LEAD;
        }
        stream.beginText();
        stream.setFont(font, size);
        stream.newLineAtOffset(x, y);
        stream.showText(value);
        stream.endText();
        return y - LEAD;
    }

    private static List<UUID> collection(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isEmpty() || !(opt.get() instanceof List<?> list)) {
            return List.of();
        }
        final List<UUID> ids = new ArrayList<>();
        for (final Object item : list) {
            if (item instanceof UUID id) {
                ids.add(id);
            }
        }
        return ids;
    }
}
