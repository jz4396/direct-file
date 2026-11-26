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
 * #93 slice 10. Full-year Wisconsin resident, W-2 wages only, Form 1.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-7194838302
 * Line 8 uses the standard deduction formula at the band midpoint, rounded once, half up.
 * Line 11 below $100,000 uses the tax table at the row midpoint. $100,000 or more uses the page 44 worksheet.
 * A row is at least the low amount and less than the high amount.
 * Line 18 is 3% of the lower earner's wages, capped at $16,000 of wages.
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
  '/wiResidencyStatus': createEnumWrapper(`fullYear`, `/wiResidencyOptions`),
  '/wiHasAdditionsOrSubtractions': createBooleanWrapper(false),
  '/wiHasUnmodeledCredits': createBooleanWrapper(false),
  '/wiHasUseTax': createBooleanWrapper(false),
  '/wiHasTaxPaidOtherState': createBooleanWrapper(false),
  '/soldCapitalAssets': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `0001` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `0002` }),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
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

const jointW2s = (primary: [number, number], spouse: [number, number]) => ({
  ...w2(primary[0], primary[1], `sameState`, primaryFilerId, w2Id),
  ...w2(spouse[0], spouse[1], `sameState`, spouseId, spouseW2Id),
  '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`wi`, `/scopedStateOptions`),
    ...w2(60000, 2500, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutWiPartYearOrNonresident`,
  `/flowKnockoutWiW2NotWisconsin`,
  `/flowKnockoutWiOtherFederalIncome`,
  `/flowKnockoutWiDependents`,
  `/flowKnockoutWiAgeOrBlind`,
  `/flowKnockoutWiClaimedAsDependent`,
  `/flowKnockoutWiFilingStatus`,
  `/flowKnockoutWiItemizedDeductions`,
  `/flowKnockoutWiSchedule1A`,
  `/flowKnockoutWiAdditionsOrSubtractions`,
  `/flowKnockoutWiCredits`,
  `/flowKnockoutWiUseTax`,
  `/flowKnockoutWiTaxPaidOtherState`,
  `/flowKnockoutWiUnderpaymentInterest`,
  `/flowKnockoutWiMarriedCoupleAdjustments`,
];

const clear = (g: Fg) => {
  KOS.forEach((k) => {
    expect(get(g, k).complete, k).toBe(true);
    expect(get(g, k).get, k).toBe(false);
  });
};

describe(`Form 1 full-year resident, W-2 wages only (#93 slice 10)`, () => {
  it(`T1 single: line 8 8,676; line 12 2,098; refund 402`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`, `/wiLine12`, `/wiLine41`];
    const g = build(singleFilerData);
    expect(get(g, `/livedInWi`).get).toBe(true);
    expect(get(g, `/stateReturnIsWi`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/wiLine7`)).toBe(`60000.00`);
    expect(val(g, `/wiLine8`)).toBe(`8676.00`);
    expect(val(g, `/wiLine9`)).toBe(`51324.00`);
    expect(val(g, `/wiLine10c`)).toBe(`700.00`);
    expect(val(g, `/wiLine11`)).toBe(`50624.00`);
    expect(val(g, `/wiTaxMidpoint`)).toBe(`50650.00`);
    // Row 50,600–50,700. Midpoint 50,650: 2,089 + 5.3% × 170 = 2,098.01, half-up 2,098.
    expect(val(g, `/wiLine12`)).toBe(`2098.00`);
    expect(val(g, `/wiLine18`)).toBe(`0.00`);
    expect(val(g, `/wiLine22`)).toBe(`2098.00`);
    expect(val(g, `/wiLine27`)).toBe(`2098.00`);
    expect(val(g, `/wiLine28`)).toBe(`2500.00`);
    expect(val(g, `/wiLine41`)).toBe(`402.00`);
    expect(val(g, `/wiLine45`)).toBe(`0.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`2098.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`2500.00`);
    expect(val(g, `/stateRefund`)).toBe(`402.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    clear(g);
  });

  it(`T2 joint: line 8 973; line 12 7,042; credit 480; owed 362`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`, `/wiLine12`, `/wiLine18`, `/wiLine45`];
    const g = build(mfjFilerData, jointW2s([90000, 3200], [60000, 3000]));
    expect(val(g, `/wiLine7`)).toBe(`150000.00`);
    expect(val(g, `/wiLine8`)).toBe(`973.00`);
    expect(val(g, `/wiLine10c`)).toBe(`1400.00`);
    expect(val(g, `/wiLine11`)).toBe(`147627.00`);
    expect(get(g, `/wiUsesTable`).get).toBe(false);
    // 5.3% × 147,627 − 781.92 = 7,042.311, half-up 7,042.
    expect(val(g, `/wiLine12`)).toBe(`7042.00`);
    expect(val(g, `/wiMccWages`)).toBe(`16000.00`);
    expect(val(g, `/wiLine18`)).toBe(`480.00`);
    expect(val(g, `/wiLine22`)).toBe(`6562.00`);
    expect(val(g, `/wiLine28`)).toBe(`6200.00`);
    expect(val(g, `/wiLine45`)).toBe(`362.00`);
    expect(val(g, `/wiLine41`)).toBe(`0.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`362.00`);
    clear(g);
  });

  it(`T3 joint: line 8 21,146; line 12 944; credit 240; refund 796`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`, `/wiLine12`, `/wiLine18`, `/wiLine41`];
    const g = build(mfjFilerData, jointW2s([40000, 1000], [8000, 500]));
    expect(val(g, `/wiLine7`)).toBe(`48000.00`);
    expect(val(g, `/wiLine8`)).toBe(`21146.00`);
    expect(val(g, `/wiLine11`)).toBe(`25454.00`);
    expect(val(g, `/wiTaxMidpoint`)).toBe(`25450.00`);
    // Row 25,400–25,500. 685.30 + 4.4% × 5,870 = 943.58, half-up 944.
    expect(val(g, `/wiLine12`)).toBe(`944.00`);
    expect(val(g, `/wiLine18`)).toBe(`240.00`);
    expect(val(g, `/wiLine22`)).toBe(`704.00`);
    expect(val(g, `/wiLine28`)).toBe(`1500.00`);
    expect(val(g, `/wiLine41`)).toBe(`796.00`);
    expect(val(g, `/stateRefund`)).toBe(`796.00`);
    clear(g);
  });

  it(`T4 single: line 8 0; line 11 399,300; line 12 22,363`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`, `/wiLine11`, `/wiLine12`];
    const g = build(singleFilerData, w2(400000, 0, `sameState`));
    expect(val(g, `/wiLine8`)).toBe(`0.00`);
    expect(val(g, `/wiLine9`)).toBe(`400000.00`);
    expect(val(g, `/wiLine11`)).toBe(`399300.00`);
    // 7.65% × 399,300 − 8,183.76 = 22,362.69, half-up 22,363.
    expect(val(g, `/wiLine12`)).toBe(`22363.00`);
  });

  it(`T5 boundary: line 11 exactly 100,000 uses the worksheet and the tax is 4,714`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`, `/wiLine11`, `/wiLine12`];
    const g = build(singleFilerData, w2(104096, 0, `sameState`));
    expect(val(g, `/wiLine7`)).toBe(`104096.00`);
    expect(val(g, `/wiLine8`)).toBe(`3396.00`);
    expect(val(g, `/wiLine9`)).toBe(`100700.00`);
    expect(val(g, `/wiLine11`)).toBe(`100000.00`);
    expect(get(g, `/wiUsesTable`).get).toBe(false);
    // Worksheet: 5,300 − 586.44 = 4,713.56, half-up 4,714. The 99,900–100,000 table row is 4,711.
    expect(val(g, `/wiLine12`)).toBe(`4714.00`);
  });

  it(`T6 table rows match the tax table`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine12`];
    const zero = build(singleFilerData, w2(14260, 0, `sameState`));
    expect(val(zero, `/wiLine11`)).toBe(`0.00`);
    expect(val(zero, `/wiTaxMidpoint`)).toBe(`10.00`);
    expect(val(zero, `/wiLine12`)).toBe(`0.00`);
    const one = build(singleFilerData, w2(14280, 0, `sameState`));
    expect(val(one, `/wiLine11`)).toBe(`20.00`);
    expect(val(one, `/wiLine12`)).toBe(`1.00`);
    const two = build(singleFilerData, w2(14300, 0, `sameState`));
    expect(val(two, `/wiLine11`)).toBe(`40.00`);
    expect(val(two, `/wiLine12`)).toBe(`2.00`);
    const smiths = build(mfjFilerData, w2(50652, 0, `sameState`));
    expect(val(smiths, `/wiLine11`)).toBe(`28600.00`);
    expect(val(smiths, `/wiTaxMidpoint`)).toBe(`28650.00`);
    // The form's example: line 11 of $28,653 is the 28,600–28,700 row, tax $1,084.
    expect(val(smiths, `/wiLine12`)).toBe(`1084.00`);
    const high = build(singleFilerData, w2(93116, 0, `sameState`));
    expect(val(high, `/wiLine11`)).toBe(`87700.00`);
    expect(val(high, `/wiTaxMidpoint`)).toBe(`87750.00`);
    expect(val(high, `/wiLine12`)).toBe(`4064.00`);
  });

  it(`T7 standard deduction rows match the table`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine8`];
    const flat = build(singleFilerData, w2(19000, 0, `sameState`));
    expect(val(flat, `/wiLine8`)).toBe(`13560.00`);
    const phased = build(singleFilerData, w2(19500, 0, `sameState`));
    expect(val(phased, `/wiLine8`)).toBe(`13536.00`);
    const last = build(mfjFilerData, w2(155000, 0, `sameState`));
    expect(val(last, `/wiLine8`)).toBe(`17.00`);
    const gone = build(mfjFilerData, w2(155169, 0, `sameState`));
    expect(val(gone, `/wiLine8`)).toBe(`0.00`);
  });

  it(`T8 underpayment interest fires at owed 500 when that is more than 10 percent of line 22, and clears at 499`, () => {
    const fires = build(singleFilerData, w2(60000, 1598, `sameState`));
    expect(val(fires, `/wiLine22`)).toBe(`2098.00`);
    expect(val(fires, `/wiLine45`)).toBe(`500.00`);
    expect(get(fires, `/flowKnockoutWiUnderpaymentInterest`).get).toBe(true);
    const clears = build(singleFilerData, w2(60000, 1599, `sameState`));
    expect(val(clears, `/wiLine45`)).toBe(`499.00`);
    expect(get(clears, `/flowKnockoutWiUnderpaymentInterest`).get).toBe(false);
    // $500 owed is not more than 10 percent of line 22 when the tax is $22,363.
    const notTenPercent = build(singleFilerData, w2(400000, 21863, `sameState`));
    expect(val(notTenPercent, `/wiLine22`)).toBe(`22363.00`);
    expect(val(notTenPercent, `/wiLine45`)).toBe(`500.00`);
    expect(get(notTenPercent, `/flowKnockoutWiUnderpaymentInterest`).get).toBe(false);
  });

  it(`T9 additions and credits each stop on yes`, () => {
    const additions = build(singleFilerData, { '/wiHasAdditionsOrSubtractions': createBooleanWrapper(true) });
    expect(get(additions, `/flowKnockoutWiAdditionsOrSubtractions`).get).toBe(true);
    expect(get(additions, `/flowKnockoutWiCredits`).get).toBe(false);
    const credits = build(singleFilerData, { '/wiHasUnmodeledCredits': createBooleanWrapper(true) });
    expect(get(credits, `/flowKnockoutWiCredits`).get).toBe(true);
    expect(get(credits, `/flowKnockoutWiAdditionsOrSubtractions`).get).toBe(false);
  });

  it(`T10 joint married couple credit stays 480 when the lower earner is above 16,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/wiLine18`, `/wiMccWages`];
    const g = build(mfjFilerData, jointW2s([25000, 2000], [20000, 2000]));
    expect(val(g, `/wiPrimaryWages`)).toBe(`25000.00`);
    expect(val(g, `/wiSpouseWages`)).toBe(`20000.00`);
    expect(val(g, `/wiMccWages`)).toBe(`16000.00`);
    expect(val(g, `/wiLine18`)).toBe(`480.00`);
    clear(g);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`wi`, `/scopedStateOptions`),
      ...w2(60000, 2500),
    }).factGraph;
    expect(get(g, `/flowKnockoutWiW2NotWisconsin`).complete).toBe(true);
    expect(get(g, `/flowKnockoutWiW2NotWisconsin`).get).toBe(false);
    expect(val(g, `/wiLine28`)).toBe(`0.00`);
    expect(val(g, `/wiLine12`)).toBe(`2098.00`);
    expect(val(g, `/wiLine45`)).toBe(`2098.00`);
  });

  it(`stops part-year, nonresident, another state's W-2, interest, age 65, blindness, being claimed, itemizing, Schedule 1-A, another filing status, use tax, and another state's tax`, () => {
    const partYear = build(singleFilerData, {
      '/wiResidencyStatus': createEnumWrapper(`partYear`, `/wiResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutWiPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/wiResidencyStatus': createEnumWrapper(`nonresident`, `/wiResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutWiPartYearOrNonresident`).get).toBe(true);
    const otherState = build(singleFilerData, w2(60000, 0, `differentState`));
    expect(get(otherState, `/flowKnockoutWiW2NotWisconsin`).get).toBe(true);
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutWiOtherFederalIncome`).get).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutWiAgeOrBlind`).get).toBe(true);
    const blind = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(true),
    });
    expect(get(blind, `/flowKnockoutWiAgeOrBlind`).get).toBe(true);
    const claimed = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
    });
    expect(get(claimed, `/flowKnockoutWiClaimedAsDependent`).get).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    const dependent = build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) });
    expect(get(dependent, `/flowKnockoutWiDependents`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutWiItemizedDeductions`).get).toBe(true);
    const schedule1A = build(singleFilerData, {
      [`/formW2s/#${w2Id}/qualifiedOvertimeCodeTT`]: createDollarWrapper(`4000.00`),
      '/overtimeFlsaConfirmed': createBooleanWrapper(true),
    });
    expect(get(schedule1A, `/flowKnockoutWiSchedule1A`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutWiFilingStatus`).get).toBe(true);
    const separate = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`marriedFilingSeparately`, `/filingStatusOptions`),
    });
    expect(get(separate, `/flowKnockoutWiFilingStatus`).get).toBe(true);
    const useTax = build(singleFilerData, { '/wiHasUseTax': createBooleanWrapper(true) });
    expect(get(useTax, `/flowKnockoutWiUseTax`).get).toBe(true);
    const other = build(singleFilerData, { '/wiHasTaxPaidOtherState': createBooleanWrapper(true) });
    expect(get(other, `/flowKnockoutWiTaxPaidOtherState`).get).toBe(true);
  });

  it(`does not compute a Wisconsin return for Florida, and the Wisconsin stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/stateReturnIsWi`).get).toBe(false);
    expect(get(g, `/livedInWi`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });
});
