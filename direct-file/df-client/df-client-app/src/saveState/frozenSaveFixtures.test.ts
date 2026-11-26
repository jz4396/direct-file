import fs from 'fs';
import path from 'path';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { decryptText, isEncryptedEnvelope, PBKDF2_ITERATIONS } from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';
import { assertFactsMatchDictionary } from './saveStateFacts.js';
import { importSaveFile } from './saveStateFile.js';
import { parseJson, PersistedFacts } from './saveStateSchema.js';
import { PASSPHRASE } from './saveStateTestUtils.js';

/**
 * Save files frozen at main 8b8084f9 (2026-11-26), built on the golden round trip (#366).
 * The rule for these files is in fixtures/README.md: a renamed or removed path fails this test,
 * and the fix is a reviewed migration. Do not edit the fixtures.
 *
 * Headline dollars are the figures goldenProfiles.test.ts asserts for these two profiles at that commit.
 * Golden T's outcome is amount owed. Golden X's outcome is a refund.
 */

const FIXTURE_DIR = path.resolve(__dirname, `fixtures`);
const GENERATED_AT = `2026-11-26T00:00:00.000Z`;

const FIXTURES: Record<string, { passphrase?: string; lines: Record<string, string> }> = {
  'golden-t.json': {
    lines: {
      '/agi': `166174.00`,
      '/totalTax': `22495.00`,
      '/overpayment': `0.00`,
      '/balanceDue': `495.00`,
    },
  },
  'golden-x.encrypted.json': {
    passphrase: PASSPHRASE,
    lines: {
      '/agi': `300000.00`,
      '/totalTax': `49918.00`,
      '/overpayment': `82.00`,
      '/balanceDue': `0.00`,
    },
  },
};

function codeOf(err: unknown): string {
  if (err instanceof SaveStateError) return err.code;
  if (err instanceof Error) return err.message;
  return String(err);
}

function pick(facts: PersistedFacts, keys: string[]): PersistedFacts {
  const out: PersistedFacts = {};
  for (const key of keys) out[key] = facts[key];
  return out;
}

/** Which fact the dictionary validator rejects. Same split as the golden round trip. */
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

function factsOf(plaintext: string): PersistedFacts | undefined {
  const raw = parseJson(plaintext);
  if (!raw || typeof raw !== `object` || Array.isArray(raw)) return undefined;
  const facts = `facts` in raw ? (raw as { facts: unknown }).facts : raw;
  if (!facts || typeof facts !== `object` || Array.isArray(facts)) return undefined;
  return facts as PersistedFacts;
}

async function importFixture(name: string, text: string, passphrase?: string) {
  try {
    return await importSaveFile(text, passphrase);
  } catch (err) {
    let facts: PersistedFacts | undefined;
    try {
      const raw = parseJson(text);
      const plain = isEncryptedEnvelope(raw) ? await decryptText(raw, passphrase) : text;
      facts = factsOf(plain);
    } catch {
      facts = undefined;
    }
    const paths = facts ? failingPaths(facts) : [];
    const where = paths.length > 0 ? paths.join(`, `) : `(no fact path)`;
    throw new Error(`${name}: import failed at ${where}: ${codeOf(err)}`);
  }
}

function readDollar(g: InterceptingFactGraph, factPath: string): string {
  const result = g.get(factPath as ConcretePath);
  if (!result.complete || result.get == null || typeof result.get.toString !== `function`) {
    throw new Error(`${factPath} is incomplete`);
  }
  const text = result.get.toString();
  if (text === `[object Object]`) throw new Error(`${factPath} is not a dollar line`);
  return text;
}

const calls: string[] = [];

describe(`frozen save files from main 8b8084f9`, () => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it(`holds the Golden T plaintext export and the Golden X encrypted export`, () => {
    const names = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(`.json`));
    expect(names.sort()).toEqual([`golden-t.json`, `golden-x.encrypted.json`]);
  });

  it.each(Object.entries(FIXTURES))(
    `imports %s and keeps the golden headline lines`,
    async (file, spec) => {
      const text = fs.readFileSync(path.join(FIXTURE_DIR, file), `utf8`);
      expect(text).not.toContain(PASSPHRASE);
      if (spec.passphrase) {
        const envelope = JSON.parse(text) as { kdf?: { iterations?: number } };
        expect(envelope.kdf?.iterations).toBe(PBKDF2_ITERATIONS);
        expect(text).not.toContain(`"$type"`);
        await expect(importSaveFile(text)).rejects.toMatchObject({ code: `passphrase-required` });
      }

      const state = await importFixture(file, text, spec.passphrase);
      expect(state.savedAt).toBe(GENERATED_AT);
      const reloaded = new InterceptingFactGraph(state.facts);
      const lines: Record<string, string> = {};
      for (const factPath of Object.keys(spec.lines)) lines[factPath] = readDollar(reloaded, factPath);
      expect(lines).toEqual(spec.lines);
      expect(calls).toEqual([]);
    },
    60_000
  );
});
