import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserStorage } from '../auth/storage.js';
import {
  clearAllDeviceData,
  DEVICE_SAVE_KEY,
  hasDeviceSave,
  loadFromDevice,
  removeDeviceSave,
  saveToDevice,
} from './deviceSaveStore.js';
import { SaveStateError } from './saveStateErrors.js';
import { PASSPHRASE, PII_MARKERS, scenarioFactGraphJson, TEST_ITERATIONS } from './saveStateTestUtils.js';

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as SaveStateError).code;
  }
  return `no-error`;
};

describe(`save on this device`, () => {
  const facts = scenarioFactGraphJson();

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it(`stores only an encrypted envelope, never the facts or the passphrase`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    expect(hasDeviceSave()).toBe(true);
    const everything = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    for (const marker of [...PII_MARKERS, PASSPHRASE]) expect(everything).not.toContain(marker);
    expect(JSON.parse(localStorage.getItem(DEVICE_SAVE_KEY) as string).format).toBe(`df-save-state-encrypted`);
  });

  it(`loads back the same facts with the passphrase`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS, taxYear: 2026 });
    const state = await loadFromDevice(PASSPHRASE);
    expect(state.facts).toEqual(facts);
    expect(state.taxYear).toBe(2026);
  });

  it(`does not load with a wrong passphrase`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    expect(await codeOf(loadFromDevice(`not the passphrase`))).toBe(`decrypt-failed`);
  });

  it(`refuses to save without a long enough passphrase`, async () => {
    expect(await codeOf(saveToDevice(facts, `short`))).toBe(`passphrase-too-short`);
    expect(hasDeviceSave()).toBe(false);
  });

  it(`reports when there is nothing saved`, async () => {
    expect(await codeOf(loadFromDevice(PASSPHRASE))).toBe(`no-device-save`);
  });

  it(`removeDeviceSave removes the entry`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    removeDeviceSave();
    expect(hasDeviceSave()).toBe(false);
  });

  it(`sign-out (clearBrowserStorage) removes the device save`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    clearBrowserStorage();
    expect(hasDeviceSave()).toBe(false);
  });

  it(`"Clear all data on this device" wipes storage, caches, IndexedDB and service workers`, async () => {
    await saveToDevice(facts, PASSPHRASE, { iterations: TEST_ITERATIONS });
    sessionStorage.setItem(`other`, `x`);
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(`caches`, { keys: vi.fn().mockResolvedValue([`a`, `b`]), delete: cacheDelete });
    const deleteDatabase = vi.fn();
    vi.stubGlobal(`indexedDB`, {
      databases: vi.fn().mockResolvedValue([{ name: `db1` }, { name: `` }]),
      deleteDatabase,
    });
    const unregister = vi.fn().mockResolvedValue(true);
    const sw = { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) };
    const nav = Object.create(globalThis.navigator, { serviceWorker: { value: sw } });
    vi.stubGlobal(`navigator`, nav);

    await clearAllDeviceData();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(deleteDatabase).toHaveBeenCalledWith(`db1`);
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it(`clearing still finishes when an API is missing or fails`, async () => {
    vi.stubGlobal(`caches`, { keys: vi.fn().mockRejectedValue(new Error(`blocked`)), delete: vi.fn() });
    vi.stubGlobal(`indexedDB`, undefined);
    localStorage.setItem(DEVICE_SAVE_KEY, `x`);
    await expect(clearAllDeviceData()).resolves.toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
});
