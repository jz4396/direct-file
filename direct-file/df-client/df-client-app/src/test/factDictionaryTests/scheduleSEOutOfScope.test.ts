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
import {
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeCareProviderData,
  makeChildData,
  makeInterestReportData,
  primaryFilerId,
} from '../testData.js';

/**
 * Schedule SE lines this tool does not compute. 26 U.S.C. 1402(a), 1402(a)(1), 1402(a)(8), 1402(a)(12),
 * 1402(a)(14), 1402(b)(2), 1402(c)(1), 1402(c)(4), 1402(e), 1402(g), 1402(j), 1402(l), and 164(f)(1)
 * (https://www.law.cornell.edu/uscode/text/26/1402). Supported path: net profit floored at 0, times 92.35%,
 * OASDI 12.4% and Medicare 2.9%, half on Schedule 1 line 15.
 */
const KO = `/flowKnockoutScheduleSEOutOfScope`;
const NONFARM_KO = `/flowKnockoutScheduleSENonfarmOptionalMethod`;
const CREDIT_KO = `/flowKnockoutScheduleSENonfarmOptionalMethodCredits`;
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
    // The dollar tests pass, so the eligibility stop is false. The credit stop is separate and is not part of
    // section completeness. 26 U.S.C. 32(c)(2)(A).
    expect(read(g, NONFARM_KO).complete).toBe(true);
    expect(read(g, NONFARM_KO).get).toBe(false);
    expect(read(g, CREDIT_KO).complete).toBe(true);
    expect(read(g, CREDIT_KO).get).toBe(true);
    expect(read(g, `/scheduleCSectionIsComplete`).complete).toBe(true);
    expect(read(g, `/scheduleCSectionIsComplete`).get).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(read(g, KO).get).toBe(false);
  });

  it(`an elected return is not stopped by the optional method when no credit uses line 4b`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerNonfarmOptionalMethodApplies`,
      NONFARM_KO,
      CREDIT_KO,
      `/scheduleCSectionIsComplete`,
      `/flowKnockoutForm8995WithoutTy2026Template`,
      `/flowIsKnockedOut`,
    ];
    // Wages of $200,000 are above the earned income credit phaseout, there is no qualifying child, and there
    // are no dependent-care expenses. The method applies. Instructions for Form 1040 (2025) draft, PDF p. 35:
    // "Attach whichever form you use (Form 8995 or 8995-A) to your return." There is still no MeF mapping, so
    // /flowIsKnockedOut stays true for that reason only.
    const g = fg({
      ...filerWithW2NoDeductionsNoCreditsBaseData,
      [`/formW2s/#${primaryFilerId}/writableWages`]: createDollarWrapper(`200000`),
      [`/formW2s/#${primaryFilerId}/writableFederalWithholding`]: createDollarWrapper(`40000`),
      ...scheduleC(eligibleElection),
      '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
      '/eitcQcOfAnother': createBooleanWrapper(false),
      '/eitcHadImproperClaims': createBooleanWrapper(false),
      '/primaryFilerSsnEmploymentValidity': createEnumWrapper(`neither`, `/primaryFilerSsnEmploymentValidityOptions`),
      [`/filers/#${primaryFilerId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
    });
    expect(read(g, `/primaryFilerNonfarmOptionalMethodApplies`).get).toBe(true);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`6000.00`);
    expect(read(g, NONFARM_KO).complete).toBe(true);
    expect(read(g, NONFARM_KO).get).toBe(false);
    expect(read(g, CREDIT_KO).complete).toBe(true);
    expect(read(g, CREDIT_KO).get).toBe(false);
    expect(read(g, `/scheduleCSectionIsComplete`).complete).toBe(true);
    expect(read(g, `/scheduleCSectionIsComplete`).get).toBe(true);
    expect(read(g, `/isReceivingEitc`).get).toBe(false);
    expect(read(g, `/isReceivingActc`).get).toBe(false);
    expect(read(g, `/cdccQualified`).get).toBe(false);
    expect(read(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`the child and dependent care credit stops an election that applies`, ({ task }) => {
    task.meta.testedFactPaths = [
      CREDIT_KO,
      `/cdccQualified`,
      `/scheduleCNetProfitForEarnedIncome`,
      `/primaryFilerEarnedIncomeForCdccBase`,
      `/scheduleCSectionIsComplete`,
    ];
    const childId = `85501abd-9f7c-4746-b4e9-f765565ca923`;
    const careProviderId = `4a939366-ee7c-4717-9794-5019a93b29dc`;
    const interestId = `693d539c-6679-4264-b6b5-d7411e318395`;
    // Gross $4,800 and expenses $1,500. Line 31 is $3,300. Two-thirds of $4,800 is $3,200, which is line 4b.
    // Half of the tax on $3,200 is $245. Schedule C line 31 minus that half is $3,055. 2026 draft Instructions
    // for Form 2441, PDF p. 5: lines 3 and 4b minus Schedule 1 line 15 are $2,955. This fact stays $3,055.
    // Form 2441 line 10 is Form 1040 line 18 (Credit Limit Worksheet). Line 18 is $0 on the self-employment
    // net alone: Rev. Proc. 2025-32 §4.14(1) sets the single standard deduction at $16,100. Taxable interest
    // of $30,000 (26 U.S.C. 61(a)(4)) is not earned income, so the care-credit earned-income amount stays
    // $3,055, and line 18 is high enough for /cdccQualified. Interest above $12,200 is over the earned income
    // credit investment-income limit (Rev. Proc. 2025-32 §4.06(2)).
    const g = fg({
      ...noW2,
      ...makeInterestReportData(30000, interestId, primaryFilerId),
      '/interestReportsIsDone': createBooleanWrapper(true),
      ...scheduleC({
        ...eligibleElection,
        [`/scheduleCBusinesses/#${biz}/writableGrossReceipts`]: createDollarWrapper(`4800`),
        [`/scheduleCBusinesses/#${biz}/writableTotalExpenses`]: createDollarWrapper(`1500`),
      }),
      ...makeChildData(childId, `2018-01-01`),
      '/familyAndHousehold': createCollectionWrapper([childId]),
      [`/familyAndHousehold/#${childId}/ownSupport`]: createBooleanWrapper(false),
      [`/familyAndHousehold/#${childId}/unableToCareForSelf`]: createBooleanWrapper(false),
      '/cdccHasCreditForPriorYearExpenses': createBooleanWrapper(false),
      '/writableCdccHasQualifyingExpenses': createBooleanWrapper(true),
      [`/familyAndHousehold/#${childId}/cdccHasDependentCareExpenses`]: createBooleanWrapper(true),
      [`/familyAndHousehold/#${childId}/cdccHadExpensesPaidToQualifyingProvider`]: createBooleanWrapper(true),
      [`/familyAndHousehold/#${childId}/writableCdccQualifyingExpenseAmount`]: createDollarWrapper(`1300`),
      ...makeCareProviderData(careProviderId),
      '/cdccCareProviders': createCollectionWrapper([careProviderId]),
      '/cdccCareProvidersIsDone': createBooleanWrapper(true),
      '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
      '/eitcQcOfAnother': createBooleanWrapper(false),
      '/eitcHadImproperClaims': createBooleanWrapper(false),
      '/primaryFilerSsnEmploymentValidity': createEnumWrapper(`neither`, `/primaryFilerSsnEmploymentValidityOptions`),
      [`/filers/#${primaryFilerId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
    });
    expect(read(g, `/scheduleCNetProfitOrLoss`).get.toString()).toBe(`3300.00`);
    expect(read(g, `/primaryFilerSeLine4b`).get.toString()).toBe(`3200.00`);
    expect(read(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`245.00`);
    expect(read(g, `/scheduleCNetProfitForEarnedIncome`).get.toString()).toBe(`3055.00`);
    expect(read(g, `/primaryFilerEarnedIncomeForCdccBase`).get.toString()).toBe(`3055.00`);
    expect(read(g, `/cdccQualified`).complete).toBe(true);
    expect(read(g, `/cdccQualified`).get).toBe(true);
    expect(read(g, `/primaryFilerNonfarmOptionalMethodApplies`).get).toBe(true);
    expect(read(g, NONFARM_KO).get).toBe(false);
    expect(read(g, CREDIT_KO).complete).toBe(true);
    expect(read(g, CREDIT_KO).get).toBe(true);
    expect(read(g, `/scheduleCSectionIsComplete`).get).toBe(true);
    expect(read(g, `/flowIsKnockedOut`).get).toBe(true);
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
