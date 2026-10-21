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
import { abstractPath, isUuid } from './saveStateFacts.js';
import * as testData from '../test/testData.js';
import { setupFactGraph } from '../test/setupFactGraph.js';

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
    ?.split(`/`)[2]
    ?.slice(1);

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

  describe(`enum values, collection item ids and item fields (#163)`, () => {
    const W2 = Object.keys(facts)
      .find((p) => p.startsWith(`/formW2s/#`))
      ?.split(`/`)[2]
      ?.slice(1);
    const tinPath = Object.keys(facts).find((p) => /^\/filers\/#[^/]+\/tin$/.test(p)) as string;
    const filers = facts[`/filers`] as { item: { items: string[] } };
    const enumOf = (value: unknown, enumOptionsPath = `/filingStatusOptions`) => ({
      $type: `${B}EnumWrapper`,
      item: { value, enumOptionsPath },
    });
    const careProvider = `0b7f6f0e-3b1c-4d43-9a57-6a4e2c1d0f11`;
    const dueDiligence = (values: unknown) => ({
      ...facts,
      '/cdccCareProviders': { $type: `${B}CollectionWrapper`, item: { items: [careProvider] } },
      [`/cdccCareProviders/#${careProvider}/writableDueDiligence`]: {
        $type: `${B}MultEnumWrapper`,
        item: { values, enumOptionsPath: `/cdccDueDiligenceOptions` },
      },
    });
    const policy = `5d0c9a3e-8f21-4b6a-9c47-2e1f6a8b3d70`;
    const coverageMonths = (enumOptionsPath: unknown) => ({
      ...facts,
      '/1095As': { $type: `${B}CollectionWrapper`, item: { items: [policy] } },
      [`/1095As/#${policy}/coverageMonths`]: {
        $type: `${B}MultEnumWrapper`,
        item: { values: [`jan`], enumOptionsPath },
      },
    });
    const upperFilerId = (filerId as string).toUpperCase();

    it.each([
      [`an enum value that is not an option (totallyBogus)`, { ...facts, '/filingStatus': enumOf([`totallyBogus`]) }],
      [`an enum value that is an option of another enum`, { ...facts, '/filingStatus': enumOf([`neither`]) }],
      [
        `an enum pointing at another enum's options path`,
        { ...facts, '/filingStatus': enumOf([`neither`], `/k12EducatorOptions`) },
      ],
      [`an enum with two values`, { ...facts, '/filingStatus': enumOf([`single`, `single`]) }],
      [`an enum value that is not a list`, { ...facts, '/filingStatus': enumOf(`single`) }],
      [`a multi-enum with one value that is not an option`, dueDiligence([`providerRefusedToProvideTIN`, `x`])],
      [`a collection whose item id is not a UUID`, { ...facts, '/filers': { ...filers, item: { items: [`1`] } } }],
      [
        `a collection item path whose id is not a UUID`,
        { ...facts, '/filers/#not-a-uuid/isBlind': { $type: `${B}BooleanWrapper`, item: false } },
      ],
      [
        `a collection item path with __proto__ as its id`,
        { ...facts, '/filers/#__proto__/isBlind': { $type: `${B}BooleanWrapper`, item: false } },
      ],
      [
        `a collection item reference whose id is not a UUID`,
        { ...facts, [`/formW2s/#${W2}/filer`]: { $type: `${B}CollectionItemWrapper`, item: { id: `x` } } },
      ],
      [
        `an extra field on a collection`,
        { ...facts, '/filers': { ...filers, item: { ...filers.item, injected: [`x`] } } },
      ],
      [
        `an extra field on a collection item reference`,
        { ...facts, [`/formW2s/#${W2}/filer`]: { $type: `${B}CollectionItemWrapper`, item: { id: filerId, x: 1 } } },
      ],
      [
        `an extra field inside a collection item's TIN`,
        {
          ...facts,
          [tinPath]: { ...(facts[tinPath] as object), item: { area: `900`, group: `55`, serial: `5555`, x: 1 } },
        },
      ],
      [`an extra key next to $type and item`, { ...facts, [tinPath]: { ...(facts[tinPath] as object), note: `x` } }],
      [
        `a TIN missing a required field`,
        { ...facts, [tinPath]: { $type: `${B}TinWrapper`, item: { area: `900`, group: `55` } } },
      ],
      [
        `a wildcard collection path (/filers/*/isBlind)`,
        { ...facts, '/filers/*/isBlind': { $type: `${B}BooleanWrapper`, item: true } },
      ],
      [
        `a wildcard collection path (/formW2s/*/writableWages)`,
        { ...facts, '/formW2s/*/writableWages': { $type: `${B}DollarWrapper`, item: `1.00` } },
      ],
      [
        `a wildcard collection path holding a collection item reference`,
        { ...facts, '/formW2s/*/filer': { $type: `${B}CollectionItemWrapper`, item: { id: filerId } } },
      ],
      [`an enumOptionsPath with #__proto__ as its id`, coverageMonths(`/1095As/#__proto__/monthOptions`)],
      [`an enumOptionsPath with #constructor as its id`, coverageMonths(`/1095As/#constructor/monthOptions`)],
      [
        `a concrete enumOptionsPath (the app writes the abstract one)`,
        coverageMonths(`/1095As/#${policy}/monthOptions`),
      ],
      [
        `a collection item path whose UUID is uppercase`,
        { ...facts, [`/filers/#${upperFilerId}/isBlind`]: { $type: `${B}BooleanWrapper`, item: true } },
      ],
      [
        `a collection whose item id is an uppercase UUID`,
        { ...facts, '/filers': { ...filers, item: { items: [upperFilerId] } } },
      ],
    ])(`rejects %s with invalid-facts, in a v2 file and a v1 file`, async (_label, bad) => {
      expect(tinPath && W2 && (facts[tinPath] as { $type: string }).$type).toBe(`${B}TinWrapper`);
      expect(isUuid(filerId) && isUuid(W2)).toBe(true);
      expect(await importCode(v2({ facts: bad }))).toBe(`invalid-facts`);
      expect(await importCode(bad)).toBe(`invalid-facts`);
    });

    it.each([
      [`an enum with no value`, { ...facts, '/filingStatus': enumOf([]) }],
      [`a valid multi-enum`, dueDiligence([`providerRefusedToProvideTIN`, `providerMovedAndFilerUnableToFindThem`])],
      [`an empty multi-enum`, dueDiligence([])],
      [`a multi-enum in a collection with the dictionary's options path`, coverageMonths(`/1095As/*/monthOptions`)],
    ])(`accepts %s`, async (_label, ok) => {
      expect(await importCode(v2({ facts: ok }))).toBe(`no-error`);
    });

    it(`accepts the fact graph of every synthetic test return (golden end-to-end scenarios, synthetic data)`, () => {
      let checked = 0;
      for (const data of Object.values(testData)) {
        if (!data || typeof data !== `object` || Array.isArray(data)) continue;
        let json: unknown;
        try {
          json = JSON.parse(setupFactGraph(data as Parameters<typeof setupFactGraph>[0]).factGraph.toJSON());
        } catch {
          continue; // not a fact set
        }
        expect(code(() => migrateSaveState(json))).toBe(`no-error`);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });
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
