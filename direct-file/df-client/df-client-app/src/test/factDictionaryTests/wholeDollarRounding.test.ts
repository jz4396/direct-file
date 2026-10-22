import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDayWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, makeW2Data, primaryFilerId, singleFilerData } from '../testData.js';

/**
 * #202: round each form line as it is computed, not only the totals.
 * 26 U.S.C. 6102(a) (https://www.law.cornell.edu/uscode/text/26/6102): "the fractional part of a dollar shall be
 * disregarded unless it amounts to one-half dollar or more, in which case the amount ... shall be increased by $1";
 * 26 CFR 301.6102-1(a) rounds half up. Instructions for Form 1040 (2025), p. 23: "If you do round to whole dollars,
 * you must round all amounts."
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
