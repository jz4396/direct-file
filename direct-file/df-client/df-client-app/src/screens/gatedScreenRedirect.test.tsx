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
import { gatedScreenRedirect, visibleHeadingCount } from './gatedScreenRedirect.js';

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
