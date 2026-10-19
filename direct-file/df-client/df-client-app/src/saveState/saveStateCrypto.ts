import { SaveStateError } from './saveStateErrors.js';

/**
 * Passphrase encryption for save files and device saves (WebCrypto only, nothing leaves the browser).
 *
 * - Key: PBKDF2-HMAC-SHA-256 over the passphrase with a random 16-byte salt, 600,000 iterations (OWASP 2023
 *   guidance for PBKDF2-SHA256), deriving a non-extractable AES-256-GCM key.
 * - Cipher: AES-GCM with a random 12-byte IV per encryption. The envelope header (format, version, kdf and cipher
 *   parameters) is bound as additional authenticated data, so tampering with any of it fails decryption.
 * - The salt and IV are stored in the envelope next to the ciphertext. The passphrase and the derived key are never
 *   stored or logged.
 */
export const ENCRYPTED_FORMAT = `df-save-state-encrypted`;
export const ENCRYPTED_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
/** Bounds accepted when reading a file, so a crafted file can't force a trivially weak or a huge KDF cost. */
export const MIN_PBKDF2_ITERATIONS = 100_000;
export const MAX_PBKDF2_ITERATIONS = 10_000_000;
export const MIN_PASSPHRASE_LENGTH = 12;

const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT;
  version: typeof ENCRYPTED_VERSION;
  kdf: { name: `PBKDF2`; hash: `SHA-256`; iterations: number; salt: string };
  cipher: { name: `AES-GCM`; iv: string };
  ciphertext: string;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new SaveStateError(`crypto-unavailable`);
  return s;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = ``;
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromBase64 = (b64: string) => {
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw new SaveStateError(`invalid-file`);
  }
};

/** Canonical header bytes used as AES-GCM additional data. */
function headerAad(e: Omit<EncryptedEnvelope, `ciphertext`>): Uint8Array {
  const h = [e.format, e.version, e.kdf.name, e.kdf.hash, e.kdf.iterations, e.kdf.salt, e.cipher.name, e.cipher.iv];
  return new TextEncoder().encode(JSON.stringify(h));
}

export function assertPassphrase(passphrase: string | undefined): asserts passphrase is string {
  if (!passphrase) throw new SaveStateError(`passphrase-required`);
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new SaveStateError(`passphrase-too-short`);
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage) {
  const s = subtle();
  const material = await s.importKey(`raw`, new TextEncoder().encode(passphrase), `PBKDF2`, false, [`deriveKey`]);
  return s.deriveKey(
    { name: `PBKDF2`, hash: `SHA-256`, salt, iterations },
    material,
    { name: `AES-GCM`, length: 256 },
    false,
    [usage]
  );
}

export async function encryptText(
  plaintext: string,
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<EncryptedEnvelope> {
  assertPassphrase(passphrase);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const header: Omit<EncryptedEnvelope, `ciphertext`> = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: `PBKDF2`, hash: `SHA-256`, iterations, salt: toBase64(salt) },
    cipher: { name: `AES-GCM`, iv: toBase64(iv) },
  };
  const key = await deriveKey(passphrase, salt, iterations, `encrypt`);
  const ct = await subtle().encrypt(
    { name: `AES-GCM`, iv, additionalData: headerAad(header) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { ...header, ciphertext: toBase64(new Uint8Array(ct)) };
}

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  return typeof v === `object` && v !== null && (v as { format?: unknown }).format === ENCRYPTED_FORMAT;
}

export async function decryptText(envelope: EncryptedEnvelope, passphrase: string | undefined): Promise<string> {
  if (!passphrase) throw new SaveStateError(`passphrase-required`);
  const { version, kdf, cipher, ciphertext } = envelope;
  if (
    version !== ENCRYPTED_VERSION ||
    kdf?.name !== `PBKDF2` ||
    kdf.hash !== `SHA-256` ||
    cipher?.name !== `AES-GCM` ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < MIN_PBKDF2_ITERATIONS ||
    kdf.iterations > MAX_PBKDF2_ITERATIONS ||
    typeof kdf.salt !== `string` ||
    typeof cipher.iv !== `string` ||
    typeof ciphertext !== `string`
  ) {
    throw new SaveStateError(`unsupported-encryption`);
  }
  const salt = fromBase64(kdf.salt);
  const iv = fromBase64(cipher.iv);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) throw new SaveStateError(`unsupported-encryption`);
  const key = await deriveKey(passphrase, salt, kdf.iterations, `decrypt`);
  try {
    const pt = await subtle().decrypt(
      { name: `AES-GCM`, iv, additionalData: headerAad(envelope) },
      key,
      fromBase64(ciphertext)
    );
    return new TextDecoder().decode(pt);
  } catch {
    // Wrong passphrase and tampered data are indistinguishable by design.
    throw new SaveStateError(`decrypt-failed`);
  }
}
