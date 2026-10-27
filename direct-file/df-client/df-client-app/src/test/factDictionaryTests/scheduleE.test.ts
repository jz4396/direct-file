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
 */
const supported = {
  '/hadScheduleEIncome': createBooleanWrapper(true),
  '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
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

  it(`Schedule SE line 2 stays Schedule C only when K-1 box 14 code A applies (#238)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/primaryFilerSeNetProfit`,
      `/selfEmploymentTax`,
      `/scheduleENetIncome`,
      `/flowKnockoutScheduleEPartII`,
    ];
    // 2026 draft Schedule SE, PDF p. 2, line 2: "Net profit or (loss) from Schedule C, line 31; and Schedule
    // K-1 (Form 1065), box 14, code A (other than farming)". Line 1a is the farm amount. 26 U.S.C. 1402(a).
    // $10,000 gross - $2,000 expenses = $8,000 on line 2. Box 14 code A is not added, so line 2 and the SE
    // tax match the Schedule C-only return. The knockout stops the return that would file that omission.
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
    expect(get(withoutK1, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(withK1, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(withK1, `/selfEmploymentTax`).get.toString()).toBe(get(withoutK1, `/selfEmploymentTax`).get.toString());
    expect(get(withK1, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(withK1, `/flowKnockoutScheduleEPartIIBox14CodeA`).get).toBe(true);
    expect(get(withK1, `/flowKnockoutScheduleEPartII`).get).toBe(true);
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
  `/flowKnockoutScheduleEPartIIQbiCode`,
  `/flowKnockoutScheduleEPartIIOtherK1Amount`,
  `/flowKnockoutScheduleEPartIIColumnE`,
  `/flowKnockoutScheduleEPartIIColumnF`,
  `/flowKnockoutScheduleEPartIIForeignOrPtp`,
  `/flowKnockoutScheduleEPartIITrading`,
  `/flowKnockoutScheduleEPartIILine27`,
  `/flowKnockoutScheduleEPartIII`,
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
      `box 14 code A`,
      `/flowKnockoutScheduleEPartIIBox14CodeA`,
      { [`/scheduleEK1s/#${partnershipId}/box14CodeA`]: createDollarWrapper(`12000`) },
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

  it(`a W-2 return with no Schedule K-1 has every Part II knockout complete false`, ({ task }) => {
    task.meta.testedFactPaths = partIIKnockouts;
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
    });
    for (const path of partIIKnockouts) {
      expect(get(g, path).complete, path).toBe(true);
      expect(get(g, path).get, path).toBe(false);
    }
  });
});
