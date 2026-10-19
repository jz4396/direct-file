import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserStorage, initPrivacyHandler } from '../auth/storage.js';
import { SessionClock } from '../auth/session.js';
import { DEVICE_SAVE_KEY } from './deviceSaveStore.js';

/** Cache Storage whose keys() resolves only when the test says so, to see what waits for the clear. */
function deferredCaches() {
  let release: () => void = () => {};
  const keys = vi.fn(() => new Promise<string[]>((resolve) => (release = () => resolve([`c1`]))));
  const del = vi.fn(() => Promise.resolve(true));
  vi.stubGlobal(`caches`, { keys, delete: del });
  return { release: () => release(), del };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe(`sign-out waits for the browser storage clear before navigating`, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it(`clearBrowserStorage clears localStorage at once and settles after Cache Storage is cleared`, async () => {
    const caches = deferredCaches();
    localStorage.setItem(DEVICE_SAVE_KEY, `envelope`);
    let settled = false;
    const done = clearBrowserStorage().then(() => (settled = true));
    expect(localStorage.getItem(DEVICE_SAVE_KEY)).toBeNull();
    await flush();
    expect(settled).toBe(false);
    caches.release();
    await done;
    expect(caches.del).toHaveBeenCalledWith(`c1`);
  });

  it(`SessionClock.terminate navigates only after the clear finishes`, async () => {
    const caches = deferredCaches();
    vi.stubEnv(`VITE_SADI_LOGOUT_URL`, `https://logout.example.test/`);
    const location = { href: `about:blank` };
    vi.stubGlobal(`location`, location);
    const ended = new SessionClock().terminate();
    await flush();
    expect(location.href).toBe(`about:blank`);
    caches.release();
    await ended;
    expect(caches.del).toHaveBeenCalled();
    expect(location.href).toBe(`https://logout.example.test/`);
  });

  it(`the logout link is held until the clear finishes, then followed`, async () => {
    vi.stubEnv(`VITE_SADI_LOGOUT_URL`, `https://logout.example.test/`);
    const caches = deferredCaches();
    const assign = vi.fn();
    vi.stubGlobal(`location`, { ...window.location, assign });
    initPrivacyHandler();
    const a = document.createElement(`a`);
    a.href = `https://logout.example.test/?from=df`;
    document.body.appendChild(a);
    const click = new MouseEvent(`click`, { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await flush();
    expect(assign).not.toHaveBeenCalled();
    caches.release();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(`https://logout.example.test/?from=df`));
    a.remove();
  });

  it(`other links are not intercepted`, () => {
    vi.stubEnv(`VITE_SADI_LOGOUT_URL`, `https://logout.example.test/`);
    initPrivacyHandler();
    const a = document.createElement(`a`);
    a.href = `/df/file/checklist`;
    document.body.appendChild(a);
    const click = new MouseEvent(`click`, { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    a.remove();
  });
});
