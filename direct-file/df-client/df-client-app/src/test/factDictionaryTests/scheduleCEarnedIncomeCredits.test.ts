// #117: Schedule C net earnings in EITC and CDCC earned income. Hand-computed figures cite:
// - 26 U.S.C. 32(c)(2)(A)(ii), https://www.law.cornell.edu/uscode/text/26/32#c_2_A
// - Instructions for Form 1040 (2025), PDF p. 47, EIC Worksheet B, Part 1 lines 1a-1e and Part 4 line 4b
// - 2026 draft Instructions for Form 2441, PDF p. 5, lines 4 and 5, item 2 ("Schedule SE (Form 1040), line 3, minus any
//   deduction you claim on Schedule 1 (Form 1040), line 15")
// - Rev. Proc. 2025-32 sec. 4.06, p. 15: 2026 earned income amount $13,020 for one qualifying child, credit
//   percentage 34% (maximum credit 0.34 x 13,020 = 4,426.80, rounded $4,427)
// - Schedule SE: 92.35% of net profit, 12.4% and 2.9%, half deductible under 26 U.S.C. 164(f)
// #84: a Schedule C loss reduces childless EITC earned income and Schedule 8812 line 18a, and no longer stops
// either return. Rev. Proc. 2025-32: CTC $2,200, ACTC $1,700, refundability threshold $2,500, 15%. No qualifying
// child: earned income amount $8,680, 7.65%, maximum $664; phaseout starts at $10,860 single / $18,140 MFJ and is
// complete at $19,540 / $26,820. Worksheet B line 4b uses the $50-row midpoint. 2026 draft Instructions for
// Schedule 8812, PDF p. 9: if the Earned Income Worksheet line 3 is zero or less, line 18a is -0-. A loss still
// stops when the CDCC (Form 2441) applies, and a joint return claiming the CDCC still stops. Test SSNs are group 00.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeCareProviderData,
  makeChildData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';
import { profile5AmtAnd8959 } from '../scenarioTests/goldenProfiles.js';

const KO = `/flowKnockoutScheduleCEarnedIncomeCredits`;
const businessId = `e1170000-0000-4000-8000-000000000001`;
const childId = `e1170000-0000-4000-8000-000000000002`;
const providerId = `e1170000-0000-4000-8000-000000000003`;
const interestId = `e1170000-0000-4000-8000-000000000004`;

/** $40,000 of 1099-INT interest: unearned income, so the return has income tax for the CDCC to offset. */
const interest40k = {
  '/interestReports': createCollectionWrapper([interestId]),
  [`/interestReports/#${interestId}/payer`]: createStringWrapper(`Example Savings Bank`),
  [`/interestReports/#${interestId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/interestReports/#${interestId}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${interestId}/writable1099Amount`]: createDollarWrapper(`40000`),
  [`/interestReports/#${interestId}/writableInterestOnGovernmentBonds`]: createDollarWrapper(`0`),
  [`/interestReports/#${interestId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
};

const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
};

const single = {
  ...noW2,
  ...baseFilerData,
  '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1990-01-01`),
  '/eitcQcOfAnother': createBooleanWrapper(false),
  '/eitcHadImproperClaims': createBooleanWrapper(false),
};

const withChild = {
  '/familyAndHousehold': createCollectionWrapper([childId]),
  ...makeChildData(childId, `2016-01-01`),
};

/** Born 2018-01-01: age 8 on December 31, 2026, under 17, so a CTC qualifying child. */
const childAge8 = {
  '/familyAndHousehold': createCollectionWrapper([childId]),
  ...makeChildData(childId, `2018-01-01`),
};

const hoh = {
  ...single,
  '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
  '/scheduleAWantsToItemize': createBooleanWrapper(false),
  '/receivedImproperClaims': createBooleanWrapper(false),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(false),
};

const interest = (amount: number) => ({
  '/interestReports': createCollectionWrapper([interestId]),
  [`/interestReports/#${interestId}/payer`]: createStringWrapper(`Example Savings Bank`),
  [`/interestReports/#${interestId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/interestReports/#${interestId}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${interestId}/writable1099Amount`]: createDollarWrapper(`${amount}`),
  [`/interestReports/#${interestId}/writableInterestOnGovernmentBonds`]: createDollarWrapper(`0`),
  [`/interestReports/#${interestId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});

const careFor = (amount: number) => ({
  '/familyAndHousehold': createCollectionWrapper([childId]),
  ...makeChildData(childId, `2018-01-01`),
  [`/familyAndHousehold/#${childId}/ownSupport`]: createBooleanWrapper(false),
  '/flowKnockoutHouseholdEmployee': createBooleanWrapper(false),
  '/hasCdccCarryoverAmountFromPriorTaxYear': createBooleanWrapper(false),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(true),
  [`/familyAndHousehold/#${childId}/cdccHasDependentCareExpenses`]: createBooleanWrapper(true),
  [`/familyAndHousehold/#${childId}/cdccHadExpensesPaidToQualifyingProvider`]: createBooleanWrapper(true),
  [`/familyAndHousehold/#${childId}/writableCdccQualifyingExpenseAmount`]: createDollarWrapper(`${amount}`),
  '/writableHasCdccForfeitedCredits': createBooleanWrapper(false),
  '/cdccHasCreditForPriorYearExpenses': createBooleanWrapper(false),
  ...makeCareProviderData(providerId),
  [`/cdccCareProviders/#${providerId}/writableAmountPaidForCare`]: createDollarWrapper(`${amount}`),
  '/cdccCareProviders': createCollectionWrapper([providerId]),
  '/cdccCareProvidersIsDone': createBooleanWrapper(true),
});

const w2Id = `e1170000-0000-4000-8000-000000000011`;

/** Born 1996-01-01: age 30 on December 31, 2026. SSN group 00. */
const age30 = (serial: string) => ({
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1996-01-01`),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial }),
});

const scheduleC = (gross: number, expenses: number, owner = primaryFilerId) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([businessId]),
  [`/scheduleCBusinesses/#${businessId}/filer`]: createCollectionItemWrapper(owner),
  [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Sample Services`),
  [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`${gross}`),
  [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`${expenses}`),
  [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});

const graph = (data: Record<string, unknown>) => {
  const { factGraph } = setupFactGraph(data as Parameters<typeof setupFactGraph>[0]);
  const get = (p: string) => factGraph.get(p as ConcretePath);
  return { factGraph, get, str: (p: string) => get(p).get.toString() };
};

describe(`Schedule C earned income for the EITC and CDCC (#117)`, () => {
  it(`ordinary return with no Schedule C: the knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph(profile5AmtAnd8959);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`"No" to self-employment income: the knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph({ ...single, ...withChild, '/hadSelfEmploymentIncome': createBooleanWrapper(false) });
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`single, one child, $15,000 Schedule C profit: earned income $13,940 and the maximum $4,427 EITC`, ({ task }) => {
    task.meta.testedFactPaths = [`/eitcEarnedIncomeWithoutCombatPay`, `/earnedIncomeCredit`, KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(15000, 0) });
    // Schedule SE: round(15,000 x 0.9235) = 13,853; round(13,853 x 0.124) = 1,718; round(13,853 x 0.029) = 402
    expect(str(`/selfEmploymentTax`)).toBe(`2120.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`1060.00`);
    // Worksheet B line 1e: 15,000 - 1,060 = 13,940
    expect(str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`13940.00`);
    expect(get(`/eitcQualified`).get).toBe(true);
    // 13,940 is over the $13,020 earned income amount and AGI 13,940 is under the $23,890 phaseout threshold
    expect(str(`/earnedIncomeCredit`)).toBe(`4427.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`$20,000 Schedule C profit with $3,000 notary: earned income is $15,799 and the EITC uses it`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCNetProfitForEarnedIncome`,
      `/eitcEarnedIncomeWithoutCombatPay`,
      `/earnedIncomeCredit`,
      `/earnedIncomeWithAllCombatPay`,
      `/primaryFilerEarnedIncomeForCdccBase`,
    ];
    // Line 31 stays $20,000. Notary net profit of $3,000 is subtracted on Schedule SE line 3, so line 3 is
    // $17,000. 26 U.S.C. 1402(c)(1); 2026 draft Instructions for Schedule SE, PDF p. 5, Line 2 item 2.
    // round(17,000 × 0.9235) = 15,700. round(15,700 × 0.124) = 1,947. round(15,700 × 0.029) = 455.
    // Self-employment tax is 2,402. Line 13 is round(2,402 × 0.50) = 1,201.
    // EIC Worksheet B (2025 Form 1040 instructions, PDF p. 47) Part 1 line 1a is Schedule SE line 3 and line
    // 1e is line 3 minus line 13: 17,000 − 1,201 = 15,799. 26 U.S.C. 32(c)(2)(A)(ii) uses net earnings under
    // 1402(a), which excludes notary fees, including Worksheet B Part 2 line 2 when net earnings are under $400.
    // Each filer's amount is floored at $0 and the two are added. The secondary filer has none.
    const notary = graph({
      ...single,
      ...withChild,
      ...scheduleC(20000, 0),
      [`/scheduleCBusinesses/#${businessId}/notaryNetProfit`]: createDollarWrapper(`3000.00`),
    });
    expect(notary.str(`/scheduleCNetProfitOrLoss`)).toBe(`20000.00`);
    expect(notary.str(`/primaryFilerSeLine3`)).toBe(`17000.00`);
    expect(notary.str(`/deductibleSelfEmploymentTax`)).toBe(`1201.00`);
    expect(notary.str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`15799.00`);
    expect(notary.str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`15799.00`);
    expect(notary.str(`/earnedIncomeWithAllCombatPay`)).toBe(`15799.00`);
    expect(notary.str(`/primaryFilerEarnedIncomeForCdccBase`)).toBe(`15799.00`);
    // $15,799 is above the $13,020 earned-income amount for one child, and AGI $18,799 (20,000 − 1,201) is
    // under the $23,890 phaseout start, so the credit on that earned income is the maximum. Rev. Proc.
    // 2025-32 §4.06: 34% of $13,020 is $4,427.
    expect(notary.str(`/agi`)).toBe(`18799.00`);
    expect(notary.str(`/earnedIncomeCredit`)).toBe(`4427.00`);
    expect(notary.get(KO).get).toBe(false);

    // No notary: line 3 stays $20,000. round(20,000 × 0.9235) = 18,470. round(18,470 × 0.124) = 2,290.
    // round(18,470 × 0.029) = 536. Self-employment tax is 2,826. Line 13 is 1,413. Earned income is
    // 20,000 − 1,413 = 18,587. An explicit $0 matches leaving the amount unanswered.
    const unset = graph({ ...single, ...withChild, ...scheduleC(20000, 0) });
    const zero = graph({
      ...single,
      ...withChild,
      ...scheduleC(20000, 0),
      [`/scheduleCBusinesses/#${businessId}/notaryNetProfit`]: createDollarWrapper(`0.00`),
    });
    for (const g of [unset, zero]) {
      expect(g.str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`18587.00`);
      expect(g.str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`18587.00`);
      expect(g.str(`/earnedIncomeCredit`)).toBe(`4427.00`);
    }
  });

  it(`net earnings under $400: no SE tax, so earned income is the $300 net profit`, ({ task }) => {
    task.meta.testedFactPaths = [`/eitcEarnedIncomeWithoutCombatPay`, KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(500, 200) });
    expect(str(`/selfEmploymentTax`)).toBe(`0.00`);
    expect(str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`300.00`);
    expect(get(KO).get).toBe(false);
  });

  it(`a Schedule C loss with a CTC qualifying child no longer stops`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/ctcQualified`];
    // Child born 2016-01-01 is under 17 at the end of 2026, so /ctcQualified applies. The loss no longer stops the
    // CTC/ACTC. Line 18a is -0- because wages are $0 and the signed Schedule C net is -$500.
    const { get, str } = graph({
      ...single,
      ...age30(`8405`),
      ...withChild,
      '/writableCdccHasQualifyingExpenses': createBooleanWrapper(false),
      '/receivedImproperClaims': createBooleanWrapper(false),
      ...scheduleC(1000, 1500),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-500.00`);
    expect(str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`0.00`);
    expect(str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-500.00`);
    expect(get(`/ctcQualified`).get).toBe(true);
    expect(str(`/pdf8812Line18a`)).toBe(`0.00`);
    expect(str(`/additionalCtc`)).toBe(`0.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`HOH, one child age 8, W-2 $12,000 and a $3,000 Schedule C loss: line 18a $9,000 and ACTC $975, no stop`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/pdf8812Line18a`,
      `/pdf8812Line20`,
      `/additionalCtc`,
      `/agi`,
      `/totalTentativeTax`,
      KO,
    ];
    // No SE tax on a loss. AGI is 12,000 − 3,000 = 9,000, under the $24,150 HOH standard deduction, so tax is $0.
    // Line 18a is the signed net: 12,000 − 3,000 = 9,000. Line 19 is 9,000 − 2,500 = 6,500. Line 20 is
    // 15% × 6,500 = 975. One child, tax $0, so the ACTC is that $975. Same as wages of $9,000 and no Schedule C.
    const loss = graph({
      ...hoh,
      ...childAge8,
      ...makeW2Data(12000, w2Id),
      ...scheduleC(1000, 4000),
    });
    const wagesOnly = graph({
      ...hoh,
      ...childAge8,
      ...makeW2Data(9000, w2Id),
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    expect(loss.str(`/scheduleCNetProfitOrLoss`)).toBe(`-3000.00`);
    expect(loss.str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`0.00`);
    expect(loss.str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-3000.00`);
    expect(loss.str(`/selfEmploymentTax`)).toBe(`0.00`);
    expect(loss.str(`/agi`)).toBe(`9000.00`);
    expect(loss.str(`/taxableIncome`)).toBe(`0.00`);
    expect(loss.str(`/totalTentativeTax`)).toBe(`0.00`);
    expect(loss.str(`/pdf8812Line18a`)).toBe(`9000.00`);
    expect(loss.str(`/earnedIncomeAboveActcRefundabilityThreshold`)).toBe(`6500.00`);
    expect(loss.str(`/pdf8812Line20`)).toBe(`975.00`);
    expect(loss.str(`/additionalCtc`)).toBe(`975.00`);
    expect(loss.get(KO).complete).toBe(true);
    expect(loss.get(KO).get).toBe(false);
    expect(wagesOnly.str(`/agi`)).toBe(`9000.00`);
    expect(wagesOnly.str(`/pdf8812Line18a`)).toBe(`9000.00`);
    expect(wagesOnly.str(`/pdf8812Line20`)).toBe(`975.00`);
    expect(wagesOnly.str(`/additionalCtc`)).toBe(`975.00`);
    expect(loss.str(`/additionalCtc`)).toBe(wagesOnly.str(`/additionalCtc`));
  });

  it(`HOH, one child, W-2 $2,000 and a $3,000 Schedule C loss: line 18a $0 and ACTC $0, no stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdf8812Line18a`, `/additionalCtc`, KO];
    // 2,000 − 3,000 = −1,000. Earned Income Worksheet line 3 is zero or less, so line 18a is -0- and the ACTC is $0.
    const { get, str } = graph({
      ...hoh,
      ...childAge8,
      ...makeW2Data(2000, w2Id),
      ...scheduleC(1000, 4000),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-3000.00`);
    expect(str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-3000.00`);
    expect(str(`/earnedIncomeWithAllCombatPay`)).toBe(`0.00`);
    expect(str(`/pdf8812Line18a`)).toBe(`0.00`);
    expect(str(`/additionalCtc`)).toBe(`0.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`HOH, one child, not taking the EIC: W-2 $20,000, interest $13,000, Schedule C −$8,000 gives ACTC $1,425`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/pdf8812Line18a`,
      `/pdf8812Line20`,
      `/additionalCtc`,
      `/agi`,
      `/taxableIncome`,
      `/totalTentativeTax`,
      `/totalCtc`,
      `/belowEitcInvestmentIncomeLimit`,
      KO,
    ];
    // Investment income $13,000 is over /belowEitcInvestmentIncomeLimit ($12,200), so the EIC is not taken.
    // AGI is 20,000 + 13,000 − 8,000 = 25,000. HOH standard deduction $24,150, so taxable income is $850.
    // Line 18a is 20,000 − 8,000 = 12,000. Line 19 is 9,500. Line 20 is 15% × 9,500 = 1,425.
    const { get, str } = graph({
      ...hoh,
      ...childAge8,
      ...makeW2Data(20000, w2Id),
      ...interest(13000),
      ...scheduleC(1000, 9000),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-8000.00`);
    expect(str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`0.00`);
    expect(str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-8000.00`);
    expect(get(`/belowEitcInvestmentIncomeLimit`).get).toBe(false);
    expect(get(`/eitcQualified`).get).toBe(false);
    expect(str(`/agi`)).toBe(`25000.00`);
    expect(str(`/taxableIncome`)).toBe(`850.00`);
    expect(str(`/totalTentativeTax`)).toBe(`86.00`);
    expect(str(`/totalCtc`)).toBe(`86.00`);
    expect(str(`/pdf8812Line18a`)).toBe(`12000.00`);
    expect(str(`/earnedIncomeAboveActcRefundabilityThreshold`)).toBe(`9500.00`);
    expect(str(`/pdf8812Line20`)).toBe(`1425.00`);
    expect(str(`/additionalCtc`)).toBe(`1425.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`single, age 30, W-2 $15,000 and a $2,000 Schedule C loss: childless EITC matches wages of $13,000`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/scheduleCNetProfitOrLossForEitc`,
      `/eitcEarnedIncomeWithoutCombatPay`,
      `/agi`,
      `/earnedIncomeCredit`,
      KO,
    ];
    // No SE tax on a loss, so Worksheet B line 1e is the Schedule SE line 3 loss of -$2,000.
    // Earned income and AGI are 15,000 - 2,000 = 13,000. The $13,000 row midpoint is 13,025.
    // 13,025 - 10,860 = 2,165. 664 - 7.65% x 2,165 = 498.3775, which rounds to $498.
    const loss = graph({
      ...single,
      ...age30(`8401`),
      ...makeW2Data(15000, w2Id),
      ...scheduleC(1000, 3000),
    });
    const wagesOnly = graph({
      ...single,
      ...age30(`8401`),
      ...makeW2Data(13000, w2Id),
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    expect(loss.str(`/scheduleCNetProfitOrLoss`)).toBe(`-2000.00`);
    expect(loss.str(`/selfEmploymentTax`)).toBe(`0.00`);
    expect(loss.str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-2000.00`);
    expect(loss.str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`0.00`);
    expect(loss.str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`13000.00`);
    expect(loss.str(`/agi`)).toBe(`13000.00`);
    // Schedule 8812 line 18a uses the same signed net: 15,000 − 2,000 = 13,000. The floored Schedule C
    // amount used by the CDCC stays $0.
    expect(loss.str(`/earnedIncomeWithAllCombatPay`)).toBe(`13000.00`);
    expect(loss.get(KO).complete).toBe(true);
    expect(loss.get(KO).get).toBe(false);
    expect(loss.get(`/eitcQualified`).get).toBe(true);
    expect(wagesOnly.str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`13000.00`);
    expect(wagesOnly.str(`/earnedIncomeCredit`)).toBe(`498.00`);
    expect(loss.str(`/earnedIncomeCredit`)).toBe(wagesOnly.str(`/earnedIncomeCredit`));
    expect(loss.str(`/earnedIncomeCredit`)).toBe(`498.00`);
  });

  it(`single, W-2 $3,000 and a $3,500 Schedule C loss: earned income -$500 and EITC $0, no stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/eitcEarnedIncomeWithoutCombatPay`, `/earnedIncomeCredit`, KO];
    const { get, str } = graph({
      ...single,
      ...age30(`8402`),
      ...makeW2Data(3000, w2Id),
      ...scheduleC(1000, 4500),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-3500.00`);
    expect(str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-3500.00`);
    expect(str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`-500.00`);
    expect(str(`/earnedIncomeCredit`)).toBe(`0.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`MFJ, primary W-2 $20,000 and a $4,000 spouse Schedule C loss: childless EITC matches wages of $16,000`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/eitcEarnedIncomeWithoutCombatPay`, `/earnedIncomeCredit`, `/agi`, KO];
    // $16,000 is below the $18,140 MFJ phaseout start, so the credit is the $664 maximum.
    const joint = {
      ...single,
      ...mfjFilerData,
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1996-01-01`),
      [`/filers/#${spouseId}/dateOfBirth`]: createDayWrapper(`1994-03-15`),
      [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `8403` }),
      [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `8404` }),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      [`/filers/#${spouseId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
    };
    const loss = graph({
      ...joint,
      ...makeW2Data(20000, w2Id),
      ...scheduleC(1000, 5000, spouseId),
    });
    const wagesOnly = graph({
      ...joint,
      ...makeW2Data(16000, w2Id),
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    expect(loss.str(`/scheduleCNetProfitOrLoss`)).toBe(`-4000.00`);
    expect(loss.str(`/scheduleCSecondaryFilerNetProfitOrLoss`)).toBe(`-4000.00`);
    expect(loss.str(`/scheduleCNetProfitOrLossForEitc`)).toBe(`-4000.00`);
    expect(loss.str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`16000.00`);
    expect(loss.str(`/agi`)).toBe(`16000.00`);
    expect(loss.get(KO).complete).toBe(true);
    expect(loss.get(KO).get).toBe(false);
    expect(wagesOnly.str(`/earnedIncomeCredit`)).toBe(`664.00`);
    expect(loss.str(`/earnedIncomeCredit`)).toBe(wagesOnly.str(`/earnedIncomeCredit`));
    expect(loss.str(`/earnedIncomeCredit`)).toBe(`664.00`);
  });

  it(`a Schedule C loss with Form 2441 CDCC expenses still stops`, ({ task }) => {
    task.meta.testedFactPaths = [`/primaryFilerEarnedIncomeForCdccBase`, `/cdccQualified`, KO];
    // Wages keep the floored CDCC earned income above $0, so the credit applies. The loss is not subtracted there.
    const { get, str } = graph({
      ...single,
      ...age30(`8406`),
      ...interest40k,
      ...careFor(3000),
      ...makeW2Data(15000, w2Id),
      ...scheduleC(1000, 3000),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-2000.00`);
    expect(str(`/scheduleCNetProfitForEarnedIncome`)).toBe(`0.00`);
    expect(str(`/primaryFilerEarnedIncomeForCdccBase`)).toBe(`15000.00`);
    expect(get(`/cdccQualified`).get).toBe(true);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(true);
  });

  it(`a Schedule C loss with AGI above the EITC limit and no CDCC or CTC does not knock out`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph({ ...profile5AmtAnd8959, ...scheduleC(1000, 1500) });
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`one spouse-owned Schedule C on a joint return does not stop on the spouse-business knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleCSpouseBusiness`];
    const { get } = graph({ ...single, ...mfjFilerData, ...scheduleC(15000, 0, spouseId) });
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(false);
  });

  it(`CDCC, single with $40,000 interest: $2,500 Schedule C profit limits $3,000 of care expenses to $2,323`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerEarnedIncomeForCdccBase`,
      `/cdccEarnedIncomePrimaryFilerLine4`,
      `/cdccLowerOfEarnedIncomeAndExpenses`,
      KO,
    ];
    const { get, str } = graph({ ...single, ...interest40k, ...careFor(3000), ...scheduleC(2500, 0) });
    // Schedule SE: round(2,500 x 0.9235) = 2,309; round(2,309 x 0.124) = 286; round(2,309 x 0.029) = 67; half of
    // 353 = 176.50, rounded 177. Form 2441 line 4 item 2: 2,500 - 177 = 2,323
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`177.00`);
    expect(str(`/primaryFilerEarnedIncomeForCdccBase`)).toBe(`2323.00`);
    expect(str(`/cdccEarnedIncomePrimaryFilerLine4`)).toBe(`2323.00`);
    // Line 6: smallest of line 3 ($3,000) and line 4 ($2,323)
    expect(str(`/cdccLowerOfEarnedIncomeAndExpenses`)).toBe(`2323.00`);
    expect(get(`/cdccQualified`).get).toBe(true);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`CDCC on a joint return with a Schedule C still knocks out until Schedule SE is per spouse`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph({
      ...single,
      ...mfjFilerData,
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      [`/filers/#${spouseId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
      '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
      '/hasMfjSpouseEarnedIncome': createBooleanWrapper(true),
      [`/filers/#${primaryFilerId}/isStudent`]: createBooleanWrapper(false),
      [`/filers/#${spouseId}/isStudent`]: createBooleanWrapper(false),
      ...makeW2Data(30000, `e1170000-0000-4000-8000-000000000005`, spouseId),
      ...interest40k,
      ...careFor(3000),
      ...scheduleC(20000, 0),
    });
    expect(get(`/cdccQualified`).get).toBe(true);
    expect(get(KO).get).toBe(true);
  });
});
