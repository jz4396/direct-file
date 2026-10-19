// Penalty on early withdrawal of savings, Schedule 1 (Form 1040) line 18.
// 26 U.S.C. 62(a)(9) (https://www.law.cornell.edu/uscode/text/26/62#a_9): above-the-line deduction for "amounts
// forfeited to a bank ... as a penalty for premature withdrawal of funds from a time savings account, certificate of
// deposit, or similar class of deposit." Instructions for Form 1040 (2026 draft) p. 95 (PDF p. 96), Line 18: "The Form
// 1099-INT or Form 1099-OID you received will show the amount of any penalty you were charged." The amount is the sum
// of 1099-INT box 2; there is no dollar threshold and no cap at the interest reported in box 1.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createCollectionWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  primaryFilerId,
  singleFilerData,
} from '../testData.js';

const intA = `a1150000-0000-4000-8000-000000000001`;
const intB = `a1150000-0000-4000-8000-000000000002`;

const report = (id: string, box1: number, box2: number) => ({
  ...makeInterestReportData(0, id, primaryFilerId),
  [`/interestReports/#${id}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${id}/writable1099Amount`]: createDollarWrapper(`${box1}`),
  [`/interestReports/#${id}/writableEarlyWithdrawlPenaltyAmount`]: createDollarWrapper(`${box2}`),
});

const minimal = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const graph = (wages: number, extra: Record<string, unknown>) =>
  setupFactGraph({
    ...minimal,
    ...baseFilerData,
    ...singleFilerData,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/flowHasSeenDeductions': createBooleanWrapper(true),
    ...makeW2Data(wages),
    ...extra,
  }).factGraph;
type Fg = ReturnType<typeof graph>;
const val = (fg: Fg, p: string) => fg.get(p as ConcretePath).get;
const dollars = (fg: Fg, p: string) => val(fg, p).toString();

describe(`Schedule 1 line 18: penalty on early withdrawal of savings (26 U.S.C. 62(a)(9))`, () => {
  it(`single, W-2 $50,000, 1099-INT box 1 $1,200, box 2 $150: line 18 $150, AGI $51,050, not knocked out`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/earlyWithdrawalPenaltyTotal`,
      `/adjustmentsToIncome`,
      `/agi`,
      `/requiresSchedule1`,
      `/flowIsKnockedOut`,
    ];
    const fg = graph(50000, report(intA, 1200, 150));
    expect(dollars(fg, `/interestIncome`)).toBe(`1200.00`);
    expect(dollars(fg, `/earlyWithdrawalPenaltyTotal`)).toBe(`150.00`);
    // Schedule 1 line 26 (Form 1040 line 10) includes line 18.
    expect(dollars(fg, `/adjustmentsToIncome`)).toBe(`150.00`);
    // Form 1040 line 11: total income $51,200 - adjustments $150.
    expect(dollars(fg, `/agi`)).toBe(`51050.00`);
    expect(val(fg, `/requiresSchedule1`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`penalty larger than the interest (box 1 $40, box 2 $90): deduction $90, no cap at interest`, ({ task }) => {
    task.meta.testedFactPaths = [`/earlyWithdrawalPenaltyTotal`, `/adjustmentsToIncome`, `/agi`];
    const fg = graph(50000, report(intA, 40, 90));
    expect(dollars(fg, `/earlyWithdrawalPenaltyTotal`)).toBe(`90.00`);
    expect(dollars(fg, `/adjustmentsToIncome`)).toBe(`90.00`);
    // $50,000 + $40 - $90.
    expect(dollars(fg, `/agi`)).toBe(`49950.00`);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`sums box 2 across all 1099-INTs`, ({ task }) => {
    task.meta.testedFactPaths = [`/earlyWithdrawalPenaltyTotal`, `/agi`];
    const fg = graph(50000, {
      ...report(intA, 1200, 150),
      ...report(intB, 300, 25),
      '/interestReports': createCollectionWrapper([intA, intB]),
    });
    expect(dollars(fg, `/earlyWithdrawalPenaltyTotal`)).toBe(`175.00`);
    // $50,000 + $1,500 - $175.
    expect(dollars(fg, `/agi`)).toBe(`51325.00`);
  });

  it(`no penalty: line 18 is $0 and AGI is unchanged`, ({ task }) => {
    task.meta.testedFactPaths = [`/earlyWithdrawalPenaltyTotal`, `/agi`];
    const fg = graph(50000, report(intA, 1200, 0));
    expect(dollars(fg, `/earlyWithdrawalPenaltyTotal`)).toBe(`0.00`);
    expect(dollars(fg, `/agi`)).toBe(`51200.00`);
  });

  it(`line 18 reduces the student loan interest MAGI (Schedule 1 lines 11-20, 23 and 25)`, ({ task }) => {
    task.meta.testedFactPaths = [`/adjustmentsToIncomeExcludingStudentLoanInterest`];
    const fg = graph(50000, report(intA, 1200, 150));
    expect(dollars(fg, `/adjustmentsToIncomeExcludingStudentLoanInterest`)).toBe(`150.00`);
  });
});
