// #86 part a: Form 1099-DIV boxes 1a, 1b, 2a, 3, 4, 5 and 7.
// Form 1040 instr. (2025; the 2026 instructions are not yet posted) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf
// p. 26 line 3b: "Enter your total ordinary dividends on line 3b. This amount should be shown in box 1a of
// Form(s) 1099-DIV." p. 25 line 3a: "Enter your total qualified dividends on line 3a. Qualified dividends are also
// included in the ordinary dividend total required to be shown on line 3b." p. 39 line 25b: withholding shown on
// Form 1099 (1099-DIV box 4). Form 1099-DIV (Rev. December 2027) draft, Instructions for Recipient,
// https://www.irs.gov/pub/irs-dft/f1099div--dft.pdf.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createDayWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  mfjFilerData,
  mfsFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get.toString();
const d1 = `86a00000-0000-4000-8000-000000000001`;
const d2 = `86a00000-0000-4000-8000-000000000002`;
const w2Id = `86a00000-0000-4000-8000-000000000003`;
const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

type Div = {
  id?: string;
  filer?: string;
  box1a: number;
  box1b?: number;
  box2a?: number;
  box3?: number;
  box4?: number;
  box5?: number;
  box7?: number;
  holdingNotMet?: boolean;
  overBasis?: boolean;
  otherBoxes?: boolean;
  nominee?: boolean;
  ftcOk?: boolean;
};
const opt = (id: string, name: string, v: number | undefined) =>
  v === undefined ? {} : { [`/dividendReports/#${id}/writable${name}`]: createDollarWrapper(`${v}`) };
const divItem = (f: Div) => {
  const id = f.id ?? d1;
  return {
    [`/dividendReports/#${id}/filer`]: createCollectionItemWrapper(f.filer ?? primaryFilerId),
    [`/dividendReports/#${id}/payer`]: createStringWrapper(`Index Fund Co`),
    [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`${f.box1a}`),
    ...opt(id, `QualifiedDividends`, f.box1b),
    ...opt(id, `CapitalGainDistributions`, f.box2a),
    ...opt(id, `NondividendDistributions`, f.box3),
    ...opt(id, `FederalTaxWithheld`, f.box4),
    ...opt(id, `Section199ADividends`, f.box5),
    ...opt(id, `ForeignTaxPaid`, f.box7),
    ...(f.box1b
      ? {
          [`/dividendReports/#${id}/qualifiedDividendsHoldingPeriodNotMet`]: createBooleanWrapper(
            f.holdingNotMet ?? false
          ),
        }
      : {}),
    ...(f.box7
      ? { [`/dividendReports/#${id}/foreignTaxElectionRequirementsMet`]: createBooleanWrapper(f.ftcOk ?? true) }
      : {}),
    ...(f.box3
      ? { [`/dividendReports/#${id}/nondividendDistributionsExceedBasis`]: createBooleanWrapper(f.overBasis ?? false) }
      : {}),
    [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(f.otherBoxes ?? false),
    [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(f.nominee ?? false),
    [`/dividendReports/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  };
};
const divs = (...forms: Div[]) => {
  let out: Record<string, unknown> = {};
  forms.forEach((f, i) => (out = { ...out, ...divItem({ id: [d1, d2][i], ...f }) }));
  return {
    ...out,
    '/dividendReports': createCollectionWrapper(forms.map((_, i) => [d1, d2][i])),
    '/dividendReportsIsDone': createBooleanWrapper(true),
  };
};
const state = (s: string) => ({ '/filerResidenceAndIncomeState': createEnumWrapper(s, `/scopedStateOptions`) });
const paW2 = (wages: number) => ({
  ...makeW2Data(wages, w2Id),
  [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
  [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`${wages}`),
  [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(`0`),
});
const build = (extra: Record<string, unknown>, status: Record<string, unknown> = singleFilerData) =>
  setupFactGraph({
    ...noW2,
    ...baseFilerData,
    ...status,
    [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
    '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
    '/soldCapitalAssets': createBooleanWrapper(false),
    '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
    '/paHasExemptObligationDividends': createBooleanWrapper(false),
    '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
    '/paHasSpNontaxableIncome': createBooleanWrapper(false),
    ...state(`nj`),
    ...paW2(40000),
    ...extra,
  }).factGraph;

const FEDERAL_KOS = [
  `/flowKnockoutDividendUnsupportedBoxes`,
  `/flowKnockoutNondividendDistributionsOverBasis`,
  `/flowKnockoutQualifiedDividendsHoldingPeriod`,
  `/flowKnockoutSection199ADividends`,
  `/flowKnockoutDividendForeignTaxPaid`,
  `/flowKnockoutDividendNominee`,
  `/flowKnockoutDividendAmountsInconsistent`,
];
const noKnockouts = (g: Fg) => {
  FEDERAL_KOS.forEach((k) => expect(get(g, k).get, k).toBe(false));
  expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
  expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
};
const blocks = (g: Fg, k: string) => {
  expect(get(g, k).get).toBe(true);
  expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  expect(submissionBlockingFacts).toContain(k);
  FEDERAL_KOS.filter((o) => o !== k).forEach((o) => expect(get(g, o).get, o).toBe(false));
};

describe(`1099-DIV box mappings`, () => {
  it(`box 1a sums to Form 1040 line 3b and total income; box 1b sums to line 3a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/ordinaryDividends`,
      `/dividendReports/*/qualifiedDividends`,
      `/totalOrdinaryDividends`,
      `/totalQualifiedDividends`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/hasDividendIncome`,
      `/totalIncome`,
    ];
    const g = build(divs({ box1a: 600, box1b: 400 }, { box1a: 250.6, box1b: 100 }));
    expect(val(g, `/totalOrdinaryDividends`)).toBe(`850.60`);
    expect(val(g, `/totalQualifiedDividends`)).toBe(`500.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`851.00`); // line 3b, whole dollars
    expect(val(g, `/qualifiedDividends`)).toBe(`500.00`); // line 3a
    expect(get(g, `/hasDividendIncome`).get).toBe(true);
    expect(val(g, `/totalIncome`)).toBe(`40851.00`);
    noKnockouts(g);
  });
  it(`qualified dividends reach the existing QDCG tax worksheet (line 3a feeds its line 2)`, ({ task }) => {
    task.meta.testedFactPaths = [`/qualifiedDividends`, `/usesQdcgTaxWorksheet`];
    expect(get(build(divs({ box1a: 1000, box1b: 1000 })), `/usesQdcgTaxWorksheet`).get).toBe(true);
    expect(get(build(divs({ box1a: 1000 })), `/usesQdcgTaxWorksheet`).get).toBe(false);
  });
  it(`blank box 1b is $0 qualified, not incomplete`, () => {
    const g = build(divs({ box1a: 300 }));
    expect(val(g, `/qualifiedDividends`)).toBe(`0.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`300.00`);
  });
  it(`box 4 backup withholding adds to Form 1040 line 25b`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/federalTaxWithheld`,
      `/totalDividendFederalTaxWithheld`,
      `/form1099Withholding`,
    ];
    const without = build(divs({ box1a: 500 }));
    const withBox4 = build(divs({ box1a: 500, box4: 120 }));
    expect(val(withBox4, `/totalDividendFederalTaxWithheld`)).toBe(`120.00`);
    const diff = Number(val(withBox4, `/form1099Withholding`)) - Number(val(without, `/form1099Withholding`));
    expect(diff).toBe(120);
    noKnockouts(withBox4);
  });
  it(`box 3 at or below basis is not income (reduces basis) and does not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/nondividendDistributions`, `/totalNondividendDistributions`];
    const g = build(divs({ box1a: 500, box3: 900, overBasis: false }));
    expect(val(g, `/totalNondividendDistributions`)).toBe(`900.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`500.00`);
    expect(val(g, `/totalIncome`)).toBe(`40500.00`);
    noKnockouts(g);
  });
  it(`section not started (no collection): totals are a complete $0, so other lines stay computable`, () => {
    const g = build({});
    [`/totalOrdinaryDividends`, `/ordinaryDividends`, `/qualifiedDividends`, `/totalIncome`].forEach((p) =>
      expect(get(g, p).complete, p).toBe(true)
    );
    expect(val(g, `/ordinaryDividends`)).toBe(`0.00`);
    expect(get(g, `/dividendReportsIsDone`).get).toBe(false); // /flowIncomplete still requires the section
    noKnockouts(g);
  });
  it(`no 1099-DIVs: dividends $0, nothing blocks`, () => {
    const g = build({
      '/dividendReports': createCollectionWrapper([]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
    });
    expect(val(g, `/ordinaryDividends`)).toBe(`0.00`);
    expect(get(g, `/hasDividendIncome`).get).toBe(false);
    noKnockouts(g);
  });
});

describe(`1099-DIV knockouts (BlockSubmissionOnTrue, in /flowIsKnockedOut)`, () => {
  it(`box 3 above basis (capital gain)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutNondividendDistributionsOverBasis`];
    blocks(build(divs({ box1a: 500, box3: 900, overBasis: true })), `/flowKnockoutNondividendDistributionsOverBasis`);
  });
  it(`box 1b dividends that fail the holding period`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutQualifiedDividendsHoldingPeriod`];
    blocks(
      build(divs({ box1a: 500, box1b: 300, holdingNotMet: true })),
      `/flowKnockoutQualifiedDividendsHoldingPeriod`
    );
  });
  it(`box 5 section 199A dividends > 0`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutSection199ADividends`, `/totalSection199ADividends`];
    blocks(build(divs({ box1a: 500, box5: 50 })), `/flowKnockoutSection199ADividends`);
    // #185: Rev. synthetic case, box 5 $100 also stops the return (QBI line 13b not computed).
    blocks(build(divs({ box1a: 100, box5: 100 })), `/flowKnockoutSection199ADividends`);
  });
  it(`box 7 within the 26 U.S.C. 904(j) election goes to Schedule 3 line 1 (i1040 (2025) p. 115)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/foreignTaxElectionRequirementsMet`,
      `/dividendForeignTaxElectionLimit`,
      `/dividendForeignTaxCredit`,
      `/sched3Line1`,
      `/hasSchedule3`,
      `/flowKnockoutDividendForeignTaxPaid`,
    ];
    const g = build(divs({ box1a: 500, box7: 12.4, ftcOk: true }));
    expect(val(g, `/totalDividendForeignTaxPaid`)).toBe(`12.40`);
    expect(val(g, `/dividendForeignTaxElectionLimit`)).toBe(`300.00`);
    expect(val(g, `/sched3Line1`)).toBe(`12.00`); // smaller of total foreign tax or line 16 + Sch 2 line 1a
    expect(get(g, `/hasSchedule3`).get).toBe(true);
    const lessCredit =
      Number(val(build(divs({ box1a: 500 })), `/taxLessNonRefundableCredits`)) -
      Number(val(g, `/taxLessNonRefundableCredits`));
    expect(lessCredit).toBe(12);
    noKnockouts(g);
  });
  it(`box 7: no to the 904(j) requirements, or over $300 ($600 MFJ), needs Form 1116 and stops the return`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendForeignTaxPaid`, `/totalDividendForeignTaxPaid`];
    blocks(build(divs({ box1a: 500, box7: 12, ftcOk: false })), `/flowKnockoutDividendForeignTaxPaid`);
    blocks(build(divs({ box1a: 5000, box7: 300.01, ftcOk: true })), `/flowKnockoutDividendForeignTaxPaid`);
    expect(get(build(divs({ box1a: 5000, box7: 300, ftcOk: true })), `/flowKnockoutDividendForeignTaxPaid`).get).toBe(
      false
    );
    const mfj = build(divs({ box1a: 5000, box7: 600, ftcOk: true }), mfjFilerData);
    expect(val(mfj, `/dividendForeignTaxElectionLimit`)).toBe(`600.00`);
    expect(get(mfj, `/flowKnockoutDividendForeignTaxPaid`).get).toBe(false);
    blocks(
      build(divs({ box1a: 5000, box7: 600.01, ftcOk: true }), mfjFilerData),
      `/flowKnockoutDividendForeignTaxPaid`
    );
  });
  it(`box 7 credit is limited to Form 1040 line 16 plus Schedule 2 line 1a`, () => {
    const g = build({ ...divs({ box1a: 500, box7: 250, ftcOk: true }), ...paW2(14000) });
    const line16 = Number(val(g, `/tentativeTaxFromTaxableIncome`));
    expect(line16).toBeLessThan(250);
    expect(Number(val(g, `/sched3Line1`))).toBe(line16);
  });
  it(`box 1b or box 5 larger than box 1a`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/amountsInconsistent`, `/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 100, box1b: 150 })), `/flowKnockoutDividendAmountsInconsistent`);
  });
  it(`any other box (2b-2f, 6, 8-16)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendUnsupportedBoxes`];
    blocks(build(divs({ box1a: 100, otherBoxes: true })), `/flowKnockoutDividendUnsupportedBoxes`);
  });
  it(`received as nominee`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`];
    blocks(build(divs({ box1a: 100, nominee: true })), `/flowKnockoutDividendNominee`);
  });
  it(`ordinary dividends over $1,500 do not stop the return (Schedule B Part II lines 5-6)`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/roundedOrdinaryDividends`, `/dividendReports/*/payer`];
    const g = build(divs({ box1a: 1000.4 }, { box1a: 500.5 }));
    expect(val(g, `/ordinaryDividends`)).toBe(`1501.00`);
    expect(val(g, `/dividendReports/#${d1}/roundedOrdinaryDividends`)).toBe(`1000.00`);
    expect(val(g, `/dividendReports/#${d2}/roundedOrdinaryDividends`)).toBe(`501.00`);
    expect(val(g, `/dividendReports/#${d1}/payer`)).toBe(`Index Fund Co`);
    noKnockouts(g);
  });
  it(`Schedule B: ordinary dividends over $1,500 on the whole-dollar total, same rounding as interest`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleBForOrdinaryDividends`, `/requiresScheduleB`];
    const under = build(divs({ box1a: 1000.25 }, { box1a: 500.24 })); // $1,500.49 -> $1,500
    expect(get(under, `/requiresScheduleBForOrdinaryDividends`).get).toBe(false);
    expect(get(under, `/requiresScheduleB`).get).toBe(false);
    const over = build(divs({ box1a: 1000.25 }, { box1a: 500.25 })); // $1,500.50 -> $1,501
    expect(get(over, `/requiresScheduleBForOrdinaryDividends`).get).toBe(true);
    expect(get(over, `/requiresScheduleB`).get).toBe(true);
    noKnockouts(over);
  });
  it(`an incomplete 1099-DIV blocks submission`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasIncompleteDividendReports`];
    const g = build({
      '/dividendReports': createCollectionWrapper([d1]),
      [`/dividendReports/#${d1}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`/dividendReports/#${d1}/ordinaryDividends`]: createDollarWrapper(`100`),
    });
    expect(get(g, `/hasIncompleteDividendReports`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/hasIncompleteDividendReports`);
  });
  it(`a spouse's 1099-DIV blocks when not filing jointly`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/secondaryFilerUsedWithoutMFJ`];
    expect(
      get(build(divs({ box1a: 100, filer: spouseId }), mfjFilerData), `/dividendReports/secondaryFilerUsedWithoutMFJ`)
        .get
    ).toBe(false);
    const mfs = build(divs({ box1a: 100, filer: spouseId }), mfsFilerData);
    expect(get(mfs, `/dividendReports/secondaryFilerUsedWithoutMFJ`).get).toBe(true);
    // Blocks submission (BlockSubmissionOnTrue), like /interestReports/secondaryFilerUsedWithoutMFJ; not a flow knockout.
    expect(submissionBlockingFacts).toContain(`/dividendReports/secondaryFilerUsedWithoutMFJ`);
  });
});

describe(`PA-40 line 3 dividends (PA-40 IN (2025) p. 15 and PA Schedule B p. 32)`, () => {
  const paBuild = (extra: Record<string, unknown>) => build({ ...state(`pa`), ...extra });
  it(`line 3 = federal Form 1040 line 3b; no Schedule B adjustment`, ({ task }) => {
    task.meta.testedFactPaths = [`/paLine3`, `/paAskExemptObligationDividends`, `/flowKnockoutPaDividends`];
    const g = paBuild({
      ...divs({ box1a: 700, box1b: 500 }),
      '/paHasExemptObligationDividends': createBooleanWrapper(false),
    });
    expect(get(g, `/paAskExemptObligationDividends`).get).toBe(true);
    expect(val(g, `/paLine3`)).toBe(`700.00`);
    expect(val(g, `/paLine9`)).toBe(`40700.00`);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`dividends from U.S. or PA obligations (PA Schedule B line 3) stop the PA return`, ({ task }) => {
    task.meta.testedFactPaths = [`/paHasExemptObligationDividends`, `/flowKnockoutPaDividends`];
    const g = paBuild({ ...divs({ box1a: 700 }), '/paHasExemptObligationDividends': createBooleanWrapper(true) });
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaDividends`);
  });
  it(`PA/FL part-year: dividends received while not a PA resident (PA Schedule B line 4) stop the return`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/paPartYearHasDividends`,
      `/paPartYearResidentDividends`,
      `/paPartYearNonresidentDividends`,
      `/paLine3`,
      `/flowKnockoutPaDividends`,
    ];
    const partYear = (resident?: string) =>
      build({
        ...divs({ box1a: 700 }),
        '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
        '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
        '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
        [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
        [`/formW2s/#${w2Id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`40000`),
        '/paHasExemptObligationDividends': createBooleanWrapper(false),
        ...(resident === undefined ? {} : { '/paPartYearResidentDividends': createDollarWrapper(resident) }),
      });
    const stopped = partYear(`200`);
    expect(get(stopped, `/paPartYearHasDividends`).get).toBe(true);
    expect(val(stopped, `/paPartYearNonresidentDividends`)).toBe(`500.00`);
    expect(val(stopped, `/paLine3`)).toBe(`200.00`);
    expect(get(stopped, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(stopped, `/flowIsKnockedOut`).get).toBe(true);
    // Every ordinary dividend received while a PA resident: line 4 is $0, line 3 is the federal amount.
    const allResident = partYear(`700`);
    expect(val(allResident, `/paPartYearNonresidentDividends`)).toBe(`0.00`);
    expect(val(allResident, `/paLine3`)).toBe(`700.00`);
    expect(get(allResident, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(allResident, `/flowIsKnockedOut`).get).toBe(false);
    // Unanswered allocation: line 3 is incomplete, not $0, and the knockout stays incomplete.
    const unanswered = partYear();
    expect(get(unanswered, `/paLine3`).complete).toBe(false);
    expect(get(unanswered, `/flowKnockoutPaDividends`).complete).toBe(false);
    expect(get(unanswered, `/flowIsKnockedOut`).complete).toBe(false);
  });
  it(`not a PA return: never asked, never blocked`, () => {
    const g = build({ ...divs({ box1a: 700 }), '/paHasExemptObligationDividends': createBooleanWrapper(true) });
    expect(get(g, `/paAskExemptObligationDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
});

describe(`#86 dividends in downstream computations`, () => {
  it(`box 1b is taxed through the QDCG Tax Worksheet, not at ordinary rates (i1040 (2025) p. 38)`, () => {
    const ordinary = build(divs({ box1a: 5000 }));
    const qualified = build(divs({ box1a: 5000, box1b: 5000 }));
    expect(val(qualified, `/qualifiedDividends`)).toBe(`5000.00`);
    expect(get(qualified, `/usesQdcgTaxWorksheet`).get).toBe(true);
    // $40,000 wages: 2026 single 12% bracket tops out above taxable income, so the 0% rate on line 3a lowers tax
    expect(Number(val(qualified, `/tentativeTaxFromTaxableIncome`))).toBeLessThan(
      Number(val(ordinary, `/tentativeTaxFromTaxableIncome`))
    );
    noKnockouts(qualified);
  });

  it(`ordinary dividends flow to Form 8960 line 2, the SS worksheet line 2a source, and student loan MAGI`, () => {
    const g = build(divs({ box1a: 1234 }));
    const base = build({});
    expect(Number(val(g, `/totalIncome`)) - Number(val(base, `/totalIncome`))).toBe(1234);
    expect(
      Number(val(g, `/magiForStudentLoanInterestDeduction`)) - Number(val(base, `/magiForStudentLoanInterestDeduction`))
    ).toBe(1234);
    expect(val(g, `/form8960Line2`)).toBe(`1234.00`);
    expect(val(g, `/form8615UnearnedIncome`)).toBe(`1234.00`);
  });

  const young = (dob: string, student?: boolean) => ({
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(dob),
    ...(student === undefined ? {} : { [`/filers/#${primaryFilerId}/isStudent`]: createBooleanWrapper(student) }),
  });

  it(`Form 8615: a filer under 18 with more than $2,700 of unearned income stops the return (i8615 (2026 draft))`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form8615UnearnedIncome`, `/flowKnockoutForm8615`];
    const g = build({ ...divs({ box1a: 2701 }), ...young(`2010-05-05`, false) });
    expect(get(g, `/flowKnockoutForm8615`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutForm8615`);
    // exactly $2,700 is not "more than $2,700"
    expect(get(build({ ...divs({ box1a: 2700 }), ...young(`2010-05-05`, false) }), `/flowKnockoutForm8615`).get).toBe(
      false
    );
  });

  it(`Form 8615: an 18-year-old non-student with wages still stops; support isn't asked (26 U.S.C. 1(g)(2)(A)(ii))`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8615`];
    // build() includes $40,000 of W-2 wages, which may or may not be more than half of support.
    const g = build({ ...divs({ box1a: 2701 }), ...young(`2008-12-31`, false) }); // 18 at the end of 2026
    expect(get(g, `/flowKnockoutForm8615`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    // TY2026 threshold is $2,700 = 2 x $1,350 (Rev. Proc. 2025-32 sec. 4.02, p. 12)
    expect(get(build({ ...divs({ box1a: 2700 }), ...young(`2008-12-31`, false) }), `/flowKnockoutForm8615`).get).toBe(
      false
    );
  });

  it(`Form 8615: ages 19 to 23 stop only as students; 24 and over, and joint returns, never stop`, () => {
    const ko = (x: Record<string, unknown>, s?: Record<string, unknown>) =>
      get(build({ ...divs({ box1a: 3000 }), ...x }, s), `/flowKnockoutForm8615`).get;
    expect(ko(young(`2008-03-03`, false))).toBe(true); // 18 at end of 2026: support isn't asked
    expect(ko(young(`2005-03-03`, true))).toBe(true); // 21, student
    expect(ko(young(`2005-03-03`, false))).toBe(false); // 21, not a student
    expect(ko(young(`2002-03-03`, true))).toBe(false); // 24
    expect(ko(young(`2010-03-03`, false), mfjFilerData)).toBe(false); // joint return
    expect(ko({})).toBe(false); // base filer is an adult
  });
});

// #86b: box 2a on Form 1040 line 7a (line 7a Exception 1) or Schedule D line 13, taxed through the QDCG worksheet.
// Form 1040 instr. (2025) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf p. 31 Line 7a, p. 33 Line 7b, p. 36 Line 16,
// p. 38 QDCG Tax Worksheet; Schedule D instr. (2025) https://www.irs.gov/pub/irs-pdf/i1040sd.pdf p. 2.
describe(`#86b capital gain distributions and the QDCG Tax Worksheet`, () => {
  it(`box 2a alone goes on line 7a with the line 7b box, no Schedule D, and is taxed at 0%`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/capitalGainDistributionsWithoutScheduleD`,
      `/capitalGainsOrLosses`,
      `/capitalGainsScheduleDNotRequired`,
      `/scheduleDLine13`,
      `/qdcgLine3`,
      `/qdcgLine11`,
      `/qdcgLine19`,
      `/qdcgLine24`,
      `/usesQdcgTaxWorksheet`,
      `/form6251UsesPartIII`,
    ];
    const g = build(divs({ box1a: 500, box2a: 800.5 }));
    expect(get(g, `/capitalGainDistributionsWithoutScheduleD`).get).toBe(true);
    expect(get(g, `/requiresScheduleD`).get).toBe(false);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`801.00`); // whole dollars (p. 23)
    expect(get(g, `/capitalGainsScheduleDNotRequired`).get).toBe(true);
    expect(val(g, `/scheduleDLine13`)).toBe(`0.00`);
    expect(val(g, `/qdcgLine3`)).toBe(`801.00`); // "No. Enter the amount from Form 1040 or 1040-SR, line 7a."
    expect(val(g, `/qdcgLine4`)).toBe(`801.00`);
    expect(get(g, `/usesQdcgTaxWorksheet`).get).toBe(true);
    expect(get(g, `/form6251UsesPartIII`).get).toBe(true);
    expect(val(g, `/form6251Line13`)).toBe(`801.00`);
    expect(val(g, `/qdcgLine11`)).toBe(val(g, `/qdcgLine9`));
    expect(val(g, `/qdcgLine24`)).toBe(val(g, `/taxOnTaxableIncomeRegularRates`));
    const base = build(divs({ box1a: 500 }));
    expect(Number(val(g, `/totalIncome`)) - Number(val(base, `/totalIncome`))).toBe(801);
    // Line 1 stays under the 0% bracket (line 6), so the whole $801 is on line 9 and tax doesn't change.
    expect(val(g, `/qdcgLine9`)).toBe(`801.00`);
    expect(val(g, `/tentativeTaxFromTaxableIncome`)).toBe(val(base, `/tentativeTaxFromTaxableIncome`));
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    noKnockouts(g);
  });

  it(`box 2a above the 0% bracket is taxed at 15% on QDCG lines 17-18`, () => {
    // $40,000 wages - $16,100 standard deduction = $23,900; + $40,000 box 2a = $63,900 on line 1.
    const g = build(divs({ box1a: 0.01, box2a: 40000 }));
    expect(val(g, `/qdcgLine1`)).toBe(`63900.00`);
    expect(val(g, `/qdcgLine5`)).toBe(`23900.00`);
    expect(val(g, `/qdcgLine9`)).toBe(`25550.00`); // $49,450 (line 6, Rev. Proc. 2025-32 §4.03) - $23,900
    expect(val(g, `/qdcgLine17`)).toBe(`14450.00`);
    expect(val(g, `/qdcgLine18`)).toBe(`2167.50`);
    expect(val(g, `/qdcgLine19`)).toBe(`40000.00`);
    expect(val(g, `/qdcgLine20`)).toBe(`0.00`);
    expect(Number(val(g, `/qdcgLine25`))).toBe(Math.round(Number(val(g, `/qdcgLine22`)) + 2167.5));
    noKnockouts(g);
  });

  it(`box 2a with Schedule D required goes on Schedule D line 13 instead`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine13`, `/scheduleDLine15`, `/capitalGainsOrLosses`, `/qdcgLine3`];
    const g = build({
      ...divs({ box1a: 500, box2a: 1200 }),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(get(g, `/requiresScheduleD`).get).toBe(true);
    expect(get(g, `/capitalGainDistributionsWithoutScheduleD`).get).toBe(false);
    expect(get(g, `/capitalGainsScheduleDNotRequired`).get).toBe(false);
    expect(val(g, `/scheduleDLine13`)).toBe(`1200.00`);
    expect(val(g, `/scheduleDLine15`)).toBe(`1000.00`); // line 13 less the line 14 carryover
    expect(val(g, `/scheduleDLine16`)).toBe(`1000.00`);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`1000.00`);
    expect(val(g, `/qdcgLine3`)).toBe(`1000.00`); // "Yes. Enter the smaller of line 15 or line 16 of Schedule D."
    noKnockouts(g);
  });

  it(`box 2a offset by a larger carryover: Schedule D loss, QDCG line 3 is $0`, () => {
    const g = build({
      ...divs({ box1a: 500, box2a: 1200 }),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`5000`),
    });
    expect(val(g, `/scheduleDLine15`)).toBe(`-3800.00`);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`-3000.00`);
    expect(val(g, `/qdcgLine3`)).toBe(`0.00`);
    noKnockouts(g);
  });

  it(`no box 2a: line 7a is $0, line 7b unchecked`, () => {
    const g = build(divs({ box1a: 500 }));
    expect(get(g, `/capitalGainDistributionsWithoutScheduleD`).get).toBe(false);
    expect(get(g, `/capitalGainsScheduleDNotRequired`).get).toBe(false);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`0.00`);
    expect(val(g, `/qdcgLine3`)).toBe(`0.00`);
  });

  it(`qualified dividends and box 2a together fill QDCG lines 2 and 3`, () => {
    const g = build(divs({ box1a: 1000, box1b: 600, box2a: 300 }));
    expect(val(g, `/qdcgLine2`)).toBe(`600.00`);
    expect(val(g, `/qdcgLine3`)).toBe(`300.00`);
    expect(val(g, `/qdcgLine4`)).toBe(`900.00`);
    noKnockouts(g);
  });

  it(`box 2a on a Pennsylvania return stops the PA return (PA Schedule B line 10)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaDividends`];
    const pa = build({ ...divs({ box1a: 500, box2a: 10 }), ...state(`pa`) });
    expect(get(pa, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaDividends`);
    const onlyCgd = build({ ...divs({ box1a: 0, box2a: 10 }), ...state(`pa`) });
    expect(get(onlyCgd, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(build({ ...divs({ box1a: 500 }), ...state(`pa`) }), `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(build(divs({ box1a: 500, box2a: 10 })), `/flowKnockoutPaDividends`).get).toBe(false); // NJ
  });

  it(`box 2a counts as unearned income for Form 8615`, () => {
    const g = build(divs({ box1a: 100, box2a: 2650 }));
    expect(val(g, `/form8615UnearnedIncome`)).toBe(`2750.00`);
  });
});

// #86b: Form 6251 Part III with qualified dividends and capital gain distributions. Part III is built through line 40
// (form6251.xml). Instructions for Form 6251 (2025) https://www.irs.gov/pub/irs-pdf/i6251.pdf, Part III, Lines 13, 14,
// and 15: if none of statements (1) a different AMT gain or loss (for example an ISO or depreciation basis
// difference, or a different AMT capital loss carryover), (2) line 15 is zero so no QDCG worksheet, or (3) a
// Schedule K-1 (Form 1041) box 12 code B-F applies, "the AMT versions of your Qualified Dividends and Capital Gain
// Tax Worksheet ... will be the same as those you used for regular tax purposes. Use the regular tax amounts to
// complete lines 13, 14, and 15." (1) is a yes to the AMT adjustments question (/flowKnockoutAmtPreferenceItems);
// (3) has no input; line 14 (Schedule D line 19) and Form 2555 stop the return or aren't collected. (2) only needs
// AMT QDCG lines 2-4, which don't depend on line 1, so line 13 = regular worksheet line 4.
describe(`#86b Form 6251 Part III with dividends (line 7 recomputed by hand)`, () => {
  it(`qualified dividends + box 2a, AMTI above the 28% breakpoint: line 7 = line 40 = $67,674`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251UsesPartIII`, `/form6251Line13`, `/form6251Line40`, `/form6251Line7`];
    // $300,000 wages, box 1a $60,000 (1b $50,000), box 2a $20,000; single, standard deduction $16,100.
    const g = build({ ...paW2(300000), ...divs({ box1a: 60000, box1b: 50000, box2a: 20000 }) });
    expect(val(g, `/taxableIncome`)).toBe(`363900.00`);
    expect(get(g, `/form6251UsesPartIII`).get).toBe(true); // f6251 (2026 draft) line 7: line 3a or line 7a
    expect(val(g, `/form6251Line4`)).toBe(`380000.00`); // line 1b + line 2a standard deduction
    // Rev. Proc. 2025-32 sec. 4.10: $90,100 unmarried exemption; AMTI is under the phaseout threshold.
    expect(val(g, `/form6251Line6`)).toBe(`289900.00`);
    const L12 = 289900;
    const L13 = 70000; // QDCG line 4 = line 3a $50,000 + line 7a $20,000
    expect(val(g, `/form6251Line13`)).toBe(`70000.00`);
    const L16 = Math.min(L12, L13); // line 15 = line 13 (no Schedule D Tax Worksheet)
    const L17 = L12 - L16;
    const L18 = L17 <= 244500 ? 0.26 * L17 : 0.28 * L17 - 4890;
    const L21 = Math.max(0, 49450 - 293900); // line 20 = QDCG line 5 = $363,900 - $70,000
    const L22 = Math.min(L12, L13);
    const L23 = Math.min(L21, L22);
    const L24 = L22 - L23;
    const L29 = Math.max(0, 545500 - (L21 + 293900)); // lines 25-28
    const L30 = Math.min(L24, L29);
    const L33 = Math.max(0, L22 - (L23 + L30));
    const L38 = L18 + 0.15 * L30 + 0.2 * L33; // line 37 = 0: line 14 is zero
    const L39 = L12 <= 244500 ? 0.26 * L12 : 0.28 * L12 - 4890;
    const L7 = Math.round(Math.min(L38, L39));
    expect(L7).toBe(67674);
    expect(val(g, `/form6251Line7`)).toBe(`${L7}.00`);
    noKnockouts(g);
  });

  it(`statement (2), Form 1040 line 15 is zero: line 13 still takes AMT QDCG line 4, and line 7 is $0`, () => {
    const g = build({ ...paW2(5000), ...divs({ box1a: 3000, box1b: 3000 }) });
    expect(val(g, `/qdcgLine1`)).toBe(`0.00`);
    expect(val(g, `/form6251Line13`)).toBe(`3000.00`);
    expect(val(g, `/form6251Line6`)).toBe(`0.00`);
    expect(val(g, `/form6251Line7`)).toBe(`0.00`);
  });
});

/*
 * #154: PA Schedule B knockout from the Form 1099-DIV facts. PA-40 Schedule B (2025) form and instructions
 * https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40b.pdf
 * PDF p. 3, WHO MUST COMPLETE: "PA resident and part-year resident taxpayers must complete and include PA-40 Schedule
 * B with an originally filed PA-40, Personal Income Tax Return, if there are any amounts on Lines 2 through 11 (not
 * including subtotal Line 6)." PDF p. 4: Line 3 (U.S./PA obligation fund dividends), Line 4 ("dividend income for a
 * part-year resident taxpayer during the period the taxpayer was a nonresident; nominee capital gains distributions"),
 * Line 10 (capital gains distributions). Over $2,500 of PA-taxable dividends is a limit this tool sets.
 */
describe(`#154 PA Schedule B dividend knockout`, () => {
  const paBuild = (extra: Record<string, unknown>) =>
    build({ ...state(`pa`), '/paHasExemptObligationDividends': createBooleanWrapper(false), ...extra });
  const scheduleB = (g: Fg) => get(g, `/flowKnockoutPaScheduleB`).get;
  it(`full-year PA, $2,501 of ordinary dividends (over the $2,500 limit) stops the PA return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleB`, `/paScheduleBThreshold`, `/paLine3`];
    const g = paBuild(divs({ box1a: 2501 }));
    expect(val(g, `/paLine3`)).toBe(`2501.00`);
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaScheduleB`);
  });
  it(`two forms that add to $2,501 count together (the limit is on the PA-40 line 3 total)`, () => {
    expect(scheduleB(paBuild(divs({ box1a: 1500 }, { box1a: 1001 })))).toBe(true);
  });
  it(`full-year PA, exactly $2,500 of ordinary dividends with no Schedule B line: no knockout`, () => {
    const g = paBuild(divs({ box1a: 2500, box1b: 2000 }));
    expect(val(g, `/paLine3`)).toBe(`2500.00`);
    expect(scheduleB(g)).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`the limit uses the rounded line 3b total: $2,500.49 stays, $2,500.50 stops`, () => {
    expect(scheduleB(paBuild(divs({ box1a: 2500.49 })))).toBe(false);
    expect(scheduleB(paBuild(divs({ box1a: 2500.5 })))).toBe(true);
  });
  it(`Line 3: fund dividends from U.S. or PA obligations stop it at any amount`, () => {
    const g = paBuild({ ...divs({ box1a: 100 }), '/paHasExemptObligationDividends': createBooleanWrapper(true) });
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(true);
  });
  it(`Line 10: any capital gain distribution (box 2a) stops it, even with $0 in box 1a`, () => {
    expect(scheduleB(paBuild(divs({ box1a: 0, box2a: 10 })))).toBe(true);
    expect(scheduleB(paBuild(divs({ box1a: 100, box2a: 1 })))).toBe(true);
  });
  it(`Line 4: dividends received as a nominee stop it (and the federal return)`, () => {
    const g = paBuild(divs({ box1a: 100, nominee: true }));
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowKnockoutDividendNominee`).get).toBe(true);
  });
  it(`Line 4: dividends received while not a PA resident stop it, even under $2,500`, () => {
    const partYear = (box1a: number, resident: string) =>
      build({
        ...divs({ box1a }),
        '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
        '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
        '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
        [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
        [`/formW2s/#${w2Id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`40000`),
        '/paHasExemptObligationDividends': createBooleanWrapper(false),
        '/paPartYearResidentDividends': createDollarWrapper(resident),
      });
    const g = partYear(50, `0`);
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    // All $2,000 received while a PA resident: under the $2,500 limit and line 4 is $0, so no Schedule B.
    const supported = partYear(2000, `2000`);
    expect(val(supported, `/paLine3`)).toBe(`2000.00`);
    expect(scheduleB(supported)).toBe(false);
    expect(get(supported, `/flowIsKnockedOut`).get).toBe(false);
    // $2,000 of $2,500 received while a PA resident: line 3 is under $2,500, but line 4 is $500.
    expect(scheduleB(partYear(2500, `2000`))).toBe(true);
  });
  it(`no 1099-DIV: no Schedule B line has an amount`, () => {
    const g = build(state(`pa`));
    expect(val(g, `/paLine3`)).toBe(`0.00`);
    expect(scheduleB(g)).toBe(false);
  });
  it(`not a PA return (NJ): $10,000 of dividends and box 2a never stop it`, () => {
    expect(scheduleB(build(divs({ box1a: 10000, box2a: 50 })))).toBe(false);
  });
});
