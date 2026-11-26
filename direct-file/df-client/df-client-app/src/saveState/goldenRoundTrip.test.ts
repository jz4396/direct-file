import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { setupFactGraph } from '../test/setupFactGraph.js';
import { wrapComponent } from '../test/helpers.js';
import * as goldenModule from '../test/scenarioTests/goldenProfiles.js';
import { decryptText, encryptText, MIN_PBKDF2_ITERATIONS } from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';
import { assertFactsMatchDictionary } from './saveStateFacts.js';
import { importSaveFile } from './saveStateFile.js';
import { createSaveState, migrateSaveState, parseJson, PersistedFacts, SaveState } from './saveStateSchema.js';
import { PASSPHRASE } from './saveStateTestUtils.js';

/**
 * Every golden profile's answers survive export and import (#126).
 * Encrypted files use MIN_PBKDF2_ITERATIONS here only; production still writes PBKDF2_ITERATIONS.
 * A failure names the fact path and the reason and stops. The dictionary validator is not loosened.
 */

const { goldenProfiles } = goldenModule;
const goldenTestSource = fs.readFileSync(
  path.resolve(__dirname, `../test/scenarioTests/goldenProfiles.test.ts`),
  `utf8`
);

type Fg = InterceptingFactGraph;
type GoldenExports = Record<string, unknown>;

const holder: { factGraph?: Fg } = {};
const replaceFactGraphWithFacts = vi.fn();
vi.mock(`../factgraph/FactGraphContext.js`, () => ({
  useFactGraph: () => ({ factGraph: holder.factGraph }),
  replaceFactGraphWithFacts: (...args: unknown[]) => replaceFactGraphWithFacts(...args),
}));
vi.mock(`../flow/flowConfig.js`, () => ({ useFlow: () => undefined }));
vi.mock(`react-i18next`, () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: `3rdParty`, init: () => {} },
}));

import DeviceDataPage from './DeviceDataPage.js';

function codeOf(err: unknown): string {
  if (err instanceof SaveStateError) return err.code;
  if (err instanceof Error) return err.message;
  return String(err);
}

function persistedFactsOf(raw: unknown): PersistedFacts | undefined {
  if (!raw || typeof raw !== `object` || Array.isArray(raw)) return undefined;
  const facts = `facts` in raw ? (raw as { facts: unknown }).facts : raw;
  if (!facts || typeof facts !== `object` || Array.isArray(facts)) return undefined;
  return facts as PersistedFacts;
}

function pick(facts: PersistedFacts, keys: string[]): PersistedFacts {
  const out: PersistedFacts = {};
  for (const key of keys) out[key] = facts[key];
  return out;
}

/** Which fact the dictionary validator rejects. Facts are checked independently, so half the map isolates it. */
function failingPaths(facts: PersistedFacts): string[] {
  try {
    assertFactsMatchDictionary(facts);
    return [];
  } catch {
    const keys = Object.keys(facts);
    if (keys.length <= 1) return keys;
    const mid = Math.floor(keys.length / 2);
    const found = [...failingPaths(pick(facts, keys.slice(0, mid))), ...failingPaths(pick(facts, keys.slice(mid)))];
    return found.length > 0 ? found : keys;
  }
}

function failImport(profile: string, reason: string, facts?: PersistedFacts): never {
  const paths = facts ? failingPaths(facts) : [];
  const where = paths.length > 0 ? paths.join(`, `) : `(no fact path)`;
  throw new Error(`${profile}: import failed at ${where}: ${reason}`);
}

function resolveExpr(expr: string, locals: Map<string, string>): string {
  const parts = expr.trim().split(`.`);
  const head = parts[0];
  if (!head) throw new Error(`empty template expression`);
  if (locals.has(head)) {
    if (parts.length === 1) return locals.get(head) as string;
    throw new Error(`unresolved ${expr}`);
  }
  let cur: unknown = (goldenModule as GoldenExports)[head];
  for (const part of parts.slice(1)) {
    if (cur && typeof cur === `object` && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      throw new Error(`unresolved ${expr}`);
    }
  }
  if (typeof cur === `string` || typeof cur === `number`) return String(cur);
  throw new Error(`unresolved ${expr}`);
}

function resolveText(raw: string, locals: Map<string, string>): string {
  if (!raw.includes(`\${`)) return raw;
  return raw.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => resolveExpr(expr, locals));
}

function concretePath(raw: string, locals: Map<string, string>, profile: string): string {
  let resolved: string;
  try {
    resolved = resolveText(raw, locals);
  } catch (err) {
    throw new Error(`${profile}: ${codeOf(err)} in ${raw}`);
  }
  if (!resolved.startsWith(`/`) || resolved.includes(`\${`) || !/^\/[A-Za-z0-9#./_-]+$/.test(resolved)) {
    throw new Error(`${profile}: unresolved fact path ${raw} -> ${resolved}`);
  }
  return resolved;
}

function extractObject(source: string, openBrace: number): string {
  let depth = 0;
  let quote: string | undefined;
  for (let i = openBrace; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === `\\`) {
        i += 1;
        continue;
      }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === `'` || c === `"` || c === `\``) {
      quote = c;
      continue;
    }
    if (c === `{`) depth += 1;
    else if (c === `}`) {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  throw new Error(`unclosed expectDollars object`);
}

function dollarPaths(body: string): string[] {
  const stripped = body.replace(/\/\/[^\n]*/g, ``);
  const paths: string[] = [];
  const keyRe = /(['"`])([^'"`]+)\1\s*(?:\])?\s*:/g;
  let match = keyRe.exec(stripped);
  while (match) {
    paths.push(match[2]);
    match = keyRe.exec(stripped);
  }
  return paths;
}

type ScanHit =
  | { index: number; length: number; kind: `local`; name: string; raw: string }
  | { index: number; length: number; kind: `dollars` }
  | { index: number; length: number; kind: `get`; raw: string }
  | { index: number; length: number; kind: `forOf`; loopVar: string; arrayBody: string };

function earliest(scope: string, from: number, varName: string): ScanHit | undefined {
  const slice = scope.slice(from);
  const hits: ScanHit[] = [];
  const local = /const\s+(\w+)\s*=\s*(['"`])([^\n]*?)\2/.exec(slice);
  if (local && local.index !== undefined) {
    hits.push({ index: from + local.index, length: local[0].length, kind: `local`, name: local[1], raw: local[3] });
  }
  const dollars = new RegExp(`expectDollars\\(\\s*${varName}\\s*,\\s*\\{`).exec(slice);
  if (dollars && dollars.index !== undefined) {
    hits.push({ index: from + dollars.index, length: dollars[0].length, kind: `dollars` });
  }
  const got = new RegExp(`get\\(\\s*${varName}\\s*,\\s*(['"\`])([^'"\`]*?)\\1`).exec(slice);
  if (got && got.index !== undefined) {
    hits.push({ index: from + got.index, length: got[0].length, kind: `get`, raw: got[2] });
  }
  const forOf = /for\s*\(\s*const\s+(\w+)\s+of\s*\[([\s\S]*?)\]\s*\)/.exec(slice);
  if (forOf && forOf.index !== undefined) {
    hits.push({
      index: from + forOf.index,
      length: forOf[0].length,
      kind: `forOf`,
      loopVar: forOf[1],
      arrayBody: forOf[2],
    });
  }
  hits.sort((a, b) => a.index - b.index);
  return hits[0];
}

/**
 * Fact paths the golden scenario asserts for this profile, federal and state.
 * New profiles are picked up from that test, not from a hard-coded list.
 */
function assertedLinePaths(profile: string): string[] {
  const re = new RegExp(`const\\s+(\\w+)\\s*=\\s*graph\\(\\s*${profile}\\s*\\)`);
  const found = re.exec(goldenTestSource);
  if (!found || found.index === undefined) return [];
  const varName = found[1];
  const lineStart = goldenTestSource.lastIndexOf(`\n`, found.index) + 1;
  const indent = found.index - lineStart;
  let end = goldenTestSource.length;
  if (indent <= 2) {
    const next = goldenTestSource.indexOf(`\ndescribe(`, found.index);
    if (next !== -1) end = next;
  } else {
    const rest = goldenTestSource.slice(found.index);
    const nextIt = rest.search(/\n {2}it(?:\.\w+)?\(/);
    const nextDescribe = rest.search(/\ndescribe\(/);
    const cuts = [nextIt, nextDescribe].filter((n) => n >= 0);
    if (cuts.length > 0) end = found.index + Math.min(...cuts);
  }
  const scope = goldenTestSource.slice(found.index, end);
  const locals = new Map<string, string>();
  const paths: string[] = [];
  const add = (raw: string) => paths.push(concretePath(raw, locals, profile));
  let from = 0;
  for (;;) {
    const hit = earliest(scope, from, varName);
    if (!hit) break;
    if (hit.kind === `local`) {
      // Path fragments (`/scheduleCBusinesses/#id`) and other strings. Resolved now so later templates can use them.
      locals.set(hit.name, resolveText(hit.raw, locals));
      from = hit.index + hit.length;
    } else if (hit.kind === `dollars`) {
      const open = hit.index + hit.length - 1;
      const body = extractObject(scope, open);
      for (const raw of dollarPaths(body)) add(raw);
      from = open + body.length + 2;
    } else if (hit.kind === `get`) {
      add(hit.raw);
      from = hit.index + hit.length;
    } else {
      const after = scope.slice(hit.index, hit.index + hit.length + 800);
      if (new RegExp(`get\\(\\s*${varName}\\s*,\\s*${hit.loopVar}\\b`).test(after)) {
        for (const raw of hit.arrayBody.match(/['"`](\/[^'"`]+)['"`]/g) ?? []) {
          add(raw.slice(1, -1));
        }
      }
      from = hit.index + hit.length;
    }
    if (from <= hit.index) from = hit.index + 1;
  }
  return [...new Set(paths)];
}

function shown(result: { complete: boolean; get?: unknown }): string {
  if (!result.complete) return `incomplete`;
  const value = result.get;
  if (typeof value === `boolean` || typeof value === `number` || typeof value === `string`) return String(value);
  if (value && typeof value === `object` && `toString` in value && typeof value.toString === `function`) {
    const text = value.toString();
    if (text !== `[object Object]`) return text;
  }
  return JSON.stringify(value);
}

function readFact(g: Fg, factPath: string, profile: string): string {
  try {
    return shown(g.get(factPath as ConcretePath));
  } catch (err) {
    throw new Error(`${profile}: reading ${factPath} failed: ${codeOf(err)}`);
  }
}

function readLines(g: Fg, paths: string[], profile: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const factPath of paths) out[factPath] = readFact(g, factPath, profile);
  return out;
}

function answersOf(profile: string, facts: unknown): { json: PersistedFacts; graph: Fg } {
  const built = setupFactGraph(facts as never).factGraph;
  const json = JSON.parse(built.toJSON()) as PersistedFacts;
  try {
    createSaveState(json);
  } catch (err) {
    failImport(profile, codeOf(err), json);
  }
  return { json, graph: new InterceptingFactGraph(json) };
}

async function importDecrypted(profile: string, plaintext: string): Promise<SaveState> {
  let raw: unknown;
  try {
    raw = parseJson(plaintext);
  } catch (err) {
    failImport(profile, codeOf(err));
  }
  try {
    const migrated = migrateSaveState(raw);
    assertFactsMatchDictionary(migrated.facts);
    return migrated;
  } catch (err) {
    failImport(profile, codeOf(err), persistedFactsOf(raw));
  }
}

const calls: string[] = [];

describe(`golden profile save-state round trip`, () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      `fetch`,
      vi.fn((...args: unknown[]) => (calls.push(`fetch ${String(args[0])}`), Promise.reject(new Error(`blocked`))))
    );
    vi.spyOn(XMLHttpRequest.prototype, `open`).mockImplementation(() => void calls.push(`xhr.open`));
    vi.spyOn(XMLHttpRequest.prototype, `send`).mockImplementation(() => void calls.push(`xhr.send`));
    vi.stubGlobal(
      `WebSocket`,
      vi.fn(() => {
        calls.push(`websocket`);
        throw new Error(`blocked`);
      })
    );
    vi.stubGlobal(
      `EventSource`,
      vi.fn(() => {
        calls.push(`eventsource`);
        throw new Error(`blocked`);
      })
    );
    Object.defineProperty(globalThis.navigator, `sendBeacon`, {
      configurable: true,
      value: vi.fn(() => (calls.push(`beacon`), true)),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    holder.factGraph = undefined;
    replaceFactGraphWithFacts.mockReset();
  });

  it(`reads federal and state lines from the golden scenario for every profile it builds`, () => {
    const names = Object.keys(goldenProfiles);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(
      expect.arrayContaining([`profileADividendsNiit`, `profileWAzMfjW2`, `profileYFlMfsPabAmt`])
    );
    for (const name of names) {
      if (!goldenTestSource.includes(`graph(${name})`)) continue;
      const paths = assertedLinePaths(name);
      expect(paths.length, name).toBeGreaterThan(0);
    }
    const all = names.flatMap((name) => assertedLinePaths(name));
    expect(all).toEqual(expect.arrayContaining([`/totalTax`, `/agi`]));
    expect(all.some((p) => p.startsWith(`/paLine`) || p.startsWith(`/azLine`) || p.startsWith(`/state`))).toBe(true);
  });

  it(`encrypts every golden profile and reloads the same answers, lines, and knockout`, async () => {
    const entries = Object.entries(goldenProfiles);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, facts] of entries) {
      const { json, graph } = answersOf(name, facts);
      const paths = assertedLinePaths(name);
      const beforeLines = readLines(graph, paths, name);
      const beforeKnockout = readFact(graph, `/flowIsKnockedOut`, name);

      const state = createSaveState(json);
      const envelope = await encryptText(JSON.stringify(state), PASSPHRASE, MIN_PBKDF2_ITERATIONS);
      expect(envelope.kdf.iterations, name).toBe(MIN_PBKDF2_ITERATIONS);
      const packed = JSON.stringify(envelope);
      expect(packed, name).not.toContain(`"$type"`);

      let plaintext: string;
      try {
        plaintext = await decryptText(envelope, PASSPHRASE);
      } catch (err) {
        failImport(name, codeOf(err));
      }
      const migrated = await importDecrypted(name, plaintext);
      const reloaded = new InterceptingFactGraph(migrated.facts);

      expect(JSON.parse(reloaded.toJSON()), name).toEqual(json);
      expect(readLines(reloaded, paths, name), name).toEqual(beforeLines);
      expect(readFact(reloaded, `/flowIsKnockedOut`, name), name).toBe(beforeKnockout);
      expect(calls, name).toEqual([]);
    }
  }, 600_000);

  it(`round-trips one golden profile as plaintext after the warning is acknowledged`, async () => {
    const [name, facts] = Object.entries(goldenProfiles)[0];
    const { json, graph } = answersOf(name, facts);
    const paths = assertedLinePaths(name);
    const beforeLines = readLines(graph, paths, name);
    const beforeKnockout = readFact(graph, `/flowIsKnockedOut`, name);

    const downloaded: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => (downloaded.push(blob), `blob:golden`)) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    holder.factGraph = new InterceptingFactGraph(json);

    render(wrapComponent(createElement(DeviceDataPage)));
    const button = screen.getByRole(`button`, { name: `account.deviceData.export.button` });
    expect(screen.getByText(`account.deviceData.export.plaintextWarning`)).toBeInTheDocument();
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByLabelText(`account.deviceData.export.plaintextAck`));
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect((await screen.findByTestId(`device-data-status`)).textContent).toBe(`account.deviceData.export.donePlain`);
    expect(downloaded).toHaveLength(1);
    const text = await downloaded[0].text();
    const exported = JSON.parse(text) as { format?: string };
    expect(exported.format).toBe(`df-save-state`);

    let migrated: SaveState;
    try {
      migrated = await importSaveFile(text);
      assertFactsMatchDictionary(migrated.facts);
    } catch (err) {
      failImport(name, codeOf(err), persistedFactsOf(exported));
    }
    const reloaded = new InterceptingFactGraph(migrated.facts);
    expect(JSON.parse(reloaded.toJSON()), name).toEqual(json);
    expect(readLines(reloaded, paths, name), name).toEqual(beforeLines);
    expect(readFact(reloaded, `/flowIsKnockedOut`, name), name).toBe(beforeKnockout);
    expect(calls, name).toEqual([]);
    expect(replaceFactGraphWithFacts).not.toHaveBeenCalled();
  }, 120_000);
});
