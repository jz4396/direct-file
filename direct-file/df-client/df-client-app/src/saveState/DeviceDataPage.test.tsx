import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapComponent } from '../test/helpers.js';
import { setupFactGraph } from '../test/setupFactGraph.js';
import { DEVICE_SAVE_KEY } from './deviceSaveStore.js';
import { PASSPHRASE, scenarioFacts } from './saveStateTestUtils.js';

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
