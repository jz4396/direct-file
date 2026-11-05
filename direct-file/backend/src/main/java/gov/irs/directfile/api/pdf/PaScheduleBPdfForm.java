package gov.irs.directfile.api.pdf;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import gov.irs.directfile.api.pdf.load.PdfConfiguration;
import gov.irs.directfile.models.FactEvaluationResult;

/**
 * PA-40 Schedule B (PA-40 B (EX) 04-25; see pdf/2026/PA40B/en/configuration.yml).
 *
 * <p>{@link #computePseudoFacts} returns false unless /paScheduleBSupported is true and lines 10 and 12 are present and
 * positive. A missing amount does not print as $0. Joint, part-year, nominee, exempt-obligation, and unanswered cases
 * stay off this page; {@code /flowKnockoutPaScheduleB} still refuses them.
 *
 * <p>72 P.S. §7303(a)(5). PA-40 IN (2025) p. 15, LINE 3, and p. 32. PA-40 B (2025) lines 1, 6, 10, and 12.
 */
class PaScheduleBPdfForm extends PaPdfForm {
    static final String PREFIX = "~paB";

    PaScheduleBPdfForm(final String templateName) {
        super(templateName);
    }

    @Override
    protected boolean computePseudoFacts(
            final FactEvaluationResult facts, final UUID itemId, final PdfConfiguration pdfConfig) {
        // Full-year, not joint, whole-dollar box 2a, no nominee, exempt-obligation answered no or not asked.
        if (itemId != null || !isTrue(facts, "/paScheduleBSupported")) {
            return false;
        }
        // Fail closed: an unanswered filing status is not "single", and a joint return is a separate schedule this
        // path does not print. PA-40 B (2025) p. 3: separate taxpayer and spouse schedules unless the income is joint.
        final Optional<Object> joint = facts.getOptional("/isFilingStatusMFJ");
        if (joint.isEmpty() || Boolean.TRUE.equals(joint.get())) {
            return false;
        }
        final Optional<BigDecimal> line10 = dollars(facts, "/paScheduleBTaxpayerLine10");
        final Optional<BigDecimal> line12 = dollars(facts, "/paScheduleBTaxpayerLine12");
        if (line10.isEmpty() || line10.get().signum() == 0 || line12.isEmpty() || line12.get().signum() <= 0) {
            return false;
        }
        final String name = upper(facts, "/primaryFiler/fullName");
        final String ssnValue = ssn(facts, "/primaryFiler/tin");
        if (name.isEmpty() || ssnValue.isEmpty()) {
            return false;
        }

        // Header. PA-40 IN (2025) p. 5: UPPER CASE. SSN without dashes. Oval export 1 is the taxpayer oval.
        facts.put(PREFIX + "Name", name);
        facts.put(PREFIX + "Ssn", ssnValue);
        facts.put(PREFIX + "Whose", "1");

        // Line 1 is Form 1040 line 3b. Line 6 equals line 1 because lines 2 through 4 are $0 on this path.
        // Line 10 is box 2a, whole dollars half-up. Line 12 is line 6 plus line 10 and is PA-40 line 3.
        // $0 prints blank (PA-40 IN (2025) p. 4).
        facts.put(PREFIX + "Line1", Pa40PdfForm.paAmountOrBlank(dollars(facts, "/paScheduleBTaxpayerLine1")));
        facts.put(PREFIX + "Line6", Pa40PdfForm.paAmountOrBlank(dollars(facts, "/paScheduleBTaxpayerLine6")));
        facts.put(PREFIX + "Line10", Pa40PdfForm.paAmountOrBlank(line10));
        facts.put(PREFIX + "Line12", Pa40PdfForm.paAmountOrBlank(line12));
        return true;
    }
}
