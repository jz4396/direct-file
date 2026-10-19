import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllDeviceData, loadFromDevice, saveToDevice } from './deviceSaveStore.js';
import { exportSaveFile, importSaveFile } from './saveStateFile.js';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { PASSPHRASE, PII_MARKERS, scenarioFactGraphJson, TEST_ITERATIONS } from './saveStateTestUtils.js';

/**
 * Network guard: export, import, device save/load and clear must never put taxpayer facts on the wire.
 * Every browser egress API a page can use without user navigation is replaced with a recorder; the test fails if
 * any of them is called at all.
 */
describe(`save-state makes no network requests`, () => {
  const calls: string[] = [];
  const consoleOutput: unknown[][] = [];

  beforeEach(() => {
    calls.length = 0;
    consoleOutput.length = 0;
    vi.stubGlobal(
      `fetch`,
      vi.fn((...a: unknown[]) => (calls.push(`fetch ${String(a[0])}`), Promise.reject()))
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
    for (const level of [`log`, `info`, `warn`, `error`, `debug`] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void consoleOutput.push(args));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it(`for a full export → import → device save → load → clear cycle`, async () => {
    const facts = scenarioFactGraphJson();

    const plain = await exportSaveFile(facts, { taxYear: 2026 });
    expect((await importSaveFile(plain.text)).facts).toEqual(facts);

    const enc = await exportSaveFile(facts, { taxYear: 2026, passphrase: PASSPHRASE, iterations: TEST_ITERATIONS });
    const imported = await importSaveFile(enc.text, PASSPHRASE);
    expect(imported.facts).toEqual(facts);
    // the imported facts load into a working fact graph locally
    expect(JSON.parse(new InterceptingFactGraph(imported.facts).toJSON())).toEqual(facts);

    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    expect((await loadFromDevice(PASSPHRASE)).facts).toEqual(facts);
    await clearAllDeviceData();

    expect(calls).toEqual([]);
  });

  it(`and logs nothing that contains taxpayer data`, async () => {
    const facts = scenarioFactGraphJson();
    const enc = await exportSaveFile(facts, { passphrase: PASSPHRASE, iterations: TEST_ITERATIONS });
    await importSaveFile(enc.text, PASSPHRASE);
    await importSaveFile(enc.text, `wrong passphrase!!`).catch(() => undefined);
    await importSaveFile(`{"not":"valid"`).catch(() => undefined);
    const logged = JSON.stringify(consoleOutput);
    for (const marker of [...PII_MARKERS, PASSPHRASE]) expect(logged).not.toContain(marker);
    expect(calls).toEqual([]);
  });

  it(`the encrypted export contains no plaintext facts`, async () => {
    const enc = await exportSaveFile(scenarioFactGraphJson(), { passphrase: PASSPHRASE, iterations: TEST_ITERATIONS });
    expect(enc.encrypted).toBe(true);
    for (const marker of PII_MARKERS) expect(enc.text).not.toContain(marker);
  });

  it(`a plaintext export is flagged as unencrypted`, async () => {
    const plain = await exportSaveFile(scenarioFactGraphJson());
    expect(plain.encrypted).toBe(false);
    expect(plain.filename).not.toContain(`encrypted`);
  });

  it(`an encrypted import without a passphrase asks for one`, async () => {
    const enc = await exportSaveFile(scenarioFactGraphJson(), { passphrase: PASSPHRASE, iterations: TEST_ITERATIONS });
    await expect(importSaveFile(enc.text)).rejects.toMatchObject({ code: `passphrase-required` });
  });
});

describe(`save-state modules`, () => {
  it(`do not import the API client`, async () => {
    const sources = import.meta.glob([`./*.ts`, `./*.tsx`, `!./*.test.ts`, `!./*.test.tsx`], {
      query: `?raw`,
      import: `default`,
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(4);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/useApiHook|VITE_BACKEND_URL|\bfetch\(|XMLHttpRequest|sendBeacon/);
      expect(src, file).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});
