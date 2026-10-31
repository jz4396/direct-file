import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEinWrapper,
  createEnumWrapper,
  createMultEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeChildData,
  makeQualifyingPersonNonChild,
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
    '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
    '/paHasScheduleCTaxShelter': createBooleanWrapper(false),
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
const KOS = [
  `/flowKnockoutPaUnreimbursedEmployeeExpenses`,
  `/flowKnockoutPaUnsupportedItems`,
  `/flowKnockoutPaUnsupportedIncome`,
  `/flowKnockoutPaSpUnsupported`,
];

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
    expect(val(g, `/paLine6`)).toBe(`0.00`);
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
    expect(val(g, `/paLine3`)).toBe(`0.00`); // no 1099-DIV
    expect(val(g, `/paLine6`)).toBe(`0.00`);
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
  it(`line 1b unreimbursed employee business expenses (PA Schedule UE) = yes (#102)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaUnreimbursedEmployeeExpenses`,
      `/flowKnockoutStateReturn`,
      `/flowIsKnockedOut`,
    ];
    // PA-40 IN (2025) p. 27: Schedule UE isn't computed, so a yes knocks out rather than leaving line 1b at $0.
    blocks(
      build(singleFilerData, {
        ...w2(50000, 50000, 1535),
        '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(true),
      }),
      `/flowKnockoutPaUnreimbursedEmployeeExpenses`
    );
  });
  it(`line 1b left unanswered stays incomplete (#102)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnreimbursedEmployeeExpenses`, `/flowIsKnockedOut`];
    const { factGraph: g } = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
      '/soldCapitalAssets': createBooleanWrapper(false),
      '/paHasUnsupportedItems': createBooleanWrapper(false),
      '/paHasSpNontaxableIncome': createBooleanWrapper(false),
      ...pa(),
      ...w2(50000, 50000, 1535),
    });
    expect(get(g, `/flowKnockoutPaUnreimbursedEmployeeExpenses`).complete).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).complete).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).complete).toBe(false);
  });
  it(`line 1b = no: line 1b $0, line 1c = line 1a, no knockout (#102)`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine1b`, `/paLine1c`];
    const g = build(singleFilerData, w2(50000, 50000, 1535));
    expect(val(g, `/paLine1b`)).toBe(`0.00`);
    expect(val(g, `/paLine1c`)).toBe(`50000.00`);
    expect(get(g, `/flowKnockoutPaUnreimbursedEmployeeExpenses`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  });
  it(`line 1b yes for a non-PA resident doesn't block (#102)`, () => {
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 0),
      ...pa(`nj`),
      '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(true),
    });
    expect(get(g, `/flowKnockoutPaUnreimbursedEmployeeExpenses`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`unsupported PA items (Line 10 deductions, G-L, OC/DC, estimates, use tax, Sch J/T) = yes`, ({ task }) => {
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
  it(`1099-DIV box 12 is Form 1040 line 2a and still stops a PA-40`, ({ task }) => {
    // PA-40 Schedule B (2025) line 7: exempt-interest dividends reported in box 12. Those dividends are federal line
    // 2a (26 U.S.C. 852(b)(5)(B)). A PA-40 still stops because line 2a is not split into PA and other-state
    // obligations (/flowKnockoutPaUnsupportedIncome and /flowKnockoutPaScheduleA).
    task.meta.testedFactPaths = [
      `/taxExemptInterest`,
      `/flowKnockoutPaUnsupportedIncome`,
      `/flowKnockoutPaScheduleA`,
      `/flowKnockoutDividendUnsupportedBoxes`,
    ];
    const divId = `86c00000-0000-4000-8000-000000000012`;
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `2101` }),
      [`/formW2s/#${w2Id}/ein`]: createEinWrapper(`99`, `9002102`),
      '/paHasExemptObligationDividends': createBooleanWrapper(false),
      '/dividendReports': createCollectionWrapper([divId]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      [`/dividendReports/#${divId}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`/dividendReports/#${divId}/payer`]: createStringWrapper(`Muni Fund`),
      [`/dividendReports/#${divId}/ordinaryDividends`]: createDollarWrapper(`0`),
      [`/dividendReports/#${divId}/writableExemptInterestDividends`]: createDollarWrapper(`400`),
      [`/dividendReports/#${divId}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${divId}/receivedAsNominee`]: createBooleanWrapper(false),
      [`/dividendReports/#${divId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
    });
    expect(val(g, `/taxExemptInterest`)).toBe(`400.00`);
    expect(get(g, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaScheduleA`).get).toBe(true);
    blocks(g, `/flowKnockoutPaUnsupportedIncome`);
  });
  describe(`Schedule C income: PA-only knockout stays off for full-year supported path`, () => {
    const bizId = `a59c03d1-af4a-447f-96aa-d19397048a77`;
    // Synthetic Schedule C business, $10,000 receipts, $2,000 expenses; no W-2s.
    const schC = {
      '/formW2s': createCollectionWrapper([]),
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
      '/qbiIsCooperativePatron': createBooleanWrapper(false),
      '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
      '/hadChurchEmployeeIncome': createBooleanWrapper(false),
      '/usesSeOptionalMethod': createBooleanWrapper(false),
      '/hasMinisterOrSeExemption': createBooleanWrapper(false),
      '/hasNotarySeExclusion': createBooleanWrapper(false),
      '/hadForm8919Wages': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([bizId]),
      [`/scheduleCBusinesses/#${bizId}/businessName`]: createStringWrapper(`Synthetic Business`),
      [`/scheduleCBusinesses/#${bizId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${bizId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      [`/scheduleCBusinesses/#${bizId}/materiallyParticipates`]: createBooleanWrapper(true),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    };
    it(`non-PA (FL) filer: PA knockout false; Form 8995 still stops the return`, ({ task }) => {
      task.meta.testedFactPaths = [
        `/flowKnockoutPaUnsupportedIncome`,
        `/flowKnockoutStateReturn`,
        `/flowKnockoutForm8995WithoutTy2026Template`,
        `/flowIsKnockedOut`,
      ];
      const g = build(singleFilerData, { ...schC, ...pa(`fl`) });
      expect(get(g, `/hasScheduleCBusinesses`).get).toBe(true);
      expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
      expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
      expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
      // #87: Form 8995 computes the QBI deduction, so the federal QBI knockout is off too.
      expect(get(g, `/flowKnockoutScheduleCQbi`).get).toBe(false);
      // Instructions for Form 1040 (2025) draft, PDF p. 35: "Attach whichever form you use (Form 8995 or 8995-A) to
      // your return." The PDF prints (#17). Submission still stops because there is no MeF mapping.
      expect(get(g, `/form8995Required`).get).toBe(true);
      expect(get(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
      // Schedule C prints (#239). Instructions for Schedule C (2025), PDF p. 2; 2026 draft Schedule C line 31
      // ties to Schedule 1 line 3 and Schedule SE line 2 (26 U.S.C. 1402(a)).
      expect(get(g, `/scheduleCNetProfitOrLoss`).get.toString()).toBe(`8000.00`);
      expect(get(g, `/schedule1Line3`).get.toString()).toBe(`8000.00`);
      expect(val(g, `/paLine4`)).toBe(`0.00`);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
    it(`PA filer, same income: unsupported-income false; line 4 is federal line 31; PA Schedule C + Form 8995 stop`, ({
      task,
    }) => {
      task.meta.testedFactPaths = [
        `/flowKnockoutPaUnsupportedIncome`,
        `/flowKnockoutPaScheduleC`,
        `/paLine4`,
        `/flowKnockoutForm8995WithoutTy2026Template`,
        `/flowIsKnockedOut`,
      ];
      const g = build(singleFilerData, schC);
      expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
      expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
      expect(val(g, `/paLine4`)).toBe(`8000.00`);
      // PA-40 IN (2025) p. 17: must use PA Schedule C; this slice has no PA Schedule C PDF.
      expect(get(g, `/flowKnockoutPaScheduleC`).get).toBe(true);
      expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
      expect(get(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  });
  describe(`1099-INT box 2 early withdrawal penalty (PA-40 IN (2025) p. 15, LINE 2, Forfeited Interest Penalty)`, () => {
    // "You may offset the penalty for premature redemption or withdrawal of a time savings account or certificate of
    // deposit, only against the interest income you received in the same taxable year from that account or
    // certificate. You cannot offset this penalty against other interest income. If your total penalty exceeds the
    // related interest income, you may report the excess as a loss on PA Schedule D." Account-level interest and PA
    // Schedule D are not modeled, so a PA-40 with a penalty is stopped.
    const penalty = (box2: number) => ({
      ...interest(1200),
      [`/interestReports/#${intId}/writableEarlyWithdrawlPenaltyAmount`]: createDollarWrapper(`${box2}`),
    });
    it(`PA filer, W-2 $40,000, box 1 $1,200, box 2 $150: PA knockout true and /flowIsKnockedOut true`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
      const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...penalty(150) });
      expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
      expect(val(g, `/earlyWithdrawalPenaltyTotal`)).toBe(`150.00`);
      blocks(g, `/flowKnockoutPaUnsupportedIncome`);
    });
    it(`non-PA (FL) filer, same income: PA knockout false and the return is not knocked out`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
      const g = build(singleFilerData, { ...w2(40000, 40000, 0), ...penalty(150), ...pa(`fl`) });
      expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
      expect(val(g, `/earlyWithdrawalPenaltyTotal`)).toBe(`150.00`);
      expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
      expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });
    it(`PA filer, box 2 $0: the penalty does not stop the return`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/flowIsKnockedOut`];
      const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...penalty(0) });
      expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });
  });
  it(`joint return with property sales (spouse losses can't offset, p. 7)`, () => {
    blocks(
      build(mfjFilerData, { ...w2(80000, 80000, 2456), ...sale(14000, 10000) }),
      `/flowKnockoutPaUnsupportedIncome`
    );
  });
});

/**
 * PA-40 line 4 from the supported federal Schedule C path. Tax Reform Code of 1971 §303(a)(2): "Net profits. The net
 * income from the operation of a business, profession, or other activity…" PA-40 IN (2025) p. 17, LINE 4. PA-40 C (EX)
 * 03-26: line 39; meals 100% by Pennsylvania. A PA/FL part-year resident with Schedule C stops (p. 43). No PA Schedule
 * C PDF in this slice.
 */
const schCBizId = `a59c03d1-af4a-447f-96aa-d19397048a77`;
const schCBase = (receipts: string, expenses = `0`) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadChurchEmployeeIncome': createBooleanWrapper(false),
  '/usesSeOptionalMethod': createBooleanWrapper(false),
  '/hasMinisterOrSeExemption': createBooleanWrapper(false),
  '/hasNotarySeExclusion': createBooleanWrapper(false),
  '/hadForm8919Wages': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([schCBizId]),
  [`/scheduleCBusinesses/#${schCBizId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${schCBizId}/businessName`]: createStringWrapper(`Synthetic Consulting`),
  [`/scheduleCBusinesses/#${schCBizId}/writableGrossReceipts`]: createDollarWrapper(receipts),
  [`/scheduleCBusinesses/#${schCBizId}/writableTotalExpenses`]: createDollarWrapper(expenses),
  [`/scheduleCBusinesses/#${schCBizId}/materiallyParticipates`]: createBooleanWrapper(true),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});
const schCMeals = (meals: string) => {
  const id = schCBizId;
  const stops = [
    `hasInventoryOrCogs`,
    `hasCarTruckOrVehicleLoan`,
    `hasDepreciationOrSection179`,
    `hasDepletion`,
    `hasVehicleMachineryEquipmentRent`,
    `hasHomeOffice`,
    `hasEnergyEfficientBuildingsDeduction`,
  ];
  return {
    ...Object.fromEntries(stops.map((k) => [`/scheduleCBusinesses/#${id}/${k}`, createBooleanWrapper(false)])),
    [`/scheduleCBusinesses/#${id}/writableReturnsAndAllowances`]: createDollarWrapper(`0`),
    [`/scheduleCBusinesses/#${id}/writableOtherIncome`]: createDollarWrapper(`0`),
    [`/scheduleCBusinesses/#${id}/hasDeductibleExpenses`]: createBooleanWrapper(true),
    [`/scheduleCBusinesses/#${id}/expenseLinesChosen`]: createMultEnumWrapper(
      [`meals`],
      `/scheduleCExpenseLineOptions`
    ),
    [`/scheduleCBusinesses/#${id}/writableMeals`]: createDollarWrapper(meals),
    [`/scheduleCBusinesses/#${id}/mealsAreStandardHalfLimit`]: createBooleanWrapper(true),
  };
};
/** 2026 draft Schedule C Part III hand worksheet: line 42 = 5,050; receipts 20,000 → line 31 = 14,950. */
const schCSimplePartIII = () => {
  const id = schCBizId;
  const stops = [
    `hasCarTruckOrVehicleLoan`,
    `hasDepreciationOrSection179`,
    `hasDepletion`,
    `hasVehicleMachineryEquipmentRent`,
    `hasHomeOffice`,
    `hasEnergyEfficientBuildingsDeduction`,
  ];
  return {
    ...Object.fromEntries(stops.map((k) => [`/scheduleCBusinesses/#${id}/${k}`, createBooleanWrapper(false)])),
    [`/scheduleCBusinesses/#${id}/hasInventoryOrCogs`]: createBooleanWrapper(true),
    [`/scheduleCBusinesses/#${id}/inventoryAccountingMethod`]: createEnumWrapper(
      `cost`,
      `/scheduleCInventoryMethodOptions`
    ),
    [`/scheduleCBusinesses/#${id}/inventoryValuationChanged`]: createBooleanWrapper(false),
    [`/scheduleCBusinesses/#${id}/isTaxShelter`]: createBooleanWrapper(false),
    [`/scheduleCBusinesses/#${id}/openingInventoryDiffersFromPriorClosing`]: createBooleanWrapper(false),
    [`/scheduleCBusinesses/#${id}/writablePriorThreeYearAverageGrossReceipts`]: createDollarWrapper(`0`),
    [`/scheduleCBusinesses/#${id}/writableReturnsAndAllowances`]: createDollarWrapper(`0`),
    [`/scheduleCBusinesses/#${id}/writableOtherIncome`]: createDollarWrapper(`0`),
    [`/scheduleCBusinesses/#${id}/hasDeductibleExpenses`]: createBooleanWrapper(false),
    [`/scheduleCBusinesses/#${id}/writableInventoryAtBeginning`]: createDollarWrapper(`1000`),
    [`/scheduleCBusinesses/#${id}/writablePurchases`]: createDollarWrapper(`5000`),
    [`/scheduleCBusinesses/#${id}/writablePersonalUseWithdrawals`]: createDollarWrapper(`200`),
    [`/scheduleCBusinesses/#${id}/writableInventoryLabor`]: createDollarWrapper(`300`),
    [`/scheduleCBusinesses/#${id}/writableInventoryMaterials`]: createDollarWrapper(`400`),
    [`/scheduleCBusinesses/#${id}/writableInventoryOtherCosts`]: createDollarWrapper(`50`),
    [`/scheduleCBusinesses/#${id}/writableInventoryAtEnd`]: createDollarWrapper(`1500`),
  };
};

describe(`PA-40 line 4 net profits from Schedule C`, () => {
  it(`full-year resident: receipts 20000, no expenses → line 4 = 20000; tax × 0.0307`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine4`, `/paLine9`, `/paLine12`, `/scheduleCNetProfitOrLoss`];
    // Golden end-to-end scenario (synthetic data): W-2 box 16 $50,000; Schedule C receipts $20,000, expenses $0.
    // Line 4 = 20,000. Line 9 = 70,000. 70,000 × 0.0307 = 2,149.00.
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...schCBase(`20000`) });
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`20000.00`);
    expect(val(g, `/paLine4`)).toBe(`20000.00`);
    expect(val(g, `/paLine1a`)).toBe(`50000.00`);
    expect(val(g, `/paLine9`)).toBe(`70000.00`);
    expect(val(g, `/paLine12`)).toBe(`2149.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    // PA Schedule C is required and not produced (IN p. 17), so the state-return knockout is true.
    expect(get(g, `/flowKnockoutPaScheduleC`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
  });

  it(`meals 400 at 50% federal → PA line 4 adds back 200`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine4`, `/scheduleCBusinesses/*/paMealsAddBack`, `/scheduleCNetProfitOrLoss`];
    // Receipts $20,000; meals $400; federal line 24b = $200; line 31 = 19,800. PA add-back $200 → line 4 = 20,000.
    // Line-item path: omit writableTotalExpenses so usesLegacyExpenseBucket is false.
    const { [`/scheduleCBusinesses/#${schCBizId}/writableTotalExpenses`]: _legacy, ...schCNoBucket } =
      schCBase(`20000`);
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      ...schCNoBucket,
      ...schCMeals(`400`),
    });
    expect(val(g, `/scheduleCBusinesses/#${schCBizId}/line24bDeductibleMeals`)).toBe(`200.00`);
    expect(val(g, `/scheduleCBusinesses/#${schCBizId}/paMealsAddBack`)).toBe(`200.00`);
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`19800.00`);
    expect(val(g, `/paLine4`)).toBe(`20000.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`PA/FL part-year resident with Schedule C: stop, no allocation`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/paLine4`, `/flowIsKnockedOut`];
    // PA-40 IN (2025) p. 43: part-year/nonresident business income is not allocated here.
    const g = build(singleFilerData, {
      ...w2(30000, 30000, 921),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
      [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
      '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
      ...schCBase(`20000`),
    });
    expect(get(g, `/stateReturnIsPa`).get).toBe(false);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`20000.00`);
    expect(get(g, `/paLine4`).complete).toBe(false);
    expect(get(g, `/paLine9`).complete).toBe(false);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaUnsupportedIncome`);
  });

  it(`tax-shelter screener yes: unsupported-income stop (PA-40 C Form 8271)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/paHasScheduleCTaxShelter`, `/flowIsKnockedOut`];
    // Golden end-to-end scenario (synthetic data): same supported Schedule C path, but the PA Form 8271 / tax-shelter
    // screener is yes. PA-40 C (EX) 03-26: "Do not report or deduct any transactions related to tax shelters."
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      ...schCBase(`20000`),
      '/paHasScheduleCTaxShelter': createBooleanWrapper(true),
    });
    expect(val(g, `/paLine4`)).toBe(`20000.00`);
    expect(get(g, `/paAskScheduleCTaxShelter`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaUnsupportedIncome`);
  });

  it(`unanswered tax-shelter screener on a PA Schedule C stays incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/paAskScheduleCTaxShelter`,
      `/paHasScheduleCTaxShelter`,
      `/flowKnockoutPaUnsupportedIncome`,
    ];
    // PA-40 C (EX) 03-26 Form 8271: asked when a PA-40 has Schedule C. Blank is not a no.
    const g = setupFactGraph({
      ...noW2,
      ...baseFilerData,
      ...singleFilerData,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
      '/soldCapitalAssets': createBooleanWrapper(false),
      '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
      '/paHasUnsupportedItems': createBooleanWrapper(false),
      ...pa(),
      ...w2(50000, 50000, 1535),
      ...schCBase(`20000`),
    }).factGraph;
    expect(get(g, `/paAskScheduleCTaxShelter`).get).toBe(true);
    expect(get(g, `/paHasScheduleCTaxShelter`).complete).toBe(false);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).complete).toBe(false);
  });

  it(`full-year simple Part III COGS: line 4 = 14950`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/paLine4`,
      `/scheduleCBusinesses/*/line42CostOfGoodsSold`,
      `/scheduleCNetProfitOrLoss`,
    ];
    // 1,000 + (5,000 − 200) + 300 + 400 + 50 = 6,550; 6,550 − 1,500 = 5,050 COGS.
    // Receipts $20,000 − 5,050 = line 31 and PA-40 line 4 $14,950. Line-item path omits the single expense total.
    const { [`/scheduleCBusinesses/#${schCBizId}/writableTotalExpenses`]: _legacy, ...schCNoBucket } =
      schCBase(`20000`);
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      ...schCNoBucket,
      ...schCSimplePartIII(),
    });
    expect(val(g, `/scheduleCBusinesses/#${schCBizId}/line42CostOfGoodsSold`)).toBe(`5050.00`);
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`14950.00`);
    expect(val(g, `/paLine4`)).toBe(`14950.00`);
    expect(get(g, `/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
  });

  it(`MFJ Schedule C loss still stops; spouses are not netted`, ({ task }) => {
    task.meta.testedFactPaths = [`/paHasMfjScheduleCLoss`, `/flowKnockoutPaUnsupportedIncome`, `/flowIsKnockedOut`];
    // PA-40 IN (2025) p. 7: "You may not offset the income of the taxpayer with a loss from the spouse and vice versa."
    // Primary profit $10,000 and spouse loss $3,000 would be $7,000 on one combined line 4. The joint loss still stops.
    const spouseBiz = `b59c03d1-af4a-447f-96aa-d19397048a88`;
    const g = build(mfjFilerData, {
      ...w2(80000, 80000, 2456),
      ...schCBase(`10000`),
      '/scheduleCBusinesses': createCollectionWrapper([schCBizId, spouseBiz]),
      [`/scheduleCBusinesses/#${spouseBiz}/filer`]: createCollectionItemWrapper(spouseId),
      [`/scheduleCBusinesses/#${spouseBiz}/businessName`]: createStringWrapper(`Spouse Shop`),
      [`/scheduleCBusinesses/#${spouseBiz}/writableGrossReceipts`]: createDollarWrapper(`1000`),
      [`/scheduleCBusinesses/#${spouseBiz}/writableTotalExpenses`]: createDollarWrapper(`4000`),
      [`/scheduleCBusinesses/#${spouseBiz}/materiallyParticipates`]: createBooleanWrapper(true),
    });
    expect(val(g, `/scheduleCPrimaryFilerNetProfitOrLoss`)).toBe(`10000.00`);
    expect(val(g, `/scheduleCSecondaryFilerNetProfitOrLoss`)).toBe(`-3000.00`);
    expect(val(g, `/scheduleCNetProfitOrLoss`)).toBe(`7000.00`);
    expect(get(g, `/paHasMfjScheduleCLoss`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`W-2 only, no Schedule C: line 4 is $0; PA Schedule C knockout false`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine4`, `/paLine9`, `/flowKnockoutPaScheduleC`];
    const g = build(singleFilerData, w2(40000, 40000, 1228));
    expect(val(g, `/paLine4`)).toBe(`0.00`);
    expect(val(g, `/paLine9`)).toBe(`40000.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaScheduleC`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  });
});

/**
 * PA-40 line 6 from federal Schedule E Part I. Tax Reform Code of 1971 §303(a)(4): "Net gains or income derived
 * from or in the form of rents, royalties, patents and copyrights." PA-40 IN (2025) p. 18, LINE 6: "You may use
 * federal Schedule E, if using only Part I, and with the following adjustments". A K-1 or a PA/FL part-year resident
 * stops (p. 18 partner/S corporation share; p. 43 nonresident PA-source rents). No part-year allocation.
 */
const partI = (rents: string, royalties: string, expenses: string, k1 = false) => ({
  '/hadScheduleEIncome': createBooleanWrapper(true),
  '/scheduleEHasPartIIIncome': createBooleanWrapper(k1),
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEProvidesSubstantialServices': createBooleanWrapper(false),
  '/scheduleEHasPersonalUse': createBooleanWrapper(false),
  '/scheduleEHasDepreciation': createBooleanWrapper(false),
  '/scheduleEAnyPropertyLoss': createBooleanWrapper(false),
  '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(false),
  '/scheduleEWritableRents': createDollarWrapper(rents),
  '/scheduleEWritableRoyalties': createDollarWrapper(royalties),
  '/scheduleEWritableExpenses': createDollarWrapper(expenses),
});
const k1Id = `b7e1c2a0-1111-4222-8333-444455556666`;
/** Supported Part II K-1: domestic partnership, nonnegative box 1 only, material participation. */
const supportedK1 = {
  '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
  '/scheduleEPartIILine27': createBooleanWrapper(false),
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEK1sIsDone': createBooleanWrapper(true),
  '/scheduleEK1s': createCollectionWrapper([k1Id]),
  [`/scheduleEK1s/#${k1Id}/entityName`]: createStringWrapper(`Northwind Partners`),
  [`/scheduleEK1s/#${k1Id}/entityType`]: createEnumWrapper(`P`, `/scheduleEK1EntityTypeOptions`),
  [`/scheduleEK1s/#${k1Id}/isForeignPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/isPubliclyTradedPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/isTradingBusiness`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/box1`]: createDollarWrapper(`12000`),
  [`/scheduleEK1s/#${k1Id}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEK1s/#${k1Id}/box14CodeA`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${k1Id}/box14CodeAWasReduced`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/box14CodeAIsFarm`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/hasQbiStatement`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/basisComputationRequired`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${k1Id}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
};

describe(`PA-40 line 6 rents from Schedule E Part I`, () => {
  it(`full-year resident: line 6 equals federal Part I net rents`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine6`, `/paLine9`, `/paLine12`, `/scheduleENetIncome`];
    // $12,000 rents − $4,000 expenses = $8,000. W-2 box 16 $50,000. Line 9 = 58,000. 58,000 × 0.0307 = 1,780.60.
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...partI(`12000`, `0`, `4000`) });
    expect(val(g, `/scheduleENetIncome`)).toBe(`8000.00`);
    expect(val(g, `/paLine6`)).toBe(`8000.00`);
    expect(val(g, `/paLine1a`)).toBe(`50000.00`);
    expect(val(g, `/paLine9`)).toBe(`58000.00`);
    expect(val(g, `/paLine12`)).toBe(`1780.60`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`line 6 matches the federal Schedule E net after it is rounded to the dollar`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine6`, `/scheduleENetIncome`];
    // $10,000.10 rents − $2,500.40 expenses = $7,499.70. Schedule E line 26 rounds that to $7,500.
    // Line 6 is that same dollar, not a second rounding.
    const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...partI(`10000.10`, `0`, `2500.40`) });
    expect(val(g, `/scheduleENetIncome`)).toBe(`7500.00`);
    expect(val(g, `/paLine6`)).toBe(`7500.00`);
    expect(val(g, `/paLine9`)).toBe(`47500.00`);
  });

  it(`Part I royalties already collected are in the same line 6 net`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine6`, `/scheduleENetIncome`];
    // $12,000 rents + $500 royalties − $4,000 expenses = $8,500. PA-40 IN (2025) p. 18 allows federal Schedule E
    // Part I. Royalties from another form are still /flowKnockoutPaUnsupportedIncome (1099-MISC).
    const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...partI(`12000`, `500`, `4000`) });
    expect(val(g, `/scheduleENetIncome`)).toBe(`8500.00`);
    expect(val(g, `/paLine6`)).toBe(`8500.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
  });

  it(`Schedule K-1 present: stop, and line 6 is not the Part I net`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaUnsupportedIncome`,
      `/paLine6`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // The federal Part II path is supported, so the stop is the PA classification, not the federal K-1 knockout.
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 1535),
      ...partI(`12000`, `0`, `4000`, true),
      ...supportedK1,
    });
    expect(val(g, `/scheduleENetIncome`)).toBe(`8000.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/paLine6`).complete).toBe(false);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaUnsupportedIncome`);
  });

  it(`PA/FL part-year resident with Part I rents: stop, no allocation`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`, `/paLine6`, `/flowIsKnockedOut`];
    // PA-40 IN (2025) p. 43 taxes a nonresident on Pennsylvania rental property. Location is not collected.
    const g = build(singleFilerData, {
      ...w2(30000, 30000, 921),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
      [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
      '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
      ...partI(`12000`, `0`, `4000`),
    });
    expect(get(g, `/stateReturnIsPa`).get).toBe(false);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(val(g, `/scheduleENetIncome`)).toBe(`8000.00`);
    expect(get(g, `/paLine6`).complete).toBe(false);
    expect(get(g, `/paLine9`).complete).toBe(false);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`part-year resident without Schedule E: line 6 stays $0 and does not stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine6`, `/paLine1a`, `/flowKnockoutPaUnsupportedIncome`];
    const g = build(singleFilerData, {
      ...w2(30000, 30000, 921),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
      [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
      '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
    });
    expect(val(g, `/paLine1a`)).toBe(`30000.00`);
    expect(val(g, `/paLine6`)).toBe(`0.00`);
    expect(val(g, `/paLine9`)).toBe(`30000.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`W-2 and interest, no Schedule E: line 6 is $0 and line 2 is unchanged`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine1a`, `/paLine2`, `/paLine6`, `/paLine9`];
    // box 16 $40,000; 1099-INT box 1 $1,200. No box 3, so PA Schedule A is not required.
    const g = build(singleFilerData, { ...w2(40000, 40000, 1228), ...interest(1200) });
    expect(val(g, `/paLine1a`)).toBe(`40000.00`);
    expect(val(g, `/paLine2`)).toBe(`1200.00`);
    expect(val(g, `/paLine6`)).toBe(`0.00`);
    expect(val(g, `/paLine9`)).toBe(`41200.00`);
    expect(val(g, `/paLine12`)).toBe(`1264.84`); // 41,200 × 0.0307
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaScheduleA`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
});

/**
 * #79 Schedule SP (PA-40 line 21). PA-40 IN (2025) pp. 36-39; p. 39 Eligibility Income Tables:
 * Table 1 (unmarried) YOU "$6,500" … 10% at $8,750, Table 2 (married) "$13,000" … 10% at $15,250,
 * +$9,500 per dependent child, 10% steps every $250. Line 16 = line 14 × line 15 → PA-40 line 21.
 */
const kidIds = [
  `c1111111-1111-4111-8111-111111111111`,
  `c2222222-2222-4222-8222-222222222222`,
  `c3333333-3333-4333-8333-333333333333`,
];
const kids = (n: number, nonChild = false) => {
  const ids = kidIds.slice(0, n);
  return Object.assign(
    { '/familyAndHousehold': createCollectionWrapper(ids) },
    ...ids.map((id, i) => (nonChild && i === 0 ? makeQualifyingPersonNonChild(id) : makeChildData(id)))
  );
};
const sp = (status: Record<string, unknown>, income: number, extra: Record<string, unknown> = {}) =>
  build(status, { ...w2(income, income, 0), '/paHasSpNontaxableIncome': createBooleanWrapper(false), ...extra });

describe(`PA Schedule SP Tax Forgiveness (#79)`, () => {
  const rows: [string, Record<string, unknown>, number, Record<string, unknown>, string, string][] = [
    // label, status, income, extra, expected line 15, expected base
    [`single $6,500 → 100%`, singleFilerData, 6500, {}, `1/1`, `6500.00`],
    [`single $6,501 → 90%`, singleFilerData, 6501, {}, `9/10`, `6500.00`],
    [`single $6,750 → 90%`, singleFilerData, 6750, {}, `9/10`, `6500.00`],
    [`single $6,751 → 80%`, singleFilerData, 6751, {}, `8/10`, `6500.00`],
    [`single $7,750 → 50%`, singleFilerData, 7750, {}, `5/10`, `6500.00`],
    [`single $8,750 → 10%`, singleFilerData, 8750, {}, `1/10`, `6500.00`],
    [`single $8,751 → 0%`, singleFilerData, 8751, {}, `0/1`, `6500.00`],
    [`single + 1 child $16,000 → 100%`, singleFilerData, 16000, kids(1), `1/1`, `16000.00`],
    [`single + 1 child $18,250 → 10%`, singleFilerData, 18250, kids(1), `1/10`, `16000.00`],
    [`single + 1 child $18,251 → 0%`, singleFilerData, 18251, kids(1), `0/1`, `16000.00`],
    [`single + 3 children $35,000 → 100%`, singleFilerData, 35000, kids(3), `1/1`, `35000.00`],
    [`single + 3 children $36,000 → 60%`, singleFilerData, 36000, kids(3), `6/10`, `35000.00`],
    [`single + non-child dependent does not count`, singleFilerData, 6500, kids(1, true), `1/1`, `6500.00`],
    [`MFJ $13,000 → 100%`, mfjFilerData, 13000, {}, `1/1`, `13000.00`],
    [`MFJ $13,250 → 90%`, mfjFilerData, 13250, {}, `9/10`, `13000.00`],
    [`MFJ $15,250 → 10%`, mfjFilerData, 15250, {}, `1/10`, `13000.00`],
    [`MFJ $15,251 → 0%`, mfjFilerData, 15251, {}, `0/1`, `13000.00`],
    [`MFJ + 2 children $32,000 → 100%`, mfjFilerData, 32000, kids(2), `1/1`, `32000.00`],
    [`MFJ + 2 children $34,250 → 10%`, mfjFilerData, 34250, kids(2), `1/10`, `32000.00`],
    [`MFJ + 2 children $34,251 → 0%`, mfjFilerData, 34251, kids(2), `0/1`, `32000.00`],
  ];
  for (const [label, status, income, extra, pct, base] of rows) {
    it(label, ({ task }) => {
      task.meta.testedFactPaths = [`/paSpLine11`, `/paSpTableBase`, `/paSpLine15`, `/paSpLine16`, `/paLine21`];
      const g = sp(status, income, extra);
      expect(val(g, `/paSpLine11`)).toBe(`${income}.00`);
      expect(val(g, `/paSpTableBase`)).toBe(base);
      expect(val(g, `/paSpLine15`)).toBe(pct);
      expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });
  }
  it(`credit = line 12 × line 15 flows to line 21, 24 and the refund`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpLine14`, `/paLine21`, `/paLine24`, `/paLine29`];
    // $7,750 single: line 12 = 237.925 → 237.93 (cents); 50% credit; withheld 200
    const g = build(singleFilerData, {
      ...w2(7750, 7750, 200),
      '/paHasSpNontaxableIncome': createBooleanWrapper(false),
    });
    expect(val(g, `/paLine12`)).toBe(val(g, `/paSpLine14`));
    expect(val(g, `/paSpLine15`)).toBe(`5/10`);
    expect(Number(val(g, `/paLine21`))).toBeCloseTo(Number(val(g, `/paLine12`)) * 0.5, 2);
    expect(Number(val(g, `/paLine24`))).toBeCloseTo(200 + Number(val(g, `/paLine21`)), 2);
    expect(Number(val(g, `/paLine29`))).toBeCloseTo(Number(val(g, `/paLine24`)) - Number(val(g, `/paLine12`)), 2);
  });
  it(`100% forgiveness refunds all PA withholding`, () => {
    const g = build(singleFilerData, {
      ...w2(6000, 6000, 184),
      '/paHasSpNontaxableIncome': createBooleanWrapper(false),
    });
    expect(val(g, `/paLine12`)).toBe(`184.20`);
    expect(val(g, `/paLine21`)).toBe(`184.20`);
    expect(val(g, `/paLine29`)).toBe(`184.00`); // 184 withheld + 184.20 credit − 184.20 tax
    expect(val(g, `/stateRefund`)).toBe(`184.00`);
  });
  it(`eligibility income adds U.S. obligation interest (line 2), not just PA line 9`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpLine1`, `/paSpLine2`];
    const g = sp(singleFilerData, 6000, interest(0, 600));
    expect(val(g, `/paLine11`)).toBe(`6000.00`);
    expect(val(g, `/paSpLine2`)).toBe(`600.00`);
    expect(val(g, `/paSpLine11`)).toBe(`6600.00`);
    expect(val(g, `/paSpLine15`)).toBe(`9/10`);
  });
});

describe(`PA Schedule SP knockouts (#79)`, () => {
  const blocks = (g: Fg) => {
    expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaSpUnsupported`);
  };
  it(`nontaxable Section III income while possibly eligible`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpCouldQualify`, `/flowKnockoutPaSpUnsupported`];
    blocks(sp(singleFilerData, 7000, { '/paHasSpNontaxableIncome': createBooleanWrapper(true) }));
  });
  describe(`PA-only knockout (gated on /stateReturnPaFiled)`, () => {
    // Synthetic married-filing-separately return, $7,000 W-2 wages: within the Schedule SP 10% column.
    const mfs = {
      ...mfjFilerData,
      '/filingStatus': createEnumWrapper(`marriedFilingSeparately`, `/filingStatusOptions`),
    };
    it(`non-PA (FL) filer: SP knockout false and it does not knock out the return`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutPaSpUnsupported`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
      const g = sp(mfs, 7000, pa(`fl`));
      expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
      expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(false);
      expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });
    it(`PA filer, same inputs: SP knockout true and /flowIsKnockedOut true`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutPaSpUnsupported`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
      const g = sp(mfs, 7000);
      expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
      blocks(g);
    });
  });
  it(`nontaxable income does not matter once eligibility income is past the 10% column`, () => {
    const g = sp(singleFilerData, 8751, { '/paHasSpNontaxableIncome': createBooleanWrapper(true) });
    expect(get(g, `/paSpCouldQualify`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(false);
  });
  it(`married filing separately while possibly eligible`, () => {
    blocks(
      sp(
        { ...mfjFilerData, '/filingStatus': createEnumWrapper(`marriedFilingSeparately`, `/filingStatusOptions`) },
        7000
      )
    );
  });
  it(`filer claimed as a dependent while possibly eligible`, () => {
    blocks(
      sp(singleFilerData, 5000, {
        [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
        [`/filers/#${primaryFilerId}/willBeClaimed`]: createBooleanWrapper(true),
        [`/filers/#${primaryFilerId}/potentialClaimerMustFile`]: createBooleanWrapper(true),
      })
    );
  });
});

/**
 * #123 PA schedules this tool doesn't produce. PA-40 IN (2025):
 * p. 31, PA SCHEDULE A: "If there are any amounts (taxpayer, spouse and/or joint) for any of the Lines 2 through 15
 * (not including subtotal Lines 4 and 10) of PA Schedule A, you must complete and submit PA Schedule A with your
 * PA-40." p. 32, PA SCHEDULE B: "If there are any amounts (taxpayer, spouse, and/or joint) for any of the Lines 2
 * through 10 (not including subtotal Line 6) of PA Schedule B, you must complete and submit PA Schedule B with your
 * PA-40." p. 17, LINE 5: "Report your total net gains (losses) on PA Schedule D."; PA Schedule D (2025) instructions:
 * "PA-40 Schedule D must be completed even if the only transaction is to report a loss."
 */
describe(`PA Schedules A, B and D knockouts (#123)`, () => {
  const blocks = (g: Fg, k: string) => {
    expect(get(g, k).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(k);
  };
  const clear = (g: Fg) => {
    [`/flowKnockoutPaScheduleA`, `/flowKnockoutPaScheduleB`, `/flowKnockoutPaScheduleD`].forEach((k) =>
      expect(get(g, k).get).toBe(false)
    );
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  };
  it(`Schedule A: 1099-INT box 3 U.S. obligation interest is a Schedule A line 7 amount`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleA`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
    blocks(build(singleFilerData, { ...w2(40000, 40000, 1228), ...interest(100, 50) }), `/flowKnockoutPaScheduleA`);
  });
  it(`Schedule A: ordinary interest equal to federal needs no schedule, including over $2,500`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleA`, `/paLine2`];
    const over = build(singleFilerData, { ...w2(40000, 40000, 1228), ...interest(2501) });
    expect(val(over, `/paLine2`)).toBe(`2501.00`);
    clear(over);
    const at = build(singleFilerData, { ...w2(40000, 40000, 1228), ...interest(2500) });
    expect(val(at, `/paLine2`)).toBe(`2500.00`);
    clear(at);
  });
  it(`Schedule B: wages only, no Form 1099-DIV, so no Schedule B line has an amount (#154 cases: dividends.test.ts)`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleB`, `/paLine3`];
    const g = build(singleFilerData, w2(40000, 40000, 1228));
    expect(val(g, `/paLine3`)).toBe(`0.00`);
    expect(get(g, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaScheduleB`);
  });
  it(`Schedule D: a net gain`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleD`, `/flowKnockoutStateReturn`, `/flowIsKnockedOut`];
    blocks(build(singleFilerData, { ...w2(50000, 50000, 1535), ...sale(14000, 10000) }), `/flowKnockoutPaScheduleD`);
  });
  it(`Schedule D: a net loss (Schedule D is required even for a loss)`, () => {
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...sale(4000, 10000) });
    expect(val(g, `/paLine5`)).toBe(`-6000.00`);
    blocks(g, `/flowKnockoutPaScheduleD`);
  });
  it(`Schedule D: a sale at exactly $0 gain is still a transaction`, () => {
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...sale(10000, 10000) });
    expect(val(g, `/paLine5`)).toBe(`0.00`);
    blocks(g, `/flowKnockoutPaScheduleD`);
  });
  it(`wages only: none of the three`, () => {
    clear(build(singleFilerData, w2(50000, 50000, 1535)));
  });
  it(`non-PA (FL) filer with box 3 interest, $3,000 interest and a sale: no PA schedule knockouts`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaScheduleA`,
      `/flowKnockoutPaScheduleB`,
      `/flowKnockoutPaScheduleD`,
      `/flowKnockoutStateReturn`,
    ];
    const g = build(singleFilerData, {
      ...w2(50000, 50000, 0),
      ...interest(3000, 400),
      ...sale(4000, 10000),
      ...pa(`fl`),
    });
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    clear(g);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
});

describe(`PA-40 school district code (#123, PA-40 IN (2025) pp. 5-6, 46-47)`, () => {
  const code = (c: string) => ({ '/paSchoolDistrictCode': createStringWrapper(c) });
  it(`full-year resident is asked; the entered code prints`, ({ task }) => {
    task.meta.testedFactPaths = [`/paAskSchoolDistrictCode`, `/paSchoolCode`, `/paSchoolDistrictCode`];
    const g = build(singleFilerData, { ...w2(50000, 50000, 1535), ...code(`22275`) });
    expect(get(g, `/paAskSchoolDistrictCode`).get).toBe(true);
    expect(val(g, `/paSchoolCode`)).toBe(`22275`);
  });
  it(`not answered yet: the code is incomplete`, () => {
    const g = build(singleFilerData, w2(50000, 50000, 1535));
    expect(get(g, `/paSchoolCode`).complete).toBe(false);
  });
  it(`accepts codes from the booklet list and rejects anything else`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSchoolDistrictCode`];
    // Limits are checked when the graph is saved, as the interview does.
    const valid = (c: string) => {
      const g = build(singleFilerData, w2(50000, 50000, 1535));
      g.set(`/paSchoolDistrictCode` as ConcretePath, c);
      // eslint-disable-next-line df-rules/no-factgraph-save
      return g.save().valid;
    };
    // Bermudian Springs (first on p. 46), Harrisburg City, York Suburban (last on p. 47)
    [`01110`, `22275`, `67940`].forEach((c) => expect(valid(c), c).toBe(true));
    // 99999 is filled in for movers out, not entered; 12345 and 22276 are not districts; wrong lengths and letters
    [`99999`, `12345`, `22276`, `2227`, `222750`, `2227A`, ` 22275`].forEach((c) => expect(valid(c), c).toBe(false));
  });
  it(`non-PA filer is not asked`, () => {
    const g = build(singleFilerData, { ...w2(50000, 50000, 0), ...pa(`nj`) });
    expect(get(g, `/paAskSchoolDistrictCode`).get).toBe(false);
  });
});
