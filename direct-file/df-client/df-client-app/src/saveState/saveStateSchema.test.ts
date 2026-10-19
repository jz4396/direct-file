import { describe, expect, it, vi } from 'vitest';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { SaveStateError } from './saveStateErrors.js';
import {
  createSaveState,
  DEFAULT_TAX_YEAR,
  migrateSaveState,
  SAVE_STATE_FORMAT,
  SAVE_STATE_VERSION,
} from './saveStateSchema.js';
import { PASSPHRASE, scenarioFactGraphJson, TEST_ITERATIONS } from './saveStateTestUtils.js';
import { downloadSaveFile, exportSaveFile, importSaveFile, MAX_SAVE_FILE_BYTES } from './saveStateFile.js';
import { abstractPath } from './saveStateFacts.js';

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

describe(`import validation against the return being filed`, () => {
  const facts = scenarioFactGraphJson();
  const B = `gov.irs.factgraph.persisters.`;
  const v2 = (over: Record<string, unknown> = {}) => ({
    format: SAVE_STATE_FORMAT,
    version: 2,
    taxYear: DEFAULT_TAX_YEAR,
    savedAt: `2027-02-01T00:00:00.000Z`,
    facts,
    ...over,
  });
  const importCode = async (raw: unknown, passphrase?: string) => {
    try {
      await importSaveFile(typeof raw === `string` ? raw : JSON.stringify(raw), passphrase);
    } catch (e) {
      return (e as SaveStateError).code;
    }
    return `no-error`;
  };
  const filerId = Object.keys(facts)
    .find((p) => p.startsWith(`/filers/#`))
    ?.split(`/`)[2];

  it(`accepts the app's own fact graph for the year being filed`, async () => {
    expect(await importCode(v2())).toBe(`no-error`);
    expect(Object.keys(facts).length).toBeGreaterThan(20);
  });

  it.each([1999, 2025, DEFAULT_TAX_YEAR + 1])(`rejects a plaintext file for tax year %i`, async (taxYear) => {
    expect(await importCode(v2({ taxYear }))).toBe(`wrong-tax-year`);
  });

  it(`rejects an encrypted file for another tax year (the year is inside the authenticated plaintext)`, async () => {
    const file = await exportSaveFile(facts, { taxYear: 2025, passphrase: PASSPHRASE, iterations: TEST_ITERATIONS });
    expect(await importCode(file.text, PASSPHRASE)).toBe(`wrong-tax-year`);
  });

  it.each([
    [`an unknown fact`, { ...facts, '/notARealFact': { $type: `${B}BooleanWrapper`, item: true } }],
    [`/filers stored as a StringWrapper`, { ...facts, '/filers': { $type: `${B}StringWrapper`, item: `x` } }],
    [`a derived fact`, { ...facts, '/flowIsKnockedOut': { $type: `${B}BooleanWrapper`, item: false } }],
    [
      `a Boolean fact with a string item`,
      { ...facts, '/carLoanHadInterest': { $type: `${B}BooleanWrapper`, item: `yes` } },
    ],
    [
      `an unknown field of a collection item`,
      { ...facts, [`/filers/#${filerId}/notARealField`]: { $type: `${B}StringWrapper`, item: `x` } },
    ],
  ])(`rejects %s with invalid-facts, in a v2 file and a v1 file`, async (_label, bad) => {
    expect(await importCode(v2({ facts: bad }))).toBe(`invalid-facts`);
    expect(await importCode(bad)).toBe(`invalid-facts`);
  });

  it(`rejects a file over ${MAX_SAVE_FILE_BYTES} characters before parsing it`, async () => {
    const big = JSON.stringify(v2({ padding: `x`.repeat(MAX_SAVE_FILE_BYTES) }));
    expect(await importCode(big)).toBe(`file-too-large`);
    expect(await importCode(`{`.repeat(MAX_SAVE_FILE_BYTES + 1))).toBe(`file-too-large`);
  });

  it(`maps collection item paths to the dictionary's abstract paths`, () => {
    expect(abstractPath(`/filers/#${filerId}/tin`)).toBe(`/filers/*/tin`);
    expect(abstractPath(`/a/#1/b/#2/c`)).toBe(`/a/*/b/*/c`);
  });
});

describe(`download`, () => {
  it(`revokes the object URL after the click, not in the same tick`, () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => `blob:test`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, `click`).mockImplementation(() => {});
    downloadSaveFile({ text: `{}`, filename: `f.json`, encrypted: false });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith(`blob:test`);
    click.mockRestore();
    vi.useRealTimers();
  });
});
