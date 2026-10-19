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
    ...state(`nj`),
    ...paW2(40000),
    ...extra,
  }).factGraph;

const FEDERAL_KOS = [
  `/flowKnockoutDividendUnsupportedBoxes`,
  `/flowKnockoutCapitalGainDistributions`,
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
  it(`box 2a capital gain distributions > 0`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCapitalGainDistributions`, `/totalCapitalGainDistributions`];
    blocks(build(divs({ box1a: 500, box2a: 1 })), `/flowKnockoutCapitalGainDistributions`);
    expect(get(build(divs({ box1a: 500, box2a: 0 })), `/flowKnockoutCapitalGainDistributions`).get).toBe(false);
  });
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
  });
  it(`box 7 foreign tax paid > 0, including within the §904(j) $300 limit`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendForeignTaxPaid`, `/totalDividendForeignTaxPaid`];
    blocks(build(divs({ box1a: 500, box7: 12 })), `/flowKnockoutDividendForeignTaxPaid`);
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
  it(`PA/FL part-year resident with dividends (PA Schedule B line 4, p. 43) stops the PA return`, () => {
    const g = build({
      ...divs({ box1a: 700 }),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
      [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
      [`/formW2s/#${w2Id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`40000`),
    });
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
  });
  it(`not a PA return: never asked, never blocked`, () => {
    const g = build({ ...divs({ box1a: 700 }), '/paHasExemptObligationDividends': createBooleanWrapper(true) });
    expect(get(g, `/paAskExemptObligationDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
});
