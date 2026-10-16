import { it, describe, expect } from 'vitest';
import { baseFilerData, makeW2Data } from '../testData.js';
import {
  createBooleanWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
} from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const aboutYou = `/flow/you-and-your-family/about-you`;
const amount = `/flow/your-taxes/amount`;
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;

// #80 PA part-year residency routing.
const graph = (move: `paToFl` | `flToPa` | `other`, w2State: `pa` | `other` = `pa`) =>
  setupFactGraph({
    ...baseFilerData,
    ...makeW2Data(50000),
    [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
    [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(w2State, `/paPartYearW2StateOptions`),
    [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`50000`),
    [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`1535`),
    '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
    '/paPartYearMove': createEnumWrapper(move, `/paPartYearMoveOptions`),
    '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
  }).factGraph;

describe(`PA part-year residency (#80) flow`, () => {
  it(`"more than one state" asks about the move`, ({ task }) => {
    expect(givenFacts(graph(`paToFl`)).atPath(`${aboutYou}/about-you-state-residency-scope`, null, task)).toRouteNextTo(
      `${aboutYou}/pa-part-year-move`
    );
  });
  it(`a PA/FL move asks for the move date`, ({ task }) => {
    expect(givenFacts(graph(`flToPa`)).atPath(`${aboutYou}/pa-part-year-move`, null, task)).toRouteNextTo(
      `${aboutYou}/pa-part-year-move-date`
    );
  });
  it(`a move involving another state routes to the unsupported-state knockout`, ({ task }) => {
    expect(givenFacts(graph(`other`)).atPath(`${aboutYou}/pa-part-year-move`, null, task)).toRouteNextTo(
      `${aboutYou}/about-you-state-income-scope-ko`
    );
  });
  it(`a W-2 from another state routes to the part-year knockout`, ({ task }) => {
    expect(givenFacts(graph(`paToFl`, `other`)).atPath(`${amount}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${amount}/pa-part-year-knockout`
    );
  });
  it(`a supported part-year return continues to the tax amount`, ({ task }) => {
    expect(givenFacts(graph(`paToFl`)).atPath(`${amount}/pa-unsupported-items`, null, task)).toRouteNextTo(
      `${amount}/tax-amount-intro`
    );
  });
});
