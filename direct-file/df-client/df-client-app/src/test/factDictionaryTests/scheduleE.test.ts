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
 * knockouts: 469 / 465 / 461(l) (loss), Form 4562 (depreciation), 280A (personal use), Parts II-III (#232),
 * Schedule SE lines 1a/2 K-1 (Form 1065) box 14 code A (#238), 32(i)(2)(C).
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

describe(`Schedule E Part I MVP (#38)`, () => {
  it(`unanswered: W-2-only return is unchanged and not knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleENetIncome`,
      `/flowKnockoutScheduleEPartII`,
      `/scheduleESectionIsComplete`,
      `/flowIsKnockedOut`,
      `/totalIncome`,
    ];
    const base = fg();
    const noRental = fg({ '/hadScheduleEIncome': createBooleanWrapper(false) });
    const answeredNo = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(false),
    });
    expect(get(base, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(base, `/flowIsKnockedOut`).get).toBe(false);
    expect(get(noRental, `/flowIsKnockedOut`).get).toBe(false);
    expect(get(noRental, `/totalIncome`).get.toString()).toBe(get(base, `/totalIncome`).get.toString());
    // The K-1 question is required even with no Part I income. While it is blank the knockout stays complete
    // false, so /flowIsKnockedOut stays complete false, and the section is not done.
    for (const g of [base, noRental]) {
      expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(true);
      expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(false);
      expect(get(g, `/scheduleESectionIsComplete`).get).toBe(false);
    }
    expect(get(answeredNo, `/scheduleESectionIsComplete`).get).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleEPartII`).complete).toBe(true);
    expect(get(answeredNo, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(answeredNo, `/flowIsKnockedOut`).get).toBe(false);
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
      `K-1 income (Parts II-IV)`,
      `/flowKnockoutScheduleEPartII`,
      { '/scheduleEHasPartIIIncome': createBooleanWrapper(true) },
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

  it(`K-1 only: Schedule E and Schedule 1 line 5 stay $0 and the return is knocked out (#232)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleENetIncome`,
      `/schedule1Line5`,
      `/flowKnockoutScheduleEPartII`,
      `/flowIsKnockedOut`,
    ];
    // No rental or royalty income. 2026 draft Instructions for Schedule E, PDF p. 11 and p. 14, require the
    // partnership, S corporation, estate, or trust share "even if not received" (26 U.S.C. 702(a), 1366(a),
    // 652(a), 662(a)). Part I line 26 / Schedule 1 line 5 do not include it.
    const g = fg({
      '/hadScheduleEIncome': createBooleanWrapper(false),
      '/scheduleEHasPartIIIncome': createBooleanWrapper(true),
    });
    expect(get(g, `/hasScheduleEIncome`).get).toBe(false);
    expect(get(g, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(g, `/schedule1Line5`).get.toString()).toBe(`0.00`);
    expect(get(g, `/flowKnockoutScheduleEPartII`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEPartII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
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
      '/scheduleCBusinesses': createCollectionWrapper([businessId]),
      [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Gig Work`),
      [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`10000`),
      [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`2000`),
      [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
      '/hadScheduleEIncome': createBooleanWrapper(false),
    };
    const withoutK1 = fg({ ...scheduleC, '/scheduleEHasPartIIIncome': createBooleanWrapper(false) });
    const withK1 = fg({ ...scheduleC, '/scheduleEHasPartIIIncome': createBooleanWrapper(true) });
    expect(get(withoutK1, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(withoutK1, `/flowKnockoutScheduleEPartII`).get).toBe(false);
    expect(get(withK1, `/primaryFilerSeNetProfit`).get.toString()).toBe(`8000.00`);
    expect(get(withK1, `/selfEmploymentTax`).get.toString()).toBe(get(withoutK1, `/selfEmploymentTax`).get.toString());
    expect(get(withK1, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
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
