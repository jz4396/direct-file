package gov.irs.directfile.api.pdf;

import java.io.IOException;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import gov.irs.directfile.models.FactEvaluationResult;

/**
 * 2026 draft Schedule SE. The AcroForm field {@code f1_6} is line 3 itself. The instructions' dotted-line entry to the
 * left of line 3 has no field. 26 U.S.C. 1402(c)(1). 2026 draft Instructions for Schedule SE
 * (https://www.irs.gov/pub/irs-dft/i1040sse--dft.pdf), PDF p. 5, Line 2 item 2: enter "Exempt—Notary" and the notary
 * net profit on that dotted line, and subtract it on line 3.
 */
public class Irs1040SsePdfForm extends PdfForm {
    static final String NOTARY_NET_PROFIT = "/scheduleCPrimaryFilerNotaryNetProfit";
    static final String OPTIONAL_METHOD = "/primaryFilerNonfarmOptionalMethodApplies";
    /** Line 3 amount. The dotted line sits to its left. */
    static final String LINE_3_FIELD = "topmostSubform[0].Page1[0].f1_6[0]";

    static final float FONT_SIZE = 8f;
    /** Ends this far left of the line 3 box, clear of the printed "3". */
    static final float GAP_LEFT_OF_LINE_3 = 18f;
    /** Baseline sits just above the bottom of the line 3 box, on the caption's baseline. */
    static final float BASELINE_ABOVE_FIELD_BOTTOM = 2.1f;

    public Irs1040SsePdfForm(final String templateName) {
        super(templateName);
    }

    /**
     * "Exempt—Notary" and the dollar amount, whole dollars when the amount has no cents. The em dash is the one in the
     * instructions.
     */
    static String exemptNotaryAnnotation(final BigDecimal amount) {
        final NumberFormat dollars = NumberFormat.getCurrencyInstance(Locale.US);
        if (amount.stripTrailingZeros().scale() <= 0) {
            dollars.setMaximumFractionDigits(0);
            dollars.setMinimumFractionDigits(0);
        } else {
            dollars.setMaximumFractionDigits(2);
            dollars.setMinimumFractionDigits(2);
        }
        return "Exempt\u2014Notary " + dollars.format(amount);
    }

    @Override
    protected void afterFieldsFilled(final PDDocument document, final FactEvaluationResult facts) throws IOException {
        final Optional<BigDecimal> notary = PaPdfForm.dollars(facts, NOTARY_NET_PROFIT);
        if (notary.isEmpty() || notary.get().signum() <= 0) {
            return;
        }
        if (PaPdfForm.isTrue(facts, OPTIONAL_METHOD)) {
            return;
        }
        final PDAcroForm form = document.getDocumentCatalog().getAcroForm();
        final PDField field = form == null ? null : form.getField(LINE_3_FIELD);
        if (field == null || field.getWidgets().isEmpty()) {
            throw new IOException("Schedule SE line 3 field " + LINE_3_FIELD + " has no widget");
        }
        final PDAnnotationWidget widget = field.getWidgets().get(0);
        final PDPage page = pageOf(document, widget);
        if (page == null) {
            throw new IOException("Schedule SE line 3 widget is not on a page");
        }
        final PDRectangle box = widget.getRectangle();
        final PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        final String text = exemptNotaryAnnotation(notary.get());
        final float width = font.getStringWidth(text) / 1000f * FONT_SIZE;
        final float endX = box.getLowerLeftX() - GAP_LEFT_OF_LINE_3;
        final float startX = endX - width;
        final float baseline = box.getLowerLeftY() + BASELINE_ABOVE_FIELD_BOTTOM;
        try (PDPageContentStream stream =
                new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            stream.beginText();
            stream.setFont(font, FONT_SIZE);
            stream.newLineAtOffset(startX, baseline);
            stream.showText(text);
            stream.endText();
        }
    }

    /**
     * The page still in the document that holds this widget. {@code getPage()} is often null, and after the draft cover
     * sheet is removed it can point at a page that is no longer in the document. Identity compares the widget
     * dictionary and the page object PDFBox already attached.
     */
    @SuppressWarnings("PMD.CompareObjectsWithEquals")
    private static PDPage pageOf(final PDDocument document, final PDAnnotationWidget widget) throws IOException {
        final COSDictionary widgetObject = widget.getCOSObject();
        for (PDPage page : document.getPages()) {
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation.getCOSObject() == widgetObject) {
                    return page;
                }
            }
        }
        final PDPage direct = widget.getPage();
        if (direct != null) {
            for (PDPage page : document.getPages()) {
                if (page == direct) {
                    return direct;
                }
            }
        }
        return null;
    }
}
