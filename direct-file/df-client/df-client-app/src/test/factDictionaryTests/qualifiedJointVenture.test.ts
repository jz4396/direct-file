// Qualified joint venture, 26 U.S.C. 761(f)(1)–(2), https://www.law.cornell.edu/uscode/text/26/761#f.
// 2026 Instructions for Schedule C draft (https://www.irs.gov/pub/irs-dft/i1040sc--dft.pdf, SHA-256
// 27a6e185504f442c363b2d659a33cfc61613b669025cb2bd3de2ec81599009f9, Oct 8, 2026), "Qualified Joint Venture"
// (PDF p. 2): each spouse files a separate Schedule C for their share. The election does not change the
// self-employment tax (PDF p. 3). Each Schedule SE line is rounded half up to whole dollars, as in #345.
//
// Per spouse on line 31 $20,000: line 4a 20,000 × 0.9235 = $18,470. Before rounding, SE tax is
// 18,470 × 0.153 = $2,825.91. The module rounds each line: round(18,470 × 0.124) = round(2,290.28) = 2,290
// and round(18,470 × 0.029) = round(535.63) = 536, so line 12 is $2,826 and line 13 is $1,413.
// Combined SE tax $5,652 and the deduction $2,826 match the single-owner $40,000 case
// (36,940 × 0.153 = $5,651.82 before the same per-line rounding: round(4,580.56) = 4,581 and
// round(1,071.26) = 1,071, line 12 $5,652, line 13 $2,826). AGI with no other income is 40,000 − 2,826 = 37,174.
import { describe, it, expect } from 'vitest';
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
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';

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

const B1 = `e7610000-0000-4000-8000-000000000001`;
const B2 = `e7610000-0000-4000-8000-000000000002`;
const B3 = `e7610000-0000-4000-8000-000000000003`;

type Business = { id: string; owner: string; gross: number; expenses?: number; participates?: boolean };

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
      [`${p}/materiallyParticipates`]: createBooleanWrapper(b.participates ?? true),
    };
  }
  return out;
};

/** Schedule SE and Form 8995 questions answered so /agi can complete. Group-00 test SSNs. Florida. */
const ready = () => ({
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadChurchEmployeeIncome': createBooleanWrapper(false),
  '/hadSecondaryFilerChurchEmployeeIncome': createBooleanWrapper(false),
  '/usesSeOptionalMethod': createBooleanWrapper(false),
  '/hasMinisterOrSeExemption': createBooleanWrapper(false),
  '/hasNotarySeExclusion': createBooleanWrapper(false),
  '/hadForm8919Wages': createBooleanWrapper(false),
  '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(false),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `0001` }),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `0002` }),
});

const graph = (data: Record<string, unknown>) => {
  const { factGraph } = setupFactGraph(data as Parameters<typeof setupFactGraph>[0]);
  const get = (p: string) => factGraph.get(p as ConcretePath);
  return { get, str: (p: string) => get(p).get.toString() };
};

const share = (id: string, owner: string, participates = true): Business => ({
  id,
  owner,
  gross: 30000,
  expenses: 10000,
  participates,
});

const election = {
  '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(true),
  '/scheduleCQjvSpousesAreOnlyOwners': createBooleanWrapper(true),
  '/scheduleCQjvHeldThroughLlc': createBooleanWrapper(false),
};

const assertSpouseSe = (str: (p: string) => string, who: 'primaryFiler' | 'secondaryFiler') => {
  expect(str(`/${who}SeReportedLine4a`)).toBe(`18470.00`);
  expect(str(`/${who}SeSocialSecurityTax`)).toBe(`2290.00`);
  expect(str(`/${who}SeMedicareTax`)).toBe(`536.00`);
  expect(str(`/${who}SelfEmploymentTax`)).toBe(`2826.00`);
  expect(str(`/${who}DeductibleSelfEmploymentTax`)).toBe(`1413.00`);
};

const assertShareLines = (str: (p: string) => string, id: string) => {
  const p = `/scheduleCBusinesses/#${id}`;
  expect(str(`${p}/line1GrossReceipts`)).toBe(`30000.00`);
  expect(str(`${p}/totalExpenses`)).toBe(`10000.00`);
  expect(str(`${p}/netProfitOrLoss`)).toBe(`20000.00`);
};

describe(`Qualified joint venture (#84)`, () => {
  it(`MFJ 50/50 shares: each Schedule C and each Schedule SE, matching the single-owner $40,000 case`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCNetProfitOrLoss`,
      `/primaryFilerSelfEmploymentTax`,
      `/secondaryFilerSelfEmploymentTax`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/agi`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
    ];
    const { get, str } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
      ...election,
    });
    assertShareLines(str, B1);
    assertShareLines(str, B2);
    assertSpouseSe(str, `primaryFiler`);
    assertSpouseSe(str, `secondaryFiler`);
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(`40000.00`);
    expect(str(`/schedule1Line3`)).toBe(`40000.00`);
    expect(str(`/selfEmploymentTax`)).toBe(`5652.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`2826.00`);
    expect(str(`/schedule1Line15`)).toBe(`2826.00`);
    expect(str(`/agi`)).toBe(`37174.00`);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonNotJointReturn`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonSecondBusiness`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonNotOneEach`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonMaterialParticipation`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonNotOnlyOwners`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonLlc`).get).toBe(false);
    expect(get(`/scheduleCQjvReasonCommunityProperty`).get).toBe(false);

    const singleOwner = graph({
      ...mfj,
      ...ready(),
      ...businesses({ id: B1, owner: primaryFilerId, gross: 60000, expenses: 20000 }),
    });
    expect(singleOwner.str(`/scheduleCBusinesses/#${B1}/netProfitOrLoss`)).toBe(`40000.00`);
    expect(singleOwner.str(`/primaryFilerSeReportedLine4a`)).toBe(`36940.00`);
    expect(singleOwner.str(`/primaryFilerSeSocialSecurityTax`)).toBe(`4581.00`);
    expect(singleOwner.str(`/primaryFilerSeMedicareTax`)).toBe(`1071.00`);
    expect(singleOwner.str(`/primaryFilerSelfEmploymentTax`)).toBe(`5652.00`);
    expect(singleOwner.str(`/primaryFilerDeductibleSelfEmploymentTax`)).toBe(`2826.00`);
    expect(singleOwner.str(`/secondaryFilerSelfEmploymentTax`)).toBe(`0.00`);
    expect(singleOwner.str(`/schedule1Line3`)).toBe(`40000.00`);
    expect(singleOwner.str(`/selfEmploymentTax`)).toBe(`5652.00`);
    expect(singleOwner.str(`/deductibleSelfEmploymentTax`)).toBe(`2826.00`);
    expect(singleOwner.str(`/agi`)).toBe(`37174.00`);
    expect(singleOwner.str(`/selfEmploymentTax`)).toBe(str(`/selfEmploymentTax`));
    expect(singleOwner.str(`/deductibleSelfEmploymentTax`)).toBe(str(`/deductibleSelfEmploymentTax`));
    expect(singleOwner.str(`/agi`)).toBe(str(`/agi`));
  });

  it(`without the election, the same two shares keep the #345 amounts and the knockout stays false`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCNetProfitOrLoss`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/agi`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
    ];
    const { get, str } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
    });
    assertShareLines(str, B1);
    assertShareLines(str, B2);
    assertSpouseSe(str, `primaryFiler`);
    assertSpouseSe(str, `secondaryFiler`);
    expect(str(`/schedule1Line3`)).toBe(`40000.00`);
    expect(str(`/selfEmploymentTax`)).toBe(`5652.00`);
    expect(str(`/deductibleSelfEmploymentTax`)).toBe(`2826.00`);
    expect(str(`/agi`)).toBe(`37174.00`);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(false);
    expect(get(`/scheduleCQualifiedJointVentureAnswered`).get).toBe(true);
  });

  it(`an unanswered election is not a stop, and unanswered follow-ups stay incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleCQualifiedJointVenture`,
      `/scheduleCQualifiedJointVentureAnswered`,
    ];
    const bare = graph(
      Object.fromEntries(
        Object.entries({
          ...mfj,
          ...ready(),
          ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
        }).filter(([k]) => k !== `/scheduleCIsQualifiedJointVenture`)
      )
    );
    expect(bare.get(`/flowKnockoutScheduleCQualifiedJointVenture`).complete).toBe(true);
    expect(bare.get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(false);
    expect(bare.get(`/scheduleCQualifiedJointVentureAnswered`).get).toBe(false);

    const followUpsOpen = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
      '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(true),
    });
    expect(followUpsOpen.get(`/scheduleCQjvHasOneEach`).get).toBe(true);
    expect(followUpsOpen.get(`/flowKnockoutScheduleCQualifiedJointVenture`).complete).toBe(false);
    expect(followUpsOpen.get(`/scheduleCQualifiedJointVentureAnswered`).get).toBe(false);
  });

  it(`QJV yes on a single return stops because it is not a joint return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCQjvReasonNotJointReturn`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
    ];
    const { get } = graph({
      ...mfj,
      ...ready(),
      ...businesses({ id: B1, owner: primaryFilerId, gross: 30000, expenses: 10000 }),
      '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
      '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(true),
    });
    expect(get(`/scheduleCQjvReasonNotJointReturn`).get).toBe(true);
    expect(get(`/scheduleCQjvReasonSecondBusiness`).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });

  it(`QJV yes with the LLC yes stops`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCQjvReasonLlc`, `/flowKnockoutScheduleCQualifiedJointVenture`];
    const { get } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
      ...election,
      '/scheduleCQjvHeldThroughLlc': createBooleanWrapper(true),
    });
    expect(get(`/scheduleCQjvReasonLlc`).get).toBe(true);
    expect(get(`/scheduleCQjvReasonNotOnlyOwners`).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });

  it(`QJV yes when the spouses are not the only owners stops`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCQjvReasonNotOnlyOwners`, `/flowKnockoutScheduleCQualifiedJointVenture`];
    const { get } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
      ...election,
      '/scheduleCQjvSpousesAreOnlyOwners': createBooleanWrapper(false),
    });
    expect(get(`/scheduleCQjvReasonNotOnlyOwners`).get).toBe(true);
    expect(get(`/scheduleCQjvReasonLlc`).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });

  it(`spouse line G no stops`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCQjvReasonMaterialParticipation`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
    ];
    const { get } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId, true), share(B2, spouseId, false)),
      ...election,
    });
    expect(get(`/scheduleCQjvReasonMaterialParticipation`).complete).toBe(true);
    expect(get(`/scheduleCQjvReasonMaterialParticipation`).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });

  it(`a second business on either side stops`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleCQjvReasonSecondBusiness`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
      `/flowKnockoutScheduleCSpouseBusiness`,
    ];
    const primarySide = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B3, primaryFilerId), share(B2, spouseId)),
      '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(true),
    });
    expect(primarySide.get(`/scheduleCQjvReasonSecondBusiness`).get).toBe(true);
    expect(primarySide.get(`/scheduleCQjvReasonNotOneEach`).get).toBe(false);
    expect(primarySide.get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);

    const spouseSide = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId), share(B3, spouseId)),
      '/scheduleCIsQualifiedJointVenture': createBooleanWrapper(true),
    });
    expect(spouseSide.get(`/scheduleCQjvReasonSecondBusiness`).get).toBe(true);
    expect(spouseSide.get(`/flowKnockoutScheduleCSpouseBusiness`).get).toBe(true);
    expect(spouseSide.get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });

  it(`a California joint return stops on the existing community-property fact and the QJV reason`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleCCommunityProperty`,
      `/scheduleCQjvReasonCommunityProperty`,
      `/flowKnockoutScheduleCQualifiedJointVenture`,
    ];
    const { get } = graph({
      ...mfj,
      ...ready(),
      ...businesses(share(B1, primaryFilerId), share(B2, spouseId)),
      ...election,
      '/filerResidenceAndIncomeState': createEnumWrapper(`ca`, `/scopedStateOptions`),
    });
    expect(get(`/flowKnockoutScheduleCCommunityProperty`).get).toBe(true);
    expect(get(`/scheduleCQjvReasonCommunityProperty`).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCQualifiedJointVenture`).get).toBe(true);
  });
});
