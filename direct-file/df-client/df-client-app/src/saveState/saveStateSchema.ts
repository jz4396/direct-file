import { CURRENT_TAX_YEAR } from '../constants/taxConstants.js';
import { SaveStateError } from './saveStateErrors.js';
import { assertFactsMatchDictionary } from './saveStateFacts.js';

/**
 * Versioned save-state document.
 *
 * - v1: the bare fact-graph JSON (`factGraph.toJSON()`), i.e. `{ "/path": { "$type": "...", "item": ... } }`. This
 *   is what the existing "download fact graph" debug helper writes, so such files can still be imported.
 * - v2: the same facts wrapped in an envelope with a format marker, schema version, tax year and timestamp.
 * - v3: v2, after Form 8949 column (b) is rewritten. A stored
 *   `/form8949Transactions/#id/dateAcquiredIsVariousOrInherited` of false becomes
 *   `/form8949Transactions/#id/dateAcquiredKind` = `date`. True is removed and `dateAcquiredKind` is left
 *   unanswered (that return was stopped, so the filer re-answers column (b)). Form 8949 instr. (2025) p. 6,
 *   Column (b).
 *
 * Readers call `migrateSaveState`, which upgrades any older version to the current one and validates it: the tax
 * year must be the one this build files, and every fact must be a writable fact of this build's dictionary with the
 * expected persister type (saveStateFacts.ts). Nothing reaches the fact graph, or the API, before that.
 */
export const SAVE_STATE_FORMAT = `df-save-state`;
export const SAVE_STATE_VERSION = 3;
/** CURRENT_TAX_YEAR is a string constant; save files store the year as a number. */
export const DEFAULT_TAX_YEAR = Number(CURRENT_TAX_YEAR);

const PERSISTER_TYPE_PREFIX = `gov.irs.factgraph.persisters.`;

export type PersistedFact = { $type: string; item: unknown };
export type PersistedFacts = Record<string, PersistedFact>;

export interface SaveStateV2 {
  format: typeof SAVE_STATE_FORMAT;
  version: 2;
  taxYear: number;
  savedAt: string;
  facts: PersistedFacts;
}

export interface SaveStateV3 {
  format: typeof SAVE_STATE_FORMAT;
  version: 3;
  taxYear: number;
  savedAt: string;
  facts: PersistedFacts;
}

export type SaveState = SaveStateV3;

const BOOLEAN_TYPE = `${PERSISTER_TYPE_PREFIX}BooleanWrapper`;
const ENUM_TYPE = `${PERSISTER_TYPE_PREFIX}EnumWrapper`;
const DATE_ACQUIRED_KIND_OPTIONS = `/form8949DateAcquiredKindOptions`;
/** Concrete row path written when column (b) was the various-or-inherited Boolean. */
const OLD_DATE_ACQUIRED_KIND =
  /^\/form8949Transactions\/#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/dateAcquiredIsVariousOrInherited$/;

/**
 * v2 to v3. false becomes column (b) `date`. true is dropped so column (b) stays unanswered.
 * Any other stored shape is left in place and fails dictionary validation.
 */
function migrateForm8949DateAcquired(facts: PersistedFacts): PersistedFacts {
  const hits = Object.keys(facts).filter((path) => OLD_DATE_ACQUIRED_KIND.test(path));
  if (hits.length === 0) return facts;
  const next: PersistedFacts = { ...facts };
  for (const path of hits) {
    const fact = next[path];
    const id = OLD_DATE_ACQUIRED_KIND.exec(path)?.[1];
    if (!id || fact.$type !== BOOLEAN_TYPE || typeof fact.item !== `boolean`) continue;
    delete next[path];
    if (fact.item === false) {
      next[`/form8949Transactions/#${id}/dateAcquiredKind`] = {
        $type: ENUM_TYPE,
        item: { value: [`date`], enumOptionsPath: DATE_ACQUIRED_KIND_OPTIONS },
      };
    }
  }
  return next;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === `object` && v !== null && !Array.isArray(v);

export function isPersistedFacts(v: unknown): v is PersistedFacts {
  if (!isPlainObject(v)) return false;
  return Object.entries(v).every(
    ([path, fact]) =>
      path.startsWith(`/`) &&
      isPlainObject(fact) &&
      typeof fact.$type === `string` &&
      fact.$type.startsWith(PERSISTER_TYPE_PREFIX) &&
      `item` in fact
  );
}

export function createSaveState(facts: unknown, taxYear: number = DEFAULT_TAX_YEAR, now = new Date()): SaveState {
  if (!isPersistedFacts(facts)) throw new SaveStateError(`invalid-facts`);
  return { format: SAVE_STATE_FORMAT, version: SAVE_STATE_VERSION, taxYear, savedAt: now.toISOString(), facts };
}

const isV1 = (raw: Record<string, unknown>) => !(`format` in raw) && !(`version` in raw);

function toV3(facts: PersistedFacts, taxYear: number, savedAt: string): SaveState {
  return {
    format: SAVE_STATE_FORMAT,
    version: SAVE_STATE_VERSION,
    taxYear,
    savedAt,
    facts: migrateForm8949DateAcquired(facts),
  };
}

function upgrade(raw: unknown, expectedTaxYear: number): SaveState {
  if (!isPlainObject(raw)) throw new SaveStateError(`invalid-file`);

  // A v1 file has no year; it is the bare fact graph of the return being filed.
  if (isV1(raw)) {
    if (!isPersistedFacts(raw)) throw new SaveStateError(`invalid-facts`);
    return toV3(raw, expectedTaxYear, new Date(0).toISOString());
  }

  if (raw.format !== SAVE_STATE_FORMAT || typeof raw.version !== `number`) throw new SaveStateError(`invalid-file`);
  if (raw.version !== 2 && raw.version !== SAVE_STATE_VERSION) throw new SaveStateError(`unsupported-version`);

  const { taxYear, savedAt, facts } = raw;
  if (typeof taxYear !== `number` || !Number.isInteger(taxYear) || typeof savedAt !== `string`) {
    throw new SaveStateError(`invalid-file`);
  }
  if (!isPersistedFacts(facts)) throw new SaveStateError(`invalid-facts`);
  if (raw.version === SAVE_STATE_VERSION) {
    return { format: SAVE_STATE_FORMAT, version: SAVE_STATE_VERSION, taxYear, savedAt, facts };
  }
  return toV3(facts, taxYear, savedAt);
}

/**
 * Upgrade any supported save-state document to the current version and validate it against the return being filed:
 * its tax year (`expectedTaxYear`, the year this build files) and this build's fact dictionary.
 */
export function migrateSaveState(raw: unknown, expectedTaxYear: number = DEFAULT_TAX_YEAR): SaveState {
  const state = upgrade(raw, expectedTaxYear);
  if (state.taxYear !== expectedTaxYear) throw new SaveStateError(`wrong-tax-year`);
  assertFactsMatchDictionary(state.facts);
  return state;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SaveStateError(`invalid-file`);
  }
}
