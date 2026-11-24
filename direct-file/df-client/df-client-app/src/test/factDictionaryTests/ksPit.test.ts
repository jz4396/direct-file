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
 * #93 slice 8. Full-year Kansas resident, W-2 wages only, Form K-40, line 7 over $100,000.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-7133296506
 * Single, box 1 $130,000, Kansas withholding $6,500.
 * Line 6 is $12,765. Line 7 is $117,235. 117,235 × 0.0558 − 87 = 6,454.713, so line 8 is $6,455. Refund $45.
 * Guard: wages $112,989. Line 7 is $100,224. 100,224 × 0.0558 − 87 = 5,505.4992, so line 8 is $5,505.
 * Cents first would make $5,505.50 and then $5,506. Refund $95.
 * Joint, box 1 $100,000 and $50,000, Kansas withholding $7,000.
 * Line 6 is $26,560. Line 7 is $123,440. 123,440 × 0.0558 − 175 = 6,712.952, so line 8 is $6,713. Refund $287.
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
  '/ksResidencyStatus': createEnumWrapper(`fullYear`, `/ksResidencyOptions`),
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
  [`/formW2s/#${id}/writableStateWages`]: createDollarWrapper(`${wages}.00`),
  [`/formW2s/#${id}/writableStateWithholding`]: createDollarWrapper(`${withheld}.00`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`ks`, `/scopedStateOptions`),
    ...w2(130000, 6500, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutKsPartYearOrNonresident`,
  `/flowKnockoutKsW2NotKansas`,
  `/flowKnockoutKsOtherFederalIncome`,
  `/flowKnockoutKsDependents`,
  `/flowKnockoutKsAgeOrBlind`,
  `/flowKnockoutKsClaimedAsDependent`,
  `/flowKnockoutKsFilingStatus`,
  `/flowKnockoutKsItemizedDeductions`,
  `/flowKnockoutKsEarnedIncomeCredit`,
  `/flowKnockoutKsForm2441`,
  `/flowKnockoutKsSchedule1A`,
  `/flowKnockoutKsTaxTable`,
];

describe(`Form K-40 full-year resident, W-2 wages only (#93 slice 8)`, () => {
  it(`single: line 6 12,765; line 7 117,235; line 8 6,455; refund 45`, ({ task }) => {
    task.meta.testedFactPaths = [`/ksLine6`, `/ksLine7`, `/ksLine8`, `/ksLine19`, `/ksLine43`];
    const g = build(singleFilerData);
    expect(get(g, `/livedInKs`).get).toBe(true);
    expect(get(g, `/stateReturnIsKs`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/ksLine1`)).toBe(`130000.00`);
    expect(val(g, `/ksLine2`)).toBe(`0.00`);
    expect(val(g, `/ksLine3`)).toBe(`130000.00`);
    expect(val(g, `/ksLine4`)).toBe(`3605.00`);
    expect(val(g, `/ksLine5`)).toBe(`9160.00`);
    expect(val(g, `/ksLine6`)).toBe(`12765.00`);
    expect(val(g, `/ksLine7`)).toBe(`117235.00`);
    // 117,235 × 0.0558 = 6,541.713. Minus 87 is 6,454.713. One half-up round is 6,455.
    expect(val(g, `/ksLine8`)).toBe(`6455.00`);
    expect(val(g, `/ksLine12`)).toBe(`6455.00`);
    expect(val(g, `/ksLine16`)).toBe(`6455.00`);
    expect(val(g, `/ksLine18`)).toBe(`6455.00`);
    expect(val(g, `/ksLine19`)).toBe(`6500.00`);
    expect(val(g, `/ksLine27`)).toBe(`6500.00`);
    expect(val(g, `/ksLine28`)).toBe(`0.00`);
    expect(val(g, `/ksLine32`)).toBe(`0.00`);
    expect(val(g, `/ksLine33`)).toBe(`45.00`);
    expect(val(g, `/ksLine43`)).toBe(`45.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`6455.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`6500.00`);
    expect(val(g, `/stateRefund`)).toBe(`45.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    expect(val(g, `/ksExemptionCount`)).toBe(`1`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`guard: wages 112,989 leave line 7 at 100,224; line 8 is 5,505 and the refund is 95`, ({ task }) => {
    task.meta.testedFactPaths = [`/ksLine7`, `/ksLine8`, `/ksLine43`];
    const g = build(singleFilerData, w2(112989, 5600, `sameState`));
    expect(val(g, `/ksLine6`)).toBe(`12765.00`);
    expect(val(g, `/ksLine7`)).toBe(`100224.00`);
    // 100,224 × 0.0558 = 5,592.4992. Minus 87 is 5,505.4992. One half-up round is 5,505.
    // Cents first would make 5,505.50 and then 5,506.
    expect(val(g, `/ksLine8`)).toBe(`5505.00`);
    expect(val(g, `/ksLine19`)).toBe(`5600.00`);
    expect(val(g, `/ksLine43`)).toBe(`95.00`);
    expect(val(g, `/stateRefund`)).toBe(`95.00`);
  });

  it(`joint: line 6 26,560; line 7 123,440; line 8 6,713; refund 287`, ({ task }) => {
    task.meta.testedFactPaths = [`/ksLine6`, `/ksLine7`, `/ksLine8`, `/ksLine19`, `/ksLine43`];
    const g = build(mfjFilerData, {
      ...w2(100000, 4000, `sameState`, primaryFilerId, w2Id),
      ...w2(50000, 3000, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/ksLine1`)).toBe(`150000.00`);
    expect(val(g, `/ksLine4`)).toBe(`8240.00`);
    expect(val(g, `/ksLine5`)).toBe(`18320.00`);
    expect(val(g, `/ksLine6`)).toBe(`26560.00`);
    expect(val(g, `/ksLine7`)).toBe(`123440.00`);
    // 123,440 × 0.0558 = 6,887.952. Minus 175 is 6,712.952. One half-up round is 6,713.
    expect(val(g, `/ksLine8`)).toBe(`6713.00`);
    expect(val(g, `/ksLine19`)).toBe(`7000.00`);
    expect(val(g, `/ksLine43`)).toBe(`287.00`);
    expect(val(g, `/ksExemptionCount`)).toBe(`2`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`stops wages of 55,000 because line 7 is 42,235, a Missouri W-2, and Schedule 1-A overtime`, () => {
    const table = build(singleFilerData, w2(55000, 0, `sameState`));
    expect(val(table, `/ksLine6`)).toBe(`12765.00`);
    expect(val(table, `/ksLine7`)).toBe(`42235.00`);
    expect(get(table, `/ksLine8`).complete).toBe(false);
    expect(get(table, `/flowKnockoutKsTaxTable`).get).toBe(true);
    const missouri = build(singleFilerData, w2(130000, 0, `differentState`));
    expect(get(missouri, `/flowKnockoutKsW2NotKansas`).get).toBe(true);
    const overtime = build(singleFilerData, {
      [`/formW2s/#${w2Id}/qualifiedOvertimeCodeTT`]: createDollarWrapper(`4000.00`),
      '/overtimeFlsaConfirmed': createBooleanWrapper(true),
    });
    expect(get(overtime, `/schedule1ALine44`).get.toString()).toBe(`4000.00`);
    expect(get(overtime, `/flowKnockoutKsSchedule1A`).get).toBe(true);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`ks`, `/scopedStateOptions`),
      ...w2(130000, 6500),
    }).factGraph;
    expect(get(g, `/flowKnockoutKsW2NotKansas`).complete).toBe(true);
    expect(get(g, `/flowKnockoutKsW2NotKansas`).get).toBe(false);
    expect(val(g, `/ksLine19`)).toBe(`0.00`);
    expect(val(g, `/ksLine8`)).toBe(`6455.00`);
    expect(val(g, `/ksLine32`)).toBe(`6455.00`);
    expect(val(g, `/ksLine43`)).toBe(`0.00`);
  });

  it(`stops part-year, nonresident, interest, a dependent, age 65, blindness, being claimed, itemizing, and another filing status`, () => {
    const partYear = build(singleFilerData, {
      '/ksResidencyStatus': createEnumWrapper(`partYear`, `/ksResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutKsPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/ksResidencyStatus': createEnumWrapper(`nonresident`, `/ksResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutKsPartYearOrNonresident`).get).toBe(true);
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutKsOtherFederalIncome`).get).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutKsDependents`
      ).get
    ).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutKsAgeOrBlind`).get).toBe(true);
    const blind = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(true),
    });
    expect(get(blind, `/flowKnockoutKsAgeOrBlind`).get).toBe(true);
    const claimed = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
    });
    expect(get(claimed, `/flowKnockoutKsClaimedAsDependent`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutKsItemizedDeductions`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutKsFilingStatus`).get).toBe(true);
    const separate = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`marriedFilingSeparately`, `/filingStatusOptions`),
    });
    expect(get(separate, `/flowKnockoutKsFilingStatus`).get).toBe(true);
  });

  it(`does not compute a Kansas return for Florida, and the Kansas stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInKs`).get).toBe(false);
    expect(get(g, `/stateReturnIsKs`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });
});
