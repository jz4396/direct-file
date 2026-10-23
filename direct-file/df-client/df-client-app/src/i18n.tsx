import { commonInitI18n } from 'df-i18n';

import { resources } from './locales/index.js';
import { isStaticClientOnly } from './staticClient/staticMode.js';

export function initI18n() {
  // The static client-only build keeps nothing in browser storage, not even the language choice.
  return commonInitI18n(resources, { persistLanguage: !isStaticClientOnly() });
}
