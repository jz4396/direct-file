import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, filerWithRefundDueData, primaryFilerId, uuid } from '../testData.js';

/**
 * Schedule E Part I MVP (#38). Cites live in backend/src/main/resources/tax/scheduleE.xml:
 * Schedule E (2026 draft) lines 3, 4, 20, 21, 26 -> Schedule 1 line 5; 26 U.S.C. 61(a)(5)-(6), 212;
 * knockouts: 469 / 465 / 461(l) (loss), Form 4562 (depreciation), 280A (personal use), 32(i)(2)(C).
 * Part II (#85): line 28 column (k) for domestic partnership or S corporation box 1, material participation.
 * Part III (#85): line 33 column (f) for domestic estate or trust box 6 with material participation.
 * Box 8 is other rental income. 26 U.S.C. 469(c)(2) and 469(c)(4) make it passive, so a nonzero amount
 * is column (d) and stops the return. Part IV is an explicit stop, including a Schedule Q holder who
 * has no Part II income. Line 39 stays incomplete when the answer is yes.
 */
const supported = {
  '/hadScheduleEIncome': createBooleanWrapper(true),
  '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEProvidesSubstantialServices': createBooleanWrapper(false),
  '/scheduleEHasPersonalUse': createBooleanWrapper(false),
  '/scheduleEHasDepreciation': createBooleanWrapper(false),
  '/scheduleEAnyPropertyLoss': createBooleanWrapper(false),
  '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(false),
  '/scheduleEWritableRents': createDollarWrapper(`12000`),
  '/scheduleEWritableRoyalties': createDollarWrapper(`500`),
  '/scheduleEWritableExpenses': createDollarWrapper(`4000`),
};
const fg = (extra: Record<string, unknown> = {}) =>
  setupFactGraph({ ...filerWithRefundDueData, ...extra } as typeof filerWithRefundDueData).factGraph;
const get = (g: ReturnType<typeof fg>, p: string) => g.get(p as ConcretePath);

const partnershipId = `b7e1c2a0-1111-4222-8333-444455556666`;
const sCorpId = `b7e1c2a0-1111-4222-8333-444455556667`;
/** Supported Part II entity: domestic, box 1 only, material participation, every other box zero. */
const k1 = (id: string, box1: string, type: `P` | `S`, extra: Record<string, unknown> = {}) => ({
  [`/scheduleEK1s/#${id}/entityName`]: createStringWrapper(type === `P` ? `Northwind Partners` : `Northwind Inc`),
  [`/scheduleEK1s/#${id}/entityType`]: createEnumWrapper(type, `/scheduleEK1EntityTypeOptions`),
  [`/scheduleEK1s/#${id}/isForeignPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/isPubliclyTradedPartnership`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/isTradingBusiness`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box1`]: createDollarWrapper(box1),
  [`/scheduleEK1s/#${id}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEK1s/#${id}/box14CodeA`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/box14CodeAWasReduced`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box14CodeAIsFarm`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/hasQbiStatement`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/basisComputationRequired`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
  ...extra,
});
const partIIGate = {
  '/hadScheduleEIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
  '/scheduleEPartIILine27': createBooleanWrapper(false),
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
  '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
  '/scheduleEK1sIsDone': createBooleanWrapper(true),
};

describe(`Schedule E Part I MVP (#38)`, () => {
  it(`unanswered K-1 question is incomplete and answered no is not knocked out (#238)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleENetIncome`,
      `/flowKnockoutScheduleEPartII`,
      `/scheduleESectionIsComplete`,
      `/flowIsKnockedOut`,
      `/totalIncome`,
    ];
    const withoutK1: Record<string, unknown> = { ...filerWithRefundDueData };
    delete withoutK1['/scheduleEHasPartIIIncome'];
    const base = setupFactGraph(withoutK1).factGraph;
    const noRental = setupFactGraph({
      ...withoutK1,
      '/hadScheduleEIncome': createBooleanWrapper(false),
    }).factGraph;
    const answeredNo = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
    });
    expect(get(base, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(noRental, `/totalIncome`).get.toString()).toBe(get(base, `/totalIncome`).get.toString());
    // Asked of every filer. While blank the knockout is incomplete, so /flowIsKnockedOut is incomplete and the
    // section is not done. An answered no is complete false.
    for (const g of [base, noRental]) {
      expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).complete).toBe(false);
      expect(get(g, `/scheduleESectionIsComplete`).get).toBe(false);
    }
    expect(get(answeredNo, `/scheduleESectionIsComplete`).get).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleEPartII`).complete).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  it(`supported case: $12,000 rents + $500 royalties - $4,000 expenses = $8,500 to Schedule 1 line 5`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleENetIncome`, `/totalIncome`, `/requiresSchedule1`, `/flowIsKnockedOut`];
    const base = fg();
    const g = fg(supported);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`8500.00`);
    expect(Number(get(g, `/totalIncome`).get.toString())).toBe(Number(get(base, `/totalIncome`).get.toString()) + 8500);
    expect(get(g, `/requiresSchedule1`).get).toBe(true);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
    // filerWithRefundDueData is not EITC-qualified, so the 32(i)(2)(C) knockout stays off.
    expect(get(g, `/flowKnockoutScheduleEEitc`).get).toBe(false);
    // #83: AGI here is $208,500 (single), over the $200,000 §1411(b)(3) threshold
    // (https://www.law.cornell.edu/uscode/text/26/1411). Form 8960 doesn't model Schedule E rents
    // (§1411(c)(1)(A)(i) trade-or-business and passive rules), so the NIIT knockout is the only stop.
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  const cases: [string, string, Record<string, unknown>][] = [
    [
      `net loss (469/465/461(l))`,
      `/flowKnockoutScheduleELoss`,
      { '/scheduleEWritableExpenses': createDollarWrapper(`20000`) },
    ],
    [`loss on one property`, `/flowKnockoutScheduleELoss`, { '/scheduleEAnyPropertyLoss': createBooleanWrapper(true) }],
    [
      `depreciation (Form 4562)`,
      `/flowKnockoutScheduleEDepreciation`,
      { '/scheduleEHasDepreciation': createBooleanWrapper(true) },
    ],
    [
      `personal use (280A)`,
      `/flowKnockoutScheduleEPersonalUse`,
      { '/scheduleEHasPersonalUse': createBooleanWrapper(true) },
    ],
    [
      `substantial services (Schedule C, SE tax)`,
      `/flowKnockoutScheduleESubstantialServices`,
      { '/scheduleEProvidesSubstantialServices': createBooleanWrapper(true) },
    ],
    [
      `rental treated as a trade or business (199A QBI not computed, #185)`,
      `/flowKnockoutScheduleETradeOrBusinessQbi`,
      { '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(true) },
    ],
  ];
  for (const [label, ko, extra] of cases) {
    it(`knocks out ${label} on an otherwise clean return`, ({ task }) => {
      task.meta.testedFactPaths = [ko, `/flowIsKnockedOut`];
      const clean = fg({ ...supported, '/scheduleEWritableRoyalties': createDollarWrapper(`0`) });
      const g = fg({ ...supported, '/scheduleEWritableRoyalties': createDollarWrapper(`0`), ...extra });
      expect(get(clean, ko).get).toBe(false);
      expect(get(g, ko).get).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  }

  it(`#185: trade-or-business question is complete false without Part I income and required with it`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleETradeOrBusinessQbi`, `/scheduleESectionIsComplete`];
    const base = fg();
    const no = fg({ '/hadScheduleEIncome': createBooleanWrapper(false) });
    for (const g of [base, no]) {
      expect(get(g, `/flowKnockoutScheduleETradeOrBusinessQbi`).complete).toBe(true);
      expect(get(g, `/flowKnockoutScheduleETradeOrBusinessQbi`).get).toBe(false);
    }
    const { '/scheduleERentalIsTradeOrBusiness': _omit, ...unanswered } = supported;
    const g = fg(unanswered);
    // An unanswered question never passes: the knockout stays incomplete and the section can't complete.
    expect(get(g, `/flowKnockoutScheduleETradeOrBusinessQbi`).complete).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(false);
    const answeredNo = fg(supported);
    expect(get(answeredNo, `/flowKnockoutScheduleETradeOrBusinessQbi`).complete).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleETradeOrBusinessQbi`).get).toBe(false);
  });

  it(`K-1 yes without details stays incomplete and is not filed as zero (#85)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleENetIncome`,
      `/schedule1Line5`,
      `/scheduleEPartIILine32`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
      `/scheduleESectionIsComplete`,
    ];
    // A yes is not a blanket stop. Line 32 stays incomplete until the entities show the supported path or an
    // out-of-scope fact, so Schedule 1 line 5 is not a silent zero. 2026 draft Schedule E, PDF p. 4, line 41.
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
    });
    expect(get(g, `/hasScheduleEIncome`).get).toBe(false);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIILine32`).complete).toBe(false);
    expect(get(g, `/schedule1Line5`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).complete).toBe(false);
    const section = get(g, `/scheduleESectionIsComplete`);
    expect(Boolean(section.complete && section.get)).toBe(false);
  });

  it(`Schedule C plus K-1 box 14 code A is on line 2 and stops for the QBI split (#84)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      `/flowKnockoutScheduleCQbiAndK1Box14CodeA`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // 2026 draft Schedule SE, PDF p. 2, line 2 adds Schedule C line 31 and nonfarm box 14 code A.
    // 26 U.S.C. 1402(a). Treas. Reg. 1.199A-3(b)(1)(vi) attributes the deductible part of SE tax to each
    // trade. $10,000 gross - $2,000 expenses = $8,000. Box 14 code A $12,000. Line 2 is $20,000. The
    // return stops because that split is not computed.
    const businessId = `a59c03d1-af4a-447f-96aa-d19397048a01`;
    const scheduleC = {
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
      '/qbiIsCooperativePatron': createBooleanWrapper(false),
      '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
      '/hadChurchEmployeeIncome': createBooleanWrapper(false),
      '/usesSeOptionalMethod': createBooleanWrapper(false),
      '/hasMinisterOrSeExemption': createBooleanWrapper(false),
      '/hasNotarySeExclusion': createBooleanWrapper(false),
      '/hadForm8919Wages': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
      '/hadScheduleEIncome': createBooleanWrapper(false),
    };
    const withoutK1 = fg({ ...scheduleC, '/scheduleEHasPartIIIncome': createBooleanWrapper(false) });
    const box14 = k1(partnershipId, `0`, `P`, {
      [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`12000`),
    });
    const withK1 = fg({
      ...scheduleC,
      '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
      '/scheduleEPartIILine27': createBooleanWrapper(false),
      '/scheduleEHasPartIIIIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
      '/scheduleEK1s': createCollectionWrapper([partnershipId]),
      '/scheduleEK1sIsDone': createBooleanWrapper(true),
      ...box14,
    });
    expect(get(withoutK1, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(withoutK1, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(false);
    expect(get(withK1, `/primaryFilerSeNetProfit`).get.toString()).toBe(`20000.00`);
    expect(get(withK1, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(withK1, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(false);
    expect(get(withK1, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`).get).toBe(true);
    expect(get(withK1, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(withK1, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`EITC-qualifying return with rental profit is knocked out (32(i)(2)(C))`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleEEitc`, `/flowIsKnockedOut`];
    const eitcBase = {
      ...Object.fromEntries(Object.entries(baseFilerData).filter(([k]) => !k.startsWith(`/formW2s`))),
      '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1995-01-01`),
      '/eitcQcOfAnother': createBooleanWrapper(false),
      '/eitcHadImproperClaims': createBooleanWrapper(false),
      [`/formW2s/#${uuid}/writableWages`]: createDollarWrapper(`12000`),
      [`/formW2s/#${uuid}/writableFederalWithholding`]: createDollarWrapper(`500`),
    };
    const rental = {
      ...supported,
      '/scheduleEWritableRents': createDollarWrapper(`1500`),
      '/scheduleEWritableRoyalties': createDollarWrapper(`0`),
      '/scheduleEWritableExpenses': createDollarWrapper(`500`),
    };
    const noRental = fg(eitcBase);
    const g = fg({ ...eitcBase, ...rental });
    expect(get(noRental, `/eitcQualified`).get).toBe(true);
    expect(get(noRental, `/flowKnockoutScheduleEEitc`).get).toBe(false);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`1000.00`);
    expect(get(g, `/eitcQualified`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEEitc`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
});

const partIIKnockouts = [
  `/flowKnockoutScheduleEPartII`,
  `/flowKnockoutScheduleEPartIILoss`,
  `/flowKnockoutScheduleEPartIINotMaterialParticipation`,
  `/flowKnockoutScheduleEPartIIBox14CodeA`,
  `/flowKnockoutScheduleEPartIIBox14CodeAReduction`,
  `/flowKnockoutScheduleEPartIIBox14CodeAFarm`,
  `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`,
  `/flowKnockoutScheduleEPartIIBox14CodeAMfj`,
  `/flowKnockoutScheduleCQbiAndK1Box14CodeA`,
  `/flowKnockoutScheduleEPartIIQbiCode`,
  `/flowKnockoutScheduleEPartIIOtherK1Amount`,
  `/flowKnockoutScheduleEPartIIColumnE`,
  `/flowKnockoutScheduleEPartIIColumnF`,
  `/flowKnockoutScheduleEPartIIForeignOrPtp`,
  `/flowKnockoutScheduleEPartIITrading`,
  `/flowKnockoutScheduleEPartIILine27`,
  `/flowKnockoutScheduleEPartIII`,
  `/flowKnockoutScheduleEPartIIILoss`,
  `/flowKnockoutScheduleEPartIIINotMaterialParticipation`,
  `/flowKnockoutScheduleEPartIIIBox5`,
  `/flowKnockoutScheduleEPartIIIBox7`,
  `/flowKnockoutScheduleEPartIIIBox8`,
  `/flowKnockoutScheduleEPartIIIOtherK1Amount`,
  `/flowKnockoutScheduleEPartIIIBasis`,
  `/flowKnockoutScheduleEPartIIIAtRisk`,
  `/flowKnockoutScheduleEPartIII` + `PassiveLoss`,
  `/flowKnockoutScheduleEPartIIIForeign`,
  `/flowKnockoutScheduleEPartIIIInconsistent`,
  `/flowKnockoutScheduleEPartIV`,
  `/flowKnockoutScheduleEPartIIKiddieTax`,
];

describe(`Schedule E Part II ordinary income (#85)`, () => {
  it(`one Form 1065 K-1 box 1 $12,000 with material participation is column (k) and Schedule 1 line 5`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIILine28AColumnK`,
      `/scheduleEPartIILine29aColumnK`,
      `/scheduleEPartIILine30`,
      `/scheduleEPartIILine32`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartII`,
      `/form8960Line4a`,
    ];
    // Schedule E (2026) draft, PDF p. 3, column (k) nonpassive income; line 30 adds columns (h) and (k) of line
    // 29a; line 32 combines lines 30 and 31. PDF p. 4, line 41 goes to Schedule 1 line 5. 26 U.S.C. 702(a)(8).
    const partI = fg(supported);
    const g = fg({
      ...supported,
      ...partIIGate,
      '/hadScheduleEIncome': createBooleanWrapper(true),
      '/scheduleEK1s': createCollectionWrapper([partnershipId]),
      ...k1(partnershipId, `12000`, `P`),
    });
    expect(get(g, `/scheduleEPartIILine28AColumnK`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/scheduleEPartIILine29aColumnK`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/scheduleEPartIILine30`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/scheduleEPartIILine31`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`8500.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`20500.00`);
    expect(Number(get(g, `/totalIncome`).get.toString())).toBe(
      Number(get(partI, `/totalIncome`).get.toString()) + 12000
    );
    expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    // 26 U.S.C. 1411(c)(2): material-participation ordinary income that is not a trading business is not NII.
    expect(get(g, `/form8960Line4a`).get.toString()).toBe(get(partI, `/form8960Line4a`).get.toString());
    // Box 20 code Z / box 17 code V are blank, so Form 8995 line 6 stays zero. Box 14 code A is zero, so
    // Schedule SE line 2 is not increased. 26 U.S.C. 199A(c); 26 U.S.C. 1402(a).
    expect(get(g, `/form8995Line6`).get.toString()).toBe(`0.00`);
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(
      get(partI, `/primaryFilerSeNetProfit`).get.toString()
    );
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`a partnership of $8,000 and an S corporation of $4,500 total $12,500 on lines 30 and 32`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIILine30`, `/scheduleEPartIILine32`, `/schedule1Line5`];
    const g = fg({
      ...partIIGate,
      '/scheduleEK1s': createCollectionWrapper([partnershipId, sCorpId]),
      ...k1(partnershipId, `8000`, `P`),
      ...k1(sCorpId, `4500`, `S`),
    });
    expect(get(g, `/scheduleEPartIILine29aColumnK`).get.toString()).toBe(`12500.00`);
    expect(get(g, `/scheduleEPartIILine30`).get.toString()).toBe(`12500.00`);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`12500.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`12500.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(`0.00`);
  });

  const knockouts: [string, string, Record<string, unknown>][] = [
    [
      `box 1 loss`,
      `/flowKnockoutScheduleEPartIILoss`,
      { [`/scheduleEK1s/#${partnershipId}/box1`]: createDollarWrapper(`-1000`) },
    ],
    [
      `no material participation`,
      `/flowKnockoutScheduleEPartIINotMaterialParticipation`,
      { [`/scheduleEK1s/#${partnershipId}/materiallyParticipates`]: createBooleanWrapper(false) },
    ],
    [
      `box 14 code A reduced by expenses`,
      `/flowKnockoutScheduleEPartIIBox14CodeAReduction`,
      {
        [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`12000`),
        [`/scheduleEK1s/#${partnershipId}/box14CodeAWasReduced`]: createBooleanWrapper(true),
      },
    ],
    [
      `farm box 14 code A or code B`,
      `/flowKnockoutScheduleEPartIIBox14CodeAFarm`,
      { [`/scheduleEK1s/#${partnershipId}/box14CodeAIsFarm`]: createBooleanWrapper(true) },
    ],
    [
      `limited partner amount is not only guaranteed payments`,
      `/flowKnockoutScheduleEPartIIBox14CodeALimitedPartner`,
      {
        [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`12000`),
        [`/scheduleEK1s/#${partnershipId}/box14CodeANotLimitedPartnerAmount`]: createBooleanWrapper(true),
      },
    ],
    [
      `S corporation box 14 code A`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      {
        [`/scheduleEK1s/#${partnershipId}/entityType`]: createEnumWrapper(`S`, `/scheduleEK1EntityTypeOptions`),
        [`/scheduleEK1s/#${partnershipId}/entityName`]: createStringWrapper(`Northwind Inc`),
        [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`12000`),
      },
    ],
    [
      `box 20 code Z`,
      `/flowKnockoutScheduleEPartIIQbiCode`,
      { [`/scheduleEK1s/#${partnershipId}/hasQbiStatement`]: createBooleanWrapper(true) },
    ],
    [
      `S corporation distribution`,
      `/flowKnockoutScheduleEPartIIColumnE`,
      {
        [`/scheduleEK1s/#${partnershipId}/entityType`]: createEnumWrapper(`S`, `/scheduleEK1EntityTypeOptions`),
        [`/scheduleEK1s/#${partnershipId}/basisComputationRequired`]: createBooleanWrapper(true),
      },
    ],
    [`line 27 yes`, `/flowKnockoutScheduleEPartIILine27`, { '/scheduleEPartIILine27': createBooleanWrapper(true) }],
  ];
  for (const [label, ko, extra] of knockouts) {
    it(`knocks out ${label}`, ({ task }) => {
      task.meta.testedFactPaths = [ko, `/flowKnockoutScheduleEPartII`, `/flowIsKnockedOut`];
      const g = fg({
        ...partIIGate,
        '/scheduleEK1s': createCollectionWrapper([partnershipId]),
        ...k1(partnershipId, `12000`, `P`),
        ...extra,
      });
      expect(get(g, ko).complete).toBe(true);
      expect(get(g, ko).get).toBe(true);
      expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  }

  it(`a W-2 return with no Schedule K-1 has every Part II and Part III knockout complete false`, ({ task }) => {
    task.meta.testedFactPaths = partIIKnockouts;
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
    });
    for (const path of partIIKnockouts) {
      expect(get(g, path).complete, path).toBe(true);
      expect(get(g, path).get, path).toBe(false);
    }
  });
});

const estateId = `c8f2d3b1-2222-4333-8444-555566667777`;
const estate2Id = `c8f2d3b1-2222-4333-8444-555566667778`;
/** Supported Part III estate: domestic, box 6 only, material participation. Box 8 is zero. */
const estate = (id: string, box6: string, extra: Record<string, unknown> = {}) => ({
  [`/scheduleEEstates/#${id}/entityName`]: createStringWrapper(`Harbor Trust`),
  [`/scheduleEEstates/#${id}/isForeignBeneficiary`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/isForeignTrust`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/inconsistentTreatment`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/box5`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box6`]: createDollarWrapper(box6),
  [`/scheduleEEstates/#${id}/box7`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box8`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEEstates/#${id}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/basisLimitApplies`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/passiveDeductionOrLoss`]: createBooleanWrapper(false),
  ...extra,
});
const partIIIGate = {
  ...partIIGate,
  '/scheduleEHasPartIIIIncome': createBooleanWrapper(true),
  '/scheduleEEstatesIsDone': createBooleanWrapper(true),
  '/scheduleEK1s': createCollectionWrapper([]),
};
const oneEstate = (box6: string, extra: Record<string, unknown> = {}) => ({
  ...partIIIGate,
  '/scheduleEEstates': createCollectionWrapper([estateId]),
  ...estate(estateId, box6, extra),
});

describe(`Schedule E Part III estates and trusts (#85)`, () => {
  it(`box 6 $9,000 with material participation is column (f) and Schedule 1 line 5`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine33AColumnF`,
      `/scheduleEPartIIILine34aColumnF`,
      `/scheduleEPartIIILine34aColumnD`,
      `/scheduleEPartIIILine35`,
      `/scheduleEPartIIILine36`,
      `/scheduleEPartIIILine37`,
      `/scheduleEPartIILine32`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartII`,
      `/flowKnockoutScheduleEPartIII`,
      `/form8960Line4a`,
    ];
    // Schedule K-1 (Form 1041) (2025) page 2 reports box 6 on Schedule E line 33, column (d) or (f).
    // Material participation (26 U.S.C. 469(h)(1)) puts it in column (f). 2026 draft Schedule E, PDF p. 3,
    // line 35 adds columns (d) and (f); line 37 combines lines 35 and 36. PDF p. 4, line 41 goes to
    // Schedule 1 line 5. 26 U.S.C. 652(a) and 662(a).
    const base = fg();
    const g = fg(oneEstate(`9000`));
    expect(get(g, `/scheduleEPartIIILine33AColumnF`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/scheduleEPartIIILine34aColumnF`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIIILine35`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/scheduleEPartIIILine36`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/scheduleEPartIVLine39`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`0.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`9000.00`);
    expect(Number(get(g, `/totalIncome`).get.toString())).toBe(Number(get(base, `/totalIncome`).get.toString()) + 9000);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIKiddieTax`).get).toBe(false);
    // 26 U.S.C. 1411(c)(2): nonpassive box 6 is not net investment income.
    expect(get(g, `/form8960Line4a`).get.toString()).toBe(get(base, `/form8960Line4a`).get.toString());
    // Box 14 code I stops the return, so box 6 is not qualified business income. 26 U.S.C. 199A.
    // A beneficiary's share is not on Schedule SE. 26 U.S.C. 1402(a).
    expect(get(g, `/form8995Line6`).get.toString()).toBe(`0.00`);
    expect(get(g, `/primaryFilerSeNetProfit`).get.toString()).toBe(
      get(base, `/primaryFilerSeNetProfit`).get.toString()
    );
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`box 6 $4,000 stays in column (f) and box 8 $1,500 is column (d) and stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine33AColumnF`,
      `/scheduleEPartIIILine34aColumnD`,
      `/scheduleEPartIIILine37`,
      `/flowKnockoutScheduleEPartIIIBox8`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowKnockoutScheduleEPartII`,
    ];
    // 26 U.S.C. 469(c)(2): a rental activity is passive. 469(c)(4) applies that rule without regard to
    // material participation. Box 8 is not 469(c)(7) rental real estate professional income.
    const g = fg(oneEstate(`4000`, { [`/scheduleEEstates/#${estateId}/box8`]: createDollarWrapper(`1500`) }));
    expect(get(g, `/scheduleEPartIIILine33AColumnF`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`1500.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`5500.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`5500.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox8`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`two estates of $3,000 and $2,500 total $5,500 on line 37`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIIILine34aColumnF`, `/scheduleEPartIIILine37`];
    const g = fg({
      ...partIIIGate,
      '/scheduleEEstates': createCollectionWrapper([estateId, estate2Id]),
      ...estate(estateId, `3000`),
      ...estate(estate2Id, `2500`),
    });
    expect(get(g, `/scheduleEPartIIILine34aColumnF`).get.toString()).toBe(`5500.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`5500.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`5500.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  it(`Part I $8,500 plus Part III $9,000 is $17,500 on Schedule 1 line 5`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleENetIncome`, `/scheduleEPartIIILine37`, `/schedule1Line5`];
    const g = fg({
      ...supported,
      ...oneEstate(`9000`),
      '/hadScheduleEIncome': createBooleanWrapper(true),
    });
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`8500.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`17500.00`);
  });

  it(`Part II $12,000 plus Part III $9,000 is $21,000 on Schedule 1 line 5`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIILine32`, `/scheduleEPartIIILine37`, `/schedule1Line5`];
    const g = fg({
      ...oneEstate(`9000`),
      '/scheduleEK1s': createCollectionWrapper([partnershipId]),
      ...k1(partnershipId, `12000`, `P`),
    });
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`21000.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
  });

  it(`Part III yes without an estate leaves line 37 incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine37`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowKnockoutScheduleEPartII`,
    ];
    const g = fg(partIIIGate);
    expect(get(g, `/scheduleEPartIIILine37`).complete).toBe(false);
    expect(get(g, `/schedule1Line5`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).complete).toBe(false);
  });

  it(`rounds a half dollar of box 6 up to the next dollar`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIIILine37`];
    // 26 U.S.C. 6102(a): a fractional part of a dollar of one-half or more increases to one dollar.
    const g = fg(oneEstate(`10.50`));
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`11.00`);
  });

  it(`stops a filer under 24 who has line 37 income and does not file jointly`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleEPartIIKiddieTax`, `/flowKnockoutScheduleEPartII`];
    // 26 U.S.C. 1(g). Form 8615 is not computed, so estate or trust income stops the return.
    const g = fg({
      ...oneEstate(`9000`),
      [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`2005-06-06`),
    });
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIKiddieTax`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  const knockouts: [string, string, Record<string, unknown>][] = [
    [
      `box 6 loss`,
      `/flowKnockoutScheduleEPartIIILoss`,
      { [`/scheduleEEstates/#${estateId}/box6`]: createDollarWrapper(`-1000`) },
    ],
    [
      `no material participation`,
      `/flowKnockoutScheduleEPartIIINotMaterialParticipation`,
      { [`/scheduleEEstates/#${estateId}/materiallyParticipates`]: createBooleanWrapper(false) },
    ],
    [
      `box 5 portfolio income`,
      `/flowKnockoutScheduleEPartIIIBox5`,
      { [`/scheduleEEstates/#${estateId}/box5`]: createDollarWrapper(`500`) },
    ],
    [
      `box 7 rental real estate`,
      `/flowKnockoutScheduleEPartIIIBox7`,
      { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`500`) },
    ],
    [
      `box 8 other rental income`,
      `/flowKnockoutScheduleEPartIIIBox8`,
      { [`/scheduleEEstates/#${estateId}/box8`]: createDollarWrapper(`500`) },
    ],
    [
      `another K-1 amount`,
      `/flowKnockoutScheduleEPartIIIOtherK1Amount`,
      { [`/scheduleEEstates/#${estateId}/hasOtherK1Amount`]: createBooleanWrapper(true) },
    ],
    [
      `a basis limit`,
      `/flowKnockoutScheduleEPartIIIBasis`,
      { [`/scheduleEEstates/#${estateId}/basisLimitApplies`]: createBooleanWrapper(true) },
    ],
    [
      `an amount not at risk`,
      `/flowKnockoutScheduleEPartIIIAtRisk`,
      { [`/scheduleEEstates/#${estateId}/anyAmountNotAtRisk`]: createBooleanWrapper(true) },
    ],
    [
      `a passive deduction or loss`,
      `/flowKnockoutScheduleEPartIII` + `PassiveLoss`,
      { [`/scheduleEEstates/#${estateId}/passiveDeductionOrLoss`]: createBooleanWrapper(true) },
    ],
    [
      `a foreign beneficiary`,
      `/flowKnockoutScheduleEPartIIIForeign`,
      { [`/scheduleEEstates/#${estateId}/isForeignBeneficiary`]: createBooleanWrapper(true) },
    ],
    [
      `a foreign trust`,
      `/flowKnockoutScheduleEPartIIIForeign`,
      { [`/scheduleEEstates/#${estateId}/isForeignTrust`]: createBooleanWrapper(true) },
    ],
    [
      `Form 8082 inconsistent treatment`,
      `/flowKnockoutScheduleEPartIIIInconsistent`,
      { [`/scheduleEEstates/#${estateId}/inconsistentTreatment`]: createBooleanWrapper(true) },
    ],
  ];
  for (const [label, ko, extra] of knockouts) {
    it(`knocks out ${label}`, ({ task }) => {
      task.meta.testedFactPaths = [ko, `/flowKnockoutScheduleEPartIII`, `/flowKnockoutScheduleEPartII`];
      const g = fg(oneEstate(`9000`, extra));
      expect(get(g, ko).complete, label).toBe(true);
      expect(get(g, ko).get, label).toBe(true);
      expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
      expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  }

  it(`keeps nonnegative box 5 in column (f) while the return is stopped`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIIILine37`, `/flowKnockoutScheduleEPartIIIBox5`];
    // Schedule K-1 (Form 1041) (2025) page 2 reports box 5 in column (f). 26 U.S.C. 1411(c)(1)(A)(i).
    const g = fg(oneEstate(`9000`, { [`/scheduleEEstates/#${estateId}/box5`]: createDollarWrapper(`500`) }));
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9500.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox5`).get).toBe(true);
  });

  it(`keeps nonnegative box 7 in column (d) while the return is stopped`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine34aColumnD`,
      `/scheduleEPartIIILine37`,
      `/flowKnockoutScheduleEPartIIIBox7`,
    ];
    // 26 U.S.C. 469(c)(2). Schedule E line 43 is not computed.
    const g = fg(oneEstate(`9000`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`500`) }));
    expect(get(g, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`500.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9500.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox7`).get).toBe(true);
  });

  it(`a box 6 loss leaves line 37 incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEPartIIILine37`, `/flowKnockoutScheduleEPartIIILoss`];
    const g = fg(oneEstate(`-1000`));
    expect(get(g, `/scheduleEPartIIILine37`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIILoss`).get).toBe(true);
    expect(get(g, `/schedule1Line5`).complete).toBe(false);
  });

  it(`Part IV yes leaves line 39 incomplete and stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine37`,
      `/scheduleEPartIVLine39`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartIV`,
      `/flowKnockoutScheduleEPartII`,
    ];
    // 2026 draft Schedule E, PDF p. 3, line 39. 26 U.S.C. 860C. Part IV is not computed.
    const g = fg({ ...oneEstate(`9000`), '/scheduleEHasPartIVIncome': createBooleanWrapper(true) });
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`9000.00`);
    expect(get(g, `/scheduleEPartIVLine39`).complete).toBe(false);
    expect(get(g, `/schedule1Line5`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIV`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`a Schedule Q holder with no Part II income stops and does not zero line 39`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleEPartIV`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
      `/scheduleEPartIVLine39`,
      `/schedule1Line5`,
    ];
    // 2026 draft Instructions for Schedule E, PDF p. 14: a residual interest is reported in Part IV from
    // Schedule Q (Form 1066). 26 U.S.C. 860C. The stop does not depend on the K-1 question.
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIVIncome': createBooleanWrapper(true),
    });
    expect(get(g, `/flowKnockoutScheduleEPartIV`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleEPartIVLine39`).complete).toBe(false);
    expect(get(g, `/schedule1Line5`).complete).toBe(false);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
  });
});
