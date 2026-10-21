import { it, describe, expect } from 'vitest';
import { baseFilerData, makeW2Data, primaryFilerId } from '../testData.js';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const path = `/flow/your-taxes/amount`;
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;

// #78 PA-40 core knockout routing.
const graph = (paWages: number, unsupported: boolean, spIncome?: boolean, ue = false) =>
  setupFactGraph({
    ...baseFilerData,
    ...makeW2Data(paWages),
    [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
    [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`${paWages}`),
    [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`0`),
    '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
    '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(ue),
    '/paHasUnsupportedItems': createBooleanWrapper(unsupported),
    ...(spIncome === undefined ? {} : { '/paHasSpNontaxableIncome': createBooleanWrapper(spIncome) }),
  }).factGraph;

describe(`PA-40 core (#78) flow`, () => {
  it(`yes to line 1b unreimbursed employee expenses routes to the knockout (#102)`, ({ task }) => {
    expect(
      givenFacts(graph(50000, false, undefined, true)).atPath(`${path}/pa-unreimbursed-employee-expenses`, null, task)
    ).toRouteNextTo(`${path}/pa-unreimbursed-employee-expenses-knockout`);
  });
  it(`no to line 1b continues to the other unsupported PA items (#102)`, ({ task }) => {
    expect(
      givenFacts(graph(50000, false)).atPath(`${path}/pa-unreimbursed-employee-expenses`, null, task)
    ).toRouteNextTo(`${path}/pa-unsupported-items`);
  });
  it(`yes to unsupported PA items routes to the knockout`, ({ task }) => {
    expect(givenFacts(graph(50000, true)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/pa-unsupported-items-knockout`
    );
  });
  it(`possibly eligible for Tax Forgiveness asks the Schedule SP income question (#79)`, ({ task }) => {
    expect(givenFacts(graph(5000, false)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/pa-sp-nontaxable-income`
    );
  });
  it(`yes to Schedule SP nontaxable income routes to the SP knockout`, ({ task }) => {
    expect(givenFacts(graph(5000, false, true)).atPath(`${path}/pa-sp-nontaxable-income`, null, task)).toRouteNextTo(
      `${path}/pa-sp-unsupported-knockout`
    );
  });
  it(`no to Schedule SP nontaxable income continues to the tax amount`, ({ task }) => {
    expect(givenFacts(graph(5000, false, false)).atPath(`${path}/pa-sp-nontaxable-income`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
  it(`above the Schedule SP tables skips the SP question and to the tax amount`, ({ task }) => {
    expect(givenFacts(graph(50000, false)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
});

// #154: PA Schedule B is required (PA-40 Schedule B (2025) instructions, PDF p. 3, WHO MUST COMPLETE); over $2,500 of
// PA-taxable dividends is a limit this tool sets. The dividend screens before it don't stop these cases.
describe(`PA Schedule B dividend knockout (#154) flow`, () => {
  const divId = `15400000-0000-4000-8000-000000000001`;
  const withDividends = (box1a: number) => {
    const { factGraph } = setupFactGraph({
      ...baseFilerData,
      ...makeW2Data(50000),
      [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
      [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`50000`),
      [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`0`),
      '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
      '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
      '/paHasUnsupportedItems': createBooleanWrapper(false),
      '/paHasExemptObligationDividends': createBooleanWrapper(false),
      '/dividendReports': createCollectionWrapper([divId]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      [`/dividendReports/#${divId}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`/dividendReports/#${divId}/payer`]: createStringWrapper(`Index Fund Co`),
      [`/dividendReports/#${divId}/ordinaryDividends`]: createDollarWrapper(`${box1a}`),
      [`/dividendReports/#${divId}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${divId}/receivedAsNominee`]: createBooleanWrapper(false),
      [`/dividendReports/#${divId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
    });
    return factGraph;
  };
  it(`$3,000 of dividends routes from the PA items question to the Schedule B knockout`, ({ task }) => {
    expect(givenFacts(withDividends(3000)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/pa-schedule-b-knockout`
    );
  });
  it(`$2,500 of dividends continues to the tax amount`, ({ task }) => {
    expect(givenFacts(withDividends(2500)).atPath(`${path}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
});
