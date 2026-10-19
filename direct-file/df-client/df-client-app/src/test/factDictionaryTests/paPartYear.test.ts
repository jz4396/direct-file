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
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
    // #123: PA interest (PA period only) differs from federal, so PA Schedule A is required (PA-40 IN (2025) p. 31),
    // and the March sale needs PA Schedule D (p. 17); neither is produced.
    expect(get(g, `/flowKnockoutPaScheduleA`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaScheduleD`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
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
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
    // #123: the October sale (PA period) needs PA Schedule D, which isn't produced.
    expect(get(g, `/flowKnockoutPaScheduleD`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaScheduleA`).get).toBe(false);
  });

  it(`#123: moves PA -> FL, only a sale after the move (FL period): no PA Schedule D, return not stopped`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleD`, `/paSchoolCodeMovedOut`, `/paAskSchoolDistrictCode`];
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...w2s({ id: paW2, wages: 30000, state: `pa`, box16: 30000, box17: 921 }),
      '/form8949Transactions': createCollectionWrapper([tx2]),
      ...tx(tx2, `2026-10-15`, 15000, 10000),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(val(g, `/paLine5`)).toBe(`0.00`);
    expect(get(g, `/flowKnockoutPaScheduleD`).get).toBe(false);
    // PA-40 IN (2025) p. 6: not in PA on Dec. 31, so the school code is 99999 and the filer is not asked.
    expect(get(g, `/paSchoolCodeMovedOut`).get).toBe(true);
    expect(get(g, `/paAskSchoolDistrictCode`).get).toBe(false);
    expect(val(g, `/paSchoolCode`)).toBe(`99999`);
    notStopped(g);
  });

  it(`#123: moves FL -> PA: lived in PA on Dec. 31, so the school district code is asked (p. 6)`, ({ task }) => {
    task.meta.testedFactPaths = [`/paAskSchoolDistrictCode`, `/paSchoolCode`];
    const g = build(singleFilerData, {
      ...move(`flToPa`, `2026-04-01`),
      ...w2s({ id: paW2, wages: 45000, state: `pa`, box16: 45000, box17: 1381.5 }),
      '/paSchoolDistrictCode': createStringWrapper(`67940`),
    });
    expect(get(g, `/paSchoolCodeMovedOut`).get).toBe(false);
    expect(get(g, `/paAskSchoolDistrictCode`).get).toBe(true);
    expect(val(g, `/paSchoolCode`)).toBe(`67940`);
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

/**
 * #107: Schedule SP whole-year Eligibility Income for a part-year resident. PA-40 IN (2025):
 * p. 37, "Nonresidents and Part-Year Residents": "Such taxpayers must include in their eligibility income all income
 * as described whether earned within or outside Pennsylvania."
 * p. 38, line 6: "6. Non-PA income. Part-year residents and nonresidents must complete this line. Enter the total of
 * all income, not already reported on this schedule, that you (and your spouse, if applicable) earned, received or
 * realized while residing outside Pennsylvania."
 * p. 39, Table 1 (unmarried, no dependents): 100% up to "$6,500", then 90% ... 10% in $250 columns up to $8,750.
 * p. 21, LINE 12: "Multiply Line 11 by 3.07 percent (0.0307)."
 */
describe(`PA part-year Schedule SP: whole-year Eligibility Income (line 6, #107)`, () => {
  const noSpIncome = { '/paHasSpNontaxableIncome': createBooleanWrapper(false) };
  const paLow = (box: number) => ({ id: paW2, wages: box, state: `pa`, box16: box, box17: 0 } as const);
  const sp = (flWages: number, paWages = 4000) =>
    build(singleFilerData, {
      ...move(`paToFl`),
      ...noSpIncome,
      ...w2s(paLow(paWages), { id: flW2, wages: flWages, state: `fl`, resWages: 0 }),
    });

  it(`PA-period income under the table, whole-year income over it: no forgiveness and no stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpLine6`, `/paSpLine11`, `/paSpCouldQualify`, `/paLine21`];
    const g = sp(40000, 5000);
    expect(val(g, `/paSpLine1`)).toBe(`5000.00`);
    expect(val(g, `/paSpLine6`)).toBe(`40000.00`); // FL wages earned after the move
    expect(val(g, `/paSpLine11`)).toBe(`45000.00`);
    expect(get(g, `/paSpCouldQualify`).get).toBe(false);
    expect(val(g, `/paSpLine15`)).toBe(`0/1`);
    expect(val(g, `/paLine21`)).toBe(`0.00`);
    expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(false);
    notStopped(g);
  });

  it(`under the table for the whole year: 100% forgiveness is computed`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpLine15`, `/paSpLine16`, `/flowShowPaSpQuestion`];
    const g = sp(2000);
    expect(get(g, `/flowShowPaSpQuestion`).get).toBe(true); // part-year filers now get the nontaxable-income question
    expect(val(g, `/paSpLine6`)).toBe(`2000.00`);
    expect(val(g, `/paSpLine11`)).toBe(`6000.00`);
    expect(val(g, `/paLine12`)).toBe(`122.80`); // 4,000 x 0.0307
    expect(val(g, `/paSpLine15`)).toBe(`1/1`);
    expect(val(g, `/paLine21`)).toBe(`122.80`);
    expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(false);
    notStopped(g);
  });

  it(`table boundaries with line 6 > 0 ($6,750 -> 90%, $6,751 -> 80%, $8,750 -> 10%, $8,751 -> 0)`, () => {
    const at = (fl: number) => sp(fl);
    expect(val(at(2750), `/paSpLine11`)).toBe(`6750.00`);
    expect(val(at(2750), `/paSpLine15`)).toBe(`9/10`);
    expect(val(at(2750), `/paLine21`)).toBe(`110.52`); // 122.80 x 0.90
    expect(val(at(2751), `/paSpLine15`)).toBe(`8/10`);
    expect(val(at(4750), `/paSpLine15`)).toBe(`1/10`);
    expect(val(at(4750), `/paLine21`)).toBe(`12.28`);
    expect(val(at(4751), `/paSpLine15`)).toBe(`0/1`);
    expect(get(at(4751), `/paSpCouldQualify`).get).toBe(false);
  });

  it(`line 6 adds FL-period interest and FL-period sales; PA-period amounts stay on line 1`, () => {
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...noSpIncome,
      ...w2s(paLow(3000)),
      ...interest(1000),
      '/paPartYearResidentInterest': createDollarWrapper(`400`),
      ...sales([12000, 10000], [15000, 10000]),
    });
    expect(val(g, `/paLine9`)).toBe(`5400.00`); // 3,000 + 400 interest + 2,000 March sale
    expect(val(g, `/paSpNonPaPeriodInterest`)).toBe(`600.00`);
    expect(val(g, `/paSpNonPaPeriodGainOrLoss`)).toBe(`5000.00`); // October sale
    expect(val(g, `/paSpLine6`)).toBe(`5600.00`);
    expect(val(g, `/paSpLine11`)).toBe(`11000.00`);
  });

  it(`FL W-2 compensation is measured with elective deferrals (PA-40 IN p. 12)`, () => {
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...noSpIncome,
      ...w2s(paLow(3000), { id: flW2, wages: 3000, state: `fl`, resWages: 500 }),
      [`/formW2s/#${flW2}/401kDeferrals`]: createDollarWrapper(`1000`),
    });
    expect(val(g, `/paLine1a`)).toBe(`3500.00`); // 500 allocated to the PA period
    expect(val(g, `/paSpLine6`)).toBe(`3500.00`); // 3,000 + 1,000 deferral - 500
  });

  it(`a PA W-2 with box 1 above box 16 adds the difference to line 6`, () => {
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...noSpIncome,
      ...w2s({ id: paW2, wages: 10000, state: `pa`, box16: 6000, box17: 0 }),
    });
    expect(val(g, `/paLine1a`)).toBe(`6000.00`);
    expect(val(g, `/paSpLine6`)).toBe(`4000.00`);
  });

  it(`a net loss from FL-period sales stops the return when forgiveness is possible`, ({ task }) => {
    task.meta.testedFactPaths = [`/paSpNonPaPeriodGainOrLoss`, `/flowKnockoutPaSpUnsupported`];
    const g = build(singleFilerData, {
      ...move(`paToFl`),
      ...noSpIncome,
      ...w2s(paLow(3000)),
      ...sales([10000, 10000], [5000, 8000]),
    });
    expect(val(g, `/paSpNonPaPeriodGainOrLoss`)).toBe(`-3000.00`);
    expect(val(g, `/paSpLine6`)).toBe(`0.00`);
    expect(get(g, `/paSpCouldQualify`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaSpUnsupported`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`full-year PA resident: line 6 is $0`, () => {
    const g = build(singleFilerData, {
      '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
      ...noSpIncome,
      ...w2s({ id: paW2, wages: 10000, state: `pa`, box16: 6000, box17: 0 }),
    });
    expect(val(g, `/paSpLine6`)).toBe(`0.00`);
    expect(val(g, `/paSpLine11`)).toBe(`6000.00`);
  });
});
