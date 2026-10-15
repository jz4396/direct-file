import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  mfjFilerData,
  mfsFilerData,
  singleFilerData,
} from '../testData.js';

/**
 * #53: IRC §163(h)(4) qualified passenger vehicle loan interest, Schedule 1-A (2026 draft) Part IV lines 28-36.
 * $10,000 cap (C)(i); reduced "by $200 for each $1,000 (or portion thereof)" of MAGI over $100,000 ($200,000 joint)
 * (C)(ii)(I); line 34 rounds up to the next whole number.
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
const build = (status: Record<string, unknown>, wages: number, extra: Record<string, unknown> = {}) =>
  setupFactGraph({ ...noW2, ...baseFilerData, ...status, ...makeW2Data(wages), ...extra }).factGraph;
const VIN = `1HGCM82633A004352`;
const V1 = `c1111111-1111-4111-8111-111111111111`;
const V2 = `c2222222-2222-4222-8222-222222222222`;
// Synthetic VINs only (17 chars, no I/O/Q).
const VINS: Record<string, string> = { [V1]: VIN, [V2]: `2T1BR32E54C000001` };
const vehicle = (id: string, interest: string, o: Record<string, boolean> = {}) => ({
  [`/carLoans/#${id}/isNewVehicle`]: createBooleanWrapper(o.isNew ?? true),
  [`/carLoans/#${id}/usAssembly`]: createBooleanWrapper(o.us ?? true),
  [`/carLoans/#${id}/after2024`]: createBooleanWrapper(o.after2024 ?? true),
  [`/carLoans/#${id}/hasBusinessUse`]: createBooleanWrapper(o.business ?? false),
  [`/carLoans/#${id}/isLease`]: createBooleanWrapper(o.lease ?? false),
  [`/carLoans/#${id}/hasOtherExceptions`]: createBooleanWrapper(o.other ?? false),
  [`/carLoans/#${id}/vin`]: createStringWrapper(VINS[id]),
  [`/carLoans/#${id}/writableInterest`]: createDollarWrapper(interest),
});
const vehicles = (...vs: Record<string, unknown>[]) => ({
  '/carLoanHadInterest': createBooleanWrapper(true),
  '/carLoans': createCollectionWrapper([V1, V2].slice(0, vs.length)),
  ...Object.assign({}, ...vs),
});
const loan = (interest: string, o: Record<string, boolean> = {}) => vehicles(vehicle(V1, interest, o));
const line36 = (fg: Fg) => get(fg, `/schedule1ALine36`).get.toString();

describe(`§163(h)(4) car loan interest (#53)`, () => {
  it(`unanswered gate: $0, return complete, no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine36`, `/flowIsKnockedOut`];
    const fg = build(singleFilerData, 60000);
    expect(get(fg, `/schedule1ALine36`).complete).toBe(true);
    expect(line36(fg)).toBe(`0.00`);
    expect(get(fg, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`gate yes with questions unanswered stays incomplete (no silent $0)`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine36`];
    const fg = build(singleFilerData, 60000, { '/carLoanHadInterest': createBooleanWrapper(true) });
    expect(get(fg, `/schedule1ALine36`).complete).toBe(false);
  });

  it(`$4,000 interest flows to line 36, line 44 and line 13a`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine36`, `/schedule1ALine44`, `/totalDeductions`];
    const none = build(singleFilerData, 60000);
    const fg = build(singleFilerData, 60000, loan(`4000`));
    expect(line36(fg)).toBe(`4000.00`);
    expect(
      Number(get(fg, `/totalDeductions`).get.toString()) - Number(get(none, `/totalDeductions`).get.toString())
    ).toBe(4000);
    expect(get(fg, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`capped at $10,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/carLoanLine30`, `/schedule1ALine36`];
    expect(line36(build(singleFilerData, 60000, loan(`14000`)))).toBe(`10000.00`);
  });

  it.each([
    [100000, `10000.00`], // at threshold: no reduction
    [100001, `9800.00`], // $1 over is a "portion" of $1,000: -$200
    [101000, `9800.00`], // exactly $1,000 over: -$200
    [101001, `9600.00`], // just over: -$400
    [149001, `0.00`], // 49.001 -> 50 x $200 = $10,000
    [160000, `0.00`], // not below zero
  ])(`single, MAGI %i -> line 36 %s`, (wages, expected) => {
    const fg = build(singleFilerData, wages, loan(`12000`));
    expect(get(fg, `/schedule1ALine3`).get.toString()).toBe(`${wages}.00`);
    expect(line36(fg)).toBe(expected);
  });

  it.each([
    [200000, `10000.00`],
    [200500, `9800.00`],
    [210000, `8000.00`],
  ])(`MFJ, MAGI %i -> line 36 %s ($200,000 threshold)`, (wages, expected) => {
    expect(line36(build(mfjFilerData, wages, loan(`10000`)))).toBe(expected);
  });

  it(`MFS is allowed, with the $100,000 threshold`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine36`, `/carLoanLine32`];
    const fg = build(mfsFilerData, 100500, loan(`5000`));
    expect(get(fg, `/carLoanLine32`).get.toString()).toBe(`100000.00`);
    expect(line36(fg)).toBe(`4800.00`);
  });

  it.each([
    [`not US final assembly`, { us: false }],
    [`loan before 2025`, { after2024: false }],
  ])(`%s: not QPVLI, $0 (statutory exclusion, not a stop)`, (_label, o) => {
    const fg = build(singleFilerData, 60000, loan(`4000`, o));
    expect(line36(fg)).toBe(`0.00`);
    expect(get(fg, `/flowIsKnockedOut`).get).toBe(false);
  });

  it.each([
    [`used vehicle`, `/flowKnockoutCarLoanUsedVehicle`, { isNew: false }],
    [`business use`, `/flowKnockoutCarLoanBusinessUse`, { business: true }],
    [`lease`, `/flowKnockoutCarLoanLease`, { lease: true }],
    [`other exception`, `/flowKnockoutCarLoanOther`, { other: true }],
  ])(`knockout: %s`, (_label, ko, o) => {
    const clean = build(singleFilerData, 60000, loan(`4000`));
    expect(get(clean, ko).get).toBe(false);
    const fg = build(singleFilerData, 60000, loan(`4000`, o));
    expect(get(fg, ko).get).toBe(true);
    expect(get(fg, `/flowIsKnockedOut`).get).toBe(true);
  });

  describe(`#69 multiple vehicles (cap and phaseout per return)`, () => {
    it(`gate yes with an empty vehicle list stays incomplete (no silent $0)`, ({ task }) => {
      task.meta.testedFactPaths = [`/carLoanLine29`, `/schedule1ALine36`];
      const fg = build(singleFilerData, 60000, {
        '/carLoanHadInterest': createBooleanWrapper(true),
        '/carLoans': createCollectionWrapper([]),
      });
      expect(get(fg, `/carLoanLine29`).complete).toBe(false);
      expect(get(fg, `/schedule1ALine36`).complete).toBe(false);
    });

    it(`two vehicles sum on line 29`, ({ task }) => {
      task.meta.testedFactPaths = [`/carLoanLine29`, `/schedule1ALine36`];
      const fg = build(singleFilerData, 60000, vehicles(vehicle(V1, `3000`), vehicle(V2, `2500`)));
      expect(get(fg, `/carLoanLine29`).get.toString()).toBe(`5500.00`);
      expect(line36(fg)).toBe(`5500.00`);
    });

    it(`two vehicles over the cap: $10,000 per return, not per vehicle`, ({ task }) => {
      task.meta.testedFactPaths = [`/carLoanLine29`, `/carLoanLine30`, `/schedule1ALine36`];
      const fg = build(singleFilerData, 60000, vehicles(vehicle(V1, `7000`), vehicle(V2, `6000`)));
      expect(get(fg, `/carLoanLine29`).get.toString()).toBe(`13000.00`);
      expect(line36(fg)).toBe(`10000.00`);
    });

    it(`phaseout applies once to the combined amount`, ({ task }) => {
      task.meta.testedFactPaths = [`/carLoanLine35`, `/schedule1ALine36`];
      // MAGI $110,500: 10.5 -> 11 x $200 = $2,200 off min($4,000 + $3,000, $10,000) = $7,000.
      const fg = build(singleFilerData, 110500, vehicles(vehicle(V1, `4000`), vehicle(V2, `3000`)));
      expect(get(fg, `/carLoanLine35`).get.toString()).toBe(`2200.00`);
      expect(line36(fg)).toBe(`4800.00`);
    });

    it(`one eligible vehicle and one non-QPVLI vehicle: only the eligible interest counts`, ({ task }) => {
      task.meta.testedFactPaths = [`/schedule1ALine36`, `/flowIsKnockedOut`];
      const fg = build(singleFilerData, 60000, vehicles(vehicle(V1, `4000`), vehicle(V2, `3000`, { us: false })));
      expect(line36(fg)).toBe(`4000.00`);
      expect(get(fg, `/flowIsKnockedOut`).get).toBe(false);
    });

    it.each([
      [`used vehicle`, `/flowKnockoutCarLoanUsedVehicle`, { isNew: false }],
      [`business use`, `/flowKnockoutCarLoanBusinessUse`, { business: true }],
      [`lease`, `/flowKnockoutCarLoanLease`, { lease: true }],
      [`other exception`, `/flowKnockoutCarLoanOther`, { other: true }],
    ])(`one eligible vehicle and one stopped (%s): the return is knocked out`, (_label, ko, o) => {
      const fg = build(singleFilerData, 60000, vehicles(vehicle(V1, `4000`), vehicle(V2, `3000`, o)));
      expect(get(fg, ko).get).toBe(true);
      expect(get(fg, `/flowIsKnockedOut`).get).toBe(true);
    });
  });
});
