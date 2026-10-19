import { describe, expect, it } from 'vitest';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { SaveStateError } from './saveStateErrors.js';
import {
  createSaveState,
  DEFAULT_TAX_YEAR,
  migrateSaveState,
  SAVE_STATE_FORMAT,
  SAVE_STATE_VERSION,
} from './saveStateSchema.js';
import { scenarioFactGraphJson } from './saveStateTestUtils.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as SaveStateError).code;
  }
  return `no-error`;
};

describe(`save-state schema`, () => {
  const facts = scenarioFactGraphJson();

  it(`wraps fact-graph JSON in a versioned envelope`, () => {
    const state = createSaveState(facts, 2026, new Date(`2027-02-01T00:00:00Z`));
    expect(state).toEqual({
      format: SAVE_STATE_FORMAT,
      version: SAVE_STATE_VERSION,
      taxYear: 2026,
      savedAt: `2027-02-01T00:00:00.000Z`,
      facts,
    });
  });

  it(`migrates a v1 file (bare fact-graph JSON) to the current version`, () => {
    const migrated = migrateSaveState(JSON.parse(JSON.stringify(facts)));
    expect(migrated.version).toBe(SAVE_STATE_VERSION);
    expect(migrated.format).toBe(SAVE_STATE_FORMAT);
    expect(migrated.taxYear).toBe(DEFAULT_TAX_YEAR);
    expect(DEFAULT_TAX_YEAR).toBe(2026);
    expect(migrated.facts).toEqual(facts);
  });

  it(`migrated v1 facts load into a fact graph with the same answers`, () => {
    const migrated = migrateSaveState(facts);
    const reloaded = JSON.parse(new InterceptingFactGraph(migrated.facts).toJSON());
    expect(reloaded).toEqual(facts);
  });

  it(`passes the current version through unchanged`, () => {
    const state = createSaveState(facts, 2026);
    expect(migrateSaveState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it(`rejects a newer schema version instead of guessing`, () => {
    const state = { ...createSaveState(facts, 2026), version: SAVE_STATE_VERSION + 1 };
    expect(code(() => migrateSaveState(state))).toBe(`unsupported-version`);
  });

  it.each([
    [`a non-object`, `[]`, `invalid-file`],
    [`a foreign format marker`, { format: `other`, version: 2 }, `invalid-file`],
    [`a fact without a persister type`, { '/filers': { item: 1 } }, `invalid-facts`],
    [`a fact with an unknown persister namespace`, { '/x': { $type: `evil.Type`, item: 1 } }, `invalid-facts`],
    [
      `a key that is not a fact path`,
      { x: { $type: `gov.irs.factgraph.persisters.BooleanWrapper`, item: true } },
      `invalid-facts`,
    ],
    [
      `a current-version file with a bad tax year`,
      { format: SAVE_STATE_FORMAT, version: 2, taxYear: `2026`, savedAt: ``, facts: {} },
      `invalid-file`,
    ],
  ])(`rejects %s`, (_label, raw, expected) => {
    expect(code(() => migrateSaveState(raw))).toBe(expected);
  });

  it(`error messages carry only a code, not file contents`, () => {
    const err = (() => {
      try {
        migrateSaveState({ '/filers/#x/lastName': { item: `Testerson` } });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toBe(`save-state: invalid-facts`);
  });
});
