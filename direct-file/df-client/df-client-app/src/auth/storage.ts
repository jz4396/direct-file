import { clearCachesAndDatabases } from '../saveState/deviceSaveStore.js';

export const clearBrowserStorage = () => {
  // Local storage is a per-origin data cache in the user's browser. This also removes an encrypted
  // "save on this device" entry, so sign-out leaves no saved return behind.
  localStorage.clear();
  // Session storage is similar, but limited to a single tab/page.
  sessionStorage.clear();
  // Cache Storage, IndexedDB and service workers are async; best effort, never blocks sign-out.
  void clearCachesAndDatabases();
};

export const initPrivacyHandler = () => {
  document.addEventListener(`click`, (e) => {
    const target = ((e.target as HTMLElement) || null)?.closest(`a`);
    const href = target?.getAttribute(`href`) || ``;
    const isLogout = href.indexOf(import.meta.env.VITE_SADI_LOGOUT_URL) !== -1;
    if (isLogout) clearBrowserStorage();
  });
};
