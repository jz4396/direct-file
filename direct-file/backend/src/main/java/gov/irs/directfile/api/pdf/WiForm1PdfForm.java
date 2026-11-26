package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #93 slice 10: 2025 Form 1 used as the interim template for tax year 2026. The published form is already fillable.
 * Amounts are whole dollars with no commas. The preprinted year still says 2025.
 */
class WiForm1PdfForm extends PdfForm {
    static final String PREFIX = "~wi";

    WiForm1PdfForm(final String templateName) {
        super(templateName);
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

    /** Whole dollars with no grouping. Form 1 says no commas and no cents. */
    static String wholeDollars(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("0", DecimalFormatSymbols.getInstance(Locale.US));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format.format(amount);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        facts.put(PREFIX + "Last", upper(facts, "/primaryFiler/lastName"));
        facts.put(PREFIX + "First", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "Mi", initial(facts, "/primaryFiler/middleInitial"));
        final String status = enumValue(facts, "/filingStatus");
        final boolean joint = "marriedFilingJointly".equals(status);
        facts.put(PREFIX + "Status", "single".equals(status) ? "Single" : joint ? "Joint" : "");
        facts.put(PREFIX + "SpouseLast", "");
        facts.put(PREFIX + "SpouseFirst", "");
        facts.put(PREFIX + "SpouseMi", "");
        putTin(facts, PREFIX + "Spouse", "");
        if (joint) {
            facts.put(PREFIX + "SpouseLast", upper(facts, "/secondaryFiler/lastName"));
            facts.put(PREFIX + "SpouseFirst", upper(facts, "/secondaryFiler/firstName"));
            facts.put(PREFIX + "SpouseMi", initial(facts, "/secondaryFiler/middleInitial"));
            putTin(facts, PREFIX + "Spouse", text(facts, "/secondaryFiler/tin"));
        }
        putTin(facts, PREFIX, text(facts, "/primaryFiler/tin"));
        final Object useTax = facts.getOptional("/wiHasUseTax").orElse(null);
        facts.put(PREFIX + "NoUseTax", Boolean.FALSE.equals(useTax) ? "Yes" : "");

        final Optional<Object> address = facts.getOptional("/address");
        if (address.isPresent() && address.get() instanceof gov.irs.factgraph.types.Address a) {
            facts.put(PREFIX + "Street", nullToEmpty(a.streetAddress()).toUpperCase(Locale.US));
            facts.put(PREFIX + "City", nullToEmpty(a.city()).toUpperCase(Locale.US));
            facts.put(PREFIX + "State", nullToEmpty(a.stateOrProvence()).toUpperCase(Locale.US));
            final String zip = nullToEmpty(a.postalCode()).replaceAll("[^0-9]", "");
            facts.put(PREFIX + "Zip", zip.length() > 5 ? zip.substring(0, 5) : zip);
        } else {
            for (String box : new String[] {"Street", "City", "State", "Zip"}) {
                facts.put(PREFIX + box, "");
            }
        }
        return true;
    }

    private static void putTin(final FactEvaluationResult facts, final String prefix, final String raw) {
        final String tin = raw.replace("-", "").replaceAll("\\D", "");
        facts.put(prefix + "Ssn3", tin.length() >= 3 ? tin.substring(0, 3) : "");
        facts.put(prefix + "Ssn2", tin.length() >= 5 ? tin.substring(3, 5) : "");
        facts.put(prefix + "Ssn4", tin.length() >= 9 ? tin.substring(5, 9) : "");
    }

    private static String text(final FactEvaluationResult facts, final String path) {
        return facts.getOptional(path).map(v -> v.toString().trim()).orElse("");
    }

    private static String upper(final FactEvaluationResult facts, final String path) {
        return text(facts, path).toUpperCase(Locale.US);
    }

    private static String initial(final FactEvaluationResult facts, final String path) {
        final String value = upper(facts, path);
        return value.isEmpty() ? "" : value.substring(0, 1);
    }

    private static String nullToEmpty(final String value) {
        return value == null ? "" : value;
    }

    private static String enumValue(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent()
                && opt.get() instanceof gov.irs.factgraph.types.Enum e
                && e.value().isDefined()) {
            return e.value().get();
        }
        return "";
    }
}
