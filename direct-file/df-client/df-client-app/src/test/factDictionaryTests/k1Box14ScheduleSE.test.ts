import { describe, it, expect } from 'vitest';
import flowNodes from '../../flow/flow.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData, mfjFilerData, mfsFilerData } from '../testData.js';

/**
 * Schedule SE line 2 includes nonfarm Schedule K-1 (Form 1065) box 14 code A. #84.
 * 26 U.S.C. 1402(a), 1402(a)(12), 1402(a)(13), 1402(b)(2), and 164(f)(1)
 * (https://www.law.cornell.edu/uscode/text/26/1402).
 * 2026 draft Schedule SE, line 2: net profit or (loss) from Schedule C line 31 and box 14 code A
 * (other than farming). 2026 draft Instructions for Schedule SE, PDF p. 5: partners include that
 * amount on line 1a or line 2; limited partners include only guaranteed payments for services; a
 * reduction needs an attached explanation.
 * Treas. Reg. 1.199A-3(b)(1)(vi) (https://www.law.cornell.edu/cfr/text/26/1.199A-3).
 */
const partnershipId = `b7e1c2a0-1111-4222-8333-444455556666`;
const secondId = `b7e1c2a0-1111-4222-8333-444455556667`;
const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
  '/hadSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadScheduleEIncome': createBooleanWrapper(false),
};
const seQuestions = [
  `/hadFarmSelfEmploymentIncome`,
  `/hadChurchEmployeeIncome`,
  `/usesSeOptionalMethod`,
  `/hasMinisterOrSeExemption`,
  `/hasNotarySeExclusion`,
  `/hadForm8919Wages`,
] as const;

const k1 = (id: string, box14: string, extra: Record<string, unknown> = {}) => ({
  [`/scheduleEK1s/#${id}/entityName`]: createStringWrapper(`Northwind Partners`),
  [`/scheduleEK1s/#${id}/entityType`]: createEnumWrapper(`P`, `/scheduleEK1EntityTypeOptions`),
  [`/scheduleEK1s/#${id}/isForeignPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/isPubliclyTradedPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/isTradingBusiness`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box1`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEK1s/#${id}/box14CodeA`]: createDollarWrapper(box14),
  [`/scheduleEK1s/#${id}/box14CodeAWasReduced`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box14CodeAIsFarm`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/hasQbiStatement`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/basisComputationRequired`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
  ...extra,
});

const partII = (ids: string[], rows: Record<string, unknown>) => ({
  '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
  '/scheduleEPartIILine27': createBooleanWrapper(false),
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEK1s': createCollectionWrapper(ids),
  '/scheduleEK1sIsDone': createBooleanWrapper(true),
  ...rows,
});

const fg = (extra: Record<string, unknown>) => setupFactGraph({ ...noW2, ...extra }).factGraph;
const get = (g: ReturnType<typeof fg>, p: string) => g.get(p as ConcretePath);

describe(`Schedule SE line 2 from Form 1065 box 14 code A (#84)`, () => {
  it(`single filer: box 14 code A $8,000 is line 2, NESE $7,388, SE tax $1,130`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/primaryFilerSeNetEarnings`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      `/flowKnockoutScheduleEPartII`,
      `/flowKnockoutScheduleCQbiAndK1Box14CodeA`,
      `/scheduleESectionIsComplete`,
    ];
    // round(8,000 × 0.9235) = 7,388. 26 U.S.C. 1402(a)(12).
    // round(7,388 × 0.124) = 916; round(7,388 × 0.029) = 214; total 1,130. 26 U.S.C. 1401(a), 1401(b)(1).
    // round(1,130 × 50%) = 565. 26 U.S.C. 164(f)(1).
    const g = fg(partII([partnershipId], k1(partnershipId, `8000`)));
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(g, `/scheduleEK1Box14CodeANonfarmTotal`).get.toString()).toBe(`8000.00`);
    expect(get(g, `/primaryFilerSeNetEarnings`).get.toString()).toBe(`7388.00`);
    expect(get(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    expect(get(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`565.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAReduction`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAFarm`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`a loss and a second partnership combine on line 2`, ({ task }) => {
    task.meta.testedFactPaths = [`/primaryFilerSeNetProfit`, `/selfEmploymentTax`, `/primaryFilerSeNetEarnings`];
    // 10,000 + (2,000) = 8,000. Line 2 is net profit or (loss). Same SE tax as $8,000 alone.
    const g = fg(partII([partnershipId, secondId], { ...k1(partnershipId, `10000`), ...k1(secondId, `-2000`) }));
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    const lossOnly = fg(partII([partnershipId], k1(partnershipId, `-500`)));
    // Line 3 is not more than zero, so line 4a is $0 and there is no SE tax. 26 U.S.C. 1402(b)(2).
    expect(get(lossOnly, `/primaryFilerSeNetProfit`).get.toString()).toBe(`-500.00`);
    expect(get(lossOnly, `/primaryFilerSeNetEarnings`).get.toString()).toBe(`0.00`);
    expect(get(lossOnly, `/selfEmploymentTax`).get.toString()).toBe(`0.00`);
    expect(get(lossOnly, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  it(`married filing separately uses line 2; a joint return stops`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/flowKnockoutScheduleEPartIIBox14CodeAMfj`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      `/flowKnockoutScheduleEPartII`,
    ];
    // 2026 draft Instructions for Schedule SE, PDF p. 3: each spouse files a separate Schedule SE.
    // The K-1 row does not record which spouse holds the interest. 26 U.S.C. 1402(b).
    const rows = partII([partnershipId], k1(partnershipId, `8000`));
    const separate = fg({ ...mfsFilerData, ...rows });
    expect(get(separate, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(separate, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
    const joint = fg({ ...mfjFilerData, ...rows });
    expect(get(joint, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
    expect(get(joint, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).complete).toBe(true);
    expect(get(joint, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(true);
    expect(get(joint, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(true);
    expect(get(joint, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(joint, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`a joint return with box 14 code A at zero does not stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleEPartIIBox14CodeAMfj`, `/primaryFilerSeNetProfit`];
    const g = fg({ ...mfjFilerData, ...partII([partnershipId], k1(partnershipId, `0`)) });
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeAMfj`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  const stops: [string, string, Record<string, unknown>][] = [
    [
      `reduction`,
      `/flowKnockoutScheduleEPartIIBox14CodeAReduction`,
      { [`/scheduleEK1s/#${partnershipId}/box14CodeAWasReduced`]: createBooleanWrapper(true) },
    ],
    [
      `farming`,
      `/flowKnockoutScheduleEPartIIBox14CodeAFarm`,
      { [`/scheduleEK1s/#${partnershipId}/box14CodeAIsFarm`]: createBooleanWrapper(true) },
    ],
    [
      `limited partner`,
      `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`,
      { [`/scheduleEK1s/#${partnershipId}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(true) },
    ],
  ];
  for (const [label, ko, extra] of stops) {
    it(`stops when the filer reports ${label}`, ({ task }) => {
      task.meta.testedFactPaths = [ko, `/primaryFilerSeNetProfit`, `/flowKnockoutScheduleEPartIIBox14CodeA`];
      const g = fg(partII([partnershipId], k1(partnershipId, `8000`, extra)));
      expect(get(g, ko).complete).toBe(true);
      expect(get(g, ko).get).toBe(true);
      expect(get(g, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(true);
      expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  }

  it(`Schedule C qualified business income with box 14 code A stops; a zero code A does not`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleCQbiAndK1Box14CodeA`,
      `/primaryFilerSeNetProfit`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
    ];
    // Treas. Reg. 1.199A-3(b)(1)(vi). Line 2 is still Schedule C line 31 plus code A.
    // Schedule C loss (500) plus code A 8,000 is line 2 of 7,500, and the return stops.
    const businessId = `a59c03d1-af4a-447f-96aa-d19397048a01`;
    const scheduleC = {
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
      '/qbiIsCooperativePatron': createBooleanWrapper(false),
      ...Object.fromEntries(seQuestions.map((path) => [path, createBooleanWrapper(false)])),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`1000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`1500`),
      [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    };
    const both = fg({ ...scheduleC, ...partII([partnershipId], k1(partnershipId, `8000`)) });
    expect(get(both, `/primaryFilerSeNetProfit`).get.toString()).toBe(`7500.00`);
    expect(get(both, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(false);
    expect(get(both, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(true);
    expect(get(both, `/flowIsKnockedOut`).get).toBe(true);
    const zeroCodeA = fg({ ...scheduleC, ...partII([partnershipId], k1(partnershipId, `0`)) });
    expect(get(zeroCodeA, `/primaryFilerSeNetProfit`).get.toString()).toBe(`-500.00`);
    expect(get(zeroCodeA, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(false);
  });

  it(`a yes with no K-1 list leaves line 2 at Schedule C and does not stop for the QBI split`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/scheduleEK1Box14CodeANonfarmTotal`,
      `/flowKnockoutScheduleCQbiAndK1Box14CodeA`,
      `/selfEmploymentTax`,
    ];
    // The K-1 list is not started, so there is no box 14 code A to add. 26 U.S.C. 1402(a).
    const businessId = `a59c03d1-af4a-447f-96aa-d19397048a01`;
    const scheduleC = {
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
      '/qbiIsCooperativePatron': createBooleanWrapper(false),
      ...Object.fromEntries(seQuestions.map((path) => [path, createBooleanWrapper(false)])),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    };
    const onlyC = fg(scheduleC);
    const openList = fg({
      ...scheduleC,
      '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
    });
    expect(get(onlyC, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(openList, `/scheduleEK1Box14CodeANonfarmTotal`).complete).toBe(true);
    expect(get(openList, `/scheduleEK1Box14CodeANonfarmTotal`).get.toString()).toBe(`0.00`);
    expect(get(openList, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(openList, `/selfEmploymentTax`).get.toString()).toBe(get(onlyC, `/selfEmploymentTax`).get.toString());
    expect(get(openList, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).complete).toBe(true);
    expect(get(openList, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(false);
    expect(get(openList, `/flowKnockoutScheduleEPartII`).complete).toBe(false);
  });

  it(`church, minister, optional method, and Form 8919 stops still apply`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleSEOutOfScope`];
    // 26 U.S.C. 1402(a)(8), 1402(a)(14), 1402(c)(4), 1402(e), 1402(g), 1402(j), 1402(l).
    const rows = partII([partnershipId], k1(partnershipId, `8000`));
    for (const path of seQuestions) {
      const g = fg({
        ...rows,
        '/hadSelfEmploymentIncome': createBooleanWrapper(true),
        ...Object.fromEntries(seQuestions.map((q) => [q, createBooleanWrapper(q === path)])),
      });
      expect(get(g, `/flowKnockoutScheduleSEOutOfScope`).complete, path).toBe(true);
      expect(get(g, `/flowKnockoutScheduleSEOutOfScope`).get, path).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get, path).toBe(true);
    }
  });

  it(`a K-1-only filer is asked the Schedule SE stops and each yes stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleSEOutOfScopeQuestionsApply`,
      `/flowKnockoutScheduleSEOutOfScope`,
      `/primaryFilerSeNetProfit`,
    ];
    // 26 U.S.C. 1402(a). Box 14 code A is net earnings even when there is no Schedule C.
    const rows = partII([partnershipId], k1(partnershipId, `8000`));
    const answeredNo = fg({
      ...rows,
      ...Object.fromEntries(seQuestions.map((q) => [q, createBooleanWrapper(false)])),
    });
    expect(get(answeredNo, `/hadSelfEmploymentIncome`).get).toBe(false);
    expect(get(answeredNo, `/scheduleSEOutOfScopeQuestionsApply`).get).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleSEOutOfScope`).get).toBe(false);
    expect(get(answeredNo, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(answeredNo, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    const screens = createFlowConfig(flowNodes);
    for (const route of [
      `schedule-c-farm`,
      `schedule-c-church-employee`,
      `schedule-c-optional-method`,
      `schedule-c-minister`,
      `schedule-c-notary`,
      `schedule-c-form-8919`,
    ]) {
      expect(screens.screensByRoute.get(`/flow/income/schedule-c/${route}`)?.conditions).toEqual([
        `/scheduleSEOutOfScopeQuestionsApply`,
      ]);
    }
    for (const path of seQuestions) {
      const g = fg({
        ...rows,
        ...Object.fromEntries(seQuestions.map((q) => [q, createBooleanWrapper(q === path)])),
      });
      expect(get(g, `/hadSelfEmploymentIncome`).get, path).toBe(false);
      expect(get(g, `/scheduleSEOutOfScopeQuestionsApply`).get, path).toBe(true);
      expect(get(g, `/flowKnockoutScheduleSEOutOfScope`).get, path).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get, path).toBe(true);
    }
    const open = fg(rows);
    expect(get(open, `/flowKnockoutScheduleSEOutOfScope`).complete).toBe(false);
    const zero = fg(partII([partnershipId], k1(partnershipId, `0`)));
    expect(get(zero, `/scheduleSEOutOfScopeQuestionsApply`).get).toBe(false);
    expect(get(zero, `/flowKnockoutScheduleSEOutOfScope`).get).toBe(false);
  });
});
