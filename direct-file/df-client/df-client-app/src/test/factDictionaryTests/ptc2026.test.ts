import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { Path } from '../../flow/Path.js';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createMultEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData, makeW2Data, primaryFilerId } from '../testData.js';

/**
 * #88 Form 8962 (2026) premium tax credit. Golden end-to-end scenarios (synthetic data): Single, tax family of 1, 48
 * contiguous states (poverty line $15,650, 90 FR 5917 p. 5917), one full-year Form 1095-A, annual SLCSP $6,000.
 * Rev. Proc. 2025-25 sec. 3.01 (https://www.irs.gov/pub/irs-drop/rp-25-25.pdf), PDF p. 3: 2026 Applicable Percentage
 * Table. 26 U.S.C. 36B(c)(1)(A) (https://www.law.cornell.edu/uscode/text/26/36B): "does not exceed 400 percent".
 * Rev. Proc. 2025-32 sec. 2.04 (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), PDF p. 5: 36B(f)(2)(B) repayment
 * limitation removed for taxable years beginning after December 31, 2025. Form 8962 (2026) draft
 * (https://www.irs.gov/pub/irs-dft/f8962--dft.pdf), PDF p. 1: line 27 goes "on Schedule 2 (Form 1040), line 1a";
 * lines 28-29 "Reserved for future use".
 */
const policy = `88a00000-0000-4000-8000-000000000001`;
const p = `/1095As/#${policy}`;
const ptcReturn = (
  income: number,
  premium: number,
  slcsp: number,
  aptc: number,
  extra: Record<string, unknown> = {}
) => ({
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
  ),
  ...makeW2Data(income),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
  '/filerResidenceAndIncomeState': createEnumWrapper(`al`, `/scopedStateOptions`),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  '/writableHasPtcQualifyingPlan': createBooleanWrapper(true),
  '/writableIsAdditionalPersonInEnrollmentFamily': createBooleanWrapper(false),
  '/writableIsEnrolledWithOtherFamily': createBooleanWrapper(false),
  '/writableHasEmployerSponsoredPlan': createBooleanWrapper(false),
  '/writableHasAdvancedPtc': createBooleanWrapper(aptc > 0),
  '/writableSelfReportedHasMultiple1095As': createBooleanWrapper(false),
  '/writableHasImmigrationStatusNotEligibleForMarketplace': createBooleanWrapper(false),
  '/1095As': createCollectionWrapper([policy]),
  [`${p}/marketplaceState`]: createEnumWrapper(`va`, `/statesAndDistrictsOptions`),
  [`${p}/policyNumber`]: createStringWrapper(`88001`),
  [`${p}/writablePolicyStartDate`]: createDayWrapper(`2026-01-01`),
  [`${p}/writablePolicyEndDate`]: createDayWrapper(`2026-12-31`),
  [`${p}/hasCoverageMonths`]: createBooleanWrapper(true),
  [`${p}/coverageMonths`]: createMultEnumWrapper(
    [`jan`, `feb`, `mar`, `apr`, `may`, `jun`, `jul`, `aug`, `sep`, `oct`, `nov`, `dec`],
    `/1095As/*/monthOptions`
  ),
  [`${p}/hasChangeInCircumstance`]: createBooleanWrapper(false),
  [`${p}/writablePremiumsOrSlcspChange`]: createBooleanWrapper(false),
  [`${p}/writablePtcAnnualPremium`]: createDollarWrapper(`${premium}`),
  [`${p}/writableSlcspAnnualPremium`]: createDollarWrapper(`${slcsp}`),
  [`${p}/writableAptcAnnualAmount`]: createDollarWrapper(`${aptc}`),
  [`${p}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/1095AsIsDone': createBooleanWrapper(true),
  '/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod': createBooleanWrapper(false),
  ...extra,
});
const fg = (data: Record<string, unknown>) => setupFactGraph(data).factGraph;
const raw = (g: ReturnType<typeof fg>, path: string) => g.get(Path.concretePath(path as never, null) as ConcretePath);
const val = (g: ReturnType<typeof fg>, path: string) => {
  const r = raw(g, path);
  expect(r.complete, `${path} complete`).toBe(true);
  return r.get.toString();
};
const knockouts = [
  `/flowKnockoutPtcAllocationOfPolicyAmounts`,
  `/flowKnockoutPtcAlternativeCalculationForYearOfMarriage`,
  `/flowKnockoutPtcSelfEmployedHealthInsurance`,
  `/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`,
  `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
];
const TEMPLATE_KNOCKOUT = `/flowKnockoutForm8962WithoutTy2026Template`;
const expectNoPtcKnockout = (g: ReturnType<typeof fg>) => {
  for (const k of knockouts) expect(val(g, k), k).toBe(`false`);
};
const business = `88b00000-0000-4000-8000-000000000001`;

describe(`Form 8962 (2026) golden scenarios`, () => {
  it(`household income $31,300: line 5 200, line 7 0.0660, 8a 2,066, PTC 3,934, line 27 566 (Sch 2 line 1a)`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/householdIncomeAsPercent`,
      `/applicableFigure`,
      `/lesserOfNetPtcAmountAndRepaymentLimitation`,
    ];
    const g = fg(ptcReturn(31300, 5000, 6000, 4500));
    expect(val(g, `/federalPovertyLevelThreshold`)).toBe(`15650.00`);
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`200`);
    expect(val(g, `/formattedApplicableFigure`)).toBe(`0.0660`);
    expect(val(g, `/ptcAnnualContributionAmount`)).toBe(`2066.00`); // round(31,300 x 0.0660 = 2,065.80)
    expect(val(g, `/ptcMontlyContributionAmount`)).toBe(`172.00`); // round(2,066 / 12 = 172.17)
    expect(val(g, `/annualMaxPremiumAssitance`)).toBe(`3934.00`); // line 11d: 6,000 - 2,066
    expect(val(g, `/annualPtcAllowed`)).toBe(`3934.00`); // line 11e: lesser of 11a and 11d
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`3934.00`); // line 24
    expect(val(g, `/totalAptcAmountTaken`)).toBe(`4500.00`); // line 25
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`566.00`); // line 27
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`566.00`); // Sch 2 line 1a
    expect(val(g, `/schedule2Line1z`)).toBe(`566.00`);
    expect(val(g, `/isRepaymentLimitationIsActive`)).toBe(`false`);
    expect(val(g, `/ptcSectionIsComplete`)).toBe(`true`);
    expectNoPtcKnockout(g);
  });

  it(`household income $23,475: line 5 150, line 7 0.0419, 8a 984, PTC 5,016, line 27 984 (no repayment cap)`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/applicableFigure`, `/lesserOfNetPtcAmountAndRepaymentLimitation`];
    const g = fg(ptcReturn(23475, 6000, 6000, 6000));
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`150`);
    expect(val(g, `/formattedApplicableFigure`)).toBe(`0.0419`);
    expect(val(g, `/ptcAnnualContributionAmount`)).toBe(`984.00`); // round(23,475 x 0.0419 = 983.60)
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`5016.00`);
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`984.00`);
    // Under the pre-2026 cap (Single, under 200%) this would have been limited to $375.
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`984.00`);
    expect(val(g, `/schedule2Line1z`)).toBe(`984.00`);
    expectNoPtcKnockout(g);
  });

  it(`household income $62,800: line 5 401, no PTC, all $3,000 of APTC repaid on line 27`, ({ task }) => {
    task.meta.testedFactPaths = [`/isHouseholdIncome401PercentOfPovertyLine`, `/annualMaxPremiumAssitance`];
    const g = fg(ptcReturn(62800, 5000, 6000, 3000));
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`401`);
    expect(val(g, `/annualMaxPremiumAssitance`)).toBe(`0.00`);
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`0.00`);
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`3000.00`);
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`3000.00`);
    expectNoPtcKnockout(g);
    // Exactly 400% is still an applicable taxpayer: 62,600 x 100 / 15,650 = 400.
    const at400 = fg(ptcReturn(62600, 9000, 9000, 0));
    expect(val(at400, `/householdIncomeAsPercent`)).toBe(`400`);
    expect(val(at400, `/formattedApplicableFigure`)).toBe(`0.0996`);
    expect(val(at400, `/ptcAnnualContributionAmount`)).toBe(`6235.00`); // round(62,600 x 0.0996 = 6,234.96)
    expect(val(at400, `/totalPtcAmountAllowed`)).toBe(`2765.00`); // 9,000 - 6,235
  });

  it(`positive net PTC (line 26) goes to Schedule 3 line 9`, ({ task }) => {
    task.meta.testedFactPaths = [`/netPtcAmountWhenZeroOrPositive`];
    const g = fg(ptcReturn(31300, 5000, 6000, 3000));
    expect(val(g, `/netPtcAmountWhenZeroOrPositive`)).toBe(`934.00`); // 3,934 - 3,000
    expect(raw(g, `/netPtcAmountWhenNegative`).complete).toBe(false);
    expect(val(g, `/schedule2Line1z`)).toBe(`0.00`);
  });

  // Household income is line 5 x $156.50, rounded up to a whole dollar where needed.
  it.each([
    [15650, 100, `0.0210`],
    [20502, 131, `0.0210`],
    [20815, 133, `0.0314`],
    [21910, 140, `0.0357`], // 3.14% + 7 x 1.05% / 17 = 3.5724%
    [23162, 148, `0.0407`], // 3.14% + 15 x 1.05% / 17 = 4.0665%
    [27388, 175, `0.0540`], // 4.19% + 25 x 2.41% / 50 = 5.395%, half up
    [39125, 250, `0.0844`],
    [43038, 275, `0.0920`], // 8.44% + 25 x 1.52% / 50 = 9.20%
    [46950, 300, `0.0996`],
    [54775, 350, `0.0996`],
  ])(`household income %d: line 5 %d, applicable figure %s`, (income, pct, figure) => {
    const g = fg(ptcReturn(income, 5000, 6000, 0));
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`${pct}`);
    expect(val(g, `/formattedApplicableFigure`)).toBe(figure);
  });
});

describe(`Form 8962 (2026) knockouts`, () => {
  it(`household income under 100% of the poverty line with APTC knocks out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`];
    const g = fg(ptcReturn(15000, 5000, 6000, 4000));
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`95`);
    expect(val(g, `/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`)).toBe(`true`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`income-based special enrollment period: yes knocks out, unanswered fails closed, no prints`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
      `/enrolledDuringIncomeBasedSpecialEnrollmentPeriodIsComplete`,
    ];
    const yes = fg(
      ptcReturn(31300, 5000, 6000, 4500, {
        '/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod': createBooleanWrapper(true),
      })
    );
    expect(val(yes, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`)).toBe(`true`);
    expect(val(yes, `/flowIsKnockedOut`)).toBe(`true`);
    const answered = ptcReturn(31300, 5000, 6000, 4500) as Record<string, unknown>;
    const unanswered = Object.fromEntries(
      Object.entries(answered).filter(([k]) => k !== `/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod`)
    );
    const u = fg(unanswered);
    // 26 U.S.C. 36B(c)(3)(A)(iii): until the question is answered, the plan may not be a qualified health plan.
    expect(val(u, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`)).toBe(`true`);
    expect(val(u, `/flowIsKnockedOut`)).toBe(`true`);
    expect(val(u, `/enrolledDuringIncomeBasedSpecialEnrollmentPeriodIsComplete`)).toBe(`false`);
    expect(raw(u, `/ptcSectionIsComplete`).get).toBe(false);
    const no = fg(answered);
    expect(val(no, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`)).toBe(`false`);
  });

  it(`income-based special enrollment period knockout is complete false without Form 8962`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`];
    // No Marketplace plan and the question never asked: the knockout does not apply.
    const noPlan = Object.fromEntries(
      Object.entries(
        ptcReturn(31300, 5000, 6000, 0, { '/writableHasPtcQualifyingPlan': createBooleanWrapper(false) })
      ).filter(([k]) => !k.startsWith(`/1095As/`) && k !== `/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod`)
    );
    const g = fg({ ...noPlan, '/1095As': createCollectionWrapper([]) });
    expect(val(g, `/needsToFileForm8962`)).toBe(`false`);
    expect(val(g, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`)).toBe(`false`);
    // A W-2-only return never reaches the Form 8962 questions.
    expect(
      val(fg(filerWithW2NoDeductionsNoCreditsBaseData), `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`)
    ).toBe(`false`);
  });

  it(`unresolved /needsToFileForm8962 on a return with a Form 1095-A fails closed`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8962NeededOrUnresolved`,
      TEMPLATE_KNOCKOUT,
      `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
    ];
    // $4,500 of advance payments: answered, Schedule 2 line 1a is the $566 excess (Form 8962 (2026) draft line 27).
    const answered = ptcReturn(31300, 5000, 6000, 4500) as Record<string, unknown>;
    expect(val(fg(answered), `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`566.00`);
    const without = (key: string) => Object.fromEntries(Object.entries(answered).filter(([k]) => k !== key));
    for (const missing of [`/filers/#${primaryFilerId}/canBeClaimed`, `/writableHasPtcQualifyingPlan`]) {
      const g = fg(without(missing));
      expect(raw(g, `/needsToFileForm8962`).complete, missing).toBe(false);
      expect(val(g, `/form8962NeededOrUnresolved`), missing).toBe(`true`);
      expect(val(g, TEMPLATE_KNOCKOUT), missing).toBe(`true`);
      expect(val(g, `/flowIsKnockedOut`), missing).toBe(`true`);
      // The guard is true, so each knockout's own condition decides: "no" to the special enrollment period question
      // stays false, and leaving it unanswered fails closed.
      expect(val(g, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`), missing).toBe(`false`);
      const sepOpen = fg(
        Object.fromEntries(
          Object.entries(without(missing)).filter(
            ([k]) => k !== `/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod`
          )
        )
      );
      expect(val(sepOpen, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`), missing).toBe(`true`);
      expect(val(sepOpen, TEMPLATE_KNOCKOUT), missing).toBe(`true`);
      expect(val(sepOpen, `/flowIsKnockedOut`), missing).toBe(`true`);
    }
  });

  it(`Schedule C net profit with Form 8962 knocks out (self-employed health insurance deduction)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcSelfEmployedHealthInsurance`];
    const se = (expenses: number) => ({
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/scheduleCBusinesses': createCollectionWrapper([business]),
      [`/scheduleCBusinesses/#${business}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`/scheduleCBusinesses/#${business}/businessName`]: createStringWrapper(`Design studio`),
      [`/scheduleCBusinesses/#${business}/writableGrossReceipts`]: createDollarWrapper(`8000`),
      [`/scheduleCBusinesses/#${business}/writableTotalExpenses`]: createDollarWrapper(`${expenses}`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    const g = fg(ptcReturn(31300, 5000, 6000, 4500, se(1000)));
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`7000.00`);
    expect(val(g, `/flowKnockoutPtcSelfEmployedHealthInsurance`)).toBe(`true`);
    const loss = fg(ptcReturn(31300, 5000, 6000, 4500, se(9000)));
    expect(val(loss, `/flowKnockoutPtcSelfEmployedHealthInsurance`)).toBe(`false`);
  });

  it(`Part IV allocation (enrolled with another tax family) knocks out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcAllocationOfPolicyAmounts`];
    const g = fg(
      ptcReturn(31300, 5000, 6000, 4500, { '/writableIsEnrolledWithOtherFamily': createBooleanWrapper(true) })
    );
    expect(val(g, `/needsAllocations`)).toBe(`true`);
    expect(val(g, `/flowKnockoutPtcAllocationOfPolicyAmounts`)).toBe(`true`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`any return that files Form 8962 stops until a TY2026 Form 8962 template lands`, ({ task }) => {
    // Form 8962 (2026) draft, PDF p. 1: "Attach to Form 1040, 1040-SR, or 1040-NR." Only the 2024 template exists,
    // and its lines 28-29 are "Reserved for future use" on the 2026 draft (Rev. Proc. 2025-32 sec. 2.04, PDF p. 5).
    task.meta.testedFactPaths = [TEMPLATE_KNOCKOUT];
    const g = fg(ptcReturn(31300, 5000, 6000, 4500));
    expect(val(g, `/needsToFileForm8962`)).toBe(`true`);
    expect(val(g, TEMPLATE_KNOCKOUT)).toBe(`true`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
    expect(val(fg(filerWithW2NoDeductionsNoCreditsBaseData), TEMPLATE_KNOCKOUT)).toBe(`false`);
  });

  it(`no Marketplace plan, and a W-2-only return: every PTC knockout is complete false`, ({ task }) => {
    task.meta.testedFactPaths = [...knockouts, TEMPLATE_KNOCKOUT];
    const noPlan = Object.fromEntries(
      Object.entries(
        ptcReturn(31300, 5000, 6000, 0, { '/writableHasPtcQualifyingPlan': createBooleanWrapper(false) })
      ).filter(([k]) => !k.startsWith(`/1095As/`))
    );
    const g = fg({ ...noPlan, '/1095As': createCollectionWrapper([]) });
    expectNoPtcKnockout(g);
    expect(val(g, TEMPLATE_KNOCKOUT)).toBe(`false`);
    expectNoPtcKnockout(fg(filerWithW2NoDeductionsNoCreditsBaseData));
  });
});
