// #144: Form 1099-INT amounts that Schedule B (Form 1040) Part I reports on line 1 and then subtracts below a
// subtotal before line 2. Instructions for Schedule B (Form 1040) (2025) https://www.irs.gov/pub/irs-pdf/i1040sb.pdf
// p. 1, Line 1, Nominees: "Below this subtotal, enter “Nominee Distribution” and show the total interest you received
// as a nominee. Subtract this amount from the subtotal and enter the result on line 2." p. 2, Accrued interest:
// "follow the rules earlier under Nominees to see how to report the accrued interest. But identify the amount to be
// subtracted as “Accrued Interest.”" Pub. 550 (2025) https://www.irs.gov/pub/irs-pdf/p550.pdf p. 25: "Below the
// subtotal, enter “U.S. Savings Bond Interest Previously Reported” and enter amounts previously reported or interest
// accrued before you received the bond." The tool doesn't produce the subtraction, so each yes is a knockout.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createCollectionWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import { baseFilerData, singleFilerData } from '../testData.js';

type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);

const i1 = `7d4b70b2-5e80-46be-a387-24d22e6fad46`;
const i2 = `8e5c81c3-6f91-47cf-b498-35e33f7abe57`;
const KO = `/flowKnockoutInterestScheduleBSubtraction`;

type Answers = { nominee?: boolean; accrued?: boolean; savingsBond?: boolean; box3?: number };
const report = (id: string, a: Answers) => ({
  [`/interestReports/#${id}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${id}/writable1099Amount`]: createDollarWrapper(`500`),
  [`/interestReports/#${id}/writableInterestOnGovernmentBonds`]: createDollarWrapper(`${a.box3 ?? 0}`),
  ...(a.nominee === undefined
    ? {}
    : { [`/interestReports/#${id}/receivedAsNominee`]: createBooleanWrapper(a.nominee) }),
  ...(a.accrued === undefined
    ? {}
    : { [`/interestReports/#${id}/paidAccruedInterest`]: createBooleanWrapper(a.accrued) }),
  ...(a.savingsBond === undefined
    ? {}
    : { [`/interestReports/#${id}/savingsBondInterestPreviouslyReported`]: createBooleanWrapper(a.savingsBond) }),
});
const build = (...reports: [string, Answers][]) =>
  setupFactGraph({
    ...baseFilerData,
    ...singleFilerData,
    '/interestReports': createCollectionWrapper(reports.map(([id]) => id)),
    ...Object.assign({}, ...reports.map(([id, a]) => report(id, a))),
  }).factGraph;

const allNo: Answers = { nominee: false, accrued: false, savingsBond: false, box3: 200 };

describe(`#144 Schedule B Part I subtraction knockouts (1099-INT)`, () => {
  it(`is a submission-blocking fact listed in /flowIsKnockedOut`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    expect(submissionBlockingFacts).toContain(KO);
  });
  it(`nominee interest stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/interestReports/*/receivedAsNominee`,
      `/interestReports/*/hasScheduleBSubtraction`,
      KO,
    ];
    const g = build([i1, { ...allNo, nominee: true }]);
    expect(get(g, `/interestReports/#${i1}/hasScheduleBSubtraction`).get).toBe(true);
    expect(get(g, KO).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
  it(`accrued interest paid to the seller stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestReports/*/paidAccruedInterest`, KO];
    const g = build([i1, { ...allNo, accrued: true }]);
    expect(get(g, KO).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
  it(`savings bond interest previously reported stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestReports/*/savingsBondInterestPreviouslyReported`, KO];
    const g = build([i1, { ...allNo, savingsBond: true }]);
    expect(get(g, KO).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
  it(`a yes on the second of two 1099-INTs stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const g = build([i1, allNo], [i2, { nominee: false, accrued: true, box3: 0 }]);
    expect(get(g, `/interestReports/#${i1}/hasScheduleBSubtraction`).get).toBe(false);
    expect(get(g, `/interestReports/#${i2}/hasScheduleBSubtraction`).get).toBe(true);
    expect(get(g, KO).get).toBe(true);
  });
  it(`all No does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestReports/*/hasScheduleBSubtraction`, KO];
    const g = build([i1, allNo], [i2, { nominee: false, accrued: false, box3: 0 }]);
    expect(get(g, KO).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`box 3 decides whether the savings bond question is asked`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestReports/*/hasInterestOnGovernmentBonds`];
    const g = build([i1, { box3: 200 }], [i2, { box3: 0 }]);
    expect(get(g, `/interestReports/#${i1}/hasInterestOnGovernmentBonds`).get).toBe(true);
    expect(get(g, `/interestReports/#${i2}/hasInterestOnGovernmentBonds`).get).toBe(false);
  });
  it(`no interest reports does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const g = setupFactGraph({ ...baseFilerData, ...singleFilerData }).factGraph;
    expect(get(g, KO).get).toBe(false);
  });
});
