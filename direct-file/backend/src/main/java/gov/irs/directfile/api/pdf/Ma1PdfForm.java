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
 * #93 slice 6: 2025 Massachusetts Form 1 used as the interim template for tax year 2026. Amounts are tax year 2026.
 * Whole dollars, no commas. Zero is printed as {@code 0}. The filing-status widgets are one checkbox field selected
 * by export value. The optional 5.85 percent oval is the boolean /maElectsOptionalRate.
 */
class Ma1PdfForm extends PdfForm {
    static final String PREFIX = "~ma1";

    Ma1PdfForm(final String templateName) {
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

    /** Whole dollars with no grouping. Form 1 amount boxes do not use commas. */
    static String wholeDollars(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("0", DecimalFormatSymbols.getInstance(Locale.US));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format.format(amount);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        facts.put(PREFIX + "First", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "Middle", initial(facts, "/primaryFiler/middleInitial"));
        facts.put(PREFIX + "Last", upper(facts, "/primaryFiler/lastName"));

        final String status = enumValue(facts, "/filingStatus");
        final boolean joint = "marriedFilingJointly".equals(status);
        facts.put(PREFIX + "FilingStatus", filingStatusExport(status));

        blankSpouse(facts);
        if (joint) {
            facts.put(PREFIX + "SpouseFirst", upper(facts, "/secondaryFiler/firstName"));
            facts.put(PREFIX + "SpouseMiddle", initial(facts, "/secondaryFiler/middleInitial"));
            facts.put(PREFIX + "SpouseLast", upper(facts, "/secondaryFiler/lastName"));
            facts.put(PREFIX + "SpouseSsn", text(facts, "/secondaryFiler/tin").replace("-", ""));
        }

        final Optional<Object> address = facts.getOptional("/address");
        if (address.isPresent() && address.get() instanceof gov.irs.factgraph.types.Address a) {
            final String street = nullToEmpty(a.streetAddress());
            final String line2 = nullToEmpty(a.streetAddressLine2());
            final String mailing = line2.isEmpty() ? street : street + " " + line2;
            facts.put(PREFIX + "Street", mailing.toUpperCase(Locale.US));
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

        final Optional<Object> email = facts.getOptional("/email");
        if (email.isPresent() && email.get() instanceof gov.irs.factgraph.types.EmailAddress e) {
            facts.put(PREFIX + "Email", nullToEmpty(e.email()));
        } else {
            facts.put(PREFIX + "Email", "");
        }
        return true;
    }

    /** Export values printed on the 2025 Form 1 filing-status widgets. */
    static String filingStatusExport(final String status) {
        return switch (status) {
            case "single" -> "Single";
            case "marriedFilingJointly" -> "Married filing jointly";
            case "marriedFilingSeparately" -> "Married filing separately";
            case "headOfHousehold" -> "Head of household";
            default -> "";
        };
    }

    private static void blankSpouse(final FactEvaluationResult facts) {
        for (String box : new String[] {"SpouseFirst", "SpouseMiddle", "SpouseLast", "SpouseSsn"}) {
            facts.put(PREFIX + box, "");
        }
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
