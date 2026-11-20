package gov.irs.directfile.api.pdf;

import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #93 slice 6: 2025 Schedule HC used as the interim template for tax year 2026. A full-year resident Form 1 encloses
 * it. Part 1 is the filer's name and date of birth. Part 2 marks full-year minimum creditable coverage and the private
 * insurer and subscriber number from Form MA 1099-HC. The penalty worksheet is not filled. Dates are MMDDYYYY.
 */
class MaHcPdfForm extends PdfForm {
    static final String PREFIX = "~maHc";

    private static final DateTimeFormatter DOB = DateTimeFormatter.ofPattern("MMddyyyy");

    MaHcPdfForm(final String templateName) {
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
                return Ma1PdfForm.wholeDollars(amount.bigDecimal());
            }
        }
        return super.evaluateToken(token, fieldValue, pdfFieldName, facts, language, collectionItemId);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        facts.put(PREFIX + "First", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "Middle", initial(facts, "/primaryFiler/middleInitial"));
        facts.put(PREFIX + "Last", upper(facts, "/primaryFiler/lastName"));
        facts.put(PREFIX + "Dob", dob(facts, "/primaryFiler/dateOfBirth"));

        final boolean joint = "marriedFilingJointly".equals(enumValue(facts, "/filingStatus"));
        facts.put(PREFIX + "FamilySize", joint ? "2" : "1");
        facts.put(PREFIX + "SpouseDob", joint ? dob(facts, "/secondaryFiler/dateOfBirth") : "");
        facts.put(PREFIX + "Mcc", bool(facts, "/maHasFullYearMcc") ? "Full-year MCC" : "");
        facts.put(PREFIX + "SpouseMcc", joint && bool(facts, "/maSpouseHasFullYearMcc") ? "Full-year MCC" : "");
        facts.put(PREFIX + "Private", bool(facts, "/maHasFullYearMcc"));
        facts.put(PREFIX + "SpousePrivate", joint && bool(facts, "/maSpouseHasFullYearMcc"));
        return true;
    }

    private static String dob(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof gov.irs.factgraph.types.Day day) {
            return day.getDate().format(DOB);
        }
        return "";
    }

    private static boolean bool(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        return opt.isPresent() && Boolean.TRUE.equals(opt.get());
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
