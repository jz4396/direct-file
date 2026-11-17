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
 * #93 slice 4: 2025 Form D-400 web-fill used as the interim template for tax year 2026. The form is fillable. The
 * preprinted line 15 sentence still says 4.25 percent; the amount written on the line is line 14 times 3.99 percent,
 * rounded once to the dollar. Whole dollars, no commas. Zero is printed as {@code 0}.
 */
class NcD400PdfForm extends PdfForm {
    static final String PREFIX = "~ncD400";

    NcD400PdfForm(final String templateName) {
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

    /** Whole dollars with no grouping. NCDOR amount boxes do not use commas. */
    static String wholeDollars(final BigDecimal amount) {
        final DecimalFormat format = new DecimalFormat("0", DecimalFormatSymbols.getInstance(Locale.US));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format.format(amount);
    }

    /** First five letters of the county, uppercase. "New Hanover" is NEWHA. */
    static String countyCode(final String county) {
        final String letters = county.toUpperCase(Locale.US).replaceAll("[^A-Z]", "");
        return letters.length() > 5 ? letters.substring(0, 5) : letters;
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        facts.put(PREFIX + "First", upper(facts, "/primaryFiler/firstName"));
        facts.put(PREFIX + "Mi", initial(facts, "/primaryFiler/middleInitial"));
        facts.put(PREFIX + "Last", upper(facts, "/primaryFiler/lastName"));

        final String status = enumValue(facts, "/filingStatus");
        final boolean joint = "marriedFilingJointly".equals(status);
        final boolean separate = "marriedFilingSeparately".equals(status);
        facts.put(PREFIX + "Fstat1", "single".equals(status));
        facts.put(PREFIX + "Fstat2", joint);
        facts.put(PREFIX + "Fstat3", separate);
        facts.put(PREFIX + "Fstat4", "headOfHousehold".equals(status));
        facts.put(PREFIX + "Fstat5", "qualifiedSurvivingSpouse".equals(status));

        blankSpouse(facts);
        if (joint || separate) {
            final String spouseFirst = upper(facts, "/secondaryFiler/firstName");
            final String spouseLast = upper(facts, "/secondaryFiler/lastName");
            final String spouseSsn = text(facts, "/secondaryFiler/tin").replace("-", "");
            if (joint) {
                facts.put(PREFIX + "SpouseFirst", spouseFirst);
                facts.put(PREFIX + "SpouseMi", initial(facts, "/secondaryFiler/middleInitial"));
                facts.put(PREFIX + "SpouseLast", spouseLast);
                facts.put(PREFIX + "SpouseSsn", spouseSsn);
            } else {
                final String spouseName = (spouseFirst + " " + spouseLast).trim();
                facts.put(PREFIX + "MfsSpouseName", spouseName);
                facts.put(PREFIX + "MfsSpouseSsn", spouseSsn);
            }
        }

        final Optional<Object> address = facts.getOptional("/address");
        if (address.isPresent() && address.get() instanceof gov.irs.factgraph.types.Address a) {
            facts.put(PREFIX + "Street", nullToEmpty(a.streetAddress()).toUpperCase(Locale.US));
            facts.put(PREFIX + "Apt", nullToEmpty(a.streetAddressLine2()).toUpperCase(Locale.US));
            facts.put(PREFIX + "City", nullToEmpty(a.city()).toUpperCase(Locale.US));
            facts.put(PREFIX + "State", nullToEmpty(a.stateOrProvence()).toUpperCase(Locale.US));
            final String zip = nullToEmpty(a.postalCode()).replaceAll("[^0-9]", "");
            facts.put(PREFIX + "Zip", zip.length() > 5 ? zip.substring(0, 5) : zip);
        } else {
            for (String box : new String[] {"Street", "Apt", "City", "State", "Zip"}) {
                facts.put(PREFIX + box, "");
            }
        }
        facts.put(PREFIX + "County", countyCode(text(facts, "/ncCounty")));

        final Optional<Object> phone = facts.getOptional("/phone");
        if (phone.isPresent() && phone.get() instanceof gov.irs.factgraph.types.UsPhoneNumber p) {
            facts.put(PREFIX + "Phone", p.areaCode() + p.officeCode() + p.lineNumber());
        } else {
            facts.put(PREFIX + "Phone", "");
        }

        final boolean veteranAnswered = facts.getOptional("/ncIsVeteran").isPresent();
        final boolean veteran = isTrue(facts, "/ncIsVeteran");
        facts.put(PREFIX + "VeteranYes", veteranAnswered && veteran);
        facts.put(PREFIX + "VeteranNo", veteranAnswered && !veteran);
        final boolean spouseVeteranAnswered =
                joint && facts.getOptional("/ncSpouseIsVeteran").isPresent();
        final boolean spouseVeteran = isTrue(facts, "/ncSpouseIsVeteran");
        facts.put(PREFIX + "SpouseVeteranYes", spouseVeteranAnswered && spouseVeteran);
        facts.put(PREFIX + "SpouseVeteranNo", spouseVeteranAnswered && !spouseVeteran);

        facts.put(PREFIX + "ResidentYes", "fullYear".equals(enumValue(facts, "/ncResidencyStatus")));
        facts.put(PREFIX + "SpouseResidentYes", joint && "fullYear".equals(enumValue(facts, "/ncResidencyStatus")));
        facts.put(PREFIX + "Standard", facts.getOptional("/ncItemizes").isPresent() && !isTrue(facts, "/ncItemizes"));
        facts.put(
                PREFIX + "CertifyNoUseTax",
                facts.getOptional("/ncHasUseTax").isPresent() && !isTrue(facts, "/ncHasUseTax"));
        return true;
    }

    private static void blankSpouse(final FactEvaluationResult facts) {
        for (String box :
                new String[] {"SpouseFirst", "SpouseMi", "SpouseLast", "SpouseSsn", "MfsSpouseName", "MfsSpouseSsn"}) {
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

    private static boolean isTrue(final FactEvaluationResult facts, final String path) {
        return facts.getOptional(path).map(Boolean.TRUE::equals).orElse(false);
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
