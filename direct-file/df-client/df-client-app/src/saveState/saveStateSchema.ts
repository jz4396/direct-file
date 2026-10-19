import { CURRENT_TAX_YEAR } from '../constants/taxConstants.js';
import { SaveStateError } from './saveStateErrors.js';

/**
 * Versioned save-state document.
 *
 * - v1: the bare fact-graph JSON (`factGraph.toJSON()`), i.e. `{ "/path": { "$type": "...", "item": ... } }`. This
 *   is what the existing "download fact graph" debug helper writes, so such files can still be imported.
 * - v2: the same facts wrapped in an envelope with a format marker, schema version, tax year and timestamp.
 *
 * Readers call `migrateSaveState`, which upgrades any older version to the current one and validates the shape.
 */
export const SAVE_STATE_FORMAT = `df-save-state`;
export const SAVE_STATE_VERSION = 2;
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

export type SaveState = SaveStateV2;

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

function migrateV1toV2(facts: unknown, taxYear: number): SaveStateV2 {
  if (!isPersistedFacts(facts)) throw new SaveStateError(`invalid-facts`);
  return { format: SAVE_STATE_FORMAT, version: 2, taxYear, savedAt: new Date(0).toISOString(), facts };
}

/** Upgrade any supported save-state document to the current version and validate it. */
export function migrateSaveState(raw: unknown, defaultTaxYear: number = DEFAULT_TAX_YEAR): SaveState {
  if (!isPlainObject(raw)) throw new SaveStateError(`invalid-file`);

  if (isV1(raw)) return migrateV1toV2(raw, defaultTaxYear);

  if (raw.format !== SAVE_STATE_FORMAT || typeof raw.version !== `number`) throw new SaveStateError(`invalid-file`);
  if (raw.version > SAVE_STATE_VERSION || raw.version < 2) throw new SaveStateError(`unsupported-version`);

  const { taxYear, savedAt, facts } = raw;
  if (typeof taxYear !== `number` || !Number.isInteger(taxYear) || typeof savedAt !== `string`) {
    throw new SaveStateError(`invalid-file`);
  }
  if (!isPersistedFacts(facts)) throw new SaveStateError(`invalid-facts`);
  return { format: SAVE_STATE_FORMAT, version: 2, taxYear, savedAt, facts };
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SaveStateError(`invalid-file`);
  }
}
