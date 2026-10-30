import { it, describe, expect } from 'vitest';
import { baseFilerData, makeW2Data } from '../testData.js';
import { createBooleanWrapper, createStringWrapper } from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const sources = `/flow/income/income-sources`;

// Schedule B (Form 1040) Part III. Line 7a Yes continues to question 2 (FinCEN Form 114) and line 7b countries.
// Line 8 Yes and Form 8938 Yes route to the knockout. 2026 draft Instructions PDF pp. 3–4.
const graph = (facts: Record<string, boolean>, strings: Record<string, string> = {}) =>
  setupFactGraph({
    ...baseFilerData,
    ...makeW2Data(50000),
    ...Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, createBooleanWrapper(v)])),
    ...Object.fromEntries(Object.entries(strings).map(([k, v]) => [k, createStringWrapper(v)])),
  }).factGraph;

describe(`Schedule B Part III flow`, () => {
  it(`line 7a "Yes" routes to the FinCEN Form 114 question`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': true })).atPath(`${sources}/foreign-accounts`, null, task)
    ).toRouteNextTo(`${sources}/foreign-account-fbar`);
  });

  it(`question 2 "Yes" routes to the country lines`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': true, '/requiredToFileFinCENForm114': true })).atPath(
        `${sources}/foreign-account-fbar`,
        null,
        task
      )
    ).toRouteNextTo(`${sources}/foreign-account-countries`);
  });

  it(`question 2 "No" routes to the Form 8938 question`, ({ task }) => {
    expect(
      givenFacts(graph({ '/hasForeignAccounts': true, '/requiredToFileFinCENForm114': false })).atPath(
        `${sources}/foreign-account-fbar`,
        null,
        task
      )
    ).toRouteNextTo(`${sources}/form-8938-required`);
  });

  it(`countries route to the Form 8938 question`, ({ task }) => {
    expect(
      givenFacts(
        graph(
          { '/hasForeignAccounts': true, '/requiredToFileFinCENForm114': true },
          { '/foreignAccountCountryLine1': `France` }
        )
      ).atPath(`${sources}/foreign-account-countries`, null, task)
    ).toRouteNextTo(`${sources}/form-8938-required`);
  });

  it(`Form 8938 "No" continues to the foreign trust grantor question`, ({ task }) => {
    expect(
      givenFacts(
        graph({ '/hasForeignAccounts': true, '/requiredToFileFinCENForm114': false, '/requiredToFileForm8938': false })
      ).atPath(`${sources}/form-8938-required`, null, task)
    ).toRouteNextTo(`${sources}/foreign-trusts-grantor`);
  });

  it(`Form 8938 "Yes" routes to the knockout`, ({ task }) => {
    expect(
      givenFacts(
        graph({ '/hasForeignAccounts': true, '/requiredToFileFinCENForm114': false, '/requiredToFileForm8938': true })
      ).atPath(`${sources}/form-8938-required`, null, task)
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

  it(`line 7a "Yes" with FBAR not required and line 8 "No" moves on to digital assets`, ({ task }) => {
    expect(
      givenFacts(
        graph({
          '/hasForeignAccounts': true,
          '/requiredToFileFinCENForm114': false,
          '/requiredToFileForm8938': false,
          '/isForeignTrustsGrantor': false,
          '/hasForeignTrustsTransactions': false,
        })
      ).atPath(`${sources}/foreign-trusts-transactions`, null, task)
    ).toRouteNextTo(`${sources}/digital-assets-received`);
  });
});
