import { chromium, type Browser, type LaunchOptions } from 'playwright';

/**
 * Headless Chromium pinned by the `playwright` / `playwright-core` 1.64.0 devDependency
 * (`browsers.json`: Chromium 156.0.8078.4, revision 1248).
 *
 * Neither package declares a lifecycle script. `npm ci --ignore-scripts` does not download a browser.
 * Install this revision with `npx playwright install chromium` (CI adds `--with-deps`).
 */
export function launchPinnedChromium(options: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch({ headless: true, ...options });
}
