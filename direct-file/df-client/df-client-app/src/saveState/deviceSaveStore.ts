import {
  assertPassphrase,
  decryptText,
  encryptText,
  isEncryptedEnvelope,
  PBKDF2_ITERATIONS,
} from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';
import { createSaveState, DEFAULT_TAX_YEAR, migrateSaveState, parseJson, SaveState } from './saveStateSchema.js';

/**
 * Save on this device.
 *
 * Storage choice: one `localStorage` entry holding only the AES-GCM envelope (ciphertext + salt + IV + KDF
 * parameters). A fact graph is tens of KB, well inside localStorage limits, and a single synchronous key keeps
 * clearing simple and testable. Any script on the origin can read localStorage, which is why nothing is stored
 * unencrypted and a passphrase (min length enforced) is required; the passphrase itself is never stored.
 *
 * The entry is removed on sign-out and auto sign-out (auth/storage.ts clears localStorage), and by
 * `clearAllDeviceData`.
 */
export const DEVICE_SAVE_KEY = `df-save-state:device:v1`;

function storage(): Storage {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // access can throw when storage is disabled
  }
  throw new SaveStateError(`storage-unavailable`);
}

export async function saveToDevice(
  facts: unknown,
  passphrase: string,
  opts: { taxYear?: number; iterations?: number } = {}
): Promise<void> {
  assertPassphrase(passphrase);
  const state = createSaveState(facts, opts.taxYear ?? DEFAULT_TAX_YEAR);
  const envelope = await encryptText(JSON.stringify(state), passphrase, opts.iterations ?? PBKDF2_ITERATIONS);
  storage().setItem(DEVICE_SAVE_KEY, JSON.stringify(envelope));
}

export function hasDeviceSave(): boolean {
  try {
    return storage().getItem(DEVICE_SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export async function loadFromDevice(passphrase: string): Promise<SaveState> {
  const stored = storage().getItem(DEVICE_SAVE_KEY);
  if (stored === null) throw new SaveStateError(`no-device-save`);
  const envelope = parseJson(stored);
  if (!isEncryptedEnvelope(envelope)) throw new SaveStateError(`invalid-file`);
  return migrateSaveState(parseJson(await decryptText(envelope, passphrase)));
}

export function removeDeviceSave() {
  storage().removeItem(DEVICE_SAVE_KEY);
}

/**
 * Best-effort wipe of everything this origin keeps in the browser: localStorage, sessionStorage, Cache Storage,
 * IndexedDB databases and service-worker registrations. Cookies set HttpOnly by a server and the browser's own
 * history/downloads are outside a page's reach; the UI tells the user to clear those (and delete exported files)
 * on shared computers.
 */
export async function clearAllDeviceData(): Promise<void> {
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* storage disabled */
  }
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* storage disabled */
  }
  await clearCachesAndDatabases();
}

export async function clearCachesAndDatabases(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (globalThis.caches?.keys) {
    tasks.push(globalThis.caches.keys().then((keys) => Promise.all(keys.map((k) => globalThis.caches.delete(k)))));
  }
  const idb = globalThis.indexedDB as (IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }) | undefined;
  if (idb?.databases) {
    tasks.push(
      idb
        .databases()
        .then((dbs) => Promise.all(dbs.filter((d) => !!d.name).map((d) => idb.deleteDatabase(d.name as string))))
    );
  }
  const sw = globalThis.navigator?.serviceWorker;
  if (sw?.getRegistrations) {
    tasks.push(sw.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))));
  }
  await Promise.allSettled(tasks);
}
