import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeInterestReportData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

/**
 * #80 PA part-year residency (PA <-> FL). PA-40 IN (2025) booklet:
 * p. 6 (P) Part-Year Resident: "PA law taxes part-year residents on all income from all sources while a PA
 * resident, and all income (loss) earned, received, and realized from PA sources when not a resident of
 * Pennsylvania." p. 43: "As a nonresident, you do not pay PA income tax on ordinary interest, ordinary dividends,
 * and any gain you realize on the sale, exchange, or disposition of intangible personal property".
 */
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get.toString();
const paW2 = `80aa0000-0000-4000-8000-000000000001`;
const flW2 = `80aa0000-0000-4000-8000-000000000002`;
const intId = `80aa0000-0000-4000-8000-000000000003`;
const tx1 = `80aa0000-0000-4000-8000-000000000004`;
const tx2 = `80aa0000-0000-4000-8000-000000000005`;
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
type W2 = {
  id: string;
  wages: number;
  state: `pa` | `fl` | `other`;
  box16?: number;
  box17?: number;
  resWages?: number;
};
const w2s = (...forms: W2[]) => {
  let out: Record<string, unknown> = {};
  for (const f of forms) {
    out = {
      ...out,
      ...makeW2Data(f.wages, f.id),
      [`/formW2s/#${f.id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
      [`/formW2s/#${f.id}/paPartYearW2State`]: createEnumWrapper(f.state, `/paPartYearW2StateOptions`),
      ...(f.box16 === undefined ? {} : { [`/formW2s/#${f.id}/writableStateWages`]: createDollarWrapper(`${f.box16}`) }),
      [`/formW2s/#${f.id}/writableStateWithholding`]: createDollarWrapper(`${f.box17 ?? 0}`),
      ...(f.resWages === undefined
        ? {}
        : { [`/formW2s/#${f.id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`${f.resWages}`) }),
    };
  }
  out[`/formW2s`] = createCollectionWrapper(forms.map((f) => f.id));
  return out;
};
const move = (m: `paToFl` | `flToPa` | `other`, date = `2026-07-01`) => ({
  '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
  '/paPartYearMove': createEnumWrapper(m, `/paPartYearMoveOptions`),
  '/paPartYearMoveDate': createDayWrapper(date),
});
const build = (status: Record<string, unknown>, extra: Record<string, unknown>) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
    '/soldCapitalAssets': createBooleanWrapper(false),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
    ...extra,
  }).factGraph;
const interest = (box1: number) => ({
  ...makeInterestReportData(0, intId, primaryFilerId),
  [`/interestReports/#${intId}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${intId}/writable1099Amount`]: createDollarWrapper(`${box1}`),
});
const tx = (id: string, sold: string, proceeds: number, basis: number) => ({
  [`/form8949Transactions/#${id}/description`]: createStringWrapper(`100 sh XYZ`),
  [`/form8949Transactions/#${id}/dateAcquired`]: createDayWrapper(`2020-06-01`),
  [`/form8949Transactions/#${id}/dateSold`]: createDayWrapper(sold),
  [`/form8949Transactions/#${id}/proceeds`]: createDollarWrapper(`${proceeds}`),
  [`/form8949Transactions/#${id}/costBasis`]: createDollarWrapper(`${basis}`),
  [`/form8949Transactions/#${id}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${id}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});
const sales = (before: [number, number], after: [number, number]) => ({
  '/form8949Transactions': createCollectionWrapper([tx1, tx2]),
  ...tx(tx1, `2026-03-15`, ...before),
  ...tx(tx2, `2026-10-15`, ...after),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});
const notStopped = (g: Fg) => {
  expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
  expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
  expect(get(g, `/flowKnockoutUnsupportedState`).get).toBe(false);
  expect(get(g, `/flowKnockoutBox15IncomeFromDifferentState`).get).toBe(false);
};

describe(`PA part-year residency (#80)`, () => {
  it(`moves PA -> FL on July 1: PA W-2 box 16, FL W-2 resident-period share, resident-period interest and sales`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/paPartYearSupported`,
      `/stateReturnIsPaPartYear`,
      `/paResidencyStatusPartYear`,
      `/paLine1a`,
      `/paLine2`,
      `/paLine5`,
      `/paLine12`,
      `/paLine13`,
    ];
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...w2s(
        { id: paW2, wages: 30000, state: `pa`, box16: 30000, box17: 921 },
        { id: flW2, wages: 40000, state: `fl`, resWages: 0 }
      ),
      ...interest(1000),
      '/paPartYearResidentInterest': createDollarWrapper(`400`),
      ...sales([12000, 10000], [15000, 10000]),
    });
    expect(get(g, `/stateReturnIsPa`).get).toBe(false);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(true);
    expect(val(g, `/filingStateOrProvince`)).toBe(`pa`);
    expect(val(g, `/paLine1a`)).toBe(`30000.00`); // FL wages earned after the move are not PA-taxable
    expect(val(g, `/paLine2`)).toBe(`400.00`);
    expect(val(g, `/paLine5`)).toBe(`2000.00`); // March sale only; October sale was while a FL resident
    expect(val(g, `/paLine9`)).toBe(`32400.00`);
    expect(val(g, `/paLine12`)).toBe(`994.68`); // 32,400 x 0.0307
    expect(val(g, `/paLine13`)).toBe(`921.00`);
    expect(val(g, `/stateAmountOwed`)).toBe(`73.68`);
    notStopped(g);
  });

  it(`moves FL -> PA on April 1: FL W-2 allocation for the PA period + PA W-2; sale before the move excluded`, () => {
    const g = build(singleFilerData, {
      ...move(`flToPa`, `2026-04-01`),
      ...w2s(
        { id: flW2, wages: 25000, state: `fl`, resWages: 5000 },
        { id: paW2, wages: 45000, state: `pa`, box16: 45000, box17: 1381.5 }
      ),
      ...sales([12000, 10000], [15000, 10000]),
    });
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(true);
    expect(val(g, `/paLine1a`)).toBe(`50000.00`);
    expect(val(g, `/paLine5`)).toBe(`5000.00`); // only the October sale, after moving in
    expect(val(g, `/paLine9`)).toBe(`55000.00`);
    expect(val(g, `/paLine12`)).toBe(`1688.50`);
    expect(val(g, `/paLine29`)).toBe(`0.00`);
    expect(val(g, `/paLine26`)).toBe(`306.50`); // 1,688.50 - 1,382 (box 17 rounds to whole dollars)
    notStopped(g);
  });

  it(`PA-source wages earned while living in FL are PA-taxable (PA W-2 box 16 for the whole year)`, () => {
    const g = build(singleFilerData, {
      ...move(`paToFl`, `2026-03-01`),
      ...w2s({ id: paW2, wages: 57000, state: `pa`, box16: 60000, box17: 1842 }),
    });
    expect(val(g, `/paLine1a`)).toBe(`60000.00`);
    expect(val(g, `/paLine2`)).toBe(`0.00`); // no interest: allocation question not needed
    expect(val(g, `/paLine12`)).toBe(`1842.00`);
    expect(val(g, `/paLine29`)).toBe(`0.00`);
    notStopped(g);
  });

  it(`resident-period interest is capped at the year's PA-taxable interest`, () => {
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...w2s({ id: paW2, wages: 30000, state: `pa`, box16: 30000, box17: 0 }),
      ...interest(300),
      '/paPartYearResidentInterest': createDollarWrapper(`900`),
    });
    expect(val(g, `/paInterestFullYear`)).toBe(`300.00`);
    expect(val(g, `/paLine2`)).toBe(`300.00`);
  });

  it(`full-year PA resident is unchanged (box 16, not a part-year return)`, () => {
    const g = build(singleFilerData, {
      '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
      ...w2s({ id: paW2, wages: 57000, state: `pa`, box16: 60000, box17: 2000 }),
    });
    expect(get(g, `/paPartYearSupported`).get).toBe(false);
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(false);
    expect(val(g, `/paLine1a`)).toBe(`60000.00`);
    expect(val(g, `/paLine29`)).toBe(`158.00`);
  });
});

describe(`PA part-year stops (BlockSubmissionOnTrue, in /flowIsKnockedOut)`, () => {
  const blocks = (g: Fg) => {
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaPartYear`);
  };
  const ok = { id: paW2, wages: 30000, state: `pa`, box16: 30000, box17: 921 } as const;
  it(`a move involving a third state stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/paPartYearSupported`, `/flowKnockoutUnsupportedState`, `/flowIsKnockedOut`];
    const g = build(singleFilerData, { ...move(`other`), ...w2s(ok) });
    expect(get(g, `/paPartYearSupported`).get).toBe(false);
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(g, `/flowKnockoutUnsupportedState`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
  it(`a W-2 from a state other than PA or FL`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaPartYear`];
    blocks(build(singleFilerData, { ...move(`paToFl`), ...w2s(ok, { id: flW2, wages: 9000, state: `other` }) }));
  });
  it(`a FL W-2 with box 17 state tax withheld`, () => {
    blocks(
      build(singleFilerData, {
        ...move(`paToFl`),
        ...w2s(ok, { id: flW2, wages: 9000, state: `fl`, resWages: 0, box16: 9000, box17: 100 }),
      })
    );
  });
  it(`a joint return`, () => {
    blocks(build(mfjFilerData, { ...move(`paToFl`), ...w2s(ok) }));
  });
  it(`a move date outside the tax year (or on Jan. 1)`, () => {
    blocks(build(singleFilerData, { ...move(`paToFl`, `2026-01-01`), ...w2s(ok) }));
    blocks(build(singleFilerData, { ...move(`flToPa`, `2027-02-01`), ...w2s(ok) }));
  });
});
