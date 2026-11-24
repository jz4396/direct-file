package gov.irs.directfile.api.pdf;

import java.util.UUID;
import java.util.regex.Pattern;

import gov.irs.directfile.models.FactEvaluationResult;

/**
 * Schedule B (Form 1040) Part II. A nominee ordinary dividend is entered below the line 5 subtotal as "Nominee
 * Distribution" and subtracted. 2026 draft Instructions for Schedule B (Form 1040)
 * https://www.irs.gov/pub/irs-dft/i1040sb--dft.pdf (SHA-256 94d34f2eae6ff134bb31b8ba9d5f52961b44e029b1dec2b39db6b62ca5a6a57b)
 * PDF p. 3 (printed p. 2), Line 5, Nominees.
 *
 * <p>The amount column has no dollar sign and no thousands separator ({@code 3000.00}). A negative amount is the
 * subtraction, printed in parentheses ({@code (1000.00)}) so it matches that column. Part I amounts are unchanged.
 */
class Irs1040SbPdfForm extends PdfForm {
    /** Part II line 5 amount fields, f1_35[0] through f1_63[0], odd only. Line 6 is f1_64[0]. */
    private static final Pattern PART_II_AMOUNT =
            Pattern.compile("(?:^|\\.)f1_(?:35|37|39|41|43|45|47|49|51|53|55|57|59|61|63)\\[0\\]$");

    Irs1040SbPdfForm() {
        super("IRS1040SB");
    }

    @Override
    protected Object evaluateToken(
            final String token,
            final String fieldValue,
            final String pdfFieldName,
            final FactEvaluationResult facts,
            final PdfLanguages language,
            final UUID collectionItemId) {
        final Object value = super.evaluateToken(token, fieldValue, pdfFieldName, facts, language, collectionItemId);
        if (value instanceof String text
                && text.startsWith("-")
                && PART_II_AMOUNT.matcher(pdfFieldName).find()) {
            return "(" + text.substring(1) + ")";
        }
        return value;
    }
}
