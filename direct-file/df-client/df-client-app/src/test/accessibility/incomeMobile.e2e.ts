import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { scenarioFactGraphJson } from '../../saveState/saveStateTestUtils.js';
import { createSaveState } from '../../saveState/saveStateSchema.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { startStagedSiteServer, type StagedSiteServer } from '../../staticClient/noRetention/stagedSiteServer.js';

/**
 * Mobile-width checks on the income entry screens (#90), in a real browser at 320 CSS pixels wide.
 *
 * Runs the staged static site (`npm run build:static && npm run stage:static`) in headless Chrome, imports a
 * synthetic return with one W-2, one 1099-INT and one 1099-R, and opens every W-2, 1099-INT and 1099-R screen
 * directly, then checks:
 *
 * - WCAG 2.1 SC 1.4.10 (Reflow): at a 320px-wide viewport the page doesn't scroll sideways, and no visible
 *   element sticks out past the right edge.
 * - WCAG 2.2 SC 2.5.8 (Target Size, Minimum): every form control, button, and radio or checkbox tile is at least
 *   24 by 24 CSS pixels, or meets the criterion's spacing exception (a 24px circle centered on it touches no other
 *   target). Links inside a sentence are exempt, as the criterion allows. (The 44px of SC 2.5.5 is AAA and isn't
 *   asserted.)
 *
 * Chrome comes from CHROME_PATH, or else Playwright's `chrome` channel (the installed Google Chrome). No browser is
 * downloaded, and requests to any host but the local server are aborted.
 */

const APP_DIR = path.resolve(__dirname, `../../..`);
const SITE_DIR = path.resolve(APP_DIR, `../cloudflare-pages/out`);
const WIDTH = 320;
const MIN_TARGET = 24;
const ERROR_PAGE_TEXT = `We’re experiencing a problem`;

const t = (
  yaml.load(fs.readFileSync(path.join(APP_DIR, `src/locales/en.saveState.yaml`), `utf8`)) as {
    account: { deviceData: { title: string; import: Record<string, string> } };
  }
).account.deviceData;

const flow = createFlowConfig(flowNodes);
const SUBCATEGORIES: Record<string, string> = {
  '/flow/income/jobs': `/formW2s`,
  '/flow/income/interest': `/interestReports`,
  '/flow/income/retirement': `/form1099Rs`,
};
// This screen sits behind the data-import gate and every one of its headings requires that no 1099-INT has been
// added yet. The return used here has one, so the screen has no heading by design and the app shows its error page.
const SKIPPED_ROUTES = new Set([`/flow/income/interest/int-income-loop-intro-data-import`]);
const screens = flow.screens.filter(
  (s) =>
    s.subcategoryRoute in SUBCATEGORIES &&
    !SKIPPED_ROUTES.has(s.screenRoute) &&
    // Screens outside the form's collection loop (the intro and hub screens) are opened without an item.
    (!s.collectionContext || s.collectionContext === SUBCATEGORIES[s.subcategoryRoute])
);

/** The golden scenario with one item added to each of the 1099-INT and 1099-R collections. */
function saveFileWithItems(): { text: string; ids: Record<string, string> } {
  const facts = scenarioFactGraphJson() as Record<string, { $type: string; item: { items: string[] } }>;
  const ids: Record<string, string> = { '/formW2s': facts[`/formW2s`].item.items[0] };
  for (const collection of [`/interestReports`, `/form1099Rs`]) {
    ids[collection] = randomUUID();
    facts[collection] = { $type: facts[`/formW2s`].$type, item: { items: [ids[collection]] } };
  }
  return { text: JSON.stringify(createSaveState(facts)), ids };
}

type Measured = {
  heading: string;
  scrollWidth: number;
  clientWidth: number;
  overflowing: string[];
  smallTargets: string[];
};

/** Runs in the page: horizontal overflow and target sizes on the current screen. */
function measure({ width, minTarget }: { width: number; minTarget: number }): Measured {
  const name = (el: Element) => {
    const text = (el.getAttribute(`aria-label`) || el.textContent || ``).trim().replace(/\s+/g, ` `).slice(0, 40);
    const cls =
      typeof el.className === `string` && el.className ? `.${el.className.trim().split(/\s+/).join(`.`)}` : ``;
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ``}${cls} "${text}"`;
  };
  const isShown = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === `hidden` || style.display === `none`) return false;
    // Visually hidden content (usa-sr-only, the native input behind a USWDS radio tile) sits off screen on purpose.
    if (r.right <= 0 || r.bottom <= 0) return false;
    return !el.closest(`.usa-sr-only, [aria-hidden="true"], .usa-modal-wrapper.is-hidden`);
  };
  const main = document.querySelector(`main`) ?? document.body;
  const overflowing = [...main.querySelectorAll(`*`)]
    .filter((el) => isShown(el) && el.getBoundingClientRect().right > width + 0.5)
    // Report only the outermost offender of each subtree.
    .filter((el, _i, all) => !all.some((other) => other !== el && other.contains(el)))
    .map(name);
  const targets = [
    ...main.querySelectorAll(
      `button, select, textarea, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), ` +
        `.usa-radio__label, .usa-checkbox__label, a.usa-button, [role="button"]`
    ),
  ].filter(isShown);
  const isInline = (el: Element) =>
    getComputedStyle(el).display === `inline` && !!el.closest(`p, li, .usa-hint, .usa-alert__text`);
  const rects = targets.map((el) => el.getBoundingClientRect());
  const undersized = targets.map((el, i) => rects[i].width < minTarget || rects[i].height < minTarget);
  const radius = minTarget / 2;
  const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  // Distance from a point to the nearest point of a box (0 inside it).
  const toBox = (p: { x: number; y: number }, r: DOMRect) =>
    Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  // The SC's spacing exception: a 24px circle centered on the undersized target doesn't intersect another target,
  // or the circle of another undersized target.
  const spaced = (i: number) =>
    rects.every((other, j) => {
      if (j === i || targets[j].contains(targets[i]) || targets[i].contains(targets[j])) return true;
      const c = center(rects[i]);
      if (toBox(c, other) < radius) return false;
      if (undersized[j]) {
        const d = center(other);
        if (Math.hypot(c.x - d.x, c.y - d.y) < 2 * radius) return false;
      }
      return true;
    });
  const smallTargets = targets
    .filter((el, i) => undersized[i] && !isInline(el) && !spaced(i))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    });
  return {
    heading: document.querySelector(`h1`)?.textContent?.trim() ?? ``,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflowing,
    smallTargets,
  };
}

describe(`Income screens at 320px wide (reflow and target size)`, () => {
  let site: StagedSiteServer;
  let browser: Browser;
  let page: Page;
  let ids: Record<string, string>;
  const aborted: string[] = [];
  const pageErrors: string[] = [];

  /** History API navigation, so the imported return (held in memory) stays. */
  async function openInApp(url: string) {
    await page.evaluate((to) => {
      window.history.pushState({}, ``, to);
      window.dispatchEvent(new PopStateEvent(`popstate`));
    }, url);
  }

  let saveFile: string;

  /** A new return in a fresh page load, with the save file imported. */
  async function startWithReturn() {
    await page.goto(`${site.origin}/df/file/home`);
    await page.getByRole(`button`, { name: /^Start my \d{4} federal tax return$/ }).click();
    await page.waitForURL(/\/pre-checklist/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/load-taxpayer-info/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/checklist/);
    await openInApp(`/df/file/account/device-data`);
    await page.getByRole(`heading`, { name: t.title, level: 1 }).waitFor();
    await page.locator(`#import-file`).setInputFiles({
      name: `scenario.json`,
      mimeType: `application/json`,
      buffer: Buffer.from(saveFile),
    });
    await page.getByRole(`button`, { name: t.import.button }).click();
    await page.getByTestId(`device-data-status`).filter({ hasText: t.import.done }).waitFor();
  }

  beforeAll(async () => {
    if (!fs.existsSync(path.join(SITE_DIR, `index.html`))) {
      throw new Error(`${SITE_DIR} not found: run npm run build:static && npm run stage:static first`);
    }
    ({ text: saveFile, ids } = saveFileWithItems());
    site = await startStagedSiteServer(SITE_DIR);
    browser = await chromium.launch(
      process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: `chrome` }
    );
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: 640 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.route(`**/*`, (route) => {
      const url = route.request().url();
      if (url.startsWith(`${site.origin}/`)) return route.continue();
      aborted.push(url);
      return route.abort(`blockedbyclient`);
    });
    page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on(`pageerror`, (error) => pageErrors.push(error.message.split(`\n`)[0]));
    page.on(`console`, (m) => m.type() === `error` && pageErrors.push(`console: ${m.text().split(`\n`)[0]}`));

    await startWithReturn();
  }, 120_000);

  // A screen that throws shows the app's error page, which stays up; start over so the next screen is checked on
  // its own.
  afterEach(async () => {
    pageErrors.length = 0;
    if (await page.getByText(ERROR_PAGE_TEXT).count()) await startWithReturn();
  });

  afterAll(async () => {
    await browser?.close();
    await site?.close();
  });

  it(`covers the W-2, 1099-INT and 1099-R screens`, () => {
    const routes = screens.map((s) => s.route);
    expect(screens.length).toBeGreaterThan(60);
    for (const route of [
      `w2-add-boxes-1-8`,
      `w2-add-boxes-10-11`,
      `1099-int-add-box-1`,
      `retirement-add-box-7-checkbox`,
    ])
      expect(routes).toContain(route);
  });

  it.each(screens.map((s) => [s.screenRoute, s] as const))(`%s`, async (_route, config) => {
    const query = config.collectionContext
      ? `?${new URLSearchParams([[config.collectionContext, ids[config.collectionContext]]])}`
      : ``;
    await openInApp(`/df/file${config.screenRoute}${query}`);
    await page.waitForFunction((route) => window.location.pathname.endsWith(route), config.screenRoute, {
      timeout: 5_000,
    });
    const errorPage = page.getByText(ERROR_PAGE_TEXT);
    await page.locator(`main h1`).or(errorPage).first().waitFor({ timeout: 5_000 });
    expect(await errorPage.count(), pageErrors.join(`\n`)).toBe(0);
    const measured = await page.evaluate(measure, { width: WIDTH, minTarget: MIN_TARGET });
    expect(measured.heading).not.toBe(``);
    expect({ scrollWidth: measured.scrollWidth, overflowing: measured.overflowing }).toEqual({
      scrollWidth: measured.clientWidth,
      overflowing: [],
    });
    expect(measured.smallTargets).toEqual([]);
    expect(aborted).toEqual([]);
  });
});
