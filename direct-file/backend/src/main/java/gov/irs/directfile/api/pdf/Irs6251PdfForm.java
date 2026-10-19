package gov.irs.directfile.api.pdf;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * #122(a): Form 6251 (2026) draft, https://www.irs.gov/pub/irs-dft/f6251--dft.pdf. The field map is draft-based; see
 * pdf/2026/IRS6251/en/configuration.yml.
 *
 * <p>Part III, p. 2: "Complete Part III only if you are required to do so by line 7 or by the Foreign Earned Income Tax
 * Worksheet". The Part III fields are mapped to pseudo-facts {@code ~form6251PartIIILineNN} that are filled from
 * {@code /form6251LineNN} only when {@code /form6251UsesPartIII} is true (Form 2555 is unsupported, so line 7 is the
 * only trigger). Otherwise Part III stays blank.
 *
 * <p>Line 33, p. 2: "If lines 32 and 12 are the same, skip lines 33 through 37 and go to line 38", so lines 33 and 34
 * stay blank in that case. Lines 35-37 are never mapped: line 14 (Schedule D line 19) is a stop, and "If line 14 is
 * zero or blank, skip lines 35 through 37".
 */
class Irs6251PdfForm extends PdfForm {
    static final String USES_PART_III = "/form6251UsesPartIII";
    static final String PSEUDO_PREFIX = "~form6251PartIIILine";

    // Part III lines that the fact graph computes, each from /form6251Line<n>. Line 26 repeats line 21 ("Enter the
    // amount from line 21"); lines 14 and 35-37 are never printed.
    static final List<Integer> PART_III_LINES =
            List.of(12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 38, 39, 40);

    public Irs6251PdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        final boolean usesPartIII = facts.getBoolean(USES_PART_III);
        for (int line : PART_III_LINES) {
            facts.put(PSEUDO_PREFIX + line, usesPartIII ? valueOf(facts, line) : "");
        }
        facts.put(PSEUDO_PREFIX + 26, usesPartIII ? valueOf(facts, 21) : "");

        if (usesPartIII && sameAmount(valueOf(facts, 32), valueOf(facts, 12))) {
            facts.put(PSEUDO_PREFIX + 33, "");
            facts.put(PSEUDO_PREFIX + 34, "");
        }
        return true;
    }

    private static String valueOf(final FactEvaluationResult facts, final int line) {
        final Optional<Object> opt = facts.getOptional("/form6251Line" + line);
        return opt.map(v -> v.toString().trim()).orElse("");
    }

    static boolean sameAmount(final String a, final String b) {
        if (a.isEmpty() || b.isEmpty()) {
            return false;
        }
        try {
            return new java.math.BigDecimal(a).compareTo(new java.math.BigDecimal(b)) == 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
