import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

/**
 * #78 PA-40 core, full-year PA residents. PA-40 IN (2025) booklet (2026 not yet published):
 * https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf
 * p. 20 LINE 9: "Add only the positive income amounts from Lines 1c through 8. Do not add, subtract, or take losses
 * into consideration." p. 21 LINE 12: "Multiply Line 11 by 3.07 percent (0.0307)." 72 P.S. §7302(a), §7303(a).
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get.toString();
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const intId = `693d539c-6679-4264-b6b5-d7411e318395`;
const txId = `b8888888-8888-4888-8888-888888888888`;
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
const pa = (state = `pa`) => ({ '/filerResidenceAndIncomeState': createEnumWrapper(state, `/scopedStateOptions`) });
const w2 = (wages: number, paWages: number | undefined, paWithheld: number) => ({
  ...makeW2Data(wages),
  [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
  ...(paWages === undefined ? {} : { [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`${paWages}`) }),
  [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`${paWithheld}`),
});
const build = (status: Record<string, unknown>, extra: Record<string, unknown>) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
    '/soldCapitalAssets': createBooleanWrapper(false),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
    ...pa(),
    ...extra,
  }).factGraph;
const interest = (box1: number, box3 = 0) => ({
  ...makeInterestReportData(0, intId, primaryFilerId),
  [`/interestReports/#${intId}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${intId}/writable1099Amount`]: createDollarWrapper(`${box1}`),
  [`/interestReports/#${intId}/writableInterestOnGovernmentBonds`]: createDollarWrapper(`${box3}`),
});
const sale = (proceeds: number, basis: number) => ({
  '/form8949Transactions': createCollectionWrapper([txId]),
  [`/form8949Transactions/#${txId}/description`]: createStringWrapper(`100 sh XYZ`),
  [`/form8949Transactions/#${txId}/dateAcquired`]: createDayWrapper(`2020-06-01`),
  [`/form8949Transactions/#${txId}/dateSold`]: createDayWrapper(`2026-07-01`),
  [`/form8949Transactions/#${txId}/proceeds`]: createDollarWrapper(`${proceeds}`),
  [`/form8949Transactions/#${txId}/costBasis`]: createDollarWrapper(`${basis}`),
  [`/form8949Transactions/#${txId}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${txId}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${txId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});
const KOS = [`/flowKnockoutPaUnsupportedItems`, `/flowKnockoutPaUnsupportedIncome`, `/flowKnockoutPaTaxForgiveness`];

describe(`PA-40 core (#78)`, () => {
  it(`compensation only: line 1a = W-2 box 16 (not box 1); 3.07%; refund`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/paLine1a`,
      `/paLine9`,
      `/paLine11`,
      `/paLine12`,
      `/paLine13`,
      `/paLine29`,
      `/stateRefund`,
    ];
    // box 1 $57,000 (after $3,000 401(k)); PA box 16 $60,000; 3.07% × 60,000 = 1,842.00; withheld 2,000 → refund 158
    const g = build(singleFilerData, w2(57000, 60000, 2000));
    expect(get(g, `/stateReturnIsPa`).get).toBe(true);
    expect(val(g, `/paLine1a`)).toBe(`60000.00`);
    expect(val(g, `/paLine9`)).toBe(`60000.00`);
    expect(val(g, `/paLine12`)).toBe(`1842.00`);
    expect(val(g, `/paLine13`)).toBe(`2000.00`);
    expect(val(g, `/paLine29`)).toBe(`158.00`);
    expect(val(g, `/paLine26`)).toBe(`0.00`);
    expect(val(g, `/stateTaxLiability`)).toBe(`1842.00`);
    expect(val(g, `/stateRefund`)).toBe(`158.00`);
    KOS.forEach((k) => expect(get(g, k).get).toBe(false));
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  });
  it(`balance due: withholding below 3.07%`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine26`, `/stateAmountOwed`];
    // 3.07% × 45,000 = 1,381.50; withheld 1,000 → due 381.50
    const g = build(singleFilerData, w2(45000, 45000, 1000));
    expect(val(g, `/paLine12`)).toBe(`1381.50`);
    expect(val(g, `/paLine26`)).toBe(`381.50`);
    expect(val(g, `/paLine29`)).toBe(`0.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`381.50`);
  });
  it(`interest: U.S. obligation interest (1099-INT box 3) is PA-exempt (p. 14)`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine2`];
    // box 1 $1,200 + box 3 $800 → federal taxable $2,000, PA line 2 $1,200
    const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...interest(1200, 800) });
    expect(val(g, `/interestIncome`)).toBe(`2000.00`);
    expect(val(g, `/paLine2`)).toBe(`1200.00`);
    expect(val(g, `/paLine3`)).toBe(`0.00`); // dividends out of scope in this app
    expect(val(g, `/paLine9`)).toBe(`41200.00`);
    expect(val(g, `/paLine12`)).toBe(`1264.84`); // 41,200 × 0.0307
  });
  it(`a net loss in class 5 (property) does not offset compensation (line 9, p. 20)`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine5`, `/paLine9`];
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...sale(4000, 10000) });
    expect(val(g, `/paLine5`)).toBe(`-6000.00`);
    expect(val(g, `/paLine9`)).toBe(`50000.00`);
    expect(val(g, `/paLine12`)).toBe(`1535.00`);
    expect(val(g, `/paLine29`)).toBe(`0.00`);
    expect(val(g, `/paLine26`)).toBe(`0.00`);
  });
  it(`a class 5 gain is added`, () => {
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...sale(14000, 10000) });
    expect(val(g, `/paLine9`)).toBe(`54000.00`);
  });
  it(`Florida resident (#103): framework marks FL, computes no state return`, ({ task }) => {
    task.meta.testedFactPaths = [`/stateReturnIsFl`, `/stateReturnComputed`];
    const g = build(singleFilerData, { ...w2(50000, 50000, 0), ...pa(`fl`) });
    expect(get(g, `/stateReturnIsFl`).get).toBe(true);
    expect(get(g, `/stateReturnIsPa`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expect(get(g, `/stateTaxLiability`).complete).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  });
  it(`non-PA resident: no PA return, state facts undefined, no PA knockouts`, () => {
    const g = build(singleFilerData, { ...w2(50000, 50000, 0), ...pa(`nj`) });
    expect(get(g, `/stateReturnIsPa`).get).toBe(false);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expect(get(g, `/stateTaxLiability`).complete).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  });
});

describe(`PA-40 knockouts (BlockSubmissionOnTrue, /flowKnockoutStateReturn in /flowIsKnockedOut)`, () => {
  const blocks = (g: Fg, k: string) => {
    expect(get(g, k).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(k);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutStateReturn`);
  };
  it(`unsupported PA items (UE, Line 10 deductions, G-L, OC/DC, estimates, use tax, Sch J/T) = yes`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedItems`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
    blocks(
      build(singleFilerData, { ...w2(50000, 50000, 1535), '/paHasUnsupportedItems': createBooleanWrapper(true) }),
      `/flowKnockoutPaUnsupportedItems`
    );
  });
  it(`W-2 with box 1 wages but no box 16 PA wages`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`];
    blocks(build(singleFilerData, w2(50000, undefined, 0)), `/flowKnockoutPaUnsupportedIncome`);
  });
  it(`box 8 tax-exempt interest`, () => {
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      ...interest(100),
      [`/interestReports/#${intId}/writableTaxExemptInterest`]: createDollarWrapper(`500`),
    });
    blocks(g, `/flowKnockoutPaUnsupportedIncome`);
  });
  it(`joint return with property sales (spouse losses can't offset, p. 7)`, () => {
    blocks(
      build(mfjFilerData, { ...w2(80000, 80000, 2456), ...sale(14000, 10000) }),
      `/flowKnockoutPaUnsupportedIncome`
    );
  });
  it(`possible Tax Forgiveness (Schedule SP, #79): single line 11 ≤ $8,750 blocks; $8,751 does not`, ({ task }) => {
    task.meta.testedFactPaths = [`/paTaxForgivenessCeiling`, `/flowKnockoutPaTaxForgiveness`];
    const lo = build(singleFilerData, w2(8750, 8750, 0));
    expect(val(lo, `/paTaxForgivenessCeiling`)).toBe(`8750.00`);
    blocks(lo, `/flowKnockoutPaTaxForgiveness`);
    expect(get(build(singleFilerData, w2(8751, 8751, 0)), `/flowKnockoutPaTaxForgiveness`).get).toBe(false);
  });
  it(`married ceiling is $15,250`, () => {
    const g = build(mfjFilerData, w2(15250, 15250, 0));
    expect(val(g, `/paTaxForgivenessCeiling`)).toBe(`15250.00`);
    expect(get(g, `/flowKnockoutPaTaxForgiveness`).get).toBe(true);
    expect(get(build(mfjFilerData, w2(15251, 15251, 0)), `/flowKnockoutPaTaxForgiveness`).get).toBe(false);
  });
});
