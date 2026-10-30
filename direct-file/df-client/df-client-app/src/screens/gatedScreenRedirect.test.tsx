import { randomUUID } from 'crypto';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { InterceptingFactGraph } from '../factgraph/InterceptingFactGraph.js';
import { FactGraphContextProvider, replaceFactGraphWithFacts, useFactGraph } from '../factgraph/FactGraphContext.js';
import { createFlowConfig } from '../flow/flowConfig.js';
import flowNodes from '../flow/flow.js';
import { setupStore } from '../redux/store.js';
import { scenarioFactGraphJson } from '../saveState/saveStateTestUtils.js';
import ErrorBoundary from '../utils/errorBoundary.js';
import BaseScreen from './BaseScreen.js';
import { gatedScreenRedirect, settledGatedLanding, visibleHeadingCount } from './gatedScreenRedirect.js';

vi.mock(`../components/Screen.js`, () => ({
  default: () => <h1>interview screen</h1>,
}));

/** The income routes whose headings are gated off for the no-retention return. */
const GATED_ROUTES = [
  `/flow/income/interest/int-income-loop-intro-data-import`,
  `/flow/income/dependent-care/dep-care-combat-pay`,
  `/flow/income/dependent-care/dep-care-combat-pay-change`,
  `/flow/income/dependent-care/earned-income-rule-tp1-benefits`,
  `/flow/income/dependent-care/earned-income-rule-tp2-benefits`,
  `/flow/income/dependent-care/tin-ein-check`,
  `/flow/income/dependent-care/tin-missing-reason`,
  `/flow/income/dependent-care/provider-due-diligence`,
  `/flow/income/hsa/hsa-y-n`,
  `/flow/income/hsa/hsa-testing-period-contribution-check`,
  `/flow/income/hsa/hsa-testing-period-additional-income`,
];

const WAGES = `73519.47`;

type FactJson = Record<string, { $type: string; item: unknown }>;

/** The same return the no-retention proof imports: one W-2, HSA box 12, and one item in each gated collection. */
function returnWithGatedScreens(): FactJson {
  const facts = scenarioFactGraphJson() as FactJson;
  const w2 = (facts[`/formW2s`].item as { items: string[] }).items[0];
  facts[`/formW2s/#${w2}/writableWages`] = {
    $type: `gov.irs.factgraph.persisters.DollarWrapper`,
    item: WAGES,
  };
  facts[`/formW2s/#${w2}/employerHsaContributions`] = {
    $type: `gov.irs.factgraph.persisters.DollarWrapper`,
    item: `500.00`,
  };
  const no = { $type: `gov.irs.factgraph.persisters.BooleanWrapper`, item: false };
  facts[`/hasHsaMedicalSavingsAccountType`] = no;
  facts[`/writableHasHsaExcessContributionsPreviousYear`] = no;
  facts[`/writableHasHsaWithdrawnExcessContributionsYesNo`] = no;
  const collectionType = facts[`/formW2s`].$type;
  for (const collection of [`/interestReports`, `/cdccCareProviders`]) {
    const items = (facts[collection]?.item as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) {
      facts[collection] = { $type: collectionType, item: { items: [randomUUID()] } };
    }
  }
  return facts;
}

function collectionIds(facts: FactJson): Map<string, string> {
  const ids = new Map<string, string>();
  for (const [factPath, fact] of Object.entries(facts)) {
    const items =
      fact?.item && typeof fact.item === `object` && fact.item !== null && `items` in fact.item
        ? (fact.item as { items: unknown }).items
        : undefined;
    if (Array.isArray(items) && typeof items[0] === `string` && /^\/[A-Za-z][A-Za-z0-9]*$/.test(factPath)) {
      ids.set(factPath, items[0]);
    }
  }
  return ids;
}

const flow = createFlowConfig(flowNodes);
const facts = returnWithGatedScreens();
const ids = collectionIds(facts);

function collectionIdFor(route: string): string | null {
  const screen = flow.screensByRoute.get(route);
  if (!screen?.collectionContext) return null;
  return ids.get(screen.collectionContext) ?? null;
}

/** Stays mounted across the redirect. The error boundary would unmount it with the return. */
function SurvivingReturn() {
  const { factGraph } = useFactGraph();
  const { pathname } = useLocation();
  const json = factGraph.toJSON();
  return (
    <>
      <output data-testid='wages'>{json.includes(WAGES) ? WAGES : `missing`}</output>
      <output data-testid='path'>{pathname}</output>
    </>
  );
}

describe(`gated income screens redirect`, () => {
  const factGraph = new InterceptingFactGraph(facts);
  const saved = factGraph.toJSON();

  it.each(GATED_ROUTES)(`%s goes to the section's first applicable screen or the checklist`, (route) => {
    const screenConfig = flow.screensByRoute.get(route);
    expect(screenConfig).toBeDefined();
    if (!screenConfig) return;
    const target = gatedScreenRedirect(screenConfig, factGraph, collectionIdFor(route), flow);
    expect(target).toBeTruthy();
    if (!target) return;
    const path = target.split(`?`)[0];
    expect(path).not.toBe(route);
    if (path !== `/checklist`) {
      const destination = flow.screensByRoute.get(path);
      expect(destination?.subcategoryRoute).toBe(screenConfig.subcategoryRoute);
      expect(destination).toBeDefined();
      if (!destination) return;
      expect(visibleHeadingCount(destination, factGraph, null)).toBe(1);
    }
    expect(factGraph.toJSON()).toBe(saved);
  });

  it.each(GATED_ROUTES)(`opening %s leaves the return in memory`, (route) => {
    replaceFactGraphWithFacts(facts);
    const collectionId = collectionIdFor(route);
    const screenConfig = flow.screensByRoute.get(route);
    expect(screenConfig).toBeDefined();
    if (!screenConfig) return;
    const query =
      collectionId && screenConfig.collectionContext
        ? `?${new URLSearchParams([[screenConfig.collectionContext, collectionId]])}`
        : ``;
    render(
      <Provider store={setupStore()}>
        <ErrorBoundary>
          <FactGraphContextProvider existingFacts={facts}>
            <MemoryRouter initialEntries={[`${route}${query}`]}>
              <SurvivingReturn />
              <Routes>
                <Route path='/flow/*' element={<BaseScreen />} />
                <Route path='/checklist' element={<h1>checklist</h1>} />
              </Routes>
            </MemoryRouter>
          </FactGraphContextProvider>
        </ErrorBoundary>
      </Provider>
    );

    expect(screen.getByTestId(`wages`)).toHaveTextContent(WAGES);
    expect(screen.queryByText(/experiencing a problem/)).not.toBeInTheDocument();
    expect(screen.getByTestId(`path`).textContent).not.toBe(route);
  });
});

/** Same W-2, 1099-INT, and 1099-R population incomeMobile.e2e.ts opens directly. */
const INCOME_MOBILE_SUBCATEGORIES: Record<string, string> = {
  '/flow/income/jobs': `/formW2s`,
  '/flow/income/interest': `/interestReports`,
  '/flow/income/retirement': `/form1099Rs`,
};

function incomeMobileReturn(): { facts: FactJson; ids: Record<string, string> } {
  const mobileFacts = scenarioFactGraphJson() as FactJson;
  const ids: Record<string, string> = {
    '/formW2s': (mobileFacts[`/formW2s`].item as { items: string[] }).items[0],
  };
  const collectionType = mobileFacts[`/formW2s`].$type;
  for (const collection of [`/interestReports`, `/form1099Rs`]) {
    ids[collection] = randomUUID();
    mobileFacts[collection] = { $type: collectionType, item: { items: [ids[collection]] } };
  }
  return { facts: mobileFacts, ids };
}

describe(`income mobile routes settle without a redirect loop`, () => {
  const { facts: mobileFacts, ids: mobileIds } = incomeMobileReturn();
  const mobileGraph = new InterceptingFactGraph(mobileFacts);
  const mobileScreens = flow.screens.filter(
    (s) =>
      s.subcategoryRoute in INCOME_MOBILE_SUBCATEGORIES &&
      (!s.collectionContext || s.collectionContext === INCOME_MOBILE_SUBCATEGORIES[s.subcategoryRoute])
  );

  function queryFor(screen: (typeof mobileScreens)[number]): string {
    if (!screen.collectionContext) return ``;
    const id = mobileIds[screen.collectionContext];
    return id ? `?${new URLSearchParams([[screen.collectionContext, id]])}` : ``;
  }

  it(`keeps the data-entry screens and sends gated routes to a screen that can be shown`, () => {
    expect(mobileScreens.length).toBeGreaterThan(60);
    const stayed: string[] = [];
    const redirected: string[] = [];
    for (const screen of mobileScreens) {
      const landing = settledGatedLanding(screen, mobileGraph, flow, queryFor(screen));
      if (landing.path === `/checklist`) {
        redirected.push(`${screen.route} -> /checklist`);
        continue;
      }
      const destination = flow.screensByRoute.get(landing.path);
      expect(destination, `${screen.screenRoute} -> ${landing.path}`).toBeDefined();
      if (!destination) continue;
      const again = settledGatedLanding(destination, mobileGraph, flow, landing.search);
      expect(again.path, `${screen.screenRoute} -> ${landing.path}`).toBe(destination.screenRoute);
      if (landing.path === screen.screenRoute) stayed.push(screen.route);
      else redirected.push(`${screen.route} -> ${destination.route}`);
    }

    expect(stayed).toEqual(expect.arrayContaining([`w2-add-boxes-1-8`, `retirement-add-box-7-checkbox`]));
    // Box 1 sits behind the has-1099 gate. This return has not answered that, so the screen redirects.
    expect(redirected.some((line) => line.startsWith(`1099-int-add-box-1`))).toBe(true);
    expect(redirected.some((line) => line.startsWith(`int-income-loop-intro-data-import`))).toBe(true);
    expect(stayed.length).toBeGreaterThan(30);
    expect(redirected.length).toBeGreaterThan(30);
    expect(mobileGraph.toJSON()).toBe(new InterceptingFactGraph(mobileFacts).toJSON());
  });
});
