import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createAddressWrapper,
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  mfjFilerData,
  mfsFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

/**
 * #93 slice 4. Full-year North Carolina resident, W-2 wages only, Form D-400.
 * Spec: https://github.com/jz4396/direct-file/issues/93#issuecomment-6949678658
 * Single, wages 55,000, withholding 2,000. Line 11 is 12,750. Line 14 is 42,250.
 * 42,250 × 0.0399 = 1,685.775, which rounds to 1,686. Refund 314.
 * Guard: line 14 of 40,213 × 0.0399 = 1,604.4987, which stays 1,604.
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
  '/ncResidencyStatus': createEnumWrapper(`fullYear`, `/ncResidencyOptions`),
  '/ncCounty': createStringWrapper(`Mecklenburg`),
  '/ncIsVeteran': createBooleanWrapper(false),
  '/ncSpouseIsVeteran': createBooleanWrapper(false),
  '/ncHasScheduleS': createBooleanWrapper(false),
  '/ncClaimsChildDeduction': createBooleanWrapper(false),
  '/ncItemizes': createBooleanWrapper(false),
  '/ncHasD400TcCredit': createBooleanWrapper(false),
  '/ncHasUseTax': createBooleanWrapper(false),
  '/ncHasOtherPayments': createBooleanWrapper(false),
  '/soldCapitalAssets': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `3456` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `3457` }),
  '/address': createAddressWrapper(`100 Synthetic Ln`, `Raleigh`, `27601`, `NC`),
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
  [`/formW2s/#${id}/employerAddress`]: createAddressWrapper(`200 Payroll Ave`, `Raleigh`, `27601`, `NC`),
});

const build = (status: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    ...screeners,
    '/filerResidenceAndIncomeState': createEnumWrapper(`nc`, `/scopedStateOptions`),
    ...w2(55000, 2000, `sameState`),
    ...extra,
  }).factGraph;

const KOS = [
  `/flowKnockoutNcPartYearOrNonresident`,
  `/flowKnockoutNcScheduleS`,
  `/flowKnockoutNcOtherFederalIncome`,
  `/flowKnockoutNcDependentsOrChildDeduction`,
  `/flowKnockoutNcItemizedDeductions`,
  `/flowKnockoutNcCredits`,
  `/flowKnockoutNcUseTax`,
  `/flowKnockoutNcOtherPayments`,
  `/flowKnockoutNcW2NotNorthCarolina`,
  `/flowKnockoutNcMfsSpouseItemizes`,
];

describe(`D-400 full-year resident, W-2 wages only (#93 slice 4)`, () => {
  it(`single: line 11 12,750; line 14 42,250; line 15 1,686; withholding 2,000; refund 314`, ({ task }) => {
    task.meta.testedFactPaths = [`/ncLine11`, `/ncLine14`, `/ncLine15`, `/ncLine20`, `/ncLine34`, `/ncLine27`];
    const g = build(singleFilerData);
    expect(get(g, `/livedInNc`).get).toBe(true);
    expect(get(g, `/stateReturnIsNc`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(val(g, `/ncLine6`)).toBe(`55000.00`);
    expect(val(g, `/ncLine7`)).toBe(`0.00`);
    expect(val(g, `/ncLine8`)).toBe(`55000.00`);
    expect(val(g, `/ncLine9`)).toBe(`0.00`);
    expect(val(g, `/ncLine10b`)).toBe(`0.00`);
    expect(val(g, `/ncLine11`)).toBe(`12750.00`);
    expect(val(g, `/ncLine12a`)).toBe(`12750.00`);
    expect(val(g, `/ncLine12b`)).toBe(`42250.00`);
    expect(val(g, `/ncLine14`)).toBe(`42250.00`);
    expect(val(g, `/ncLine15`)).toBe(`1686.00`);
    expect(val(g, `/ncLine16`)).toBe(`0.00`);
    expect(val(g, `/ncLine18`)).toBe(`0.00`);
    expect(val(g, `/ncLine19`)).toBe(`1686.00`);
    expect(val(g, `/ncLine20a`)).toBe(`2000.00`);
    expect(val(g, `/ncLine20b`)).toBe(`0.00`);
    expect(val(g, `/ncLine20`)).toBe(`2000.00`);
    expect(val(g, `/ncLine21a`)).toBe(`0.00`);
    expect(val(g, `/ncLine23`)).toBe(`2000.00`);
    expect(val(g, `/ncLine26a`)).toBe(`0.00`);
    expect(val(g, `/ncLine27`)).toBe(`0.00`);
    expect(val(g, `/ncLine28`)).toBe(`314.00`);
    expect(val(g, `/ncLine33`)).toBe(`0.00`);
    expect(val(g, `/ncLine34`)).toBe(`314.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`1686.00`);
    expect(val(g, `/stateTaxWithheld`)).toBe(`2000.00`);
    expect(val(g, `/stateRefund`)).toBe(`314.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`0.00`);
    KOS.forEach((k) => {
      expect(get(g, k).complete).toBe(true);
      expect(get(g, k).get).toBe(false);
    });
  });

  it(`married filing jointly: line 14 29,500; line 15 1,177`, ({ task }) => {
    task.meta.testedFactPaths = [`/ncLine11`, `/ncLine14`, `/ncLine15`];
    const g = build(mfjFilerData);
    expect(val(g, `/ncLine11`)).toBe(`25500.00`);
    expect(val(g, `/ncLine14`)).toBe(`29500.00`);
    expect(val(g, `/ncLine15`)).toBe(`1177.00`);
    expect(val(g, `/ncLine34`)).toBe(`823.00`);
  });

  it(`line 14 of 40,213 rounds once to 1,604`, ({ task }) => {
    task.meta.testedFactPaths = [`/ncLine14`, `/ncLine15`];
    // 52,963 − 12,750 = 40,213. 40,213 × 0.0399 = 1,604.4987, which stays 1,604.
    const g = build(singleFilerData, w2(52963, 0, `sameState`));
    expect(val(g, `/ncLine14`)).toBe(`40213.00`);
    expect(val(g, `/ncLine15`)).toBe(`1604.00`);
  });

  it(`an exact half dollar rounds up: 45,000 becomes 1,796`, ({ task }) => {
    task.meta.testedFactPaths = [`/ncLine14`, `/ncLine15`];
    // 57,750 − 12,750 = 45,000. 45,000 × 0.0399 = 1,795.50, which rounds to 1,796.
    const g = build(singleFilerData, w2(57750, 0, `sameState`));
    expect(val(g, `/ncLine14`)).toBe(`45000.00`);
    expect(val(g, `/ncLine15`)).toBe(`1796.00`);
  });

  it(`wages below the standard deduction: line 15 is zero and the withholding is refunded`, ({ task }) => {
    task.meta.testedFactPaths = [`/ncLine15`, `/ncLine34`];
    const g = build(singleFilerData, w2(10000, 2000, `sameState`));
    expect(val(g, `/ncLine14`)).toBe(`0.00`);
    expect(val(g, `/ncLine15`)).toBe(`0.00`);
    expect(val(g, `/ncLine27`)).toBe(`0.00`);
    expect(val(g, `/ncLine34`)).toBe(`2000.00`);
  });

  it(`head of household, qualifying surviving spouse, and separate filers use the chart`, () => {
    const hoh = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expect(val(hoh, `/ncLine11`)).toBe(`19125.00`);
    const qss = build(singleFilerData, {
      '/filingStatus': createEnumWrapper(`qualifiedSurvivingSpouse`, `/filingStatusOptions`),
    });
    expect(val(qss, `/ncLine11`)).toBe(`25500.00`);
    const separate = build(mfsFilerData, {
      '/MFSLivingSpouseFilingReturn': createBooleanWrapper(true),
      '/spouseItemizes': createBooleanWrapper(false),
    });
    expect(val(separate, `/ncLine11`)).toBe(`12750.00`);
    expect(get(separate, `/flowKnockoutNcMfsSpouseItemizes`).get).toBe(false);
  });

  it(`age 65 and a filer who can be claimed still get the full standard deduction`, () => {
    const older = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`),
    });
    expect(val(older, `/ncLine11`)).toBe(`12750.00`);
    const claimed = build(singleFilerData, {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
    });
    expect(val(claimed, `/ncLine11`)).toBe(`12750.00`);
    expect(get(claimed, `/flowKnockoutNcMfsSpouseItemizes`).get).toBe(false);
  });

  it(`stops a separate return when the spouse itemizes, and line 11 is zero`, () => {
    const g = build(mfsFilerData, {
      '/MFSLivingSpouseFilingReturn': createBooleanWrapper(true),
      '/spouseItemizes': createBooleanWrapper(true),
    });
    expect(get(g, `/flowKnockoutNcMfsSpouseItemizes`).get).toBe(true);
    expect(val(g, `/ncLine11`)).toBe(`0.00`);
  });

  it(`puts the spouse's withholding on line 20b`, () => {
    const g = build(mfjFilerData, {
      ...w2(40000, 1500, `sameState`, primaryFilerId, w2Id),
      ...w2(15000, 500, `sameState`, spouseId, spouseW2Id),
      '/formW2s': createCollectionWrapper([w2Id, spouseW2Id]),
    });
    expect(val(g, `/ncLine6`)).toBe(`55000.00`);
    expect(val(g, `/ncLine20a`)).toBe(`1500.00`);
    expect(val(g, `/ncLine20b`)).toBe(`500.00`);
    expect(val(g, `/ncLine20`)).toBe(`2000.00`);
  });

  it(`stops part-year and nonresident`, () => {
    const partYear = build(singleFilerData, {
      '/ncResidencyStatus': createEnumWrapper(`partYear`, `/ncResidencyOptions`),
    });
    expect(get(partYear, `/flowKnockoutNcPartYearOrNonresident`).get).toBe(true);
    const nonresident = build(singleFilerData, {
      '/ncResidencyStatus': createEnumWrapper(`nonresident`, `/ncResidencyOptions`),
    });
    expect(get(nonresident, `/flowKnockoutNcPartYearOrNonresident`).get).toBe(true);
  });

  it(`stops a W-2 whose box 15 is not North Carolina, an unanswered box 15, and a box 20 locality`, () => {
    expect(get(build(singleFilerData, w2(55000, 2000, `differentState`)), `/flowKnockoutNcW2NotNorthCarolina`).get).toBe(
      true
    );
    const unanswered = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...screeners,
      '/filerResidenceAndIncomeState': createEnumWrapper(`nc`, `/scopedStateOptions`),
      ...w2(55000, 2000),
    }).factGraph;
    expect(get(unanswered, `/flowKnockoutNcW2NotNorthCarolina`).get).toBe(true);
    expect(
      get(
        build(singleFilerData, { [`/formW2s/#${w2Id}/writableLocality`]: createStringWrapper(`Wake`) }),
        `/flowKnockoutNcW2NotNorthCarolina`
      ).get
    ).toBe(true);
  });

  it(`stops federal income other than W-2 wages, including a 1099-R`, () => {
    const interest = build(
      singleFilerData,
      makeInterestReportData(100, `693d539c-6679-4264-b6b5-d7411e318395`, primaryFilerId)
    );
    expect(get(interest, `/flowKnockoutNcOtherFederalIncome`).get).toBe(true);
    const retirementId = `7b1c2a10-6d6f-424e-9ba2-8cdf19d45b10`;
    const retirement = build(singleFilerData, {
      '/form1099Rs': createCollectionWrapper([retirementId]),
    });
    expect(get(retirement, `/flowKnockoutNcOtherFederalIncome`).get).toBe(true);
  });

  it(`stops the yes/no questions and a dependent`, () => {
    expect(get(build(singleFilerData, { '/ncHasScheduleS': createBooleanWrapper(true) }), `/flowKnockoutNcScheduleS`).get)
      .toBe(true);
    expect(
      get(
        build(singleFilerData, { '/ncClaimsChildDeduction': createBooleanWrapper(true) }),
        `/flowKnockoutNcDependentsOrChildDeduction`
      ).get
    ).toBe(true);
    const childId = `5d2b908c-29cf-4c16-9f1d-1cea87cb7603`;
    expect(
      get(
        build(singleFilerData, { '/familyAndHousehold': createCollectionWrapper([childId]) }),
        `/flowKnockoutNcDependentsOrChildDeduction`
      ).get
    ).toBe(true);
    expect(
      get(build(singleFilerData, { '/ncItemizes': createBooleanWrapper(true) }), `/flowKnockoutNcItemizedDeductions`).get
    ).toBe(true);
    expect(get(build(singleFilerData, { '/ncHasD400TcCredit': createBooleanWrapper(true) }), `/flowKnockoutNcCredits`).get)
      .toBe(true);
    expect(get(build(singleFilerData, { '/ncHasUseTax': createBooleanWrapper(true) }), `/flowKnockoutNcUseTax`).get).toBe(
      true
    );
    expect(
      get(build(singleFilerData, { '/ncHasOtherPayments': createBooleanWrapper(true) }), `/flowKnockoutNcOtherPayments`)
        .get
    ).toBe(true);
  });

  it(`does not compute a North Carolina return for Florida, and the North Carolina stops are false`, () => {
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      '/soldCapitalAssets': createBooleanWrapper(false),
    }).factGraph;
    expect(get(g, `/livedInNc`).get).toBe(false);
    expect(get(g, `/stateReturnIsNc`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    KOS.forEach((k) => {
      expect(get(g, k).complete).toBe(true);
      expect(get(g, k).get).toBe(false);
    });
  });
});
