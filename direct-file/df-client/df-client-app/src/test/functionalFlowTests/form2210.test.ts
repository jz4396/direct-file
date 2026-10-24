// #92 Form 2210 Part II routing in the amount section. Form 2210 (2026) draft,
// https://www.irs.gov/pub/irs-dft/f2210--dft.pdf p. 1: ask Part II only when lines 4 and 7 are $1,000 or more; any
// box knocks out; with none, the IRS figures any penalty and sends a bill.
import { it, describe, expect } from 'vitest';
import { baseFilerData, filerWithW2NoDeductionsNoCreditsBaseData, makeW2Data, primaryFilerId } from '../testData.js';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const path = `/flow/your-taxes/amount`;
const w2Id = `92b00000-0000-4000-8000-000000000001`;

const minimal = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
// $60,000 wages, single. Withholding $6,000 covers the tax (no question); $0 leaves line 7 over $1,000.
const graph = (withholding: number, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...minimal,
    ...baseFilerData,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/flowHasSeenDeductions': createBooleanWrapper(true),
    ...makeW2Data(60000, w2Id),
    [`/formW2s/#${w2Id}/writableFederalWithholding`]: createDollarWrapper(`${withholding}`),
    ...extra,
  }).factGraph;
const yn = (waiver: boolean, annualized: boolean, dates: boolean, joint: boolean) => ({
  '/form2210WaiverRequested': createBooleanWrapper(waiver),
  '/form2210AnnualizedIncome': createBooleanWrapper(annualized),
  '/form2210WithholdingOnActualDates': createBooleanWrapper(dates),
  '/form2210FiledJointReturnPriorYear': createBooleanWrapper(joint),
});
const ko = `${path}/est-tax-penalty-knockout`;

describe(`Form 2210 Part II (#92) flow`, () => {
  it(`line 7 under $1,000: the 8615 knockout check goes straight to the tax amount`, ({ task }) => {
    expect(givenFacts(graph(6000)).atPath(`${path}/form-8615-knockout`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
  it(`line 7 of $1,000 or more: the Part II questions come before the tax amount`, ({ task }) => {
    expect(givenFacts(graph(0)).atPath(`${path}/form-8615-knockout`, null, task)).toRouteNextTo(
      `${path}/est-tax-penalty-waiver`
    );
  });
  it(`the questions run waiver, annualized income, withholding dates, joint return`, ({ task }) => {
    const g = graph(0, yn(false, false, false, false));
    expect(givenFacts(g).atPath(`${path}/est-tax-penalty-waiver`, null, task)).toRouteNextTo(
      `${path}/est-tax-penalty-annualized`
    );
    expect(givenFacts(g).atPath(`${path}/est-tax-penalty-annualized`, null, task)).toRouteNextTo(
      `${path}/est-tax-penalty-withholding-dates`
    );
    expect(givenFacts(g).atPath(`${path}/est-tax-penalty-withholding-dates`, null, task)).toRouteNextTo(
      `${path}/est-tax-penalty-joint-prior-year`
    );
  });
  it(`all no: IRS will bill note, then the tax amount`, ({ task }) => {
    const g = graph(0, yn(false, false, false, false));
    expect(givenFacts(g).atPath(`${path}/est-tax-penalty-joint-prior-year`, null, task)).toRouteNextTo(
      `${path}/est-tax-penalty-irs-will-bill`
    );
    expect(givenFacts(g).atPath(`${path}/est-tax-penalty-irs-will-bill`, null, task)).toRouteNextTo(
      `${path}/tax-amount-intro`
    );
  });
  for (const [label, answers] of [
    [`A/B waiver`, yn(true, false, false, false)],
    [`C annualized income`, yn(false, true, false, false)],
    [`D withholding dates`, yn(false, false, true, false)],
    [`E joint return for 2025 only`, yn(false, false, false, true)],
  ] as const) {
    it(`box ${label} yes routes to the knockout`, ({ task }) => {
      expect(
        givenFacts(graph(0, answers)).atPath(`${path}/est-tax-penalty-joint-prior-year`, null, task)
      ).toRouteNextTo(ko);
    });
  }
});
