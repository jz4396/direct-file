import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { singleFilerData } from '../testData.js';

/**
 * #39: Form 8949 print checkboxes, including G–L (Form 1099-DA digital assets).
 * Form 8949 instr. (2025) p. 3: "Check only one box on each Part I."; p. 4: "Check only one box on each Part II."
 */
const tx1 = `a3333333-3333-4333-8333-333333333333`;
const BOXES = [`A`, `B`, `C`, `D`, `E`, `F`, `G`, `H`, `I`, `J`, `K`, `L`];
const SHORT = new Set([`A`, `B`, `C`, `G`, `H`, `I`]);

describe(`Form 8949 print boxes (#39)`, () => {
  for (const box of BOXES) {
    it(`box ${box}: only printBox${box} is checked`, ({ task }) => {
      task.meta.testedFactPaths = BOXES.map((b) => `/form8949Transactions/*/printBox${b}`);
      const longTerm = !SHORT.has(box);
      const { factGraph } = setupFactGraph({
        ...singleFilerData,
        '/form8949Transactions': createCollectionWrapper([tx1]),
        [`/form8949Transactions/#${tx1}/description`]: createStringWrapper(`0.5 BTC`),
        [`/form8949Transactions/#${tx1}/dateAcquired`]: createDayWrapper(`2024-06-01`),
        [`/form8949Transactions/#${tx1}/dateSold`]: createDayWrapper(longTerm ? `2026-07-01` : `2024-12-01`),
        [`/form8949Transactions/#${tx1}/proceeds`]: createDollarWrapper(`10000`),
        [`/form8949Transactions/#${tx1}/costBasis`]: createDollarWrapper(`6000`),
        [`/form8949Transactions/#${tx1}/box`]: createEnumWrapper(box, `/form8949BoxOptions`),
        [`/form8949Transactions/#${tx1}/holdingPeriod`]: createEnumWrapper(
          longTerm ? `longTerm` : `shortTerm`,
          `/form8949HoldingPeriodOptions`
        ),
        [`/form8949Transactions/#${tx1}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
        '/form8949TransactionsIsDone': createBooleanWrapper(true),
      });
      const checked = BOXES.filter(
        (b) => factGraph.get(`/form8949Transactions/#${tx1}/printBox${b}` as ConcretePath).get === true
      );
      expect(checked).toEqual([box]);
    });
  }
});
