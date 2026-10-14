import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createDayWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, makeW2Data, mfjFilerData, mfsFilerData, primaryFilerId, singleFilerData, spouseId } from '../testData.js';

/**
 * #50 Schedule 1-A Part V, enhanced deduction for seniors — IRC §151(d)(5)(C) (P.L. 119-21).
 * 2026 draft Schedule 1-A lines 37–44: line 41 = $6,000 − 6% × (MAGI − $75,000/$150,000 MFJ), not below 0;
 * 42a/42b require age 65 (born before January 2, 1962) and a valid SSN; line 44 → Form 1040 line 13a.
 */
const SENIOR = `1960-03-03`;
const primary65 = { [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(SENIOR) };
const spouse65 = { [`/filers/#${spouseId}/dateOfBirth`]: createDayWrapper(SENIOR) };
const get = (fg: ReturnType<typeof setupFactGraph>['factGraph'], p: string) => fg.get(p as ConcretePath).get.toString();

describe(`Schedule 1-A Part V — enhanced deduction for seniors`, () => {
  it(`single 65+, MAGI $50,000 (below threshold): $6,000, line 44 flows into total deductions`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule1ALine43`, `/schedule1ALine44`, `/totalDeductions`];
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...primary65, ...makeW2Data(50000) });
    const { factGraph: under65 } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...makeW2Data(50000) });
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`6000.00`);
    expect(get(factGraph, `/schedule1ALine44`)).toBe(`6000.00`);
    expect(get(under65, `/schedule1ALine44`)).toBe(`0.00`);
    const std = Number(get(factGraph, `/standardOrItemizedDeductions`));
    expect(Number(get(factGraph, `/totalDeductions`))).toBe(std + 6000);
  });

  it(`single 65+, MAGI exactly $75,000 (at threshold): no reduction, $6,000`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...primary65, ...makeW2Data(75000) });
    expect(get(factGraph, `/schedule1ALine39`)).toBe(`0.00`);
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`6000.00`);
  });

  it(`single 65+, MAGI $100,000 (above): 6% × 25,000 = 1,500 → $4,500`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...primary65, ...makeW2Data(100000) });
    expect(get(factGraph, `/schedule1ALine40`)).toBe(`1500.00`);
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`4500.00`);
  });

  it(`single 65+, MAGI $75,050: no rounding step, 6% × 50 = 3 → $5,997`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...primary65, ...makeW2Data(75050) });
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`5997.00`);
  });

  it(`single 65+, full phase-out at MAGI $175,000 and beyond → $0`, () => {
    for (const agi of [175000, 250000]) {
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...primary65, ...makeW2Data(agi) });
      expect(get(factGraph, `/schedule1ALine41`)).toBe(`0.00`);
      expect(get(factGraph, `/schedule1ALine44`)).toBe(`0.00`);
    }
  });

  it(`MFJ both 65+, MAGI $120,000: $6,000 each → $12,000`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...mfjFilerData, ...primary65, ...spouse65, ...makeW2Data(120000) });
    expect(get(factGraph, `/schedule1ALine42a`)).toBe(`6000.00`);
    expect(get(factGraph, `/schedule1ALine42b`)).toBe(`6000.00`);
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`12000.00`);
  });

  it(`MFJ both 65+, MAGI $200,000: each $6,000 − 6% × 50,000 = $3,000 → $6,000`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...mfjFilerData, ...primary65, ...spouse65, ...makeW2Data(200000) });
    expect(get(factGraph, `/schedule1ALine38`)).toBe(`150000.00`);
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`6000.00`);
  });

  it(`MFJ only spouse 65+: line 42a 0, 42b $6,000`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...mfjFilerData, ...spouse65, ...makeW2Data(90000) });
    expect(get(factGraph, `/schedule1ALine42a`)).toBe(`0.00`);
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`6000.00`);
  });

  it(`MFS 65+: married must file jointly → $0 (§151(d)(5)(C)(v))`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...mfsFilerData, ...primary65, ...makeW2Data(40000) });
    expect(get(factGraph, `/schedule1ALine43`)).toBe(`0.00`);
  });

  it(`age boundary: born 1962-01-01 qualifies (65 on Dec 31, 2026); born 1962-01-02 does not`, () => {
    const dob = (d: string) => ({ [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(d) });
    const { factGraph: yes } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...dob(`1962-01-01`), ...makeW2Data(50000) });
    const { factGraph: no } = setupFactGraph({ ...baseFilerData, ...singleFilerData, ...dob(`1962-01-02`), ...makeW2Data(50000) });
    expect(get(yes, `/schedule1ALine43`)).toBe(`6000.00`);
    expect(get(no, `/schedule1ALine43`)).toBe(`0.00`);
  });
});
