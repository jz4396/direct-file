import { it, describe, expect } from 'vitest';
import { baseFilerData, makeW2Data } from '../testData.js';
import { createBooleanWrapper, createDollarWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const path = `/flow/your-taxes/amount`;
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;

// #78 PA-40 core knockout routing.
const graph = (paWages: number, unsupported: boolean) =>
  setupFactGraph({
    ...baseFilerData,
    ...makeW2Data(paWages),
    [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
    [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`${paWages}`),
    [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`0`),
    '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
    '/paHasUnsupportedItems': createBooleanWrapper(unsupported),
  }).factGraph;

describe(`PA-40 core (#78) flow`, () => {
  it(`yes to unsupported PA items routes to the knockout`, ({ task }) => {
    expect(givenFacts(graph(50000, true)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/pa-unsupported-items-knockout`
    );
  });
  it(`possible Tax Forgiveness routes to its knockout`, ({ task }) => {
    expect(givenFacts(graph(5000, false)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/pa-tax-forgiveness-knockout`
    );
  });
  it(`no PA knockouts continues to the tax amount`, ({ task }) => {
    expect(givenFacts(graph(50000, false)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
});
