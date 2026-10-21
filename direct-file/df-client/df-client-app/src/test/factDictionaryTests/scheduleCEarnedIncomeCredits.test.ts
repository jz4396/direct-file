// #117: Schedule C net earnings in EITC and CDCC earned income. Hand-computed figures cite:
// - 26 U.S.C. 32(c)(2)(A)(ii), https://www.law.cornell.edu/uscode/text/26/32#c_2_A
// - Instructions for Form 1040 (2025), PDF p. 47, EIC Worksheet B, Part 1 lines 1a-1e and Part 4 line 4b
// - 2026 draft Instructions for Form 2441, PDF p. 5, lines 4 and 5, item 2 ("Schedule SE (Form 1040), line 3, minus any
//   deduction you claim on Schedule 1 (Form 1040), line 15")
// - Rev. Proc. 2025-32 sec. 4.06, p. 15: 2026 earned income amount $13,020 for one qualifying child, credit
//   percentage 34% (maximum credit 0.34 x 13,020 = 4,426.80, rounded $4,427)
// - Schedule SE: 92.35% of net profit, 12.4% and 2.9%, half deductible under 26 U.S.C. 164(f)
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

const scheduleC = (gross: number, expenses: number, owner = primaryFilerId) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/wantsQbiDeduction': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([businessId]),
  [`/scheduleCBusinesses/#${businessId}/filer`]: createCollectionItemWrapper(owner),
  [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Sample Services`),
  [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`${gross}`),
  [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`${expenses}`),
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

  it(`net earnings under $400: no SE tax, so earned income is the $300 net profit`, ({ task }) => {
    task.meta.testedFactPaths = [`/eitcEarnedIncomeWithoutCombatPay`, KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(500, 200) });
    expect(str(`/selfEmploymentTax`)).toBe(`0.00`);
    expect(str(`/eitcEarnedIncomeWithoutCombatPay`)).toBe(`300.00`);
    expect(get(KO).get).toBe(false);
  });

  it(`a Schedule C loss with an EITC-range AGI knocks out instead of being floored at $0`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(1000, 1500) });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`-500.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(true);
  });

  it(`a Schedule C loss with AGI above the EITC limit and no CDCC or CTC does not knock out`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph({ ...profile5AmtAnd8959, ...scheduleC(1000, 1500) });
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`a spouse's Schedule C still stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleCSpouseBusiness`];
    const { get } = graph({ ...single, ...mfjFilerData, ...scheduleC(15000, 0, spouseId) });
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(true);
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
