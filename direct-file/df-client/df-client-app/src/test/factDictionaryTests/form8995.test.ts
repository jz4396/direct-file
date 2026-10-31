import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';

/**
 * #87 Form 8995 (2026) draft, Created 5/1/26 (https://www.irs.gov/pub/irs-dft/f8995--dft.pdf), lines 1-17, and Form
 * 1040 (2026) draft line 13b. 26 U.S.C. 199A(a), (b)(2)(A), (i) (https://www.law.cornell.edu/uscode/text/26/199A).
 * Threshold: Rev. Proc. 2025-32 §3.26, PDF pp. 21-22. Minimum deduction: §2.12, PDF p. 7. Standard deduction (Single)
 * $16,100. Golden end-to-end scenarios (synthetic data), whole-dollar Schedule SE lines.
 */
const biz1 = `f8995000-0000-4000-8000-000000000001`;
const biz2 = `f8995000-0000-4000-8000-000000000002`;
const biz3 = `f8995000-0000-4000-8000-000000000003`;
const biz4 = `f8995000-0000-4000-8000-000000000004`;
const biz5 = `f8995000-0000-4000-8000-000000000005`;
const biz6 = `f8995000-0000-4000-8000-000000000006`;
const div = `f8995000-0000-4000-8000-0000000000d1`;

const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
};
const business = (id: string, gross: number, expenses: number, active = true) => ({
  [`/scheduleCBusinesses/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${id}/businessName`]: createStringWrapper(`Consulting ${id.slice(-1)}`),
  [`/scheduleCBusinesses/#${id}/writableGrossReceipts`]: createDollarWrapper(`${gross}`),
  [`/scheduleCBusinesses/#${id}/writableTotalExpenses`]: createDollarWrapper(`${expenses}`),
  [`/scheduleCBusinesses/#${id}/materiallyParticipates`]: createBooleanWrapper(active),
});
const seScopeNo = {
  '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadChurchEmployeeIncome': createBooleanWrapper(false),
  '/usesSeOptionalMethod': createBooleanWrapper(false),
  '/hasMinisterOrSeExemption': createBooleanWrapper(false),
  '/hasNotarySeExclusion': createBooleanWrapper(false),
  '/hadForm8919Wages': createBooleanWrapper(false),
};
const scheduleC = (biz: Record<string, unknown>, ids: string[], extra: Record<string, unknown> = {}) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  ...seScopeNo,
  '/scheduleCBusinesses': createCollectionWrapper(ids),
  ...biz,
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  ...extra,
});
const section199ADividends = (amount: number, holdingMet = true) => ({
  '/dividendReports': createCollectionWrapper([div]),
  [`/dividendReports/#${div}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${div}/payer`]: createStringWrapper(`Synthetic REIT Fund`),
  [`/dividendReports/#${div}/ordinaryDividends`]: createDollarWrapper(`${amount}`),
  [`/dividendReports/#${div}/writableSection199ADividends`]: createDollarWrapper(`${amount}`),
  [`/dividendReports/#${div}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(holdingMet),
  [`/dividendReports/#${div}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/dividendReportsIsDone': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
});
const qualifiedDividends = (amount: number) => ({
  '/dividendReports': createCollectionWrapper([div]),
  [`/dividendReports/#${div}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${div}/payer`]: createStringWrapper(`Index Fund Co`),
  [`/dividendReports/#${div}/ordinaryDividends`]: createDollarWrapper(`${amount}`),
  [`/dividendReports/#${div}/writableQualifiedDividends`]: createDollarWrapper(`${amount}`),
  [`/dividendReports/#${div}/qualifiedDividendsHoldingPeriodNotMet`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/dividendReportsIsDone': createBooleanWrapper(true),
});
const fg = (data: Record<string, unknown>) => setupFactGraph(data).factGraph;
const val = (g: ReturnType<typeof fg>, p: string) => {
  const r = g.get(p as ConcretePath);
  expect(r.complete, `${p} complete`).toBe(true);
  return r.get.toString();
};
const knockouts = [
  `/flowKnockoutQbiAboveThreshold`,
  `/flowKnockoutQbiPriorYearCarryforward`,
  `/flowKnockoutQbiCooperativePatron`,
  `/flowKnockoutQbiMixedParticipation`,
  `/flowKnockoutScheduleCQbi`,
];
const expectNoQbiKnockout = (g: ReturnType<typeof fg>) => {
  for (const k of knockouts) expect(val(g, k), k).toBe(`false`);
};

describe(`Form 8995 simplified QBI deduction (TY2026)`, () => {
  it(`A: Sch C $50,000 → line 5 9,293, line 14 6,073, line 17 6,073 on 1040 line 13b, TI 24,294`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8995Line5`,
      `/form8995Line11`,
      `/form8995Line14`,
      `/form8995Line17`,
      `/taxableIncome`,
    ];
    const g = fg({ ...noW2, ...scheduleC(business(biz1, 60000, 10000), [biz1]) });
    // SE tax round(46,175 x 12.4%) + round(46,175 x 2.9%) = 5,726 + 1,339 = 7,065; half 3,532.50 → 3,533.
    expect(val(g, `/selfEmploymentTax`)).toBe(`7065.00`);
    expect(val(g, `/deductibleSelfEmploymentTax`)).toBe(`3533.00`);
    expect(val(g, `/agi`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line2`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line1iQbi`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line18Pdf`)).toBe(`0.00`);
    expect(val(g, `/form8995Line19Pdf`)).toBe(`0.00`);
    expect(val(g, `/form8995Line4`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line5`)).toBe(`9293.00`); // round(9,293.40)
    expect(val(g, `/form8995Line10`)).toBe(`9293.00`);
    expect(val(g, `/form8995Line11`)).toBe(`30367.00`); // 46,467 - 16,100
    expect(val(g, `/form8995Line12`)).toBe(`0.00`);
    expect(val(g, `/form8995Line14`)).toBe(`6073.00`); // round(6,073.40)
    expect(val(g, `/form8995Line15`)).toBe(`6073.00`);
    expect(val(g, `/form8995Line16`)).toBe(`400.00`);
    expect(val(g, `/form8995Line17`)).toBe(`6073.00`);
    expect(val(g, `/qualifiedBusinessIncomeDeduction`)).toBe(`6073.00`);
    expect(val(g, `/totalDeductions`)).toBe(`22173.00`); // 16,100 + 6,073 (line 14 includes 13b)
    expect(val(g, `/taxableIncome`)).toBe(`24294.00`);
    expectNoQbiKnockout(g);
  });

  it(`B: A + $10,000 qualified dividends → line 11 40,367, line 12 10,000, line 17 6,073, TI 34,294`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8995Line12`, `/form8995Line13`, `/form8995Line17`, `/taxableIncome`];
    const g = fg({ ...noW2, ...scheduleC(business(biz1, 60000, 10000), [biz1]), ...qualifiedDividends(10000) });
    expect(val(g, `/form8995Line11`)).toBe(`40367.00`);
    expect(val(g, `/form8995Line12`)).toBe(`10000.00`);
    expect(val(g, `/form8995Line13`)).toBe(`30367.00`);
    expect(val(g, `/form8995Line14`)).toBe(`6073.00`);
    expect(val(g, `/form8995Line17`)).toBe(`6073.00`);
    expect(val(g, `/taxableIncome`)).toBe(`34294.00`);
  });

  it(`C: W-2 $40,000 + Sch C $2,000 active → line 15 372, line 16 400, line 17 400, TI 25,358`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8995ActiveQbi`, `/form8995Line16`, `/form8995Line17`, `/taxableIncome`];
    const data = {
      ...noW2,
      ...makeW2Data(40000),
      '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
    };
    const g = fg({ ...data, ...scheduleC(business(biz1, 2000, 0), [biz1]) });
    expect(val(g, `/deductibleSelfEmploymentTax`)).toBe(`142.00`); // round(283 / 2)
    expect(val(g, `/form8995Line2`)).toBe(`1858.00`);
    expect(val(g, `/form8995Line5`)).toBe(`372.00`); // round(371.60)
    expect(val(g, `/form8995Line11`)).toBe(`25758.00`);
    expect(val(g, `/form8995Line14`)).toBe(`5152.00`); // round(5,151.60)
    expect(val(g, `/form8995Line15`)).toBe(`372.00`);
    expect(val(g, `/form8995ActiveQbi`)).toBe(`1858.00`);
    expect(val(g, `/form8995Line16`)).toBe(`400.00`);
    expect(val(g, `/form8995Line17`)).toBe(`400.00`);
    expect(val(g, `/taxableIncome`)).toBe(`25358.00`);
    // Material participation "no": not an applicable taxpayer under 199A(i)(2), line 17 = line 15.
    const passive = fg({ ...data, ...scheduleC(business(biz1, 2000, 0, false), [biz1]) });
    expect(val(passive, `/form8995Line16`)).toBe(`0.00`);
    expect(val(passive, `/form8995Line17`)).toBe(`372.00`);
    expect(val(passive, `/taxableIncome`)).toBe(`25386.00`);
    expectNoQbiKnockout(passive);
  });

  it(`D: Sch C loss $5,000 → line 4 0, line 17 0, line 18 (5,000)`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8995Line4`, `/form8995Line17`, `/form8995Line18`];
    const g = fg({ ...noW2, ...scheduleC(business(biz1, 1000, 6000), [biz1]) });
    expect(val(g, `/form8995Line2`)).toBe(`-5000.00`);
    expect(val(g, `/form8995Line1iQbi`)).toBe(`-5000.00`);
    expect(val(g, `/form8995Line4`)).toBe(`0.00`);
    expect(val(g, `/form8995Line18Pdf`)).toBe(`5000.00`);
    expect(val(g, `/form8995Line17`)).toBe(`0.00`);
    expect(val(g, `/form8995Line18`)).toBe(`-5000.00`);
    expect(val(g, `/qualifiedBusinessIncomeDeduction`)).toBe(`0.00`);
    expectNoQbiKnockout(g);
  });

  it(`Form 8995 PDF prints; submission stays blocked at or below the threshold and in a loss year`, ({ task }) => {
    // Instructions for Form 1040 (2025) draft (no 2026 draft yet), PDF p. 35, QBI line (13b on the 2026 form):
    // "Attach whichever form you use (Form 8995 or 8995-A) to your return." The 2026 draft prints (#17). There is
    // still no MeF mapping, so sign and submit stay blocked. 2026 Instructions for Form 8995 draft, PDF p. 6,
    // line 18: "This is the amount to be carried forward to the next year."
    task.meta.testedFactPaths = [`/flowKnockoutForm8995WithoutTy2026Template`, `/flowIsKnockedOut`];
    const computed = fg({ ...noW2, ...scheduleC(business(biz1, 60000, 10000), [biz1]) });
    expect(val(computed, `/flowKnockoutQbiAboveThreshold`)).toBe(`false`);
    expect(val(computed, `/form8995Line17`)).toBe(`6073.00`); // still computed
    expect(val(computed, `/flowKnockoutForm8995WithoutTy2026Template`)).toBe(`true`);
    expect(val(computed, `/flowIsKnockedOut`)).toBe(`true`);
    const loss = fg({ ...noW2, ...scheduleC(business(biz1, 1000, 6000), [biz1]) });
    expect(val(loss, `/form8995Line18`)).toBe(`-5000.00`);
    expect(val(loss, `/flowKnockoutForm8995WithoutTy2026Template`)).toBe(`true`);
    expect(val(loss, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`E: taxable income before QBI $201,751 (Single) → knocked out (Form 8995-A); $201,750 is not`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutQbiAboveThreshold`, `/flowIsKnockedOut`];
    // Smallest whole-dollar Schedule C profit whose line 11 (taxable income before QBI) exceeds $201,750.
    const lineFor = (gross: number) => fg({ ...noW2, ...scheduleC(business(biz1, gross, 0), [biz1]) });
    const line11 = (gross: number) => Number(val(lineFor(gross), `/form8995Line11`));
    let lo = 200000;
    let hi = 260000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (line11(mid) > 201750) hi = mid;
      else lo = mid;
    }
    const gross = hi;
    const g = lineFor(gross);
    expect(Number(val(g, `/form8995Line11`))).toBeGreaterThan(201750);
    expect(val(g, `/flowKnockoutQbiAboveThreshold`)).toBe(`true`);
    expect(val(g, `/flowKnockoutScheduleCQbi`)).toBe(`true`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
    const below = lineFor(gross - 1);
    expect(Number(val(below, `/form8995Line11`))).toBeLessThanOrEqual(201750);
    expect(val(below, `/flowKnockoutQbiAboveThreshold`)).toBe(`false`);
  });

  it(`F: prior-year carryforward "yes" → knocked out; cooperative patron "yes" → knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutQbiPriorYearCarryforward`, `/flowKnockoutQbiCooperativePatron`];
    const biz = business(biz1, 60000, 10000);
    const carry = fg({
      ...noW2,
      ...scheduleC(biz, [biz1], { '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(true) }),
    });
    expect(val(carry, `/flowKnockoutQbiPriorYearCarryforward`)).toBe(`true`);
    expect(val(carry, `/flowIsKnockedOut`)).toBe(`true`);
    const coop = fg({ ...noW2, ...scheduleC(biz, [biz1], { '/qbiIsCooperativePatron': createBooleanWrapper(true) }) });
    expect(val(coop, `/flowKnockoutQbiCooperativePatron`)).toBe(`true`);
    expect(val(coop, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`one active and one non-active business → knocked out; two active businesses are combined`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutQbiMixedParticipation`, `/form8995Line2`];
    const mixed = fg({
      ...noW2,
      ...scheduleC({ ...business(biz1, 30000, 0), ...business(biz2, 20000, 0, false) }, [biz1, biz2]),
    });
    expect(val(mixed, `/flowKnockoutQbiMixedParticipation`)).toBe(`true`);
    expect(val(mixed, `/flowIsKnockedOut`)).toBe(`true`);
    const both = fg({
      ...noW2,
      ...scheduleC({ ...business(biz1, 30000, 0), ...business(biz2, 20000, 0) }, [biz1, biz2]),
    });
    expect(val(both, `/form8995Line2`)).toBe(`46467.00`);
    // 30,000 and 20,000 positive nets. Plug is the larger row. Round(3,533 x 20,000 / 50,000) = 1,413.
    // 30,000 - (3,533 - 1,413) = 27,880 and 20,000 - 1,413 = 18,587.
    expect(val(both, `/form8995Line1iQbi`)).toBe(`27880.00`);
    expect(val(both, `/form8995Line1iiQbi`)).toBe(`18587.00`);
    expect(val(both, `/form8995Line17`)).toBe(`6073.00`);
    expectNoQbiKnockout(both);
  });

  it(`more than five Schedule C businesses stops the return; five do not`, ({ task }) => {
    // 2026 Instructions for Form 8995 draft, PDF p. 5, line 2: attach a statement. This package does not.
    task.meta.testedFactPaths = [`/flowKnockoutForm8995MoreThanFiveBusinesses`, `/flowIsKnockedOut`];
    const ids = [biz1, biz2, biz3, biz4, biz5, biz6];
    const rows = Object.assign({}, ...ids.map((id, i) => business(id, 1000, 0)));
    const six = fg({ ...noW2, ...scheduleC(rows, ids) });
    expect(val(six, `/flowKnockoutForm8995MoreThanFiveBusinesses`)).toBe(`true`);
    expect(val(six, `/flowIsKnockedOut`)).toBe(`true`);
    const fiveIds = ids.slice(0, 5);
    const fiveRows = Object.assign({}, ...fiveIds.map((id) => business(id, 1000, 0)));
    const five = fg({ ...noW2, ...scheduleC(fiveRows, fiveIds) });
    expect(val(five, `/flowKnockoutForm8995MoreThanFiveBusinesses`)).toBe(`false`);
  });

  it(`MFJ splits deductible self-employment tax per filer`, ({ task }) => {
    // Treas. Reg. 1.199A-3(b)(1)(vi). Spouse net $350 is under the $400 net-earnings threshold
    // (26 U.S.C. 1402(b)(2)), so that row's column (c) stays $350.
    task.meta.testedFactPaths = [
      `/primaryFilerDeductibleSelfEmploymentTax`,
      `/secondaryFilerDeductibleSelfEmploymentTax`,
      `/form8995Line1iQbi`,
      `/form8995Line1iiQbi`,
      `/form8995Line2`,
    ];
    const g = fg({
      ...noW2,
      ...mfjFilerData,
      ...scheduleC(
        {
          ...business(biz1, 60000, 10000),
          ...business(biz2, 350, 0),
          [`/scheduleCBusinesses/#${biz2}/filer`]: createCollectionItemWrapper(spouseId),
        },
        [biz1, biz2]
      ),
    });
    expect(val(g, `/primaryFilerDeductibleSelfEmploymentTax`)).toBe(`3533.00`);
    expect(val(g, `/secondaryFilerDeductibleSelfEmploymentTax`)).toBe(`0.00`);
    expect(val(g, `/form8995Line1iQbi`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line1iiQbi`)).toBe(`350.00`);
    expect(val(g, `/form8995Line2`)).toBe(`46817.00`);
  });

  it(`unanswered carryforward or cooperative question never passes`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutQbiPriorYearCarryforward`, `/flowKnockoutQbiCooperativePatron`];
    const {
      '/qbiHasPriorYearLossCarryforward': _a,
      '/qbiIsCooperativePatron': _b,
      ...rest
    } = scheduleC(business(biz1, 60000, 10000), [biz1]);
    const g = fg({ ...noW2, ...rest });
    expect(g.get(`/flowKnockoutQbiPriorYearCarryforward` as ConcretePath).complete).toBe(false);
    expect(g.get(`/flowKnockoutQbiCooperativePatron` as ConcretePath).complete).toBe(false);
    expect(g.get(`/scheduleCSectionIsComplete` as ConcretePath).get).toBe(false);
  });

  it(`W-2-only return: every Form 8995 knockout is complete false and line 13b is $0`, ({ task }) => {
    task.meta.testedFactPaths = [
      ...knockouts,
      `/flowKnockoutForm8995WithoutTy2026Template`,
      `/qualifiedBusinessIncomeDeduction`,
    ];
    for (const data of [
      { ...filerWithW2NoDeductionsNoCreditsBaseData },
      { ...filerWithW2NoDeductionsNoCreditsBaseData, '/hadSelfEmploymentIncome': createBooleanWrapper(false) },
    ]) {
      const g = fg(data);
      expectNoQbiKnockout(g);
      expect(val(g, `/qualifiedBusinessIncomeDeduction`)).toBe(`0.00`);
      expect(val(g, `/form8995Required`)).toBe(`false`);
      expect(val(g, `/flowKnockoutForm8995WithoutTy2026Template`)).toBe(`false`);
    }
  });

  const prop = `e8995000-0000-4000-8000-000000000001`;
  const rental = (
    id: string,
    rents: number,
    royalties: number,
    expenses: number,
    active = true,
    extra: Record<string, unknown> = {}
  ) => ({
    [`/scheduleEProperties/#${id}/propertyName`]: createStringWrapper(`Oak Street Rental`),
    [`/scheduleEProperties/#${id}/writableRents`]: createDollarWrapper(`${rents}`),
    [`/scheduleEProperties/#${id}/writableRoyalties`]: createDollarWrapper(`${royalties}`),
    [`/scheduleEProperties/#${id}/writableExpenses`]: createDollarWrapper(`${expenses}`),
    [`/scheduleEProperties/#${id}/materiallyParticipates`]: createBooleanWrapper(active),
    [`/scheduleEProperties/#${id}/reliesOnRp201938SafeHarbor`]: createBooleanWrapper(false),
    [`/scheduleEProperties/#${id}/isAggregated`]: createBooleanWrapper(false),
    [`/scheduleEProperties/#${id}/hasSuspendedPassiveLoss`]: createBooleanWrapper(false),
    ...extra,
  });
  const scheduleE = (rows: Record<string, unknown>, ids: string[], rents: number, royalties: number, expenses: number) => ({
    '/hadScheduleEIncome': createBooleanWrapper(true),
    '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
    '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
    '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
    '/scheduleEProvidesSubstantialServices': createBooleanWrapper(false),
    '/scheduleEHasPersonalUse': createBooleanWrapper(false),
    '/scheduleEHasDepreciation': createBooleanWrapper(false),
    '/scheduleEAnyPropertyLoss': createBooleanWrapper(expenses > rents + royalties),
    '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(true),
    '/scheduleEWritableRents': createDollarWrapper(`${rents}`),
    '/scheduleEWritableRoyalties': createDollarWrapper(`${royalties}`),
    '/scheduleEWritableExpenses': createDollarWrapper(`${expenses}`),
    '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
    '/qbiIsCooperativePatron': createBooleanWrapper(false),
    '/scheduleEProperties': createCollectionWrapper(ids),
    '/scheduleEPropertiesIsDone': createBooleanWrapper(true),
    ...rows,
  });

  it(`single section 162 rental: line 1(c) 50,000, line 11 33,900, line 17 6,780`, ({ task }) => {
    // 26 U.S.C. 199A(a), (b)(2)(A), (i). Rev. Proc. 2025-32 §4.14 standard deduction $16,100.
    // 26 U.S.C. 1402(a)(1): the rental is not reduced by self-employment tax.
    task.meta.testedFactPaths = [
      `/form8995Line1iQbi`,
      `/form8995Line2`,
      `/form8995Line11`,
      `/form8995Line14`,
      `/form8995Line16`,
      `/form8995Line17`,
      `/form8995Required`,
      `/flowKnockoutScheduleETradeOrBusinessQbi`,
    ];
    const g = fg({ ...noW2, ...scheduleE(rental(prop, 50000, 0, 0), [prop], 50000, 0, 0) });
    expect(val(g, `/agi`)).toBe(`50000.00`);
    expect(val(g, `/form8995Line2`)).toBe(`50000.00`);
    expect(val(g, `/form8995Line1iQbi`)).toBe(`50000.00`);
    expect(val(g, `/form8995Line1iTin`)).toBe(val(g, `/primaryFiler/tin`));
    expect(val(g, `/form8995Line5`)).toBe(`10000.00`);
    expect(val(g, `/form8995Line11`)).toBe(`33900.00`);
    expect(val(g, `/form8995Line14`)).toBe(`6780.00`);
    expect(val(g, `/form8995Line15`)).toBe(`6780.00`);
    expect(val(g, `/form8995Line16`)).toBe(`400.00`);
    expect(val(g, `/form8995Line17`)).toBe(`6780.00`);
    expect(val(g, `/qbiThresholdAmount`)).toBe(`201750.00`);
    expect(val(g, `/form8995Required`)).toBe(`true`);
    expect(val(g, `/flowKnockoutScheduleETradeOrBusinessQbi`)).toBe(`false`);
    expectNoQbiKnockout(g);
  });

  it(`MFJ section 162 rental: line 11 17,800 and line 17 3,560`, ({ task }) => {
    // Rev. Proc. 2025-32 §3.26 MFJ threshold $403,500. §4.14 standard deduction $32,200.
    task.meta.testedFactPaths = [`/form8995Line11`, `/form8995Line14`, `/form8995Line17`, `/qbiThresholdAmount`];
    const g = fg({
      ...noW2,
      ...mfjFilerData,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      ...scheduleE(rental(prop, 50000, 0, 0), [prop], 50000, 0, 0),
    });
    expect(val(g, `/form8995Line2`)).toBe(`50000.00`);
    expect(val(g, `/form8995Line11`)).toBe(`17800.00`);
    expect(val(g, `/form8995Line14`)).toBe(`3560.00`);
    expect(val(g, `/form8995Line17`)).toBe(`3560.00`);
    expect(val(g, `/qbiThresholdAmount`)).toBe(`403500.00`);
    expect(val(g, `/flowKnockoutQbiAboveThreshold`)).toBe(`false`);
  });

  it(`section 162 rental net loss is line 18 and still stops on the Schedule E loss knockout`, ({ task }) => {
    // 26 U.S.C. 199A(c)(2). 26 U.S.C. 469, 465, and 461(l) stay /flowKnockoutScheduleELoss.
    task.meta.testedFactPaths = [
      `/form8995Line2`,
      `/form8995Line16`,
      `/form8995Line17`,
      `/form8995Line18`,
      `/flowKnockoutScheduleELoss`,
      `/flowKnockoutScheduleETradeOrBusinessQbi`,
    ];
    const g = fg({ ...noW2, ...scheduleE(rental(prop, 1000, 0, 6000), [prop], 1000, 0, 6000) });
    expect(val(g, `/form8995Line1iQbi`)).toBe(`-5000.00`);
    expect(val(g, `/form8995Line2`)).toBe(`-5000.00`);
    expect(val(g, `/form8995Line4`)).toBe(`0.00`);
    expect(val(g, `/form8995Line16`)).toBe(`0.00`);
    expect(val(g, `/form8995Line17`)).toBe(`0.00`);
    expect(val(g, `/form8995Line18`)).toBe(`-5000.00`);
    expect(val(g, `/flowKnockoutScheduleELoss`)).toBe(`true`);
    expect(val(g, `/flowKnockoutScheduleETradeOrBusinessQbi`)).toBe(`false`);
  });

  it(`Schedule C plus a section 162 rental: line 2 58,467 and line 17 8,473`, ({ task }) => {
    // Schedule C column (c) is still net of deductible self-employment tax. The rental row is not.
    task.meta.testedFactPaths = [
      `/form8995Line1iQbi`,
      `/form8995Line1iiQbi`,
      `/form8995Line2`,
      `/form8995Line5`,
      `/form8995Line11`,
      `/form8995Line14`,
      `/form8995Line17`,
    ];
    const g = fg({
      ...noW2,
      ...scheduleC(business(biz1, 60000, 10000), [biz1]),
      ...scheduleE(rental(prop, 12000, 0, 0), [prop], 12000, 0, 0),
    });
    expect(val(g, `/deductibleSelfEmploymentTax`)).toBe(`3533.00`);
    expect(val(g, `/agi`)).toBe(`58467.00`);
    expect(val(g, `/form8995Line1iQbi`)).toBe(`46467.00`);
    expect(g.get(`/form8995Line1iTin` as ConcretePath).complete).toBe(true);
    expect(val(g, `/form8995Line1iiQbi`)).toBe(`12000.00`);
    expect(val(g, `/form8995Line1iiTin`)).toBe(val(g, `/primaryFiler/tin`));
    expect(val(g, `/form8995Line2`)).toBe(`58467.00`);
    expect(val(g, `/form8995Line5`)).toBe(`11693.00`);
    expect(val(g, `/form8995Line11`)).toBe(`42367.00`);
    expect(val(g, `/form8995Line14`)).toBe(`8473.00`);
    expect(val(g, `/form8995Line17`)).toBe(`8473.00`);
    expect(val(g, `/flowKnockoutQbiMixedParticipation`)).toBe(`false`);
    expect(val(g, `/flowKnockoutScheduleCQbi`)).toBe(`false`);
  });

  it(`six rows stop the return; five Schedule C businesses plus no sixth rental do not`, ({ task }) => {
    // 2026 Instructions for Form 8995 draft, PDF p. 5, line 2.
    task.meta.testedFactPaths = [`/flowKnockoutForm8995MoreThanFiveBusinesses`];
    const ids = [biz1, biz2, biz3, biz4, biz5];
    const rows = Object.assign({}, ...ids.map((id) => business(id, 1000, 0)));
    const fivePlusRental = fg({
      ...noW2,
      ...scheduleC(rows, ids),
      ...scheduleE(rental(prop, 1000, 0, 0), [prop], 1000, 0, 0),
    });
    expect(val(fivePlusRental, `/flowKnockoutForm8995MoreThanFiveBusinesses`)).toBe(`true`);
    const fourIds = ids.slice(0, 4);
    const fourRows = Object.assign({}, ...fourIds.map((id) => business(id, 1000, 0)));
    const fourPlusRental = fg({
      ...noW2,
      ...scheduleC(fourRows, fourIds),
      ...scheduleE(rental(prop, 1000, 0, 0), [prop], 1000, 0, 0),
    });
    expect(val(fourPlusRental, `/flowKnockoutForm8995MoreThanFiveBusinesses`)).toBe(`false`);
    const props = [prop, biz1, biz2, biz3, biz4, biz5];
    const sixRentals = Object.assign(
      {},
      ...props.map((id, i) => rental(id, 1000, 0, 0, true, {
        [`/scheduleEProperties/#${id}/propertyName`]: createStringWrapper(`Rental ${i}`),
      }))
    );
    const sixE = fg({ ...noW2, ...scheduleE(sixRentals, props, 6000, 0, 0) });
    expect(val(sixE, `/flowKnockoutForm8995MoreThanFiveBusinesses`)).toBe(`true`);
  });

  it(`box 5 $2,000 only: line 9 is 400 and line 17 is 0 because taxable income before the deduction is 0`, ({
    task,
  }) => {
    // Single, no Schedule C. Box 1a = box 5 = $2,000, so ordinary dividends are $2,000 and the REIT amount is not
    // added again. 26 U.S.C. 199A(b)(1)(B): line 9 is 20% of line 8. 2026 Instructions for Form 8995 draft, PDF p. 5.
    // 26 U.S.C. 199A(a): the deduction is also limited to 20% of taxable income minus net capital gain. The standard
    // deduction is $16,100 (Rev. Proc. 2025-32), which is more than AGI $2,000, so line 11 is $0 and line 17 is $0.
    task.meta.testedFactPaths = [
      `/form8995Line6`,
      `/form8995Line8`,
      `/form8995Line9`,
      `/form8995Line11`,
      `/form8995Line14`,
      `/form8995Line17`,
      `/form8995Required`,
      `/qualifiedBusinessIncomeDeduction`,
    ];
    const g = fg({ ...noW2, ...section199ADividends(2000) });
    expect(val(g, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(g, `/agi`)).toBe(`2000.00`);
    expect(val(g, `/form8995HasQbi`)).toBe(`false`);
    expect(val(g, `/form8995Required`)).toBe(`true`);
    expect(val(g, `/form8995Line6`)).toBe(`2000.00`);
    expect(val(g, `/form8995Line7`)).toBe(`0.00`);
    expect(val(g, `/form8995Line8`)).toBe(`2000.00`);
    expect(val(g, `/form8995Line9`)).toBe(`400.00`);
    expect(val(g, `/form8995Line10`)).toBe(`400.00`);
    expect(val(g, `/form8995Line11`)).toBe(`0.00`);
    expect(val(g, `/form8995Line12`)).toBe(`0.00`);
    expect(val(g, `/form8995Line14`)).toBe(`0.00`);
    expect(val(g, `/form8995Line15`)).toBe(`0.00`);
    expect(val(g, `/form8995Line16`)).toBe(`0.00`);
    expect(val(g, `/form8995Line17`)).toBe(`0.00`);
    expect(val(g, `/qualifiedBusinessIncomeDeduction`)).toBe(`0.00`);
    expect(val(g, `/flowKnockoutSection199ADividendsHoldingPeriod`)).toBe(`false`);
    expect(val(g, `/flowKnockoutQbiAboveThreshold`)).toBe(`false`);
    expect(val(g, `/flowKnockoutForm8995WithoutTy2026Template`)).toBe(`true`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`MFJ Schedule C QBI plus box 5 $2,000: line 9 is 400 and line 17 is 9,693`, ({ task }) => {
    // Schedule C gross receipts $60,000 and expenses $10,000, plus W-2 wages $80,000 and box 1a = box 5 = $2,000
    // (not qualified dividends). Deductible self-employment tax $3,533; line 2 $46,467; line 5 round(20% × 46,467)
    // = $9,293. AGI $128,467. Married filing jointly standard deduction $32,200 (Rev. Proc. 2025-32 §4.14). Line 11
    // $96,267; line 14 round(20% × 96,267) = $19,253. Line 6 $2,000; line 9 $400; line 10 $9,693. The line 14 cap
    // does not bind. 26 U.S.C. 199A(a), (b)(1)(B), (b)(2)(A). Both filers were born in 1987.
    task.meta.testedFactPaths = [
      `/form8995Line5`,
      `/form8995Line6`,
      `/form8995Line9`,
      `/form8995Line11`,
      `/form8995Line14`,
      `/form8995Line17`,
    ];
    const g = fg({
      ...noW2,
      ...mfjFilerData,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      '/MFJRequiredToFile': createBooleanWrapper(true),
      '/MFJDependentsFilingForCredits': createBooleanWrapper(false),
      ...makeW2Data(80000),
      ...scheduleC(business(biz1, 60000, 10000), [biz1]),
      ...section199ADividends(2000),
    });
    expect(val(g, `/deductibleSelfEmploymentTax`)).toBe(`3533.00`);
    expect(val(g, `/form8995Line2`)).toBe(`46467.00`);
    expect(val(g, `/form8995Line5`)).toBe(`9293.00`);
    expect(val(g, `/agi`)).toBe(`128467.00`);
    expect(val(g, `/form8995Line6`)).toBe(`2000.00`);
    expect(val(g, `/form8995Line8`)).toBe(`2000.00`);
    expect(val(g, `/form8995Line9`)).toBe(`400.00`);
    expect(val(g, `/form8995Line10`)).toBe(`9693.00`);
    expect(val(g, `/form8995Line11`)).toBe(`96267.00`);
    expect(val(g, `/form8995Line12`)).toBe(`0.00`);
    expect(val(g, `/form8995Line14`)).toBe(`19253.00`);
    expect(val(g, `/form8995Line15`)).toBe(`9693.00`);
    expect(val(g, `/form8995Line16`)).toBe(`400.00`);
    expect(val(g, `/form8995Line17`)).toBe(`9693.00`);
    expect(val(g, `/qualifiedBusinessIncomeDeduction`)).toBe(`9693.00`);
    expect(val(g, `/flowKnockoutQbiAboveThreshold`)).toBe(`false`);
    expect(val(g, `/flowKnockoutSection199ADividendsHoldingPeriod`)).toBe(`false`);
  });

  it(`a no to the REIT holding period stops; a REIT carryforward stops even with no Schedule C`, ({ task }) => {
    // 26 CFR 1.199A-3(c)(2)(ii). Form 8995 (2026) draft line 7 stays $0; a yes is a stop.
    task.meta.testedFactPaths = [
      `/flowKnockoutSection199ADividendsHoldingPeriod`,
      `/flowKnockoutQbiPriorYearCarryforward`,
    ];
    const heldNo = fg({ ...noW2, ...section199ADividends(2000, false) });
    expect(val(heldNo, `/flowKnockoutSection199ADividendsHoldingPeriod`)).toBe(`true`);
    expect(val(heldNo, `/flowKnockoutSection199ADividends`)).toBe(`false`);
    expect(val(heldNo, `/flowIsKnockedOut`)).toBe(`true`);
    const carry = fg({
      ...noW2,
      ...section199ADividends(2000),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(true),
    });
    expect(val(carry, `/form8995HasQbi`)).toBe(`false`);
    expect(val(carry, `/form8995Line7`)).toBe(`0.00`);
    expect(val(carry, `/flowKnockoutQbiPriorYearCarryforward`)).toBe(`true`);
    // /flowKnockoutScheduleCQbi stays false without Schedule C (#303). The carryforward stop is the Form 8995 fact.
    expect(val(carry, `/flowKnockoutScheduleCQbi`)).toBe(`false`);
    expect(val(carry, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`box 5 above the Form 8995 threshold stops even with no Schedule C`, ({ task }) => {
    // Rev. Proc. 2025-32 §3.26: $201,750 for a single return. Form 8995-A is not computed.
    task.meta.testedFactPaths = [`/flowKnockoutQbiAboveThreshold`, `/form8995Required`];
    const g = fg({
      ...noW2,
      ...makeW2Data(250000),
      '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
      ...section199ADividends(100),
    });
    expect(val(g, `/form8995HasQbi`)).toBe(`false`);
    expect(val(g, `/form8995Required`)).toBe(`true`);
    expect(Number(val(g, `/form8995Line11`))).toBeGreaterThan(201750);
    expect(val(g, `/flowKnockoutQbiAboveThreshold`)).toBe(`true`);
    // The Schedule C screen stays false without Schedule C (#303). The above-threshold Form 8995 fact still stops.
    expect(val(g, `/flowKnockoutScheduleCQbi`)).toBe(`false`);
    expect(val(g, `/flowIsKnockedOut`)).toBe(`true`);
  });
});
