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
 * #93 slice 8: 2025 Form K-40 (rev. 8-5-25) used as the interim template for tax year 2026. Amounts are the 2025
 * booklet figures the statute still states for later years. Whole dollars, no commas. Check boxes are selected with a
 * boolean. Lines 9 and 10 stay blank because a resident skips them.
 */
class Ks40PdfForm extends PdfForm {
    static final String PREFIX = "~ks40";

    Ks40PdfForm(final String templateName) {
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

    /** Whole dollars with no grouping. Form K-40 says enter amounts in whole dollars only. */
    static String wholeDollars(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("0", DecimalFormatSymbols.getInstance(Locale.US));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format.format(amount);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        facts.put(PREFIX + "First", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "Initial", initial(facts, "/primaryFiler/middleInitial"));
        final String last = upper(facts, "/primaryFiler/lastName");
        facts.put(PREFIX + "Last", last);
        facts.put(PREFIX + "Last4", firstFour(last));

        final String status = enumValue(facts, "/filingStatus");
        final boolean joint = "marriedFilingJointly".equals(status);
        final boolean single = "single".equals(status);
        facts.put(PREFIX + "Single", single);
        facts.put(PREFIX + "Joint", joint);
        facts.put(PREFIX + "Off", Boolean.FALSE);

        final String residency = enumValue(facts, "/ksResidencyStatus");
        facts.put(PREFIX + "Resident", "fullYear".equals(residency));
        facts.put(PREFIX + "PartYear", "partYear".equals(residency));
        facts.put(PREFIX + "Nonresident", "nonresident".equals(residency));

        final String exemption = dollarText(facts, "/ksLine5");
        facts.put(PREFIX + "JointBox", joint);
        facts.put(PREFIX + "ExCountJoint", joint ? "2" : "");
        facts.put(PREFIX + "ExDollarsJoint", joint ? exemption : "");
        facts.put(PREFIX + "SingleBox", single);
        facts.put(PREFIX + "ExCountSingle", single ? "1" : "");
        facts.put(PREFIX + "ExDollarsSingle", single ? exemption : "");
        facts.put(PREFIX + "ExTotal", joint ? "2" : single ? "1" : "");

        facts.put(PREFIX + "SpouseFirst", "");
        facts.put(PREFIX + "SpouseInitial", "");
        facts.put(PREFIX + "SpouseLast", "");
        facts.put(PREFIX + "SpouseLast4", "");
        facts.put(PREFIX + "SpouseSsn", "");
        if (joint) {
            facts.put(PREFIX + "SpouseFirst", upper(facts, "/secondaryFiler/firstName"));
            facts.put(PREFIX + "SpouseInitial", initial(facts, "/secondaryFiler/middleInitial"));
            final String spouseLast = upper(facts, "/secondaryFiler/lastName");
            facts.put(PREFIX + "SpouseLast", spouseLast);
            facts.put(PREFIX + "SpouseLast4", firstFour(spouseLast));
            facts.put(PREFIX + "SpouseSsn", text(facts, "/secondaryFiler/tin").replace("-", ""));
        }

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

        final Optional<Object> phone = facts.getOptional("/phone");
        if (phone.isPresent() && phone.get() instanceof gov.irs.factgraph.types.UsPhoneNumber p) {
            facts.put(PREFIX + "Phone", p.areaCode() + p.officeCode() + p.lineNumber());
        } else {
            facts.put(PREFIX + "Phone", "");
        }
        return true;
    }

    private static String dollarText(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof scala.math.BigDecimal amount) {
            return wholeDollars(amount.bigDecimal());
        }
        return "";
    }

    private static String firstFour(final String value) {
        return value.length() <= 4 ? value : value.substring(0, 4);
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
