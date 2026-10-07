import englishTranslation from './en.yaml';
import spanishTranslation from './es.yaml';
import scheduleCEn from './en.scheduleC.yaml';

export { YamlSettings } from './yaml-settings.js';

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const resources = {
  en: {
    translation: deepMerge(englishTranslation as Record<string, unknown>, scheduleCEn as Record<string, unknown>),
  },
  es: {
    translation: spanishTranslation,
  },
} as const;
