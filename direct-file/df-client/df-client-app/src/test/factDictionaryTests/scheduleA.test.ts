import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  mfsFilerData,
  singleFilerData,
} from '../testData.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';

/**
 * #37 Schedule A MVP (TY2026).
 * IRC §164(b)(6)-(7) as amended by P.L. 119-21; §213(a); §170(b)(1)(G), (I); §68; §63(e).
 * Schedule A (Form 1040) 2026 draft lines 3, 5e, 13, 18, 19. Std deduction: Rev. Proc. 2025-32 p. 18.
 */
const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], p: string) => fg.get(p as ConcretePath);

describe(`SALT cap — IRC §164(b)(7) (TY2026 $40,400, threshold $505,000, 30% phasedown, $10,000 floor)`, () => {
  it.each([
    [400000, `40400.00`], // below threshold
    [505000, `40400.00`], // at threshold
    [555000, `25400.00`], // 40,400 − 30% × 50,000
    [600000, `11900.00`], // 40,400 − 30% × 95,000
    [700000, `10000.00`], // floor
  ])(`single, AGI %i → SALT limit %s`, (agi, expected) => {
    const { factGraph } = setupFactGraph({ ...singleFilerData, ...makeW2Data(agi) });
    expect(get(factGraph, `/scheduleASaltLimit`).get.toString()).toBe(expected);
  });
  it.each([
    [200000, `20200.00`], // half of $40,400
    [252500, `20200.00`], // at half threshold
    [302500, `12700.00`], // (40,400 − 30% × 50,000) / 2
    [500000, `5000.00`], // half of the $10,000 floor
  ])(`MFS, AGI %i → SALT limit %s`, (agi, expected) => {
    const { factGraph } = setupFactGraph({ ...mfsFilerData, ...makeW2Data(agi) });
    expect(get(factGraph, `/scheduleASaltLimit`).get.toString()).toBe(expected);
  });
});

describe(`Itemized vs. standard deduction`, () => {
  const base = (wages: number) => ({
    ...Object.fromEntries(
      Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
    ),
    ...baseFilerData,
    ...makeW2Data(wages),
  });
  const items = (o: Record<string, string>, elect = false, unsupported = false) => ({
    '/scheduleAWantsToItemize': createBooleanWrapper(true),
    '/scheduleAWritableMedical': createDollarWrapper(o.medical ?? `0`),
    '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(o.income ?? `0`),
    '/scheduleAWritableRealEstateTaxes': createDollarWrapper(o.realEstate ?? `0`),
    '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
    '/scheduleAWritableMortgageInterest': createDollarWrapper(o.mortgage ?? `0`),
    '/scheduleAWritableCashGifts': createDollarWrapper(o.cash ?? `0`),
    '/scheduleAWritableElectsToItemize': createBooleanWrapper(elect),
    '/scheduleAHasUnsupportedItems': createBooleanWrapper(unsupported),
  });

  it(`itemized $24,500 > standard $18,150 → itemizes; Form 1040 line 12 = $24,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleALine18`, `/itemizesDeductions`, `/standardOrItemizedDeductions`];
    // SALT 8,000 + 6,000 = 14,000; mortgage 9,000; cash 2,000 − 0.5% × 100,000 = 1,500 → 24,500
    const { factGraph } = setupFactGraph({
      ...base(100000),
      ...items({ income: `8000`, realEstate: `6000`, mortgage: `9000`, cash: `2000` }),
    });
    expect(get(factGraph, `/scheduleALine13`).get.toString()).toBe(`1500.00`);
    expect(get(factGraph, `/scheduleALine18`).get.toString()).toBe(`24500.00`);
    expect(get(factGraph, `/itemizesDeductions`).get).toBe(true);
    expect(get(factGraph, `/standardOrItemizedDeductions`).get.toString()).toBe(`24500.00`);
    expect(get(factGraph, `/totalTax`).complete).toBe(true);
    expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`itemized $5,500 < standard $18,150 → standard deduction`, () => {
    const { factGraph } = setupFactGraph({ ...base(100000), ...items({ income: `5000`, cash: `1000` }) });
    expect(get(factGraph, `/scheduleALine18`).get.toString()).toBe(`5500.00`);
    expect(get(factGraph, `/itemizesDeductions`).get).toBe(false);
    // fixture filer is 65+: $16,100 + $2,050 additional amount (unmarried), Rev. Proc. 2025-32 p. 18
    expect(get(factGraph, `/standardOrItemizedDeductions`).get.toString()).toBe(`18150.00`);
  });
  it(`elects to itemize (Schedule A line 19) even though smaller → $5,500`, () => {
    const { factGraph } = setupFactGraph({ ...base(100000), ...items({ income: `5000`, cash: `1000` }, true) });
    expect(get(factGraph, `/itemizesDeductions`).get).toBe(true);
    expect(get(factGraph, `/standardOrItemizedDeductions`).get.toString()).toBe(`5500.00`);
  });
  it(`did not want to itemize → standard deduction, total tax complete`, () => {
    const { factGraph } = setupFactGraph(base(100000));
    // fixture filer is 65+: $16,100 + $2,050 additional amount (unmarried), Rev. Proc. 2025-32 p. 18
    expect(get(factGraph, `/standardOrItemizedDeductions`).get.toString()).toBe(`18150.00`);
    expect(get(factGraph, `/totalTax`).complete).toBe(true);
  });
  it.each([
    [`9000`, `1500.00`], // 9,000 − 7.5% × 100,000
    [`7500`, `0.00`], // at the floor
    [`7000`, `0.00`], // below the floor
  ])(`medical floor (§213(a) 7.5%): AGI $100,000, expenses %s → line 4 %s`, (medical, expected) => {
    const { factGraph } = setupFactGraph({ ...base(100000), ...items({ medical }) });
    expect(get(factGraph, `/scheduleALine4`).get.toString()).toBe(expected);
  });
  it.each([
    [`/flowKnockoutScheduleAUnsupported`, () => items({}, false, true), 100000],
    [`/flowKnockoutScheduleACharitableLimit`, () => items({ cash: `70000` }), 100000],
    [`/flowKnockoutScheduleAOverallLimit`, () => items({ income: `20000`, mortgage: `20000` }), 400000],
  ] as const)(`%s blocks submission`, (knockout, data, wages) => {
    const { factGraph } = setupFactGraph({ ...base(wages), ...data() });
    expect(get(factGraph, knockout).get).toBe(true);
    expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(knockout);
  });
});
