import { describe, it, expect } from 'vitest';
import flowNodes from '../../flow/flow.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeCareProviderData,
  makeChildData,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';

/**
 * Form 1065 box 14 code A on the owning spouse's Schedule SE. #85.
 * 26 U.S.C. 1402(a) and 1402(b) (https://www.law.cornell.edu/uscode/text/26/1402): net earnings and the
 * wage-base limit are per individual. 26 U.S.C. 1402(a)(12) and 1401(a), 1401(b)(1)
 * (https://www.law.cornell.edu/uscode/text/26/1401). 26 U.S.C. 164(f)(1).
 * 2026 draft Schedule SE, line 2: net profit or (loss) from Schedule C line 31 and box 14 code A (other
 * than farming). Line 4a multiplies line 3 by 92.35%. Line 7 is $184,500. Line 8a is W-2 boxes 3 and 7.
 * Line 10 multiplies the smaller of line 6 or line 9 by 12.4%. Line 11 multiplies line 6 by 2.9%.
 * Line 12 adds lines 10 and 11. Each of those lines is rounded to the dollar (26 U.S.C. 6102(a)).
 * 2026 draft Instructions for Schedule SE, PDF p. 3: each spouse with self-employment income files a
 * separate Schedule SE. Partner's Instructions for Schedule K-1 (Form 1065) (2025), Box 14, Code A.
 * Test SSNs are group 00 (444-00-2016 and 444-00-2017) [SSA].
 *
 * Amounts below are what the module's existing per-line rounding produces. The unrounded products are
 * in the comments.
 */
const partnershipId = `b7e1c2a0-1111-4222-8333-444455556685`;
const w2Id = `b7e1c2a0-1111-4222-8333-444455556686`;
const childId = `b7e1c2a0-1111-4222-8333-444455556687`;
const providerId = `b7e1c2a0-1111-4222-8333-444455556688`;
const EARNED_INCOME_KO = `/flowKnockoutScheduleEK1Box14CodeAEarnedIncomeCredits`;

const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
};

const seQuestions = [
  `/hadFarmSelfEmploymentIncome`,
  `/hadChurchEmployeeIncome`,
  `/hadSecondaryFilerChurchEmployeeIncome`,
  `/usesSeOptionalMethod`,
  `/hasMinisterOrSeExemption`,
  `/hasNotarySeExclusion`,
  `/hadForm8919Wages`,
] as const;

const k1 = (owner: `primary` | `secondary` | undefined, extra: Record<string, unknown> = {}) => ({
  [`/scheduleEK1s/#${partnershipId}/entityName`]: createStringWrapper(`Northwind Partners`),
  [`/scheduleEK1s/#${partnershipId}/entityType`]: createEnumWrapper(`P`, `/scheduleEK1EntityTypeOptions`),
  [`/scheduleEK1s/#${partnershipId}/isForeignPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/isPubliclyTradedPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/isTradingBusiness`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/box1`]: createDollarWrapper(`30000`),
  [`/scheduleEK1s/#${partnershipId}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`30000`),
  [`/scheduleEK1s/#${partnershipId}/box14CodeAWasReduced`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/box14CodeAIsFarm`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/form1065Box4a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1065Box4b`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1065Box4c`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/hasQbiStatement`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/basisComputationRequired`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/form1065Box5`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1065Box6a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1065Box6b`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1120sBox4`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1120sBox5a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1120sBox5b`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/dividendIncludesPtep`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/box5IncludesCleanRenewableEnergyBondInterest`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${partnershipId}/form1065Box8`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1065Box9a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1120sBox7`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/form1120sBox8a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${partnershipId}/longTermCapitalGainIsForeignSource`]: createBooleanWrapper(false),
  ...(owner
    ? { [`/scheduleEK1s/#${partnershipId}/owner`]: createEnumWrapper(owner, `/scheduleEK1OwnerOptions`) }
    : {}),
  ...extra,
});

const w2 = (owner: string, wages: number) => ({
  '/formW2s': createCollectionWrapper([w2Id]),
  [`/formW2s/#${w2Id}/filer`]: createCollectionItemWrapper(owner),
  [`/formW2s/#${w2Id}/writableWages`]: createDollarWrapper(`${wages}`),
  [`/formW2s/#${w2Id}/writableOasdiWages`]: createDollarWrapper(`${wages}`),
  [`/formW2s/#${w2Id}/writableMedicareWages`]: createDollarWrapper(`${wages}`),
  [`/formW2s/#${w2Id}/writableFederalWithholding`]: createDollarWrapper(`0`),
});

const mfjFl = {
  ...noW2,
  ...mfjFilerData,
  '/hadSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadScheduleEIncome': createBooleanWrapper(false),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `2016` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `2017` }),
  ...Object.fromEntries(seQuestions.map((path) => [path, createBooleanWrapper(false)])),
  '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
  '/scheduleEPartIILine27': createBooleanWrapper(false),
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEK1s': createCollectionWrapper([partnershipId]),
  '/scheduleEK1sIsDone': createBooleanWrapper(true),
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

const qualifyingChild = {
  '/familyAndHousehold': createCollectionWrapper([childId]),
  ...makeChildData(childId, `2016-01-01`),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(false),
  '/receivedImproperClaims': createBooleanWrapper(false),
};

const fg = (extra: Record<string, unknown>) => setupFactGraph({ ...mfjFl, ...extra }).factGraph;
const get = (g: ReturnType<typeof fg>, p: string) => g.get(p as ConcretePath);

describe(`Form 1065 box 14 code A on the owning spouse's Schedule SE (#85)`, () => {
  it(`asks which spouse owns every Form 1065 K-1 on a joint return`, () => {
    const screens = createFlowConfig(flowNodes);
    expect(screens.screensByRoute.get(`/flow/income/schedule-e/schedule-e-k1-owner`)?.conditions).toEqual([
      `/scheduleEK1s/*/asksOwner`,
    ]);
  });

  it(`spouse owns the K-1: spouse Schedule SE only, primary wages do not reduce the spouse's wage base`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/secondaryFilerSeReportedNetProfit`,
      `/secondaryFilerSeNetEarnings`,
      `/secondaryFilerScheduleSELine8a`,
      `/secondaryFilerSeRemainingSocialSecurityWageBase`,
      `/secondaryFilerSeSocialSecurityTax`,
      `/secondaryFilerSeMedicareTax`,
      `/secondaryFilerSelfEmploymentTax`,
      `/secondaryFilerDeductibleSelfEmploymentTax`,
      `/primaryFilerSelfEmploymentTax`,
      `/primaryFilerSeTaxApplies`,
      `/schedule1Line15`,
      `/form8959Line13`,
      `/flowKnockoutScheduleEPartIIBox14CodeAMfj`,
      `/flowKnockoutScheduleEEitc`,
      `/flowKnockoutScheduleEK1Box14CodeAEarnedIncomeCredits`,
    ];
    // Line 2 = $30,000. Line 4a = 30,000 × 0.9235 = 27,705.
    // Line 10 unrounded 27,705 × 0.124 = 3,435.42, rounded $3,435.
    // Line 11 unrounded 27,705 × 0.029 = 803.445, rounded $803.
    // Line 12 unrounded $4,238.865; rounded lines add to $4,238.
    // Line 13 = round(4,238 × 50%) = $2,119. Schedule 1 line 15 is that amount.
    const g = fg({ ...w2(primaryFilerId, 80000), ...k1(`secondary`) });
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(g, `/secondaryFilerSeNetEarnings`).get.toString()).toBe(`27705.00`);
    expect(get(g, `/secondaryFilerOasdiWagesTotal`).get.toString()).toBe(`0.00`);
    expect(get(g, `/primaryFilerOasdiWagesTotal`).get.toString()).toBe(`80000.00`);
    expect(get(g, `/secondaryFilerScheduleSELine8a`).get.toString()).toBe(`0.00`);
    expect(get(g, `/secondaryFilerSeRemainingSocialSecurityWageBase`).get.toString()).toBe(`184500.00`);
    expect(get(g, `/secondaryFilerSeSocialSecurityTax`).get.toString()).toBe(`3435.00`);
    expect(get(g, `/secondaryFilerSeMedicareTax`).get.toString()).toBe(`803.00`);
    expect(get(g, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`4238.00`);
    expect(get(g, `/secondaryFilerDeductibleSelfEmploymentTax`).get.toString()).toBe(`2119.00`);
    expect(get(g, `/schedule1Line15`).get.toString()).toBe(`2119.00`);
    expect(get(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`2119.00`);
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
    expect(get(g, `/primaryFilerSeTaxApplies`).get).toBe(false);
    expect(get(g, `/primaryFilerSelfEmploymentTax`).get.toString()).toBe(`0.00`);
    expect(get(g, `/selfEmploymentTax`).get.toString()).toBe(`4238.00`);
    expect(get(g, `/form8959Line13`).get.toString()).toBe(`27705.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEEitc`).get).toBe(false);
    expect(get(g, `/scheduleCNetProfitForEarnedIncome`).get.toString()).toBe(`0.00`);
    expect(get(g, EARNED_INCOME_KO).complete).toBe(true);
    expect(get(g, EARNED_INCOME_KO).get).toBe(false);
  });

  it(`primary owns the K-1: line 9 uses the primary filer's W-2 boxes 3 and 7`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/primaryFilerSeNetEarnings`,
      `/scheduleSELine8a`,
      `/primaryFilerSeRemainingSocialSecurityWageBase`,
      `/primaryFilerSeSocialSecurityTax`,
      `/primaryFilerSeMedicareTax`,
      `/primaryFilerSelfEmploymentTax`,
      `/schedule1Line15`,
      `/secondaryFilerSelfEmploymentTax`,
      `/form8959Line13`,
    ];
    // Line 9 = 184,500 − 170,000 = 14,500. Line 10 = 14,500 × 12.4% = 1,798.00.
    // Line 11 unrounded 803.445, rounded $803. Line 12 unrounded $2,601.445; rounded lines add to $2,601.
    // Line 13 = round(2,601 × 50%) = $1,301. The spouse has no Schedule SE.
    const g = fg({ ...w2(primaryFilerId, 170000), ...k1(`primary`) });
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(g, `/primaryFilerSeNetEarnings`).get.toString()).toBe(`27705.00`);
    expect(get(g, `/primaryFilerOasdiWagesTotal`).get.toString()).toBe(`170000.00`);
    expect(get(g, `/secondaryFilerOasdiWagesTotal`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleSELine8a`).get.toString()).toBe(`170000.00`);
    expect(get(g, `/primaryFilerSeRemainingSocialSecurityWageBase`).get.toString()).toBe(`14500.00`);
    expect(get(g, `/primaryFilerSeSocialSecurityTax`).get.toString()).toBe(`1798.00`);
    expect(get(g, `/primaryFilerSeMedicareTax`).get.toString()).toBe(`803.00`);
    expect(get(g, `/primaryFilerSelfEmploymentTax`).get.toString()).toBe(`2601.00`);
    expect(get(g, `/primaryFilerDeductibleSelfEmploymentTax`).get.toString()).toBe(`1301.00`);
    expect(get(g, `/schedule1Line15`).get.toString()).toBe(`1301.00`);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`0.00`);
    expect(get(g, `/secondaryFilerSeTaxApplies`).get).toBe(false);
    expect(get(g, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`0.00`);
    expect(get(g, `/form8959Line13`).get.toString()).toBe(`27705.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
  });

  it(`a joint return with nonzero code A and no owner stays incomplete, not false`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleEPartIIBox14CodeAMfj`,
      `/primaryFilerSeNetProfit`,
      `/secondaryFilerSeReportedNetProfit`,
      `/scheduleEK1s/*/isComplete`,
    ];
    const g = fg({ ...w2(primaryFilerId, 80000), ...k1(undefined) });
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).complete).toBe(false);
    expect(get(g, `/primaryFilerSeNetProfit`).complete).toBe(false);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).complete).toBe(false);
    expect(get(g, `/scheduleEK1s/#${partnershipId}/isComplete`).complete).toBe(true);
    expect(get(g, `/scheduleEK1s/#${partnershipId}/isComplete`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(false);
  });

  it(`stops when nonzero box 14 code A reaches Schedule SE and the CDCC applies`, ({ task }) => {
    task.meta.testedFactPaths = [
      EARNED_INCOME_KO,
      `/cdccEarnedIncomeLine5`,
      `/secondaryFilerSeReportedNetProfit`,
      `/secondaryFilerSelfEmploymentTax`,
    ];
    // Form 2441 line 5 ignores the K-1, so the spouse's earned income stays $0. The Schedule SE
    // amounts are unchanged. A yes to qualifying expenses stops even when the computed credit is $0.
    const expensesOnly = fg({
      ...w2(primaryFilerId, 80000),
      ...k1(`secondary`),
      '/familyAndHousehold': createCollectionWrapper([]),
      '/writableCdccHasQualifyingExpenses': createBooleanWrapper(true),
    });
    expect(get(expensesOnly, `/ctcQualified`).get).toBe(false);
    expect(get(expensesOnly, `/writableCdccHasQualifyingExpenses`).get).toBe(true);
    expect(get(expensesOnly, EARNED_INCOME_KO).get).toBe(true);
    expect(get(expensesOnly, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(expensesOnly, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(expensesOnly, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`4238.00`);

    const withChildAndCare = fg({ ...w2(primaryFilerId, 80000), ...k1(`secondary`), ...careFor(3000) });
    expect(get(withChildAndCare, `/cdccEarnedIncomeLine5`).get.toString()).toBe(`0.00`);
    expect(get(withChildAndCare, EARNED_INCOME_KO).get).toBe(true);
    expect(get(withChildAndCare, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(withChildAndCare, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(withChildAndCare, `/secondaryFilerSeNetEarnings`).get.toString()).toBe(`27705.00`);
    expect(get(withChildAndCare, `/secondaryFilerSeSocialSecurityTax`).get.toString()).toBe(`3435.00`);
    expect(get(withChildAndCare, `/secondaryFilerSeMedicareTax`).get.toString()).toBe(`803.00`);
    expect(get(withChildAndCare, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`4238.00`);
  });

  it(`stops when nonzero box 14 code A reaches Schedule SE and the ACTC could apply`, ({ task }) => {
    task.meta.testedFactPaths = [EARNED_INCOME_KO, `/ctcQualified`, `/secondaryFilerSeReportedNetProfit`];
    const g = fg({ ...w2(primaryFilerId, 80000), ...k1(`secondary`), ...qualifyingChild });
    expect(get(g, `/cdccQualified`).get).toBe(false);
    expect(get(g, `/writableCdccHasQualifyingExpenses`).get).toBe(false);
    expect(get(g, `/ctcQualified`).get).toBe(true);
    expect(get(g, EARNED_INCOME_KO).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(g, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`4238.00`);
  });

  it(`does not stop when neither the CDCC nor the ACTC applies`, ({ task }) => {
    task.meta.testedFactPaths = [EARNED_INCOME_KO, `/secondaryFilerSeReportedNetProfit`];
    const g = fg({ ...w2(primaryFilerId, 80000), ...k1(`secondary`) });
    expect(get(g, `/cdccQualified`).get).toBe(false);
    expect(get(g, `/ctcQualified`).get).toBe(false);
    expect(get(g, EARNED_INCOME_KO).complete).toBe(true);
    expect(get(g, EARNED_INCOME_KO).get).toBe(false);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`30000.00`);
    expect(get(g, `/secondaryFilerSelfEmploymentTax`).get.toString()).toBe(`4238.00`);
    expect(get(g, `/schedule1Line15`).get.toString()).toBe(`2119.00`);
  });

  it(`does not stop when box 14 code A is $0`, ({ task }) => {
    task.meta.testedFactPaths = [EARNED_INCOME_KO, `/scheduleEK1Box14CodeANonfarmTotal`];
    const g = fg({
      ...w2(primaryFilerId, 80000),
      ...k1(`secondary`, { [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`0`) }),
      ...qualifyingChild,
      ...careFor(3000),
    });
    expect(get(g, `/scheduleEK1Box14CodeANonfarmTotal`).get.toString()).toBe(`0.00`);
    expect(get(g, `/writableCdccHasQualifyingExpenses`).get).toBe(true);
    expect(get(g, EARNED_INCOME_KO).complete).toBe(true);
    expect(get(g, EARNED_INCOME_KO).get).toBe(false);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`0.00`);
  });

  it(`the limited-partner stop still fires on a joint return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // 26 U.S.C. 1402(a)(13). Naming the owner does not lift this stop.
    const g = fg({
      ...w2(primaryFilerId, 80000),
      ...k1(`secondary`, {
        [`/scheduleEK1s/#${partnershipId}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(true),
      }),
    });
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/secondaryFilerSeReportedNetProfit`).get.toString()).toBe(`0.00`);
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
  });
});
