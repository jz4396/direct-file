import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData, primaryFilerId } from '../testData.js';

/**
 * Schedule SE lines this tool does not compute. 26 U.S.C. 1402(a), 1402(a)(1), 1402(a)(8), 1402(a)(12),
 * 1402(a)(14), 1402(b)(2), 1402(c)(1), 1402(c)(4), 1402(e), 1402(g), 1402(j), 1402(l), and 164(f)(1)
 * (https://www.law.cornell.edu/uscode/text/26/1402). Supported path: net profit floored at 0, times 92.35%,
 * OASDI 12.4% and Medicare 2.9%, half on Schedule 1 line 15.
 */
const KO = `/flowKnockoutScheduleSEOutOfScope`;
const NONFARM_KO = `/flowKnockoutScheduleSENonfarmOptionalMethod`;
const QUESTIONS = [
  `/hadFarmSelfEmploymentIncome`,
  `/hadChurchEmployeeIncome`,
  `/usesSeOptionalMethod`,
  `/hasMinisterOrSeExemption`,
  `/hasNotarySeExclusion`,
  `/hadForm8919Wages`,
] as const;

const biz = `5e000000-0000-4000-8000-000000000001`;
const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
};
const seNo = Object.fromEntries(QUESTIONS.map((path) => [path, createBooleanWrapper(false)]));
const scheduleC = (extra: Record<string, unknown> = {}) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  ...seNo,
  '/scheduleCBusinesses': createCollectionWrapper([biz]),
  [`/scheduleCBusinesses/#${biz}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${biz}/businessName`]: createStringWrapper(`Gig Work`),
  [`/scheduleCBusinesses/#${biz}/writableGrossReceipts`]: createDollarWrapper(`10000`),
  [`/scheduleCBusinesses/#${biz}/writableTotalExpenses`]: createDollarWrapper(`2000`),
  [`/scheduleCBusinesses/#${biz}/materiallyParticipates`]: createBooleanWrapper(true),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  ...extra,
});

const fg = (data: Record<string, unknown>) => setupFactGraph(data).factGraph;
const read = (g: ReturnType<typeof fg>, path: string) => g.get(path as ConcretePath);

describe(`Schedule SE out-of-scope lines`, () => {
  it(`self-employment income not asked, or answered no: the knockout is complete false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    for (const data of [
      filerWithW2NoDeductionsNoCreditsBaseData,
      { ...filerWithW2NoDeductionsNoCreditsBaseData, '/hadSelfEmploymentIncome': createBooleanWrapper(false) },
    ]) {
      const knockout = read(fg(data), KO);
      expect(knockout.complete).toBe(true);
      expect(knockout.get).toBe(false);
    }
  });

  it(`scenario A, every answer no: SE tax $1,130 and the section 164(f) half $565; the knockout is false`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      KO,
      `/scheduleCNetProfitOrLoss`,
      `/seNetEarningsFromSelfEmployment`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/scheduleCSectionIsComplete`,
    ];
    const g = fg({ ...noW2, ...scheduleC() });
    expect(read(g, `/scheduleCNetProfitOrLoss`).get.toString()).toBe(`8000.00`);
    // round(8,000 × 0.9235) = 7,388. 26 U.S.C. 1402(a)(12).
    expect(read(g, `/seNetEarningsFromSelfEmployment`).get.toString()).toBe(`7388.00`);
    // round(7,388 × 0.124) = 916; round(7,388 × 0.029) = 214; total 1,130. 26 U.S.C. 1401(a), 1401(b)(1).
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    // round(1,130 × 50%) = 565. 26 U.S.C. 164(f)(1).
    expect(read(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`565.00`);
    const knockout = read(g, KO);
    expect(knockout.complete).toBe(true);
    expect(knockout.get).toBe(false);
    const nonfarm = read(g, NONFARM_KO);
    expect(nonfarm.complete).toBe(true);
    expect(nonfarm.get).toBe(false);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`0.00`);
    expect(read(g, `/scheduleCSectionIsComplete`).get).toBe(true);
  });

  it(`any yes on a line this tool does not compute stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/flowIsKnockedOut`, `/scheduleCSectionIsComplete`];
    for (const path of QUESTIONS.filter((q) => q !== `/usesSeOptionalMethod`)) {
      const g = fg({ ...noW2, ...scheduleC({ [path]: createBooleanWrapper(true) }) });
      const knockout = read(g, KO);
      expect(knockout.complete, path).toBe(true);
      expect(knockout.get, path).toBe(true);
      expect(read(g, NONFARM_KO).get, path).toBe(false);
      expect(read(g, `/flowIsKnockedOut`).get, path).toBe(true);
      expect(read(g, `/scheduleCSectionIsComplete`).complete, path).toBe(true);
      expect(read(g, `/scheduleCSectionIsComplete`).get, path).toBe(false);
    }
  });

  it(`an ineligible nonfarm election stops without the prior-year questions`, ({ task }) => {
    task.meta.testedFactPaths = [
      NONFARM_KO,
      `/primaryFilerNonfarmOptionalMethodApplies`,
      `/primaryFilerSeNetEarnings`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
    ];
    // Profit $8,000 is under $8,186 but not under 72.189% of $10,000 ($7,218.90). 2026 draft Schedule SE,
    // PDF p. 3. The regular method is still 92.35% of $8,000. 26 U.S.C. 1402(a)(12), 1402(l).
    const g = fg({ ...noW2, ...scheduleC({ '/usesSeOptionalMethod': createBooleanWrapper(true) }) });
    expect(read(g, `/primaryFilerNonfarmOptionalMethodApplies`).get).toBe(false);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`0.00`);
    expect(read(g, `/primaryFilerSeNetEarnings`).get.toString()).toBe(`7388.00`);
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    expect(read(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`565.00`);
    expect(read(g, KO).get).toBe(false);
    expect(read(g, NONFARM_KO).complete).toBe(true);
    expect(read(g, NONFARM_KO).get).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  const eligibleElection = {
    [`/scheduleCBusinesses/#${biz}/writableGrossReceipts`]: createDollarWrapper(`9000`),
    [`/scheduleCBusinesses/#${biz}/writableTotalExpenses`]: createDollarWrapper(`3500`),
    '/usesSeOptionalMethod': createBooleanWrapper(true),
    '/hadAtLeast400NetEarningsInTwoOfPriorThreeYears': createBooleanWrapper(true),
    '/nonfarmOptionalMethodUsedFewerThanFivePriorYears': createBooleanWrapper(true),
  };

  it(`gross $9,000 and expenses $3,500 elect line 17 and line 4b of $6,000`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerNonfarmOptionalMethodLine17`,
      `/primaryFilerSeLine4b`,
      `/primaryFilerSeLine4c`,
      `/primaryFilerSeLine16`,
      `/primaryFilerSeSocialSecurityTax`,
      `/primaryFilerSeMedicareTax`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      NONFARM_KO,
      `/isReceivingEitc`,
    ];
    // Line 31 = $5,500, under $8,186 and under 72.189% of $9,000 ($6,497.01). Two-thirds of $9,000 is $6,000,
    // which is under line 16 ($7,560) and at least actual net earnings round($5,500 × 0.9235) = $5,079.
    // 2026 draft Schedule SE, PDF p. 3, lines 16, 17, and 4b. 26 U.S.C. 1402(a), 1402(l)(1).
    // No wages and a qualifying age, so the no-child earned income credit is claimed. Line 4b is not earned
    // income, and that credit stops the election. 26 U.S.C. 32(c)(2)(A).
    const g = fg({
      ...noW2,
      ...scheduleC(eligibleElection),
      '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
      '/eitcQcOfAnother': createBooleanWrapper(false),
      '/eitcHadImproperClaims': createBooleanWrapper(false),
      '/primaryFilerSsnEmploymentValidity': createEnumWrapper(`neither`, `/primaryFilerSsnEmploymentValidityOptions`),
      [`/filers/#${primaryFilerId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
    });
    expect(read(g, `/scheduleCNetProfitOrLoss`).get.toString()).toBe(`5500.00`);
    expect(read(g, `/primaryFilerSeNetEarnings`).get.toString()).toBe(`5079.00`);
    expect(read(g, `/primaryFilerNonfarmOptionalMethodLine17`).get.toString()).toBe(`6000.00`);
    expect(read(g, `/primaryFilerSeLine17`).get.toString()).toBe(`6000.00`);
    expect(read(g, `/primaryFilerSeLine16`).get.toString()).toBe(`7560.00`);
    expect(read(g, `/primaryFilerSeReportedNetProfit`).get.toString()).toBe(`0.00`);
    expect(read(g, `/primaryFilerSeReportedLine4a`).get.toString()).toBe(`0.00`);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`6000.00`);
    expect(read(g, `/primaryFilerSeLine4c`).get.toString()).toBe(`6000.00`);
    // round(6,000 × 0.124) = 744; round(6,000 × 0.029) = 174; total 918. Half is 459. 26 U.S.C. 1401, 164(f)(1).
    expect(read(g, `/primaryFilerSeSocialSecurityTax`).get.toString()).toBe(`744.00`);
    expect(read(g, `/primaryFilerSeMedicareTax`).get.toString()).toBe(`174.00`);
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`918.00`);
    expect(read(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`459.00`);
    expect(read(g, `/isReceivingEitc`).complete).toBe(true);
    expect(read(g, `/isReceivingEitc`).get).toBe(true);
    // EIC table row for $5,000–$5,049: midpoint $5,025 × 7.65% rounds to $384. 26 U.S.C. 32(b).
    expect(read(g, `/earnedIncomeCredit`).get.toString()).toBe(`384.00`);
    expect(read(g, NONFARM_KO).get).toBe(true);
    expect(read(g, KO).get).toBe(false);
  });

  it(`a sixth use of the nonfarm optional method stops`, ({ task }) => {
    task.meta.testedFactPaths = [NONFARM_KO, `/primaryFilerNonfarmOptionalMethodApplies`, `/primaryFilerSeLine4b`];
    // Eligible dollar tests, but this year would be the sixth use. 2026 draft Schedule SE, PDF p. 3.
    const g = fg({
      ...noW2,
      ...scheduleC({
        ...eligibleElection,
        '/nonfarmOptionalMethodUsedFewerThanFivePriorYears': createBooleanWrapper(false),
      }),
    });
    expect(read(g, `/primaryFilerNonfarmOptionalMethodApplies`).get).toBe(false);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`0.00`);
    expect(read(g, NONFARM_KO).complete).toBe(true);
    expect(read(g, NONFARM_KO).get).toBe(true);
    expect(read(g, KO).get).toBe(false);
  });

  it(`an unanswered nonfarm election stays incomplete and keeps the regular tax`, ({ task }) => {
    task.meta.testedFactPaths = [NONFARM_KO, KO, `/selfEmploymentTax`];
    const { '/usesSeOptionalMethod': _election, ...rest } = scheduleC();
    const g = fg({ ...noW2, ...rest });
    expect(read(g, NONFARM_KO).complete).toBe(false);
    expect(read(g, KO).complete).toBe(true);
    expect(read(g, KO).get).toBe(false);
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
  });

  it(`an unanswered question while self-employment income is yes stays incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/flowKnockoutForm8995WithoutTy2026Template`, `/selfEmploymentTax`];
    const { '/hadFarmSelfEmploymentIncome': _farm, ...rest } = scheduleC();
    const g = fg({ ...noW2, ...rest });
    // The Schedule SE operand stays incomplete, so lines 1a, 4b, 5a, and 8c are not filed as zero.
    // 26 U.S.C. 1402(a). Schedule C still requires Form 8995, and that form has no TY2026 template, so
    // /flowIsKnockedOut is complete true while this question is unanswered.
    expect(read(g, KO).complete).toBe(false);
    expect(read(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).complete).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
  });
});
