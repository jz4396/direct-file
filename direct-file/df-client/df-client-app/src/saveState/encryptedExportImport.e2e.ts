import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { Browser, Page, Request } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchPinnedChromium } from '../staticClient/noRetention/pinnedChromium.js';
import { startStagedSiteServer, type StagedSiteServer } from '../staticClient/noRetention/stagedSiteServer.js';
import { scenarioFactGraphJson, TEST_ITERATIONS } from './saveStateTestUtils.js';
import { createSaveState, DEFAULT_TAX_YEAR, SAVE_STATE_FORMAT, SAVE_STATE_VERSION } from './saveStateSchema.js';
import { exportSaveFile } from './saveStateFile.js';
import { decryptText, ENCRYPTED_FORMAT, PBKDF2_ITERATIONS, type EncryptedEnvelope } from './saveStateCrypto.js';

/**
 * Save-file behavior in a real browser (#126, under #132).
 *
 * The staged static site is driven the way a person would: load a synthetic return, download it as an encrypted
 * save file, clear all data on this device, reload (that drops the in-memory return; clear itself wipes storage
 * and caches, and the exported file is the only copy left), then import the file with the passphrase. A wrong
 * passphrase and an encrypted file for another tax year each show their error and leave the open return as it is.
 *
 * The downloaded file is an AES-GCM envelope at the production PBKDF2 iteration count. The marker and the
 * passphrase are not in that file, and neither is in any request.
 *
 * A second case covers the plaintext acknowledgment gate, a v1 (bare fact-graph) file migrating into the open
 * return, and a future schema version being rejected without changing that return.
 */

const APP_DIR = path.resolve(__dirname, `../..`);
const SITE_DIR = path.resolve(APP_DIR, `../cloudflare-pages/out`);

const t = (
  yaml.load(fs.readFileSync(path.join(APP_DIR, `src/locales/en.saveState.yaml`), `utf8`)) as {
    account: {
      deviceData: {
        title: string;
        export: {
          button: string;
          doneEncrypted: string;
          donePlain: string;
          plaintextWarning: string;
          plaintextAck: string;
        };
        import: { button: string; done: string };
        clear: { button: string; done: string };
        errors: { 'decrypt-failed': string; 'wrong-tax-year': string; 'unsupported-version': string };
      };
    };
  }
).account.deviceData;

/** Unique to this return. Not a word the rest of the site uses. */
const MARKER = `Cindercanary`;
/** Unique to the other-year file, so a rejected import cannot be mistaken for a success. */
const WRONG_YEAR_MARKER = `Yearcanary`;
const PASSPHRASE = `lantern orchard granite 42`;
const WRONG_PASSPHRASE = `not the passphrase`;

type PersistedFact = { $type: string; item: unknown };

function factsNamed(firstName: string): Record<string, PersistedFact> {
  const facts = scenarioFactGraphJson() as Record<string, PersistedFact>;
  const primary = Object.keys(facts)
    .find((key) => key.endsWith(`/isPrimaryFiler`) && facts[key].item === true)
    ?.replace(/\/isPrimaryFiler$/, ``);
  if (!primary) throw new Error(`scenario has no primary filer`);
  facts[`${primary}/firstName`] = { $type: `gov.irs.factgraph.persisters.StringWrapper`, item: firstName };
  return facts;
}

describe(`save-state export and import (real browser)`, () => {
  let site: StagedSiteServer;
  let browser: Browser;
  let seedFile: string;
  let wrongYearFile: string;

  beforeAll(async () => {
    if (!fs.existsSync(path.join(SITE_DIR, `index.html`))) {
      throw new Error(`${SITE_DIR} not found: run npm run build:static && npm run stage:static first`);
    }
    seedFile = JSON.stringify(createSaveState(factsNamed(MARKER)));
    // Minimum accepted iterations: the browser still decrypts it, then rejects the year inside.
    wrongYearFile = (
      await exportSaveFile(factsNamed(WRONG_YEAR_MARKER), {
        taxYear: DEFAULT_TAX_YEAR - 1,
        passphrase: PASSPHRASE,
        iterations: TEST_ITERATIONS,
      })
    ).text;
    site = await startStagedSiteServer(SITE_DIR);
    browser = await launchPinnedChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await site?.close();
  });

  const statusShows = (page: Page, text: string) =>
    page.getByTestId(`device-data-status`).filter({ hasText: text }).waitFor();

  const openDeviceData = async (page: Page) => {
    await page.evaluate(() => {
      window.history.pushState({}, ``, `/df/file/account/device-data`);
      window.dispatchEvent(new PopStateEvent(`popstate`));
    });
    await page.getByRole(`heading`, { name: t.title, level: 1 }).waitFor();
  };

  const startReturn = async (page: Page) => {
    await page.goto(`${site.origin}/df/file/home`);
    await page.getByRole(`button`, { name: /^Start my \d{4} federal tax return$/ }).click();
    await page.waitForURL(/\/pre-checklist/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/load-taxpayer-info/);
    await page.getByRole(`button`, { name: `Continue`, exact: true }).click();
    await page.waitForURL(/\/checklist/);
    await openDeviceData(page);
  };

  const chooseFile = async (page: Page, name: string, text: string) => {
    await page.locator(`#import-file`).setInputFiles({
      name,
      mimeType: `application/json`,
      buffer: Buffer.from(text),
    });
  };

  /**
   * The passphrase field is rendered only after the chosen file has been read and recognized as encrypted. Clearing
   * the input first makes that field go away, so waiting for it to come back means the new file is the one that
   * will be imported.
   */
  const chooseEncryptedFile = async (page: Page, name: string, text: string) => {
    await page.locator(`#import-file`).setInputFiles([]);
    await page.locator(`#import-passphrase`).waitFor({ state: `detached` });
    await chooseFile(page, name, text);
    await page.locator(`#import-passphrase`).waitFor();
  };

  /**
   * Clearing the input drops the previous file (Import disables). Waiting until Import is enabled again means the
   * new file has been read. A plaintext file never asks for a passphrase.
   */
  const choosePlainFile = async (page: Page, name: string, text: string) => {
    const importReady = (enabled: boolean) =>
      page.waitForFunction(
        ({ label, enabled: want }) => {
          const button = [...document.querySelectorAll(`button`)].find((el) => el.textContent?.includes(label));
          return !!button && (button as HTMLButtonElement).disabled !== want;
        },
        { label: t.import.button, enabled }
      );
    await page.locator(`#import-file`).setInputFiles([]);
    await importReady(false);
    await chooseFile(page, name, text);
    await importReady(true);
    await page.locator(`#import-passphrase`).waitFor({ state: `detached` });
  };

  const downloadSave = async (page: Page) => {
    const [download] = await Promise.all([
      page.waitForEvent(`download`),
      page.getByRole(`button`, { name: t.export.button }).click(),
    ]);
    const text = fs.readFileSync(await download.path(), `utf8`);
    const filename = download.suggestedFilename();
    await download.delete();
    return { text, filename };
  };

  const exportPlaintext = async (page: Page) => {
    await page.locator(`label[for="export-plaintext-ack"]`).click();
    expect(await page.locator(`#export-plaintext-ack`).isChecked()).toBe(true);
    const saved = await downloadSave(page);
    await statusShows(page, t.export.donePlain);
    expect(saved.filename.endsWith(`.encrypted.json`)).toBe(false);
    return saved.text;
  };

  it(`restores the return after clear, and rejects a wrong passphrase and a wrong tax year`, async () => {
    const context = await browser.newContext({ acceptDownloads: true });
    const requests: Request[] = [];
    const aborted: string[] = [];
    context.on(`request`, (request) => requests.push(request));
    await context.route(`**/*`, (route) => {
      const url = route.request().url();
      if (url.startsWith(`${site.origin}/`) || url.startsWith(`blob:`)) return route.continue();
      aborted.push(`${route.request().method()} ${url}`);
      return route.abort(`blockedbyclient`);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);

    await startReturn(page);
    await chooseFile(page, `scenario.json`, seedFile);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.import.done);

    await page.locator(`#export-passphrase`).fill(PASSPHRASE);
    const exported = await downloadSave(page);
    await statusShows(page, t.export.doneEncrypted);
    expect(exported.filename.startsWith(`direct-file-${DEFAULT_TAX_YEAR}-`)).toBe(true);
    expect(exported.filename.endsWith(`.encrypted.json`)).toBe(true);
    const envelope = JSON.parse(exported.text) as EncryptedEnvelope;
    expect(envelope.format).toBe(ENCRYPTED_FORMAT);
    expect(envelope.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(envelope.cipher.name).toBe(`AES-GCM`);
    expect(exported.text.includes(MARKER)).toBe(false);
    expect(exported.text.includes(PASSPHRASE)).toBe(false);
    expect(await decryptText(envelope, PASSPHRASE)).toContain(MARKER);
    await expect(decryptText(envelope, WRONG_PASSPHRASE)).rejects.toThrow(/decrypt-failed/);

    await page.getByRole(`button`, { name: t.clear.button }).click();
    await statusShows(page, t.clear.done);
    expect(
      await page.evaluate(async () => ({
        local: localStorage.length,
        session: sessionStorage.length,
        caches: await caches.keys(),
        databases: (await indexedDB.databases()).map((db) => db.name ?? ``),
        serviceWorkers: (await navigator.serviceWorker.getRegistrations()).map((reg) => reg.scope),
      }))
    ).toEqual({ local: 0, session: 0, caches: [], databases: [], serviceWorkers: [] });

    // A full load drops the in-memory return. The encrypted file is the only copy of the marker.
    await startReturn(page);
    expect((await exportPlaintext(page)).includes(MARKER)).toBe(false);

    await chooseEncryptedFile(page, exported.filename, exported.text);
    await page.locator(`#import-passphrase`).fill(PASSPHRASE);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.import.done);
    expect(await exportPlaintext(page)).toContain(MARKER);

    await chooseEncryptedFile(page, exported.filename, exported.text);
    await page.locator(`#import-passphrase`).fill(WRONG_PASSPHRASE);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.errors[`decrypt-failed`]);
    const afterWrongPassphrase = await exportPlaintext(page);
    expect(afterWrongPassphrase).toContain(MARKER);
    expect(afterWrongPassphrase.includes(WRONG_YEAR_MARKER)).toBe(false);

    await chooseEncryptedFile(page, `other-year.encrypted.json`, wrongYearFile);
    await page.locator(`#import-passphrase`).fill(PASSPHRASE);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.errors[`wrong-tax-year`]);
    const afterWrongYear = await exportPlaintext(page);
    expect(afterWrongYear).toContain(MARKER);
    expect(afterWrongYear.includes(WRONG_YEAR_MARKER)).toBe(false);

    expect(aborted).toEqual([]);
    const secrets = [MARKER, WRONG_YEAR_MARKER, PASSPHRASE, WRONG_PASSPHRASE];
    const leaks: string[] = [];
    for (const request of requests) {
      const headers = JSON.stringify(await request.allHeaders().catch(() => request.headers()));
      const blob = `${request.method()} ${request.url()}\n${headers}\n${request.postData() ?? ``}`;
      const decoded = (() => {
        try {
          return decodeURIComponent(blob);
        } catch {
          return blob;
        }
      })();
      for (const secret of secrets) {
        if (blob.includes(secret) || decoded.includes(secret)) {
          leaks.push(`${secret} in ${request.method()} ${request.url()}`);
        }
      }
      if (request.postData() && !request.url().startsWith(`blob:`)) {
        leaks.push(`body on ${request.method()} ${request.url()}`);
      }
    }
    expect(leaks).toEqual([]);

    await context.close();
  }, 180_000);

  it(`gates plaintext export, migrates a v1 file, and rejects a future version`, async () => {
    const v1Marker = `Migrcanary`;
    const futureMarker = `Futucanary`;
    const v1File = JSON.stringify(factsNamed(v1Marker));
    const futureVersion = SAVE_STATE_VERSION + 1;
    const futureFile = JSON.stringify({ ...createSaveState(factsNamed(futureMarker)), version: futureVersion });
    expect(JSON.parse(v1File).format).toBeUndefined();
    expect(JSON.parse(v1File).version).toBeUndefined();
    expect(JSON.parse(futureFile).version).toBe(futureVersion);
    expect(futureVersion).toBeGreaterThan(SAVE_STATE_VERSION);

    const context = await browser.newContext({ acceptDownloads: true });
    const requests: Request[] = [];
    const aborted: string[] = [];
    context.on(`request`, (request) => requests.push(request));
    await context.route(`**/*`, (route) => {
      const url = route.request().url();
      if (url.startsWith(`${site.origin}/`) || url.startsWith(`blob:`)) return route.continue();
      aborted.push(`${route.request().method()} ${url}`);
      return route.abort(`blockedbyclient`);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);

    await startReturn(page);

    const downloadButton = page.getByRole(`button`, { name: t.export.button });
    const ack = page.locator(`#export-plaintext-ack`);
    const toggleAck = () => page.locator(`label[for="export-plaintext-ack"]`).click();

    // No passphrase and no acknowledgment: the download control does not run.
    await page.getByText(t.export.plaintextWarning).waitFor();
    await page.getByText(t.export.plaintextAck).waitFor();
    expect(await ack.isChecked()).toBe(false);
    expect(await downloadButton.isDisabled()).toBe(true);
    await expect(downloadButton.click({ timeout: 1_000 })).rejects.toThrow();

    await toggleAck();
    expect(await ack.isChecked()).toBe(true);
    expect(await downloadButton.isEnabled()).toBe(true);
    await toggleAck();
    expect(await ack.isChecked()).toBe(false);
    expect(await downloadButton.isDisabled()).toBe(true);

    // A passphrase too short to encrypt still cannot download, and it is not the plaintext path.
    await page.locator(`#export-passphrase`).fill(`short`);
    await ack.waitFor({ state: `detached` });
    expect(await downloadButton.isDisabled()).toBe(true);
    await page.locator(`#export-passphrase`).fill(PASSPHRASE);
    await ack.waitFor({ state: `detached` });
    expect(await downloadButton.isEnabled()).toBe(true);
    await page.locator(`#export-passphrase`).fill(``);
    await page.getByText(t.export.plaintextWarning).waitFor();
    expect(await ack.isChecked()).toBe(false);
    expect(await downloadButton.isDisabled()).toBe(true);

    const downloaded = JSON.parse(await exportPlaintext(page)) as {
      format: string;
      version: number;
      facts: unknown;
    };
    expect(downloaded.format).toBe(SAVE_STATE_FORMAT);
    expect(downloaded.version).toBe(SAVE_STATE_VERSION);
    expect(JSON.stringify(downloaded).includes(v1Marker)).toBe(false);
    expect(await ack.isChecked()).toBe(false);
    expect(await downloadButton.isDisabled()).toBe(true);

    await choosePlainFile(page, `v1.json`, v1File);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.import.done);
    const migrated = JSON.parse(await exportPlaintext(page)) as {
      format: string;
      version: number;
      taxYear: number;
      facts: unknown;
    };
    expect(migrated.format).toBe(SAVE_STATE_FORMAT);
    expect(migrated.version).toBe(SAVE_STATE_VERSION);
    expect(migrated.taxYear).toBe(DEFAULT_TAX_YEAR);
    expect(JSON.stringify(migrated.facts)).toContain(v1Marker);
    expect(JSON.stringify(migrated.facts).includes(futureMarker)).toBe(false);

    await choosePlainFile(page, `future.json`, futureFile);
    await page.getByRole(`button`, { name: t.import.button }).click();
    await statusShows(page, t.errors[`unsupported-version`]);
    const statusText = await page.getByTestId(`device-data-status`).innerText();
    expect(statusText.includes(futureMarker)).toBe(false);
    expect(statusText.includes(v1Marker)).toBe(false);
    const afterReject = await exportPlaintext(page);
    expect(afterReject).toContain(v1Marker);
    expect(afterReject.includes(futureMarker)).toBe(false);
    expect(JSON.parse(afterReject).version).toBe(SAVE_STATE_VERSION);

    expect(aborted).toEqual([]);
    const secrets = [v1Marker, futureMarker, PASSPHRASE];
    const leaks: string[] = [];
    for (const request of requests) {
      const headers = JSON.stringify(await request.allHeaders().catch(() => request.headers()));
      const blob = `${request.method()} ${request.url()}\n${headers}\n${request.postData() ?? ``}`;
      const decoded = (() => {
        try {
          return decodeURIComponent(blob);
        } catch {
          return blob;
        }
      })();
      for (const secret of secrets) {
        if (blob.includes(secret) || decoded.includes(secret)) {
          leaks.push(`${secret} in ${request.method()} ${request.url()}`);
        }
      }
      if (request.postData() && !request.url().startsWith(`blob:`)) {
        leaks.push(`body on ${request.method()} ${request.url()}`);
      }
    }
    expect(leaks).toEqual([]);

    await context.close();
  }, 180_000);
});
