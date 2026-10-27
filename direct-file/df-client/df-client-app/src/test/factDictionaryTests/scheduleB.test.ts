// Schedule B (Form 1040), Interest and Ordinary Dividends, Parts I-III.
// Instructions for Schedule B (Form 1040) (2025) p. 1 (same text in the 2026 draft, p. 1): "Use Schedule B (Form 1040)
// if any of the following applies. You had over $1,500 of taxable interest or ordinary dividends. ... You had a
// financial interest in, or signature authority over, a financial account in a foreign country or you received a
// distribution from, or were a grantor of, or transferor to, a foreign trust."
// A "Yes" on line 7a or line 8 knocks the return out: FinCEN Form 114 (i1040sb (2025) p. 3, required when "the
// aggregate value of foreign financial accounts exceeds $10,000"), Form 8938 (p. 2) and Form 3520 (p. 3) are not
// supported.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  primaryFilerId,
  singleFilerData,
} from '../testData.js';

const intA = `a0860000-0000-4000-8000-00000000000a`;
const intB = `a0860000-0000-4000-8000-00000000000b`;

const minimal = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

type PartIII = { accounts?: boolean; grantor?: boolean; transactions?: boolean };

const graph = (interest: Record<string, unknown>, partIII: PartIII = {}, answerPartIII = true) => {
  const facts: Record<string, unknown> = {
    ...minimal,
    ...baseFilerData,
    ...singleFilerData,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/flowHasSeenDeductions': createBooleanWrapper(true),
    ...makeW2Data(50000),
    ...interest,
    '/hasForeignAccounts': createBooleanWrapper(partIII.accounts ?? false),
    '/isForeignTrustsGrantor': createBooleanWrapper(partIII.grantor ?? false),
    '/hasForeignTrustsTransactions': createBooleanWrapper(partIII.transactions ?? false),
  };
  if (!answerPartIII) {
    delete facts['/hasForeignAccounts'];
    delete facts['/isForeignTrustsGrantor'];
    delete facts['/hasForeignTrustsTransactions'];
  }
  return setupFactGraph(facts).factGraph;
};
type Fg = ReturnType<typeof graph>;
const val = (fg: Fg, p: string) => fg.get(p as ConcretePath).get;
const dollars = (fg: Fg, p: string) => val(fg, p).toString();

const oneReport = (amount: number) => makeInterestReportData(amount, intA, primaryFilerId);
const twoReports = (a: number, b: number) => ({
  ...makeInterestReportData(a, intA, primaryFilerId),
  ...makeInterestReportData(b, intB, primaryFilerId),
  '/interestReports': createCollectionWrapper([intA, intB]),
});

describe(`Schedule B required: over $1,500 of taxable interest or ordinary dividends (i1040sb (2025) p. 1)`, () => {
  it(`threshold fact is $1,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/maximumTaxableInterestIncomeBeforeScheduleB`];
    const fg = graph(oneReport(10));
    expect(dollars(fg, `/maximumTaxableInterestIncomeBeforeScheduleB`)).toBe(`1500.00`);
  });

  it(`taxable interest exactly $1,500 is not "over $1,500": Schedule B not required`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForInterest`, `/requiresScheduleB`, `/interestIncome`];
    const fg = graph(oneReport(1500));
    expect(val(fg, `/requiresScheduleBForInterest`)).toBe(false);
    expect(val(fg, `/requiresScheduleB`)).toBe(false);
    expect(dollars(fg, `/interestIncome`)).toBe(`1500.00`);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`taxable interest $1,500.49 rounds to $1,500 (i1040 (2025) p. 23): Schedule B not required`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForInterest`, `/requiresScheduleB`];
    const fg = graph(oneReport(1500.49));
    expect(val(fg, `/requiresScheduleBForInterest`)).toBe(false);
    expect(val(fg, `/requiresScheduleB`)).toBe(false);
  });

  it(`taxable interest $1,500.50 rounds to $1,501: Schedule B required`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForInterest`, `/requiresScheduleB`];
    const fg = graph(oneReport(1500.5));
    expect(val(fg, `/requiresScheduleBForInterest`)).toBe(true);
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`two payers $750.40 + $750.40: required on the unrounded total, line 2/4 sums rounded line 1 amounts`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/requiresScheduleB`, `/interestIncome`, `/interestReports/*/roundedTaxableInterest`];
    const fg = graph(twoReports(750.4, 750.4));
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(dollars(fg, `/interestReports/#${intA}/roundedTaxableInterest`)).toBe(`750.00`);
    // Schedule B line 1 lists each payer's rounded amount; line 2 adds them: $750 + $750.
    expect(dollars(fg, `/interestIncome`)).toBe(`1500.00`);
  });

  it(`two payers totaling $1,400: not required`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleB`];
    const fg = graph(twoReports(900, 500));
    expect(val(fg, `/requiresScheduleB`)).toBe(false);
  });

  it(`ordinary dividends are part of the test; with no dividends reported the dividend test is false`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForOrdinaryDividends`, `/ordinaryDividends`];
    const fg = graph(oneReport(2000));
    expect(dollars(fg, `/ordinaryDividends`)).toBe(`0.00`);
    expect(val(fg, `/requiresScheduleBForOrdinaryDividends`)).toBe(false);
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
  });
});

describe(`Schedule B Part III: foreign accounts (line 7a) and foreign trusts (line 8)`, () => {
  it(`interest $2,000, Part III all "No": Schedule B required, return not knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleB`,
      `/hasForeignAccountsOrTrusts`,
      `/doesNotHaveForeignAccounts`,
      `/isNotForeignTrustsGrantorAndDoesNotHaveForeignTrustsTransactions`,
      `/flowIsKnockedOut`,
    ];
    const fg = graph(oneReport(2000));
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(val(fg, `/hasForeignAccountsOrTrusts`)).toBe(false);
    // Line 7a "No" and line 8 "No" boxes on the PDF.
    expect(val(fg, `/doesNotHaveForeignAccounts`)).toBe(true);
    expect(val(fg, `/isNotForeignTrustsGrantorAndDoesNotHaveForeignTrustsTransactions`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`line 7a "Yes" with $10 of interest: Schedule B required and return knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleB`,
      `/hasForeignAccountsOrTrusts`,
      `/flowIsKnockedOut`,
      `/flowShouldAskForeignTrustsTransactions`,
    ];
    const fg = graph(oneReport(10), { accounts: true });
    expect(val(fg, `/requiresScheduleBForInterest`)).toBe(false);
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(val(fg, `/hasForeignAccountsOrTrusts`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
    // The rest of line 8 is not asked once line 7a is "Yes".
    expect(val(fg, `/flowShouldAskForeignTrustsTransactions`)).toBe(false);
  });

  it(`line 8 "Yes" (grantor of a foreign trust): Schedule B required and return knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/isForeignTrustsGrantorOrHasForeignTrustsTransactions`,
      `/requiresScheduleB`,
      `/flowIsKnockedOut`,
    ];
    const fg = graph(oneReport(10), { grantor: true });
    expect(val(fg, `/isForeignTrustsGrantorOrHasForeignTrustsTransactions`)).toBe(true);
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`line 8 "Yes" (distribution from or transfer to a foreign trust): return knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleB`, `/flowIsKnockedOut`];
    const fg = graph(oneReport(10), { transactions: true });
    expect(val(fg, `/requiresScheduleB`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`ordinary dividends over $1,500 with Part III "No" does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleBForOrdinaryDividends`,
      `/scheduleBPartIIIAnswered`,
      `/flowKnockoutScheduleBPartIII`,
    ];
    const fg = graph({ ...oneReport(10), ...oneDividend(2000) });
    expect(val(fg, `/requiresScheduleBForOrdinaryDividends`)).toBe(true);
    expect(val(fg, `/scheduleBPartIIIAnswered`)).toBe(true);
    expect(val(fg, `/flowKnockoutScheduleBPartIII`)).toBe(false);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutScheduleBPartIII`);
  });

  it(`ordinary dividends over $1,500 with Part III unanswered stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleBPartIIIAnswered`, `/flowKnockoutScheduleBPartIII`];
    const fg = graph({ ...oneReport(10), ...oneDividend(1500.5) }, {}, false);
    expect(dollars(fg, `/ordinaryDividends`)).toBe(`1501.00`);
    expect(val(fg, `/requiresScheduleBForOrdinaryDividends`)).toBe(true);
    expect(val(fg, `/scheduleBPartIIIAnswered`)).toBe(false);
    expect(val(fg, `/flowKnockoutScheduleBPartIII`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`ordinary dividends of exactly $1,500 with Part III unanswered does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForOrdinaryDividends`, `/flowKnockoutScheduleBPartIII`];
    const fg = graph({ ...oneReport(10), ...oneDividend(1500) }, {}, false);
    expect(dollars(fg, `/ordinaryDividends`)).toBe(`1500.00`);
    expect(val(fg, `/requiresScheduleBForOrdinaryDividends`)).toBe(false);
    expect(val(fg, `/flowKnockoutScheduleBPartIII`)).toBe(false);
  });

  it(`line 7a "Yes" stops the return even when dividends are under $1,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleBPartIII`];
    const fg = graph({ ...oneReport(10), ...oneDividend(100) }, { accounts: true });
    expect(val(fg, `/requiresScheduleBForOrdinaryDividends`)).toBe(false);
    expect(val(fg, `/flowKnockoutScheduleBPartIII`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });
});

const divId = `b0860000-0000-4000-8000-0000000000d1`;
const oneDividend = (box1a: number) => ({
  '/dividendReports': createCollectionWrapper([divId]),
  [`/dividendReports/#${divId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${divId}/payer`]: createStringWrapper(`Index Fund Co`),
  [`/dividendReports/#${divId}/ordinaryDividends`]: createDollarWrapper(`${box1a}`),
  [`/dividendReports/#${divId}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
  [`/dividendReports/#${divId}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${divId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/dividendReportsIsDone': createBooleanWrapper(true),
});
