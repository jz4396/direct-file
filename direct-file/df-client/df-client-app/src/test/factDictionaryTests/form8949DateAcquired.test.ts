import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createCollectionWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { singleFilerData } from '../testData.js';

/**
 * #60: Form 8949 instr. (2025) p. 6, column (b): inherited property -> "Enter "INHERITED" in column (b)";
 * a block acquired "through several different purchases" -> "enter "VARIOUS" in column (b)".
 * Phase A: no free-text column (b) yet, so either case blocks submission (no made-up date).
 */
const tx1 = `a1111111-1111-4111-8111-111111111111`;
const tx2 = `a2222222-2222-4222-8222-222222222222`;
const K = `/flowKnockoutForm8949DateAcquiredVariousOrInherited`;
const fg = (flags: Record<string, boolean | undefined>) => {
  const data: Record<string, unknown> = {
    ...singleFilerData,
    '/form8949Transactions': createCollectionWrapper(Object.keys(flags)),
  };
  for (const [id, v] of Object.entries(flags)) {
    if (v !== undefined)
      data[`/form8949Transactions/#${id}/dateAcquiredIsVariousOrInherited`] = createBooleanWrapper(v);
  }
  return setupFactGraph(data).factGraph;
};
const get = (g: ReturnType<typeof fg>, p: string) => g.get(p as ConcretePath);

describe(`Form 8949 date acquired VARIOUS/INHERITED stop (#60)`, () => {
  it(`no rows: no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [K, `/flowIsKnockedOut`];
    const g = fg({});
    expect(get(g, K).get).toBe(false);
  });
  it(`flag unanswered defaults to a real date (placeholder false): no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [K];
    expect(get(fg({ [tx1]: undefined }), K).get).toBe(false);
  });
  it(`flag false: no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [K];
    expect(get(fg({ [tx1]: false }), K).get).toBe(false);
  });
  it(`one row VARIOUS/INHERITED: knocks out and /flowIsKnockedOut is true`, ({ task }) => {
    task.meta.testedFactPaths = [K, `/flowIsKnockedOut`];
    const g = fg({ [tx1]: false, [tx2]: true });
    expect(get(g, K).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
});
