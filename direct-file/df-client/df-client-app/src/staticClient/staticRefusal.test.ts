import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATIC_UNAVAILABLE } from './localApi.js';
import {
  STATIC_EFILE_REFUSAL_KEY,
  STATIC_PDF_REFUSAL_KEY,
  staticEfileRefusalKey,
  staticPdfRefusalKey,
} from './staticRefusal.js';

describe(`static client PDF and e-file refusal`, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(`names a refusal in the static client and never a success key`, () => {
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, `true`);
    expect(staticPdfRefusalKey()).toBe(STATIC_PDF_REFUSAL_KEY);
    expect(staticEfileRefusalKey({ message: STATIC_UNAVAILABLE })).toBe(STATIC_EFILE_REFUSAL_KEY);
    expect(staticEfileRefusalKey({ message: `other` })).toBeNull();
    expect(staticEfileRefusalKey(null)).toBeNull();
  });

  it(`does not apply the static refusal on the server build`, () => {
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, ``);
    expect(staticPdfRefusalKey()).toBeNull();
    expect(staticEfileRefusalKey({ message: STATIC_UNAVAILABLE })).toBeNull();
  });
});
