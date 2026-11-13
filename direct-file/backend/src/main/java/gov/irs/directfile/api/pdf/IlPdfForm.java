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
 * #93 slice 3: shared fill-in behavior for Form IL-1040 and Schedule IL-WIT.
 *
 * <p>The 2026 vendor IL-1040 has no AcroForm. The 2025 fillable IL-1040 and Schedule IL-WIT are the interim templates.
 * Amount fields use {@code AFNumber_Format} with zero decimal places, so a whole-dollar amount is written
 * {@code 1,234}. Zero is printed as {@code 0} (IL-1040 Line 21 must not be blank). 2025 IL-1040 instructions: drop an
 * amount under 50 cents and increase an amount of 50 through 99 cents.
 */
abstract class IlPdfForm extends PdfForm {
    IlPdfForm(final String templateName) {
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
        if (collectionItemId != null) {
            path = path.replace("*", "#" + collectionItemId);
        }
        if (factPathRegEx.matcher(path).matches()) {
            final Optional<Object> opt = facts.getOptional(path);
            if (opt.isPresent() && opt.get() instanceof scala.math.BigDecimal amount) {
                return wholeDollars(amount.bigDecimal());
            }
        }
        return super.evaluateToken(token, fieldValue, pdfFieldName, facts, language, collectionItemId);
    }

    /** Whole dollars the way the IL-1040 amount boxes display them, including zero. */
    static String wholeDollars(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.US));
        return format.format(amount.setScale(0, RoundingMode.HALF_UP));
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

    static String enumValue(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof gov.irs.factgraph.types.Enum e && e.value().isDefined()) {
            return e.value().get();
        }
        return "";
    }

    static Optional<BigDecimal> dollars(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof scala.math.BigDecimal amount) {
            return Optional.of(amount.bigDecimal());
        }
        return Optional.empty();
    }
}
