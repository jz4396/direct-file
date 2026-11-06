package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;
import gov.irs.factgraph.types.Address;

/**
 * PA-40 Schedule C (PA-40 C (EX) 03-26; see pdf/2026/PA40C/en/configuration.yml). One copy per Schedule C business.
 *
 * <p>{@link #computePseudoFacts} returns false unless the return is a full-year PA resident and this business is on
 * the line-item path. A single-expense-total business, a part-year return, and a non-PA return do not emit a page.
 * The federal Schedule C PDF is not this schedule.
 */
class PaScheduleCPdfForm extends PaPdfForm {
    static final String PREFIX = "~paC";

    PaScheduleCPdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        if (itemId == null || !isTrue(facts, "/stateReturnIsPa")) {
            return false;
        }
        final String base = "/scheduleCBusinesses/#" + itemId;
        final Optional<Object> legacy = facts.getOptional(base + "/usesLegacyExpenseBucket");
        if (legacy.isEmpty() || Boolean.TRUE.equals(legacy.get())) {
            return false;
        }

        // Header. PA-40 IN (2025) p. 5: UPPER CASE. The year box is two digits; the form preprints "20".
        facts.put(PREFIX + "OwnerName", upper(facts, base + "/filer/fullName"));
        facts.put(PREFIX + "BusinessName", upper(facts, base + "/businessName"));
        putHeader(facts, base);
        final String year = text(facts, "/taxYear");
        facts.put(PREFIX + "Year", year.length() >= 2 ? year.substring(year.length() - 2) : year);

        // E. Inventory method. Export values match the printed (1) Cost and (2) lower of cost or market ovals.
        // (3) Other is a stop. Unanswered stays blank.
        String method = "";
        if (isTrue(facts, base + "/line33aCost")) {
            method = "1";
        } else if (isTrue(facts, base + "/line33bLowerOfCostOrMarket")) {
            method = "2";
        }
        facts.put(PREFIX + "InventoryMethod", method);
        // G. Change in quantities, costs, or valuations. "No" is export 2. "Yes" is a stop and stays blank.
        facts.put(PREFIX + "InventoryChange", isTrue(facts, base + "/line34ChangeNo") ? "2" : "");
        // H. Office in the home. PA-40 C (EX) 03-26 instructions, PDF p. 4: Pennsylvania does not recognize the
        // federal safe harbor method. Actual costs and Schedule C-2 are not computed. "No" is export 4 when the
        // answer is complete and false. "Yes" stays blank. /flowKnockoutPaScheduleC stops that return.
        final Optional<Object> home = facts.getOptional(base + "/hasHomeOffice");
        facts.put(PREFIX + "HomeOffice", home.isPresent() && Boolean.FALSE.equals(home.get()) ? "4" : "");

        facts.put(PREFIX + "PartV1", upper(facts, base + "/partV1Description"));
        facts.put(PREFIX + "PartV2", upper(facts, base + "/partV2Description"));
        facts.put(PREFIX + "PartV3", upper(facts, base + "/partV3Description"));

        // Line 39 is line 5 minus line 38. $0 prints blank. A loss fills oval export 2 and the amount is the size.
        final Optional<BigDecimal> net = dollars(facts, base + "/paNetProfitOrLoss");
        facts.put(
                PREFIX + "Line39",
                net.filter(v -> v.signum() != 0).map(v -> paAmount(v.abs())).orElse(""));
        facts.put(PREFIX + "Line39Loss", net.map(v -> v.signum() < 0).orElse(false));
        return true;
    }

    /**
     * PA-40 C (EX) 03-26 identification lines, in UPPER CASE (PA-40 IN (2025) p. 5). Activity and product are Schedule
     * C line A, and the NAICS box is line B (2026 draft Instructions for Schedule C, PDF p. 4). The EIN is blank when
     * the filer has none. The address is the return address when the business is conducted there, and the separate
     * business address otherwise; an unanswered question stays blank. Accounting-method exports are swapped versus
     * the printed (1)(2) order: cash is "2" and accrual is "1". Other is a form stop and is not exported. 26 U.S.C.
     * 446(c). 2026 draft Instructions for Schedule C, PDF p. 5, Line F.
     */
    private static void putHeader(final FactEvaluationResult facts, final String base) {
        facts.put(PREFIX + "Activity", upper(facts, base + "/principalBusinessActivity"));
        facts.put(PREFIX + "Product", upper(facts, base + "/principalProductOrService"));
        facts.put(PREFIX + "Ein", text(facts, base + "/lineDEmployerIdNumber"));
        facts.put(PREFIX + "Naics", text(facts, base + "/principalBusinessCode"));

        Address address = null;
        if (isTrue(facts, base + "/businessConductedAtHome")) {
            final Optional<Object> home = facts.getOptional("/address");
            if (home.isPresent() && home.get() instanceof Address a) {
                address = a;
            }
        } else {
            final Optional<Object> separate = facts.getOptional(base + "/businessAddress");
            if (separate.isPresent() && separate.get() instanceof Address a) {
                address = a;
            }
        }
        if (address == null) {
            facts.put(PREFIX + "Street", "");
            facts.put(PREFIX + "CityStateZip", "");
        } else {
            final String line2 = address.streetAddressLine2() == null
                    ? ""
                    : address.streetAddressLine2().trim();
            final String street = address.streetAddress() == null
                    ? ""
                    : address.streetAddress().trim();
            final String combined = line2.isEmpty() ? street : street + " " + line2;
            facts.put(PREFIX + "Street", combined.toUpperCase(Locale.US));
            final String city =
                    (address.city() == null ? "" : address.city().trim()).toUpperCase(Locale.US);
            final String state = (address.stateOrProvence() == null
                            ? ""
                            : address.stateOrProvence().trim())
                    .toUpperCase(Locale.US);
            final String zip = (address.postalCode() == null
                            ? ""
                            : address.postalCode().trim())
                    .toUpperCase(Locale.US);
            final String stateZip = (state + " " + zip).trim();
            final String cityStateZip;
            if (city.isEmpty()) {
                cityStateZip = stateZip;
            } else if (stateZip.isEmpty()) {
                cityStateZip = city;
            } else {
                cityStateZip = city + ", " + stateZip;
            }
            facts.put(PREFIX + "CityStateZip", cityStateZip);
        }

        String method = "";
        if (isTrue(facts, base + "/accountingMethodIsCash")) {
            method = "2";
        } else if (isTrue(facts, base + "/accountingMethodIsAccrual")) {
            method = "1";
        }
        facts.put(PREFIX + "AccountingMethod", method);
    }
}
