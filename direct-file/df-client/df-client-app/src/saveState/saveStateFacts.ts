import { wrappedFacts } from '../fact-dictionary/generated/wrappedFacts.js';
import { SaveStateError } from './saveStateErrors.js';

/**
 * Checks imported facts against this build's fact dictionary before they can replace the return.
 *
 * A save file is user-supplied input. Once its facts are in the fact graph, the interview autosaves them to the API,
 * so anything not in the dictionary, or stored with the wrong type, is rejected here as `invalid-facts`. The
 * dictionary is the generated one for the tax year this build files (saveStateSchema checks the file's year).
 */
const PERSISTER = `gov.irs.factgraph.persisters.`;

/** Writable fact type (fact dictionary) -> persister `$type` written by `factGraph.toJSON()` (TypeContainer.scala). */
const PERSISTER_BY_WRITABLE_TYPE: Record<string, string> = {
  Address: `AddressWrapper`,
  BankAccount: `BankAccountWrapper`,
  Boolean: `BooleanWrapper`,
  Collection: `CollectionWrapper`,
  CollectionItem: `CollectionItemWrapper`,
  Day: `DayWrapper`,
  Dollar: `DollarWrapper`,
  EIN: `EinWrapper`,
  EmailAddress: `EmailAddressWrapper`,
  Enum: `EnumWrapper`,
  Int: `IntWrapper`,
  IPPIN: `IpPinWrapper`,
  MultiEnum: `MultEnumWrapper`,
  PhoneNumber: `E164Wrapper`,
  PIN: `PinWrapper`,
  String: `StringWrapper`,
  TIN: `TinWrapper`,
};

/**
 * Facts the fact graph writes itself and that aren't in the dictionary. `/meta/migrationsApplied` is the count of
 * persisted-data migrations already run (fact-graph-scala Migrations.scala, MigrationsFieldName).
 */
const GRAPH_META_FACTS: Record<string, string> = { '/meta/migrationsApplied': `IntWrapper` };

let expectedTypes: Map<string, string> | undefined;

/** Abstract writable path (`/filers/*\/tin`) -> expected persister `$type`. Built once, on first import. */
function writableTypes(): Map<string, string> {
  if (!expectedTypes) {
    expectedTypes = new Map();
    for (const fact of wrappedFacts) {
      const wrapper = fact.writable ? PERSISTER_BY_WRITABLE_TYPE[fact.writable.typeName] : undefined;
      if (wrapper) expectedTypes.set(fact.path, PERSISTER + wrapper);
    }
    for (const [path, wrapper] of Object.entries(GRAPH_META_FACTS)) expectedTypes.set(path, PERSISTER + wrapper);
  }
  return expectedTypes;
}

/** `/filers/#<id>/tin` -> `/filers/*\/tin`. */
export const abstractPath = (path: string) => path.replace(/\/#[^/]+/g, `/*`);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === `object` && v !== null && !Array.isArray(v);

/** Shape of `item` for the persisters whose JSON is a primitive; the rest are objects the fact graph parses. */
function itemMatches(wrapper: string, item: unknown): boolean {
  switch (wrapper) {
    case `BooleanWrapper`:
      return typeof item === `boolean`;
    case `StringWrapper`:
    case `DollarWrapper`:
      return typeof item === `string`;
    case `IntWrapper`:
      return Number.isInteger(item);
    case `CollectionWrapper`:
      return isPlainObject(item) && Array.isArray(item.items) && item.items.every((id) => typeof id === `string`);
    default:
      return isPlainObject(item);
  }
}

/** Throws `invalid-facts` unless every fact is a writable dictionary fact with the expected persister type. */
export function assertFactsMatchDictionary(facts: Record<string, { $type: string; item: unknown }>): void {
  const types = writableTypes();
  for (const [path, fact] of Object.entries(facts)) {
    const expected = types.get(abstractPath(path));
    if (!expected || fact.$type !== expected || !itemMatches(expected.slice(PERSISTER.length), fact.item)) {
      throw new SaveStateError(`invalid-facts`);
    }
  }
}
