package gov.irs.directfile.api.pdf;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #123: PA-40 Schedule SP, Special Tax Forgiveness (2025 form used as the interim template for tax year 2026; see
 * pdf/2026/PA40SP/en/configuration.yml). Page cites are to the PA-40 IN (2025) instruction booklet.
 *
 * <p>Included only when the return claims the credit: p. 22, LINE 21, "If you claim a credit for Tax Forgiveness on
 * Line 21, you must complete and include PA Schedule SP." {@link #computePseudoFacts} returns false otherwise.
 */
class PaScheduleSpPdfForm extends PaPdfForm {
    static final String PREFIX = "~paSp";
    private static final String DEPENDENT = PREFIX + "Dependent";
    // Section II has nine rows; more than nine dependent children is a stop (/flowKnockoutPaSpUnsupported).
    static final int DEPENDENT_ROWS = 9;

    PaScheduleSpPdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        if (!claimsTaxForgiveness(facts)) {
            return false;
        }
        final boolean married = isMarried(facts);

        // "Name (if filing jointly, use name shown first on the PA-40)"; "Spouse's Name (even if filing separately)".
        facts.put(PREFIX + "Name", upper(facts, "/primaryFiler/fullName"));
        facts.put(PREFIX + "SpouseName", married ? upper(facts, "/secondaryFiler/fullName") : "");
        facts.put(PREFIX + "SpouseSsn", married ? ssn(facts, "/secondaryFiler/tin") : "");

        // Eligibility Question 1, "Are you a dependent on another taxpayer's ... federal tax return?": always No on a
        // return that reaches print, because a filer who can be claimed is a stop (/flowKnockoutPaSpUnsupported, p.
        // 36).
        // Question 2 is answered only after a Yes, so it stays blank.
        facts.put(PREFIX + "Question1", "No");

        // Section I, p. 37. Unmarried: oval 1 and sub-oval 1a ("Single. Unmarried/divorced on Dec. 31"). Married:
        // oval 3 and sub-oval 3a ("Married and claiming Tax Forgiveness together with my spouse"); the other married
        // cases (separated, separate returns, a dependent spouse) are stops. Export values come from the form's
        // check boxes (1 and 1 for unmarried, 3 and 3 for married). Deceased (oval 4) is not supported.
        facts.put(PREFIX + "Status", married ? "3" : "1");
        facts.put(PREFIX + "UnmarriedStatus", married ? "" : "1");
        facts.put(PREFIX + "MarriedStatus", married ? "3" : "");

        // Section II, p. 37: one row per dependent child claimed on the federal return
        // (/familyAndHousehold/*/paSpDependentChild), in the order entered.
        int row = 0;
        final Optional<Object> household = facts.getOptional("/familyAndHousehold");
        if (household.isPresent() && household.get() instanceof List<?> ids) {
            for (Object o : ids) {
                if (!(o instanceof UUID id) || row >= DEPENDENT_ROWS) {
                    continue;
                }
                final String base = "/familyAndHousehold/#" + id;
                if (!isTrue(facts, base + "/paSpDependentChild")) {
                    continue;
                }
                row++;
                facts.put(DEPENDENT + row + "Name", upper(facts, base + "/fullName"));
                facts.put(DEPENDENT + row + "Age", text(facts, base + "/age"));
                // The Enum value goes through PdfLanguages.translateRelationship (e.g. "Child", "Stepchild").
                facts.put(
                        DEPENDENT + row + "Relationship",
                        facts.getOptional(base + "/relationship").orElse(""));
                facts.put(DEPENDENT + row + "Ssn", ssn(facts, base + "/tin"));
            }
        }
        for (int r = row + 1; r <= DEPENDENT_ROWS; r++) {
            for (String col : new String[] {"Name", "Age", "Relationship", "Ssn"}) {
                facts.put(DEPENDENT + r + col, "");
            }
        }
        final String children = text(facts, "/paSpDependentChildCount");
        facts.put(PREFIX + "DependentChildren", "0".equals(children) ? "" : children);

        // Line 15, p. 38-39: the percentage "entered as a decimal" from the Eligibility Income Table, written the way
        // the table prints it (1.0, .90, .80, ... .10).
        facts.put(PREFIX + "Line15", decimal(facts.getOptional("/paSpLine15")));
        return true;
    }

    static String decimal(final Optional<Object> rational) {
        if (rational.isEmpty() || !(rational.get() instanceof gov.irs.factgraph.types.Rational r)) {
            return "";
        }
        final java.math.BigDecimal v = new java.math.BigDecimal(r.numerator())
                .divide(new java.math.BigDecimal(r.denominator()), 2, java.math.RoundingMode.HALF_UP);
        if (v.compareTo(java.math.BigDecimal.ONE) >= 0) {
            return "1.0";
        }
        return v.toPlainString().replaceFirst("^0", "");
    }
}
