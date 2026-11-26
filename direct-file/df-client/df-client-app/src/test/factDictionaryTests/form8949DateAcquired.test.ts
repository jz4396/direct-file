import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { singleFilerData } from '../testData.js';

/**
 * Form 8949 instr. (2025) p. 6, Column (b):
 * "Inherited property. Generally, if you disposed of property that you acquired by inheritance, report the sale or
 * exchange on Part II with the appropriate box checked D, E, F, J, K, or L. Enter "INHERITED" in column (b)."
 * "If you sold a block of stock or digital assets ... that you acquired through several different purchases, you may
 * report the sale on one row and enter "VARIOUS" in column (b). However, you must still report the short-term gain
 * (or loss) on the sale on Part I and the long-term gain (or loss) on Part II."
 * 26 U.S.C. 1223(9): inherited property is treated as held more than one year.
 *
 * Dollar amounts below are the existing dated-row examples (short-term 10,000 - 6,000 = 4,000; long-term
 * 15,000 - 10,000 = 5,000). The instructions do not give amounts for VARIOUS or INHERITED.
 */
const tx1 = `a1111111-1111-4111-8111-111111111111`;
const tx2 = `a2222222-2222-4222-8222-222222222222`;
const K = `/flowKnockoutForm8949DateAcquiredVariousOrInherited`;
const KIND = `/form8949DateAcquiredKindOptions`;
const HOLD = `/form8949HoldingPeriodOptions`;
const BOX = `/form8949BoxOptions`;

const row = (
  id: string,
  opts: {
    kind?: string;
    holdingPeriod?: string;
    box: string;
    acquired?: string;
    sold: string;
    proceeds: string;
    costBasis: string;
  }
) => {
  const data: Record<string, unknown> = {
    [`/form8949Transactions/#${id}/description`]: createStringWrapper(`100 sh Example`),
    [`/form8949Transactions/#${id}/dateSold`]: createDayWrapper(opts.sold),
    [`/form8949Transactions/#${id}/proceeds`]: createDollarWrapper(opts.proceeds),
    [`/form8949Transactions/#${id}/costBasis`]: createDollarWrapper(opts.costBasis),
    [`/form8949Transactions/#${id}/box`]: createEnumWrapper(opts.box, BOX),
    [`/form8949Transactions/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  };
  if (opts.acquired !== undefined) {
    data[`/form8949Transactions/#${id}/dateAcquired`] = createDayWrapper(opts.acquired);
  }
  if (opts.kind !== undefined) {
    data[`/form8949Transactions/#${id}/dateAcquiredKind`] = createEnumWrapper(opts.kind, KIND);
  }
  if (opts.holdingPeriod !== undefined) {
    data[`/form8949Transactions/#${id}/holdingPeriod`] = createEnumWrapper(opts.holdingPeriod, HOLD);
  }
  return data;
};

const fg = (ids: string[], facts: Record<string, unknown>) =>
  setupFactGraph({
    ...singleFilerData,
    '/form8949Transactions': createCollectionWrapper(ids),
    '/form8949TransactionsIsDone': createBooleanWrapper(true),
    ...facts,
  }).factGraph;

const get = (g: ReturnType<typeof fg>, p: string) => g.get(p as ConcretePath);
const money = (g: ReturnType<typeof fg>, p: string) => get(g, p).get.toString();

describe(`Form 8949 column (b) VARIOUS and INHERITED`, () => {
  it(`no rows: the lifted knockout is false`, ({ task }) => {
    task.meta.testedFactPaths = [K, `/flowIsKnockedOut`];
    const g = fg([], {});
    expect(get(g, K).complete).toBe(true);
    expect(get(g, K).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`INHERITED sold two months after death is Part II and prints INHERITED`, ({ task }) => {
    // Death 2026-04-06 is not a fact. Sale 2026-06-06 is two months later. The holding-period answer is short-term,
    // which is what a two-month holding would be. 26 U.S.C. 1223(9); Form 8949 instr. (2025) p. 6, Column (b).
    task.meta.testedFactPaths = [
      `/form8949Transactions/*/dateAcquiredIsInherited`,
      `/form8949Transactions/*/isLongTerm`,
      `/form8949Transactions/*/isShortTerm`,
      `/form8949Transactions/*/printPartIIDateAcquiredText`,
      `/form8949Transactions/*/printPartIDateAcquiredText`,
      `/form8949Transactions/*/printPartIIDateAcquired`,
      `/form8949Transactions/*/printPartIIDateSold`,
      `/form8949Transactions/*/longTermGainOrLoss`,
      `/form8949Transactions/*/shortTermGainOrLoss`,
      `/form8949Transactions/*/hasBoxHoldingPeriodMismatch`,
      `/scheduleDLine8b`,
      `/scheduleDLine1b`,
      K,
    ];
    const g = fg(
      [tx1],
      row(tx1, {
        kind: `inherited`,
        holdingPeriod: `shortTerm`,
        box: `D`,
        acquired: `2020-01-01`,
        sold: `2026-06-06`,
        proceeds: `15000`,
        costBasis: `10000`,
      })
    );
    const p = `/form8949Transactions/#${tx1}`;
    expect(get(g, `${p}/dateAcquiredIsInherited`).get).toBe(true);
    expect(get(g, `${p}/isLongTerm`).get).toBe(true);
    expect(get(g, `${p}/isShortTerm`).get).toBe(false);
    expect(get(g, `${p}/hasBoxHoldingPeriodMismatch`).get).toBe(false);
    expect(get(g, `${p}/printPartIIDateAcquiredText`).get).toBe(`INHERITED`);
    expect(get(g, `${p}/printPartIDateAcquiredText`).complete).toBe(false);
    expect(get(g, `${p}/printPartIIDateAcquired`).complete).toBe(false);
    expect(get(g, `${p}/printPartIIDateSold`).complete).toBe(true);
    expect(money(g, `${p}/longTermGainOrLoss`)).toBe(`5000.00`);
    expect(money(g, `${p}/shortTermGainOrLoss`)).toBe(`0.00`);
    expect(money(g, `/scheduleDLine8b`)).toBe(`5000.00`);
    expect(money(g, `/scheduleDLine1b`)).toBe(`0.00`);
    expect(get(g, K).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`INHERITED is complete without a holding-period answer`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8949Transactions/*/isComplete`, `/form8949Transactions/*/isLongTerm`];
    const g = fg(
      [tx1],
      row(tx1, {
        kind: `inherited`,
        box: `D`,
        sold: `2026-06-06`,
        proceeds: `15000`,
        costBasis: `10000`,
      })
    );
    const p = `/form8949Transactions/#${tx1}`;
    expect(get(g, `${p}/isLongTerm`).get).toBe(true);
    expect(get(g, `${p}/isComplete`).get).toBe(true);
    expect(get(g, `${p}/printPartIIDateAcquiredText`).get).toBe(`INHERITED`);
  });

  it(`VARIOUS short-term is Part I and prints VARIOUS`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8949Transactions/*/dateAcquiredIsVarious`,
      `/form8949Transactions/*/isShortTerm`,
      `/form8949Transactions/*/printPartIDateAcquiredText`,
      `/form8949Transactions/*/printPartIDateAcquired`,
      `/form8949Transactions/*/printPartIDateSold`,
      `/form8949Transactions/*/shortTermGainOrLoss`,
      `/scheduleDLine1b`,
      `/scheduleDLine8b`,
    ];
    const g = fg(
      [tx1],
      row(tx1, {
        kind: `various`,
        holdingPeriod: `shortTerm`,
        box: `A`,
        acquired: `2026-02-02`,
        sold: `2026-05-05`,
        proceeds: `10000`,
        costBasis: `6000`,
      })
    );
    const p = `/form8949Transactions/#${tx1}`;
    expect(get(g, `${p}/dateAcquiredIsVarious`).get).toBe(true);
    expect(get(g, `${p}/isShortTerm`).get).toBe(true);
    expect(get(g, `${p}/isLongTerm`).get).toBe(false);
    expect(get(g, `${p}/printPartIDateAcquiredText`).get).toBe(`VARIOUS`);
    expect(get(g, `${p}/printPartIDateAcquired`).complete).toBe(false);
    expect(get(g, `${p}/printPartIIDateAcquiredText`).complete).toBe(false);
    expect(get(g, `${p}/printPartIDateSold`).complete).toBe(true);
    expect(money(g, `${p}/shortTermGainOrLoss`)).toBe(`4000.00`);
    expect(money(g, `${p}/longTermGainOrLoss`)).toBe(`0.00`);
    expect(money(g, `/scheduleDLine1b`)).toBe(`4000.00`);
    expect(money(g, `/scheduleDLine8b`)).toBe(`0.00`);
    expect(get(g, K).get).toBe(false);
  });

  it(`VARIOUS long-term is Part II and prints VARIOUS`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8949Transactions/*/printPartIIDateAcquiredText`,
      `/form8949Transactions/*/isLongTerm`,
      `/form8949Transactions/*/longTermGainOrLoss`,
      `/scheduleDLine8b`,
      `/scheduleDLine1b`,
    ];
    const g = fg(
      [tx1],
      row(tx1, {
        kind: `various`,
        holdingPeriod: `longTerm`,
        box: `D`,
        sold: `2026-07-01`,
        proceeds: `15000`,
        costBasis: `10000`,
      })
    );
    const p = `/form8949Transactions/#${tx1}`;
    expect(get(g, `${p}/isLongTerm`).get).toBe(true);
    expect(get(g, `${p}/isShortTerm`).get).toBe(false);
    expect(get(g, `${p}/printPartIIDateAcquiredText`).get).toBe(`VARIOUS`);
    expect(get(g, `${p}/printPartIDateAcquiredText`).complete).toBe(false);
    expect(get(g, `${p}/printPartIIDateAcquired`).complete).toBe(false);
    expect(money(g, `${p}/longTermGainOrLoss`)).toBe(`5000.00`);
    expect(money(g, `${p}/shortTermGainOrLoss`)).toBe(`0.00`);
    expect(money(g, `/scheduleDLine8b`)).toBe(`5000.00`);
    expect(money(g, `/scheduleDLine1b`)).toBe(`0.00`);
  });

  it(`a dated row is unchanged, answered or left on the date placeholder`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8949Transactions/*/printPartIDateAcquired`,
      `/form8949Transactions/*/printPartIDateAcquiredText`,
      `/form8949Transactions/*/dateAcquiredIsVarious`,
      `/form8949Transactions/*/dateAcquiredIsInherited`,
      `/scheduleDLine1b`,
      `/scheduleDLine7`,
    ];
    const dated = {
      kind: `date` as const,
      holdingPeriod: `shortTerm`,
      box: `A`,
      acquired: `2026-02-02`,
      sold: `2026-05-05`,
      proceeds: `10000`,
      costBasis: `6000`,
    };
    const answered = fg([tx1], row(tx1, dated));
    const unanswered = fg(
      [tx2],
      row(tx2, {
        holdingPeriod: `shortTerm`,
        box: `A`,
        acquired: `2026-02-02`,
        sold: `2026-05-05`,
        proceeds: `10000`,
        costBasis: `6000`,
      })
    );
    for (const [g, id] of [
      [answered, tx1],
      [unanswered, tx2],
    ] as const) {
      const p = `/form8949Transactions/#${id}`;
      expect(get(g, `${p}/dateAcquiredIsVarious`).get).toBe(false);
      expect(get(g, `${p}/dateAcquiredIsInherited`).get).toBe(false);
      expect(get(g, `${p}/isShortTerm`).get).toBe(true);
      expect(get(g, `${p}/printPartIDateAcquired`).complete).toBe(true);
      expect(get(g, `${p}/printPartIDateAcquired`).get.toString()).toBe(`2026-02-02`);
      expect(get(g, `${p}/printPartIDateAcquiredText`).complete).toBe(false);
      expect(money(g, `/scheduleDLine1b`)).toBe(`4000.00`);
      expect(money(g, `/scheduleDLine7`)).toBe(`4000.00`);
      expect(get(g, K).get).toBe(false);
    }
  });
});
