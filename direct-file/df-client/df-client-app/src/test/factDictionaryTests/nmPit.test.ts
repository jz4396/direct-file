import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
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
 * #93 slice 9. Full-year New Mexico resident, W-2 wages only, PIT-1.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-7164321295
 * T1 correction: https://github.com/jz4396/direct-file/issues/93#issuecomment-7164898822
 * Row lookup is lo < line 17 <= hi.
 * T1 Single, W-2 $60,000, withheld $2,000. Line 17 $43,900 is the top of $43,800–$43,900.
 * Midpoint $43,850: $1,165.50 + 4.7% × $10,350 = $1,651.95, so line 18 is $1,652. Refund $348.
 * Worksheet bases above $100,000 are $2 under § 7-2-7. T2 uses $4,087, not $4,089.
 * T3 uses $9,746, not $9,748. T4 uses $14,622, not $14,624.
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
  '/nmResidencyStatus': createEnumWrapper(`fullYear`, `/nmResidencyOptions`),
  '/nmHasPitAdj': createBooleanWrapper(false),
  '/nmHasCreditForTaxesPaid': createBooleanWrapper(false),
  '/soldCapitalAssets': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `0001` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `0002` }),
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
    '/filerResidenceAndIncomeState': createEnumWrapper(`nm`, `/scopedStateOptions`),
    ...w2(60000, 2000, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutNmPartYearOrNonresident`,
  `/flowKnockoutNmW2NotNewMexico`,
  `/flowKnockoutNmOtherFederalIncome`,
  `/flowKnockoutNmDependents`,
  `/flowKnockoutNmAgeOrBlind`,
  `/flowKnockoutNmClaimedAsDependent`,
  `/flowKnockoutNmFilingStatus`,
  `/flowKnockoutNmItemizedDeductions`,
  `/flowKnockoutNmSchedule1A`,
  `/flowKnockoutNmLowAgi`,
  `/flowKnockoutNmPitAdj`,
  `/flowKnockoutNmCreditForTaxesPaid`,
];

describe(`PIT-1 full-year resident, W-2 wages only (#93 slice 9)`, () => {
  it(`T1 single: line 17 43,900; line 18 1,652; refund 348`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line17`, `/nmPit1Line18`, `/nmPit1Line42`];
    const g = build(singleFilerData);
    expect(get(g, `/livedInNm`).get).toBe(true);
    expect(get(g, `/stateReturnIsNm`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/nmPit1Line9`)).toBe(`60000.00`);
    expect(val(g, `/nmPit1Line12`)).toBe(`16100.00`);
    expect(val(g, `/nmPit1Line17`)).toBe(`43900.00`);
    expect(val(g, `/nmMidpoint`)).toBe(`43850.00`);
    // 43,850 is in the single bracket over $33,500: 1,165.50 + 4.7% × 10,350 = 1,651.95, half-up 1,652.
    expect(val(g, `/nmPit1Line18`)).toBe(`1652.00`);
    expect(val(g, `/nmPit1Line22`)).toBe(`1652.00`);
    expect(val(g, `/nmPit1Line23`)).toBe(`1652.00`);
    expect(val(g, `/nmPit1Line27`)).toBe(`2000.00`);
    expect(val(g, `/nmPit1Line32`)).toBe(`2000.00`);
    expect(val(g, `/nmPit1Line33`)).toBe(`0.00`);
    expect(val(g, `/nmPit1Line42`)).toBe(`348.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`1652.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`2000.00`);
    expect(val(g, `/stateRefund`)).toBe(`348.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`T2 joint: line 17 117,800; line 18 4,959; refund 41`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line17`, `/nmPit1Line18`, `/nmPit1Line42`];
    const g = build(mfjFilerData, {
      ...w2(90000, 3000, `sameState`, primaryFilerId, w2Id),
      ...w2(60000, 2000, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/nmPit1Line9`)).toBe(`150000.00`);
    expect(val(g, `/nmPit1Line12`)).toBe(`32200.00`);
    expect(val(g, `/nmPit1Line17`)).toBe(`117800.00`);
    // Worksheet, $2 under the statute: 4,087 + 4.9% × 17,800 = 4,959.20, half-up 4,959.
    expect(val(g, `/nmPit1Line18`)).toBe(`4959.00`);
    expect(val(g, `/nmPit1Line27`)).toBe(`5000.00`);
    expect(val(g, `/nmPit1Line42`)).toBe(`41.00`);
    expect(val(g, `/stateRefund`)).toBe(`41.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`T3 single: line 17 233,900; line 18 11,156; owed 156`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line17`, `/nmPit1Line18`, `/nmPit1Line33`];
    const g = build(singleFilerData, w2(250000, 11000, `sameState`));
    expect(val(g, `/nmPit1Line17`)).toBe(`233900.00`);
    // Worksheet: 9,746 + 5.9% × 23,900 = 11,156.10, half-up 11,156. Owed 11,156 − 11,000 = 156.
    expect(val(g, `/nmPit1Line18`)).toBe(`11156.00`);
    expect(val(g, `/nmPit1Line33`)).toBe(`156.00`);
    expect(val(g, `/nmPit1Line42`)).toBe(`0.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`156.00`);
  });

  it(`T4 joint: line 17 367,800; line 18 17,737`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line17`, `/nmPit1Line18`];
    const g = build(mfjFilerData, {
      ...w2(250000, 0, `sameState`, primaryFilerId, w2Id),
      ...w2(150000, 0, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/nmPit1Line9`)).toBe(`400000.00`);
    expect(val(g, `/nmPit1Line17`)).toBe(`367800.00`);
    // Worksheet: 14,622 + 5.9% × 52,800 = 17,737.20, half-up 17,737. The spec does not set withholding.
    expect(val(g, `/nmPit1Line18`)).toBe(`17737.00`);
    expect(val(g, `/nmPit1Line33`)).toBe(`17737.00`);
  });

  it(`T5 boundary: line 17 100,000 uses the table and the tax is 4,356`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line17`, `/nmPit1Line18`];
    const g = build(singleFilerData, w2(116100, 0, `sameState`));
    expect(val(g, `/nmPit1Line17`)).toBe(`100000.00`);
    expect(val(g, `/nmMidpoint`)).toBe(`99950.00`);
    expect(get(g, `/nmUsesTable`).get).toBe(true);
    // Midpoint $99,950: 2,716.50 + 4.9% × 33,450 = 4,355.55, half-up 4,356. The worksheet base is also 4,356.
    expect(val(g, `/nmPit1Line18`)).toBe(`4356.00`);
  });

  it(`T6 table rows match the tax rate table`, ({ task }) => {
    task.meta.testedFactPaths = [`/nmPit1Line18`];
    const singleRow = build(singleFilerData, w2(16100 + 25350, 0, `sameState`));
    expect(val(singleRow, `/nmPit1Line17`)).toBe(`25350.00`);
    expect(val(singleRow, `/nmMidpoint`)).toBe(`25350.00`);
    // Single, more than $25,300 but not over $25,400: $815.
    expect(val(singleRow, `/nmPit1Line18`)).toBe(`815.00`);
    const jointRow = build(mfjFilerData, {
      ...w2(32200 + 25350, 0, `sameState`),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(jointRow, `/nmPit1Line17`)).toBe(`25350.00`);
    // Married filing jointly, same row: $679.
    expect(val(jointRow, `/nmPit1Line18`)).toBe(`679.00`);
    const firstRow = build(singleFilerData, w2(16130, 0, `sameState`));
    expect(val(firstRow, `/nmPit1Line17`)).toBe(`30.00`);
    expect(val(firstRow, `/nmMidpoint`)).toBe(`30.00`);
    // More than $0 but not over $60: $0. 1.5% of the $30 midpoint is $0.45, which rounds to $0.
    expect(val(firstRow, `/nmPit1Line18`)).toBe(`0.00`);
    const secondRow = build(singleFilerData, w2(16180, 0, `sameState`));
    expect(val(secondRow, `/nmPit1Line17`)).toBe(`80.00`);
    expect(val(secondRow, `/nmMidpoint`)).toBe(`80.00`);
    // More than $60 but not over $100: $1. 1.5% of $80 is $1.20, which rounds to $1.
    expect(val(secondRow, `/nmPit1Line18`)).toBe(`1.00`);
  });

  it(`T7 stops single AGI of 36,667 and clears at 36,668`, () => {
    const atCeiling = build(singleFilerData, w2(36667, 0, `sameState`));
    expect(val(atCeiling, `/nmPit1Line9`)).toBe(`36667.00`);
    expect(get(atCeiling, `/flowKnockoutNmLowAgi`).get).toBe(true);
    const above = build(singleFilerData, w2(36668, 0, `sameState`));
    expect(val(above, `/nmPit1Line9`)).toBe(`36668.00`);
    expect(get(above, `/flowKnockoutNmLowAgi`).get).toBe(false);
    expect(val(above, `/nmPit1Line17`)).toBe(`20568.00`);
    expect(get(above, `/nmPit1Line18`).complete).toBe(true);
  });

  it(`T8 stops a dependent`, () => {
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    const g = build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) });
    expect(get(g, `/flowKnockoutNmDependents`).get).toBe(true);
  });

  it(`T9 stops Schedule 1-A greater than zero`, () => {
    const g = build(singleFilerData, {
      [`/formW2s/#${w2Id}/qualifiedOvertimeCodeTT`]: createDollarWrapper(`4000.00`),
      '/overtimeFlsaConfirmed': createBooleanWrapper(true),
    });
    expect(get(g, `/schedule1ALine44`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/flowKnockoutNmSchedule1A`).get).toBe(true);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`nm`, `/scopedStateOptions`),
      ...w2(60000, 2000),
    }).factGraph;
    expect(get(g, `/flowKnockoutNmW2NotNewMexico`).complete).toBe(true);
    expect(get(g, `/flowKnockoutNmW2NotNewMexico`).get).toBe(false);
    expect(val(g, `/nmPit1Line27`)).toBe(`0.00`);
    expect(val(g, `/nmPit1Line18`)).toBe(`1652.00`);
    expect(val(g, `/nmPit1Line33`)).toBe(`1652.00`);
    expect(val(g, `/nmPit1Line42`)).toBe(`0.00`);
  });

  it(`stops part-year, first-year, nonresident, a Missouri W-2, interest, age 65, blindness, being claimed, itemizing, another filing status, PIT-ADJ, and another state's tax`, () => {
    const partYear = build(singleFilerData, {
      '/nmResidencyStatus': createEnumWrapper(`partYear`, `/nmResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutNmPartYearOrNonresident`).get).toBe(true);
    const firstYear = build(singleFilerData, {
      '/nmResidencyStatus': createEnumWrapper(`firstYear`, `/nmResidencyOptions`),
    });
    expect(get(firstYear, `/flowKnockoutNmPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/nmResidencyStatus': createEnumWrapper(`nonresident`, `/nmResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutNmPartYearOrNonresident`).get).toBe(true);
    const missouri = build(singleFilerData, w2(60000, 0, `differentState`));
    expect(get(missouri, `/flowKnockoutNmW2NotNewMexico`).get).toBe(true);
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutNmOtherFederalIncome`).get).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutNmAgeOrBlind`).get).toBe(true);
    const blind = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(true),
    });
    expect(get(blind, `/flowKnockoutNmAgeOrBlind`).get).toBe(true);
    const claimed = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
    });
    expect(get(claimed, `/flowKnockoutNmClaimedAsDependent`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutNmItemizedDeductions`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutNmFilingStatus`).get).toBe(true);
    const separate = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`marriedFilingSeparately`, `/filingStatusOptions`),
    });
    expect(get(separate, `/flowKnockoutNmFilingStatus`).get).toBe(true);
    const adj = build(singleFilerData, { '/nmHasPitAdj': createBooleanWrapper(true) });
    expect(get(adj, `/flowKnockoutNmPitAdj`).get).toBe(true);
    const credit = build(singleFilerData, { '/nmHasCreditForTaxesPaid': createBooleanWrapper(true) });
    expect(get(credit, `/flowKnockoutNmCreditForTaxesPaid`).get).toBe(true);
  });

  it(`does not compute a New Mexico return for Florida, and the New Mexico stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInNm`).get).toBe(false);
    expect(get(g, `/stateReturnIsNm`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });
});
