import { describe, it, expect, Mock } from 'vitest';
import fs from 'fs';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { ConcretePath, FactGraph, scalaListToJsArray } from '@irs/js-factgraph-scala';
import getNextScreen, { Routable } from '../../screens/getNextScreen.js';
import { ScreenConfig } from '../../flow/ScreenConfig.js';
import { Condition } from '../../flow/Condition.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { fetchDataImportProfile } from '../../redux/slices/data-import/fetchDataImportProfile.js';
import { fetchProfile } from '../../redux/slices/data-import/dataImportProfileSlice.js';
import { store } from '../../redux/store.js';
import { TaxReturn } from '../../types/core.js';
import marge from '../../redux/slices/data-import/mocks/marge.json';

vi.mock(`../../redux/slices/data-import/fetchDataImportProfile.js`, () => ({
  fetchDataImportProfile: vi.fn(), // Mock the function
}));

export const flow = createFlowConfig(flowNodes);
/**
 * Flow snapshot tests ask a single question --
 * "For this scenario fact graph, what is the sequence of screens the user would see?"
 *
 * This lets us test that a path through the flow remains constant -- or
 * that a change has only the intended consequences.
 *
 * You might use the test to see the following things:
 * * You've added new screens that you expect everyone to see
 * * You've added new screens that you'd expect to appear whenever a person is MFJ
 * * You've narrowed the requirements for a screen -- e.g. we've decided to only ask
 *   a question if the TP meets a condition. You'll see the screen disappear from
 *   the scenarios where the user doesn't meet that condition.
 *
 * When a scenario test fails, it will automatically regenerate the csv snapshots,
 * and you can view the changes via "git diff". Your PR reviewers will also be able
 * to review the diff in your PR, since github shows that diff.
 */
describe(`Flow snapshot tests`, () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`2024-02-15`));

  afterAll(() => {
    // restoring date after each test run
    vi.useRealTimers();
  });

  (fetchDataImportProfile as Mock).mockReturnValue(Promise.resolve(marge));
  store.dispatch(fetchProfile({ currentTaxReturn: `fake id` as unknown as TaxReturn }));

  const SCENARIO_FOLDER = `./src/test/factDictionaryTests/backend-scenarios`;
  const ERO_SCENARIO_FOLDER = `./src/test/factDictionaryTests/backend-scenarios-ero`;
  const FLOW_SNAPSHOTS_FOLDER = `./src/test/scenarioTests/flow-snapshots`;
  const files = fs.readdirSync(SCENARIO_FOLDER);
  // #108: `backend-scenarios-ero` is a symlink to backend/src/test/resources/scenarios-ero, which IRS-Public/direct-file
  // never published (the symlink, the `ero-*.csv` snapshots, migrateScenarios.ts and the pom.xml includes reference it,
  // but the folder is absent upstream). A missing folder used to throw ENOENT at collection time, so none of the
  // non-ERO scenario snapshots below ran either. Treat a missing ERO folder as "no ERO scenarios"; if the folder is
  // restored, its scenarios are picked up again with no code change.
  const eroFiles = fs.existsSync(ERO_SCENARIO_FOLDER) ? fs.readdirSync(ERO_SCENARIO_FOLDER) : [];
  const jsons = files.filter((f) => f.endsWith(`.json`) && !f.endsWith(`.expected.json`));
  const eroJsons = eroFiles.filter((f) => f.endsWith(`.json`) && !f.endsWith(`.expected.json`));

  const scenarioFolders = [
    { folder: SCENARIO_FOLDER, scenarioJsons: jsons },
    { folder: ERO_SCENARIO_FOLDER, scenarioJsons: eroJsons },
  ];
  scenarioFolders.forEach((s) => {
    s.scenarioJsons.forEach((json) => {
      it(`${json} produces the same snapshot`, () => {
        const fileName = s.folder + `/` + json;
        // add a suffix to snapshot filename so we can differentiate the ero from non-ero files
        const prefix = s.folder === ERO_SCENARIO_FOLDER ? `ero-` : ``;
        const snapshotFileName = FLOW_SNAPSHOTS_FOLDER + `/${prefix}` + json.replace(`.json`, `.csv`);
        const jsonString = fs.readFileSync(fileName, `utf-8`);
        const flowSnapshot = fs.existsSync(snapshotFileName) ? fs.readFileSync(snapshotFileName, `utf-8`) : undefined;
        const factJson = JSON.parse(jsonString);
        const { factGraph } = setupFactGraph(factJson.facts);
        const screens = getFlowScreenOrderingFromFlowConfig(factGraph);
        const screensMatchSnapshot = screens.join(`\n`) === flowSnapshot;
        if (!screensMatchSnapshot) {
          // eslint-disable-next-line no-console
          console.warn(`Snapshot did not match for ${json} -- writing snapshot`);
          fs.writeFileSync(snapshotFileName, screens.join(`\n`));
        }
        expect(screensMatchSnapshot).toBe(true);
      });
    });
  });

  // #127: the ats-2 family (golden end-to-end scenarios, synthetic data) must keep a qualifying child. When #109 moved
  // the dates to TY2026, the child (born 2006) turned 20 and silently dropped out of the qualifying-child screens. The
  // child is now born 2009-07-20, so 17 at the end of 2026: under 19 for the 26 U.S.C. 152(c)(3)(A)(i) age test
  // (https://www.law.cornell.edu/uscode/text/26/152#c_3), an EITC qualifying child (26 U.S.C. 32(c)(3)(A)), and not
  // under 17 for the child tax credit (26 U.S.C. 24(c)(1), https://www.law.cornell.edu/uscode/text/26/24), so the
  // credit for other dependents applies, as in the original scenario. If a future year-roll ages the child out again,
  // these assertions fail instead of the snapshots quietly changing.
  describe(`ats-2 scenarios keep a qualifying child under TY2026 dates (#127)`, () => {
    const ATS2_SCENARIOS = [
      `ats-2.json`,
      `ats-2-1099r.json`,
      `ats-2-1099r-blank-taxable.json`,
      `ats-2-1099r-nonzero-taxable.json`,
      `ats-2-occupation-test.json`,
      `ats-3-1099r.json`,
      `mef-ats-2.json`,
      `mef-ats-2a.json`,
    ];
    const QC_SCREENS = [`add-person-ssn-valid-for-work`, `add-person-qc-support`, `add-person-qc-of-another`];
    ATS2_SCENARIOS.forEach((json) => {
      it(`${json}: the dependent is a qualifying child and reaches the qualifying-child screens`, () => {
        const factJson = JSON.parse(fs.readFileSync(`${SCENARIO_FOLDER}/${json}`, `utf-8`));
        const { factGraph } = setupFactGraph(factJson.facts);
        const deps = scalaListToJsArray(
          factGraph.get(`/familyAndHousehold` as ConcretePath).get.getItemsAsStrings()
        ) as string[];
        expect(deps).toHaveLength(1);
        const dep = (p: string) => factGraph.get(`/familyAndHousehold/#${deps[0]}/${p}` as ConcretePath);
        expect(dep(`ageTest`).get).toBe(true);
        expect(dep(`qualifyingChild`).get).toBe(true);
        expect(dep(`eitcQualifyingChild`).get).toBe(true);
        expect(dep(`eligibleCtc`).get).toBe(false);
        expect(dep(`eligibleOdc`).get).toBe(true);
        const screens = getFlowScreenOrderingFromFlowConfig(factGraph);
        QC_SCREENS.forEach((route) =>
          expect(
            screens.some((s) => s.startsWith(`/flow/you-and-your-family/dependents/${route}?`)),
            route
          ).toBe(true)
        );
      });
    });
  });
});

const SINGULAR_COLLECTIONS = [`/primaryFiler`, `/secondaryFiler`];

/**
 *
 * This returns *almost* the correct ordering of screens that would be seen by a user with this fact graph,
 * but there's a simplification around collections and collection loops. We loop over the entire subcategory for each
 * member of a collection, so intro screens will be displayed multiple times.
 *
 *
 */
function getFlowScreenOrderingFromFlowConfig(factGraph: FactGraph) {
  const snapshots: string[] = [];
  flow.categories.forEach((c) => {
    snapshots.push(`Category: ${c.route}`);
    c.subcategories
      .filter(
        (sc) =>
          !sc.displayOnlyIf ||
          (Array.isArray(sc.displayOnlyIf)
            ? sc.displayOnlyIf?.some((condtion) => new Condition(condtion).evaluate(factGraph, null))
            : new Condition(sc.displayOnlyIf).evaluate(factGraph, null))
      )
      .forEach((subcat) => {
        snapshots.push(`Subcategory: ${subcat.route}`);

        const collectionName = subcat.collectionName;
        // If we're in a section that requires collections and collection item managers,
        // it's hard to use getNextScreen, so we rely instead on filtering the available flow
        // screens for each member of a collection.
        //
        // It's not as exact as an ideal snapshot test, but it snapshots more data
        // rather than less, so it's not a lossy snapshot test.
        if (collectionName) {
          const result = factGraph.get(collectionName as ConcretePath);
          const collectionItems = result.complete
            ? SINGULAR_COLLECTIONS.includes(collectionName) // if it's a singular collection item, throw it in an array
              ? [result.get.idString]
              : (scalaListToJsArray(result.get.getItemsAsStrings()) as string[]) // else get an array
            : [];
          collectionItems.forEach((collectionItemId) => {
            // Push all available screens in the subcategory into the snapshot
            snapshots.push(
              ...subcat.screens
                .filter((sc) => sc.isAvailable(factGraph, collectionItemId))
                .map((c) => c.fullRoute(collectionItemId))
            );
          });
        } else {
          // Here we use getNextScreen, which also tests our auto-iterating loops!
          let collectionId: string | null = null;
          const firstReachableScreenIndex = subcat.screens.findIndex((screen) =>
            screen.isAvailable(factGraph, collectionId)
          );
          let currentScreen = subcat.screens[firstReachableScreenIndex];

          while (firstReachableScreenIndex !== -1) {
            // Handles inner collection loops
            if (currentScreen.collectionContext && currentScreen.collectionLoop?.isInner === true) {
              const currentCollectionContext = currentScreen.collectionContext;
              const firstIndex = subcat.screens.findIndex((screen) => screen === currentScreen);
              const screensInCollectionContext: ScreenConfig[] = [];
              let lastIndex = subcat.screens.length - 1; // Arbitrary default value
              for (let i = firstIndex; i < subcat.screens.length; i++) {
                if (currentCollectionContext === subcat.screens[i].collectionContext) {
                  screensInCollectionContext.push(subcat.screens[i]);
                } else {
                  lastIndex = i - 1;
                  break;
                }
              }
              const result = factGraph.get(currentCollectionContext as ConcretePath);
              const collectionItems = result.complete
                ? SINGULAR_COLLECTIONS.includes(currentCollectionContext)
                  ? [result.get.idString] // if it's a singular collection item, throw it in an array
                  : (scalaListToJsArray(result.get.getItemsAsStrings()) as string[]) // else get an array
                : [];
              collectionItems.forEach((collectionItemId) => {
                // Push all available screens in the subcategory into the snapshot
                snapshots.push(
                  ...screensInCollectionContext
                    .filter((sc) => sc.isAvailable(factGraph, collectionItemId))
                    .map((c) => c.fullRoute(collectionItemId))
                );
              });
              // Updates current screen to the last screen in the inner collection loop
              currentScreen = subcat.screens[lastIndex];
              collectionId = null;
            } else {
              snapshots.push(currentScreen.fullRoute(collectionId));
            }

            // We use getNextScreen if we're outside of a collection context -- this lets
            // use properly test autoiterating collection loops.
            const nextScreen = getNextScreen(currentScreen, factGraph, collectionId, flow);
            if (!isScreenConfig(nextScreen.routable)) {
              break;
            }
            if (nextScreen.routable.route === `sign-return-done`) {
              // This is the final screen. Calling `getNextScreen` doesn't actually work on them, so
              // we break, but before doing so add the last screen
              snapshots.push(nextScreen.routable.fullRoute(nextScreen.collectionId));
              break;
            }

            currentScreen = nextScreen.routable;
            collectionId = nextScreen.collectionId;
          }
        }
      });
  });

  return snapshots;
}

export function isScreenConfig(sc: ScreenConfig | Routable): sc is ScreenConfig {
  return (sc as ScreenConfig).isAvailable !== undefined;
}
