import { clearCachesAndDatabases } from '../saveState/deviceSaveStore.js';

/** Longest sign-out waits for the async clears (Cache Storage, IndexedDB, service workers) before navigating. */
export const CLEAR_WAIT_MS = 2000;

/**
 * Clear this origin's browser storage. localStorage and sessionStorage are cleared synchronously, before this returns
 * its promise. The promise settles once the async clears finish, or after CLEAR_WAIT_MS so sign-out never hangs.
 * Callers that navigate away await it, so navigation doesn't cut the clears off.
 */
export const clearBrowserStorage = async (): Promise<void> => {
  // Local storage is a per-origin data cache in the user's browser. This also removes an encrypted
  // "save on this device" entry, so sign-out leaves no saved return behind.
  localStorage.clear();
  // Session storage is similar, but limited to a single tab/page.
  sessionStorage.clear();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CLEAR_WAIT_MS);
  });
  try {
    await Promise.race([clearCachesAndDatabases(), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export const initPrivacyHandler = () => {
  document.addEventListener(`click`, (e) => {
    const target = ((e.target as HTMLElement) || null)?.closest(`a`);
    const href = target?.getAttribute(`href`) || ``;
    const logoutUrl = import.meta.env.VITE_SADI_LOGOUT_URL;
    const isLogout = !!logoutUrl && href.indexOf(logoutUrl) !== -1;
    if (!isLogout || !target) return;
    const opensElsewhere = target.target === `_blank` || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0;
    if (opensElsewhere) {
      // The browser opens another tab or window, so there is no navigation here to hold.
      void clearBrowserStorage();
      return;
    }
    // Hold the navigation until storage is cleared, then follow the link.
    e.preventDefault();
    void clearBrowserStorage().then(() => window.location.assign(target.href));
  });
};
