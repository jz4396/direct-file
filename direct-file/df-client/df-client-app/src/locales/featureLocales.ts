/**
 * Feature locale overlays.
 *
 * en.yaml / es.yaml are ~1.4 MB each; feature slices ship their strings as small overlay files that are
 * deep-merged onto the base locale here. Everything that reads translations (the app via ./index.ts and the
 * locale/flow tests) must import `enLocale` / `esLocale` from this module instead of the raw yaml.
 */
import englishBase from './en.yaml';
import spanishBase from './es.yaml';
import scheduleCEn from './en.scheduleC.yaml';
import scheduleCEs from './es.scheduleC.yaml';

type Tree = Record<string, unknown>;

const isTree = (v: unknown): v is Tree => typeof v === `object` && v !== null && !Array.isArray(v);

export function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isTree(v) && isTree(out[k]) ? deepMerge(out[k] as Tree, v) : v;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const enLocale: any = deepMerge(englishBase as Tree, scheduleCEn as Tree);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const esLocale: any = deepMerge(spanishBase as Tree, scheduleCEs as Tree);
