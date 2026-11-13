import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createAddressWrapper,
  createBooleanWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

/**
 * #93 slice 3. Full-year Illinois resident, W-2 wages only.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-6825336196
 * 52,075 × 0.0495 = 2,577.7125, which rounds to 2,578. Withholding 3,000 − tax 2,578 = refund 422.
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get.toString();
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const screeners = {
  '/ilResidencyStatus': createEnumWrapper(`fullYear`, `/ilResidencyOptions`),
  '/ilHasScheduleM': createBooleanWrapper(false),
  '/ilClaimsIlEitcOrCtc': createBooleanWrapper(false),
  '/ilHasNonrefundableCredits': createBooleanWrapper(false),
  '/ilHasUseTax': createBooleanWrapper(false),
  '/ilHasCannabisOrGamingSurcharge': createBooleanWrapper(false),
  '/ilHasPassThroughWithholdingOrCredit': createBooleanWrapper(false),
  '/ilHasEstimatedOrPriorYearCredit': createBooleanWrapper(false),
  '/ilNeedsForm2210': createBooleanWrapper(false),
  '/ilHasScheduleGDonation': createBooleanWrapper(false),
  '/soldCapitalAssets': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `3456` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `3457` }),
  '/address': createAddressWrapper(`100 Synthetic Ln`, `Springfield`, `62704`, `IL`),
};

const w2 = (wages: number, withheld: number, state: `sameState` | `differentState` = `sameState`) => ({
  ...makeW2Data(wages),
  [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(state, `/incomeFormStateOptions`),
  [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`${withheld}`),
  [`/formW2s/#${w2Id}/employerAddress`]: createAddressWrapper(`200 Payroll Ave`, `Springfield`, `62704`, `IL`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`il`, `/scopedStateOptions`),
    ...w2(55000, 3000),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutIlPartYearOrNonresident`,
  `/flowKnockoutIlLivedInMoreThanOneState`,
  `/flowKnockoutIlW2NotIllinois`,
  `/flowKnockoutIlOtherFederalIncome`,
  `/flowKnockoutIlScheduleM`,
  `/flowKnockoutIlDependentsOrEitc`,
  `/flowKnockoutIlNonrefundableCredits`,
  `/flowKnockoutIlHouseholdEmployment`,
  `/flowKnockoutIlUseTax`,
  `/flowKnockoutIlCannabisGamingSurcharge`,
  `/flowKnockoutIlPassThrough`,
  `/flowKnockoutIlEstimatedPayments`,
  `/flowKnockoutIl2210`,
  `/flowKnockoutIlScheduleG`,
  `/flowKnockoutIlClaimedAsDependent`,
  `/flowKnockoutIlWitTooManyRows`,
];

describe(`IL-1040 full-year resident, W-2 wages only (#93 slice 3)`, () => {
  it(`single: line 9 55,000; line 10 2,925; line 11 52,075; line 12 2,578; line 25 3,000; refund 422`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/ilLine9`,
      `/ilLine10`,
      `/ilLine11`,
      `/ilLine12`,
      `/ilLine21`,
      `/ilLine25`,
      `/ilLine38`,
    ];
    const g = build(singleFilerData);
    expect(get(g, `/livedInIl`).get).toBe(true);
    expect(get(g, `/stateReturnIsIl`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/ilLine1`)).toBe(`55000.00`);
    expect(val(g, `/ilLine2`)).toBe(`0.00`);
    expect(val(g, `/ilLine9`)).toBe(`55000.00`);
    expect(val(g, `/ilLine10a`)).toBe(`2925.00`);
    expect(val(g, `/ilLine10b`)).toBe(`0.00`);
    expect(val(g, `/ilLine10c`)).toBe(`0.00`);
    expect(val(g, `/ilLine10d`)).toBe(`0.00`);
    expect(val(g, `/ilLine10`)).toBe(`2925.00`);
    expect(val(g, `/ilLine11`)).toBe(`52075.00`);
    expect(val(g, `/ilLine12`)).toBe(`2578.00`);
    expect(val(g, `/ilLine21`)).toBe(`0.00`);
    expect(val(g, `/ilLine25`)).toBe(`3000.00`);
    expect(val(g, `/ilLine26`)).toBe(`0.00`);
    expect(val(g, `/ilLine32`)).toBe(`422.00`);
    expect(val(g, `/ilLine33`)).toBe(`0.00`);
    expect(val(g, `/ilLine38`)).toBe(`422.00`);
    expect(val(g, `/ilLine41`)).toBe(`0.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`2578.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`3000.00`);
    expect(val(g, `/stateRefund`)).toBe(`422.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete).toBe(true);
      expect(get(g, k).get).toBe(false);
    });
  });

  it(`married filing jointly: line 10a is 5,850`, ({ task }) => {
    task.meta.testedFactPaths = [`/ilLine10a`, `/ilLine10`, `/ilLine11`, `/ilLine12`];
    const g = build(mfjFilerData);
    expect(val(g, `/ilLine9`)).toBe(`55000.00`);
    expect(val(g, `/ilLine10a`)).toBe(`5850.00`);
    expect(val(g, `/ilLine10`)).toBe(`5850.00`);
    expect(val(g, `/ilLine11`)).toBe(`49150.00`);
    expect(val(g, `/ilLine12`)).toBe(`2433.00`);
    expect(val(g, `/stateRefund`)).toBe(`567.00`);
  });

  it(`rounds Line 12 from the exact product: 50,010 stays 2,475 and 51,000 rounds up to 2,525`, ({ task }) => {
    task.meta.testedFactPaths = [`/ilLine11`, `/ilLine12`];
    // 52,935 − 2,925 = 50,010. 50,010 × 0.0495 = 2,475.495, which drops to 2,475.
    const under = build(singleFilerData, w2(52935, 0));
    expect(val(under, `/ilLine11`)).toBe(`50010.00`);
    expect(val(under, `/ilLine12`)).toBe(`2475.00`);
    // 53,925 − 2,925 = 51,000. 51,000 × 0.0495 = 2,524.50, which rounds up to 2,525.
    const half = build(singleFilerData, w2(53925, 0));
    expect(val(half, `/ilLine11`)).toBe(`51000.00`);
    expect(val(half, `/ilLine12`)).toBe(`2525.00`);
  });

  it(`exemption stays at the limit and is zero one dollar above it`, () => {
    const atLimit = build(singleFilerData, w2(250000, 0));
    expect(val(atLimit, `/ilLine10`)).toBe(`2925.00`);
    const over = build(singleFilerData, w2(250001, 0));
    expect(val(over, `/ilLine10a`)).toBe(`2925.00`);
    expect(val(over, `/ilLine10`)).toBe(`0.00`);
    const jointAtLimit = build(mfjFilerData, w2(500000, 0));
    expect(val(jointAtLimit, `/ilLine10`)).toBe(`5850.00`);
    const jointOver = build(mfjFilerData, w2(500001, 0));
    expect(val(jointOver, `/ilLine10a`)).toBe(`5850.00`);
    expect(val(jointOver, `/ilLine10`)).toBe(`0.00`);
  });

  it(`stops part-year, nonresident, and more than one state`, () => {
    const partYear = build(singleFilerData, {
      '/ilResidencyStatus': createEnumWrapper(`partYear`, `/ilResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutIlPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/ilResidencyStatus': createEnumWrapper(`nonresident`, `/ilResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutIlPartYearOrNonresident`).get).toBe(true);
    const more = build(singleFilerData, {
      '/ilResidencyStatus': createEnumWrapper(`moreThanOne`, `/ilResidencyOptions`),
    });
    expect(get(more, `/flowKnockoutIlLivedInMoreThanOneState`).get).toBe(true);
    expect(get(more, `/flowKnockoutIlPartYearOrNonresident`).get).toBe(false);
  });

  it(`stops a W-2 whose box 15 is not Illinois`, () => {
    const g = build(singleFilerData, w2(55000, 3000, `differentState`));
    expect(get(g, `/flowKnockoutIlW2NotIllinois`).get).toBe(true);
  });

  it(`stops federal income other than W-2 wages`, () => {
    const g = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(g, `/flowKnockoutIlOtherFederalIncome`).get).toBe(true);
  });

  it(`stops the yes/no Illinois questions, a dependent, and a filer who can be claimed`, () => {
    expect(
      get(build(singleFilerData, { '/ilHasScheduleM': createBooleanWrapper(true) }), `/flowKnockoutIlScheduleM`).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ilClaimsIlEitcOrCtc': createBooleanWrapper(true) }),
        `/flowKnockoutIlDependentsOrEitc`
      ).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ilHasNonrefundableCredits': createBooleanWrapper(true) }),
        `/flowKnockoutIlNonrefundableCredits`
      ).get
    ).toBe(true);
    expect(
      get(build(singleFilerData, { '/ilHasUseTax': createBooleanWrapper(true) }), `/flowKnockoutIlUseTax`).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ilHasCannabisOrGamingSurcharge': createBooleanWrapper(true) }),
        `/flowKnockoutIlCannabisGamingSurcharge`
      ).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ilHasPassThroughWithholdingOrCredit': createBooleanWrapper(true) }),
        `/flowKnockoutIlPassThrough`
      ).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ilHasEstimatedOrPriorYearCredit': createBooleanWrapper(true) }),
        `/flowKnockoutIlEstimatedPayments`
      ).get
    ).toBe(true);
    expect(
      get(build(singleFilerData, { '/ilNeedsForm2210': createBooleanWrapper(true) }), `/flowKnockoutIl2210`).get
    ).toBe(true);
    expect(
      get(build(singleFilerData, { '/ilHasScheduleGDonation': createBooleanWrapper(true) }), `/flowKnockoutIlScheduleG`)
        .get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { '/hasHouseholdEmployeeScheduleH': createBooleanWrapper(true) }),
        `/flowKnockoutIlHouseholdEmployment`
      ).get
    ).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutIlDependentsOrEitc`
      ).get
    ).toBe(true);
    expect(
      get(
        build(singleFilerData, { [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true) }),
        `/flowKnockoutIlClaimedAsDependent`
      ).get
    ).toBe(true);
  });

  it(`does not compute an Illinois return for Florida, and the Illinois stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInIl`).get).toBe(false);
    expect(get(g, `/stateReturnIsIl`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete).toBe(true);
      expect(get(g, k).get).toBe(false);
    });
  });
});
