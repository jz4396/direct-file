import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createCollectionWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import { baseFilerData, makeW2Data, mfjFilerData, mfsFilerData, singleFilerData } from '../testData.js';

/**
 * #51 Schedule 1-A Part II — qualified tips deduction, IRC §224 (P.L. 119-21 §70201).
 * 2026 draft Schedule 1-A: line 9 = smaller of line 8 or $25,000; line 11 = $150,000 ($300,000 MFJ);
 * line 13 = line 12 / $1,000 "decrease the result to the next lower whole number"; line 14 = line 13 × $100;
 * line 15 = line 9 − line 14, not below 0. Tips come from Form W-2 box 12 code TP (new for 2026).
 */
const W2 = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const tips = (amt: string) => ({ [`/formW2s/#${W2}/cashTipsCodeTP`]: createDollarWrapper(amt) });
const yes = { '/tipsOccupationConfirmed': createBooleanWrapper(true) };
const get = (fg: ReturnType<typeof setupFactGraph>['factGraph'], p: string) => fg.get(p as ConcretePath).get.toString();
const single = (wages: number, tp: string, extra = {}) =>
  setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(wages), ...tips(tp), ...yes, ...extra })
    .factGraph;

describe(`Schedule 1-A Part II — qualified tips`, () => {
  it(`tips below the cap, MAGI below threshold: full amount; flows to line 44 and total deductions`, () => {
    const fg = single(60000, `8000`);
    expect(get(fg, `/schedule1ALine15`)).toBe(`8000.00`);
    expect(get(fg, `/schedule1ALine44`)).toBe(`8000.00`);
  });

  it(`occupation not confirmed (or never asked): $0`, () => {
    const fg = single(60000, `8000`, { '/tipsOccupationConfirmed': createBooleanWrapper(false) });
    expect(get(fg, `/schedule1ALine15`)).toBe(`0.00`);
    const { factGraph: none } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(60000) });
    expect(get(none, `/schedule1ALine15`)).toBe(`0.00`);
    expect(none.get(`/hasW2CodeTpTips` as ConcretePath).get).toBe(false);
  });

  it(`cap: $40,000 of TP tips → line 9 $25,000`, () => {
    const fg = single(100000, `40000`);
    expect(get(fg, `/schedule1ALine9`)).toBe(`25000.00`);
    expect(get(fg, `/schedule1ALine15`)).toBe(`25000.00`);
  });

  it(`MAGI exactly $150,000 (at threshold): no reduction`, () => {
    const fg = single(150000, `10000`);
    expect(get(fg, `/schedule1ALine14`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine15`)).toBe(`10000.00`);
  });

  it(`MAGI $150,999 (partial $1,000 only): line 13 rounds down to 0 → no reduction`, () => {
    const fg = single(150999, `10000`);
    expect(get(fg, `/schedule1ALine13`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine15`)).toBe(`10000.00`);
  });

  it(`MAGI $175,500 (above): line 13 = 25 (25.5 rounded down) → line 14 $2,500 → $7,500`, () => {
    const fg = single(175500, `10000`);
    expect(get(fg, `/schedule1ALine13`)).toBe(`25.00`);
    expect(get(fg, `/schedule1ALine14`)).toBe(`2500.00`);
    expect(get(fg, `/schedule1ALine15`)).toBe(`7500.00`);
  });

  it(`cap applies before the phase-out: $40,000 tips, MAGI $200,000 → 25,000 − 5,000 = $20,000`, () => {
    expect(get(single(200000, `40000`), `/schedule1ALine15`)).toBe(`20000.00`);
  });

  it(`full phase-out: $10,000 tips, MAGI $260,000 → $0`, () => {
    expect(get(single(260000, `10000`), `/schedule1ALine15`)).toBe(`0.00`);
  });

  it(`MFJ: threshold $300,000; $10,000 tips at MAGI $310,000 → $9,000`, () => {
    const { factGraph } = setupFactGraph({
      ...baseFilerData,
      ...mfjFilerData,
      ...makeW2Data(310000),
      ...tips(`10000`),
      ...yes,
    });
    expect(get(factGraph, `/schedule1ALine11`)).toBe(`300000.00`);
    expect(get(factGraph, `/schedule1ALine15`)).toBe(`9000.00`);
  });

  it(`MFS: married must file jointly → $0 (§224(f))`, () => {
    const { factGraph } = setupFactGraph({
      ...baseFilerData,
      ...mfsFilerData,
      ...makeW2Data(40000),
      ...tips(`5000`),
      ...yes,
    });
    expect(get(factGraph, `/schedule1ALine15`)).toBe(`0.00`);
  });
});

describe(`Schedule 1-A Part II — knockouts`, () => {
  it(`SSTB answer with a confirmed listed occupation: no knockout under the p.102 interim rule (#57)`, () => {
    const clean = single(60000, `8000`);
    expect(clean.get(`/flowKnockoutTipsSstb` as ConcretePath).get).toBe(false);
    expect(clean.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
    const sstb = single(60000, `8000`, { '/tipsEmployerIsSstb': createBooleanWrapper(true) });
    expect(sstb.get(`/flowKnockoutTipsSstb` as ConcretePath).get).toBe(false);
    expect(sstb.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
    expect(get(sstb, `/schedule1ALine15`)).toBe(`8000.00`);
  });

  it(`self-employed tips with a Schedule C business: knocks out`, () => {
    const biz = { '/scheduleCBusinesses': createCollectionWrapper([`b1111111-1111-4111-8111-111111111111`]) };
    const clean = single(60000, `0`, biz);
    expect(clean.get(`/flowKnockoutSelfEmployedTips` as ConcretePath).get).toBe(false);
    const ko = single(60000, `0`, { ...biz, '/tipsFromSelfEmployment': createBooleanWrapper(true) });
    expect(ko.get(`/flowKnockoutSelfEmployedTips` as ConcretePath).get).toBe(true);
    expect(ko.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(true);
  });
});

/**
 * #57: §224(d)(2)(B) SSTB interim rule. Draft Form 1040 instructions (https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf),
 * Schedule 1-A Part II, p.102: "Until the issuance of final regulations determining whether a trade or business is an
 * SSTB for purposes of this deduction, and for taxable years beginning before the date the final regulations are
 * published, the IRS will treat employees and self-employed individuals as having received tips in the course of a
 * trade or business that is not an SSTB if the employee is in an occupation that customarily and regularly received
 * tips on or before December 31, 2024."
 */
describe(`Schedule 1-A Part II — SSTB interim rule (#57)`, () => {
  it(`interim rule applies; the SSTB question is not asked`, ({ task }) => {
    task.meta.testedFactPaths = [`/tipsSstbInterimRuleApplies`, `/flowShowTipsSstbQuestion`];
    const fg = single(60000, `8000`);
    expect(fg.get(`/tipsSstbInterimRuleApplies` as ConcretePath).get).toBe(true);
    expect(fg.get(`/flowShowTipsSstbQuestion` as ConcretePath).get).toBe(false);
  });

  it(`SSTB yes + listed occupation: full deduction, at the $25,000 cap edge`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine15`, `/flowKnockoutTipsSstb`];
    const sstb = { '/tipsEmployerIsSstb': createBooleanWrapper(true) };
    expect(get(single(100000, `25000`, sstb), `/schedule1ALine15`)).toBe(`25000.00`);
    expect(get(single(100000, `25001`, sstb), `/schedule1ALine15`)).toBe(`25000.00`);
    expect(single(100000, `25001`, sstb).get(`/flowKnockoutTipsSstb` as ConcretePath).get).toBe(false);
  });

  it(`SSTB yes + occupation not confirmed: $0 and no knockout (tips aren't qualified anyway)`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine15`, `/flowKnockoutTipsSstb`, `/flowIsKnockedOut`];
    const fg = single(60000, `8000`, {
      '/tipsOccupationConfirmed': createBooleanWrapper(false),
      '/tipsEmployerIsSstb': createBooleanWrapper(true),
    });
    expect(get(fg, `/schedule1ALine15`)).toBe(`0.00`);
    expect(fg.get(`/flowShowTipsSstbQuestion` as ConcretePath).get).toBe(false);
    expect(fg.get(`/flowKnockoutTipsSstb` as ConcretePath).get).toBe(false);
    expect(fg.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
  });

  it(`no code TP tips: question hidden, no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowShowTipsSstbQuestion`, `/flowKnockoutTipsSstb`];
    const { factGraph } = setupFactGraph({
      ...baseFilerData,
      ...singleFilerData,
      ...makeW2Data(60000),
      '/tipsEmployerIsSstb': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/flowShowTipsSstbQuestion` as ConcretePath).get).toBe(false);
    expect(factGraph.get(`/flowKnockoutTipsSstb` as ConcretePath).get).toBe(false);
  });

  it(`the SSTB stop is still a submission-blocking fact for when the interim rule ends`, () => {
    expect(submissionBlockingFacts).toContain(`/flowKnockoutTipsSstb`);
  });
});
