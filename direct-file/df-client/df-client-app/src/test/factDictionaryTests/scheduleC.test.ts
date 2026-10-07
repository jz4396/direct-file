import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
  createDayWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';

/**
 * Schedule C + SE vertical slice proof scenarios.
 * Cites: IRC § 1401, § 164(f); SSA CBB 2026 $184,500; Schedule SE 92.35%.
 * See docs/tax/IMPLEMENTATION-SCHEDULE-C.md
 */
export const primaryFilerId = `959c03d1-af4a-447f-96aa-d19397048a44`;
export const spouseId = `859c03d1-af4a-447f-96aa-d19397048a48`;
const businessId = `a59c03d1-af4a-447f-96aa-d19397048a01`;

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
});
