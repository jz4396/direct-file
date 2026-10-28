import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

/**
 * Headless Chromium pinned by the `playwright` / `playwright-core` 1.64.0 devDependency
 * (`browsers.json`: Chromium 156.0.8078.4, revision 1248).
 *
 * Neither package declares a lifecycle script. `npm ci --ignore-scripts` does not download a browser.
 * Install this revision with `npx playwright install chromium` (CI adds `--with-deps`).
 * Launch throws if the running browser's version is not the `browserVersion` in that `browsers.json`.
 */
const require = createRequire(import.meta.url);

/** `browserVersion` of the chromium entry in the installed playwright-core `browsers.json`. */
export function pinnedChromiumVersion(): string {
  const pkg = require.resolve(`playwright-core/package.json`);
  const doc = JSON.parse(fs.readFileSync(path.join(path.dirname(pkg), `browsers.json`), `utf8`)) as {
    browsers: { name: string; browserVersion?: string }[];
  };
  const version = doc.browsers.find((browser) => browser.name === `chromium`)?.browserVersion;
  if (!version) throw new Error(`playwright-core browsers.json has no chromium browserVersion`);
  return version;
}

export async function launchPinnedChromium(options: LaunchOptions = {}): Promise<Browser> {
  const browser = await chromium.launch({ headless: true, ...options });
  const expected = pinnedChromiumVersion();
  const actual = browser.version();
  if (actual !== expected) {
    await browser.close();
    throw new Error(`Launched Chromium ${actual}; playwright-core pins ${expected}`);
  }
  return browser;
}
