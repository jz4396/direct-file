import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConcretePath, FactGraph } from '@irs/js-factgraph-scala';
import { FactGraphContextProvider, replaceFactGraphWithFacts, useFactGraph } from '../factgraph/FactGraphContext.js';
import { setupStore } from '../redux/store.js';
import { setupFactGraph } from '../test/setupFactGraph.js';
import { importSaveFile } from './saveStateFile.js';
import { DEFAULT_TAX_YEAR, SAVE_STATE_FORMAT } from './saveStateSchema.js';
import { scenarioFacts } from './saveStateTestUtils.js';

// Unmocked: the real FactGraphContextProvider, replaceFactGraphWithFacts and useFactGraph.
const seen: { factGraph?: FactGraph } = {};
const filerPath = Object.keys(scenarioFacts).find((p) => /^\/filers\/#[^/]+\/firstName$/.test(p)) as ConcretePath;

const Probe = () => {
  const { factGraph } = useFactGraph();
  seen.factGraph = factGraph;
  const name = factGraph.get(filerPath);
  return <p data-testid='first-name'>{name.complete ? String(name.get) : `none`}</p>;
};

const facts = (firstName: string) => {
  const json = JSON.parse(setupFactGraph(scenarioFacts).factGraph.toJSON());
  json[filerPath] = { $type: `gov.irs.factgraph.persisters.StringWrapper`, item: firstName };
  return json;
};

const file = (over: Record<string, unknown>) =>
  JSON.stringify({
    format: SAVE_STATE_FORMAT,
    version: 2,
    taxYear: DEFAULT_TAX_YEAR,
    savedAt: `2027-02-01T00:00:00.000Z`,
    ...over,
  });

describe(`replacing the fact graph with an imported one`, () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.stubGlobal(`fetch`, fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  it(`useFactGraph() sees the imported graph; a rejected import changes nothing`, async () => {
    render(
      <Provider store={setupStore()}>
        <FactGraphContextProvider existingFacts={facts(`Original`)}>
          <Probe />
        </FactGraphContextProvider>
      </Provider>
    );
    expect(screen.getByTestId(`first-name`).textContent).toBe(`Original`);
    const before = seen.factGraph;

    // Rejected: wrong tax year, then an unknown fact. Validation throws before the graph is replaced.
    for (const bad of [
      file({ taxYear: 1999, facts: facts(`Wrong year`) }),
      file({
        facts: {
          ...facts(`Unknown`),
          '/notARealFact': { $type: `gov.irs.factgraph.persisters.BooleanWrapper`, item: true },
        },
      }),
    ]) {
      await expect(importSaveFile(bad)).rejects.toThrow();
    }
    expect(seen.factGraph === before).toBe(true);
    expect(screen.getByTestId(`first-name`).textContent).toBe(`Original`);

    // Accepted: the provider re-renders and consumers get the new graph.
    const state = await importSaveFile(file({ facts: facts(`Imported`) }));
    let replaced: FactGraph | undefined;
    act(() => {
      replaced = replaceFactGraphWithFacts(state.facts) as unknown as FactGraph;
    });
    expect(seen.factGraph === replaced).toBe(true);
    expect(screen.getByTestId(`first-name`).textContent).toBe(`Imported`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
