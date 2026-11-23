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
 * #93 slice 7. Full-year Idaho resident, W-2 wages only, Form 40.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-7102786141
 * Single, box 1 $59,411, Idaho withholding $2,000.
 * Lines 17 and 19 are $43,311. Worksheet line 3 is $38,500.
 * 38,500 × 0.053 = $2,040.50, which rounds half-up to $2,041. Line 41 is $2,051. Refund $104.
 * Guard: wages $59,694. After $16,100 and $4,811 the base is $38,783.
 * 38,783 × 0.053 = $2,055.499, so line 20 is $2,055. A result of $2,056 rounded twice. Refund $90.
 * Joint, box 1 $90,000 and $50,000, Idaho withholding $5,000. Line 20 is $5,203. Refund $97.
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
  '/idResidencyStatus': createEnumWrapper(`fullYear`, `/idResidencyOptions`),
  '/soldCapitalAssets': createBooleanWrapper(false),
  '/idHasUseTax': createBooleanWrapper(false),
  '/idReceivedPublicAssistance': createBooleanWrapper(false),
  '/idReceivedSnapOrIncarcerated': createBooleanWrapper(false),
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
  [`/formW2s/#${id}/writableStateWages`]: createDollarWrapper(`${wages}.00`),
  [`/formW2s/#${id}/writableStateWithholding`]: createDollarWrapper(`${withheld}.00`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`id`, `/scopedStateOptions`),
    ...w2(59411, 2000, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutIdPartYearOrNonresident`,
  `/flowKnockoutIdW2NotIdaho`,
  `/flowKnockoutIdOtherFederalIncome`,
  `/flowKnockoutIdDependents`,
  `/flowKnockoutIdAgeOrBlind`,
  `/flowKnockoutIdClaimedAsDependent`,
  `/flowKnockoutIdFilingStatus`,
  `/flowKnockoutIdItemizedDeductions`,
  `/flowKnockoutIdSchedule1A`,
  `/flowKnockoutIdPublicAssistance`,
  `/flowKnockoutIdUseTax`,
  `/flowKnockoutIdSnapOrIncarcerated`,
  `/flowKnockoutIdForm39R`,
];

describe(`Form 40 full-year resident, W-2 wages only (#93 slice 7)`, () => {
  it(`single: line 20 2,041; line 41 2,051; payments 2,155; refund 104`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/idLine7`,
      `/idLine16`,
      `/idLine17`,
      `/idLine19`,
      `/idLine20`,
      `/idLine31`,
      `/idLine41`,
      `/idLine43`,
      `/idLine46`,
      `/idLine50`,
      `/idLine56`,
    ];
    const g = build(singleFilerData);
    expect(get(g, `/livedInId`).get).toBe(true);
    expect(get(g, `/stateReturnIsId`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/idLine7`)).toBe(`59411.00`);
    expect(val(g, `/idLine8`)).toBe(`0.00`);
    expect(val(g, `/idLine9`)).toBe(`59411.00`);
    expect(val(g, `/idLine10`)).toBe(`0.00`);
    expect(val(g, `/idLine11`)).toBe(`59411.00`);
    expect(val(g, `/idLine13`)).toBe(`0.00`);
    expect(val(g, `/idLine14`)).toBe(`0.00`);
    expect(val(g, `/idLine15`)).toBe(`0.00`);
    expect(val(g, `/idLine16`)).toBe(`16100.00`);
    expect(val(g, `/idLine17`)).toBe(`43311.00`);
    expect(val(g, `/idLine18`)).toBe(`0.00`);
    expect(val(g, `/idLine19`)).toBe(`43311.00`);
    expect(val(g, `/idWorksheetLine3`)).toBe(`38500.00`);
    // 38,500 × 0.053 = 2,040.50. Half-up is 2,041. Half-even would be 2,040.
    expect(val(g, `/idLine20`)).toBe(`2041.00`);
    expect(val(g, `/idLine26`)).toBe(`2041.00`);
    expect(val(g, `/idLine31`)).toBe(`10.00`);
    expect(val(g, `/idLine32`)).toBe(`2051.00`);
    expect(val(g, `/idLine41`)).toBe(`2051.00`);
    expect(val(g, `/idLine43`)).toBe(`155.00`);
    expect(val(g, `/idLine46`)).toBe(`2000.00`);
    expect(val(g, `/idLine50`)).toBe(`2155.00`);
    expect(val(g, `/idLine51`)).toBe(`0.00`);
    expect(val(g, `/idLine54`)).toBe(`0.00`);
    expect(val(g, `/idLine55`)).toBe(`104.00`);
    expect(val(g, `/idLine56`)).toBe(`104.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`2041.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`2000.00`);
    expect(val(g, `/stateRefund`)).toBe(`104.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    expect(val(g, `/idHouseholdSelf`)).toBe(`1`);
    expect(val(g, `/idHouseholdTotal`)).toBe(`1`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`guard: wages 59,694 leave 38,783; line 20 is 2,055 and the refund is 90`, ({ task }) => {
    task.meta.testedFactPaths = [`/idLine19`, `/idLine20`, `/idLine41`, `/idLine56`];
    const g = build(singleFilerData, w2(59694, 2000, `sameState`));
    expect(val(g, `/idLine16`)).toBe(`16100.00`);
    expect(val(g, `/idLine19`)).toBe(`43594.00`);
    expect(val(g, `/idWorksheetLine3`)).toBe(`38783.00`);
    // 38,783 × 0.053 = 2,055.499. One half-up round is 2,055. Cents first would make 2,056.
    expect(val(g, `/idLine20`)).toBe(`2055.00`);
    expect(val(g, `/idLine41`)).toBe(`2065.00`);
    expect(val(g, `/idLine50`)).toBe(`2155.00`);
    expect(val(g, `/idLine56`)).toBe(`90.00`);
  });

  it(`joint: line 16 32,200; line 20 5,203; line 43 310; refund 97`, ({ task }) => {
    task.meta.testedFactPaths = [`/idLine16`, `/idLine20`, `/idLine43`, `/idLine46`, `/idLine56`];
    const g = build(mfjFilerData, {
      ...w2(90000, 3000, `sameState`, primaryFilerId, w2Id),
      ...w2(50000, 2000, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      '/idSpouseReceivedSnapOrIncarcerated': createBooleanWrapper(false),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/idLine7`)).toBe(`140000.00`);
    expect(val(g, `/idLine16`)).toBe(`32200.00`);
    expect(val(g, `/idLine19`)).toBe(`107800.00`);
    expect(val(g, `/idWorksheetLine3`)).toBe(`98178.00`);
    // 98,178 × 0.053 = 5,203.434, which rounds half-up to 5,203.
    expect(val(g, `/idLine20`)).toBe(`5203.00`);
    expect(val(g, `/idLine41`)).toBe(`5213.00`);
    expect(val(g, `/idLine43`)).toBe(`310.00`);
    expect(val(g, `/idLine46`)).toBe(`5000.00`);
    expect(val(g, `/idLine50`)).toBe(`5310.00`);
    expect(val(g, `/idLine56`)).toBe(`97.00`);
    expect(val(g, `/idHouseholdTotal`)).toBe(`2`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`stops an Oregon W-2, a yes on SNAP, and Schedule 1-A overtime`, () => {
    const oregon = build(singleFilerData, w2(59411, 0, `differentState`));
    expect(get(oregon, `/flowKnockoutIdW2NotIdaho`).get).toBe(true);
    const snap = build(singleFilerData, { '/idReceivedSnapOrIncarcerated': createBooleanWrapper(true) });
    expect(get(snap, `/flowKnockoutIdSnapOrIncarcerated`).get).toBe(true);
    const overtime = build(singleFilerData, {
      [`/formW2s/#${w2Id}/qualifiedOvertimeCodeTT`]: createDollarWrapper(`4000.00`),
      '/overtimeFlsaConfirmed': createBooleanWrapper(true),
    });
    expect(get(overtime, `/schedule1ALine44`).get.toString()).toBe(`4000.00`);
    expect(get(overtime, `/flowKnockoutIdSchedule1A`).get).toBe(true);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`id`, `/scopedStateOptions`),
      ...w2(59411, 2000),
    }).factGraph;
    expect(get(g, `/flowKnockoutIdW2NotIdaho`).complete).toBe(true);
    expect(get(g, `/flowKnockoutIdW2NotIdaho`).get).toBe(false);
    expect(val(g, `/idLine7`)).toBe(`59411.00`);
    expect(val(g, `/idLine46`)).toBe(`0.00`);
    expect(val(g, `/idLine20`)).toBe(`2041.00`);
  });

  it(`stops part-year, nonresident, interest, a dependent, age 65, blindness, itemizing, and another filing status`, () => {
    const partYear = build(singleFilerData, {
      '/idResidencyStatus': createEnumWrapper(`partYear`, `/idResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutIdPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/idResidencyStatus': createEnumWrapper(`nonresident`, `/idResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutIdPartYearOrNonresident`).get).toBe(true);
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutIdOtherFederalIncome`).get).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutIdDependents`
      ).get
    ).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutIdAgeOrBlind`).get).toBe(true);
    const blind = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(true),
    });
    expect(get(blind, `/flowKnockoutIdAgeOrBlind`).get).toBe(true);
    const claimed = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
    });
    expect(get(claimed, `/flowKnockoutIdClaimedAsDependent`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutIdItemizedDeductions`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutIdFilingStatus`).get).toBe(true);
    const assistance = build(singleFilerData, { '/idReceivedPublicAssistance': createBooleanWrapper(true) });
    expect(get(assistance, `/flowKnockoutIdPublicAssistance`).get).toBe(true);
    const useTax = build(singleFilerData, { '/idHasUseTax': createBooleanWrapper(true) });
    expect(get(useTax, `/flowKnockoutIdUseTax`).get).toBe(true);
  });

  it(`does not compute an Idaho return for Florida, and the Idaho stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInId`).get).toBe(false);
    expect(get(g, `/stateReturnIsId`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });
});
