import { decryptText, encryptText, isEncryptedEnvelope, PBKDF2_ITERATIONS } from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';
import { createSaveState, DEFAULT_TAX_YEAR, migrateSaveState, parseJson, SaveState } from './saveStateSchema.js';

/**
 * Export / import of the fact-graph save file. Everything happens in the browser: these functions make no network
 * requests and do not log.
 *
 * Without a passphrase the exported file is plaintext JSON containing the full return; the UI warns before writing
 * it. With a passphrase the file is an AES-GCM envelope (see saveStateCrypto.ts).
 */
export const SAVE_FILE_MIME = `application/json`;
/**
 * Largest save file accepted, checked on `File.size` before reading and on the text length again here. A real fact
 * graph is tens of KB (about twice that once encrypted and base64-encoded), so 1 MB leaves plenty of room.
 */
export const MAX_SAVE_FILE_BYTES = 1_000_000;

const assertSize = (text: string) => {
  if (text.length > MAX_SAVE_FILE_BYTES) throw new SaveStateError(`file-too-large`);
};

export interface ExportOptions {
  taxYear?: number;
  passphrase?: string;
  /** Test hook; production uses PBKDF2_ITERATIONS. */
  iterations?: number;
  now?: Date;
}

export interface ExportedSaveFile {
  text: string;
  filename: string;
  encrypted: boolean;
}

export async function exportSaveFile(facts: unknown, opts: ExportOptions = {}): Promise<ExportedSaveFile> {
  const { taxYear = DEFAULT_TAX_YEAR, passphrase, iterations = PBKDF2_ITERATIONS, now = new Date() } = opts;
  const state = createSaveState(facts, taxYear, now);
  const plaintext = JSON.stringify(state);
  const stamp = now.toISOString().slice(0, 10);
  if (passphrase) {
    const envelope = await encryptText(plaintext, passphrase, iterations);
    return {
      text: JSON.stringify(envelope),
      filename: `direct-file-${taxYear}-${stamp}.encrypted.json`,
      encrypted: true,
    };
  }
  return { text: plaintext, filename: `direct-file-${taxYear}-${stamp}.json`, encrypted: false };
}

/** Parse, decrypt (if needed), migrate and validate a save file's text. */
export async function importSaveFile(text: string, passphrase?: string): Promise<SaveState> {
  assertSize(text);
  const raw = parseJson(text);
  if (isEncryptedEnvelope(raw)) {
    if (!passphrase) throw new SaveStateError(`passphrase-required`);
    // The envelope is longer than its plaintext, so the size check above covers the decrypted text too.
    return migrateSaveState(parseJson(await decryptText(raw, passphrase)));
  }
  return migrateSaveState(raw);
}

export function isEncryptedSaveFile(text: string): boolean {
  try {
    return isEncryptedEnvelope(JSON.parse(text));
  } catch {
    return false;
  }
}

/**
 * Trigger a browser download of the exported file. The object URL is revoked on the next task: revoking it in the
 * same tick as `click()` can cancel the download in some browsers.
 */
export function downloadSaveFile(file: ExportedSaveFile) {
  const url = URL.createObjectURL(new Blob([file.text], { type: SAVE_FILE_MIME }));
  try {
    const a = document.createElement(`a`);
    a.href = url;
    a.download = file.filename;
    a.rel = `noopener`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
