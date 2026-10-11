import { enLocale as englishTranslation, esLocale as spanishTranslation } from './featureLocales.js';

export { YamlSettings } from './yaml-settings.js';

export const resources = {
  en: {
    translation: englishTranslation,
  },
  es: {
    translation: spanishTranslation,
  },
} as const;
