// #83 Form 8960 Net Investment Income Tax, individuals (TY2026 draft layout).
// 26 U.S.C. 1411(a)(1): 3.8% of the lesser of NII or MAGI over the threshold; 1411(b) thresholds $250,000 MFJ/QSS,
// $125,000 MFS, $200,000 otherwise (statutory, not indexed). https://www.law.cornell.edu/uscode/text/26/1411
// f8960 / i8960 (2026 drafts); Schedule 2 (Form 1040) 2026 draft line 6 "Net investment income tax. Attach Form 8960".
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
  mfsFilerData,
  primaryFilerId,
  singleFilerData,
} from '../testData.js';

const intId = `83a00000-0000-4000-8000-000000000001`;
const txId = `83a00000-0000-4000-8000-000000000002`;
const bizId = `83a00000-0000-4000-8000-000000000003`;

const interest = (amount: number) =>
  amount === 0
    ? { '/interestReports': createCollectionWrapper([]) }
    : {
        ...makeInterestReportData(0, intId, primaryFilerId),
        [`/interestReports/#${intId}/has1099`]: createBooleanWrapper(true),
        [`/interestReports/#${intId}/writable1099Amount`]: createDollarWrapper(`${amount}`),
      };

// Long-term sale reported on Form 8949 box D; gain (or loss) = proceeds - basis.
const sale = (gain: number) => ({
  '/soldCapitalAssets': createBooleanWrapper(true),
  '/form8949Transactions': createCollectionWrapper([txId]),
  [`/form8949Transactions/#${txId}/description`]: createStringWrapper(`100 sh XYZ`),
  [`/form8949Transactions/#${txId}/dateAcquired`]: createDayWrapper(`2020-06-01`),
  [`/form8949Transactions/#${txId}/dateSold`]: createDayWrapper(`2026-07-01`),
  [`/form8949Transactions/#${txId}/proceeds`]: createDollarWrapper(`${50000 + gain}`),
  [`/form8949Transactions/#${txId}/costBasis`]: createDollarWrapper(`50000`),
  [`/form8949Transactions/#${txId}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${txId}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${txId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});

const minimal = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const graph = (status: Record<string, unknown>, wages: number, int: number, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...minimal,
    ...baseFilerData,
    ...status,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/flowHasSeenDeductions': createBooleanWrapper(true),
    ...makeW2Data(wages),
    ...interest(int),
    ...extra,
  }).factGraph;
type Fg = ReturnType<typeof graph>;
const val = (fg: Fg, p: string) => fg.get(p as ConcretePath).get;
const dollars = (fg: Fg, p: string) => val(fg, p).toString();
const status = (s: string) => ({ ...singleFilerData, [`/filingStatus`]: createEnumWrapper(s, `/filingStatusOptions`) });

describe(`Form 8960 NIIT (#83): lesser-of rule, 1411(a)(1)`, () => {
  it(`single, $180,000 wages + $40,000 interest: MAGI excess $20,000 < NII $40,000, tax 3.8% x $20,000 = $760`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/form8960Line1`,
      `/form8960Line8`,
      `/form8960Line12`,
      `/form8960Line13`,
      `/form8960Line14`,
      `/form8960Line15`,
      `/form8960Line16`,
      `/form8960Line17`,
      `/schedule2Line6NetInvestmentIncomeTax`,
      `/requiresSchedule2`,
      `/requiresForm8960`,
      `/line21OfSchedule2`,
      `/totalTax`,
      `/flowKnockoutForm8960Unsupported`,
    ];
    const fg = graph(singleFilerData, 180000, 40000);
    expect(dollars(fg, `/form8960Line1`)).toBe(`40000.00`);
    expect(dollars(fg, `/form8960Line8`)).toBe(`40000.00`);
    expect(dollars(fg, `/form8960Line12`)).toBe(`40000.00`);
    expect(dollars(fg, `/form8960Line13`)).toBe(`220000.00`);
    expect(dollars(fg, `/form8960Line14`)).toBe(`200000.00`);
    expect(dollars(fg, `/form8960Line15`)).toBe(`20000.00`);
    expect(dollars(fg, `/form8960Line16`)).toBe(`20000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`760.00`);
    expect(dollars(fg, `/schedule2Line6NetInvestmentIncomeTax`)).toBe(`760.00`);
    expect(val(fg, `/requiresSchedule2`)).toBe(true);
    expect(val(fg, `/requiresForm8960`)).toBe(true);
    // Form 8959: $180,000 Medicare wages is under $200,000, so line 21 of Schedule 2 is the NIIT alone.
    expect(dollars(fg, `/line21OfSchedule2`)).toBe(`760.00`);
    expect(fg.get(`/totalTax` as ConcretePath).complete).toBe(true);
    const totalTax = Number(dollars(fg, `/totalTax`));
    const taxLessCredits = Number(dollars(fg, `/taxLessNonRefundableCredits`));
    expect(totalTax).toBe(taxLessCredits + 760);
    expect(val(fg, `/flowKnockoutForm8960Unsupported`)).toBe(false);
    expect(val(fg, `/hasInterestIncomeAndAgiAboveThresholdForSingleOrHoh`)).toBe(false);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`single, $190,000 wages + $15,000 interest: MAGI excess $5,000 is less than NII $15,000, tax $190`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line15`, `/form8960Line16`, `/form8960Line17`];
    const fg = graph(singleFilerData, 190000, 15000);
    expect(dollars(fg, `/form8960Line12`)).toBe(`15000.00`);
    expect(dollars(fg, `/form8960Line15`)).toBe(`5000.00`);
    expect(dollars(fg, `/form8960Line16`)).toBe(`5000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`190.00`);
  });

  it(`single, $260,000 wages + $10,000 interest: NII $10,000 is less than MAGI excess $70,000, tax $380`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form8960Line12`, `/form8960Line15`, `/form8960Line16`, `/form8960Line17`];
    const fg = graph(singleFilerData, 260000, 10000);
    expect(dollars(fg, `/form8960Line15`)).toBe(`70000.00`);
    expect(dollars(fg, `/form8960Line16`)).toBe(`10000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`380.00`);
  });

  it(`wages alone over the threshold: NII $0, no NIIT (Form 8959 covers wages)`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line12`, `/form8960Line17`, `/requiresForm8960`];
    const fg = graph(singleFilerData, 300000, 0);
    expect(dollars(fg, `/form8960Line12`)).toBe(`0.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`0.00`);
    // i8960 Who Must File: attach Form 8960 whenever MAGI is over the threshold.
    expect(val(fg, `/requiresForm8960`)).toBe(true);
  });
});

describe(`Form 8960 NIIT (#83): thresholds by filing status, 1411(b)`, () => {
  const cases: [string, Record<string, unknown>, string][] = [
    [`single`, status(`single`), `200000.00`],
    [`head of household`, status(`headOfHousehold`), `200000.00`],
    [`married filing jointly`, mfjFilerData, `250000.00`],
    [`qualifying surviving spouse`, status(`qualifiedSurvivingSpouse`), `250000.00`],
    [`married filing separately`, mfsFilerData, `125000.00`],
  ];
  cases.forEach(([name, s, threshold]) => {
    it(`${name}: line 14 = ${threshold}`, ({ task }) => {
      task.meta.testedFactPaths = [`/form8960Line14`];
      expect(dollars(graph(s, 100000, 1000), `/form8960Line14`)).toBe(threshold);
    });
  });

  it(`MFJ, $240,000 wages + $20,000 interest: excess over $250,000 is $10,000, tax $380 (single would be $760)`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form8960Line15`, `/form8960Line17`];
    const fg = graph(mfjFilerData, 240000, 20000);
    expect(dollars(fg, `/form8960Line15`)).toBe(`10000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`380.00`);
    expect(dollars(graph(singleFilerData, 240000, 20000), `/form8960Line17`)).toBe(`760.00`);
  });

  it(`MFS, $120,000 wages + $15,000 interest: excess over $125,000 is $10,000, tax $380`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line15`, `/form8960Line17`, `/hasInterestIncomeAndAgiAboveThresholdForMfs`];
    const fg = graph(mfsFilerData, 120000, 15000);
    expect(dollars(fg, `/form8960Line13`)).toBe(`135000.00`);
    expect(dollars(fg, `/form8960Line15`)).toBe(`10000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`380.00`);
    expect(val(fg, `/hasInterestIncomeAndAgiAboveThresholdForMfs`)).toBe(false);
  });
});

describe(`Form 8960 NIIT (#83): boundary at the threshold`, () => {
  it(`single, MAGI exactly $200,000: line 15 $0, no tax, Form 8960 not required, no stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line15`, `/form8960Line17`, `/requiresForm8960`, `/requiresSchedule2`];
    const fg = graph(singleFilerData, 190000, 10000);
    expect(dollars(fg, `/form8960Line13`)).toBe(`200000.00`);
    expect(dollars(fg, `/form8960Line15`)).toBe(`0.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`0.00`);
    expect(val(fg, `/requiresForm8960`)).toBe(false);
    expect(val(fg, `/requiresSchedule2`)).toBe(false);
  });

  it(`single, MAGI $200,013: line 16 $13, 3.8% = $0.49 rounds to $0; $200,014 -> $0.53 rounds to $1`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line16`, `/form8960Line17`, `/requiresForm8960`];
    const under = graph(singleFilerData, 190000, 10013);
    expect(dollars(under, `/form8960Line16`)).toBe(`13.00`);
    expect(dollars(under, `/form8960Line17`)).toBe(`0.00`);
    expect(val(under, `/requiresForm8960`)).toBe(true);
    const over = graph(singleFilerData, 190000, 10014);
    expect(dollars(over, `/form8960Line16`)).toBe(`14.00`);
    expect(dollars(over, `/form8960Line17`)).toBe(`1.00`);
  });

  it(`MFJ, MAGI exactly $250,000: no tax; $250,001 -> line 15 $1`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line15`, `/form8960Line17`];
    expect(dollars(graph(mfjFilerData, 240000, 10000), `/form8960Line15`)).toBe(`0.00`);
    expect(dollars(graph(mfjFilerData, 240000, 10001), `/form8960Line15`)).toBe(`1.00`);
  });
});

describe(`Form 8960 NIIT (#83): capital gains, line 5a`, () => {
  it(`single, $150,000 wages + $100,000 LT gain: NII $100,000, excess $50,000, tax $1,900; not stopped`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8960Line5a`,
      `/form8960Line8`,
      `/form8960Line17`,
      `/hasInterestIncomeAndAgiAboveThresholdForSingleOrHoh`,
    ];
    const fg = graph(singleFilerData, 150000, 0, sale(100000));
    expect(dollars(fg, `/form8960Line5a`)).toBe(`100000.00`);
    expect(dollars(fg, `/form8960Line8`)).toBe(`100000.00`);
    expect(dollars(fg, `/form8960Line13`)).toBe(`250000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`1900.00`);
    expect(val(fg, `/hasInterestIncomeAndAgiAboveThresholdForSingleOrHoh`)).toBe(false);
    expect(val(fg, `/flowKnockoutForm8960Unsupported`)).toBe(false);
  });

  it(`net capital loss is limited to $3,000 on line 7 and nets against interest on line 8`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line5a`, `/form8960Line8`, `/form8960Line12`, `/form8960Line17`];
    // $230,000 wages + $5,000 interest - $3,000 (IRC 1211(b)) = MAGI $232,000; NII $2,000; excess $32,000.
    const fg = graph(singleFilerData, 230000, 5000, sale(-10000));
    expect(dollars(fg, `/form8960Line5a`)).toBe(`-3000.00`);
    expect(dollars(fg, `/form8960Line8`)).toBe(`2000.00`);
    expect(dollars(fg, `/form8960Line12`)).toBe(`2000.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`76.00`);
  });

  it(`line 12 floors at $0 when the capital loss exceeds the other investment income`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line8`, `/form8960Line12`, `/form8960Line17`];
    const fg = graph(singleFilerData, 230000, 1000, sale(-10000));
    expect(dollars(fg, `/form8960Line8`)).toBe(`-2000.00`);
    expect(dollars(fg, `/form8960Line12`)).toBe(`0.00`);
    expect(dollars(fg, `/form8960Line17`)).toBe(`0.00`);
  });
});

describe(`Form 8960 NIIT (#83): stops instead of zeros (BlockSubmissionOnTrue, /flowIsKnockedOut)`, () => {
  const scheduleE = {
    '/hadScheduleEIncome': createBooleanWrapper(true),
    '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
    '/scheduleEProvidesSubstantialServices': createBooleanWrapper(false),
    '/scheduleEHasPersonalUse': createBooleanWrapper(false),
    '/scheduleEHasDepreciation': createBooleanWrapper(false),
    '/scheduleEAnyPropertyLoss': createBooleanWrapper(false),
    '/scheduleEWritableRents': createDollarWrapper(`12000`),
    '/scheduleEWritableRoyalties': createDollarWrapper(`0`),
    '/scheduleEWritableExpenses': createDollarWrapper(`4000`),
  };
  const scheduleC = {
    '/scheduleCBusinesses': createCollectionWrapper([bizId]),
    [`/scheduleCBusinesses/#${bizId}/businessName`]: createStringWrapper(`Consulting`),
    [`/scheduleCBusinesses/#${bizId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
    [`/scheduleCBusinesses/#${bizId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
    '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  };
  const itemizes = {
    '/scheduleAWantsToItemize': createBooleanWrapper(true),
    '/scheduleAWritableMedical': createDollarWrapper(`0`),
    '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`9000`),
    '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`0`),
    '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
    '/scheduleAWritableMortgageInterest': createDollarWrapper(`0`),
    '/scheduleAWritableCashGifts': createDollarWrapper(`0`),
    '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
  };

  const stops = (fg: Fg) => {
    expect(val(fg, `/flowKnockoutForm8960Unsupported`)).toBe(true);
    expect(val(fg, `/hasInterestIncomeAndAgiAboveThresholdForSingleOrHoh`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutForm8960Unsupported`);
  };

  it(`Schedule E rents over the threshold (passive/rental classification not modeled)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8960Unsupported`, `/flowIsKnockedOut`, `/form8960Line4a`];
    const fg = graph(singleFilerData, 210000, 0, scheduleE);
    expect(dollars(fg, `/form8960Line4a`)).toBe(`8000.00`);
    stops(fg);
  });

  it(`Schedule C business over the threshold (1411(c)(2) trade-or-business classification not modeled)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8960Unsupported`, `/flowIsKnockedOut`];
    stops(graph(singleFilerData, 210000, 1000, scheduleC));
  });

  it(`itemized deductions over the threshold (Part II allocations not modeled)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8960Unsupported`, `/flowIsKnockedOut`];
    stops(graph(singleFilerData, 210000, 1000, itemizes));
  });

  it(`Schedule E, Schedule C or itemizing at or under the threshold: tax is $0 whatever NII is, so no stop`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8960Unsupported`, `/form8960Line17`];
    [scheduleE, scheduleC, itemizes].forEach((extra) => {
      const fg = graph(singleFilerData, 150000, 1000, extra);
      expect(val(fg, `/flowKnockoutForm8960Unsupported`)).toBe(false);
      expect(dollars(fg, `/form8960Line17`)).toBe(`0.00`);
    });
  });
});

describe(`Form 8960 NIIT (#83): line 10 guard for Schedule 1 line 18 (early withdrawal penalty)`, () => {
  // i8960 (2026 draft) p. 13 (PDF p. 14): "The early withdrawal penalty reported on Schedule 1 (Form 1040), line 18,
  // is reported on Form 8960, line 10." Treas. Reg. 1.1411-4(f)(2)(iii) (section 62(a)(9) penalty is properly
  // allocable): https://www.law.cornell.edu/cfr/text/26/1.1411-4
  // The app doesn't populate Schedule 1 line 18: a 1099-INT box 2 penalty knocks out, so line 10 stays $0.
  // If this test starts failing because the penalty is now supported, wire Schedule 1 line 18 into Form 8960 line 10.
  it(`1099-INT box 2 penalty over the threshold: knocked out, never a $0 line 10`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8960Line11`, `/flowKnockoutHasEarlyWithdrawlPenalty`, `/flowIsKnockedOut`];
    const g = graph(status(`single`), 260000, 10000, {
      [`/interestReports/#${intId}/writableEarlyWithdrawlPenaltyAmount`]: createDollarWrapper(`150`),
    });
    expect(val(g, `/flowKnockoutHasEarlyWithdrawlPenalty`)).toBe(true);
    expect(val(g, `/flowIsKnockedOut`)).toBe(true);
    expect(dollars(g, `/form8960Line11`)).toBe(`0.00`);
  });
  it(`no penalty: not knocked out by the penalty stop`, () => {
    const g = graph(status(`single`), 260000, 10000);
    expect(val(g, `/flowKnockoutHasEarlyWithdrawlPenalty`)).toBe(false);
  });
});
