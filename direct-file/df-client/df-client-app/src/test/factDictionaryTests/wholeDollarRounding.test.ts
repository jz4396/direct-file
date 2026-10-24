import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  primaryFilerId,
  singleFilerData,
} from '../testData.js';

/**
 * #202: round each form line as it is computed, not only the totals.
 * 26 U.S.C. 6102(a) (https://www.law.cornell.edu/uscode/text/26/6102): "the fractional part of a dollar shall be
 * disregarded unless it amounts to one-half dollar or more, in which case the amount ... shall be increased by $1";
 * 26 CFR 301.6102-1(a) rounds half up. Instructions for Form 1040 (2025), p. 23: "If you do round to whole dollars,
 * you must round all amounts."
 * Senior deduction: 26 U.S.C. 151(d)(5)(C) (https://www.law.cornell.edu/uscode/text/26/151): "$6,000 for each
 * qualified individual", reduced by 6% of MAGI over $75,000; 2026 draft Schedule 1-A
 * (https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf) line 38 "Enter $75,000 ($150,000 if married filing jointly)",
 * line 40 "Multiply line 39 by 6% (0.06)", line 41 "Subtract line 40 from $6,000".
 * Golden end-to-end scenario (synthetic data): Single, age 66, wages $87,325, Schedule A 5a $4,321.40,
 * 5b $3,210.40, mortgage interest $12,000.00.
 */
const g = () =>
  setupFactGraph({
    ...baseFilerData,
    ...singleFilerData,
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1960-03-03`),
    ...makeW2Data(87325),
    '/scheduleAWantsToItemize': createBooleanWrapper(true),
    '/scheduleAWritableMedical': createDollarWrapper(`0`),
    '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`4321.40`),
    '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`3210.40`),
    '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
    '/scheduleAWritableMortgageInterest': createDollarWrapper(`12000.00`),
    '/scheduleAWritableCashGifts': createDollarWrapper(`0`),
    '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
    '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
  }).factGraph;
const val = (fg: ReturnType<typeof g>, p: string) => fg.get(p as ConcretePath).get.toString();

describe(`#202 whole-dollar rounding: Schedule 1-A line 40 and Schedule A lines 5a-5c`, () => {
  it(`Schedule 1-A: line 40 = round(6% x 12,325) = round(739.50) = 740, line 41 = 5,260 (not 5,261)`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine40`, `/schedule1ALine41`, `/schedule1ALine43`, `/schedule1ALine44`];
    const fg = g();
    expect(val(fg, `/schedule1ALine39`)).toBe(`12325.00`);
    expect(val(fg, `/schedule1ALine40`)).toBe(`740.00`);
    expect(val(fg, `/schedule1ALine41`)).toBe(`5260.00`);
    expect(val(fg, `/schedule1ALine43`)).toBe(`5260.00`);
    expect(val(fg, `/schedule1ALine44`)).toBe(`5260.00`);
  });

  it(`Schedule A: 5a 4,321, 5b 3,210, 5d/5e/7 7,531 (not 7,532), line 18 19,531`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleAStateLocalIncomeOrSalesTax`,
      `/scheduleARealEstateTaxes`,
      `/scheduleAPersonalPropertyTaxes`,
      `/scheduleALine5d`,
      `/scheduleALine5e`,
      `/scheduleALine18`,
    ];
    const fg = g();
    expect(val(fg, `/scheduleAStateLocalIncomeOrSalesTax`)).toBe(`4321.00`);
    expect(val(fg, `/scheduleARealEstateTaxes`)).toBe(`3210.00`);
    expect(val(fg, `/scheduleAPersonalPropertyTaxes`)).toBe(`0.00`);
    expect(val(fg, `/scheduleALine5d`)).toBe(`7531.00`);
    expect(val(fg, `/scheduleALine5e`)).toBe(`7531.00`);
    // Line 7 ("Add lines 5e and 6"; line 6 is $0 here) has no separate fact: it equals 5e.
    expect(val(fg, `/scheduleALine18`)).toBe(`19531.00`);
    // Line 18 beats the $18,150 standard deduction (Single, 65+), so the filer itemizes.
    expect(val(fg, `/standardOrItemizedDeductions`)).toBe(`19531.00`);
  });

  it(`Form 1040 lines 14/15 and Form 6251 lines 1a, 1b, 2a are whole dollars`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/totalDeductions`,
      `/taxableIncome`,
      `/form6251Line1a`,
      `/form6251Line1b`,
      `/form6251Line2a`,
    ];
    const fg = g();
    expect(val(fg, `/totalDeductions`)).toBe(`24791.00`);
    expect(val(fg, `/taxableIncome`)).toBe(`62534.00`);
    expect(val(fg, `/form6251Line1a`)).toBe(`19531.00`);
    expect(val(fg, `/form6251Line1b`)).toBe(`67794.00`);
    expect(val(fg, `/form6251Line2a`)).toBe(`7531.00`);
  });

  it(`no Schedule 1-A, Schedule A or 6251 amount in the scenario has non-zero cents`, ({ task }) => {
    const paths = [
      `/schedule1ALine39`,
      `/schedule1ALine40`,
      `/schedule1ALine41`,
      `/schedule1ALine43`,
      `/schedule1ALine44`,
      `/scheduleAMedical`,
      `/scheduleAStateLocalIncomeOrSalesTax`,
      `/scheduleARealEstateTaxes`,
      `/scheduleAPersonalPropertyTaxes`,
      `/scheduleAMortgageInterest`,
      `/scheduleACashGifts`,
      `/scheduleALine5d`,
      `/scheduleALine5e`,
      `/scheduleALine3`,
      `/scheduleALine4`,
      `/scheduleALine18`,
      `/form6251Line1a`,
      `/form6251Line1b`,
      `/form6251Line2a`,
    ];
    task.meta.testedFactPaths = paths;
    const fg = g();
    for (const p of paths) expect(val(fg, p), p).toMatch(/\.00$/);
  });

  it(`medical (line 1), mortgage interest (8a) and cash gifts (11) inputs with cents round half up`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleAMedical`, `/scheduleAMortgageInterest`, `/scheduleACashGifts`];
    const fg = setupFactGraph({
      ...baseFilerData,
      ...singleFilerData,
      ...makeW2Data(87325),
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAWritableMedical': createDollarWrapper(`100.49`),
      '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`0`),
      '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`0`),
      '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
      '/scheduleAWritableMortgageInterest': createDollarWrapper(`12000.50`),
      '/scheduleAWritableCashGifts': createDollarWrapper(`250.50`),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
      '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
    }).factGraph;
    expect(val(fg, `/scheduleAMedical`)).toBe(`100.00`);
    expect(val(fg, `/scheduleAMortgageInterest`)).toBe(`12001.00`);
    expect(val(fg, `/scheduleACashGifts`)).toBe(`251.00`);
  });
});

/**
 * Schedule 1-A Part IV (car loan interest), 2026 draft Schedule 1-A (https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf):
 * line 28a/28b column (iii) per vehicle, line 29 "Add lines 28a and 28b, column (iii)", line 30 "Enter the smaller of
 * the amount on line 29 or $10,000", line 36 deduction, line 44 total. Instructions for Form 1040 (2025), p. 23,
 * Rounding Off to Whole Dollars: "To round, drop amounts under 50 cents and increase amounts from 50 to 99 cents to the
 * next dollar." Synthetic VINs only (17 chars, no I/O/Q).
 */
describe(`#202 whole-dollar rounding: Schedule 1-A Part IV lines 28a, 28b, 29, 30, 36 and 44`, () => {
  const V1 = `c1111111-1111-4111-8111-111111111111`;
  const V2 = `c2222222-2222-4222-8222-222222222222`;
  const VINS: Record<string, string> = { [V1]: `1HGCM82633A004352`, [V2]: `2T1BR32E54C000001` };
  const vehicle = (id: string, interest: string) => ({
    [`/carLoans/#${id}/isNewVehicle`]: createBooleanWrapper(true),
    [`/carLoans/#${id}/usAssembly`]: createBooleanWrapper(true),
    [`/carLoans/#${id}/after2024`]: createBooleanWrapper(true),
    [`/carLoans/#${id}/hasBusinessUse`]: createBooleanWrapper(false),
    [`/carLoans/#${id}/isLease`]: createBooleanWrapper(false),
    [`/carLoans/#${id}/hasOtherExceptions`]: createBooleanWrapper(false),
    [`/carLoans/#${id}/vin`]: createStringWrapper(VINS[id]),
    [`/carLoans/#${id}/writableInterest`]: createDollarWrapper(interest),
  });
  const noW2 = Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
  );
  const carGraph = (...interest: string[]) =>
    setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      ...makeW2Data(60000),
      ...(interest.length
        ? {
            '/carLoanHadInterest': createBooleanWrapper(true),
            '/carLoans': createCollectionWrapper([V1, V2].slice(0, interest.length)),
            ...Object.assign({}, ...interest.map((amt, i) => vehicle([V1, V2][i], amt))),
          }
        : {}),
    }).factGraph;
  const partIv = [
    `/carLoans/*/line28Interest`,
    `/carLoanLine29`,
    `/carLoanLine30`,
    `/carLoanLine36`,
    `/schedule1ALine36`,
    `/schedule1ALine44`,
  ];
  const line44Delta = (fg: ReturnType<typeof carGraph>) =>
    Number(val(fg, `/schedule1ALine44`)) - Number(val(carGraph(), `/schedule1ALine44`));

  it(`one vehicle, $1,234.56: line 28a 1,235, lines 29, 30, 36 1,235, line 44 up by 1,235`, ({ task }) => {
    task.meta.testedFactPaths = partIv;
    const fg = carGraph(`1234.56`);
    expect(val(fg, `/carLoans/#${V1}/line28Interest`)).toBe(`1235.00`);
    expect(val(fg, `/carLoanLine29`)).toBe(`1235.00`);
    expect(val(fg, `/carLoanLine30`)).toBe(`1235.00`);
    expect(val(fg, `/carLoanLine36`)).toBe(`1235.00`);
    expect(val(fg, `/schedule1ALine36`)).toBe(`1235.00`);
    expect(val(fg, `/schedule1ALine44`)).toMatch(/\.00$/);
    expect(line44Delta(fg)).toBe(1235);
  });

  it(`two vehicles, $1,234.50 and $2,000.49: 28a 1,235, 28b 2,000, line 29 = printed 28a + 28b = 3,235`, ({
    task,
  }) => {
    task.meta.testedFactPaths = partIv;
    const fg = carGraph(`1234.50`, `2000.49`);
    expect(val(fg, `/carLoans/#${V1}/line28Interest`)).toBe(`1235.00`);
    expect(val(fg, `/carLoans/#${V2}/line28Interest`)).toBe(`2000.00`);
    expect(val(fg, `/carLoanLine29`)).toBe(`3235.00`);
    expect(val(fg, `/carLoanLine30`)).toBe(`3235.00`);
    expect(val(fg, `/carLoanLine36`)).toBe(`3235.00`);
    expect(line44Delta(fg)).toBe(3235);
  });

  it(`two vehicles, $100.40 each: rows 100 and 100, line 29 200 (sum of the printed rows, not round(200.80))`, ({
    task,
  }) => {
    task.meta.testedFactPaths = partIv;
    const fg = carGraph(`100.40`, `100.40`);
    expect(val(fg, `/carLoans/#${V1}/line28Interest`)).toBe(`100.00`);
    expect(val(fg, `/carLoans/#${V2}/line28Interest`)).toBe(`100.00`);
    expect(val(fg, `/carLoanLine29`)).toBe(`200.00`);
    expect(val(fg, `/carLoanLine30`)).toBe(`200.00`);
    expect(val(fg, `/carLoanLine36`)).toBe(`200.00`);
    expect(line44Delta(fg)).toBe(200);
  });

  it(`$10,000.50 rounds to 10,001 on line 28a; line 30 caps at 10,000`, ({ task }) => {
    task.meta.testedFactPaths = partIv;
    const fg = carGraph(`10000.50`);
    expect(val(fg, `/carLoans/#${V1}/line28Interest`)).toBe(`10001.00`);
    expect(val(fg, `/carLoanLine29`)).toBe(`10001.00`);
    expect(val(fg, `/carLoanLine30`)).toBe(`10000.00`);
    expect(val(fg, `/carLoanLine36`)).toBe(`10000.00`);
    expect(line44Delta(fg)).toBe(10000);
  });
});
