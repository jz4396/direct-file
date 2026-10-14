import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  mfjFilerData,
  singleFilerData,
} from '../testData.js';

/**
 * #45: IRC §170(p) as amended by P.L. 119-21 §70424 (TY2026): non-itemizers deduct cash gifts to §170(b)(1)(A)
 * charities "not in excess of $1,000 ($2,000 in the case of a joint return)", without regard to the (b)(1)(I) 0.5%
 * floor. Form 1040 (2026) draft line 12f; line 14 = 12e + 12f + 13a + 13b.
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const gifts = (amount?: string) =>
  amount === undefined
    ? { '/nonItemizerHadCashGifts': createBooleanWrapper(false) }
    : {
        '/nonItemizerHadCashGifts': createBooleanWrapper(true),
        '/nonItemizerWritableCashGifts': createDollarWrapper(amount),
      };
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
const build = (status: Record<string, unknown>, wages: number, extra: Record<string, unknown>) =>
  setupFactGraph({ ...noW2, ...baseFilerData, ...status, ...makeW2Data(wages), ...extra }).factGraph;
const single = (extra: Record<string, unknown> = {}) => build(singleFilerData, 60000, extra);
const mfj = (extra: Record<string, unknown> = {}) => build(mfjFilerData, 60000, extra);
const line12f = (fg: Fg) => get(fg, `/nonItemizerCharitableDeduction`).get.toString();
const deductionsDelta = (fg: Fg) =>
  Number(get(fg, `/totalDeductions`).get.toString()) - Number(get(fg, `/standardOrItemizedDeductions`).get.toString());

describe(`§170(p) charitable deduction for non-itemizers (#45)`, () => {
  it(`unanswered gate: $0 and the return stays complete`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`, `/totalDeductions`];
    const fg = single();
    expect(get(fg, `/nonItemizerCharitableDeduction`).complete).toBe(true);
    expect(line12f(fg)).toBe(`0.00`);
    expect(get(fg, `/totalDeductions`).complete).toBe(true);
  });

  it(`no gifts: $0`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`];
    const fg = single(gifts());
    expect(line12f(fg)).toBe(`0.00`);
    expect(deductionsDelta(fg)).toBe(0);
  });

  it(`$500 single: $500 on line 12f, added to line 14, no 0.5% floor`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`, `/totalDeductions`, `/taxableIncome`];
    const none = single(gifts());
    const fg = single(gifts(`500`));
    expect(line12f(fg)).toBe(`500.00`);
    expect(deductionsDelta(fg)).toBe(500);
    expect(Number(get(none, `/taxableIncome`).get.toString()) - Number(get(fg, `/taxableIncome`).get.toString())).toBe(
      500
    );
  });

  it(`single capped at $1,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`];
    expect(line12f(single(gifts(`5000`)))).toBe(`1000.00`);
  });

  it(`MFJ capped at $2,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`, `/nonItemizerCharitableCap`];
    expect(line12f(mfj(gifts(`1500`)))).toBe(`1500.00`);
    expect(line12f(mfj(gifts(`5000`)))).toBe(`2000.00`);
  });

  it(`60% of AGI cash limit (§170(b)(1)(G)(i)) applies at very low AGI`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`];
    const fg = build(singleFilerData, 1000, gifts(`900`));
    expect(line12f(fg)).toBe(`600.00`);
  });

  it(`itemizer gets $0 (no stacking with Schedule A)`, ({ task }) => {
    task.meta.testedFactPaths = [`/nonItemizerCharitableDeduction`, `/itemizesDeductions`, `/totalDeductions`];
    const fg = single({
      ...gifts(`800`),
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
      '/scheduleAWritableMedical': createDollarWrapper(`0`),
      '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`9000`),
      '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`6000`),
      '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
      '/scheduleAWritableMortgageInterest': createDollarWrapper(`12000`),
      '/scheduleAWritableCashGifts': createDollarWrapper(`800`),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
    });
    expect(get(fg, `/itemizesDeductions`).get).toBe(true);
    expect(line12f(fg)).toBe(`0.00`);
    expect(deductionsDelta(fg)).toBe(0);
  });

  it(`itemizing must beat standard + line 12f`, ({ task }) => {
    task.meta.testedFactPaths = [`/itemizesDeductions`];
    // Schedule A line 18 = $16,600 vs. standard $16,100 + $1,000 line 12f = $17,100: keep the standard deduction.
    const fg = single({
      ...gifts(`1000`),
      '/scheduleAWantsToItemize': createBooleanWrapper(true),
      '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
      '/scheduleAWritableMedical': createDollarWrapper(`0`),
      '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`8000`),
      '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`0`),
      '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
      '/scheduleAWritableMortgageInterest': createDollarWrapper(`8600`),
      '/scheduleAWritableCashGifts': createDollarWrapper(`0`),
      '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
    });
    expect(get(fg, `/scheduleALine18`).get.toString()).toBe(`16600.00`);
    expect(get(fg, `/itemizesDeductions`).get).toBe(false);
    expect(line12f(fg)).toBe(`1000.00`);
  });
});
