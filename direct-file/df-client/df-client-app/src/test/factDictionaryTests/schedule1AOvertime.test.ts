import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, makeW2Data, mfjFilerData, mfsFilerData, singleFilerData } from '../testData.js';

/**
 * #52 Schedule 1-A Part III — qualified overtime compensation, IRC §225 (P.L. 119-21 §70202).
 * 2026 draft Schedule 1-A: line 21 = smaller of line 20 or $12,500 ($25,000 MFJ); line 23 = $150,000 ($300,000 MFJ);
 * line 25 = line 24 / $1,000 "decrease the result to the next lower whole number"; line 26 = line 25 × $100;
 * line 27 = line 21 − line 26, not below 0. Amounts from Form W-2 box 12 code TT (new for 2026).
 */
const W2 = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const tt = (amt: string) => ({ [`/formW2s/#${W2}/qualifiedOvertimeCodeTT`]: createDollarWrapper(amt) });
const yes = { '/overtimeFlsaConfirmed': createBooleanWrapper(true) };
type FG = ReturnType<typeof setupFactGraph>['factGraph'];
const get = (fg: FG, p: string) => fg.get(p as ConcretePath).get.toString();
const complete = (fg: FG, p: string) => fg.get(p as ConcretePath).complete;
const single = (wages: number, amt: string, extra = {}) =>
  setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(wages), ...tt(amt), ...yes, ...extra }).factGraph;
const mfj = (wages: number, amt: string) =>
  setupFactGraph({ ...baseFilerData, ...mfjFilerData, ...makeW2Data(wages), ...tt(amt), ...yes }).factGraph;

describe(`Schedule 1-A Part III — qualified overtime`, () => {
  it(`below the cap, MAGI below threshold: full amount; flows to line 27 and line 44`, () => {
    const fg = single(70000, `4000`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`4000.00`);
    expect(get(fg, `/schedule1ALine44`)).toBe(`4000.00`);
  });

  it(`no overtime: complete $0 without asking`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(70000) });
    expect(factGraph.get(`/hasW2CodeTtOvertime` as ConcretePath).get).toBe(false);
    expect(complete(factGraph, `/schedule1AOvertimeLine27`)).toBe(true);
    expect(get(factGraph, `/schedule1AOvertimeLine27`)).toBe(`0.00`);
  });

  it(`FLSA premium not confirmed: $0`, () => {
    expect(get(single(70000, `4000`, { '/overtimeFlsaConfirmed': createBooleanWrapper(false) }), `/schedule1ALine27`)).toBe(`0.00`);
  });

  it(`cap: $20,000 of code TT → line 21 $12,500 (single)`, () => {
    const fg = single(100000, `20000`);
    expect(get(fg, `/schedule1AOvertimeLine21`)).toBe(`12500.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`12500.00`);
  });

  it(`MAGI exactly $150,000 (at threshold): no reduction`, () => {
    const fg = single(150000, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine26`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`10000.00`);
  });

  it(`MAGI $150,999 (partial $1,000 only): line 25 rounds down to 0 → no reduction`, () => {
    const fg = single(150999, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine25`)).toBe(`0.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`10000.00`);
  });

  it(`MAGI $175,500 (above): line 25 = 25 (25.5 rounded down) → line 26 $2,500 → $7,500`, () => {
    const fg = single(175500, `10000`);
    expect(get(fg, `/schedule1AOvertimeLine25`)).toBe(`25.00`);
    expect(get(fg, `/schedule1AOvertimeLine26`)).toBe(`2500.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`7500.00`);
  });

  it(`cap applies before the phase-out: $20,000 TT, MAGI $200,000 → 12,500 − 5,000 = $7,500`, () => {
    expect(get(single(200000, `20000`), `/schedule1ALine27`)).toBe(`7500.00`);
  });

  it(`full phase-out: $10,000 TT, MAGI $260,000 → $0`, () => {
    expect(get(single(260000, `10000`), `/schedule1ALine27`)).toBe(`0.00`);
  });

  it(`MFJ: cap $25,000 and threshold $300,000; $30,000 TT at MAGI $310,500 → 25,000 − 1,000 = $24,000`, () => {
    const fg = mfj(310500, `30000`);
    expect(get(fg, `/schedule1AOvertimeLine21`)).toBe(`25000.00`);
    expect(get(fg, `/schedule1AOvertimeLine23`)).toBe(`300000.00`);
    expect(get(fg, `/schedule1ALine27`)).toBe(`24000.00`);
  });

  it(`MFS: married must file jointly → $0 (§225(e))`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...mfsFilerData, ...makeW2Data(60000), ...tt(`5000`), ...yes });
    expect(get(factGraph, `/schedule1ALine27`)).toBe(`0.00`);
  });
});

describe(`Schedule 1-A Part III — knockout for overtime not on W-2 code TT`, () => {
  it(`overtime on a 1099 or from pay records: knocks out and blocks submission; clean return is not knocked out`, () => {
    const clean = single(70000, `4000`, { '/overtimeNotOnW2CodeTT': createBooleanWrapper(false) });
    expect(clean.get(`/flowKnockoutOvertimeNotOnW2CodeTT` as ConcretePath).get).toBe(false);
    expect(clean.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(false);
    const ko = single(70000, `0`, { '/overtimeNotOnW2CodeTT': createBooleanWrapper(true) });
    expect(ko.get(`/flowKnockoutOvertimeNotOnW2CodeTT` as ConcretePath).get).toBe(true);
    expect(ko.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(true);
  });
});
