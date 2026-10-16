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
import scheduleDEn from './en.scheduleD.yaml';
import scheduleDEs from './es.scheduleD.yaml';
import scheduleAEn from './en.scheduleA.yaml';
import scheduleAEs from './es.scheduleA.yaml';
import unreportedTipsEn from './en.unreportedTips.yaml';
import unreportedTipsEs from './es.unreportedTips.yaml';
import scheduleEEn from './en.scheduleE.yaml';
import scheduleEEs from './es.scheduleE.yaml';
import charitableNonItemizerEn from './en.charitableNonItemizer.yaml';
import charitableNonItemizerEs from './es.charitableNonItemizer.yaml';
import carLoanInterestEn from './en.carLoanInterest.yaml';
import carLoanInterestEs from './es.carLoanInterest.yaml';
import schedule1AEn from './en.schedule1A.yaml';
import schedule1AEs from './es.schedule1A.yaml';
import paPitEn from './en.paPit.yaml';
import paPitEs from './es.paPit.yaml';

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
export const enLocale: any = deepMerge(
  deepMerge(
    deepMerge(
      deepMerge(
        deepMerge(
          deepMerge(
            deepMerge(
              deepMerge(deepMerge(englishBase as Tree, scheduleCEn as Tree), scheduleDEn as Tree),
              scheduleAEn as Tree
            ),
            unreportedTipsEn as Tree
          ),
          scheduleEEn as Tree
        ),
        charitableNonItemizerEn as Tree
      ),
      carLoanInterestEn as Tree
    ),
    schedule1AEn as Tree
  ),
  paPitEn as Tree
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const esLocale: any = deepMerge(
  deepMerge(
    deepMerge(
      deepMerge(
        deepMerge(
          deepMerge(
            deepMerge(
              deepMerge(deepMerge(spanishBase as Tree, scheduleCEs as Tree), scheduleDEs as Tree),
              scheduleAEs as Tree
            ),
            unreportedTipsEs as Tree
          ),
          scheduleEEs as Tree
        ),
        charitableNonItemizerEs as Tree
      ),
      carLoanInterestEs as Tree
    ),
    schedule1AEs as Tree
  ),
  paPitEs as Tree
);
