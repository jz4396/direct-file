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
import {
  baseFilerData,
  filerWithRefundDueData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  primaryFilerId,
  singleFilerData,
  uuid,
} from '../testData.js';

/**
 * Schedule E Part I MVP (#38). Cites live in backend/src/main/resources/tax/scheduleE.xml:
 * Schedule E (2026 draft) lines 3, 4, 20, 21, 26 -> Schedule 1 line 5; 26 U.S.C. 61(a)(5)-(6), 212;
 * knockouts: 469 / 465 / 461(l) (loss), Form 4562 (depreciation), 280A (personal use), 32(i)(2)(C).
 * Part II (#85): line 28 column (k) for domestic partnership or S corporation box 1, material participation.
 * Part III (#85): line 33 column (f) for domestic estate or trust box 6 with material participation.
 * Nonnegative box 7 is line 33 column (d) and Schedule 1 line 5. A loss and a prior-year unallowed passive
 * loss stop the return. Box 8 is other rental income. 26 U.S.C. 469(c)(2) and 469(c)(4) make it passive, so a
 * nonzero amount is column (d) and stops the return. Box 12 code A is Form 6251 line 2j. Codes B through I
 * stop the return.
 * Part IV is an explicit stop, including a Schedule Q holder who
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
  [`/scheduleEK1s/#${id}/form1065Box5`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/form1065Box6a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/form1065Box6b`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/form1120sBox4`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/form1120sBox5a`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/form1120sBox5b`]: createDollarWrapper(`0`),
  [`/scheduleEK1s/#${id}/dividendIncludesPtep`]: createBooleanWrapper(false),
  [`/scheduleEK1s/#${id}/box5IncludesCleanRenewableEnergyBondInterest`]: createBooleanWrapper(false),
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
    // A yes with no finished property fails closed: the knockout stays incomplete.
    const yesOnly = fg({ ...supported, '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(true) });
    expect(get(yesOnly, `/flowKnockoutScheduleETradeOrBusinessQbi`).complete).toBe(false);
    expect(get(yesOnly, `/scheduleESectionIsComplete`).get).toBe(false);
  });

  const prop = `e1850000-0000-4000-8000-000000000001`;
  const section162 = (extra: Record<string, unknown> = {}) => ({
    ...supported,
    '/scheduleEWritableRoyalties': createDollarWrapper(`0`),
    '/scheduleEWritableExpenses': createDollarWrapper(`0`),
    '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(true),
    '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
    '/qbiIsCooperativePatron': createBooleanWrapper(false),
    '/scheduleEProperties': createCollectionWrapper([prop]),
    '/scheduleEPropertiesIsDone': createBooleanWrapper(true),
    [`/scheduleEProperties/#${prop}/propertyName`]: createStringWrapper(`Oak Street Rental`),
    [`/scheduleEProperties/#${prop}/writableRents`]: createDollarWrapper(`12000`),
    [`/scheduleEProperties/#${prop}/writableRoyalties`]: createDollarWrapper(`0`),
    [`/scheduleEProperties/#${prop}/writableExpenses`]: createDollarWrapper(`0`),
    [`/scheduleEProperties/#${prop}/materiallyParticipates`]: createBooleanWrapper(true),
    [`/scheduleEProperties/#${prop}/reliesOnRp201938SafeHarbor`]: createBooleanWrapper(false),
    [`/scheduleEProperties/#${prop}/isAggregated`]: createBooleanWrapper(false),
    [`/scheduleEProperties/#${prop}/hasSuspendedPassiveLoss`]: createBooleanWrapper(false),
    ...extra,
  });

  it(`section 162 rental is Form 8995 line 1 and the safe-harbor stops still refuse`, ({ task }) => {
    // 26 U.S.C. 199A(c)(1). 2026 Instructions for Form 8995 draft, PDF p. 5, Line 1.
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleETradeOrBusinessQbi`,
      `/form8995Required`,
      `/form8995Line1iQbi`,
      `/scheduleESectionIsComplete`,
    ];
    const ok = fg(section162());
    expect(get(ok, `/flowKnockoutScheduleETradeOrBusinessQbi`).complete).toBe(true);
    expect(get(ok, `/flowKnockoutScheduleETradeOrBusinessQbi`).get).toBe(false);
    expect(get(ok, `/form8995Required`).get).toBe(true);
    expect(get(ok, `/form8995Line1iName`).get).toBe(`Oak Street Rental`);
    expect(get(ok, `/form8995Line1iTin`).complete).toBe(true);
    expect(get(ok, `/form8995Line1iTin`).get.toString()).toBe(get(ok, `/primaryFiler/tin`).get.toString());
    expect(get(ok, `/form8995Line1iQbi`).get.toString()).toBe(`12000.00`);
    expect(get(ok, `/scheduleESectionIsComplete`).get).toBe(true);
    for (const [path, key] of [
      [`/scheduleEProperties/#${prop}/reliesOnRp201938SafeHarbor`, `safe harbor`],
      [`/scheduleEProperties/#${prop}/isAggregated`, `aggregation`],
      [`/scheduleEProperties/#${prop}/hasSuspendedPassiveLoss`, `suspended loss`],
    ] as const) {
      const stopped = fg(section162({ [path]: createBooleanWrapper(true) }));
      expect(get(stopped, `/flowKnockoutScheduleETradeOrBusinessQbi`).get, key).toBe(true);
      expect(get(stopped, `/flowIsKnockedOut`).get, key).toBe(true);
      expect(get(stopped, `/form8995Line1iTin`).complete, key).toBe(key !== `aggregation`);
    }
    // 26 U.S.C. 199A(c)(3)(A)(ii): line 1(c) cannot exceed the Part I net included in taxable income.
    const rentsOver = fg(section162({ '/scheduleEWritableRents': createDollarWrapper(`11000`) }));
    expect(get(rentsOver, `/flowKnockoutScheduleETradeOrBusinessQbi`).get).toBe(true);
    const line1cOver = fg(
      section162({
        '/scheduleEWritableRents': createDollarWrapper(`12000`),
        '/scheduleEWritableExpenses': createDollarWrapper(`4000`),
      })
    );
    expect(get(line1cOver, `/scheduleENetIncome`).get.toString()).toBe(`8000.00`);
    expect(get(line1cOver, `/form8995Line1iQbi`).get.toString()).toBe(`12000.00`);
    expect(get(line1cOver, `/flowKnockoutScheduleETradeOrBusinessQbi`).get).toBe(true);
    expect(get(line1cOver, `/flowIsKnockedOut`).get).toBe(true);
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
  `/flowKnockoutScheduleEPartIIPtep`,
  `/flowKnockoutScheduleEPartIICleanRenewableEnergyBond`,
  `/flowKnockoutScheduleEPartIIQualifiedDividends`,
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
  `/flowKnockoutScheduleEPartIIIPriorYearPassiveLoss`,
  `/flowKnockoutScheduleEPartIIIBox8`,
  `/flowKnockoutScheduleEPartIIIBox2b`,
  `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`,
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
/** Supported Part III estate: domestic, nonnegative box 6 and box 7, material participation, no carryover. */
const estate = (id: string, box6: string, extra: Record<string, unknown> = {}) => ({
  [`/scheduleEEstates/#${id}/entityName`]: createStringWrapper(`Harbor Trust`),
  [`/scheduleEEstates/#${id}/isForeignBeneficiary`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/isForeignTrust`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/inconsistentTreatment`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/box1`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box2a`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box2b`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box3`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box4a`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box5`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box6`]: createDollarWrapper(box6),
  [`/scheduleEEstates/#${id}/box7`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/box8`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleEEstates/#${id}/box12CodeA`]: createDollarWrapper(`0`),
  [`/scheduleEEstates/#${id}/hasBox12CodesBThroughI`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/hasBox12CodeJ`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/hasOtherK1Amount`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/basisLimitApplies`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/anyAmountNotAtRisk`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/passiveDeductionOrLoss`]: createBooleanWrapper(false),
  [`/scheduleEEstates/#${id}/hasPriorYearUnallowedPassiveLoss`]: createBooleanWrapper(false),
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
  it(`box 12 code A is Form 6251 line 2j and codes B through I stay stopped`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEBox12CodeATotal`,
      `/form6251Line2j`,
      `/form6251Line4`,
      `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`,
      `/flowKnockoutScheduleEPartIII`,
      `/scheduleESectionIsComplete`,
    ];
    // Beneficiary's Instructions for Schedule K-1 (Form 1041) (2025) PDF p. 3: "Code A, Adjustment for minimum
    // tax purposes, is the total amount reported on Form 6251, line 2j." Form 6251 (2026) draft line 2j. Line 4
    // combines lines 1b through 3. 26 U.S.C. 55(b)(2). Codes B through I are not line 2j.
    const base = fg();
    const g = fg(oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box12CodeA`]: createDollarWrapper(`1500.40`) }));
    expect(get(g, `/scheduleEBox12CodeATotal`).get.toString()).toBe(`1500.40`);
    expect(get(g, `/form6251Line2j`).get.toString()).toBe(`1500.00`);
    expect(Number(get(g, `/form6251Line4`).get.toString())).toBe(
      Number(get(base, `/form6251Line4`).get.toString()) + 1500
    );
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`0.00`);

    const stopped = fg(
      oneEstate(`0`, {
        [`/scheduleEEstates/#${estateId}/box12CodeA`]: createDollarWrapper(`1500`),
        [`/scheduleEEstates/#${estateId}/hasBox12CodesBThroughI`]: createBooleanWrapper(true),
      })
    );
    expect(get(stopped, `/form6251Line2j`).get.toString()).toBe(`1500.00`);
    expect(get(stopped, `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`).get).toBe(true);
    expect(get(stopped, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
    expect(get(stopped, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`two estates' box 12 code A amounts are added and only the total is rounded`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEBox12CodeATotal`, `/form6251Line2j`];
    // 26 U.S.C. 6102(a): cents stay in the addition. 10.40 + 10.50 = 20.90, which rounds to 21.
    const g = fg({
      ...partIIIGate,
      '/scheduleEEstates': createCollectionWrapper([estateId, estate2Id]),
      ...estate(estateId, `0`, { [`/scheduleEEstates/#${estateId}/box12CodeA`]: createDollarWrapper(`10.40`) }),
      ...estate(estate2Id, `0`, { [`/scheduleEEstates/#${estate2Id}/box12CodeA`]: createDollarWrapper(`10.50`) }),
    });
    expect(get(g, `/scheduleEBox12CodeATotal`).get.toString()).toBe(`20.90`);
    expect(get(g, `/form6251Line2j`).get.toString()).toBe(`21.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
  });

  it(`a negative box 12 code A reduces Form 6251 line 4 and is not a Part III stop`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form6251Line2j`,
      `/form6251Line4`,
      `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`,
      `/scheduleESectionIsComplete`,
    ];
    // The beneficiary instructions report the code A amount on line 2j, including a negative adjustment.
    const base = fg();
    const g = fg(oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box12CodeA`]: createDollarWrapper(`-2500`) }));
    expect(get(g, `/form6251Line2j`).get.toString()).toBe(`-2500.00`);
    expect(Number(get(g, `/form6251Line4`).get.toString())).toBe(
      Number(get(base, `/form6251Line4`).get.toString()) - 2500
    );
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`box 12 code J is not a stop and is not Form 6251 line 2j`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutScheduleEPartIIIOtherK1Amount`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
      `/scheduleESectionIsComplete`,
      `/form6251Line2j`,
    ];
    // Schedule K-1 (Form 1041) (2025) page 2: "J Exclusion items — 2026 Form 8801." 26 U.S.C. 53. Code J is
    // not 26 U.S.C. 59(c) code A and is not Form 6251 line 2j. A yes with hasOtherK1Amount no does not stop.
    const g = fg(oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/hasBox12CodeJ`]: createBooleanWrapper(true) }));
    expect(get(g, `/flowKnockoutScheduleEPartIIIOtherK1Amount`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
    expect(get(g, `/form6251Line2j`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(true);
  });

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
      `box 7 rental real estate loss`,
      `/flowKnockoutScheduleEPartIIIBox7`,
      { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`-1`) },
    ],
    [
      `box 8 other rental income`,
      `/flowKnockoutScheduleEPartIIIBox8`,
      { [`/scheduleEEstates/#${estateId}/box8`]: createDollarWrapper(`500`) },
    ],
    [
      `box 12 codes B through I`,
      `/flowKnockoutScheduleEPartIIIBox12CodesBThroughI`,
      { [`/scheduleEEstates/#${estateId}/hasBox12CodesBThroughI`]: createBooleanWrapper(true) },
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

  it(`reports nonnegative box 7 in column (d), Schedule 1 line 5, and Form 8960 line 4a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/columnD`,
      `/scheduleEPartIIILine34aColumnD`,
      `/scheduleEPartIIILine37`,
      `/schedule1Line5`,
      `/scheduleEPartIIIBox7ColumnD`,
      `/form8960Line4a`,
      `/flowKnockoutScheduleEPartIIIBox7`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
    ];
    // Schedule K-1 (Form 1041) (2025) page 2: box 7 goes on Schedule E line 33, column (d) or (f).
    // 26 U.S.C. 469(c)(2) puts rental real estate in column (d). A positive amount is not a passive
    // activity deduction, so Form 8582 is not filed. 2025 Instructions for Form 8582, PDF p. 1, Who Must File.
    const base = fg();
    const g = fg(oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`) }));
    expect(get(g, `/scheduleEEstates/#${estateId}/columnD`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/scheduleEPartIIIBox7ColumnD`).get.toString()).toBe(`4000.00`);
    expect(Number(get(g, `/form8960Line4a`).get.toString())).toBe(
      Number(get(base, `/form8960Line4a`).get.toString()) + 4000
    );
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox7`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIIPriorYearPassiveLoss`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`a single Florida filer with box 7 of $4,000 and MAGI over $200,000 shows it on Form 8960 line 4a`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/form8960Line4a`,
      `/form8960Line13`,
      `/form8960MagiOverThreshold`,
      `/flowKnockoutForm8960Unsupported`,
      `/flowKnockoutPaK11041Box7`,
      `/flowIsKnockedOut`,
    ];
    // 26 U.S.C. 1411(b): the threshold is $200,000 for a single filer. 26 U.S.C. 1411(c)(1)(A)(i) includes
    // the rent once it is on Schedule 1 line 5. No Schedule C and no Schedule E Part I, so
    // /flowKnockoutForm8960Unsupported stays false.
    const minimal = Object.fromEntries(
      Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
    );
    const g = setupFactGraph({
      ...minimal,
      ...baseFilerData,
      ...singleFilerData,
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
      '/flowHasSeenDeductions': createBooleanWrapper(true),
      ...makeW2Data(210000),
      '/interestReports': createCollectionWrapper([]),
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`) }),
      ...residence(`fl`),
    }).factGraph;
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/form8960Line4a`).get.toString()).toBe(`4000.00`);
    expect(Number(get(g, `/form8960Line13`).get.toString())).toBeGreaterThan(200000);
    expect(get(g, `/form8960MagiOverThreshold`).get).toBe(true);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaK11041Box7`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`box 7 of zero stays in column (d) at zero and does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/columnD`,
      `/scheduleEPartIIILine37`,
      `/scheduleEPartIIIBox7ColumnD`,
      `/flowKnockoutScheduleEPartIIIBox7`,
      `/flowKnockoutPaK11041Box7`,
    ];
    const g = fg(oneEstate(`0`));
    expect(get(g, `/scheduleEEstates/#${estateId}/columnD`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEPartIIIBox7ColumnD`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox7`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaK11041Box7`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`leaves line 37 and the box 7 knockout incomplete when box 7 is blank`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIIILine37`,
      `/scheduleEPartIIIBox7ColumnD`,
      `/flowKnockoutScheduleEPartIIIBox7`,
      `/flowKnockoutScheduleEPartIII`,
    ];
    const facts = oneEstate(`0`) as Record<string, unknown>;
    delete facts[`/scheduleEEstates/#${estateId}/box7`];
    const g = fg(facts);
    expect(get(g, `/scheduleEPartIIILine37`).complete).toBe(false);
    expect(get(g, `/scheduleEPartIIIBox7ColumnD`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox7`).complete).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).complete).toBe(false);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).complete).toBe(false);
  });

  it(`stops a prior-year unallowed passive loss even when box 7 is positive`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/hasPriorYearUnallowedPassiveLoss`,
      `/flowKnockoutScheduleEPartIIIPriorYearPassiveLoss`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // 2025 Instructions for Form 8582, PDF p. 1, Who Must File: prior year unallowed losses are passive
    // activity deductions. Form 8582 is not computed.
    const g = fg(
      oneEstate(`0`, {
        [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`),
        [`/scheduleEEstates/#${estateId}/hasPriorYearUnallowedPassiveLoss`]: createBooleanWrapper(true),
      })
    );
    expect(get(g, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIPriorYearPassiveLoss`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(false);
  });

  it(`stops any PA-40 with a nonzero box 7, including cents that round to zero`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaK11041Box7`,
      `/flowKnockoutStateReturn`,
      `/flowIsKnockedOut`,
      `/scheduleEPartIIILine34aColumnD`,
    ];
    // PA-40 IN (2025) p. 19, LINE 7, ESTATE OR TRUST INCOME, reports the amount on PA Schedule J. A
    // beneficiary cannot report a loss. 72 P.S. §7303(a)(8).
    const fullYear = fg({
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`) }),
      ...residence(`pa`),
    });
    expect(get(fullYear, `/flowKnockoutPaK11041Box7`).get).toBe(true);
    expect(get(fullYear, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(fullYear, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(fullYear, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`4000.00`);
    const loss = fg({
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`-1`) }),
      ...residence(`pa`),
    });
    expect(get(loss, `/flowKnockoutPaK11041Box7`).get).toBe(true);
    const cents = fg({
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`0.40`) }),
      ...residence(`pa`),
    });
    expect(get(cents, `/scheduleEPartIIILine34aColumnD`).get.toString()).toBe(`0.00`);
    expect(get(cents, `/flowKnockoutPaK11041Box7`).get).toBe(true);
    const partYear = fg({
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`) }),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
    });
    expect(get(partYear, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(partYear, `/flowKnockoutPaK11041Box7`).get).toBe(true);
    const zero = fg({ ...oneEstate(`0`), ...residence(`pa`) });
    expect(get(zero, `/flowKnockoutPaK11041Box7`).get).toBe(false);
  });

  it(`lets a Florida filer report box 7`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaK11041Box7`,
      `/scheduleEPartIIILine37`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
    ];
    // Fla. Const. art. VII, sec. 5(a): no personal income tax. The federal Schedule E lines still apply.
    const g = fg({
      ...oneEstate(`0`, { [`/scheduleEEstates/#${estateId}/box7`]: createDollarWrapper(`4000`) }),
      ...residence(`fl`),
    });
    expect(get(g, `/flowKnockoutPaK11041Box7`).get).toBe(false);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`4000.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
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

const interestId = `a1b2c3d4-1111-4222-8333-444455556601`;

describe(`Schedule K-1 (Form 1041) boxes 1, 2a, and 2b`, () => {
  const portfolio = (extra: Record<string, unknown> = {}) =>
    oneEstate(`0`, {
      [`/scheduleEEstates/#${estateId}/entityName`]: createStringWrapper(`Harbor Trust`),
      [`/scheduleEEstates/#${estateId}/box1`]: createDollarWrapper(`900`),
      [`/scheduleEEstates/#${estateId}/box2a`]: createDollarWrapper(`1200`),
      [`/scheduleEEstates/#${estateId}/box2b`]: createDollarWrapper(`800`),
      ...extra,
    });

  it(`reports box 1, 2a, and 2b on Form 1040 lines 2b, 3b, and 3a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/box1`,
      `/scheduleEEstates/*/box2a`,
      `/scheduleEEstates/*/box2b`,
      `/interestIncome`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/qdcgLine2`,
      `/qdcgLine4`,
      `/requiresScheduleB`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowKnockoutScheduleEPartIIIBox2b`,
    ];
    // Schedule K-1 (Form 1041) (2025) page 2: box 1 is Form 1040 line 2b, box 2a is line 3b, box 2b is line 3a.
    // Beneficiary's Instructions (2025) PDF p. 2. 26 U.S.C. 61(a)(4), 61(a)(7), 1(h)(11), 662(b), 652(b).
    // $900 and $1,200 are not over the Schedule B $1,500 threshold. Instructions for Schedule B (2025) p. 1.
    const g = fg(portfolio());
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/qdcgLine2`).get.toString()).toBe(`800.00`);
    expect(get(g, `/qdcgLine4`).get.toString()).toBe(`800.00`);
    expect(get(g, `/requiresScheduleB`).get).toBe(false);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox2b`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`requires Schedule B when box 2a is over $1,500 and prints the estate on Part I and Part II`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleB`,
      `/requiresScheduleBForOrdinaryDividends`,
      `/scheduleBPartIRow0Payer`,
      `/scheduleBPartIRow0Amount`,
      `/scheduleBPartIIRow0Payer`,
      `/scheduleBPartIIRow0Amount`,
      `/interestIncome`,
      `/ordinaryDividends`,
    ];
    // Instructions for Schedule B (2025) p. 1: over $1,500 of ordinary dividends. Exactly $1,500 does not.
    // Beneficiary's Instructions (2025) PDF p. 2: box 1 on Part I line 1 and box 2a on Part II line 5, if applicable.
    const under = fg(
      portfolio({
        [`/scheduleEEstates/#${estateId}/box2a`]: createDollarWrapper(`1500`),
        [`/scheduleEEstates/#${estateId}/box2b`]: createDollarWrapper(`800`),
      })
    );
    expect(get(under, `/ordinaryDividends`).get.toString()).toBe(`1500.00`);
    expect(get(under, `/requiresScheduleB`).get).toBe(false);
    const g = fg(
      portfolio({
        [`/scheduleEEstates/#${estateId}/box2a`]: createDollarWrapper(`1600`),
        [`/scheduleEEstates/#${estateId}/box2b`]: createDollarWrapper(`800`),
      })
    );
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/requiresScheduleBForOrdinaryDividends`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleBPartIRow0Payer`).get).toBe(`Harbor Trust`);
    expect(get(g, `/scheduleBPartIRow0Amount`).get.toString()).toBe(`900.00`);
    expect(get(g, `/scheduleBPartIIRow0Payer`).get).toBe(`Harbor Trust`);
    expect(get(g, `/scheduleBPartIIRow0Amount`).get.toString()).toBe(`1600.00`);
  });

  it(`lists a 1099-INT before the estate on Schedule B Part I`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/interestIncome`,
      `/requiresScheduleBForInterest`,
      `/scheduleBPartIRow0Payer`,
      `/scheduleBPartIRow0Amount`,
      `/scheduleBPartIRow1Payer`,
      `/scheduleBPartIRow1Amount`,
    ];
    // Form 1040 instr. (2025) p. 23: round only the total when Schedule B is not required, and sum the rounded
    // line 1 amounts when it is. $800 + $800 = $1,600, which is over $1,500.
    const g = fg({
      ...portfolio({
        [`/scheduleEEstates/#${estateId}/box1`]: createDollarWrapper(`800`),
        [`/scheduleEEstates/#${estateId}/box2a`]: createDollarWrapper(`0`),
        [`/scheduleEEstates/#${estateId}/box2b`]: createDollarWrapper(`0`),
      }),
      '/interestReports': createCollectionWrapper([interestId]),
      [`/interestReports/#${interestId}/has1099`]: createBooleanWrapper(false),
      [`/interestReports/#${interestId}/no1099Amount`]: createDollarWrapper(`800`),
      [`/interestReports/#${interestId}/payer`]: createStringWrapper(`First National`),
    });
    expect(get(g, `/interestIncome`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/requiresScheduleBForInterest`).get).toBe(true);
    expect(get(g, `/scheduleBPartIRow0Payer`).get).toBe(`First National`);
    expect(get(g, `/scheduleBPartIRow0Amount`).get.toString()).toBe(`800.00`);
    expect(get(g, `/scheduleBPartIRow1Payer`).get).toBe(`Harbor Trust`);
    expect(get(g, `/scheduleBPartIRow1Amount`).get.toString()).toBe(`800.00`);
  });

  it(`includes box 1 and box 2a on Form 8960 lines 1 and 2 above $200,000`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8960Line1`,
      `/form8960Line2`,
      `/form8960Line17`,
      `/flowKnockoutForm8960Unsupported`,
      `/agi`,
    ];
    // 26 U.S.C. 1411(c)(1)(A)(i). Wages $200,000 plus box 1 $900 and box 2a $1,200. MAGI $202,100.
    // Line 15 is $2,100. Line 17 is 3.8% of $2,100 = $79.80, rounded to $80. 26 U.S.C. 1411(a)(1), 6102(a).
    // hadScheduleEIncome is false, so the Part I Form 8960 stop does not apply.
    const g = fg(portfolio());
    expect(get(g, `/agi`).get.toString()).toBe(`202100.00`);
    expect(get(g, `/form8960Line1`).get.toString()).toBe(`900.00`);
    expect(get(g, `/form8960Line2`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/form8960Line17`).get.toString()).toBe(`80.00`);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
  });

  it(`stops the return when box 2b is larger than box 2a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/box2bExceedsBox2a`,
      `/flowKnockoutScheduleEPartIIIBox2b`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
    ];
    // Beneficiary's Instructions (2025) PDF p. 2, Box 2b: qualified dividends are a portion of box 2a.
    const g = fg(
      portfolio({
        [`/scheduleEEstates/#${estateId}/box2a`]: createDollarWrapper(`800`),
        [`/scheduleEEstates/#${estateId}/box2b`]: createDollarWrapper(`900`),
      })
    );
    expect(get(g, `/scheduleEEstates/#${estateId}/box2bExceedsBox2a`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIIBox2b`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
});

type K1Type = `P` | `S`;
const portfolioBoxes = { interest: `900`, ordinary: `1200`, qualified: `800` };
/** Box 1 is zero. Interest and dividends are Form 1040 lines 2b, 3b, and 3a, not Schedule E line 28. */
const portfolioK1 = (
  id: string,
  type: K1Type,
  boxes: { interest: string; ordinary: string; qualified: string } = portfolioBoxes,
  extra: Record<string, unknown> = {}
) =>
  k1(
    id,
    `0`,
    type,
    type === `P`
      ? {
          [`/scheduleEK1s/#${id}/form1065Box5`]: createDollarWrapper(boxes.interest),
          [`/scheduleEK1s/#${id}/form1065Box6a`]: createDollarWrapper(boxes.ordinary),
          [`/scheduleEK1s/#${id}/form1065Box6b`]: createDollarWrapper(boxes.qualified),
          ...extra,
        }
      : {
          [`/scheduleEK1s/#${id}/form1120sBox4`]: createDollarWrapper(boxes.interest),
          [`/scheduleEK1s/#${id}/form1120sBox5a`]: createDollarWrapper(boxes.ordinary),
          [`/scheduleEK1s/#${id}/form1120sBox5b`]: createDollarWrapper(boxes.qualified),
          ...extra,
        }
  );
const onePortfolioK1 = (
  id: string,
  type: K1Type,
  boxes?: { interest: string; ordinary: string; qualified: string },
  extra: Record<string, unknown> = {}
) => ({
  ...partIIGate,
  '/scheduleEK1s': createCollectionWrapper([id]),
  ...portfolioK1(id, type, boxes, extra),
});

describe(`Schedule K-1 (Form 1065 and Form 1120-S) interest and dividends`, () => {
  it(`reports Form 1065 boxes 5, 6a, and 6b on Form 1040 lines 2b, 3b, and 3a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/form1065Box5`,
      `/scheduleEK1s/*/form1065Box6a`,
      `/scheduleEK1s/*/form1065Box6b`,
      `/scheduleEK1s/*/k1Interest`,
      `/interestIncome`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/qdcgLine2`,
      `/qdcgLine4`,
      `/requiresScheduleB`,
      `/scheduleEPartIILine32`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartII`,
      `/flowKnockoutScheduleEPartIIPtep`,
      `/flowKnockoutScheduleEPartIIQualifiedDividends`,
    ];
    // Partner's Instructions for Schedule K-1 (Form 1065) (2025), PDF p. 15: box 5 is Form 1040 line 2b,
    // box 6a is line 3b, and box 6b is line 3a. Portfolio income is not Schedule E line 28.
    // 26 U.S.C. 61(a)(4), 61(a)(7), 1(h)(11), 702(a)(5), 702(b).
    // $900 and $1,200 are not over the Schedule B $1,500 threshold. Instructions for Schedule B (2025) p. 1.
    const g = fg(onePortfolioK1(partnershipId, `P`));
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/qdcgLine2`).get.toString()).toBe(`800.00`);
    expect(get(g, `/qdcgLine4`).get.toString()).toBe(`800.00`);
    expect(get(g, `/requiresScheduleB`).get).toBe(false);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`0.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIPtep`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIQualifiedDividends`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`reports Form 1120-S boxes 4, 5a, and 5b on the same Form 1040 lines`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/form1120sBox4`,
      `/scheduleEK1s/*/form1120sBox5a`,
      `/scheduleEK1s/*/form1120sBox5b`,
      `/interestIncome`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/scheduleEPartIILine32`,
      `/flowKnockoutScheduleEPartII`,
    ];
    // Shareholder's Instructions for Schedule K-1 (Form 1120-S) (2025), PDF p. 7: box 4 is Form 1040 line 2b,
    // box 5a is line 3b, and box 5b is line 3a. 26 U.S.C. 61(a)(4), 61(a)(7), 1(h)(11), 1366(a)(1)(A), 1366(b).
    const g = fg(onePortfolioK1(sCorpId, `S`));
    expect(get(g, `/scheduleEK1s/#${sCorpId}/k1Interest`).get.toString()).toBe(`900.00`);
    expect(get(g, `/scheduleEK1s/#${sCorpId}/k1OrdinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleEK1s/#${sCorpId}/k1QualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
  });

  it(`keeps box 1 in column (k) and keeps interest and dividends off Schedule E line 32`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEPartIILine32`,
      `/schedule1Line5`,
      `/interestIncome`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
    ];
    // Partner's Instructions (2025), PDF p. 15, Portfolio Income: boxes 5 through 9b are not entered on
    // Schedule E line 28. Column (k) is box 1. 26 U.S.C. 702(a)(8).
    const g = fg(
      onePortfolioK1(partnershipId, `P`, portfolioBoxes, {
        [`/scheduleEK1s/#${partnershipId}/box1`]: createDollarWrapper(`12000`),
      })
    );
    expect(get(g, `/scheduleEPartIILine32`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  it(`requires Schedule B when ordinary dividends are over $1,500 and prints the partnership`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleB`,
      `/requiresScheduleBForOrdinaryDividends`,
      `/scheduleBPartIRow0Payer`,
      `/scheduleBPartIRow0Amount`,
      `/scheduleBPartIIRow0Payer`,
      `/scheduleBPartIIRow0Amount`,
      `/interestIncome`,
      `/ordinaryDividends`,
    ];
    // Instructions for Schedule B (2025) p. 1: over $1,500 of ordinary dividends. Exactly $1,500 does not.
    // Partner's Instructions (2025), PDF p. 15: box 5 on Form 1040 line 2b and box 6a on line 3b.
    const under = fg(onePortfolioK1(partnershipId, `P`, { interest: `900`, ordinary: `1500`, qualified: `800` }));
    expect(get(under, `/ordinaryDividends`).get.toString()).toBe(`1500.00`);
    expect(get(under, `/requiresScheduleB`).get).toBe(false);
    const g = fg(onePortfolioK1(partnershipId, `P`, { interest: `900`, ordinary: `1600`, qualified: `800` }));
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/requiresScheduleBForOrdinaryDividends`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleBPartIRow0Payer`).get).toBe(`Northwind Partners`);
    expect(get(g, `/scheduleBPartIRow0Amount`).get.toString()).toBe(`900.00`);
    expect(get(g, `/scheduleBPartIIRow0Payer`).get).toBe(`Northwind Partners`);
    expect(get(g, `/scheduleBPartIIRow0Amount`).get.toString()).toBe(`1600.00`);
  });

  it(`lists a 1099, then the estate, then the partnership on Schedule B Part I`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/interestIncome`,
      `/requiresScheduleBForInterest`,
      `/scheduleBPartIRow0Payer`,
      `/scheduleBPartIRow0Amount`,
      `/scheduleBPartIRow1Payer`,
      `/scheduleBPartIRow1Amount`,
      `/scheduleBPartIRow2Payer`,
      `/scheduleBPartIRow2Amount`,
    ];
    // Form 1040 instr. (2025) p. 23: when Schedule B is required, line 2b is the sum of the rounded line 1
    // amounts. $600 + $500 + $500 = $1,600, which is over $1,500. Instructions for Schedule B (2025) p. 1.
    const g = fg({
      ...partIIGate,
      '/scheduleEHasPartIIIIncome': createBooleanWrapper(true),
      '/scheduleEEstatesIsDone': createBooleanWrapper(true),
      '/scheduleEEstates': createCollectionWrapper([estateId]),
      ...estate(estateId, `0`, {
        [`/scheduleEEstates/#${estateId}/box1`]: createDollarWrapper(`500`),
      }),
      '/scheduleEK1s': createCollectionWrapper([partnershipId]),
      ...portfolioK1(partnershipId, `P`, { interest: `500`, ordinary: `0`, qualified: `0` }),
      '/interestReports': createCollectionWrapper([interestId]),
      [`/interestReports/#${interestId}/has1099`]: createBooleanWrapper(false),
      [`/interestReports/#${interestId}/no1099Amount`]: createDollarWrapper(`600`),
      [`/interestReports/#${interestId}/payer`]: createStringWrapper(`First National`),
    });
    expect(get(g, `/interestIncome`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/requiresScheduleBForInterest`).get).toBe(true);
    expect(get(g, `/scheduleBPartIRow0Payer`).get).toBe(`First National`);
    expect(get(g, `/scheduleBPartIRow0Amount`).get.toString()).toBe(`600.00`);
    expect(get(g, `/scheduleBPartIRow1Payer`).get).toBe(`Harbor Trust`);
    expect(get(g, `/scheduleBPartIRow1Amount`).get.toString()).toBe(`500.00`);
    expect(get(g, `/scheduleBPartIRow2Payer`).get).toBe(`Northwind Partners`);
    expect(get(g, `/scheduleBPartIRow2Amount`).get.toString()).toBe(`500.00`);
  });

  it(`requires Schedule B when two K-1 interest amounts total more than $1,500`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/interestIncome`,
      `/requiresScheduleBForInterest`,
      `/scheduleBPartIRow0Payer`,
      `/scheduleBPartIRow0Amount`,
      `/scheduleBPartIRow1Payer`,
      `/scheduleBPartIRow1Amount`,
    ];
    // Instructions for Schedule B (2025) p. 1: interest over $1,500. $800 + $800 = $1,600.
    const g = fg({
      ...partIIGate,
      '/scheduleEK1s': createCollectionWrapper([partnershipId, sCorpId]),
      ...portfolioK1(partnershipId, `P`, { interest: `800`, ordinary: `0`, qualified: `0` }),
      ...portfolioK1(sCorpId, `S`, { interest: `800`, ordinary: `0`, qualified: `0` }),
    });
    expect(get(g, `/interestIncome`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/requiresScheduleBForInterest`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleBPartIRow0Payer`).get).toBe(`Northwind Partners`);
    expect(get(g, `/scheduleBPartIRow0Amount`).get.toString()).toBe(`800.00`);
    expect(get(g, `/scheduleBPartIRow1Payer`).get).toBe(`Northwind Inc`);
    expect(get(g, `/scheduleBPartIRow1Amount`).get.toString()).toBe(`800.00`);
  });

  it(`rounds a half dollar of box 5 up when Schedule B is not required`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestIncome`, `/requiresScheduleB`];
    // Form 1040 instr. (2025) p. 23: round only the total when Schedule B is not required.
    // 26 U.S.C. 6102(a): a fractional part of one-half dollar or more increases to one dollar.
    const g = fg(onePortfolioK1(partnershipId, `P`, { interest: `10.50`, ordinary: `0`, qualified: `0` }));
    expect(get(g, `/requiresScheduleB`).get).toBe(false);
    expect(get(g, `/interestIncome`).get.toString()).toBe(`11.00`);
  });

  it(`uses each rounded K-1 amount on line 2b when Schedule B is required`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestIncome`, `/requiresScheduleB`, `/scheduleEK1InterestRounded`];
    // Instructions for Schedule B (2025) p. 1, Line 2: line 2 is the total of the line 1 amounts.
    // Each line 1 amount is already in whole dollars. 26 U.S.C. 6102(a).
    // $800.40 rounds to $800 and $800.40 rounds to $800, so line 2b is $1,600.
    const g = fg({
      ...partIIGate,
      '/scheduleEK1s': createCollectionWrapper([partnershipId, sCorpId]),
      ...portfolioK1(partnershipId, `P`, { interest: `800.40`, ordinary: `0`, qualified: `0` }),
      ...portfolioK1(sCorpId, `S`, { interest: `800.40`, ordinary: `0`, qualified: `0` }),
    });
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleEK1InterestRounded`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/interestIncome`).get.toString()).toBe(`1600.00`);
  });

  it(`leaves line 2b incomplete when a listed partnership's box 5 is blank`, ({ task }) => {
    task.meta.testedFactPaths = [`/interestIncome`, `/scheduleEK1Interest`, `/ordinaryDividends`];
    // A blank box is not zero. The sum stays incomplete so Form 1040 line 2b is not filed short.
    const facts: Record<string, unknown> = {
      ...onePortfolioK1(partnershipId, `P`, { interest: `0`, ordinary: `100`, qualified: `0` }),
    };
    delete facts[`/scheduleEK1s/#${partnershipId}/form1065Box5`];
    const g = fg(facts);
    expect(get(g, `/scheduleEK1Interest`).complete).toBe(false);
    expect(get(g, `/interestIncome`).complete).toBe(false);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`100.00`);
  });

  it(`includes box 5 and box 6a on Form 8960 lines 1 and 2 above $200,000`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8960Line1`,
      `/form8960Line2`,
      `/form8960Line17`,
      `/flowKnockoutForm8960Unsupported`,
      `/agi`,
    ];
    // 26 U.S.C. 1411(c)(1)(A)(i). Wages $200,000 plus box 5 $900 and box 6a $1,200. MAGI $202,100.
    // Line 15 is $2,100. Line 17 is 3.8% of $2,100 = $79.80, rounded to $80. 26 U.S.C. 1411(a)(1), 6102(a).
    // Qualified dividends are already inside ordinary dividends. hadScheduleEIncome is false, so the Part I
    // Form 8960 stop does not apply.
    const g = fg(onePortfolioK1(partnershipId, `P`));
    expect(get(g, `/agi`).get.toString()).toBe(`202100.00`);
    expect(get(g, `/form8960Line1`).get.toString()).toBe(`900.00`);
    expect(get(g, `/form8960Line2`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/form8960Line17`).get.toString()).toBe(`80.00`);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
  });

  it(`stops the return when box 6b is larger than box 6a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/qualifiedDividendsExceedOrdinary`,
      `/flowKnockoutScheduleEPartIIQualifiedDividends`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // Partner's Instructions (2025), PDF p. 15, Box 6b: qualified dividends are a portion of box 6a.
    const g = fg(onePortfolioK1(partnershipId, `P`, { interest: `0`, ordinary: `800`, qualified: `900` }));
    expect(get(g, `/scheduleEK1s/#${partnershipId}/qualifiedDividendsExceedOrdinary`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIIQualifiedDividends`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`900.00`);
  });

  it(`stops the return when dividends include previously taxed earnings and profits`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/dividendIncludesPtep`,
      `/flowKnockoutScheduleEPartIIPtep`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/scheduleEK1OrdinaryDividends`,
    ];
    // Partner's Instructions (2025), PDF p. 15, Boxes 6a and 6b: do not include PTEP on Form 1040 lines 3b
    // and 3a. Use Schedule K-3, Part V. Shareholder's Instructions (2025), PDF p. 7, Boxes 5a and 5b.
    // 26 U.S.C. 959(a). Schedule K-3, Part V, is not computed, so the exclusion is not subtracted.
    const g = fg(
      onePortfolioK1(partnershipId, `P`, portfolioBoxes, {
        [`/scheduleEK1s/#${partnershipId}/dividendIncludesPtep`]: createBooleanWrapper(true),
      })
    );
    expect(get(g, `/flowKnockoutScheduleEPartIIPtep`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleEK1OrdinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`800.00`);
    expect(get(g, `/scheduleEK1s/#${partnershipId}/isSupportedOrdinaryIncome`).get).toBe(false);
  });

  it(`prints an S corporation on Schedule B Part II when box 5a is over $1,500`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/ordinaryDividends`,
      `/requiresScheduleB`,
      `/requiresScheduleBForOrdinaryDividends`,
      `/scheduleBPartIIRow0Payer`,
      `/scheduleBPartIIRow0Amount`,
    ];
    // Shareholder's Instructions for Schedule K-1 (Form 1120-S) (2025), PDF p. 7, Box 5a: report ordinary
    // dividends on Form 1040 line 3b. Instructions for Schedule B (2025) p. 1: over $1,500. Exactly $1,500
    // does not. The payer is the S corporation.
    const g = fg(onePortfolioK1(sCorpId, `S`, { interest: `0`, ordinary: `1600`, qualified: `400` }));
    expect(get(g, `/ordinaryDividends`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/qualifiedDividends`).get.toString()).toBe(`400.00`);
    expect(get(g, `/requiresScheduleBForOrdinaryDividends`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleBPartIIRow0Payer`).get).toBe(`Northwind Inc`);
    expect(get(g, `/scheduleBPartIIRow0Amount`).get.toString()).toBe(`1600.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
  });

  it(`stops the return when box 6c dividend equivalents are reported`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/hasOtherK1Amount`,
      `/flowKnockoutScheduleEPartIIOtherK1Amount`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // Partner's Instructions (2025), PDF p. 15, Box 6c: "Dividend equivalents aren't reported on Form 1040
    // or 1040-SR." Box 6c is not Form 1040 line 3b. It is an amount other than boxes 5, 6a, and 6b.
    const g = fg({
      ...partIIGate,
      '/scheduleEK1s': createCollectionWrapper([partnershipId]),
      ...k1(partnershipId, `0`, `P`, {
        [`/scheduleEK1s/#${partnershipId}/hasOtherK1Amount`]: createBooleanWrapper(true),
      }),
    });
    expect(get(g, `/flowKnockoutScheduleEPartIIOtherK1Amount`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`stops the return when box 5 includes clean renewable energy bond interest`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEK1s/*/box5IncludesCleanRenewableEnergyBondInterest`,
      `/scheduleEK1s/*/cleanRenewableEnergyBondInterestStops`,
      `/flowKnockoutScheduleEPartIICleanRenewableEnergyBond`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
      `/interestIncome`,
    ];
    // Partner's Instructions (2025), PDF p. 15, Box 5: the partnership attaches a statement, and the partner
    // must reduce basis by the interest from the credit for holders of clean renewable energy bonds.
    // PDF p. 3, Line 4d, is that reduction. 26 U.S.C. 54. The worksheet is not computed. The interest stays
    // on Form 1040 line 2b; it is not subtracted.
    const g = fg(
      onePortfolioK1(partnershipId, `P`, portfolioBoxes, {
        [`/scheduleEK1s/#${partnershipId}/box5IncludesCleanRenewableEnergyBondInterest`]: createBooleanWrapper(true),
      })
    );
    expect(get(g, `/scheduleEK1s/#${partnershipId}/cleanRenewableEnergyBondInterestStops`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIICleanRenewableEnergyBond`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleEK1s/#${partnershipId}/isSupportedOrdinaryIncome`).get).toBe(false);
    expect(get(g, `/interestIncome`).get.toString()).toBe(`900.00`);
  });
});

const residence = (state: `pa` | `fl`) => ({
  '/filerResidenceAndIncomeState': createEnumWrapper(state, `/scopedStateOptions`),
});
const capitalGain = (box3: string, box4a: string, extra: Record<string, unknown> = {}) =>
  oneEstate(`0`, {
    [`/scheduleEEstates/#${estateId}/box3`]: createDollarWrapper(box3),
    [`/scheduleEEstates/#${estateId}/box4a`]: createDollarWrapper(box4a),
    ...extra,
  });

describe(`Schedule K-1 (Form 1041) boxes 3 and 4a on Schedule D lines 5 and 12`, () => {
  it(`reports box 3 on Schedule D line 5 and Form 1040 line 7a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/box3`,
      `/scheduleDLine5`,
      `/scheduleDLine7`,
      `/scheduleDLine16`,
      `/requiresScheduleD`,
      `/capitalGainsOrLosses`,
      `/scheduleEPartIIILine37`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
    ];
    // 2026 draft Schedule K-1 (Form 1041), PDF p. 3: box 3 is Schedule D line 5. 2026 draft Schedule D, PDF p. 2,
    // line 5. 26 U.S.C. 652(b), 662(b), 1222(5). Line 37 stays box 6.
    const g = fg(capitalGain(`1200`, `0`));
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine7`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine15`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine16`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/requiresScheduleD`).get).toBe(true);
    expect(get(g, `/capitalGainsOrLosses`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleEPartIIILine37`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIIIOtherK1Amount`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaK11041CapitalGain`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`reports box 4a on Schedule D line 12, the QDCG worksheet, and Form 8960 line 5a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/box4a`,
      `/scheduleDLine12`,
      `/scheduleDLine15`,
      `/qdcgLine3`,
      `/form8960Line5a`,
      `/flowKnockoutForm8960Unsupported`,
    ];
    // 2026 draft Schedule K-1 (Form 1041), PDF p. 3: box 4a is Schedule D line 12. QDCG worksheet line 3 is the
    // smaller of Schedule D lines 15 and 16. 26 U.S.C. 1(h)(11), 1222(11), 1411(c)(1)(A)(iii).
    const g = fg(capitalGain(`0`, `3400`));
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/scheduleDLine7`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine15`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/scheduleDLine16`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/qdcgLine3`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/form8960Line5a`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/capitalGainsOrLosses`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`adds box 3 and box 4a on Schedule D line 16`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine5`, `/scheduleDLine12`, `/scheduleDLine16`, `/capitalGainsOrLosses`];
    // 2026 draft Schedule D, PDF p. 3, line 16: combine lines 7 and 15.
    const g = fg(capitalGain(`1200`, `3400`));
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/scheduleDLine7`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine15`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/scheduleDLine16`).get.toString()).toBe(`4600.00`);
    expect(get(g, `/capitalGainsOrLosses`).get.toString()).toBe(`4600.00`);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`rounds the sum of box 3 once on Schedule D line 5`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEEstateK1NetShortTermCapitalGain`, `/scheduleDLine5`];
    // 26 U.S.C. 6102(a). $10.40 + $10.50 = $20.90, which rounds to $21. Same half-up rule as Form 6251 line 2j.
    const g = fg({
      ...partIIIGate,
      '/scheduleEEstates': createCollectionWrapper([estateId, estate2Id]),
      ...estate(estateId, `0`, { [`/scheduleEEstates/#${estateId}/box3`]: createDollarWrapper(`10.40`) }),
      ...estate(estate2Id, `0`, { [`/scheduleEEstates/#${estate2Id}/box3`]: createDollarWrapper(`10.50`) }),
    });
    expect(get(g, `/scheduleEEstateK1NetShortTermCapitalGain`).get.toString()).toBe(`20.90`);
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`21.00`);
    expect(get(g, `/scheduleDLine7`).get.toString()).toBe(`21.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
  });

  it(`keeps a box 3 loss on Schedule D and limits it on Form 1040 line 7a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleDLine5`,
      `/scheduleDLine16`,
      `/scheduleDLine21`,
      `/capitalGainsOrLosses`,
      `/flowKnockoutScheduleEPartIII`,
    ];
    // 2026 draft Schedule D, PDF p. 2, line 5 is a gain or (loss). 26 U.S.C. 1211(b) limits the deduction on
    // line 21 and Form 1040 line 7a. A box 3 loss is not /scheduleEEstates/*/isLoss.
    const under = fg(capitalGain(`-2000`, `0`));
    expect(get(under, `/scheduleDLine5`).get.toString()).toBe(`-2000.00`);
    expect(get(under, `/scheduleDLine16`).get.toString()).toBe(`-2000.00`);
    expect(get(under, `/scheduleDLine21`).get.toString()).toBe(`2000.00`);
    expect(get(under, `/capitalGainsOrLosses`).get.toString()).toBe(`-2000.00`);
    expect(get(under, `/scheduleEEstates/#${estateId}/isLoss`).get).toBe(false);
    expect(get(under, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(under, `/flowIsKnockedOut`).get).toBe(false);
    const over = fg(capitalGain(`-5000`, `0`));
    expect(get(over, `/scheduleDLine5`).get.toString()).toBe(`-5000.00`);
    expect(get(over, `/scheduleDLine16`).get.toString()).toBe(`-5000.00`);
    expect(get(over, `/scheduleDLine21`).get.toString()).toBe(`3000.00`);
    expect(get(over, `/capitalGainsOrLosses`).get.toString()).toBe(`-3000.00`);
    expect(get(over, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
  });

  it(`does not require Schedule D when box 3 and box 4a are zero`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleEHasEstateK1CapitalGain`, `/requiresScheduleD`, `/scheduleDLine5`];
    const g = fg(capitalGain(`0`, `0`));
    expect(get(g, `/scheduleEHasEstateK1CapitalGain`).get).toBe(false);
    expect(get(g, `/requiresScheduleD`).get).toBe(false);
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`0.00`);
    expect(get(g, `/capitalGainsOrLosses`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaK11041CapitalGain`).get).toBe(false);
  });

  it(`leaves Schedule D line 5 and the Part III knockout incomplete when box 3 is unanswered`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine5`, `/flowKnockoutScheduleEPartIII`, `/scheduleEHasEstateK1CapitalGain`];
    const facts = capitalGain(`0`, `0`) as Record<string, unknown>;
    delete facts[`/scheduleEEstates/#${estateId}/box3`];
    const g = fg(facts);
    expect(get(g, `/scheduleDLine5`).complete).toBe(false);
    expect(get(g, `/scheduleEHasEstateK1CapitalGain`).complete).toBe(true);
    expect(get(g, `/scheduleEHasEstateK1CapitalGain`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).complete).toBe(false);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).complete).toBe(true);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(false);
  });

  it(`stops the return when box 4b or 4c is reported, even if box 3 and box 4a are filled`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleEEstates/*/hasOtherK1Amount`,
      `/flowKnockoutScheduleEPartIIIOtherK1Amount`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // 2026 draft Schedule K-1 (Form 1041), PDF p. 3: box 4b is the 28% Rate Gain Worksheet line 4 and box 4c is
    // the Unrecaptured Section 1250 Gain Worksheet line 11. Box 11 codes C and D are the same stop.
    const g = fg(
      capitalGain(`1200`, `3400`, {
        [`/scheduleEEstates/#${estateId}/hasOtherK1Amount`]: createBooleanWrapper(true),
      })
    );
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIIIOtherK1Amount`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleEEstates/#${estateId}/isSupported`).get).toBe(false);
  });

  it(`stops a full-year Pennsylvania return with a nonzero box 3 or box 4a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaK11041CapitalGain`,
      `/flowKnockoutPaUnsupportedIncome`,
      `/flowKnockoutStateReturn`,
      `/flowIsKnockedOut`,
    ];
    // PA-40 IN (2025) p. 19, LINE 7, reports estate or trust income on PA Schedule J. p. 17, LINE 5, is a sale.
    // A beneficiary cannot report a loss. 72 P.S. §7303(a)(3) and §7303(a)(8).
    const box3 = fg({ ...capitalGain(`1200`, `0`), ...residence(`pa`) });
    expect(get(box3, `/flowKnockoutPaK11041CapitalGain`).get).toBe(true);
    expect(get(box3, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
    expect(get(box3, `/flowIsKnockedOut`).get).toBe(true);
    const box4a = fg({ ...capitalGain(`0`, `-400`), ...residence(`pa`) });
    expect(get(box4a, `/flowKnockoutPaK11041CapitalGain`).get).toBe(true);
    expect(get(box4a, `/scheduleDLine12`).get.toString()).toBe(`-400.00`);
    const cents = fg({ ...capitalGain(`0.40`, `0`), ...residence(`pa`) });
    expect(get(cents, `/scheduleDLine5`).get.toString()).toBe(`0.00`);
    expect(get(cents, `/flowKnockoutPaK11041CapitalGain`).get).toBe(true);
    const zero = fg({ ...capitalGain(`0`, `0`), ...residence(`pa`) });
    expect(get(zero, `/flowKnockoutPaK11041CapitalGain`).get).toBe(false);
    expect(get(zero, `/flowKnockoutPaUnsupportedIncome`).get).toBe(true);
  });

  it(`lets a Florida filer report box 3 and box 4a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutPaK11041CapitalGain`,
      `/scheduleDLine5`,
      `/scheduleDLine12`,
      `/flowKnockoutScheduleEPartIII`,
      `/flowIsKnockedOut`,
    ];
    // Fla. Const. art. VII, sec. 5(a): no personal income tax. The federal Schedule D lines still apply.
    const g = fg({ ...capitalGain(`1200`, `3400`), ...residence(`fl`) });
    expect(get(g, `/flowKnockoutPaK11041CapitalGain`).get).toBe(false);
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`1200.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`3400.00`);
    expect(get(g, `/scheduleDLine16`).get.toString()).toBe(`4600.00`);
    expect(get(g, `/flowKnockoutScheduleEPartIII`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`is complete false on a return with no estate or trust`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaK11041CapitalGain`, `/scheduleDLine5`, `/scheduleDLine12`];
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIVIncome': createBooleanWrapper(false),
    });
    expect(get(g, `/flowKnockoutPaK11041CapitalGain`).complete).toBe(true);
    expect(get(g, `/flowKnockoutPaK11041CapitalGain`).get).toBe(false);
    expect(get(g, `/scheduleDLine5`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleDLine12`).get.toString()).toBe(`0.00`);
    expect(get(g, `/scheduleEHasEstateK1CapitalGain`).get).toBe(false);
  });
});
