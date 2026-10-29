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
 * <p>Each entry must be a {@code <BlockSubmissionOnTrue />} fact covered by {@code /flowIsKnockedOut}: an operand of
 * that fact, or a dependency of such an operand, so it is not a top-level fact. An entry that is not itself an
 * operand does not make {@code /flowIsKnockedOut} true. {@code /flowPrintRefuseScheduleBPartIII} is that case. An
 * entry that only waits for a missing template is removed once that form has a template and field map. An entry that
 * stops a return from printing a form whose lines this tool does not compute stays, even when the form itself is in
 * the package. One path per line.
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
            // An unanswered question on a PA/FL part-year return stays incomplete and refuses the print.
            "/flowKnockoutPaNonresidentPaSourcePay",
            // PA-40 line 1b needs PA Schedule UE. PA-40 IN (2025) p. 27: "PA law only permits expenses required to
            // perform the duties of a job or profession." 72 P.S. §7303(a)(1). Yes, or an unanswered question on a
            // PA-40, refuses the print so line 1b is not left blank.
            "/flowKnockoutPaUnreimbursedEmployeeExpenses",
            // PA-40 line 3 is federal ordinary dividends only when PA Schedule B lines 2-10 are $0. PA-40 IN (2025)
            // p. 32 and p. 43. Exempt-obligation dividends, a positive nonresident-period allocation, or an unanswered
            // allocation or exempt-obligation question refuses the print (72 P.S. §7303(a)(5)).
            "/flowKnockoutPaDividends",
            // PA-40 lines 7, 8, 10, 14-16, 22 (Schedule G-L), 23 and 25. PA-40 IN (2025) pp. 19-24. Yes, or an
            // unanswered question on a PA-40, refuses the print.
            "/flowKnockoutPaUnsupportedItems",
            // PA-40 line 4 (Schedule C) and income this return does not classify (1099-R, 1099-MISC, tax-exempt
            // interest, a missing box 16, a joint sale, a forfeited-interest penalty). Full-year Schedule E Part I
            // net is PA-40 line 6. A Schedule K-1, or Schedule E Part I income of a PA/FL part-year resident, still
            // stops. PA-40 IN (2025) p. 18 and p. 43. Tax Reform Code of 1971 §303(a)(4). 72 P.S. §7303(a).
            "/flowKnockoutPaUnsupportedIncome",
            // Tax Forgiveness cases Schedule SP here does not compute. 72 P.S. §7304. PA-40 IN (2025) pp. 36-39.
            // When forgiveness is still possible, an unanswered nontaxable-income question stays incomplete.
            "/flowKnockoutPaSpUnsupported",
            // PA/FL part-year cases not computed: a joint return, a move date outside the tax year, or a W-2 that is
            // not PA or FL. PA-40 IN (2025) pp. 6-7 and p. 42. 72 P.S. §7302(a), §7302(b).
            "/flowKnockoutPaPartYear",
            // PA Schedule A is required and not produced. PA-40 IN (2025) p. 31. 72 P.S. §7303(a)(6).
            "/flowKnockoutPaScheduleA",
            // PA Schedule B is required and not produced. PA-40 Schedule B (2025), WHO MUST COMPLETE. 72 P.S.
            // §7303(a)(5). An unanswered exempt-obligation answer or part-year allocation stays incomplete.
            "/flowKnockoutPaScheduleB",
            // PA Schedule D is required for any sale, exchange or disposition, including a loss. PA-40 IN (2025) p. 17
            // and PA Schedule D (2025), WHO MUST COMPLETE. 72 P.S. §7303(a)(3).
            "/flowKnockoutPaScheduleD",
            // Form 2210 Part II box applies: Form 2210 (2026) draft, p. 1, "If box B, C, or D applies, you must figure
            // your penalty and file Form 2210." and "If box A or E applies (but not B, C, or D), file only page 1 of
            // Form 2210." There is no Form 2210 template, so the package would omit it and leave line 38 blank.
            "/flowKnockoutForm2210",
            // Form 8962 (2026) draft, PDF p. 1, line 26 to Schedule 3 line 9 and line 27 to Schedule 2 line 1a.
            // True when /form8962NeededOrUnresolved is true and /needsToFileForm8962 is not complete true: the
            // Form 1095-A return is still unresolved, or the qualifying-plan answer is yes and every Form 1095-A
            // was deleted. Either case would leave Schedule 2 line 1a and Form 1040 line 31 blank while advance
            // payments still have to be reconciled. Complete false when the 2026 draft prints
            // (/needsToFileForm8962 complete true) and when Form 8962 is not in play.
            "/flowKnockoutForm8962NeededOrUnresolved",
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
            // Schedule B line 1 prints the full taxable interest. Nominee interest, accrued interest, and U.S.
            // savings bond interest previously reported are subtracted below a subtotal (Instructions for Schedule B
            // (2025) p. 2, Line 1). That subtraction is not computed, so a yes refuses the print.
            "/flowKnockoutInterestScheduleBSubtraction",
            // Schedule B line 7a question 2 and line 7b (FinCEN Form 114) and line 8 (Form 3520) are not printed.
            // Instructions for Schedule B (2025) p. 3. A yes to line 7a question 1 or line 8 refuses the print so
            // those lines are not left blank. Unanswered is not "No": the print is refused unless
            // /scheduleBPartIIIAnswered is complete, even when interest and ordinary dividends are not over $1,500.
            // Complete false when every Part III answer is no. Exactly $1,500 with those answers still prints.
            // Not an operand of /flowIsKnockedOut. /flowKnockoutScheduleBPartIII is this fact and
            // /scheduleBPartIIIAnswered, so only a "Yes" knocks the interview out.
            "/flowPrintRefuseScheduleBPartIII",
            // Schedule E Part I loss. Lines 22 and 25 (Form 8582) are not printed. 26 U.S.C. 469, 465, 461(l).
            "/flowKnockoutScheduleELoss",
            // Schedule E depreciation or vehicle expenses. Form 4562 is not printed, so line 18 is not entered as $0.
            "/flowKnockoutScheduleEDepreciation",
            // Personal use of a dwelling unit. 26 U.S.C. 280A expense allocation is not computed.
            "/flowKnockoutScheduleEPersonalUse",
            // Substantial services to renters belong on Schedule C and can be subject to self-employment tax
            // (26 U.S.C. 1402(a)(1)). Printing the profit on Schedule E would leave that tax off.
            "/flowKnockoutScheduleESubstantialServices",
            // Schedule E rental treated as a trade or business: Form 1040 (2026) draft, PDF p. 3, line 13b, "Qualified
            // business income deduction from Form 8995 or Form 8995-A" (26 U.S.C. 199A(a), not elective). Line 13b is
            // not computed yet, so the package would print it as $0.
            "/flowKnockoutScheduleETradeOrBusinessQbi",
            // Schedule E Part II. 2026 draft Instructions for Schedule E, PDF p. 11: "use Part II to report your
            // share of the partnership or S corporation income (even if not received) or loss." 2026 draft
            // Schedule E, PDF p. 4, line 41 combines line 32 into Schedule 1 line 5 (26 U.S.C. 702(a), 1366(a)).
            // The supported path (domestic partnership or S corporation, nonnegative box 1 only, material
            // participation, no column (e) or (f), line 27 no) is complete false and may print. Supported
            // Part III column (f) (nonpassive Schedule K-1 (Form 1041) box 6 only) may print on the same
            // path. Box 8 is other rental income. 26 U.S.C. 469(c)(2) and 469(c)(4) make a rental activity
            // passive without regard to material participation, so a nonzero box 8 refuses the print.
            // An unanswered question, or any out-of-scope K-1 (loss, passive, foreign, PTP, box 14 code A,
            // a section 199A statement, an out-of-scope estate or trust, Part IV), refuses the print. A REMIC
            // yes (Schedule Q (Form 1066)) refuses through this same path even when the K-1 answer is no.
            // This list does not gain another Schedule E path. Asked of every filer, not only after Part I.
            "/flowKnockoutScheduleEPartII",
            // More than four partnerships or S corporations. 2026 draft Instructions for Schedule E, PDF p. 9: attach
            // a continuation sheet. Lines 29a, 30, and 32 include every entity, and line 28 has only four rows, so
            // the fifth name would be omitted. Complete false when Part II is not reported, the entity list is not
            // finished (/flowKnockoutScheduleEPartII already refuses that), or the finished list has four or fewer.
            "/flowKnockoutScheduleEPartIIMoreThanFour",
            // More than two estates or trusts. 2026 draft Instructions for Schedule E, PDF p. 10: attach a
            // continuation sheet. Lines 34a, 35, and 37 include every estate, and line 33 has only two rows, so
            // the third name would be omitted. Complete false when Part III is not reported, the estate list is
            // not finished (/flowKnockoutScheduleEPartII already refuses that), or the finished list has two or fewer.
            "/flowKnockoutScheduleEPartIIIMoreThanTwo",
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
            // Schedule C line this tool does not compute. 2026 draft Instructions for Schedule C: Part III
            // inventory (PDF p. 16), lines 9 and 16b vehicle expenses (PDF pp. 2 and 7, Form 4562), line 13
            // depreciation (PDF p. 8, Form 4562), line 12 depletion, line 20a equipment rent, line 30 home
            // office (PDF p. 11, Form 8829), line 27a Form 7205, line 24b meals that are not 50 percent
            // (PDF p. 11, 26 U.S.C. 274(n)), line 26 employment credits, lines 16a and 16c interest
            // allocation (PDF p. 9), Form 4562-B amortization (PDF p. 17), a loss without material
            // participation (Form 8582, 26 U.S.C. 469) or that is not fully at risk (line 32b, Form 6198,
            // 26 U.S.C. 465). Complete false when the filer has no Schedule C or only the single expense total.
            "/flowKnockoutScheduleCOutOfScope",
            // Schedule SE lines this tool does not compute. 2026 draft Schedule SE: lines 1a and 1b (farm and
            // Conservation Reserve Program payments; 26 U.S.C. 1402(a), 1402(a)(1)), line 4b and Part II (optional
            // methods; 1402(a), 1402(l)), lines 5a and 5b (church employee income; 1402(a)(14), 1402(j)), checkbox A
            // and ministry (1402(a)(8), 1402(c)(4), 1402(e), 1402(g)), notary fees (1402(c)(1)), and line 8c
            // (Form 8919). Complete false when the filer has no self-employment income or answers every question no.
            // An unanswered question while self-employment income is yes refuses the print.
            "/flowKnockoutScheduleSEOutOfScope",
            // Form 8995 goes with every return that has Schedule C QBI or loss: Instructions for Form 1040 (2025)
            // draft,
            // PDF p. 35, QBI line (13b on the 2026 form), "Attach whichever form you use (Form 8995 or 8995-A) to your
            // return."; 2026 Instructions for Form 8995 draft, PDF p. 6, line 18, "This is the amount to be carried
            // forward to the next year." There is no TY2026 Form 8995 template or MeF mapping, so it would be left off.
            "/flowKnockoutForm8995WithoutTy2026Template",
            // Form 6251 lines 2c-2t, 3 and 8 are not computed. A yes leaves them blank, and line 4 would combine
            // lines 1b through 3 as if the adjustments were zero. Form 6251 (2026) draft,
            // https://www.irs.gov/pub/irs-dft/f6251--dft.pdf, PDF p. 2 (form p. 1), line 2i: "Exercise of incentive
            // stock options (excess of AMT income over regular tax income)"; line 3: "Other adjustments, including
            // income-based related adjustments"; line 4: "Alternative minimum taxable income. Combine lines 1b through
            // 3." 26 U.S.C. 55(b)(2), 56, 57. Already BlockSubmissionOnTrue via /hasAmtPreferenceItems.
            "/flowKnockoutAmtPreferenceItems",
            // The same lines when the question is unanswered. /flowKnockoutAmtPreferenceItems is complete false
            // then, because IsComplete(/hasAmtPreferenceItems) is its first All operand, so a required Form 6251
            // would still print and line 4 would combine lines 1b through 3 as if lines 2c-3 were zero. True only
            // when /form6251Required is true (Who Must File item 1: line 7 greater than line 10). A complete false
            // still prints. Instructions for Form 6251 (2025), https://www.irs.gov/pub/irs-pdf/i6251.pdf p. 1.
            "/flowKnockoutAmtPreferenceItemsUnanswered",
            // Married filing separately and line 4 over $640,200. Form 6251 (2026) draft, PDF p. 2 (form p. 1),
            // line 4: "(If married filing separately and line 4 is more than $640,200, see instructions.)" 26 U.S.C.
            // 55(d)(2) last sentence: "In the case of a taxpayer described in paragraph (1)(C), alternative minimum
            // taxable income shall be increased by the lesser of (i) 25 percent of the excess of alternative minimum
            // taxable income (determined without regard to this sentence) over the minimum amount of such income (as
            // so determined) for which the exemption amount under paragraph (1)(C) is zero, or (ii) such exemption
            // amount (determined without regard to this paragraph)." That add-back is not implemented. $640,200 is the
            // Rev. Proc. 2025-32 §4.10 complete phaseout amount for a married individual filing a separate return
            // (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf p. 17). Printing line 4 without it understates AMTI.
            "/flowKnockoutAmtMfsAddBack",
            // Form 1099-DIV boxes this return does not compute (2b-2f, 6, 8-16). Form 1040 instr. (2025)
            // https://www.irs.gov/pub/irs-pdf/i1040gi.pdf p. 31, Line 7a, Exception 1, requires that none of the
            // forms "have an amount in box 2b (unrecaptured section 1250 gain), box 2c (section 1202 gain), or box
            // 2d (collectibles (28%) gain)". 26 U.S.C. 1(h)(4), 1(h)(5), 1(h)(6), 1(h)(7). Printing only box 2a
            // would drop those amounts.
            "/flowKnockoutDividendUnsupportedBoxes",
            // Box 3 above basis is capital gain. 26 U.S.C. 301(c)(3)(A). Form 1040 instr. (2025) p. 26, Nondividend
            // Distributions: "After you get back all of your cost (or other basis), you must report these
            // distributions as capital gains on Form 8949." Basis is not collected, so the gain is not zeroed.
            "/flowKnockoutNondividendDistributionsOverBasis",
            // Box 1b that fails the holding period is not a qualified dividend. Form 1040 instr. (2025) p. 26, Line
            // 3a, Exception. 26 U.S.C. 1(h)(11)(B)(iii). Line 3a is not reduced by a split this return does not
            // collect.
            "/flowKnockoutQualifiedDividendsHoldingPeriod",
            // Box 5 section 199A dividends. 26 U.S.C. 199A(b)(1)(B). Form 1040 line 13b is not that deduction, so
            // box 5 is not left off the return as $0. Full QBI from dividends is later.
            "/flowKnockoutSection199ADividends",
            // Box 7 foreign tax that does not meet the 26 U.S.C. 904(j) election. Form 1040 instr. (2025) p. 115,
            // Schedule 3 Line 1: "No. See Form 1116 to find out if you can take the credit". Form 1116 is not
            // computed. The election itself (at or under $300, or $600 on a joint return) still prints.
            "/flowKnockoutDividendForeignTaxPaid",
            // Nominee dividends. Form 1040 instr. (2025) p. 26, Line 3b: Schedule B is required if "you received, as
            // a nominee, ordinary dividends that actually belong to someone else." The Part II subtraction is not
            // computed, so the nominee amount is not left in line 3b.
            "/flowKnockoutDividendNominee",
            // Box 1b or box 5 larger than box 1a. Each is "the portion of the amount in box 1a" (Form 1099-DIV
            // instructions for recipient). Lines 3a and 3b are not computed from that form.
            "/flowKnockoutDividendAmountsInconsistent");

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
