import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, filerWithRefundDueData, primaryFilerId, uuid } from '../testData.js';

/**
 * Schedule E Part I MVP (#38). Cites live in backend/src/main/resources/tax/scheduleE.xml:
 * Schedule E (2026 draft) lines 3, 4, 20, 21, 26 -> Schedule 1 line 5; 26 U.S.C. 61(a)(5)-(6), 212;
 * knockouts: 469 / 465 / 461(l) (loss), Form 4562 (depreciation), 280A (personal use), Parts II-IV, 32(i)(2)(C).
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
    task.meta.testedFactPaths = [`/scheduleENetIncome`, `/flowIsKnockedOut`, `/totalIncome`];
    const base = fg();
    const no = fg({ '/hadScheduleEIncome': createBooleanWrapper(false) });
    expect(get(base, `/scheduleENetIncome`).get.toString()).toBe(`0.00`);
    expect(get(base, `/flowIsKnockedOut`).get).toBe(false);
    expect(get(no, `/flowIsKnockedOut`).get).toBe(false);
    expect(get(no, `/totalIncome`).get.toString()).toBe(get(base, `/totalIncome`).get.toString());
    expect(get(base, `/scheduleESectionIsComplete`).get).toBe(false);
    expect(get(no, `/scheduleESectionIsComplete`).get).toBe(true);
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
