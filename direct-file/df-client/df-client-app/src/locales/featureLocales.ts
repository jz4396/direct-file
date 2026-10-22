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
import form6251En from './en.form6251.yaml';
import form6251Es from './es.form6251.yaml';
import paPitEn from './en.paPit.yaml';
import paPitEs from './es.paPit.yaml';
import dividendsEn from './en.dividends.yaml';
import dividendsEs from './es.dividends.yaml';
import saveStateEn from './en.saveState.yaml';
import saveStateEs from './es.saveState.yaml';
import interestScheduleBEn from './en.interestScheduleB.yaml';
import interestScheduleBEs from './es.interestScheduleB.yaml';
import ctcFilerSsnEn from './en.ctcFilerSsn.yaml';
import ctcFilerSsnEs from './es.ctcFilerSsn.yaml';
import householdEmploymentEn from './en.householdEmployment.yaml';
import householdEmploymentEs from './es.householdEmployment.yaml';
import form2210En from './en.form2210.yaml';
import form2210Es from './es.form2210.yaml';
import staticClientEn from './en.staticClient.yaml';
import staticClientEs from './es.staticClient.yaml';

type Tree = Record<string, unknown>;

const isTree = (v: unknown): v is Tree => typeof v === `object` && v !== null && !Array.isArray(v);

export function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isTree(v) && isTree(out[k]) ? deepMerge(out[k] as Tree, v) : v;
  }
  return out;
}

const enCore: Tree = deepMerge(
  deepMerge(
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
    form6251En as Tree
  ),
  paPitEn as Tree
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const enLocale: any = deepMerge(enCore, dividendsEn as Tree);
const esCore: Tree = deepMerge(
  deepMerge(
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
    form6251Es as Tree
  ),
  paPitEs as Tree
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const esLocale: any = deepMerge(esCore, dividendsEs as Tree);

// Later overlays are merged onto the exported trees in place, so adding one doesn't re-nest the chains above.
for (const [locale, overlay] of [
  [enLocale, saveStateEn],
  [esLocale, saveStateEs],
  [enLocale, interestScheduleBEn],
  [esLocale, interestScheduleBEs],
  [enLocale, ctcFilerSsnEn],
  [esLocale, ctcFilerSsnEs],
  [enLocale, householdEmploymentEn],
  [esLocale, householdEmploymentEs],
  [enLocale, form2210En],
  [esLocale, form2210Es],
  [enLocale, staticClientEn],
  [esLocale, staticClientEs],
] as const) {
  Object.assign(locale, deepMerge(locale as Tree, overlay as Tree));
}
