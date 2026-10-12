import { describe, it, expect } from 'vitest';
import { createBooleanWrapper } from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData } from '../testData.js';

/**
 * #26: knockout for cash/charge tips not reported to the employer (Form 4137, Schedule 2 line 5).
 * Form 4137 (2025) p.1 "Who must file"; Pub. 531 (12-2024) p.5; 26 U.S.C. 3121(q), 3102(c).
 * Full quotes: formW2s.xml /hasUnreportedTips.
 */
describe(`Unreported tips (Form 4137) knockout (#26)`, () => {
  it(`W-2 filer who answers yes is knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutUnreportedTips`, `/flowIsKnockedOut`];
    const { factGraph } = setupFactGraph({
      ...filerWithW2NoDeductionsNoCreditsBaseData,
      '/hasUnreportedTips': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/flowKnockoutUnreportedTips` as ConcretePath).get).toBe(true);
    expect(factGraph.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(true);
  });

  it(`W-2 filer who answers no is not knocked out by this check`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutUnreportedTips`];
    const { factGraph } = setupFactGraph({
      ...filerWithW2NoDeductionsNoCreditsBaseData,
      '/hasUnreportedTips': createBooleanWrapper(false),
    });
    expect(factGraph.get(`/flowKnockoutUnreportedTips` as ConcretePath).get).toBe(false);
  });

  it(`existing W-2-only return (question never answered) is unaffected`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutUnreportedTips`, `/flowIsKnockedOut`];
    const unanswered = setupFactGraph({ ...filerWithW2NoDeductionsNoCreditsBaseData }).factGraph;
    const answeredNo = setupFactGraph({
      ...filerWithW2NoDeductionsNoCreditsBaseData,
      '/hasUnreportedTips': createBooleanWrapper(false),
    }).factGraph;
    expect(unanswered.get(`/flowKnockoutUnreportedTips` as ConcretePath).get).toBe(false);
    // Overall knockout status and total tax are the same as before the question existed (answer "no").
    expect(unanswered.get(`/flowIsKnockedOut` as ConcretePath).get).toBe(
      answeredNo.get(`/flowIsKnockedOut` as ConcretePath).get
    );
    expect(unanswered.get(`/totalTax` as ConcretePath).complete).toBe(true);
    expect(unanswered.get(`/totalTax` as ConcretePath).get.toString()).toBe(
      answeredNo.get(`/totalTax` as ConcretePath).get.toString()
    );
  });
});
