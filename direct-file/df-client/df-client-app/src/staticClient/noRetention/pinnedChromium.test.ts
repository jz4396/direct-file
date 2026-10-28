import { describe, expect, it } from 'vitest';
import { pinnedChromiumVersion } from './pinnedChromium.js';

describe(`pinned Chromium`, () => {
  it(`reads the chromium browserVersion from the installed playwright-core pin`, () => {
    expect(pinnedChromiumVersion()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
