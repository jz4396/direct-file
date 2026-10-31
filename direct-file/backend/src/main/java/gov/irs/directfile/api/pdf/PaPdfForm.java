package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #123: shared behavior of the Pennsylvania PA-40 and PA-40 Schedule SP templates.
 *
 * <p>PA-40 IN (2025) p. 4, "Rounding Numbers": "On the PA-40 form and schedules, show money amounts in whole-dollars.
 * Eliminate any amount less than $0.50 and increase any amount that is $0.50 or more to the next highest dollar." That is
 * half-up rounding, not the half-even rounding of {@link PdfTemplate#getCurrencyRounder()}. The PA fill-in forms format
 * their amount fields as {@code AFNumber_Format(2, 0, ...)} (two decimals, comma grouping), so a whole-dollar amount is
 * written the way the form itself displays it, e.g. {@code 1,234.00}.
 *
 * <p>p. 5, "When Entering Information": "Use UPPER CASE (CAPITAL) letters"; SSNs go in the boxes without dashes (the
 * PA-40 field tooltips read "Enter SSN ... without dashes or spaces").
 */
abstract class PaPdfForm extends PdfForm {
    PaPdfForm(final String templateName) {
        super(templateName);
        this.shouldRemoveTinDashes = true;
    }

    @Override
    protected Object evaluateToken(
            final String token,
            final String fieldValue,
            final String pdfFieldName,
            final FactEvaluationResult facts,
            final PdfLanguages language,
            final UUID collectionItemId) {
        String path = token.trim();
        // includeForEach paths still contain "*" here. Substitute the business id before the dollar lookup so a
        // collection amount is formatted the same way a return-level PA amount is (1,234.00).
        if (collectionItemId != null) {
            path = path.replace("*", "#" + collectionItemId);
        }
        if (factPathRegEx.matcher(path).matches()) {
            final Optional<Object> opt = facts.getOptional(path);
            if (opt.isPresent() && opt.get() instanceof scala.math.BigDecimal amount) {
                return paAmount(amount.bigDecimal());
            }
        }
        return super.evaluateToken(token, fieldValue, pdfFieldName, facts, language, collectionItemId);
    }

    /** Whole dollars, half-up (PA-40 IN (2025) p. 4), written as the form displays it: {@code 1,234.00}. */
    static String paAmount(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
        return format.format(amount.setScale(0, RoundingMode.HALF_UP));
    }

    static Optional<BigDecimal> dollars(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof scala.math.BigDecimal amount) {
            return Optional.of(amount.bigDecimal());
        }
        return Optional.empty();
    }

    static String text(final FactEvaluationResult facts, final String path) {
        return facts.getOptional(path).map(v -> v.toString().trim()).orElse("");
    }

    static String upper(final FactEvaluationResult facts, final String path) {
        return text(facts, path).toUpperCase(Locale.US);
    }

    static boolean isTrue(final FactEvaluationResult facts, final String path) {
        return facts.getOptional(path).map(Boolean.TRUE::equals).orElse(false);
    }

    static String ssn(final FactEvaluationResult facts, final String path) {
        return text(facts, path).replace("-", "");
    }

    /** True when the PA return claims a Tax Forgiveness credit (PA-40 line 21 = Schedule SP line 16 above $0). */
    static boolean claimsTaxForgiveness(final FactEvaluationResult facts) {
        return dollars(facts, "/paSpLine16").map(v -> v.signum() > 0).orElse(false);
    }

    /** Married on Dec. 31 (filers /isMarried); a joint return is /isFilingStatusMFJ. */
    static boolean isMarried(final FactEvaluationResult facts) {
        return isTrue(facts, "/isMarried");
    }

    static boolean isJoint(final FactEvaluationResult facts) {
        return isTrue(facts, "/isFilingStatusMFJ");
    }
}
