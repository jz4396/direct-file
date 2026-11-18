import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
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
 * #93 slice 5. Full-year Arizona resident, W-2 wages only, Form 140.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-6980303677
 * Single, wages 55,000, Arizona withheld 1,100. Line 43 is 16,100. Line 45 is 38,900.
 * 38,900 × 0.025 = 972.50, which rounds half-up to 973. Half-even would leave 972. Refund 127.
 * Joint, wages 80,000 and 40,000, withheld 2,400. Line 45 is 87,800. Line 46 is 2,195. Refund 205.
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get.toString();
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const spouseW2Id = `559c03d1-af4a-447f-96aa-d19397048a55`;
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const screeners = {
  '/azResidencyStatus': createEnumWrapper(`fullYear`, `/azResidencyOptions`),
  '/soldCapitalAssets': createBooleanWrapper(false),
};

const w2 = (
  wages: number,
  withheld: number,
  state?: `sameState` | `differentState`,
  filer: string = primaryFilerId,
  id: string = w2Id
) => ({
  ...makeW2Data(wages, id, filer),
  ...(state ? { [`/formW2s/#${id}/writableState`]: createEnumWrapper(state, `/incomeFormStateOptions`) } : {}),
  [`/formW2s/#${id}/writableStateWithholding`]: createDollarWrapper(`${withheld}`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`az`, `/scopedStateOptions`),
    ...w2(55000, 1100, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutAzPartYearOrNonresident`,
  `/flowKnockoutAzW2NotArizona`,
  `/flowKnockoutAzOtherFederalIncome`,
  `/flowKnockoutAzDependentsOrQualifyingPerson`,
  `/flowKnockoutAzAgeOrBlind`,
  `/flowKnockoutAzItemizedDeductions`,
  `/flowKnockoutAzCharitableContributions`,
  `/flowKnockoutAzLowIncomeCredit`,
  `/flowKnockoutAzSchedule1A`,
  `/flowKnockoutAzFilingStatus`,
];

describe(`Form 140 full-year resident, W-2 wages only (#93 slice 5)`, () => {
  it(`single: line 45 38,900; line 46 973; withholding 1,100; refund 127`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/azLine12`,
      `/azLine42`,
      `/azLine43`,
      `/azLine44`,
      `/azLine45`,
      `/azLine46`,
      `/azLine53`,
      `/azRefund`,
      `/azAmountOwed`,
    ];
    const g = build(singleFilerData);
    expect(get(g, `/livedInAz`).get).toBe(true);
    expect(get(g, `/stateReturnIsAz`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/azLine12`)).toBe(`55000.00`);
    expect(val(g, `/azLine42`)).toBe(`55000.00`);
    expect(val(g, `/azLine43`)).toBe(`16100.00`);
    expect(val(g, `/azLine44`)).toBe(`0.00`);
    expect(val(g, `/azLine45`)).toBe(`38900.00`);
    // 38,900 × 0.025 = 972.50. Half-up is 973. Half-even would be 972.
    expect(val(g, `/azLine46`)).toBe(`973.00`);
    expect(val(g, `/azLine53`)).toBe(`1100.00`);
    expect(val(g, `/azLine60`)).toBe(`0.00`);
    expect(val(g, `/azRefund`)).toBe(`127.00`);
    expect(val(g, `/azAmountOwed`)).toBe(`0.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`973.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`1100.00`);
    expect(val(g, `/stateRefund`)).toBe(`127.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`joint: line 45 87,800; line 46 2,195; withholding 2,400; refund 205`, ({ task }) => {
    task.meta.testedFactPaths = [`/azLine45`, `/azLine46`, `/azLine53`, `/azRefund`];
    const g = build(mfjFilerData, {
      ...w2(80000, 1600, `sameState`, primaryFilerId, w2Id),
      ...w2(40000, 800, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      // The spouse flow asks this. Answered no keeps the educator adjustment, AGI, and the low-income stop complete.
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/azLine12`)).toBe(`120000.00`);
    expect(val(g, `/azLine43`)).toBe(`32200.00`);
    expect(val(g, `/azLine45`)).toBe(`87800.00`);
    expect(val(g, `/azLine46`)).toBe(`2195.00`);
    expect(val(g, `/azLine53`)).toBe(`2400.00`);
    expect(val(g, `/azRefund`)).toBe(`205.00`);
    expect(val(g, `/azAmountOwed`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`stops a single filer whose W-2 box 15 is California, and a charitable gift`, () => {
    // Box 15 is sameState or differentState. differentState is a state other than Arizona. This case is California.
    const california = build(singleFilerData, w2(15000, 0, `differentState`));
    expect(get(california, `/flowKnockoutAzW2NotArizona`).get).toBe(true);
    const gift = build(singleFilerData, {
      '/nonItemizerHadCashGifts': createBooleanWrapper(true),
      '/nonItemizerWritableCashGifts': createDollarWrapper(`100.00`),
    });
    expect(get(gift, `/flowKnockoutAzCharitableContributions`).get).toBe(true);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`az`, `/scopedStateOptions`),
      ...w2(55000, 1100),
    }).factGraph;
    expect(get(g, `/flowKnockoutAzW2NotArizona`).complete).toBe(true);
    expect(get(g, `/flowKnockoutAzW2NotArizona`).get).toBe(false);
    expect(val(g, `/azLine53`)).toBe(`0.00`);
    expect(val(g, `/azLine46`)).toBe(`973.00`);
  });

  it(`stops part-year and nonresident`, () => {
    const partYear = build(singleFilerData, {
      '/azResidencyStatus': createEnumWrapper(`partYear`, `/azResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutAzPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/azResidencyStatus': createEnumWrapper(`nonresident`, `/azResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutAzPartYearOrNonresident`).get).toBe(true);
  });

  it(`stops interest, a dependent, age 65, blindness, itemizing, and another filing status`, () => {
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutAzOtherFederalIncome`).get).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutAzDependentsOrQualifyingPerson`
      ).get
    ).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutAzAgeOrBlind`).get).toBe(true);
    const blind = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(true),
    });
    expect(get(blind, `/flowKnockoutAzAgeOrBlind`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutAzItemizedDeductions`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutAzFilingStatus`).get).toBe(true);
  });

  it(`stops single AGI of 12,500 and does not stop 12,501`, () => {
    const atLimit = build(singleFilerData, w2(12500, 0, `sameState`));
    expect(get(atLimit, `/flowKnockoutAzLowIncomeCredit`).get).toBe(true);
    const above = build(singleFilerData, w2(12501, 0, `sameState`));
    expect(get(above, `/flowKnockoutAzLowIncomeCredit`).get).toBe(false);
  });

  it(`does not compute an Arizona return for Florida, and the Arizona stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInAz`).get).toBe(false);
    expect(get(g, `/stateReturnIsAz`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete).toBe(true);
      expect(get(g, k).get).toBe(false);
    });
  });
});
