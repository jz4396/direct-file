package gov.irs.directfile.api.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;

import gov.irs.factgraph.Graph;
import gov.irs.factgraph.monads.Result;

/**
 * Knockouts that stop the printed package as well as sign and submit. {@link PdfService#getTaxReturn} builds no PDF
 * unless every one of them is complete and false, and the PDF endpoint answers 400 with every refusing path as
 * {@code blockingFacts}.
 *
 * <p>Each entry must be a {@code <BlockSubmissionOnTrue />} knockout listed in {@code /flowIsKnockedOut}, and is
 * removed when the form it waits for has a template and field map. One path per line.
 */
@Slf4j
public final class PrintRefusingKnockouts {
    /** In the order they are reported. */
    public static final List<String> FACT_PATHS = List.of(
            // Form 8949 code Q (section 1202 exclusion): section 1202 gain is 28-percent rate gain
            // (26 U.S.C. 1(h)(4)(A)(ii), 1(h)(7)) on Schedule D line 18, which needs the Schedule D Tax Worksheet.
            "/flowKnockoutForm8949CodeQ",
            // Schedule EIC has no TY2026 template; a qualifying child counts only if the return gives the child's
            // name, age and TIN (26 U.S.C. 32(c)(3)(D)(i)), which Schedule EIC carries.
            "/flowKnockoutScheduleEicWithoutTy2026Template",
            // PA-source pay in the nonresident period of a PA/FL part-year return: PA-40 IN (2025) p. 43, "If your
            // employer does not report, or incorrectly reports, your PA-taxable compensation, you must use PA
            // Schedule NRH to apportion your compensation". Without PA Schedule NRH the PA-40 would understate line 1a.
            "/flowKnockoutPaNonresidentPaSourcePay",
            // Form 2210 Part II box applies: Form 2210 (2026) draft, p. 1, "If box B, C, or D applies, you must figure
            // your penalty and file Form 2210." and "If box A or E applies (but not B, C, or D), file only page 1 of
            // Form 2210." There is no Form 2210 template, so the package would omit it and leave line 38 blank.
            "/flowKnockoutForm2210",
            // Form 8962 has no TY2026 template; Form 8962 (2026) draft, PDF p. 1: "Attach to Form 1040, 1040-SR, or
            // 1040-NR." The 2024 template's lines 28-29 are "Reserved for future use" on the 2026 draft.
            "/flowKnockoutForm8962WithoutTy2026Template",
            // Form 8962 cases not computed here, so Form 1040 line 31 (net premium tax credit) or Schedule 2 line 1a
            // (excess advance premium tax credit repayment) would be wrong. Form 8962 (2026) draft, PDF p. 1, line 9:
            // "Yes. Skip to Part IV, Allocation of Policy Amounts, or Part V, Alternative Calculation for Year of
            // Marriage" (Treas. Reg. 1.36B-4(a)(1)(ii), 1.36B-4(b)).
            "/flowKnockoutPtcAllocationOfPolicyAmounts",
            "/flowKnockoutPtcAlternativeCalculationForYearOfMarriage",
            // 26 U.S.C. 36B(c)(1)(A): household income that "equals or exceeds 100 percent" of the poverty line.
            "/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl",
            // 26 U.S.C. 36B(c)(3)(A)(iii): a plan enrolled in through an income-based special enrollment period.
            "/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod",
            // 26 U.S.C. 162(l) self-employed health insurance deduction and the credit depend on each other.
            "/flowKnockoutPtcSelfEmployedHealthInsurance",
            // Schedule E rental treated as a trade or business: Form 1040 (2026) draft, PDF p. 3, line 13b, "Qualified
            // business income deduction from Form 8995 or Form 8995-A" (26 U.S.C. 199A(a), not elective). Line 13b is
            // not computed yet, so the package would print it as $0.
            "/flowKnockoutScheduleETradeOrBusinessQbi",
            // Schedule E Parts II and III, and Schedule SE lines 1a and 2. 2026 draft Instructions for Schedule E,
            // PDF p. 11: "use Part II to report your share of the partnership or S corporation income (even if not
            // received) or loss." PDF p. 14: estate or trust income "even if not received" (26 U.S.C. 702(a), 1366(a),
            // 652(a), 662(a)). 2026 draft Schedule SE, PDF p. 2, line 2: "Net profit or (loss) from Schedule C, line
            // 31; and Schedule K-1 (Form 1065), box 14, code A (other than farming)" (line 1a is the farm amount;
            // 26 U.S.C. 1402(a)). Those amounts are not computed, so a yes would otherwise file Schedule 1 line 5 and
            // Schedule SE line 2 without them. Asked of every filer, not only after rental or royalty income.
            "/flowKnockoutScheduleEPartII",
            // Form 8995 cases this return can't compute. Form 8995 (2026) draft header: "Use this form if your taxable
            // income, before your qualified business income deduction, is at or below" the 26 U.S.C. 199A(e)(2)
            // threshold; above it Form 8995-A applies. A prior-year QBI loss carryforward (Form 8995 line 3), a
            // cooperative patron (199A(b)(7), (g)) and a mix of active and non-active businesses (199A(i)(2)) are not
            // modeled either. Each would print line 13b at a value the package can't support.
            "/flowKnockoutQbiAboveThreshold",
            "/flowKnockoutQbiPriorYearCarryforward",
            "/flowKnockoutQbiCooperativePatron",
            "/flowKnockoutQbiMixedParticipation",
            // Schedule C QBI case Form 8995 here can't compute: true when any of the four stops above applies to a
            // return with Schedule C income (26 U.S.C. 199A(c)(1), (c)(3)(A)); the Schedule C knockout screen reads it.
            "/flowKnockoutScheduleCQbi",
            // Form 8995 goes with every return that has Schedule C QBI or loss: Instructions for Form 1040 (2025)
            // draft,
            // PDF p. 35, QBI line (13b on the 2026 form), "Attach whichever form you use (Form 8995 or 8995-A) to your
            // return."; 2026 Instructions for Form 8995 draft, PDF p. 6, line 18, "This is the amount to be carried
            // forward to the next year." There is no TY2026 Form 8995 template or MeF mapping, so it would be left off.
            "/flowKnockoutForm8995WithoutTy2026Template",
            // Schedule C business: Instructions for Schedule C (2025) p. 2, "Use Schedule C (Form 1040) to report
            // income or (loss) from a business you operated or a profession you practiced as a sole proprietor", and
            // the 2026 draft Schedule 1 line 3 reads "Attach Schedule C". There is no Schedule C template, so the
            // package would omit it.
            "/flowKnockoutScheduleCWithoutTy2026Template",
            // EIC (26 U.S.C. 32), ACTC (24(d)) or refundable AOTC (25A(i)) on Form 1040 lines 27a-29: the 2026 draft
            // Form 1040 says "If you entered an amount on line 27a, 28, 29, or 30, attach Sch. 3-A", and line 32b is
            // the "Amount from Schedule 3-A". There is no Schedule 3-A template and no line 32b fact.
            "/flowKnockoutSchedule3AWithoutTy2026Template");

    private PrintRefusingKnockouts() {}

    /** The {@link #FACT_PATHS} that refuse the print on the graph. */
    public static List<String> refusingPaths(Graph graph) {
        return refusingPaths(FACT_PATHS, path -> graph.get(path));
    }

    /**
     * The given paths that refuse the print, in the given order. This fails closed: only a complete false value lets
     * the package print. True (complete or placeholder), a placeholder false, no value, a path the graph does not
     * have, and an evaluation error all refuse.
     */
    static List<String> refusingPaths(List<String> paths, Function<String, Result<Object>> evaluate) {
        List<String> out = new ArrayList<>();
        for (String path : paths) {
            if (!allowsPrinting(path, evaluate)) {
                out.add(path);
            }
        }
        return out;
    }

    private static boolean allowsPrinting(String path, Function<String, Result<Object>> evaluate) {
        try {
            Result<Object> result = evaluate.apply(path);
            return result != null && result.complete() && Boolean.FALSE.equals(result.get());
        } catch (RuntimeException e) {
            // Only the path: no fact value, exception message, class name or stack trace.
            log.warn("Print-refusing knockout {} could not be evaluated", path);
            return false;
        }
    }
}
