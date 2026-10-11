import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
  createDayWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, filerWithW2NoDeductionsNoCreditsBaseData } from '../testData.js';

/**
 * Schedule C + SE vertical slice proof scenarios.
 * Cites: IRC § 1401, § 164(f); SSA CBB 2026 $184,500; Schedule SE 92.35%.
 * See docs/tax/IMPLEMENTATION-SCHEDULE-C.md
 */
export const primaryFilerId = `959c03d1-af4a-447f-96aa-d19397048a44`;
export const spouseId = `859c03d1-af4a-447f-96aa-d19397048a48`;
const businessId = `a59c03d1-af4a-447f-96aa-d19397048a01`;

/** Minimal complete-return base (no W-2s) so /totalIncome and /totalTax can complete. */
const completeBaseNoW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
  // Schedule D (#4): no capital transactions
  '/form8949Transactions': createCollectionWrapper([]),
};

const baseSingle = {
  [`/filers/#${primaryFilerId}/firstName`]: createStringWrapper(`Test`),
  '/filers': createCollectionWrapper([primaryFilerId, spouseId]),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1987-01-01`),
  [`/filers/#${primaryFilerId}/isBlind`]: createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/isPrimaryFiler`]: createBooleanWrapper(true),
  [`/filers/#${spouseId}/isPrimaryFiler`]: createBooleanWrapper(false),
  '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
  [`/filers/#${primaryFilerId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `555`, group: `55`, serial: `5555` }),
};

describe(`Schedule C + SE tax (TY2026 vertical slice)`, () => {
  it(`Scenario A: $8,000 net → SE tax $1,130 and §164(f) half $565`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCNetProfitOrLoss`,
      `/seNetEarningsFromSelfEmployment`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
    ];
    const { factGraph } = setupFactGraph({
      ...baseSingle,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });

    expect(factGraph.get(`/scheduleCNetProfitOrLoss` as ConcretePath).get.toString()).toBe(`8000.00`);
    // round(8000 * 0.9235) = 7388
    expect(factGraph.get(`/seNetEarningsFromSelfEmployment` as ConcretePath).get.toString()).toBe(`7388.00`);
    // SS round(7388*0.124)=916; Medicare round(7388*0.029)=214; total 1130
    expect(factGraph.get(`/selfEmploymentTax` as ConcretePath).get.toString()).toBe(`1130.00`);
    expect(factGraph.get(`/deductibleSelfEmploymentTax` as ConcretePath).get.toString()).toBe(`565.00`);
  });

  it(`Scenario B: net earnings under $400 → no SE tax`, ({ task }) => {
    task.meta.testedFactPaths = [`/seTaxApplies`, `/selfEmploymentTax`, `/deductibleSelfEmploymentTax`];
    const { factGraph } = setupFactGraph({
      ...baseSingle,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Tiny Gig`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`500`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`200`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    // net 300 → NESE round(277.05)=277 < 400
    expect(factGraph.get(`/seTaxApplies` as ConcretePath).get).toBe(false);
    expect(factGraph.get(`/selfEmploymentTax` as ConcretePath).get.toString()).toBe(`0.00`);
    expect(factGraph.get(`/deductibleSelfEmploymentTax` as ConcretePath).get.toString()).toBe(`0.00`);
  });

  it(`Scenario C: Schedule C loss flows; no SE tax`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCNetProfitOrLoss`, `/selfEmploymentTax`];
    const { factGraph } = setupFactGraph({
      ...baseSingle,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Loss Biz`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`1000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`1500`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/scheduleCNetProfitOrLoss` as ConcretePath).get.toString()).toBe(`-500.00`);
    expect(factGraph.get(`/selfEmploymentTax` as ConcretePath).get.toString()).toBe(`0.00`);
  });

  it(`QBI request with SE income knockouts (explicit non-support)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleCQbi`];
    const { factGraph } = setupFactGraph({
      ...baseSingle,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/flowKnockoutScheduleCQbi` as ConcretePath).get).toBe(true);
  });

  it(`W-2-only: no Schedule C → zero SE tax`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCNetProfitOrLoss`, `/selfEmploymentTax`, `/deductibleSelfEmploymentTax`];
    const { factGraph } = setupFactGraph({
      ...baseSingle,
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    expect(factGraph.get(`/scheduleCNetProfitOrLoss` as ConcretePath).get.toString()).toBe(`0.00`);
    expect(factGraph.get(`/selfEmploymentTax` as ConcretePath).get.toString()).toBe(`0.00`);
    expect(factGraph.get(`/deductibleSelfEmploymentTax` as ConcretePath).get.toString()).toBe(`0.00`);
  });
  it(`Wiring: $60,000 net → Sch 1 line 3, §164(f) adjustment, Sch 2 line 21, Form 1040 line 24`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/totalIncome`,
      `/adjustmentsToIncome`,
      `/agi`,
      `/line21OfSchedule2`,
      `/totalTax`,
      `/earnedIncomeWithAllCombatPay`,
      `/flowKnockoutScheduleCEarnedIncomeCredits`,
    ];
    const { factGraph } = setupFactGraph({
      ...completeBaseNoW2,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Consulting`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`70000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`10000`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    const get = (p: string) => factGraph.get(p as ConcretePath);
    // NESE round(60000 * 0.9235) = 55410; SS round(55410 * 0.124) = 6871; HI round(55410 * 0.029) = 1607
    expect(get(`/selfEmploymentTax`).get.toString()).toBe(`8478.00`);
    expect(get(`/deductibleSelfEmploymentTax`).get.toString()).toBe(`4239.00`);
    // Schedule 1 line 3 → Form 1040 line 8 → total income
    expect(get(`/totalIncome`).get.toString()).toBe(`60000.00`);
    expect(get(`/totalIncome`).complete).toBe(true);
    // Schedule 1 line 15 (§164(f)) → adjustments → AGI
    expect(get(`/adjustmentsToIncome`).get.toString()).toBe(`4239.00`);
    expect(get(`/agi`).get.toString()).toBe(`55761.00`);
    // Schedule 2 line 21 → Form 1040 line 23 → line 24
    expect(get(`/line21OfSchedule2`).get.toString()).toBe(`8478.00`);
    const incomeTaxAfterCredits = Number(get(`/taxLessNonRefundableCredits`).get.toString());
    expect(Number(get(`/totalTax`).get.toString())).toBe(incomeTaxAfterCredits + 8478);
    expect(get(`/totalTax`).complete).toBe(true);
    // ACTC earned income (Sch 8812 line 18a): net profit − deductible SE tax
    expect(get(`/earnedIncomeWithAllCombatPay`).get.toString()).toBe(`55761.00`);
    // Single, no children, AGI above EITC limit → no knockout
    expect(get(`/flowKnockoutScheduleCEarnedIncomeCredits`).get).toBe(false);
  });

  it(`EITC-eligible gig filer is knocked out (EITC SE earned income not wired yet)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleCEarnedIncomeCredits`];
    const { factGraph } = setupFactGraph({
      ...completeBaseNoW2,
      ...baseFilerData,
      '/formW2s': createCollectionWrapper([]),
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1995-01-01`),
      '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
      '/eitcQcOfAnother': createBooleanWrapper(false),
      '/eitcHadImproperClaims': createBooleanWrapper(false),
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    const eitcQualified = factGraph.get(`/eitcQualified` as ConcretePath);
    const knockout = factGraph.get(`/flowKnockoutScheduleCEarnedIncomeCredits` as ConcretePath);
    expect(eitcQualified.get).toBe(true);
    expect(knockout.get).toBe(true);
  });

  it(`Unset collection: "no" → $0 complete; "yes" with no businesses → incomplete (no silent zero)`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCNetProfitOrLoss`];
    const no = setupFactGraph({ ...baseSingle, '/hadSelfEmploymentIncome': createBooleanWrapper(false) }).factGraph;
    expect(no.get(`/scheduleCNetProfitOrLoss` as ConcretePath).complete).toBe(true);
    expect(no.get(`/scheduleCNetProfitOrLoss` as ConcretePath).get.toString()).toBe(`0.00`);
    const yes = setupFactGraph({ ...baseSingle, '/hadSelfEmploymentIncome': createBooleanWrapper(true) }).factGraph;
    expect(yes.get(`/scheduleCNetProfitOrLoss` as ConcretePath).complete).toBe(false);
  });
  it(`Spouse-owned business is knocked out (per-spouse Schedule SE not supported)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleCSpouseBusiness`];
    const mk = (owner: string) =>
      setupFactGraph({
        ...baseSingle,
        '/filingStatus': createEnumWrapper(`marriedFilingJointly`, `/filingStatusOptions`),
        '/hadSelfEmploymentIncome': createBooleanWrapper(true),
        '/wantsQbiDeduction': createBooleanWrapper(false),
        '/scheduleCBusinesses': createCollectionWrapper([businessId]),
        [`/scheduleCBusinesses/#${businessId}/filer`]: createCollectionItemWrapper(owner),
        [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Biz`),
        [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`5000`),
        [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`0`),
        '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
      }).factGraph;
    expect(mk(spouseId).get(`/flowKnockoutScheduleCSpouseBusiness` as ConcretePath).get).toBe(true);
    expect(mk(primaryFilerId).get(`/flowKnockoutScheduleCSpouseBusiness` as ConcretePath).get).toBe(false);
  });
});
