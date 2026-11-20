import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
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
 * #93 slice 6. Full-year Massachusetts resident, W-2 wages only, Form 1.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-7041067411
 * Single, box 16 $60,010, boxes 4+6 at least $2,000, rent $18,000, withheld $2,700.
 * 11a $2,000; 14 $4,000; 16 $6,000; 17 $54,010; 19 $49,610.
 * 49,610 × 0.05 = 2,480.50, which rounds half-up to $2,481. Half-even would leave $2,480. Refund $219.
 * Joint, box 16 $90,000 and $50,000, no rent, withheld $6,500. Line 21 is $127,200. Line 22 is $6,360. Refund $140.
 * The same joint return at 5.85% is $7,441.20, which rounds half-up to $7,441, so they owe $941.
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
  '/maResidencyStatus': createEnumWrapper(`fullYear`, `/maResidencyOptions`),
  '/soldCapitalAssets': createBooleanWrapper(false),
  '/maHasUseTax': createBooleanWrapper(false),
  '/maHasFullYearMcc': createBooleanWrapper(true),
  '/maHasRetirementContribution': createBooleanWrapper(false),
  '/maInsurerName': createStringWrapper(`Bay State Health`),
  '/maSubscriberId': createStringWrapper(`HC100`),
  '/maRentPaid': createDollarWrapper(`0.00`),
};

const w2 = (
  wages: number,
  withheld: number,
  state?: `sameState` | `differentState`,
  filer: string = primaryFilerId,
  id: string = w2Id,
  fica = 2000
) => ({
  ...makeW2Data(wages, id, filer),
  ...(state ? { [`/formW2s/#${id}/writableState`]: createEnumWrapper(state, `/incomeFormStateOptions`) } : {}),
  [`/formW2s/#${id}/writableStateWages`]: createDollarWrapper(`${wages}.00`),
  [`/formW2s/#${id}/writableStateWithholding`]: createDollarWrapper(`${withheld}.00`),
  [`/formW2s/#${id}/writableOasdiWithholding`]: createDollarWrapper(`${fica}.00`),
  [`/formW2s/#${id}/writableMedicareWithholding`]: createDollarWrapper(`0.00`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`ma`, `/scopedStateOptions`),
    ...w2(60010, 2700, `sameState`),
    '/maRentPaid': createDollarWrapper(`18000.00`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutMaPartYearOrNonresident`,
  `/flowKnockoutMaW2NotMassachusetts`,
  `/flowKnockoutMaOtherFederalIncome`,
  `/flowKnockoutMaDependentsOrQualifyingPerson`,
  `/flowKnockoutMaAgeOrBlind`,
  `/flowKnockoutMaFilingStatus`,
  `/flowKnockoutMaItemizedDeductions`,
  `/flowKnockoutMaTaxTable`,
  `/flowKnockoutMaSurtax`,
  `/flowKnockoutMaEarnedIncomeCredit`,
  `/flowKnockoutMaUseTax`,
  `/flowKnockoutMaNoFullYearMcc`,
  `/flowKnockoutMaRetirementContribution`,
  `/flowKnockoutMaScheduleHcIdentifiers`,
];

const spouseHc = {
  '/maSpouseHasFullYearMcc': createBooleanWrapper(true),
  '/maSpouseInsurerName': createStringWrapper(`Bay State Health`),
  '/maSpouseSubscriberId': createStringWrapper(`HC200`),
};

describe(`Form 1 full-year resident, W-2 wages only (#93 slice 6)`, () => {
  it(`single: line 21 49,610; line 22 2,481; withholding 2,700; refund 219`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/maLine3`,
      `/maLine11a`,
      `/maLine14`,
      `/maLine16`,
      `/maLine17`,
      `/maLine19`,
      `/maLine21`,
      `/maLine22`,
      `/maLine38a`,
      `/maLine54`,
    ];
    const g = build(singleFilerData);
    expect(get(g, `/livedInMa`).get).toBe(true);
    expect(get(g, `/stateReturnIsMa`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/maLine2a`)).toBe(`4400.00`);
    expect(val(g, `/maLine3`)).toBe(`60010.00`);
    expect(val(g, `/maLine10`)).toBe(`60010.00`);
    expect(val(g, `/maLine11a`)).toBe(`2000.00`);
    expect(val(g, `/maLine11b`)).toBe(`0.00`);
    expect(val(g, `/maLine14`)).toBe(`4000.00`);
    expect(val(g, `/maLine16`)).toBe(`6000.00`);
    expect(val(g, `/maLine17`)).toBe(`54010.00`);
    expect(val(g, `/maLine19`)).toBe(`49610.00`);
    expect(val(g, `/maLine21`)).toBe(`49610.00`);
    // 49,610 × 0.05 = 2,480.50. Half-up is 2,481. Half-even would be 2,480.
    expect(val(g, `/maLine22`)).toBe(`2481.00`);
    expect(val(g, `/maLine38a`)).toBe(`2700.00`);
    expect(val(g, `/maLine54`)).toBe(`219.00`);
    expect(val(g, `/maLine55`)).toBe(`0.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`2481.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`2700.00`);
    expect(val(g, `/stateRefund`)).toBe(`219.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    expect(get(g, `/maElectsOptionalRate`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`joint: line 21 127,200; line 22 6,360; withholding 6,500; refund 140`, ({ task }) => {
    task.meta.testedFactPaths = [`/maLine11b`, `/maLine21`, `/maLine22`, `/maLine54`];
    const g = build(mfjFilerData, {
      ...w2(90000, 4000, `sameState`, primaryFilerId, w2Id),
      ...w2(50000, 2500, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      '/maRentPaid': createDollarWrapper(`0.00`),
      ...spouseHc,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    expect(val(g, `/maLine2a`)).toBe(`8800.00`);
    expect(val(g, `/maLine3`)).toBe(`140000.00`);
    expect(val(g, `/maLine11a`)).toBe(`2000.00`);
    expect(val(g, `/maLine11b`)).toBe(`2000.00`);
    expect(val(g, `/maLine14`)).toBe(`0.00`);
    expect(val(g, `/maLine17`)).toBe(`136000.00`);
    expect(val(g, `/maLine18`)).toBe(`8800.00`);
    expect(val(g, `/maLine21`)).toBe(`127200.00`);
    expect(val(g, `/maLine22`)).toBe(`6360.00`);
    expect(val(g, `/maLine38`)).toBe(`6500.00`);
    expect(val(g, `/maLine54`)).toBe(`140.00`);
    expect(val(g, `/maLine55`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });

  it(`joint at the optional 5.85 percent rate: line 22 7,441; amount owed 941`, () => {
    const g = build(mfjFilerData, {
      ...w2(90000, 4000, `sameState`, primaryFilerId, w2Id),
      ...w2(50000, 2500, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
      '/maRentPaid': createDollarWrapper(`0.00`),
      '/maElectsOptionalRate': createBooleanWrapper(true),
      ...spouseHc,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    });
    // 127,200 × 0.0585 = 7,441.20. Half-up is 7,441.
    expect(val(g, `/maLine21`)).toBe(`127200.00`);
    expect(val(g, `/maLine22`)).toBe(`7441.00`);
    expect(val(g, `/maLine54`)).toBe(`0.00`);
    expect(val(g, `/maLine55`)).toBe(`941.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`941.00`);
  });

  it(`stops a single filer under the tax table, a New Hampshire W-2, and no full-year coverage`, () => {
    const low = build(singleFilerData, {
      ...w2(28000, 0, `sameState`),
      '/maRentPaid': createDollarWrapper(`0.00`),
    });
    expect(val(low, `/maLine21`)).toBe(`21600.00`);
    expect(get(low, `/flowKnockoutMaTaxTable`).get).toBe(true);
    const newHampshire = build(singleFilerData, w2(60010, 0, `differentState`));
    expect(get(newHampshire, `/flowKnockoutMaW2NotMassachusetts`).get).toBe(true);
    const noCoverage = build(singleFilerData, { '/maHasFullYearMcc': createBooleanWrapper(false) });
    expect(get(noCoverage, `/flowKnockoutMaNoFullYearMcc`).get).toBe(true);
  });

  it(`a blank box 15 is in scope and adds no withholding`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`ma`, `/scopedStateOptions`),
      ...w2(60010, 2700),
      '/maRentPaid': createDollarWrapper(`18000.00`),
    }).factGraph;
    expect(get(g, `/flowKnockoutMaW2NotMassachusetts`).complete).toBe(true);
    expect(get(g, `/flowKnockoutMaW2NotMassachusetts`).get).toBe(false);
    expect(val(g, `/maLine3`)).toBe(`60010.00`);
    expect(val(g, `/maLine38a`)).toBe(`0.00`);
    expect(val(g, `/maLine22`)).toBe(`2481.00`);
  });

  it(`stops part-year, nonresident, interest, a dependent, age 65, itemizing, and another filing status`, () => {
    const partYear = build(singleFilerData, {
      '/maResidencyStatus': createEnumWrapper(`partYear`, `/maResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutMaPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/maResidencyStatus': createEnumWrapper(`nonresident`, `/maResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutMaPartYearOrNonresident`).get).toBe(true);
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutMaOtherFederalIncome`).get).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutMaDependentsOrQualifyingPerson`
      ).get
    ).toBe(true);
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(get(older, `/flowKnockoutMaAgeOrBlind`).get).toBe(true);
    const itemized = build(singleFilerData, {
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
    });
    expect(get(itemized, `/flowKnockoutMaItemizedDeductions`).get).toBe(true);
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(get(hoh, `/flowKnockoutMaFilingStatus`).get).toBe(true);
    const retirement = build(singleFilerData, { '/maHasRetirementContribution': createBooleanWrapper(true) });
    expect(get(retirement, `/flowKnockoutMaRetirementContribution`).get).toBe(true);
    const useTax = build(singleFilerData, { '/maHasUseTax': createBooleanWrapper(true) });
    expect(get(useTax, `/flowKnockoutMaUseTax`).get).toBe(true);
  });

  it(`does not compute a Massachusetts return for Florida, and the Massachusetts stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInMa`).get).toBe(false);
    expect(get(g, `/stateReturnIsMa`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete, k).toBe(true);
      expect(get(g, k).get, k).toBe(false);
    });
  });
});
