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
/** Enum / MultiEnum fact path -> its dictionary options path. */
let enumOptionsPathByFact: Map<string, string> | undefined;
/** Options path -> every value its EnumOptions can offer (the union across conditions). */
let enumValuesByOptionsPath: Map<string, Set<string>> | undefined;

type DictNode = { typeName: string; options: Record<string, unknown>; children?: DictNode[] };

/** String values of an EnumOptions node: direct `<String>` children and each `<Option>`'s `<Value>`. */
function optionValues(node: DictNode): Set<string> {
  const values = new Set<string>();
  const collect = (n: DictNode) => {
    if (n.typeName === `String` && typeof n.options.value === `string`) values.add(n.options.value);
  };
  for (const child of node.children ?? []) {
    collect(child);
    if (child.typeName === `EnumOption`) {
      for (const part of child.children ?? []) if (part.typeName === `Value`) (part.children ?? []).forEach(collect);
    }
  }
  return values;
}

/** Abstract writable path (`/filers/*\/tin`) -> expected persister `$type`. Built once, on first import. */
function writableTypes(): Map<string, string> {
  if (!expectedTypes) {
    expectedTypes = new Map();
    enumOptionsPathByFact = new Map();
    enumValuesByOptionsPath = new Map();
    for (const fact of wrappedFacts) {
      const wrapper = fact.writable ? PERSISTER_BY_WRITABLE_TYPE[fact.writable.typeName] : undefined;
      if (wrapper) expectedTypes.set(fact.path, PERSISTER + wrapper);
      const optionsPath = (fact.writable?.options as { optionsPath?: unknown } | undefined)?.optionsPath;
      if ((wrapper === `EnumWrapper` || wrapper === `MultEnumWrapper`) && typeof optionsPath === `string`) {
        enumOptionsPathByFact.set(fact.path, optionsPath);
      }
      if (fact.derived?.typeName === `EnumOptions`) {
        enumValuesByOptionsPath.set(fact.path, optionValues(fact.derived as unknown as DictNode));
      }
    }
    for (const [path, wrapper] of Object.entries(GRAPH_META_FACTS)) expectedTypes.set(path, PERSISTER + wrapper);
  }
  return expectedTypes;
}

/**
 * Collection item ids are UUIDs (fact-graph Collection / CollectionItem hold `java.util.UUID`). Checked here so a
 * damaged file fails as `invalid-facts` rather than as a hydration error later.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === `string` && UUID.test(v);

/** Every `#<id>` segment of a fact path must be a UUID. */
const pathIdsAreUuids = (path: string) => [...path.matchAll(/\/#([^/]*)/g)].every((m) => isUuid(m[1]));

/** `/filers/#<id>/tin` -> `/filers/*\/tin`. */
export const abstractPath = (path: string) => path.replace(/\/#[^/]+/g, `/*`);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === `object` && v !== null && !Array.isArray(v);

/**
 * Keys `factGraph.toJSON()` writes inside `item`, for the persisters whose item is an object (fact-graph-scala
 * types/*.scala, upickle): required keys, then keys upickle may omit because they have defaults. Anything else in an
 * item is rejected: the fact graph would silently drop it, so it can only come from a damaged or hand-edited file.
 */
const ITEM_KEYS: Record<string, { required: string[]; optional?: string[] }> = {
  AddressWrapper: {
    required: [`streetAddress`, `city`, `postalCode`, `stateOrProvence`],
    optional: [`streetAddressLine2`, `country`],
  },
  BankAccountWrapper: { required: [`accountType`, `routingNumber`, `accountNumber`] },
  CollectionWrapper: { required: [`items`] },
  CollectionItemWrapper: { required: [`id`] },
  DayWrapper: { required: [`date`] },
  EinWrapper: { required: [`prefix`, `serial`] },
  EmailAddressWrapper: { required: [`email`] },
  EnumWrapper: { required: [`value`, `enumOptionsPath`] },
  MultEnumWrapper: { required: [`values`, `enumOptionsPath`] },
  TinWrapper: { required: [`area`, `group`, `serial`], optional: [`allowAllZeros`] },
  PinWrapper: { required: [`pin`] },
  IpPinWrapper: { required: [`pin`] },
};

/** E164Number is a sealed trait, so upickle tags the item with its case class. */
const PHONE_KEYS: Record<string, string[]> = {
  'gov.irs.factgraph.types.UsPhoneNumber': [`$type`, `areaCode`, `officeCode`, `lineNumber`],
  'gov.irs.factgraph.types.InternationalPhoneNumber': [`$type`, `countryCode`, `subscriberNumber`],
};

function hasExactKeys(obj: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(obj);
  return (
    required.every((k) => Object.hasOwn(obj, k)) && keys.every((k) => required.includes(k) || optional.includes(k))
  );
}

function itemKeysMatch(wrapper: string, item: Record<string, unknown>): boolean {
  if (wrapper === `E164Wrapper`) {
    const keys = typeof item.$type === `string` ? PHONE_KEYS[item.$type] : undefined;
    return !!keys && hasExactKeys(item, keys);
  }
  const shape = ITEM_KEYS[wrapper];
  return !shape || hasExactKeys(item, shape.required, shape.optional);
}

/** Enum and MultiEnum values must be options of the fact's dictionary EnumOptions. */
function enumMatches(path: string, wrapper: string, item: Record<string, unknown>): boolean {
  const optionsPath = enumOptionsPathByFact?.get(path);
  const allowed = optionsPath ? enumValuesByOptionsPath?.get(optionsPath) : undefined;
  if (!optionsPath || !allowed) return false;
  if (typeof item.enumOptionsPath !== `string` || abstractPath(item.enumOptionsPath) !== optionsPath) return false;
  const values = wrapper === `EnumWrapper` ? item.value : item.values;
  if (!Array.isArray(values) || (wrapper === `EnumWrapper` && values.length > 1)) return false;
  return values.every((v) => typeof v === `string` && allowed.has(v));
}

/** Shape of `item` for each persister; the fact graph parses the rest of an object item itself. */
function itemMatches(path: string, wrapper: string, item: unknown): boolean {
  switch (wrapper) {
    case `BooleanWrapper`:
      return typeof item === `boolean`;
    case `StringWrapper`:
    case `DollarWrapper`:
      return typeof item === `string`;
    case `IntWrapper`:
      return Number.isInteger(item);
    default:
      break;
  }
  if (!isPlainObject(item) || !itemKeysMatch(wrapper, item)) return false;
  switch (wrapper) {
    case `CollectionWrapper`:
      return Array.isArray(item.items) && item.items.every(isUuid);
    case `CollectionItemWrapper`:
      return isUuid(item.id);
    case `EnumWrapper`:
    case `MultEnumWrapper`:
      return enumMatches(path, wrapper, item);
    default:
      return true;
  }
}

/**
 * Throws `invalid-facts` unless every fact is a writable dictionary fact with the expected persister type, holding
 * only `$type` and `item`, at a path whose collection item ids are UUIDs, with an item of the expected shape (enum
 * values among the dictionary's options, no unknown item fields).
 */
export function assertFactsMatchDictionary(facts: Record<string, { $type: string; item: unknown }>): void {
  const types = writableTypes();
  for (const [path, fact] of Object.entries(facts)) {
    const abstract = abstractPath(path);
    const expected = types.get(abstract);
    if (
      !expected ||
      !pathIdsAreUuids(path) ||
      !hasExactKeys(fact, [`$type`, `item`]) ||
      fact.$type !== expected ||
      !itemMatches(abstract, expected.slice(PERSISTER.length), fact.item)
    ) {
      throw new SaveStateError(`invalid-facts`);
    }
  }
}
