import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper, createStringWrapper } from '../persistenceWrappers.js';
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
const loan = (interest: string, o: Record<string, boolean> = {}) => ({
  '/carLoanHadInterest': createBooleanWrapper(true),
  '/carLoanIsNewVehicle': createBooleanWrapper(o.isNew ?? true),
  '/carLoanUsAssembly': createBooleanWrapper(o.us ?? true),
  '/carLoanAfter2024': createBooleanWrapper(o.after2024 ?? true),
  '/carLoanHasBusinessUse': createBooleanWrapper(o.business ?? false),
  '/carLoanIsLease': createBooleanWrapper(o.lease ?? false),
  '/carLoanHasOtherExceptions': createBooleanWrapper(o.other ?? false),
  '/carLoanVin': createStringWrapper(VIN),
  '/carLoanWritableInterest': createDollarWrapper(interest),
});
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
});
