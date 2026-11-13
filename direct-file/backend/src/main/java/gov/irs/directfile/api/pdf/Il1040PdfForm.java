package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #93 slice 3: 2025 Form IL-1040 used as the interim template for tax year 2026. Amounts are the 2026 figures
 * ($2,925 / $5,850). Header boxes, filing-status and refund radios, and the 65-or-older and blind checkboxes are
 * pseudo-facts. Line 21 prints {@code 0}.
 */
class Il1040PdfForm extends IlPdfForm {
    static final String PREFIX = "~il1040";

    Il1040PdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        final boolean married = isTrue(facts, "/isMarried");
        final String first = upper(facts, "/primaryFiler/firstName");
        final String middle = upper(facts, "/primaryFiler/middleInitial");
        facts.put(PREFIX + "First", middle.isEmpty() ? first : first + " " + middle.substring(0, 1));
        facts.put(PREFIX + "Last", upper(facts, "/primaryFiler/lastName"));
        facts.put(PREFIX + "SpouseFirst", "");
        facts.put(PREFIX + "SpouseLast", "");
        facts.put(PREFIX + "SpouseDob", "");
        facts.put(PREFIX + "SpouseSsn", "");
        if (married) {
            final String spouseFirst = upper(facts, "/secondaryFiler/firstName");
            final String spouseMiddle = upper(facts, "/secondaryFiler/middleInitial");
            facts.put(
                    PREFIX + "SpouseFirst",
                    spouseMiddle.isEmpty() ? spouseFirst : spouseFirst + " " + spouseMiddle.substring(0, 1));
            facts.put(PREFIX + "SpouseLast", upper(facts, "/secondaryFiler/lastName"));
            facts.put(PREFIX + "SpouseDob", day(facts, "/secondaryFiler/dateOfBirth"));
            facts.put(PREFIX + "SpouseSsn", text(facts, "/secondaryFiler/tin").replace("-", ""));
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

        facts.put(PREFIX + "FilingStatus", filingStatusExport(enumValue(facts, "/filingStatus")));
        facts.put(PREFIX + "Over65You", isTrue(facts, "/primaryFiler/age65OrOlder"));
        facts.put(PREFIX + "BlindYou", isTrue(facts, "/primaryFiler/isBlind"));
        final boolean joint = isTrue(facts, "/isFilingStatusMFJ");
        facts.put(PREFIX + "Over65Spouse", joint && isTrue(facts, "/secondaryFiler/age65OrOlder"));
        facts.put(PREFIX + "BlindSpouse", joint && isTrue(facts, "/secondaryFiler/isBlind"));

        final Optional<BigDecimal> refund = dollars(facts, "/ilLine38");
        facts.put(PREFIX + "RefundChoice", refund.isPresent() && refund.get().signum() > 0 ? "paper check" : "");

        final Optional<Object> phone = facts.getOptional("/phone");
        if (phone.isPresent() && phone.get() instanceof gov.irs.factgraph.types.UsPhoneNumber p) {
            facts.put(PREFIX + "Area", p.areaCode());
            facts.put(PREFIX + "Phone", p.officeCode() + p.lineNumber());
        } else {
            facts.put(PREFIX + "Area", "");
            facts.put(PREFIX + "Phone", "");
        }
        return true;
    }

    /** IL-1040 filing-status radio export values. Qualifying surviving spouse is the form's "widowed" oval. */
    static String filingStatusExport(final String status) {
        return switch (status) {
            case "single" -> "single";
            case "marriedFilingJointly" -> "married filing jointly";
            case "marriedFilingSeparately" -> "married filing separately";
            case "headOfHousehold" -> "head of household";
            case "qualifiedSurvivingSpouse" -> "widowed";
            default -> "";
        };
    }

    private static String day(final FactEvaluationResult facts, final String path) {
        final Optional<Object> opt = facts.getOptional(path);
        if (opt.isPresent() && opt.get() instanceof gov.irs.factgraph.types.Day d) {
            return d.getDate().format(DateTimeFormatter.ofPattern("MM/dd/yyyy", Locale.US));
        }
        return "";
    }

    private static String nullToEmpty(final String value) {
        return value == null ? "" : value;
    }
}
