// #118: one Schedule SE per spouse with SE income on a joint return. Hand-computed figures cite:
// - 26 U.S.C. 1402(b)(1), https://www.law.cornell.edu/uscode/text/26/1402#b_1: the OASDI base is reduced by "the amount
//   of the wages paid to such individual", so each spouse's base is reduced only by their own wages
// - 26 U.S.C. 1401(a) 12.4% and (b)(1) 2.9%, https://www.law.cornell.edu/uscode/text/26/1401; 164(f) one-half
// - 2026 draft Schedule SE (https://www.irs.gov/pub/irs-dft/f1040sse--dft.pdf): line 4a "multiply line 3 by 92.35%
//   (0.9235)", line 7 "$184,500", line 10 "Multiply the smaller of line 6 or line 9 by 12.4% (0.124)", line 11
//   "Multiply line 6 by 2.9% (0.029)", line 13 "Multiply line 12 by 50% (0.50)"
// - 2026 draft Instructions for Schedule SE, PDF p. 3: "If both spouses have self-employment income, each must file a
//   separate Schedule SE. ... Enter the combined SE tax on Schedule 2 (Form 1040), line 4."
// - 2026 draft Instructions for Form 8959, PDF p. 5, Line 13: "Combine amounts from this line if you have multiple
//   Schedules SE."
// Each Schedule SE line is rounded to whole dollars, as the fact dictionary does throughout.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';
import { profile5AmtAnd8959 } from '../scenarioTests/goldenProfiles.js';

const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const mfj = {
  ...noW2,
  ...baseFilerData,
  ...mfjFilerData,
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
  '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
  '/formW2s': createCollectionWrapper([]),
};

type Business = { id: string; owner: string; gross: number; expenses?: number };
const businesses = (...list: Business[]) => {
  let out: Record<string, unknown> = {
    '/hadSelfEmploymentIncome': createBooleanWrapper(true),
    '/wantsQbiDeduction': createBooleanWrapper(false),
    '/scheduleCBusinesses': createCollectionWrapper(list.map((b) => b.id)),
    '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  };
  for (const b of list) {
    const p = `/scheduleCBusinesses/#${b.id}`;
    out = {
      ...out,
      [`${p}/filer`]: createCollectionItemWrapper(b.owner),
      [`${p}/businessName`]: createStringWrapper(`Sample Services`),
      [`${p}/writableGrossReceipts`]: createDollarWrapper(`${b.gross}`),
      [`${p}/writableTotalExpenses`]: createDollarWrapper(`${b.expenses ?? 0}`),
    };
  }
  return out;
};

type W2 = { id: string; owner: string; wages: number };
const w2s = (...list: W2[]) => {
  let out: Record<string, unknown> = { '/formW2s': createCollectionWrapper(list.map((w) => w.id)) };
  for (const w of list) {
    const p = `/formW2s/#${w.id}`;
    out = {
      ...out,
      [`${p}/filer`]: createCollectionItemWrapper(w.owner),
      [`${p}/writableWages`]: createDollarWrapper(`${w.wages}`),
      [`${p}/writableOasdiWages`]: createDollarWrapper(`${w.wages}`),
      [`${p}/writableMedicareWages`]: createDollarWrapper(`${w.wages}`),
      [`${p}/writableFederalWithholding`]: createDollarWrapper(`0`),
    };
  }
  return out;
};

const B1 = `e1180000-0000-4000-8000-000000000001`;
const B2 = `e1180000-0000-4000-8000-000000000002`;
const W1 = `e1180000-0000-4000-8000-000000000011`;

const graph = (data: Record<string, unknown>) => {
  const { factGraph } = setupFactGraph(data as Parameters<typeof setupFactGraph>[0]);
  const get = (p: string) => factGraph.get(p as ConcretePath);
  return { get, str: (p: string) => get(p).get.toString() };
};

describe(`Per-spouse Schedule SE (#118)`, () => {
  it(`ordinary return with no Schedule C: SE tax is a complete $0 and the spouse-business knockout is complete and false`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/flowKnockoutScheduleCSpouseBusiness`,
    ];
    const { get, str } = graph(profile5AmtAnd8959);
    expect(get(`/selfEmploymentTax`).complete).toBe(true);
    expect(str(`/selfEmploymentTax`)).toBe(`0.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`0.00`);
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(false);
  });

  it(`primary W-2 $180,000, spouse Schedule C $40,000: the primary's wages leave the spouse's base untouched`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/secondaryFilerSeNetEarnings`,
      `/secondaryFilerSeRemainingSocialSecurityWageBase`,
      `/secondaryFilerSelfEmploymentTax`,
      `/secondaryFilerDeductibleSelfEmploymentTax`,
      `/selfEmploymentTax`,
    ];
    const { get, str } = graph({
      ...mfj,
      ...w2s({ id: W1, owner: primaryFilerId, wages: 180000 }),
      ...businesses({ id: B1, owner: spouseId, gross: 40000 }),
    });
    // Line 4a: 40,000 x 0.9235 = 36,940
    expect(str(`/secondaryFilerSeNetEarnings`)).toBe(`36940.00`);
    // Line 9: 184,500 - 0 (the spouse has no wages of their own)
    expect(str(`/secondaryFilerSeRemainingSocialSecurityWageBase`)).toBe(`184500.00`);
    // Line 10: round(36,940 x 0.124) = round(4,580.56) = 4,581; line 11: round(36,940 x 0.029) = round(1,071.26) = 1,071.
    // Line 12 = 5,652 (36,940 x 15.3% = 5,651.82 before rounding each line).
    expect(str(`/secondaryFilerSeSocialSecurityTax`)).toBe(`4581.00`);
    expect(str(`/secondaryFilerSeMedicareTax`)).toBe(`1071.00`);
    expect(str(`/secondaryFilerSelfEmploymentTax`)).toBe(`5652.00`);
    expect(str(`/secondaryFilerDeductibleSelfEmploymentTax`)).toBe(`2826.00`);
    expect(str(`/primaryFilerSelfEmploymentTax`)).toBe(`0.00`);
    expect(str(`/selfEmploymentTax`)).toBe(`5652.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`2826.00`);
    // A spouse-owned business still stops the return (see the knockout's description).
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(true);
  });

  it(`primary-owned $40,000 business with the primary's own $180,000 wages: base remaining $4,500, SE tax $1,629`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/primaryFilerSeRemainingSocialSecurityWageBase`, `/primaryFilerSelfEmploymentTax`];
    const { get, str } = graph({
      ...mfj,
      ...w2s({ id: W1, owner: primaryFilerId, wages: 180000 }),
      ...businesses({ id: B1, owner: primaryFilerId, gross: 40000 }),
    });
    expect(str(`/primaryFilerSeRemainingSocialSecurityWageBase`)).toBe(`4500.00`);
    // 4,500 x 12.4% = 558; round(36,940 x 2.9%) = 1,071 (1,071.26); total 1,629 (1,629.26 before rounding)
    expect(str(`/primaryFilerSeSocialSecurityTax`)).toBe(`558.00`);
    expect(str(`/primaryFilerSelfEmploymentTax`)).toBe(`1629.00`);
    expect(str(`/selfEmploymentTax`)).toBe(`1629.00`);
    expect(get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(false);
  });

  it(`the spouse's own $180,000 wages reduce only the spouse's base`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/secondaryFilerOasdiWagesTotal`,
      `/secondaryFilerSeRemainingSocialSecurityWageBase`,
      `/secondaryFilerSelfEmploymentTax`,
    ];
    const { str } = graph({
      ...mfj,
      ...w2s({ id: W1, owner: spouseId, wages: 180000 }),
      ...businesses({ id: B1, owner: spouseId, gross: 40000 }),
    });
    expect(str(`/secondaryFilerOasdiWagesTotal`)).toBe(`180000.00`);
    expect(str(`/primaryFilerOasdiWagesTotal`)).toBe(`0.00`);
    expect(str(`/secondaryFilerSeRemainingSocialSecurityWageBase`)).toBe(`4500.00`);
    expect(str(`/secondaryFilerSelfEmploymentTax`)).toBe(`1629.00`);
  });

  it(`both spouses with a Schedule C: two Schedules SE, Schedule 2 line 4 is the sum, Schedule 1 line 15 the sum of halves`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/actcSelfEmploymentAndOtherTaxes`,
    ];
    const { str } = graph({
      ...mfj,
      ...businesses({ id: B1, owner: primaryFilerId, gross: 10000 }, { id: B2, owner: spouseId, gross: 20000 }),
    });
    // Primary: 10,000 x 0.9235 = 9,235; round(1,145.14) = 1,145; round(267.815) = 268; line 12 1,413; line 13
    // round(706.50) = 707
    expect(str(`/primaryFilerSelfEmploymentTax`)).toBe(`1413.00`);
    expect(str(`/primaryFilerDeductibleSelfEmploymentTax`)).toBe(`707.00`);
    // Spouse: 20,000 x 0.9235 = 18,470; round(2,290.28) = 2,290; round(535.63) = 536; line 12 2,826; line 13 1,413
    expect(str(`/secondaryFilerSelfEmploymentTax`)).toBe(`2826.00`);
    expect(str(`/secondaryFilerDeductibleSelfEmploymentTax`)).toBe(`1413.00`);
    // Schedule 2 line 4 = 1,413 + 2,826; Schedule 1 line 15 = 707 + 1,413
    expect(str(`/selfEmploymentTax`)).toBe(`4239.00`);
    expect(str(`/line21OfSchedule2`)).toBe(`4239.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`2120.00`);
    expect(str(`/schedule1Line15`)).toBe(`2120.00`);
    // Schedule 8812 line 22 includes Schedule 1 line 15 as a whole-return figure
    expect(str(`/actcSelfEmploymentAndOtherTaxes`)).toBe(`2120.00`);
    // Form 8959 line 13 combines both Schedules SE line 6: 9,235 + 18,470
    expect(str(`/form8959Line13`)).toBe(`27705.00`);
  });

  it(`a spouse's Schedule C loss doesn't reduce the other spouse's SE income`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCSecondaryFilerNetProfitOrLoss`,
      `/scheduleCPrimaryFilerNetProfitOrLoss`,
      `/form8959Line13`,
    ];
    const { str } = graph({
      ...mfj,
      ...businesses(
        { id: B1, owner: primaryFilerId, gross: 10000 },
        { id: B2, owner: spouseId, gross: 0, expenses: 3000 }
      ),
    });
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`7000.00`);
    expect(str(`/scheduleCPrimaryFilerNetProfitOrLoss`)).toBe(`10000.00`);
    expect(str(`/scheduleCSecondaryFilerNetProfitOrLoss`)).toBe(`-3000.00`);
    expect(str(`/secondaryFilerSelfEmploymentTax`)).toBe(`0.00`);
    expect(str(`/selfEmploymentTax`)).toBe(`1413.00`);
    expect(str(`/form8959Line13`)).toBe(`9235.00`);
  });

  it(`the $400 test is per spouse: a spouse with $300 net profit owes no SE tax`, ({ task }) => {
    task.meta.testedFactPaths = [`/secondaryFilerSeTaxApplies`, `/secondaryFilerSeIncome`];
    const { get, str } = graph({
      ...mfj,
      ...businesses({ id: B1, owner: primaryFilerId, gross: 10000 }, { id: B2, owner: spouseId, gross: 300 }),
    });
    // 300 x 0.9235 = 277 (277.05), under $400
    expect(get(`/secondaryFilerSeTaxApplies`).get).toBe(false);
    expect(str(`/secondaryFilerSeIncome`)).toBe(`0.00`);
    expect(str(`/secondaryFilerSelfEmploymentTax`)).toBe(`0.00`);
    expect(get(`/seTaxApplies`).get).toBe(true);
    expect(str(`/selfEmploymentTax`)).toBe(`1413.00`);
  });
});
