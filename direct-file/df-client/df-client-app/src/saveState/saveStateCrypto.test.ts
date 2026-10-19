import { describe, expect, it } from 'vitest';
import {
  decryptText,
  encryptText,
  EncryptedEnvelope,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
} from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';
import { PASSPHRASE, TEST_ITERATIONS } from './saveStateTestUtils.js';

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as SaveStateError).code;
  }
  return `no-error`;
};

const secret = JSON.stringify({ '/filers/#1/lastName': { $type: `x`, item: `Testerson` } });

describe(`save-state encryption (PBKDF2 + AES-GCM)`, () => {
  it(`uses at least 600,000 PBKDF2 iterations by default`, () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it(`round-trips with the right passphrase and stores no plaintext`, async () => {
    const env = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    expect(env.kdf).toMatchObject({ name: `PBKDF2`, hash: `SHA-256`, iterations: TEST_ITERATIONS });
    expect(env.cipher.name).toBe(`AES-GCM`);
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain(`Testerson`);
    expect(serialized).not.toContain(PASSPHRASE);
    expect(await decryptText(env, PASSPHRASE)).toBe(secret);
  });

  it(`uses a fresh salt and IV each time`, async () => {
    const a = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    const b = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it(`fails closed on a wrong passphrase`, async () => {
    const env = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    expect(await codeOf(decryptText(env, `wrong passphrase!!`))).toBe(`decrypt-failed`);
  });

  it(`detects a modified ciphertext`, async () => {
    const env = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    const bytes = Uint8Array.from(atob(env.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...env, ciphertext: btoa(String.fromCharCode(...bytes)) };
    expect(await codeOf(decryptText(tampered, PASSPHRASE))).toBe(`decrypt-failed`);
  });

  it(`binds the header: changing the iteration count breaks decryption`, async () => {
    const env = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
    const tampered: EncryptedEnvelope = { ...env, kdf: { ...env.kdf, iterations: TEST_ITERATIONS + 1 } };
    expect(await codeOf(decryptText(tampered, PASSPHRASE))).toBe(`decrypt-failed`);
  });

  it.each([MIN_PBKDF2_ITERATIONS - 1, MAX_PBKDF2_ITERATIONS + 1])(
    `refuses files with an out-of-range iteration count (%i)`,
    async (iterations) => {
      const env = await encryptText(secret, PASSPHRASE, TEST_ITERATIONS);
      expect(await codeOf(decryptText({ ...env, kdf: { ...env.kdf, iterations } }, PASSPHRASE))).toBe(
        `unsupported-encryption`
      );
    }
  );

  it(`requires a passphrase of at least 12 characters to encrypt`, async () => {
    expect(await codeOf(encryptText(secret, ``, TEST_ITERATIONS))).toBe(`passphrase-required`);
    expect(await codeOf(encryptText(secret, `short`, TEST_ITERATIONS))).toBe(`passphrase-too-short`);
  });
});
