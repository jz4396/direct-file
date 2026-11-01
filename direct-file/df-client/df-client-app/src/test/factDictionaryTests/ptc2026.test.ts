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
import { filerWithW2NoDeductionsNoCreditsBaseData, makeChildData, makeW2Data, primaryFilerId } from '../testData.js';

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
  `/flowKnockoutForm8962NeededOrUnresolved`,
  `/flowKnockoutPtcAllocationOfPolicyAmounts`,
  `/flowKnockoutPtcAlternativeCalculationForYearOfMarriage`,
  `/flowKnockoutPtcSelfEmployedHealthInsurance`,
  `/flowKnockoutPtcDependentForm2555`,
  `/flowKnockoutPtcForm8814`,
  `/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`,
  `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
];
const expectNoPtcKnockout = (g: ReturnType<typeof fg>) => {
  for (const k of knockouts) expect(val(g, k), k).toBe(`false`);
};
/** True only when /flowIsKnockedOut is complete and true. An incomplete result is not a stop. */
const knockedOut = (g: ReturnType<typeof fg>) => {
  const r = raw(g, `/flowIsKnockedOut`);
  return r.complete && r.get.toString() === `true`;
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

  it(`Alaska family of 1: 2025 HHS poverty line $19,550, line 5 200, line 8a 2,581`, ({ task }) => {
    task.meta.testedFactPaths = [`/federalPovertyLevelThreshold`, `/ptcAnnualContributionAmount`];
    // 90 FR 5917 p. 5917: Alaska $19,550. 39,100 / 19,550 = 200%. Rev. Proc. 2025-25 sec. 3.01: 6.60%.
    // round(39,100 x 0.0660 = 2,580.60) = 2,581.
    const g = fg(
      ptcReturn(39100, 5000, 6000, 0, {
        '/filerResidenceAndIncomeState': createEnumWrapper(`ak`, `/scopedStateOptions`),
      })
    );
    expect(val(g, `/federalPovertyLineLocationIsAlaska`)).toBe(`true`);
    expect(val(g, `/federalPovertyLevelThreshold`)).toBe(`19550.00`);
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`200`);
    expect(val(g, `/formattedApplicableFigure`)).toBe(`0.0660`);
    expect(val(g, `/ptcAnnualContributionAmount`)).toBe(`2581.00`);
    expect(val(g, `/ptcCanReportAnnualTotals`)).toBe(`true`);
    expectNoPtcKnockout(g);
  });
});

const MONTH = {
  jan: `Jan`,
  feb: `Feb`,
  mar: `Mar`,
  apr: `Apr`,
  may: `May`,
  jun: `Jun`,
  jul: `Jul`,
  aug: `Aug`,
  sep: `Sep`,
  oct: `Oct`,
  nov: `Nov`,
  dec: `Dec`,
} as const;
const monthlyDollars = (
  stem: `writablePtcMonthlyPremium` | `writablePtcMonthlySlcspPremium` | `writablePtcMonthlyAptcPremium`,
  amounts: Partial<Record<keyof typeof MONTH, number>>
) =>
  Object.fromEntries(
    (Object.entries(amounts) as [keyof typeof MONTH, number][]).map(([month, amount]) => [
      `${p}/${stem}${MONTH[month]}`,
      createDollarWrapper(`${amount}`),
    ])
  );
const halfYearMonths = [`jul`, `aug`, `sep`, `oct`, `nov`, `dec`] as const;
const halfYearAmount = (amount: number) =>
  Object.fromEntries(halfYearMonths.map((month) => [month, amount])) as Partial<Record<keyof typeof MONTH, number>>;

describe(`Form 8962 (2026) monthly and partial-year single policy`, () => {
  it(`July-December enrollment uses lines 12-23: line 24 1,968, line 25 2,400, line 27 432`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/ptcCanReportAnnualTotals`,
      `/needsToFileForm8962Monthly`,
      `/totalPtcAmountAllowed`,
      `/monthlyPtcAllowedForJul`,
    ];
    // Instructions for Form 8962 (2025), PDF p. 14, Line 10: fewer than 12 months uses lines 12 through 23.
    // Household income $31,300 is 200% of $15,650. Line 8b is round(2,066 / 12) = 172.
    // Each coverage month: lesser of $500 and ($500 - $172) = $328. Six months = $1,968.
    // APTC $400 x 6 = $2,400. Excess $432. The pre-2026 Single under-200% cap was $375.
    const g = fg(
      ptcReturn(31300, 6000, 6000, 4800, {
        [`${p}/writablePolicyStartDate`]: createDayWrapper(`2026-07-01`),
        [`${p}/writablePolicyEndDate`]: createDayWrapper(`2026-12-31`),
        [`${p}/coverageMonths`]: createMultEnumWrapper([...halfYearMonths], `/1095As/*/monthOptions`),
        ...monthlyDollars(`writablePtcMonthlyPremium`, halfYearAmount(500)),
        ...monthlyDollars(`writablePtcMonthlySlcspPremium`, halfYearAmount(500)),
        ...monthlyDollars(`writablePtcMonthlyAptcPremium`, halfYearAmount(400)),
      })
    );
    expect(val(g, `${p}/hasPolicyForAllMonths`)).toBe(`false`);
    expect(val(g, `${p}/hasAll12CoverageMonths`)).toBe(`false`);
    expect(val(g, `${p}/policyAndCoverageAreFullYear`)).toBe(`false`);
    expect(val(g, `/ptcCanReportAnnualTotals`)).toBe(`false`);
    expect(val(g, `/needsToFileForm8962Monthly`)).toBe(`true`);
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`200`);
    expect(val(g, `/formattedApplicableFigure`)).toBe(`0.0660`);
    expect(val(g, `/ptcMontlyContributionAmount`)).toBe(`172.00`);
    expect(raw(g, `/monthlyPtcAllowedForJan`).complete).toBe(false);
    expect(val(g, `/monthlyPtcAllowedForJul`)).toBe(`328.00`);
    expect(val(g, `/monthlyPtcAllowedForDec`)).toBe(`328.00`);
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`1968.00`);
    expect(val(g, `/totalAptcAmountTaken`)).toBe(`2400.00`);
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`432.00`);
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`432.00`);
    expect(val(g, `/schedule2Line1z`)).toBe(`432.00`);
    expect(val(g, `/isRepaymentLimitationIsActive`)).toBe(`false`);
    expectNoPtcKnockout(g);
  });

  it(`January-December dates with only six coverage months stay on lines 12-23`, ({ task }) => {
    task.meta.testedFactPaths = [`/1095As/*/policyAndCoverageAreFullYear`, `/totalPtcAmountAllowed`];
    // Policy dates span the year, premiums marked unchanged, and annual column A/B/C filled ($6,000 / $6,000 /
    // $4,800). Line 11 would be PTC $3,934 and excess $866. Coverage months are July-December only, so line 11
    // does not apply (Instructions for Form 8962 (2025), PDF p. 14, Line 10).
    // January-June: premium $100, SLCSP $0 (not a coverage month), allowed $0, APTC $50.
    // July-December: allowed $328, APTC $400. Line 24 = $1,968. Line 25 = $2,700. Line 27 = $732.
    const earlyPremium = { jan: 100, feb: 100, mar: 100, apr: 100, may: 100, jun: 100 };
    const earlyAptc = { jan: 50, feb: 50, mar: 50, apr: 50, may: 50, jun: 50 };
    const g = fg(
      ptcReturn(31300, 6000, 6000, 4800, {
        [`${p}/coverageMonths`]: createMultEnumWrapper([...halfYearMonths], `/1095As/*/monthOptions`),
        ...monthlyDollars(`writablePtcMonthlyPremium`, { ...earlyPremium, ...halfYearAmount(500) }),
        ...monthlyDollars(`writablePtcMonthlySlcspPremium`, halfYearAmount(500)),
        ...monthlyDollars(`writablePtcMonthlyAptcPremium`, { ...earlyAptc, ...halfYearAmount(400) }),
      })
    );
    expect(val(g, `${p}/hasPolicyForAllMonths`)).toBe(`true`);
    expect(val(g, `${p}/hasAll12CoverageMonths`)).toBe(`false`);
    expect(val(g, `${p}/policyAndCoverageAreFullYear`)).toBe(`false`);
    expect(val(g, `${p}/noChangesAnd12MonthPolicy`)).toBe(`false`);
    expect(raw(g, `${p}/ptcAnnualPremium`).complete).toBe(false);
    expect(val(g, `/ptcCanReportAnnualTotals`)).toBe(`false`);
    expect(val(g, `/needsToFileForm8962Monthly`)).toBe(`true`);
    expect(val(g, `/monthlyPtcAllowedForJan`)).toBe(`0.00`);
    expect(val(g, `/monthlyPtcSlcspPremiumForJan`)).toBe(`0.00`);
    expect(val(g, `/monthlyAptcPremiumForJan`)).toBe(`50.00`);
    expect(val(g, `/monthlyPtcAllowedForJul`)).toBe(`328.00`);
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`1968.00`);
    expect(val(g, `/totalAptcAmountTaken`)).toBe(`2700.00`);
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`732.00`);
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`732.00`);
    expect(val(g, `/schedule2Line1z`)).toBe(`732.00`);
    expectNoPtcKnockout(g);
  });

  it(`zero coverage months with advance payments still repays the annual advance on line 27`, ({ task }) => {
    task.meta.testedFactPaths = [`/ptcCanReportAnnualTotals`, `/totalPtcAmountAllowed`];
    const g = fg(
      ptcReturn(31300, 5000, 6000, 4500, {
        [`${p}/hasCoverageMonths`]: createBooleanWrapper(false),
        [`${p}/coverageMonths`]: createMultEnumWrapper([], `/1095As/*/monthOptions`),
      })
    );
    expect(val(g, `${p}/hasZeroCoverageMonths`)).toBe(`true`);
    expect(val(g, `${p}/policyAndCoverageAreFullYear`)).toBe(`false`);
    expect(val(g, `/ptcCanReportAnnualTotals`)).toBe(`true`);
    expect(val(g, `/totalPtcAmountAllowed`)).toBe(`0.00`);
    expect(val(g, `/totalAptcAmountTaken`)).toBe(`4500.00`);
    expect(val(g, `/netPtcAmountWhenNegative`)).toBe(`4500.00`);
    expect(val(g, `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`4500.00`);
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

  it(`unresolved /needsToFileForm8962 refuses even when the other PTC answers are no`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8962NeededOrUnresolved`,
      `/flowKnockoutForm8962NeededOrUnresolved`,
      `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
    ];
    // $4,500 of advance payments: answered, Schedule 2 line 1a is the $566 excess (Form 8962 (2026) draft line 27).
    const answered = ptcReturn(31300, 5000, 6000, 4500) as Record<string, unknown>;
    expect(val(fg(answered), `/lesserOfNetPtcAmountAndRepaymentLimitation`)).toBe(`566.00`);
    expect(val(fg(answered), `/flowKnockoutForm8962NeededOrUnresolved`)).toBe(`false`);
    const without = (key: string) => Object.fromEntries(Object.entries(answered).filter(([k]) => k !== key));
    for (const missing of [`/filers/#${primaryFilerId}/canBeClaimed`, `/writableHasPtcQualifyingPlan`]) {
      const g = fg(without(missing));
      expect(raw(g, `/needsToFileForm8962`).complete, missing).toBe(false);
      expect(val(g, `/form8962NeededOrUnresolved`), missing).toBe(`true`);
      // "No" on the special enrollment period question stays false. The unresolved Form 8962 stop still refuses,
      // so Schedule 2 line 1a is not printed blank.
      expect(val(g, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`), missing).toBe(`false`);
      expect(val(g, `/flowKnockoutForm8962NeededOrUnresolved`), missing).toBe(`true`);
      expect(val(g, `/flowIsKnockedOut`), missing).toBe(`true`);
      const sepOpen = fg(
        Object.fromEntries(
          Object.entries(without(missing)).filter(
            ([k]) => k !== `/writableEnrolledDuringIncomeBasedSpecialEnrollmentPeriod`
          )
        )
      );
      expect(val(sepOpen, `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`), missing).toBe(`true`);
      expect(val(sepOpen, `/flowKnockoutForm8962NeededOrUnresolved`), missing).toBe(`true`);
      expect(val(sepOpen, `/flowIsKnockedOut`), missing).toBe(`true`);
    }
  });

  it(`qualifying plan yes with an empty Form 1095-A list refuses the print`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8962NeededOrUnresolved`,
      `/needsToFileForm8962`,
      `/flowKnockoutForm8962NeededOrUnresolved`,
    ];
    // The only 1095-A deleted: /needsToFileForm8962 reads a definite no from the empty collection. Advance payments
    // still have to be reconciled (Form 8962 (2026) draft, PDF p. 1, line 27), so the return stops.
    for (const advance of [true, false]) {
      const emptied = Object.fromEntries(
        Object.entries(ptcReturn(31300, 5000, 6000, 4500)).filter(([k]) => !k.startsWith(`/1095As/`))
      );
      const g = fg({
        ...emptied,
        '/1095As': createCollectionWrapper([]),
        '/1095AsIsDone': createBooleanWrapper(true),
        '/writableHasAdvancedPtc': createBooleanWrapper(advance),
      });
      expect(val(g, `/writableHasPtcQualifyingPlan`)).toBe(`true`);
      expect(val(g, `/needsToFileForm8962`), `${advance}`).toBe(`false`);
      expect(val(g, `/form8962NeededOrUnresolved`), `${advance}`).toBe(`true`);
      expect(val(g, `/flowKnockoutForm8962NeededOrUnresolved`), `${advance}`).toBe(`true`);
      expect(val(g, `/flowIsKnockedOut`), `${advance}`).toBe(`true`);
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

  it(`a computed Form 8962 return is not stopped for lack of a template`, ({ task }) => {
    // Form 8962 (2026) draft, PDF p. 1: "Attach to Form 1040, 1040-SR, or 1040-NR." Lines 28-29 are "Reserved for
    // future use" (Rev. Proc. 2025-32 sec. 2.04, PDF p. 5). The 2026 draft is the template, so filing Form 8962 is
    // not itself a stop.
    task.meta.testedFactPaths = [`/needsToFileForm8962`, `/flowIsKnockedOut`, `/form8962Line6No`];
    const g = fg(ptcReturn(31300, 5000, 6000, 4500));
    expect(val(g, `/needsToFileForm8962`)).toBe(`true`);
    expect(val(g, `/isHouseholdIncome401PercentOfPovertyLine`)).toBe(`false`);
    expect(val(g, `/form8962Line6No`)).toBe(`true`);
    // This fixture leaves unrelated interview questions unanswered, so /flowIsKnockedOut stays incomplete.
    // Filing Form 8962 is not what makes it true.
    expect(knockedOut(g)).toBe(false);
    const over = fg(ptcReturn(62800, 5000, 6000, 3000));
    expect(val(over, `/isHouseholdIncome401PercentOfPovertyLine`)).toBe(`true`);
    expect(val(over, `/form8962Line6No`)).toBe(`false`);
    expectNoPtcKnockout(g);
  });

  it(`no Marketplace plan, and a W-2-only return: every PTC knockout is complete false`, ({ task }) => {
    task.meta.testedFactPaths = [...knockouts];
    const noPlan = Object.fromEntries(
      Object.entries(
        ptcReturn(31300, 5000, 6000, 0, { '/writableHasPtcQualifyingPlan': createBooleanWrapper(false) })
      ).filter(([k]) => !k.startsWith(`/1095As/`))
    );
    const g = fg({ ...noPlan, '/1095As': createCollectionWrapper([]) });
    expectNoPtcKnockout(g);
    expectNoPtcKnockout(fg(filerWithW2NoDeductionsNoCreditsBaseData));
  });
});

/**
 * Form 8962 line 2b. 26 U.S.C. 36B(d)(2)(A)(ii) (https://www.law.cornell.edu/uscode/text/26/36B): household income
 * includes "the aggregate modified adjusted gross incomes of all other individuals who (I) were taken into account in
 * determining the taxpayer's family size under paragraph (1), and (II) were required to file a return of tax imposed
 * by section 1". Instructions for Form 8962 (2025), https://www.irs.gov/pub/irs-pdf/i8962.pdf, PDF p. 8, Worksheet
 * 1-2, line 5: "Add lines 1 through 4. Enter here and on Form 8962, line 2b". PDF p. 8, Line 3: "Add the amounts on
 * lines 2a and 2b. Combine them even if one or both of them are negative. If the total is less than zero, enter -0-".
 * PDF p. 22: "Complete line 2b only if your dependent(s) is required to file an income tax return."
 */
const dependentId = `88c00000-0000-4000-8000-000000000001`;
const dependentsMagi = (
  agi: number,
  taxExemptInterest: number,
  nontaxableSocialSecurity: number,
  requiredToFile = true,
  dependentHasForm2555 = false,
  filingForm8814 = false
) => ({
  '/familyAndHousehold': createCollectionWrapper([dependentId]),
  ...makeChildData(dependentId),
  '/writableDependentsRequiredToFile': createBooleanWrapper(requiredToFile),
  '/writablePtcDependentHasForm2555': createBooleanWrapper(dependentHasForm2555),
  '/writablePtcFilingForm8814': createBooleanWrapper(filingForm8814),
  '/writablePtcDependentsAgi': createDollarWrapper(`${agi}`),
  '/writablePtcDependentsTaxExemptInterest': createDollarWrapper(`${taxExemptInterest}`),
  '/writablePtcDependentsNontaxableSocialSecurity': createDollarWrapper(`${nontaxableSocialSecurity}`),
});

describe(`Form 8962 line 2b dependents' modified AGI`, () => {
  it(`a tax family of 1 leaves line 2b blank and line 3 equal to line 2a`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`, `/householdIncome`];
    const g = fg(ptcReturn(31300, 5000, 6000, 4500));
    expect(val(g, `/taxFamilySize`)).toBe(`1`);
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`false`);
    expect(val(g, `/flowKnockoutPtcDependentForm2555`)).toBe(`false`);
    expect(val(g, `/flowKnockoutPtcForm8814`)).toBe(`false`);
    expect(raw(g, `/form8962Line2b`).complete).toBe(false);
    expect(val(g, `/ptcMagi`)).toBe(`31300.00`);
    expect(val(g, `/householdIncome`)).toBe(`31300.00`);
  });

  it(`Worksheet 1-2 lines 1 through 4 are line 2b and are added to line 3`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`, `/householdIncome`, `/householdIncomeAsPercent`];
    // Line 1 AGI 8,000 + line 2 tax-exempt interest 1,500 + line 4 nontaxable social security 900 = 10,400.
    // Worksheet line 3 is zero: no dependent has Form 2555, lines 45 and 50, and Form 8814 is not filed.
    // Filer line 2a is 31,300. Line 3 is 41,700.
    // Tax family size 2. 2025 HHS poverty guideline, 90 FR 5917 p. 5917: 15,650 + 5,500 = 21,150.
    // 41,700 x 100 / 21,150 = 197.16, and line 5 drops the fraction (i8962 (2025), PDF p. 9).
    const g = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(8000, 1500, 900)));
    expect(val(g, `/claimedDependentsCount`)).toBe(`1`);
    expect(val(g, `/taxFamilySize`)).toBe(`2`);
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`true`);
    expect(val(g, `/flowKnockoutPtcDependentForm2555`)).toBe(`false`);
    expect(val(g, `/flowKnockoutPtcForm8814`)).toBe(`false`);
    expect(val(g, `/form8962Line2b`)).toBe(`10400.00`);
    expect(val(g, `/ptcMagi`)).toBe(`31300.00`);
    expect(val(g, `/householdIncome`)).toBe(`41700.00`);
    expect(val(g, `/federalPovertyLevelThreshold`)).toBe(`21150.00`);
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`197`);
    expectNoPtcKnockout(g);
    expect(val(g, `/ptcSectionIsComplete`)).toBe(`true`);
  });

  it(`a dependent filing only for a refund is left off line 2b`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`, `/householdIncome`];
    // PDF p. 8, Line 2b: "Do not include the modified AGI of dependents who are filing a tax return only to claim a
    // refund of tax withheld or estimated tax." The person is still in tax family size. Stored worksheet amounts are
    // not line 2b. 31,300 x 100 / 21,150 = 147.99, and line 5 drops the fraction (i8962 (2025), PDF p. 9).
    const g = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(8000, 1500, 900, false)));
    expect(val(g, `/taxFamilySize`)).toBe(`2`);
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`false`);
    expect(raw(g, `/form8962Line2b`).complete).toBe(false);
    expect(val(g, `/householdIncome`)).toBe(`31300.00`);
    expect(val(g, `/householdIncomeAsPercent`)).toBe(`147`);
  });

  it(`negative dependent AGI is combined on line 3, and a negative total is -0-`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`, `/householdIncome`];
    const combined = fg(ptcReturn(20000, 5000, 6000, 0, dependentsMagi(-2500, 0, 0)));
    expect(val(combined, `/form8962Line2b`)).toBe(`-2500.00`);
    expect(val(combined, `/householdIncome`)).toBe(`17500.00`);
    expect(val(combined, `/householdIncomeAsPercent`)).toBe(`82`);
    // Advance payments keep Form 8962 needed, so line 5 of 0 is the below-100 knockout
    // (26 U.S.C. 36B(c)(1)(A)).
    const floored = fg(ptcReturn(1000, 5000, 6000, 400, dependentsMagi(-4000, 0, 0)));
    expect(val(floored, `/form8962Line2b`)).toBe(`-4000.00`);
    expect(val(floored, `/householdIncome`)).toBe(`0.00`);
    expect(val(floored, `/householdIncomeAsPercent`)).toBe(`0`);
    expect(val(floored, `/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`)).toBe(`true`);
  });

  it(`line 2b rounds half up to a whole dollar`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`];
    // PDF p. 22: "enter dollars only on Form 8962."
    const up = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(10.5, 0, 0)));
    expect(val(up, `/form8962Line2b`)).toBe(`11.00`);
    const down = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(10.49, 0, 0)));
    expect(val(down, `/form8962Line2b`)).toBe(`10.00`);
  });

  it(`line 3 is incomplete until Worksheet 1-2 is complete`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8962Line2b`, `/householdIncome`];
    const { '/writablePtcDependentsAgi': _agi, ...withoutAgi } = dependentsMagi(8000, 1500, 900);
    const g = fg(ptcReturn(31300, 5000, 6000, 0, withoutAgi));
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`true`);
    expect(raw(g, `/form8962Line2b`).complete).toBe(false);
    expect(raw(g, `/householdIncome`).complete).toBe(false);
    expect(val(g, `/ptcSectionIsComplete`)).toBe(`false`);
  });

  it(`a dependent with Form 2555, lines 45 and 50, stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcDependentForm2555`];
    // PDF p. 8, Worksheet 1-2, line 3: "Enter any amounts for your dependents from Form 2555, lines 45 and 50".
    // 26 U.S.C. 36B(d)(2)(B)(i). That amount is not collected, and line 2b is not computed without it.
    const g = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(8000, 1500, 900, true, true, false)));
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`true`);
    expect(val(g, `/flowKnockoutPtcDependentForm2555`)).toBe(`true`);
    expect(val(g, `/flowKnockoutPtcForm8814`)).toBe(`false`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
    expect(raw(g, `/form8962Line2b`).complete).toBe(false);
    expect(raw(g, `/householdIncome`).complete).toBe(false);
  });

  it(`filing Form 8814 stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPtcForm8814`];
    // PDF p. 8, Line 2b, Form 8814: if line 4 is more than $1,350, Worksheet 1-2, line 1, includes Form 8814, line
    // 1b, the lesser of line 4 or line 5, and the child's nontaxable social security. Those amounts are not computed.
    // The child is not required to file. Line 3 is not line 2a while Form 8814 is filed.
    const g = fg(ptcReturn(31300, 5000, 6000, 0, dependentsMagi(0, 0, 0, false, false, true)));
    expect(val(g, `/dependentsRequiredToFile`)).toBe(`false`);
    expect(val(g, `/flowKnockoutPtcForm8814`)).toBe(`true`);
    expect(val(g, `/flowKnockoutPtcDependentForm2555`)).toBe(`false`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
    expect(raw(g, `/form8962Line2b`).complete).toBe(false);
    expect(raw(g, `/householdIncome`).complete).toBe(false);
  });
});
