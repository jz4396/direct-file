import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapComponent } from '../test/helpers.js';
import { setupFactGraph } from '../test/setupFactGraph.js';
import { DEVICE_SAVE_KEY } from './deviceSaveStore.js';
import { PASSPHRASE, scenarioFactGraphJson, scenarioFacts } from './saveStateTestUtils.js';
import { MAX_SAVE_FILE_BYTES } from './saveStateFile.js';
import { DEFAULT_TAX_YEAR, SAVE_STATE_FORMAT } from './saveStateSchema.js';

vi.mock(`react-i18next`, () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: `3rdParty`, init: () => {} },
}));

// Keep the UI test fast: the reader enforces its own minimum, so use exactly that.
vi.mock(`./saveStateCrypto.js`, async (importActual) => {
  const actual = (await importActual()) as typeof import('./saveStateCrypto.js');
  return { ...actual, PBKDF2_ITERATIONS: actual.MIN_PBKDF2_ITERATIONS };
});

const replaceFactGraphWithFacts = vi.fn();
const holder: { factGraph?: ReturnType<typeof setupFactGraph>[`factGraph`] } = {};
vi.mock(`../factgraph/FactGraphContext.js`, () => ({
  useFactGraph: () => ({ factGraph: holder.factGraph }),
  replaceFactGraphWithFacts: (...args: unknown[]) => replaceFactGraphWithFacts(...args),
}));
vi.mock(`../flow/flowConfig.js`, () => ({ useFlow: () => undefined }));

import DeviceDataPage from './DeviceDataPage.js';

const status = () => screen.findByTestId(`device-data-status`);

describe(`DeviceDataPage`, () => {
  const fetchSpy = vi.fn();
  let downloaded: Blob[] = [];

  beforeEach(() => {
    holder.factGraph = setupFactGraph(scenarioFacts).factGraph;
    downloaded = [];
    vi.stubGlobal(`fetch`, fetchSpy);
    URL.createObjectURL = vi.fn((b: Blob) => (downloaded.push(b), `blob:test`)) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    replaceFactGraphWithFacts.mockReset();
    fetchSpy.mockReset();
  });

  it(`shows shared-computer guidance and the clear control`, () => {
    render(wrapComponent(<DeviceDataPage />));
    expect(screen.getByText(`account.deviceData.sharedComputer.body`)).toBeInTheDocument();
    expect(screen.getByRole(`button`, { name: `account.deviceData.clear.button` })).toBeEnabled();
  });

  it(`blocks a plaintext export until the warning is acknowledged`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    const button = screen.getByRole(`button`, { name: `account.deviceData.export.button` });
    expect(screen.getByText(`account.deviceData.export.plaintextWarning`)).toBeInTheDocument();
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText(`account.deviceData.export.plaintextAck`));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect((await status()).textContent).toBe(`account.deviceData.export.donePlain`);
    expect(downloaded).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it(`exports an encrypted file when a passphrase is given`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    fireEvent.change(screen.getByLabelText(`account.deviceData.passphraseOptional`), { target: { value: PASSPHRASE } });
    expect(screen.queryByText(`account.deviceData.export.plaintextWarning`)).toBeNull();
    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.export.button` }));
    expect((await status()).textContent).toBe(`account.deviceData.export.doneEncrypted`);
    const text = await downloaded[0].text();
    expect(JSON.parse(text).format).toBe(`df-save-state-encrypted`);
    expect(text).not.toContain(`Testerson`);
  });

  it(`saves on this device, loads it back into the fact graph, and clears it`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    const pass = screen.getByLabelText(`account.deviceData.passphrase`) as HTMLInputElement;
    fireEvent.change(pass, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.device.saveButton` }));
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.device.saved`));
    expect(localStorage.getItem(DEVICE_SAVE_KEY)).not.toContain(`Testerson`);
    expect(pass.value).toBe(``);

    fireEvent.change(pass, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.device.loadButton` }));
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.device.loaded`));
    expect(replaceFactGraphWithFacts).toHaveBeenCalledWith(JSON.parse(holder.factGraph?.toJSON() ?? `{}`), undefined);

    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.clear.button` }));
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.clear.done`));
    expect(localStorage.getItem(DEVICE_SAVE_KEY)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it(`shows a code-only error for a wrong passphrase`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    const pass = screen.getByLabelText(`account.deviceData.passphrase`);
    fireEvent.change(pass, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.device.saveButton` }));
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.device.saved`));
    fireEvent.change(pass, { target: { value: `not the passphrase` } });
    fireEvent.click(screen.getByRole(`button`, { name: `account.deviceData.device.loadButton` }));
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.errors.decrypt-failed`));
    expect(replaceFactGraphWithFacts).not.toHaveBeenCalled();
  });
});

describe(`DeviceDataPage import validation`, () => {
  const fetchSpy = vi.fn();
  const xhrOpen = vi.fn();
  const facts = scenarioFactGraphJson();
  const B = `gov.irs.factgraph.persisters.`;
  const saveFile = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: SAVE_STATE_FORMAT,
      version: 2,
      taxYear: DEFAULT_TAX_YEAR,
      savedAt: `2027-02-01T00:00:00.000Z`,
      facts,
      ...over,
    });
  const pick = (text: string, size = text.length) => {
    const file = new File([`x`], `save.json`, { type: `application/json` });
    Object.defineProperty(file, `size`, { value: size });
    const read = vi.fn(() => Promise.resolve(text));
    Object.defineProperty(file, `text`, { value: read });
    fireEvent.change(screen.getByLabelText(`account.deviceData.import.fileLabel`), { target: { files: [file] } });
    return read;
  };
  const importButton = () => screen.getByRole(`button`, { name: `account.deviceData.import.button` });
  let graphBefore = ``;

  beforeEach(() => {
    holder.factGraph = setupFactGraph(scenarioFacts).factGraph;
    graphBefore = holder.factGraph.toJSON();
    vi.stubGlobal(`fetch`, fetchSpy);
    vi.spyOn(XMLHttpRequest.prototype, `open`).mockImplementation(xhrOpen);
    localStorage.setItem(`unrelated`, `kept`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    replaceFactGraphWithFacts.mockReset();
    fetchSpy.mockReset();
    xhrOpen.mockReset();
  });

  /** A rejected import leaves the return, storage and the network untouched. */
  const expectNothingWritten = () => {
    expect(replaceFactGraphWithFacts).not.toHaveBeenCalled();
    expect(holder.factGraph?.toJSON()).toBe(graphBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(DEVICE_SAVE_KEY)).toBeNull();
  };

  it(`imports a valid save file into the fact graph`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    pick(saveFile());
    await waitFor(() => expect(importButton()).toBeEnabled());
    fireEvent.click(importButton());
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.import.done`));
    expect(replaceFactGraphWithFacts).toHaveBeenCalledWith(facts, undefined);
  });

  it.each([1999, 2025])(`rejects a save file for tax year %i`, async (taxYear) => {
    render(wrapComponent(<DeviceDataPage />));
    pick(saveFile({ taxYear }));
    await waitFor(() => expect(importButton()).toBeEnabled());
    fireEvent.click(importButton());
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.errors.wrong-tax-year`));
    expectNothingWritten();
  });

  it(`rejects an unknown fact and a wrong-typed /filers before anything is saved`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    pick(
      saveFile({
        facts: {
          ...facts,
          '/notARealFact': { $type: `${B}BooleanWrapper`, item: true },
          '/filers': { $type: `${B}StringWrapper`, item: `x` },
        },
      })
    );
    await waitFor(() => expect(importButton()).toBeEnabled());
    fireEvent.click(importButton());
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.errors.invalid-facts`));
    expectNothingWritten();
  });

  it.each([
    [
      `an enum value that is not an option`,
      {
        '/filingStatus': {
          $type: `${B}EnumWrapper`,
          item: { value: [`totallyBogus`], enumOptionsPath: `/filingStatusOptions` },
        },
      },
    ],
    [
      `a collection item id that is not a UUID`,
      { '/filers': { $type: `${B}CollectionWrapper`, item: { items: [`not-a-uuid`] } } },
    ],
    [
      `an unknown field on a collection`,
      {
        '/filers': {
          $type: `${B}CollectionWrapper`,
          item: { ...(facts[`/filers`] as { item: object }).item, injected: 1 },
        },
      },
    ],
  ])(`rejects %s before anything is written or autosaved`, async (_label, bad) => {
    render(wrapComponent(<DeviceDataPage />));
    pick(saveFile({ facts: { ...facts, ...bad } }));
    await waitFor(() => expect(importButton()).toBeEnabled());
    fireEvent.click(importButton());
    await waitFor(async () => expect((await status()).textContent).toBe(`account.deviceData.errors.invalid-facts`));
    expectNothingWritten();
  });

  it(`refuses a file over the size cap without reading it`, async () => {
    render(wrapComponent(<DeviceDataPage />));
    const read = pick(saveFile(), MAX_SAVE_FILE_BYTES + 1);
    expect((await status()).textContent).toBe(`account.deviceData.errors.file-too-large`);
    expect(read).not.toHaveBeenCalled();
    expect(importButton()).toBeDisabled();
    expectNothingWritten();
  });

  it(`keeps the device save buttons disabled for a passphrase of only spaces`, () => {
    render(wrapComponent(<DeviceDataPage />));
    fireEvent.change(screen.getByLabelText(`account.deviceData.passphrase`), { target: { value: ` `.repeat(20) } });
    expect(screen.getByRole(`button`, { name: `account.deviceData.device.saveButton` })).toBeDisabled();
  });
});
