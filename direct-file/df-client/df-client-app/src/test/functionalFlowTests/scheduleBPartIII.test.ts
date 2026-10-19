import { it, describe, expect } from 'vitest';
import { baseFilerData, makeW2Data } from '../testData.js';
import { createBooleanWrapper } from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const sources = `/flow/income/income-sources`;

// Schedule B (Form 1040) Part III: line 7a (foreign accounts) and line 8 (foreign trusts). A "Yes" routes to the
// knockout screen, because FinCEN Form 114, Form 8938 and Form 3520 are not supported (i1040sb (2025) pp. 2-3).
const graph = (facts: Record<string, boolean>) =>
  setupFactGraph({
    ...baseFilerData,
    ...makeW2Data(50000),
    ...Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, createBooleanWrapper(v)])),
  }).factGraph;

describe(`Schedule B Part III flow`, () => {
  it(`line 7a "Yes" routes to the foreign accounts and trusts knockout`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': true })).atPath(`${sources}/foreign-accounts`, null, task)
    ).toRouteNextTo(`${sources}/foreign-accounts-trusts-knockout`);
  });

  it(`line 7a "No" continues to the foreign trust grantor question`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': false })).atPath(`${sources}/foreign-accounts`, null, task)
    ).toRouteNextTo(`${sources}/foreign-trusts-grantor`);
  });

  it(`line 8 "Yes" (grantor) routes to the knockout`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': false, '/isForeignTrustsGrantor': true })).atPath(
        `${sources}/foreign-trusts-grantor`,
        null,
        task
      )
    ).toRouteNextTo(`${sources}/foreign-accounts-trusts-knockout`);
  });

  it(`line 8 "Yes" (distribution or transfer) routes to the knockout`, ({ task }) => {
    expect(
      givenFacts(
        graph({ '/hasForeignAccounts': false, '/isForeignTrustsGrantor': false, '/hasForeignTrustsTransactions': true })
      ).atPath(`${sources}/foreign-trusts-transactions`, null, task)
    ).toRouteNextTo(`${sources}/foreign-accounts-trusts-knockout`);
  });

  it(`all "No" skips the knockout and moves on to digital assets`, ({ task }) => {
    expect(
      givenFacts(
        graph({
          '/hasForeignAccounts': false,
          '/isForeignTrustsGrantor': false,
          '/hasForeignTrustsTransactions': false,
        })
      ).atPath(`${sources}/foreign-trusts-transactions`, null, task)
    ).toRouteNextTo(`${sources}/digital-assets-received`);
  });
});
