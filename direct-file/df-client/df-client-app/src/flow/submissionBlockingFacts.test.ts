import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { FactGraph } from '@irs/js-factgraph-scala';
import {
  submissionBlockingFacts,
  submissionBlockingFactsRequiringValue,
} from '../fact-dictionary/generated/submissionBlockingFacts.js';
import { Condition, submissionBlockingFactPaths } from './Condition.js';
import { setupFactGraph } from '../test/setupFactGraph.js';

// The backend reads the same dictionary and holds the same golden return (#181).
const BACKEND = path.resolve(__dirname, `../../../../backend`);
const TAX_XML = path.join(BACKEND, `src/main/resources/tax`);
const GOLDEN = path.join(BACKEND, `src/test/resources/submission-blocking/golden-profile5-complete.json`);

const INVALID_TIN = `/familyAndHouseholdHasInvalidTIN`;
const KNOCKED_OUT = `/flowIsKnockedOut`;
const STATE_RETURN_KNOCKOUT = `/flowKnockoutStateReturn`;
const W2_VALIDATION_ERRORS = `/hasW2ValidationErrors`;

/** Independent scan of the dictionary XML: fact path -> dependency paths, for every blocking fact. */
function blockingFactsInXml() {
  const out = new Map<string, Set<string>>();
  for (const file of fs.readdirSync(TAX_XML).filter((f) => f.endsWith(`.xml`))) {
    const xml = fs.readFileSync(path.join(TAX_XML, file), `utf-8`).replace(/<!--[\s\S]*?-->/g, ``);
    for (const fact of xml.matchAll(/<Fact\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/Fact>/g)) {
      if (!/<BlockSubmissionOnTrue\s*\/>/.test(fact[2])) continue;
      out.set(fact[1], new Set([...fact[2].matchAll(/<Dependency\s+path="([^"]+)"/g)].map((m) => m[1])));
    }
  }
  return out;
}

function goldenFacts(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(GOLDEN, `utf-8`)).facts;
}

type FakeResult = { hasValue: boolean; complete: boolean; get: unknown };
const complete = (v: unknown): FakeResult => ({ hasValue: true, complete: true, get: v });
const placeholder = (v: unknown): FakeResult => ({ hasValue: true, complete: false, get: v });
const incomplete = (): FakeResult => ({
  hasValue: false,
  complete: false,
  get get() {
    throw new Error(`incomplete`);
  },
});

/** The golden fact graph with one fact's result replaced. */
function goldenWith(target: string, result: () => FakeResult): FactGraph {
  const factGraph = setupFactGraph(goldenFacts()).factGraph;
  return {
    get: (p: string) => (p === target ? result() : factGraph.get(p as never)),
  } as unknown as FactGraph;
}

describe(`submission-blocking facts`, () => {
  it(`the generated lists are the backend dictionary's <BlockSubmissionOnTrue /> facts`, () => {
    const xml = blockingFactsInXml();
    expect([...submissionBlockingFacts].sort()).toEqual([...xml.keys()].sort());
    // The old hand-copied list had 22 paths.
    expect(submissionBlockingFacts.length).toBeGreaterThan(100);

    const covered = new Set<string>();
    xml.forEach((deps, p) => deps.forEach((d) => d !== p && xml.has(d) && covered.add(d)));
    const topLevel = [...xml.keys()].filter((p) => !covered.has(p)).sort();
    expect([...submissionBlockingFactsRequiringValue].sort()).toEqual(topLevel);
    expect(topLevel).toEqual(expect.arrayContaining([KNOCKED_OUT, INVALID_TIN, W2_VALIDATION_ERRORS]));
    expect(topLevel).not.toContain(STATE_RETURN_KNOCKOUT);
  });

  it(`accepts the golden return`, () => {
    const { factGraph } = setupFactGraph(goldenFacts());
    expect(submissionBlockingFactPaths(factGraph)).toEqual([]);
    expect(new Condition(`submissionBlockingFactsAreFalse`).evaluate(factGraph, null)).toBe(true);
  });

  it(`blocks on a fact the old hand-copied list did not have (/hasW2ValidationErrors)`, () => {
    const factGraph = goldenWith(W2_VALIDATION_ERRORS, () => complete(true));
    expect(submissionBlockingFactPaths(factGraph)).toEqual([W2_VALIDATION_ERRORS]);
    expect(new Condition(`submissionBlockingFactsAreFalse`).evaluate(factGraph, null)).toBe(false);
  });

  it(`blocks on a knockout in the golden return`, () => {
    const facts = goldenFacts();
    facts[`/formW2s/#13500000-0000-4000-8000-000000000501/writableStateWithholding`] = {
      $type: `gov.irs.factgraph.persisters.DollarWrapper`,
      item: `100.00`,
    };
    expect(submissionBlockingFactPaths(setupFactGraph(facts).factGraph)).toEqual(
      expect.arrayContaining([KNOCKED_OUT, `/flowKnockoutFloridaStateWithholding`])
    );
  });

  it(`blocks when any blocking fact is true, complete or placeholder`, () => {
    expect(submissionBlockingFactPaths(goldenWith(INVALID_TIN, () => complete(true)))).toEqual([INVALID_TIN]);
    expect(submissionBlockingFactPaths(goldenWith(INVALID_TIN, () => placeholder(true)))).toEqual([INVALID_TIN]);
    expect(submissionBlockingFactPaths(goldenWith(STATE_RETURN_KNOCKOUT, () => complete(true)))).toEqual([
      STATE_RETURN_KNOCKOUT,
    ]);
    expect(submissionBlockingFactPaths(goldenWith(STATE_RETURN_KNOCKOUT, () => placeholder(true)))).toEqual([
      STATE_RETURN_KNOCKOUT,
    ]);
  });

  it(`blocks when a top-level fact has no false value`, () => {
    expect(submissionBlockingFactPaths(goldenWith(KNOCKED_OUT, incomplete))).toEqual([KNOCKED_OUT]);
    expect(submissionBlockingFactPaths(goldenWith(INVALID_TIN, () => complete(`false`)))).toEqual([INVALID_TIN]);
    // A covered knockout feeds /flowIsKnockedOut, which is checked on its own.
    expect(submissionBlockingFactPaths(goldenWith(STATE_RETURN_KNOCKOUT, incomplete))).toEqual([]);
  });

  it(`passes a placeholder false /flowIsKnockedOut (known gap, https://github.com/jz4396/direct-file/issues/186)`, () => {
    expect(submissionBlockingFactPaths(goldenWith(KNOCKED_OUT, () => placeholder(false)))).toEqual([]);
  });

  it(`blocks when a blocking fact fails to evaluate`, () => {
    const boom = () => {
      throw new Error(`forced`);
    };
    expect(submissionBlockingFactPaths(goldenWith(INVALID_TIN, boom))).toEqual([INVALID_TIN]);
    expect(submissionBlockingFactPaths(goldenWith(STATE_RETURN_KNOCKOUT, boom))).toEqual([STATE_RETURN_KNOCKOUT]);
  });
});
