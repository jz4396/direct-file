// #86: Form 1099-DIV boxes 1a, 1b, 2a, 2e, 2f, 3, 4, 5, 6, 7, 12 and 13. Box 12 is Form 1040 line 2a, not line 3b.
// Box 13 is Form 6251 line 2g and cannot exceed box 12. Box 2e is the section 897 portion of box 1a and box 2f is
// the section 897 portion of box 2a (26 U.S.C. 897(a)); neither is added again. Box 6 is included in box 1a and is
// not deducted (26 U.S.C. 67(g)). Box 2b is the unrecaptured section 1250 portion of box 2a (26 U.S.C. 1(h)(6)) and
// is not added again. Box 2d is the collectibles (28%) portion of box 2a (26 U.S.C. 1(h)(4) and 1(h)(5)) and is
// not added again. A portion one dollar over its parent box stops the return. A box 2d greater than $0 with a
// Schedule D line 7 loss or a line 14 capital loss carryover stops the return. A nonzero box 6 on a
// PA-40 stops the return. Box 2c still stops. Boxes 9 and 10 at or below remaining basis, together with box 3, are
// not income and do not stop. Above that basis they stop. Box 14 greater than $0 is allowed only when the state
// return is not computed, the resident state has an income tax, and box 15 is that state. Box 8 does not stop when
// box 7 is $0 or meets 26 U.S.C. 904(j). Boxes 15 and 16 do not stop when box 14 is $0, except a box 16 amount
// that differs from box 1a plus box 2a on a state return computed here (`/stateReturnComputed`). Box 11 (FATCA
// filing requirement) does not stop by itself: it asks /requiredToFileForm8938. Yes stops (26 U.S.C. 6038D). No
// proceeds. Form 1099-DIV
// (Rev. December 2027) draft, Instructions for Recipient, Box 11. Instructions for Form 8938: a specified individual
// living in the United States who is unmarried files when specified foreign financial assets are more than $50,000
// on the last day of the year or more than $75,000 at any time. Those thresholds are not computed.
// Form 1040 instr. (2025; the 2026 instructions are not yet posted) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf
// p. 26 line 3b: "Enter your total ordinary dividends on line 3b. This amount should be shown in box 1a of
// Form(s) 1099-DIV." p. 25 line 3a: "Enter your total qualified dividends on line 3a. Qualified dividends are also
// included in the ordinary dividend total required to be shown on line 3b." p. 39 line 25b: withholding shown on
// Form 1099 (1099-DIV box 4). Form 1099-DIV (Rev. December 2027) draft, Instructions for Recipient,
// https://www.irs.gov/pub/irs-dft/f1099div--dft.pdf.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  box2b?: number;
  box2d?: number;
  box2e?: number;
  box2f?: number;
  box3?: number;
  box9?: number;
  box10?: number;
  box6?: number;
  box4?: number;
  box5?: number;
  box7?: number;
  box8?: string;
  box14?: number;
  box15?: string;
  box15State?: `sameState` | `differentState`;
  box16?: number;
  box12?: number;
  box13?: number;
  holdingNotMet?: boolean;
  overBasis?: boolean;
  liquidationOverBasis?: boolean;
  otherBoxes?: boolean;
  box11?: boolean;
  nominee?: boolean;
  nomineeOrdinary?: number;
  nomineeQualified?: number;
  nomineeOtherBoxes?: boolean;
  ftcOk?: boolean;
  reitHoldingMet?: boolean;
  reitCarryforward?: boolean;
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
    ...opt(id, `UnrecapturedSection1250Gain`, f.box2b),
    ...opt(id, `Collectibles28RateGain`, f.box2d),
    ...opt(id, `Section897OrdinaryDividends`, f.box2e),
    ...opt(id, `Section897CapitalGain`, f.box2f),
    ...opt(id, `InvestmentExpenses`, f.box6),
    ...opt(id, `NondividendDistributions`, f.box3),
    ...opt(id, `CashLiquidationDistributions`, f.box9),
    ...opt(id, `NoncashLiquidationDistributions`, f.box10),
    ...opt(id, `FederalTaxWithheld`, f.box4),
    ...opt(id, `Section199ADividends`, f.box5),
    ...(f.box5
      ? {
          [`/dividendReports/#${id}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(
            f.reitHoldingMet ?? true
          ),
        }
      : {}),
    ...opt(id, `ForeignTaxPaid`, f.box7),
    ...(f.box8 === undefined
      ? {}
      : { [`/dividendReports/#${id}/writableForeignCountry`]: createStringWrapper(f.box8) }),
    ...opt(id, `StateTaxWithheld`, f.box14),
    ...(f.box15 === undefined
      ? {}
      : { [`/dividendReports/#${id}/writableStateIdNumber`]: createStringWrapper(f.box15) }),
    ...(f.box15State === undefined
      ? {}
      : {
          [`/dividendReports/#${id}/writableState`]: createEnumWrapper(f.box15State, `/incomeFormStateOptions`),
        }),
    ...opt(id, `StateDistribution`, f.box16),
    ...opt(id, `ExemptInterestDividends`, f.box12),
    ...opt(id, `SpecifiedPrivateActivityBondInterestDividends`, f.box13),
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
    ...((f.box9 ?? 0) > 0 || (f.box10 ?? 0) > 0
      ? {
          [`/dividendReports/#${id}/liquidationDistributionsExceedBasis`]: createBooleanWrapper(
            f.liquidationOverBasis ?? false
          ),
        }
      : {}),
    [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(f.otherBoxes ?? false),
    ...(f.box11 === undefined
      ? {}
      : { [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(f.box11) }),
    [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(f.nominee ?? false),
    ...(f.nominee
      ? {
          [`/dividendReports/#${id}/writableNomineeOrdinaryDividends`]: createDollarWrapper(
            `${f.nomineeOrdinary ?? 0}`
          ),
          ...(f.box1b === undefined
            ? {}
            : {
                [`/dividendReports/#${id}/writableNomineeQualifiedDividends`]: createDollarWrapper(
                  `${f.nomineeQualified ?? 0}`
                ),
              }),
          [`/dividendReports/#${id}/nomineeShareOfOtherBoxes`]: createBooleanWrapper(f.nomineeOtherBoxes ?? false),
        }
      : {}),
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
    ...(forms.some((f) => (f.box5 ?? 0) > 0)
      ? {
          '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(forms.some((f) => f.reitCarryforward === true)),
        }
      : {}),
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
    '/paHasEstimatedInstallmentPayments': createBooleanWrapper(false),
    '/paHasExemptObligationDividends': createBooleanWrapper(false),
    '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
    '/paHasSpNontaxableIncome': createBooleanWrapper(false),
    ...state(`nj`),
    ...paW2(40000),
    ...extra,
  }).factGraph;

const FEDERAL_KOS = [
  `/flowKnockoutDividendUnsupportedBoxes`,
  `/flowKnockoutDividendStateDistribution`,
  `/flowKnockoutNondividendDistributionsOverBasis`,
  `/flowKnockoutQualifiedDividendsHoldingPeriod`,
  `/flowKnockoutSection199ADividendsHoldingPeriod`,
  `/flowKnockoutDividendForeignTaxPaid`,
  `/flowKnockoutDividendNominee`,
  `/flowKnockoutDividendAmountsInconsistent`,
  `/flowKnockoutCollectibles28RateGainNetting`,
  `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`,
];
const noKnockouts = (g: Fg) => {
  FEDERAL_KOS.forEach((k) => expect(get(g, k).get, k).toBe(false));
  expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
  expect(get(g, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
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
  it(`box 12 is Form 1040 line 2a, not line 3b, and does not stop the return`, ({ task }) => {
    // Form 1040 instr. (2025) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf p. 25, Line 2a: "Also include on line 2a
    // any exempt-interest dividends from a mutual fund or other regulated investment company. This amount should be
    // shown in box 12 of Form 1099-DIV." 26 U.S.C. 852(b)(5)(B).
    task.meta.testedFactPaths = [`/totalExemptInterestDividends`, `/taxExemptInterest`, `/ordinaryDividends`];
    const g = build(divs({ box1a: 500, box12: 80.4 }, { box1a: 100, box12: 19.6 }));
    expect(val(g, `/totalExemptInterestDividends`)).toBe(`100.00`);
    expect(val(g, `/taxExemptInterest`)).toBe(`100.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`600.00`);
    noKnockouts(g);
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
  it(`qualified REIT dividends in box 5 are Form 8995 line 6 and are not themselves a stop`, ({ task }) => {
    // 26 U.S.C. 199A(b)(1)(B). 2026 Instructions for Form 8995 draft, PDF p. 5: box 5 is the qualified REIT
    // dividend amount. Box 5 is a portion of box 1a, so it is not added to ordinary dividends again.
    task.meta.testedFactPaths = [
      `/totalSection199ADividends`,
      `/form8995Line6`,
      `/form8995Required`,
      `/flowKnockoutSection199ADividends`,
      `/flowKnockoutSection199ADividendsHoldingPeriod`,
    ];
    const g = build(divs({ box1a: 500, box5: 50 }));
    expect(val(g, `/totalSection199ADividends`)).toBe(`50.00`);
    expect(val(g, `/form8995Line6`)).toBe(`50.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`500.00`);
    expect(get(g, `/flowKnockoutSection199ADividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutSection199ADividendsHoldingPeriod`).get).toBe(false);
    expect(get(g, `/form8995Required`).get).toBe(true);
    expect(get(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    FEDERAL_KOS.forEach((k) => expect(get(g, k).get, k).toBe(false));
    const held = build(divs({ box1a: 100, box5: 100 }));
    expect(val(held, `/form8995Line6`)).toBe(`100.00`);
    expect(get(held, `/flowKnockoutSection199ADividendsHoldingPeriod`).get).toBe(false);
  });
  it(`box 5 that fails the 45-day holding period stops the return`, ({ task }) => {
    // 26 CFR 1.199A-3(c)(2)(ii).
    task.meta.testedFactPaths = [`/flowKnockoutSection199ADividendsHoldingPeriod`];
    blocks(
      build(divs({ box1a: 500, box5: 50, reitHoldingMet: false })),
      `/flowKnockoutSection199ADividendsHoldingPeriod`
    );
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
    blocks(build(divs({ box1a: 100, box5: 150 })), `/flowKnockoutDividendAmountsInconsistent`);
  });
  it(`box 2e at $0 and at box 1a does not change line 3b`, ({ task }) => {
    // 26 U.S.C. 897(a). Form 1099-DIV instructions, box 2e: the portion of box 1a.
    task.meta.testedFactPaths = [
      `/dividendReports/*/section897OrdinaryDividends`,
      `/ordinaryDividends`,
      `/flowKnockoutDividendAmountsInconsistent`,
      `/flowKnockoutDividendUnsupportedBoxes`,
    ];
    const zero = build(divs({ box1a: 100, box2e: 0 }));
    const atLimit = build(divs({ box1a: 100, box2e: 100 }));
    const blank = build(divs({ box1a: 100 }));
    for (const g of [zero, atLimit, blank]) {
      expect(val(g, `/ordinaryDividends`)).toBe(`100.00`);
      noKnockouts(g);
    }
    expect(val(zero, `/dividendReports/#${d1}/section897OrdinaryDividends`)).toBe(`0.00`);
    expect(val(atLimit, `/dividendReports/#${d1}/section897OrdinaryDividends`)).toBe(`100.00`);
    expect(val(blank, `/dividendReports/#${d1}/section897OrdinaryDividends`)).toBe(`0.00`);
  });
  it(`box 2e one dollar over box 1a stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/amountsInconsistent`, `/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 100, box2e: 101 })), `/flowKnockoutDividendAmountsInconsistent`);
    expect(get(build(divs({ box1a: 100, box2e: 101 })), `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
  });
  it(`box 2f at $0 and at box 2a does not change Schedule D line 13 or line 7a`, ({ task }) => {
    // 26 U.S.C. 897(a). Form 1099-DIV instructions, box 2f: the portion of box 2a.
    task.meta.testedFactPaths = [
      `/dividendReports/*/section897CapitalGain`,
      `/totalCapitalGainDistributions`,
      `/scheduleDLine13`,
      `/capitalGainsOrLosses`,
    ];
    const zero = build(divs({ box1a: 100, box2a: 40, box2f: 0 }));
    const atLimit = build(divs({ box1a: 100, box2a: 40, box2f: 40 }));
    const blank = build(divs({ box1a: 100, box2a: 40 }));
    for (const g of [zero, atLimit, blank]) {
      expect(val(g, `/totalCapitalGainDistributions`)).toBe(`40.00`);
      expect(val(g, `/capitalGainsOrLosses`)).toBe(`40.00`);
      expect(val(g, `/scheduleDLine13`)).toBe(`0.00`);
      noKnockouts(g);
    }
    expect(val(atLimit, `/dividendReports/#${d1}/section897CapitalGain`)).toBe(`40.00`);
    expect(val(zero, `/dividendReports/#${d1}/section897CapitalGain`)).toBe(`0.00`);
  });
  it(`box 2f one dollar over box 2a stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 100, box2a: 40, box2f: 41 })), `/flowKnockoutDividendAmountsInconsistent`);
    const overBlank2a = build(divs({ box1a: 100, box2f: 1 }));
    blocks(overBlank2a, `/flowKnockoutDividendAmountsInconsistent`);
  });
  it(`box 6 at $0 and at box 1a is not deducted`, ({ task }) => {
    // 26 U.S.C. 67(g). Form 1099-DIV instructions, box 6: included in box 1a.
    task.meta.testedFactPaths = [
      `/dividendReports/*/investmentExpenses`,
      `/ordinaryDividends`,
      `/flowKnockoutDividendAmountsInconsistent`,
    ];
    const zero = build(divs({ box1a: 100, box6: 0 }));
    const atLimit = build(divs({ box1a: 100, box6: 100 }));
    const blank = build(divs({ box1a: 100 }));
    for (const g of [zero, atLimit, blank]) {
      expect(val(g, `/ordinaryDividends`)).toBe(`100.00`);
      noKnockouts(g);
    }
    expect(val(zero, `/dividendReports/#${d1}/investmentExpenses`)).toBe(`0.00`);
    expect(val(atLimit, `/dividendReports/#${d1}/investmentExpenses`)).toBe(`100.00`);
    expect(val(blank, `/dividendReports/#${d1}/investmentExpenses`)).toBe(`0.00`);
  });
  it(`box 6 one dollar over box 1a stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 100, box6: 101 })), `/flowKnockoutDividendAmountsInconsistent`);
  });
  it(`several 1099-DIVs keep each portion inside its own form`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/ordinaryDividends`,
      `/totalCapitalGainDistributions`,
      `/scheduleDLine13`,
      `/flowKnockoutDividendAmountsInconsistent`,
    ];
    const g = build(
      divs(
        { box1a: 200, box2a: 40, box2e: 200, box2f: 40, box6: 10 },
        { box1a: 50, box2a: 0, box2e: 0, box2f: 0, box6: 50 }
      )
    );
    expect(val(g, `/ordinaryDividends`)).toBe(`250.00`);
    expect(val(g, `/totalCapitalGainDistributions`)).toBe(`40.00`);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`40.00`);
    expect(val(g, `/dividendReports/#${d2}/investmentExpenses`)).toBe(`50.00`);
    noKnockouts(g);
    blocks(
      build(divs({ box1a: 200, box2e: 200 }, { box1a: 50, box2e: 51 })),
      `/flowKnockoutDividendAmountsInconsistent`
    );
    blocks(
      build(divs({ box1a: 200, box2a: 40, box2f: 40 }, { box1a: 50, box2a: 10, box2f: 11 })),
      `/flowKnockoutDividendAmountsInconsistent`
    );
  });
  it(`box 13 is Form 6251 line 2g and does not stop when it does not exceed box 12`, ({ task }) => {
    // Form 1099-DIV instructions, box 13: "Shows exempt-interest dividends subject to the alternative minimum tax.
    // This amount is included in box 12." 26 U.S.C. 57(a)(5).
    task.meta.testedFactPaths = [
      `/totalSpecifiedPrivateActivityBondInterestDividends`,
      `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`,
    ];
    const g = build(divs({ box1a: 0, box12: 20, box13: 20 }));
    expect(val(g, `/totalSpecifiedPrivateActivityBondInterestDividends`)).toBe(`20.00`);
    expect(val(g, `/taxExemptInterest`)).toBe(`20.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`0.00`);
    noKnockouts(g);
  });
  it(`box 13 larger than box 12`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`];
    blocks(
      build(divs({ box1a: 0, box12: 10, box13: 11 })),
      `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`
    );
  });
  it(`box 2c (section 1202 gain) still stops the return`, ({ task }) => {
    // Form 1099-DIV instructions. Box 2c is still /dividendReports/*/hasUnsupportedBoxes. Boxes 9 and 10 are not.
    task.meta.testedFactPaths = [`/flowKnockoutDividendUnsupportedBoxes`, `/dividendReports/*/hasUnsupportedBoxes`];
    blocks(build(divs({ box1a: 100, otherBoxes: true })), `/flowKnockoutDividendUnsupportedBoxes`);
  });
  it(`box 9 $5,000 at or below basis does not change AGI and does not stop`, ({ task }) => {
    // Pub. 550 (2025) p. 31, Liquidating Distributions. 26 U.S.C. 331(a); 301(c)(2). No means nothing is reported.
    task.meta.testedFactPaths = [
      `/dividendReports/*/cashLiquidationDistributions`,
      `/dividendReports/*/liquidationDistributionsExceedBasis`,
      `/flowKnockoutNondividendDistributionsOverBasis`,
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/ordinaryDividends`,
      `/agi`,
      `/form8960Line2`,
      `/form8960Line5a`,
      `/requiresScheduleB`,
    ];
    const blank = build(divs({ box1a: 2000 }));
    const box9 = build(divs({ box1a: 2000, box9: 5000, liquidationOverBasis: false }));
    expect(val(box9, `/dividendReports/#${d1}/cashLiquidationDistributions`)).toBe(`5000.00`);
    expect(val(box9, `/dividendReports/#${d1}/noncashLiquidationDistributions`)).toBe(`0.00`);
    expect(get(box9, `/dividendReports/#${d1}/hasLiquidationDistributions`).get).toBe(true);
    expect(get(box9, `/dividendReports/#${d1}/liquidationDistributionsExceedBasis`).get).toBe(false);
    expect(get(box9, `/dividendReports/#${d1}/hasUnsupportedBoxes`).get).toBe(false);
    const unchanged = [
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/capitalGainsOrLosses`,
      `/totalIncome`,
      `/agi`,
      `/form8960Line2`,
      `/form8960Line5a`,
      `/dividendReports/#${d1}/roundedOrdinaryDividends`,
    ];
    for (const line of unchanged) expect(val(box9, line), line).toBe(val(blank, line));
    expect(get(box9, `/requiresScheduleB`).get).toBe(get(blank, `/requiresScheduleB`).get);
    expect(val(box9, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(box9, `/dividendReports/#${d1}/roundedOrdinaryDividends`)).toBe(`2000.00`);
    expect(val(box9, `/form8960Line2`)).toBe(`2000.00`);
    expect(val(box9, `/form8960Line5a`)).toBe(`0.00`);
    expect(val(box9, `/agi`)).toBe(`42000.00`);
    expect(val(blank, `/agi`)).toBe(`42000.00`);
    noKnockouts(box9);
  });
  it(`box 10 $2,000 above remaining basis stops the return`, ({ task }) => {
    // The excess is capital gain on Form 8949. Basis is not collected.
    task.meta.testedFactPaths = [
      `/dividendReports/*/noncashLiquidationDistributions`,
      `/flowKnockoutNondividendDistributionsOverBasis`,
      `/flowKnockoutDividendUnsupportedBoxes`,
    ];
    const g = build(divs({ box1a: 2000, box10: 2000, liquidationOverBasis: true }));
    expect(val(g, `/dividendReports/#${d1}/noncashLiquidationDistributions`)).toBe(`2000.00`);
    expect(get(g, `/dividendReports/#${d1}/hasUnsupportedBoxes`).get).toBe(false);
    expect(get(g, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    blocks(g, `/flowKnockoutNondividendDistributionsOverBasis`);
  });
  it(`boxes 9 and 10 left blank leave the return unchanged`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/cashLiquidationDistributions`,
      `/dividendReports/*/noncashLiquidationDistributions`,
      `/dividendReports/*/hasLiquidationDistributions`,
      `/agi`,
      `/ordinaryDividends`,
      `/form8960Line2`,
    ];
    const blank = build(divs({ box1a: 2000 }));
    const zeros = build(divs({ box1a: 2000, box9: 0, box10: 0 }));
    expect(val(blank, `/dividendReports/#${d1}/cashLiquidationDistributions`)).toBe(`0.00`);
    expect(val(blank, `/dividendReports/#${d1}/noncashLiquidationDistributions`)).toBe(`0.00`);
    expect(get(blank, `/dividendReports/#${d1}/hasLiquidationDistributions`).get).toBe(false);
    expect(get(blank, `/dividendReports/#${d1}/liquidationDistributionsExceedBasis`).complete).toBe(false);
    const lines = [
      `/ordinaryDividends`,
      `/totalIncome`,
      `/agi`,
      `/form8960Line2`,
      `/form8960Line5a`,
      `/capitalGainsOrLosses`,
    ];
    for (const line of lines) {
      expect(val(blank, line), line).toBe(val(zeros, line));
    }
    expect(val(blank, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(blank, `/totalIncome`)).toBe(`42000.00`);
    noKnockouts(blank);
    noKnockouts(zeros);
  });
  it(`boxes 2b, 2d, 2e, 2f, and 6 do not use the unsupported-box stop`, () => {
    const supported = build(divs({ box1a: 100, box2a: 40, box2e: 100, box2f: 40, box6: 100, otherBoxes: false }));
    expect(get(supported, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    noKnockouts(supported);
  });
  it(`box 11 checked and Form 8938 No prints Schedule B and does not stop`, ({ task }) => {
    // Form 1099-DIV (Rev. December 2027) draft, Instructions for Recipient, Box 11. 26 U.S.C. 6038D.
    // Instructions for Form 8938: unmarried specified individual living in the United States, more than $50,000 on
    // the last day of the year or more than $75,000 at any time. Those thresholds are not computed.
    task.meta.testedFactPaths = [
      `/hasDividendFatcaFilingRequirement`,
      `/dividendReports/*/askForm8938BecauseBox11`,
      `/flowShouldAskForm8938`,
      `/scheduleBPartIIIOutOfScope`,
      `/scheduleBPartIIIAnswered`,
      `/flowPrintRefuseScheduleBPartIII`,
      `/flowKnockoutScheduleBPartIII`,
      `/requiresScheduleB`,
      `/dividendReports/*/roundedOrdinaryDividends`,
    ];
    const g = build({
      ...divs({ box1a: 2000, box11: true }),
      '/requiredToFileForm8938': createBooleanWrapper(false),
    });
    expect(val(g, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(g, `/dividendReports/#${d1}/roundedOrdinaryDividends`)).toBe(`2000.00`);
    expect(val(g, `/dividendReports/#${d1}/payer`)).toBe(`Index Fund Co`);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/hasDividendFatcaFilingRequirement`).get).toBe(true);
    expect(get(g, `/dividendReports/#${d1}/askForm8938BecauseBox11`).get).toBe(true);
    expect(get(g, `/flowShouldAskForm8938`).get).toBe(true);
    expect(get(g, `/dividendReports/#${d1}/form8938StopsReturn`).get).toBe(false);
    expect(get(g, `/scheduleBPartIIIOutOfScope`).get).toBe(false);
    expect(get(g, `/scheduleBPartIIIAnswered`).get).toBe(true);
    expect(get(g, `/flowPrintRefuseScheduleBPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).get).toBe(false);
    expect(get(g, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    noKnockouts(g);
  });
  it(`box 11 checked and Form 8938 Yes stops`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/form8938StopsReturn`,
      `/scheduleBPartIIIOutOfScope`,
      `/flowKnockoutScheduleBPartIII`,
      `/flowPrintRefuseScheduleBPartIII`,
    ];
    const g = build({
      ...divs({ box1a: 2000, box11: true }),
      '/requiredToFileForm8938': createBooleanWrapper(true),
    });
    expect(val(g, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(get(g, `/dividendReports/#${d1}/form8938StopsReturn`).get).toBe(true);
    expect(get(g, `/scheduleBPartIIIOutOfScope`).get).toBe(true);
    expect(get(g, `/scheduleBPartIIIAnswered`).get).toBe(true);
    expect(get(g, `/flowPrintRefuseScheduleBPartIII`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutScheduleBPartIII`);
  });
  it(`box 11 unchecked does not ask Form 8938 when line 7a is No`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasDividendFatcaFilingRequirement`, `/flowShouldAskForm8938`];
    const unchecked = build(divs({ box1a: 2000, box11: false }));
    expect(get(unchecked, `/hasDividendFatcaFilingRequirement`).complete).toBe(true);
    expect(get(unchecked, `/hasDividendFatcaFilingRequirement`).get).toBe(false);
    expect(get(unchecked, `/flowShouldAskForm8938`).get).toBe(false);
    expect(get(unchecked, `/dividendReports/#${d1}/askForm8938BecauseBox11`).get).toBe(false);
    expect(get(unchecked, `/scheduleBPartIIIAnswered`).get).toBe(true);
    expect(get(unchecked, `/flowPrintRefuseScheduleBPartIII`).get).toBe(false);
    noKnockouts(unchecked);
    const unanswered = build(divs({ box1a: 2000 }));
    expect(get(unanswered, `/hasDividendFatcaFilingRequirement`).get).toBe(false);
    expect(get(unanswered, `/flowShouldAskForm8938`).get).toBe(false);
  });
  it(`box 11 checked with Form 8938 unanswered refuses the print and does not knock out`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/scheduleBPartIIIAnswered`,
      `/flowPrintRefuseScheduleBPartIII`,
      `/flowKnockoutScheduleBPartIII`,
      `/scheduleBPartIIIOutOfScope`,
    ];
    const g = build(divs({ box1a: 2000, box11: true }));
    expect(get(g, `/flowShouldAskForm8938`).get).toBe(true);
    expect(get(g, `/scheduleBPartIIIAnswered`).get).toBe(false);
    expect(get(g, `/scheduleBPartIIIOutOfScope`).complete).toBe(true);
    expect(get(g, `/scheduleBPartIIIOutOfScope`).get).toBe(false);
    expect(get(g, `/flowPrintRefuseScheduleBPartIII`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).get).toBe(false);
    const knockedOut = get(g, `/flowIsKnockedOut`);
    expect(knockedOut.complete && knockedOut.get === true).toBe(false);
  });
  it(`line 7a Yes still asks Form 8938 and still stops on Yes when box 11 is unchecked`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowShouldAskForm8938`, `/flowKnockoutScheduleBPartIII`];
    const asks = build({
      ...divs({ box1a: 100, box11: false }),
      '/hasForeignAccounts': createBooleanWrapper(true),
      '/requiredToFileFinCENForm114': createBooleanWrapper(false),
    });
    expect(get(asks, `/flowShouldAskForm8938`).get).toBe(true);
    expect(get(asks, `/dividendReports/#${d1}/askForm8938BecauseBox11`).get).toBe(false);
    const stops = build({
      ...divs({ box1a: 100, box11: false }),
      '/hasForeignAccounts': createBooleanWrapper(true),
      '/requiredToFileFinCENForm114': createBooleanWrapper(false),
      '/requiredToFileForm8938': createBooleanWrapper(true),
    });
    expect(get(stops, `/scheduleBPartIIIOutOfScope`).get).toBe(true);
    expect(get(stops, `/flowKnockoutScheduleBPartIII`).get).toBe(true);
    expect(get(stops, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(stops, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    const alreadyAsked = build({
      ...divs({ box1a: 100, box11: true }),
      '/hasForeignAccounts': createBooleanWrapper(true),
      '/requiredToFileFinCENForm114': createBooleanWrapper(false),
      '/requiredToFileForm8938': createBooleanWrapper(false),
    });
    expect(get(alreadyAsked, `/flowShouldAskForm8938`).get).toBe(true);
    expect(get(alreadyAsked, `/dividendReports/#${d1}/askForm8938BecauseBox11`).get).toBe(false);
    expect(get(alreadyAsked, `/flowKnockoutScheduleBPartIII`).get).toBe(false);
  });
  it(`a later 1099-DIV with box 11 checked asks Form 8938 once that form is reached`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasDividendFatcaFilingRequirement`, `/dividendReports/*/askForm8938BecauseBox11`];
    const g = build(divs({ box1a: 100, box11: false }, { box1a: 50, box11: true }));
    expect(get(g, `/hasDividendFatcaFilingRequirement`).get).toBe(true);
    expect(get(g, `/dividendReports/#${d1}/askForm8938BecauseBox11`).get).toBe(false);
    expect(get(g, `/dividendReports/#${d2}/askForm8938BecauseBox11`).get).toBe(true);
    expect(get(g, `/flowShouldAskForm8938`).get).toBe(true);
  });
  it(`nominee ordinary and qualified dividends are subtracted on Schedule B and lines 3b and 3a`, ({ task }) => {
    // 2026 draft Instructions for Schedule B, PDF p. 3 (printed p. 2), Line 5, Nominees.
    // FL single, W-2 $60,000. Box 1a $3,000, box 1b $2,000. Nominee ordinary $1,000, nominee qualified $800.
    task.meta.testedFactPaths = [
      `/totalNomineeOrdinaryDividends`,
      `/totalNomineeQualifiedDividends`,
      `/ordinaryDividendsBeforeNominee`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/qdcgLine2`,
      `/schDTaxWsLine2`,
      `/scheduleBPartIIRow0Payer`,
      `/scheduleBPartIIRow0Amount`,
      `/scheduleBPartIIRow1Payer`,
      `/scheduleBPartIIRow1Amount`,
      `/scheduleBPartIIRow2Payer`,
      `/scheduleBPartIIRow2Amount`,
      `/scheduleBPartIINomineeAmount`,
      `/requiresScheduleB`,
      `/flowKnockoutDividendNominee`,
    ];
    const flForm = (form: Div) => build({ ...divs(form), ...state(`fl`), ...paW2(60000) });
    const g = flForm({
      box1a: 3000,
      box1b: 2000,
      nominee: true,
      nomineeOrdinary: 1000,
      nomineeQualified: 800,
      nomineeOtherBoxes: false,
    });
    expect(val(g, `/ordinaryDividendsBeforeNominee`)).toBe(`3000.00`);
    expect(val(g, `/scheduleBPartIIRow0Payer`)).toBe(`Index Fund Co`);
    expect(val(g, `/scheduleBPartIIRow0Amount`)).toBe(`3000.00`);
    expect(val(g, `/scheduleBPartIIRow1Payer`)).toBe(`Subtotal`);
    expect(val(g, `/scheduleBPartIIRow1Amount`)).toBe(`3000.00`);
    expect(val(g, `/scheduleBPartIIRow2Payer`)).toBe(`Nominee Distribution`);
    expect(val(g, `/scheduleBPartIIRow2Amount`)).toBe(`-1000.00`);
    expect(val(g, `/scheduleBPartIINomineeAmount`)).toBe(`-1000.00`);
    expect(get(g, `/scheduleBPartIIRow3Payer`).complete).toBe(false);
    expect(val(g, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(g, `/qualifiedDividends`)).toBe(`1200.00`);
    expect(val(g, `/qdcgLine2`)).toBe(`1200.00`);
    expect(val(g, `/schDTaxWsLine2`)).toBe(`1200.00`);
    expect(get(g, `/dividendReports/#${d1}/nomineeQualifiedExceedsOrdinary`).get).toBe(false);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    noKnockouts(g);
    const plain = flForm({ box1a: 2000, box1b: 1200 });
    expect(val(g, `/taxableIncome`)).toBe(val(plain, `/taxableIncome`));
    expect(val(g, `/totalTax`)).toBe(val(plain, `/totalTax`));
  });
  it(`nominee dividends require Schedule B even when line 6 is not over $1,500`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/requiresScheduleBForNomineeDividends`,
      `/requiresScheduleBForOrdinaryDividends`,
      `/requiresScheduleB`,
    ];
    const g = build(
      divs({ box1a: 1000, nominee: true, nomineeOrdinary: 400, nomineeOtherBoxes: false })
      // build() already sets a filer; state stays the default non-computed state.
    );
    expect(val(g, `/ordinaryDividends`)).toBe(`600.00`);
    expect(get(g, `/requiresScheduleBForOrdinaryDividends`).get).toBe(false);
    expect(get(g, `/requiresScheduleBForNomineeDividends`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    noKnockouts(g);
  });
  it(`a nominee amount equal to box 1a and box 1b does not stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`, `/ordinaryDividends`, `/qualifiedDividends`];
    const g = build(
      divs({
        box1a: 2000,
        box1b: 2000,
        nominee: true,
        nomineeOrdinary: 2000,
        nomineeQualified: 2000,
        nomineeOtherBoxes: false,
      })
    );
    expect(val(g, `/ordinaryDividends`)).toBe(`0.00`);
    expect(val(g, `/qualifiedDividends`)).toBe(`0.00`);
    noKnockouts(g);
  });
  it(`nominee amount over box 1a stops`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`, `/dividendReports/*/nomineeAmountsOverLimit`];
    blocks(
      build(
        divs({
          box1a: 3000,
          box1b: 2000,
          nominee: true,
          nomineeOrdinary: 3500,
          nomineeQualified: 0,
          nomineeOtherBoxes: false,
        })
      ),
      `/flowKnockoutDividendNominee`
    );
  });
  it(`nominee subtraction that leaves box 1b above box 1a stops`, ({ task }) => {
    // Box 1b is included in box 1a, so remaining box 1b cannot exceed remaining box 1a.
    // Form 1040 instr. (2025) p. 25, Line 3a. Box 1a $3,000, box 1b $2,500, nominee ordinary $1,000,
    // nominee qualified $200: remaining $2,300 > remaining $2,000. The box limits still hold.
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`, `/dividendReports/*/nomineeQualifiedExceedsOrdinary`];
    const over = build(
      divs({
        box1a: 3000,
        box1b: 2500,
        nominee: true,
        nomineeOrdinary: 1000,
        nomineeQualified: 200,
        nomineeOtherBoxes: false,
      })
    );
    expect(get(over, `/dividendReports/#${d1}/nomineeAmountsOverLimit`).get).toBe(false);
    expect(get(over, `/dividendReports/#${d1}/nomineeQualifiedExceedsOrdinary`).get).toBe(true);
    blocks(over, `/flowKnockoutDividendNominee`);
    const equal = build(
      divs({
        box1a: 3000,
        box1b: 2500,
        nominee: true,
        nomineeOrdinary: 1000,
        nomineeQualified: 500,
        nomineeOtherBoxes: false,
      })
    );
    expect(get(equal, `/dividendReports/#${d1}/nomineeQualifiedExceedsOrdinary`).get).toBe(false);
    expect(val(equal, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(equal, `/qualifiedDividends`)).toBe(`2000.00`);
    noKnockouts(equal);
  });
  it(`nominee qualified dividends over the nominee ordinary amount stop`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`];
    blocks(
      build(
        divs({
          box1a: 3000,
          box1b: 2000,
          nominee: true,
          nomineeOrdinary: 1000,
          nomineeQualified: 1200,
          nomineeOtherBoxes: false,
        })
      ),
      `/flowKnockoutDividendNominee`
    );
  });
  it(`a nominee share of another box stops`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendNominee`, `/dividendReports/*/nomineeShareOfOtherBoxes`];
    const withBox5 = build(
      divs({
        box1a: 500,
        box5: 50,
        nominee: true,
        nomineeOrdinary: 100,
        nomineeOtherBoxes: true,
      })
    );
    expect(get(withBox5, `/flowKnockoutSection199ADividendsHoldingPeriod`).get).toBe(false);
    blocks(withBox5, `/flowKnockoutDividendNominee`);
    blocks(
      build(
        divs({
          box1a: 3000,
          box1b: 2000,
          nominee: true,
          nomineeOrdinary: 1000,
          nomineeQualified: 800,
          nomineeOtherBoxes: true,
        })
      ),
      `/flowKnockoutDividendNominee`
    );
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
  it(`a full-year PA resident with box 6 stops; a Florida filer with the same box 6 does not`, ({ task }) => {
    // 26 U.S.C. 67(g): box 6 is included in box 1a and is not a federal deduction. No PA subtraction is pinned.
    task.meta.testedFactPaths = [
      `/flowKnockoutPaDividendInvestmentExpenses`,
      `/flowKnockoutStateReturn`,
      `/ordinaryDividends`,
      `/flowKnockoutDividendAmountsInconsistent`,
    ];
    const pa = paBuild(divs({ box1a: 100, box6: 25 }));
    expect(get(pa, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(true);
    expect(get(pa, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(pa, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(pa, `/flowKnockoutDividendAmountsInconsistent`).get).toBe(false);
    expect(get(pa, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(val(pa, `/ordinaryDividends`)).toBe(`100.00`);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaDividendInvestmentExpenses`);

    const paZero = paBuild(divs({ box1a: 100, box6: 0 }));
    expect(get(paZero, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
    expect(get(paZero, `/flowIsKnockedOut`).get).toBe(false);
    expect(val(paZero, `/ordinaryDividends`)).toBe(`100.00`);

    const paBlank = paBuild(divs({ box1a: 100 }));
    expect(get(paBlank, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
    expect(get(paBlank, `/flowIsKnockedOut`).get).toBe(false);

    const fl = build({ ...divs({ box1a: 100, box6: 25 }), ...state(`fl`) });
    expect(get(fl, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(fl, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
    expect(val(fl, `/ordinaryDividends`)).toBe(`100.00`);
    noKnockouts(fl);

    const oneOfTwo = paBuild(divs({ box1a: 80, box6: 0 }, { box1a: 20, box6: 1 }));
    expect(get(oneOfTwo, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(true);
    expect(get(oneOfTwo, `/flowIsKnockedOut`).get).toBe(true);
    expect(val(oneOfTwo, `/ordinaryDividends`)).toBe(`100.00`);
  });
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
  it(`part-year with box 2a stops on the dividends knockout and line 3 does not include line 10`, ({ task }) => {
    // PA Schedule B (2025) instructions, PDF p. 4, LINE 4 lists a nonresident-period amount as a reduction. LINE 10
    // does not allocate box 2a between the residency period and the nonresident period, so /paLine3 stays the
    // residency-period ordinary dividends. The stop is /flowKnockoutPaDividends when /paPartYearHasDividends and
    // /totalCapitalGainDistributions is greater than $0. It does not depend on /flowKnockoutPaScheduleB.
    task.meta.testedFactPaths = [
      `/paLine3`,
      `/paScheduleBLine10`,
      `/flowKnockoutPaDividends`,
      `/flowKnockoutPaScheduleB`,
    ];
    const partYear = (box2a: number, resident?: string) =>
      build({
        ...divs({ box1a: 700, box2a }),
        '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
        '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
        '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
        [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
        [`/formW2s/#${w2Id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`40000`),
        ...(resident === undefined ? {} : { '/paPartYearResidentDividends': createDollarWrapper(resident) }),
      });
    const allResident = partYear(10, `700`);
    expect(val(allResident, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(allResident, `/paLine3`)).toBe(`700.00`);
    expect(get(allResident, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(allResident, `/flowKnockoutPaScheduleB`).get).toBe(true);
    expect(get(allResident, `/flowIsKnockedOut`).get).toBe(true);
    const partial = partYear(10, `200`);
    expect(val(partial, `/paPartYearNonresidentDividends`)).toBe(`500.00`);
    expect(val(partial, `/paLine3`)).toBe(`200.00`);
    expect(get(partial, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(partial, `/flowKnockoutPaScheduleB`).get).toBe(true);
    const unanswered = partYear(10);
    expect(get(unanswered, `/paLine3`).complete).toBe(false);
    expect(val(unanswered, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(get(unanswered, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(unanswered, `/flowKnockoutPaScheduleB`).get).toBe(true);
    // Whole dollars drop box 2a under $0.50, so Schedule B line 10 is $0. The part-year stop still uses the
    // unrounded total and does not depend on /flowKnockoutPaScheduleB.
    const cents = partYear(0.4, `700`);
    expect(val(cents, `/totalCapitalGainDistributions`)).toBe(`0.40`);
    expect(val(cents, `/paScheduleBLine10`)).toBe(`0.00`);
    expect(val(cents, `/paLine3`)).toBe(`700.00`);
    expect(get(cents, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(cents, `/flowKnockoutPaScheduleB`).get).toBe(false);
  });
  it(`part-year with only box 2a stops on the dividends knockout and line 3 stays $0`, ({ task }) => {
    // Box 1a is $0, so /hasDividendIncome is false and /paPartYearHasDividends is false. PA Schedule B (2025)
    // instructions, PDF p. 4, LINE 10 does not allocate the capital gain distribution, so /paLine3 stays $0.
    // /flowKnockoutPaDividends is /paPartYearSupported and /totalCapitalGainDistributions greater than $0. That
    // clause is outside /hasDividendIncome and does not depend on /flowKnockoutPaScheduleB.
    task.meta.testedFactPaths = [`/paLine3`, `/flowKnockoutPaDividends`, `/paPartYearSupported`];
    const g = build({
      ...divs({ box1a: 0, box2a: 10 }),
      '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
      '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
      '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
      [`/formW2s/#${w2Id}/paPartYearW2State`]: createEnumWrapper(`pa`, `/paPartYearW2StateOptions`),
      [`/formW2s/#${w2Id}/paPartYearResidentPeriodWages`]: createDollarWrapper(`40000`),
    });
    expect(get(g, `/hasDividendIncome`).get).toBe(false);
    expect(get(g, `/paPartYearHasDividends`).get).toBe(false);
    expect(get(g, `/paPartYearSupported`).get).toBe(true);
    expect(val(g, `/totalCapitalGainDistributions`)).toBe(`10.00`);
    expect(val(g, `/paLine3`)).toBe(`0.00`);
    expect(val(g, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaScheduleB`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
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
    // Box 2f at box 2a is already in box 2a. Schedule D line 13 stays box 2a. 26 U.S.C. 897(a).
    const with2f = build({
      ...divs({ box1a: 500, box2a: 1200, box2e: 500, box2f: 1200, box6: 0 }),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(val(with2f, `/totalCapitalGainDistributions`)).toBe(`1200.00`);
    expect(val(with2f, `/scheduleDLine13`)).toBe(`1200.00`);
    expect(val(with2f, `/ordinaryDividends`)).toBe(`500.00`);
    noKnockouts(with2f);
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

  it(`box 2a is PA Schedule B line 10 and PA-40 line 3; a full-year single return prints the schedule`, ({ task }) => {
    // PA-40 IN (2025) p. 15 and p. 32: capital gain distributions are dividend income on line 3, not PA Schedule D.
    // p. 33 line 10 and PA Schedule B (2025) instructions PDF p. 2, LINE 10: the federal capital gain distribution.
    // Form line 12 adds line 10 and is entered on PA-40 line 3. WHO MUST COMPLETE: a line 10 amount requires the
    // schedule. /paScheduleBSupported prints it for a full-year resident who is not filing jointly.
    task.meta.testedFactPaths = [
      `/paScheduleBLine10`,
      `/paLine3`,
      `/paLine5`,
      `/paLine9`,
      `/flowKnockoutPaScheduleB`,
      `/flowKnockoutPaDividends`,
    ];
    const pa = build({ ...divs({ box1a: 500, box2a: 10 }), ...state(`pa`) });
    expect(val(pa, `/totalCapitalGainDistributions`)).toBe(`10.00`);
    expect(val(pa, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(pa, `/paLine3`)).toBe(`510.00`);
    expect(val(pa, `/paLine5`)).toBe(`0.00`);
    expect(val(pa, `/paLine9`)).toBe(`40510.00`); // wages 40,000 + line 3 510
    expect(get(pa, `/paScheduleBSupported`).get).toBe(true);
    expect(get(pa, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaScheduleD`).get).toBe(false);
    expect(get(pa, `/flowIsKnockedOut`).get).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaScheduleB`);

    const onlyCgd = build({ ...divs({ box1a: 0, box2a: 10 }), ...state(`pa`) });
    expect(val(onlyCgd, `/ordinaryDividends`)).toBe(`0.00`);
    expect(val(onlyCgd, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(onlyCgd, `/paLine3`)).toBe(`10.00`);
    expect(get(onlyCgd, `/paScheduleBSupported`).get).toBe(true);
    expect(get(onlyCgd, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(onlyCgd, `/flowKnockoutPaScheduleB`).get).toBe(false);

    const noCgd = build({ ...divs({ box1a: 500 }), ...state(`pa`) });
    expect(val(noCgd, `/paScheduleBLine10`)).toBe(`0.00`);
    expect(val(noCgd, `/paLine3`)).toBe(`500.00`);
    expect(get(noCgd, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(noCgd, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(noCgd, `/flowIsKnockedOut`).get).toBe(false);

    // Not a PA-40: line 10 is $0 and line 3 stays Form 1040 line 3b.
    const nj = build(divs({ box1a: 500, box2a: 10 }));
    expect(val(nj, `/paScheduleBLine10`)).toBe(`0.00`);
    expect(val(nj, `/paLine3`)).toBe(`500.00`);
    expect(get(nj, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(nj, `/flowKnockoutPaScheduleB`).get).toBe(false);

    // Schedule B instructions, PDF p. 1: drop under $0.50; $0.50 and over rounds up. $0 on line 10 needs no schedule.
    const under = build({ ...divs({ box1a: 100, box2a: 0.49 }), ...state(`pa`) });
    expect(val(under, `/paScheduleBLine10`)).toBe(`0.00`);
    expect(val(under, `/paLine3`)).toBe(`100.00`);
    expect(get(under, `/flowKnockoutPaScheduleB`).get).toBe(false);
    const halves = build({ ...divs({ box1a: 10.4, box2a: 10.4 }, { box1a: 0, box2a: 10.4 }), ...state(`pa`) });
    expect(val(halves, `/totalCapitalGainDistributions`)).toBe(`20.80`);
    expect(val(halves, `/paScheduleBLine10`)).toBe(`21.00`);
    expect(val(halves, `/ordinaryDividends`)).toBe(`10.00`); // 10.40 rounds to 10 on Form 1040 line 3b
    expect(val(halves, `/paLine3`)).toBe(`31.00`);
    expect(get(halves, `/paScheduleBSupported`).get).toBe(true);
    expect(get(halves, `/flowKnockoutPaScheduleB`).get).toBe(false);

    // Schedule D is required, so box 2a is Schedule D line 13, not Form 1040 line 7a. Line 10 is still box 2a, not the
    // net after the long-term carryover (Schedule D line 15). PA-40 IN (2025) p. 32: do not report it on PA Schedule D.
    const withCarry = build({
      ...divs({ box1a: 500, box2a: 1200 }),
      ...state(`pa`),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(get(withCarry, `/requiresScheduleD`).get).toBe(true);
    expect(val(withCarry, `/scheduleDLine13`)).toBe(`1200.00`);
    expect(val(withCarry, `/scheduleDLine15`)).toBe(`1000.00`);
    expect(val(withCarry, `/paScheduleBLine10`)).toBe(`1200.00`);
    expect(val(withCarry, `/paScheduleBTaxpayerLine1`)).toBe(`500.00`);
    expect(val(withCarry, `/paScheduleBTaxpayerLine10`)).toBe(`1200.00`);
    expect(val(withCarry, `/paScheduleBTaxpayerLine12`)).toBe(`1700.00`);
    expect(val(withCarry, `/paScheduleBSpouseLine12`)).toBe(`0.00`);
    expect(val(withCarry, `/paLine3`)).toBe(`1700.00`);
    expect(val(withCarry, `/paLine5`)).toBe(`0.00`);
    expect(get(withCarry, `/paScheduleBSupported`).get).toBe(true);
    expect(get(withCarry, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(withCarry, `/flowKnockoutPaScheduleD`).get).toBe(false);
    expect(get(withCarry, `/flowKnockoutPaDividends`).get).toBe(false);
  });

  it(`married filing jointly: each filer's Schedule B lines 1, 10, and 12, and line 3 is their sum`, ({ task }) => {
    // PA-40 Schedule B (2025) form, PDF p. 1: a separate schedule includes only that filer's share.
    // Instructions, PDF p. 4, LINE 1: only that filer's portion of Form 1040 line 3b. LINE 10: that filer's box 2a.
    // PDF p. 5, LINE 12: the combined line 12 amounts go on PA-40 line 3.
    task.meta.testedFactPaths = [
      `/paScheduleBTaxpayerLine1`,
      `/paScheduleBTaxpayerLine10`,
      `/paScheduleBTaxpayerLine12`,
      `/paScheduleBSpouseLine1`,
      `/paScheduleBSpouseLine10`,
      `/paScheduleBSpouseLine12`,
      `/paLine3`,
    ];
    const g = build(
      {
        ...divs({ box1a: 800, box2a: 1200 }, { box1a: 300, box2a: 450, filer: spouseId }),
        ...state(`pa`),
      },
      mfjFilerData
    );
    expect(val(g, `/paScheduleBTaxpayerLine1`)).toBe(`800.00`);
    expect(val(g, `/paScheduleBTaxpayerLine5`)).toBe(`0.00`);
    expect(val(g, `/paScheduleBTaxpayerLine6`)).toBe(`800.00`);
    expect(val(g, `/paScheduleBTaxpayerLine10`)).toBe(`1200.00`);
    expect(val(g, `/paScheduleBTaxpayerLine12`)).toBe(`2000.00`);
    expect(val(g, `/paScheduleBSpouseLine1`)).toBe(`300.00`);
    expect(val(g, `/paScheduleBSpouseLine5`)).toBe(`0.00`);
    expect(val(g, `/paScheduleBSpouseLine6`)).toBe(`300.00`);
    expect(val(g, `/paScheduleBSpouseLine10`)).toBe(`450.00`);
    expect(val(g, `/paScheduleBSpouseLine12`)).toBe(`750.00`);
    expect(val(g, `/paLine3`)).toBe(`2750.00`);
    expect(val(g, `/paScheduleBLine10`)).toBe(`1650.00`);
    expect(val(g, `/paLine5`)).toBe(`0.00`);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaScheduleB`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaScheduleD`).get).toBe(false);
  });

  it(`box 2a counts as unearned income for Form 8615`, () => {
    const g = build(divs({ box1a: 100, box2a: 2650 }));
    expect(val(g, `/form8615UnearnedIncome`)).toBe(`2750.00`);
  });

  it(`box 2b of $0 leaves the QDCG worksheet and Form 6251 unchanged`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/totalUnrecapturedSection1250Gain`,
      `/scheduleDLine19`,
      `/usesScheduleDTaxWorksheet`,
      `/usesQdcgTaxWorksheet`,
      `/tentativeTaxFromTaxableIncome`,
      `/form6251Line37`,
      `/form6251Line38`,
    ];
    // Same return as "box 2a above the 0% bracket is taxed at 15%": $40,000 wages and box 2a $40,000.
    const blank = build(divs({ box1a: 0.01, box2a: 40000 }));
    const zero = build(divs({ box1a: 0.01, box2a: 40000, box2b: 0 }));
    const paths = [
      `/qdcgLine1`,
      `/qdcgLine5`,
      `/qdcgLine9`,
      `/qdcgLine17`,
      `/qdcgLine18`,
      `/qdcgLine22`,
      `/qdcgLine25`,
      `/usesQdcgTaxWorksheet`,
      `/tentativeTaxFromTaxableIncome`,
      `/form6251UsesPartIII`,
      `/form6251Line13`,
      `/form6251Line15`,
      `/form6251Line20`,
      `/form6251Line27`,
      `/form6251Line37`,
      `/form6251Line38`,
      `/form6251Line40`,
      `/scheduleDLine13`,
      `/scheduleDLine19`,
      `/scheduleDLine20Yes`,
    ];
    for (const p of paths) {
      expect(val(zero, p), p).toBe(val(blank, p));
      expect(get(zero, p).complete, p).toBe(get(blank, p).complete);
    }
    expect(val(zero, `/totalUnrecapturedSection1250Gain`)).toBe(`0.00`);
    expect(val(blank, `/totalUnrecapturedSection1250Gain`)).toBe(`0.00`);
    expect(get(zero, `/usesScheduleDTaxWorksheet`).get).toBe(false);
    expect(get(blank, `/usesScheduleDTaxWorksheet`).get).toBe(false);
    expect(val(zero, `/qdcgLine18`)).toBe(`2167.50`);
    expect(val(zero, `/tentativeTaxFromTaxableIncome`)).toBe(val(zero, `/qdcgLine25`));
    noKnockouts(zero);
  });
});

// Form 1099-DIV box 2b is unrecaptured section 1250 gain already inside box 2a. 2026 draft Form 1099-DIV,
// Instructions for Recipient, Box 2b. 2026 draft Instructions for Schedule D, Unrecaptured Section 1250 Gain
// Worksheet line 11 and Schedule D Tax Worksheet. 26 U.S.C. 1(h)(1)(E), 1(h)(6).
describe(`#86 box 2b unrecaptured section 1250 gain and the Schedule D Tax Worksheet`, () => {
  it(`box 2a $10,000 and box 2b $4,000, with $250,000 of wages, taxes $4,000 at 25%`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/totalUnrecapturedSection1250Gain`,
      `/scheduleDLine13`,
      `/scheduleDLine19`,
      `/scheduleDLine20No`,
      `/usesScheduleDTaxWorksheet`,
      `/usesQdcgTaxWorksheet`,
      `/schDTaxWsLine40`,
      `/schDTaxWsLine47`,
      `/tentativeTaxFromTaxableIncome`,
      `/form6251Line13`,
      `/form6251Line14`,
      `/form6251Line37`,
    ];
    // Single. Wages $250,000. Box 1a $0, box 2a $10,000, box 2b $4,000. Standard deduction $16,100
    // (Rev. Proc. 2025-32 section 4.14). AGI $260,000. Taxable income $243,900.
    // Schedule D line 13 is box 2a only. Line 19 is the worksheet result, $4,000.
    // Schedule D Tax Worksheet line 40 is $4,000 x 25% = $1,000. Line 47 is $53,204.
    // The QDCG worksheet would tax all $10,000 at 15% and produce $52,804. The difference is $400.
    const g = build({ ...paW2(250000), ...divs({ box1a: 0, box2a: 10000, box2b: 4000 }) });
    expect(val(g, `/taxableIncome`)).toBe(`243900.00`);
    expect(get(g, `/requiresScheduleD`).get).toBe(true);
    expect(get(g, `/capitalGainDistributionsWithoutScheduleD`).get).toBe(false);
    expect(val(g, `/totalCapitalGainDistributions`)).toBe(`10000.00`);
    expect(val(g, `/capitalGainsOrLosses`)).toBe(`10000.00`);
    expect(val(g, `/scheduleDLine13`)).toBe(`10000.00`);
    expect(val(g, `/scheduleDLine15`)).toBe(`10000.00`);
    expect(val(g, `/scheduleDLine16`)).toBe(`10000.00`);
    expect(get(g, `/scheduleDLine17Yes`).get).toBe(true);
    expect(val(g, `/unrecaptured1250WsLine11`)).toBe(`4000.00`);
    expect(val(g, `/unrecaptured1250WsLine17`)).toBe(`0.00`);
    expect(val(g, `/unrecaptured1250WsLine18`)).toBe(`4000.00`);
    expect(val(g, `/scheduleDLine19`)).toBe(`4000.00`);
    expect(get(g, `/scheduleDLine20Yes`).get).toBe(false);
    expect(get(g, `/scheduleDLine20No`).get).toBe(true);
    expect(get(g, `/usesScheduleDTaxWorksheet`).get).toBe(true);
    expect(get(g, `/usesQdcgTaxWorksheet`).get).toBe(false);
    expect(val(g, `/schDTaxWsLine1`)).toBe(`243900.00`);
    expect(val(g, `/schDTaxWsLine10`)).toBe(`10000.00`);
    expect(val(g, `/schDTaxWsLine13`)).toBe(`6000.00`);
    expect(val(g, `/schDTaxWsLine14`)).toBe(`237900.00`);
    expect(val(g, `/schDTaxWsLine21`)).toBe(`233900.00`);
    expect(val(g, `/schDTaxWsLine31`)).toBe(`900.00`);
    expect(val(g, `/schDTaxWsLine39`)).toBe(`4000.00`);
    expect(val(g, `/schDTaxWsLine40`)).toBe(`1000.00`);
    expect(val(g, `/schDTaxWsLine44`)).toBe(`51304.00`);
    expect(val(g, `/schDTaxWsLine46`)).toBe(`54504.00`);
    expect(val(g, `/schDTaxWsLine47`)).toBe(`53204.00`);
    expect(val(g, `/tentativeTaxFromTaxableIncome`)).toBe(`53204.00`);
    expect(val(g, `/qdcgLine25`)).toBe(`52804.00`);
    expect(get(g, `/form6251UsesPartIII`).get).toBe(true);
    expect(val(g, `/form6251Line13`)).toBe(`6000.00`);
    expect(val(g, `/form6251Line14`)).toBe(`4000.00`);
    expect(val(g, `/form6251Line15`)).toBe(`10000.00`);
    expect(val(g, `/form6251Line20`)).toBe(`237900.00`);
    expect(val(g, `/form6251Line27`)).toBe(`233900.00`);
    expect(val(g, `/form6251Line37`)).toBe(`1000.00`);
    expect(val(g, `/form6251Line40`)).toBe(`43474.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    noKnockouts(g);
    expect(get(g, `/flowKnockoutUnrecaptured1250Gain`).get).toBe(false);
  });

  it(`a long-term carryover that absorbs box 2b leaves line 19 at $0 and uses the QDCG worksheet`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine19`, `/usesScheduleDTaxWorksheet`, `/usesQdcgTaxWorksheet`];
    // Worksheet line 16 is Schedule D line 14. Line 18 is zero, so line 19 is zero and the Schedule D Tax
    // Worksheet is not used. Lines 15 and 16 are still gains, so the QDCG worksheet applies.
    const g = build({
      ...divs({ box1a: 500, box2a: 10000, box2b: 4000 }),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`8000`),
    });
    expect(val(g, `/scheduleDLine13`)).toBe(`10000.00`);
    expect(val(g, `/scheduleDLine15`)).toBe(`2000.00`);
    expect(val(g, `/unrecaptured1250WsLine17`)).toBe(`8000.00`);
    expect(val(g, `/scheduleDLine19`)).toBe(`0.00`);
    expect(get(g, `/scheduleDLine20Yes`).get).toBe(true);
    expect(get(g, `/scheduleDLine20No`).get).toBe(false);
    expect(get(g, `/usesScheduleDTaxWorksheet`).get).toBe(false);
    expect(get(g, `/usesQdcgTaxWorksheet`).get).toBe(true);
    expect(val(g, `/tentativeTaxFromTaxableIncome`)).toBe(val(g, `/qdcgLine25`));
    noKnockouts(g);
  });

  it(`box 2b larger than box 2a stops; an equal amount does not`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/amountsInconsistent`, `/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 100, box2a: 40, box2b: 41 })), `/flowKnockoutDividendAmountsInconsistent`);
    blocks(build(divs({ box1a: 100, box2b: 1 })), `/flowKnockoutDividendAmountsInconsistent`);
    const equal = build(divs({ box1a: 100, box2a: 40, box2b: 40 }));
    expect(get(equal, `/flowKnockoutDividendAmountsInconsistent`).get).toBe(false);
    expect(val(equal, `/scheduleDLine13`)).toBe(`40.00`);
    expect(val(equal, `/scheduleDLine19`)).toBe(`40.00`);
    noKnockouts(equal);
    // The comparison uses the unrounded amounts. $10.00 is more than $9.60 even though both round to $10.
    blocks(build(divs({ box1a: 0, box2a: 9.6, box2b: 10 })), `/flowKnockoutDividendAmountsInconsistent`);
  });

  it(`box 2b rounds to whole dollars on worksheet line 11 and still forces Schedule D`, () => {
    const cents = build(divs({ box1a: 0, box2a: 1, box2b: 0.4 }));
    expect(get(cents, `/requiresScheduleD`).get).toBe(true);
    expect(val(cents, `/unrecaptured1250WsLine11`)).toBe(`0.00`);
    expect(val(cents, `/scheduleDLine19`)).toBe(`0.00`);
    expect(get(cents, `/usesScheduleDTaxWorksheet`).get).toBe(false);
    const dollar = build(divs({ box1a: 0, box2a: 1, box2b: 0.6 }));
    expect(val(dollar, `/unrecaptured1250WsLine11`)).toBe(`1.00`);
    expect(val(dollar, `/scheduleDLine19`)).toBe(`1.00`);
    expect(get(dollar, `/usesScheduleDTaxWorksheet`).get).toBe(true);
    noKnockouts(dollar);
  });

  it(`box 2b does not change PA Schedule B line 10`, ({ task }) => {
    task.meta.testedFactPaths = [`/paScheduleBLine10`, `/flowKnockoutPaDividends`];
    const pa = build({ ...divs({ box1a: 500, box2a: 10, box2b: 4 }), ...state(`pa`) });
    expect(val(pa, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(pa, `/paLine3`)).toBe(`510.00`);
    expect(get(pa, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(pa, `/flowIsKnockedOut`).get).toBe(false);
  });
});

// Form 1099-DIV box 2d is collectibles (28%) gain already inside box 2a. Form 1099-DIV (Rev. December 2027) draft,
// Instructions for Recipient, Box 2d. 2025 Instructions for Schedule D, 28% Rate Gain Worksheet line 4 and Schedule D
// Tax Worksheet lines 11 and 36-45. 26 U.S.C. 1(h)(1)(F), 1(h)(4), 1(h)(5). Rev. Proc. 2025-32 sections 4.01, 4.03,
// and 4.14 (single ordinary brackets, 0%/15% breakpoints, and the standard deduction).
describe(`#86 box 2d collectibles (28%) gain and the 28% Rate Gain Worksheet`, () => {
  const scenario = () =>
    build({
      ...paW2(240000),
      [`/formW2s/#${w2Id}/writableFederalWithholding`]: createDollarWrapper(`50000`),
      [`/formW2s/#${w2Id}/writableMedicareWages`]: createDollarWrapper(`240000`),
      [`/formW2s/#${w2Id}/writableMedicareWithholding`]: createDollarWrapper(`3840`),
      ...divs({ box1a: 0, box2a: 3000, box2d: 1000 }),
    });

  it(`box 2a $3,000 and box 2d $1,000, with $240,000 of wages, ends in a $1,202 refund`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/totalCollectibles28RateGain`,
      `/rateGainWsLine4`,
      `/rateGainWsLine7`,
      `/scheduleDLine18`,
      `/scheduleDLine19`,
      `/scheduleDLine20No`,
      `/usesScheduleDTaxWorksheet`,
      `/usesQdcgTaxWorksheet`,
      `/schDTaxWsLine11`,
      `/schDTaxWsLine43`,
      `/schDTaxWsLine47`,
      `/tentativeTaxFromTaxableIncome`,
      `/qdcgLine25`,
      `/form8959Line12`,
      `/form8959Line24`,
      `/form8960Line17`,
      `/form6251Line4`,
      `/form6251Line7`,
      `/form6251Line13`,
      `/form6251Line18`,
      `/amt`,
      `/totalTax`,
      `/totalPayments`,
      `/overpayment`,
    ];
    // Single. W-2 box 1 $240,000, box 2 $50,000, box 5 $240,000, box 6 $3,840. Box 1a $0, box 2a $3,000,
    // box 2d $1,000. Standard deduction $16,100 (Rev. Proc. 2025-32 section 4.14). AGI $243,000.
    // Taxable income $226,900. Schedule D line 18 is the 28% Rate Gain Worksheet, $1,000.
    // Schedule D Tax Worksheet line 43 is $1,000 x 28% = $280. Line 47 is $48,684.
    // The QDCG worksheet would tax all $3,000 at 15% and produce $48,554. The difference is $130.
    const g = scenario();
    expect(val(g, `/agi`)).toBe(`243000.00`);
    expect(val(g, `/taxableIncome`)).toBe(`226900.00`);
    expect(get(g, `/requiresScheduleD`).get).toBe(true);
    expect(get(g, `/capitalGainDistributionsWithoutScheduleD`).get).toBe(false);
    expect(val(g, `/totalCollectibles28RateGain`)).toBe(`1000.00`);
    expect(val(g, `/totalCapitalGainDistributions`)).toBe(`3000.00`);
    expect(val(g, `/scheduleDLine13`)).toBe(`3000.00`);
    expect(val(g, `/scheduleDLine15`)).toBe(`3000.00`);
    expect(val(g, `/scheduleDLine16`)).toBe(`3000.00`);
    expect(get(g, `/scheduleDLine17Yes`).get).toBe(true);
    expect(val(g, `/rateGainWsLine4`)).toBe(`1000.00`);
    expect(val(g, `/rateGainWsLine7`)).toBe(`1000.00`);
    expect(val(g, `/scheduleDLine18`)).toBe(`1000.00`);
    expect(val(g, `/scheduleDLine19`)).toBe(`0.00`);
    expect(val(g, `/unrecaptured1250WsLine17`)).toBe(`0.00`);
    expect(get(g, `/scheduleDLine20Yes`).get).toBe(false);
    expect(get(g, `/scheduleDLine20No`).get).toBe(true);
    expect(get(g, `/usesScheduleDTaxWorksheet`).get).toBe(true);
    expect(get(g, `/usesQdcgTaxWorksheet`).get).toBe(false);
    expect(val(g, `/schDTaxWsLine10`)).toBe(`3000.00`);
    expect(val(g, `/schDTaxWsLine11`)).toBe(`1000.00`);
    expect(val(g, `/schDTaxWsLine12`)).toBe(`1000.00`);
    expect(val(g, `/schDTaxWsLine13`)).toBe(`2000.00`);
    expect(val(g, `/schDTaxWsLine14`)).toBe(`224900.00`);
    expect(val(g, `/schDTaxWsLine17`)).toBe(`49450.00`);
    expect(val(g, `/schDTaxWsLine18`)).toBe(`223900.00`);
    expect(val(g, `/schDTaxWsLine19`)).toBe(`201775.00`);
    expect(val(g, `/schDTaxWsLine20`)).toBe(`201775.00`);
    expect(val(g, `/schDTaxWsLine21`)).toBe(`223900.00`);
    expect(val(g, `/schDTaxWsLine22`)).toBe(`0.00`);
    expect(val(g, `/schDTaxWsLine30`)).toBe(`2000.00`);
    expect(val(g, `/schDTaxWsLine31`)).toBe(`300.00`);
    expect(val(g, `/schDTaxWsLine32`)).toBe(`2000.00`);
    expect(val(g, `/schDTaxWsLine33`)).toBe(`0.00`);
    expect(val(g, `/schDTaxWsLine41`)).toBe(`225900.00`);
    expect(val(g, `/schDTaxWsLine42`)).toBe(`1000.00`);
    expect(val(g, `/schDTaxWsLine43`)).toBe(`280.00`);
    expect(val(g, `/schDTaxWsLine44`)).toBe(`48104.00`);
    expect(val(g, `/schDTaxWsLine45`)).toBe(`48684.00`);
    expect(val(g, `/schDTaxWsLine46`)).toBe(`49064.00`);
    expect(val(g, `/schDTaxWsLine47`)).toBe(`48684.00`);
    expect(val(g, `/tentativeTaxFromTaxableIncome`)).toBe(`48684.00`);
    expect(val(g, `/qdcgLine25`)).toBe(`48554.00`);
    expect(Number(val(g, `/schDTaxWsLine47`)) - Number(val(g, `/qdcgLine25`))).toBe(130);
    expect(val(g, `/form8959Line7`)).toBe(`360.00`);
    expect(val(g, `/form8959Line12`)).toBe(`360.00`);
    expect(val(g, `/form8959Line24`)).toBe(`360.00`);
    expect(val(g, `/form8960Line17`)).toBe(`114.00`);
    expect(val(g, `/form6251Line4`)).toBe(`243000.00`);
    expect(val(g, `/form6251Line13`)).toBe(`2000.00`);
    expect(val(g, `/form6251Line18`)).toBe(`39234.00`);
    expect(val(g, `/form6251Line7`)).toBe(`39534.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    expect(val(g, `/totalTax`)).toBe(`49158.00`);
    expect(val(g, `/totalPayments`)).toBe(`50360.00`);
    expect(val(g, `/overpayment`)).toBe(`1202.00`);
    noKnockouts(g);
    expect(get(g, `/flowKnockoutCollectibles`).get).toBe(false);
  });

  it(`box 2d larger than box 2a stops; an equal amount does not`, ({ task }) => {
    task.meta.testedFactPaths = [`/dividendReports/*/amountsInconsistent`, `/flowKnockoutDividendAmountsInconsistent`];
    blocks(build(divs({ box1a: 0, box2a: 3000, box2d: 3001 })), `/flowKnockoutDividendAmountsInconsistent`);
    const equal = build(divs({ box1a: 0, box2a: 3000, box2d: 3000 }));
    expect(get(equal, `/flowKnockoutDividendAmountsInconsistent`).get).toBe(false);
    expect(val(equal, `/scheduleDLine18`)).toBe(`3000.00`);
    noKnockouts(equal);
  });

  it(`box 2d with a long-term capital loss carryover stops instead of netting`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCollectibles28RateGainNetting`, `/scheduleDLine14`];
    const g = build({
      ...divs({ box1a: 0, box2a: 3000, box2d: 1000 }),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(val(g, `/scheduleDLine14`)).toBe(`200.00`);
    blocks(g, `/flowKnockoutCollectibles28RateGainNetting`);
  });

  it(`box 2d with a Schedule D line 7 loss stops instead of netting`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCollectibles28RateGainNetting`, `/scheduleDLine7`];
    const g = build({
      ...divs({ box1a: 0, box2a: 3000, box2d: 1000 }),
      '/writableShortTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(val(g, `/scheduleDLine7`)).toBe(`-200.00`);
    blocks(g, `/flowKnockoutCollectibles28RateGainNetting`);
  });

  it(`box 2d rounds to whole dollars on worksheet line 4 and still forces Schedule D`, () => {
    const cents = build(divs({ box1a: 0, box2a: 1, box2d: 0.4 }));
    expect(get(cents, `/requiresScheduleD`).get).toBe(true);
    expect(val(cents, `/rateGainWsLine4`)).toBe(`0.00`);
    expect(val(cents, `/scheduleDLine18`)).toBe(`0.00`);
    expect(get(cents, `/usesScheduleDTaxWorksheet`).get).toBe(false);
    const dollar = build(divs({ box1a: 0, box2a: 1, box2d: 0.6 }));
    expect(val(dollar, `/rateGainWsLine4`)).toBe(`1.00`);
    expect(val(dollar, `/scheduleDLine18`)).toBe(`1.00`);
    expect(get(dollar, `/usesScheduleDTaxWorksheet`).get).toBe(true);
    noKnockouts(dollar);
  });

  it(`box 2d does not change PA Schedule B line 10`, ({ task }) => {
    task.meta.testedFactPaths = [`/paScheduleBLine10`, `/flowKnockoutPaDividends`];
    const pa = build({ ...divs({ box1a: 500, box2a: 10, box2d: 4 }), ...state(`pa`) });
    expect(val(pa, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(pa, `/paLine3`)).toBe(`510.00`);
    expect(get(pa, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaDividendInvestmentExpenses`).get).toBe(false);
    expect(get(pa, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(pa, `/flowIsKnockedOut`).get).toBe(false);
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
 * Line 10 (capital gains distributions). Ordinary dividends alone do not require PA Schedule B.
 */
describe(`#154 PA Schedule B dividend knockout`, () => {
  const paBuild = (extra: Record<string, unknown>) =>
    build({ ...state(`pa`), '/paHasExemptObligationDividends': createBooleanWrapper(false), ...extra });
  const scheduleB = (g: Fg) => get(g, `/flowKnockoutPaScheduleB`).get;
  it(`full-year PA, ordinary dividends with no Schedule B line do not stop the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaScheduleB`, `/paLine3`];
    const g = paBuild(divs({ box1a: 2501 }));
    expect(val(g, `/paLine3`)).toBe(`2501.00`);
    expect(scheduleB(g)).toBe(false);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutPaScheduleB`);
  });
  it(`two forms of ordinary dividends still have no Schedule B line`, () => {
    expect(scheduleB(paBuild(divs({ box1a: 1500 }, { box1a: 1001 })))).toBe(false);
  });
  it(`full-year PA, exactly $2,500 of ordinary dividends with no Schedule B line: no knockout`, () => {
    const g = paBuild(divs({ box1a: 2500, box1b: 2000 }));
    expect(val(g, `/paLine3`)).toBe(`2500.00`);
    expect(scheduleB(g)).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });
  it(`cents on ordinary dividends do not require PA Schedule B`, () => {
    expect(scheduleB(paBuild(divs({ box1a: 2500.49 })))).toBe(false);
    expect(scheduleB(paBuild(divs({ box1a: 2500.5 })))).toBe(false);
  });
  it(`Line 3: fund dividends from U.S. or PA obligations stop it at any amount`, () => {
    const g = paBuild({ ...divs({ box1a: 100 }), '/paHasExemptObligationDividends': createBooleanWrapper(true) });
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowKnockoutPaDividends`).get).toBe(true);
  });
  it(`Line 10: full-year single box 2a is on PA-40 line 3 and prints; under $0.50 does not`, () => {
    const only = paBuild(divs({ box1a: 0, box2a: 10 }));
    expect(val(only, `/paScheduleBLine10`)).toBe(`10.00`);
    expect(val(only, `/paLine3`)).toBe(`10.00`);
    expect(get(only, `/paScheduleBSupported`).get).toBe(true);
    expect(scheduleB(only)).toBe(false);
    const both = paBuild(divs({ box1a: 100, box2a: 1 }));
    expect(val(both, `/paLine3`)).toBe(`101.00`);
    expect(scheduleB(both)).toBe(false);
    expect(get(both, `/flowKnockoutPaDividends`).get).toBe(false);
    // $0.40 rounds to $0 on line 10, so Schedule B is not required.
    const cents = paBuild(divs({ box1a: 100, box2a: 0.4 }));
    expect(val(cents, `/paScheduleBLine10`)).toBe(`0.00`);
    expect(val(cents, `/paLine3`)).toBe(`100.00`);
    expect(scheduleB(cents)).toBe(false);
  });
  it(`Line 4: dividends received as a nominee stop it (and the federal return)`, () => {
    // PA reads federal box 1a and does not compute the nominee subtraction. Any nominee amount stops.
    const g = paBuild(divs({ box1a: 3000, nominee: true, nomineeOrdinary: 1000, nomineeOtherBoxes: false }));
    expect(scheduleB(g)).toBe(true);
    expect(get(g, `/flowKnockoutDividendNominee`).get).toBe(true);
    expect(get(g, `/flowKnockoutPaScheduleB`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(g, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
  });
  it(`Line 4: dividends received while not a PA resident stop it`, () => {
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
    // All $2,000 received while a PA resident: line 4 is $0, so no Schedule B.
    const supported = partYear(2000, `2000`);
    expect(val(supported, `/paLine3`)).toBe(`2000.00`);
    expect(scheduleB(supported)).toBe(false);
    expect(get(supported, `/flowIsKnockedOut`).get).toBe(false);
    // $2,000 of $2,500 received while a PA resident: line 4 is $500.
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

describe(`1099-DIV box 8 and boxes 14-16 (#86)`, () => {
  // FL single, W-2 $60,000. Standard deduction $16,100 (Rev. Proc. 2025-32 §4.14). The $300 limit is
  // 26 U.S.C. 904(j)(2)(B), not an indexed Rev. Proc. amount. Qualified payee statement is the existing
  // /dividendReports/*/foreignTaxElectionRequirementsMet yes (Form 1040 instr. (2025) Schedule 3 line 1).
  const election = {
    box1a: 2000,
    box1b: 2000,
    box7: 120,
    box8: `Various`,
    ftcOk: true,
  } satisfies Div;
  const fl = (form: Div) => build({ ...divs(form), ...state(`fl`), ...paW2(60000) });
  const dollars = (g: Fg) => ({
    wages: val(g, `/wages`),
    line3b: val(g, `/ordinaryDividends`),
    line3a: val(g, `/qualifiedDividends`),
    totalIncome: val(g, `/totalIncome`),
    standardDeduction: val(g, `/standardDeduction`),
    taxableIncome: val(g, `/taxableIncome`),
    foreignTax: val(g, `/totalDividendForeignTaxPaid`),
    limit: val(g, `/dividendForeignTaxElectionLimit`),
    sched3Line1: val(g, `/sched3Line1`),
    scheduleALine5a: val(g, `/scheduleAStateLocalIncomeOrSalesTax`),
  });

  it(`box 8 "Various" with box 7 $120 is Schedule 3 line 1 $120 and Schedule B prints`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/foreignCountry`,
      `/dividendForeignTaxElectionLimit`,
      `/sched3Line1`,
      `/requiresScheduleB`,
      `/flowPrintRefuseScheduleBPartIII`,
      `/flowKnockoutDividendForeignTaxPaid`,
      `/flowKnockoutDividendUnsupportedBoxes`,
    ];
    const g = fl(election);
    expect(val(g, `/wages`)).toBe(`60000.00`);
    expect(val(g, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(g, `/qualifiedDividends`)).toBe(`2000.00`);
    expect(val(g, `/totalIncome`)).toBe(`62000.00`);
    expect(val(g, `/standardDeduction`)).toBe(`16100.00`);
    expect(val(g, `/taxableIncome`)).toBe(`45900.00`);
    expect(val(g, `/totalDividendForeignTaxPaid`)).toBe(`120.00`);
    expect(val(g, `/dividendForeignTaxElectionLimit`)).toBe(`300.00`);
    expect(val(g, `/sched3Line1`)).toBe(`120.00`);
    expect(val(g, `/dividendReports/#${d1}/foreignCountry`)).toBe(`Various`);
    expect(get(g, `/dividendReports/#${d1}/foreignTaxElectionRequirementsMet`).get).toBe(true);
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/scheduleBPartIIIAnswered`).get).toBe(true);
    expect(get(g, `/flowPrintRefuseScheduleBPartIII`).get).toBe(false);
    expect(get(g, `/hasSchedule3`).get).toBe(true);
    expect(Number(val(g, `/tentativeTaxFromTaxableIncome`))).toBeGreaterThan(120);
    noKnockouts(g);
  });

  it(`boxes 15-16 with box 14 $0 leave the computed amounts unchanged`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/stateIdNumber`,
      `/dividendReports/*/stateDistribution`,
      `/dividendReports/*/stateTaxWithheld`,
      `/sched3Line1`,
      `/scheduleAStateLocalIncomeOrSalesTax`,
    ];
    const before = fl(election);
    const after = fl({ ...election, box14: 0, box15: `FL 123`, box16: 2000 });
    expect(dollars(after)).toEqual(dollars(before));
    expect(val(after, `/wages`)).toBe(`60000.00`);
    expect(val(after, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(after, `/qualifiedDividends`)).toBe(`2000.00`);
    expect(val(after, `/totalDividendForeignTaxPaid`)).toBe(`120.00`);
    expect(val(after, `/dividendForeignTaxElectionLimit`)).toBe(`300.00`);
    expect(val(after, `/sched3Line1`)).toBe(`120.00`);
    expect(val(after, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`0.00`);
    expect(val(after, `/dividendReports/#${d1}/stateIdNumber`)).toBe(`FL 123`);
    expect(val(after, `/dividendReports/#${d1}/stateDistribution`)).toBe(`2000.00`);
    expect(get(after, `/dividendReports/#${d1}/hasStateTaxWithheld`).get).toBe(false);
    expect(val(after, `/scheduleAStateLocalIncomeOrSalesTax`)).toBe(`0.00`);
    noKnockouts(after);
  });

  it(`box 14 $25 on a Florida return stops and is not added to Schedule A line 5a`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/dividendReports/*/stateTaxWithheld`,
      `/dividendReports/*/hasStateTaxWithheld`,
      `/dividendReports/*/stateTaxWithheldUnsupported`,
      `/dividendResidentStateHasNoIncomeTax`,
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/scheduleAStateLocalIncomeOrSalesTax`,
    ];
    const g = fl({ ...election, box14: 25, box15: `FL 123`, box15State: `sameState`, box16: 2000 });
    expect(val(g, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`25.00`);
    expect(get(g, `/dividendReports/#${d1}/hasStateTaxWithheld`).get).toBe(true);
    expect(get(g, `/dividendResidentStateHasNoIncomeTax`).get).toBe(true);
    expect(get(g, `/dividendReports/#${d1}/stateTaxWithheldIsSupported`).get).toBe(false);
    expect(get(g, `/dividendReports/#${d1}/stateTaxWithheldUnsupported`).get).toBe(true);
    expect(val(g, `/scheduleAStateLocalIncomeOrSalesTax`)).toBe(`0.00`);
    expect(val(g, `/totalDividendForeignTaxPaid`)).toBe(`120.00`);
    blocks(g, `/flowKnockoutDividendUnsupportedBoxes`);
  });

  it(`NY box 14 $100 with box 15 New York does not stop and leaves federal values unchanged`, ({ task }) => {
    // Single, W-2 $60,000, 1099-DIV box 1a $2,000, box 1b $2,000. Standard deduction $16,100
    // (Rev. Proc. 2025-32 §4.14). Box 14 is not added to Schedule A line 5a.
    task.meta.testedFactPaths = [
      `/dividendReports/*/stateTaxWithheld`,
      `/dividendReports/*/state`,
      `/dividendReports/*/stateTaxWithheldIsSupported`,
      `/dividendReports/*/stateTaxWithheldUnsupported`,
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/stateReturnComputed`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/totalIncome`,
      `/agi`,
      `/taxableIncome`,
      `/scheduleAStateLocalIncomeOrSalesTax`,
    ];
    const baseDiv = { box1a: 2000, box1b: 2000 };
    const ny = (form: Div) => build({ ...divs(form), ...state(`ny`), ...paW2(60000) });
    const before = ny(baseDiv);
    const after = ny({ ...baseDiv, box14: 100, box15: `NY`, box15State: `sameState` });
    const lines = [
      `/wages`,
      `/ordinaryDividends`,
      `/qualifiedDividends`,
      `/totalIncome`,
      `/agi`,
      `/standardDeduction`,
      `/taxableIncome`,
      `/totalTax`,
      `/scheduleAStateLocalIncomeOrSalesTax`,
    ];
    expect(dollars(after)).toEqual(dollars(before));
    for (const line of lines) expect(val(after, line), line).toBe(val(before, line));
    expect(val(after, `/wages`)).toBe(`60000.00`);
    expect(val(after, `/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(after, `/qualifiedDividends`)).toBe(`2000.00`);
    expect(val(after, `/totalIncome`)).toBe(`62000.00`);
    expect(val(after, `/agi`)).toBe(`62000.00`);
    expect(val(after, `/standardDeduction`)).toBe(`16100.00`);
    expect(val(after, `/taxableIncome`)).toBe(`45900.00`);
    expect(val(after, `/scheduleAStateLocalIncomeOrSalesTax`)).toBe(`0.00`);
    expect(val(after, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`100.00`);
    expect(val(after, `/dividendReports/#${d1}/stateIdNumber`)).toBe(`NY`);
    expect(get(after, `/stateReturnComputed`).get).toBe(false);
    expect(get(after, `/dividendResidentStateHasNoIncomeTax`).get).toBe(false);
    expect(get(after, `/dividendReports/#${d1}/stateTaxWithheldIsSupported`).get).toBe(true);
    expect(get(after, `/dividendReports/#${d1}/stateTaxWithheldUnsupported`).get).toBe(false);
    noKnockouts(after);
  });

  it(`a Pennsylvania return stops on box 14 $25 even when box 15 is Pennsylvania`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/dividendReports/*/stateTaxWithheldUnsupported`,
      `/stateReturnComputed`,
    ];
    const g = build({
      ...divs({ box1a: 2000, box1b: 2000, box14: 25, box15State: `sameState` }),
      ...state(`pa`),
      ...paW2(60000),
    });
    expect(val(g, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`25.00`);
    expect(get(g, `/stateReturnComputed`).get).toBe(true);
    expect(get(g, `/dividendReports/#${d1}/stateTaxWithheldIsSupported`).get).toBe(false);
    expect(val(g, `/scheduleAStateLocalIncomeOrSalesTax`)).toBe(`0.00`);
    blocks(g, `/flowKnockoutDividendUnsupportedBoxes`);
  });

  it(`a New York return stops when box 15 is New Jersey and box 14 is $25`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/dividendReports/*/state`,
      `/dividendReports/*/stateTaxWithheldUnsupported`,
    ];
    const g = build({
      ...divs({ box1a: 2000, box1b: 2000, box14: 25, box15: `NJ`, box15State: `differentState` }),
      ...state(`ny`),
      ...paW2(60000),
    });
    expect(val(g, `/wages`)).toBe(`60000.00`);
    expect(val(g, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`25.00`);
    expect(val(g, `/dividendReports/#${d1}/stateIdNumber`)).toBe(`NJ`);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expect(get(g, `/dividendResidentStateHasNoIncomeTax`).get).toBe(false);
    expect(get(g, `/dividendReports/#${d1}/stateTaxWithheldIsSupported`).get).toBe(false);
    expect(get(g, `/dividendReports/#${d1}/stateTaxWithheldUnsupported`).get).toBe(true);
    blocks(g, `/flowKnockoutDividendUnsupportedBoxes`);
  });

  it(`box 7 $400 single with box 8 set is the existing 904(j) stop`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutDividendForeignTaxPaid`,
      `/totalDividendForeignTaxPaid`,
      `/dividendForeignTaxElectionLimit`,
      `/dividendReports/*/foreignCountry`,
    ];
    const g = fl({ ...election, box7: 400 });
    expect(val(g, `/wages`)).toBe(`60000.00`);
    expect(val(g, `/totalDividendForeignTaxPaid`)).toBe(`400.00`);
    expect(val(g, `/dividendForeignTaxElectionLimit`)).toBe(`300.00`);
    expect(val(g, `/dividendReports/#${d1}/foreignCountry`)).toBe(`Various`);
    expect(get(g, `/dividendReports/#${d1}/foreignTaxElectionRequirementsMet`).get).toBe(true);
    blocks(g, `/flowKnockoutDividendForeignTaxPaid`);
  });

  it(`a PA return stops when box 16 differs from box 1a plus box 2a, and an equal amount does not`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutDividendStateDistribution`,
      `/dividendReports/*/stateDistributionDiffersFromFederal`,
      `/dividendReports/*/stateDistribution`,
    ];
    const mismatch = build({
      ...divs({ box1a: 2000, box2a: 500, box16: 2000, box14: 0 }),
      ...state(`pa`),
    });
    expect(val(mismatch, `/dividendReports/#${d1}/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(mismatch, `/dividendReports/#${d1}/capitalGainDistributions`)).toBe(`500.00`);
    expect(val(mismatch, `/dividendReports/#${d1}/stateDistribution`)).toBe(`2000.00`);
    expect(val(mismatch, `/dividendReports/#${d1}/stateTaxWithheld`)).toBe(`0.00`);
    expect(get(mismatch, `/stateReturnComputed`).get).toBe(true);
    expect(get(mismatch, `/dividendReports/#${d1}/stateDistributionDiffersFromFederal`).get).toBe(true);
    blocks(mismatch, `/flowKnockoutDividendStateDistribution`);

    const match = build({
      ...divs({ box1a: 2000, box2a: 500, box16: 2500, box14: 0 }),
      ...state(`pa`),
    });
    expect(val(match, `/dividendReports/#${d1}/stateDistribution`)).toBe(`2500.00`);
    expect(get(match, `/dividendReports/#${d1}/stateDistributionDiffersFromFederal`).get).toBe(false);
    expect(get(match, `/flowKnockoutDividendStateDistribution`).get).toBe(false);
    noKnockouts(match);

    const blank = build({ ...divs({ box1a: 2000, box2a: 500, box14: 0 }), ...state(`pa`) });
    expect(val(blank, `/dividendReports/#${d1}/stateDistribution`)).toBe(`0.00`);
    expect(get(blank, `/flowKnockoutDividendStateDistribution`).get).toBe(false);
    noKnockouts(blank);

    const florida = build({
      ...divs({ box1a: 2000, box2a: 500, box16: 2000, box14: 0 }),
      ...state(`fl`),
    });
    expect(get(florida, `/stateReturnComputed`).get).toBe(false);
    expect(get(florida, `/dividendReports/#${d1}/stateDistributionDiffersFromFederal`).get).toBe(true);
    expect(get(florida, `/flowKnockoutDividendStateDistribution`).get).toBe(false);
    noKnockouts(florida);
  });

  const computedStateMismatch = (
    task: { meta: { testedFactPaths: string[] } },
    st: string,
    otherIncome: string,
    screeners: Record<string, unknown>
  ) => {
    task.meta.testedFactPaths = [`/flowKnockoutDividendStateDistribution`, `/stateReturnComputed`, otherIncome];
    const mismatch = build({
      ...divs({ box1a: 2000, box2a: 500, box16: 2000, box14: 0 }),
      ...state(st),
      ...screeners,
    });
    expect(val(mismatch, `/dividendReports/#${d1}/stateDistribution`)).toBe(`2000.00`);
    expect(val(mismatch, `/dividendReports/#${d1}/ordinaryDividends`)).toBe(`2000.00`);
    expect(val(mismatch, `/dividendReports/#${d1}/capitalGainDistributions`)).toBe(`500.00`);
    expect(get(mismatch, `/stateReturnComputed`).get).toBe(true);
    expect(get(mismatch, `/flowKnockoutDividendStateDistribution`).get).toBe(true);
    expect(get(mismatch, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutDividendStateDistribution`);
    // Dividends are already other federal income on these returns. A matching box 16 does not clear that stop.
    expect(get(mismatch, otherIncome).get).toBe(true);

    const match = build({
      ...divs({ box1a: 2000, box2a: 500, box16: 2500, box14: 0 }),
      ...state(st),
      ...screeners,
    });
    expect(val(match, `/dividendReports/#${d1}/stateDistribution`)).toBe(`2500.00`);
    expect(get(match, `/flowKnockoutDividendStateDistribution`).get).toBe(false);
    expect(get(match, otherIncome).get).toBe(true);
    expect(get(match, `/flowIsKnockedOut`).get).toBe(true);
  };
  it(`an Illinois return stops when box 16 differs from box 1a plus box 2a`, ({ task }) => {
    computedStateMismatch(task, `il`, `/flowKnockoutIlOtherFederalIncome`, {
      '/ilResidencyStatus': createEnumWrapper(`fullYear`, `/ilResidencyOptions`),
    });
  });
  it(`a North Carolina return stops when box 16 differs from box 1a plus box 2a`, ({ task }) => {
    computedStateMismatch(task, `nc`, `/flowKnockoutNcOtherFederalIncome`, {
      '/ncResidencyStatus': createEnumWrapper(`fullYear`, `/ncResidencyOptions`),
    });
  });
  it(`an Arizona return stops when box 16 differs from box 1a plus box 2a`, ({ task }) => {
    computedStateMismatch(task, `az`, `/flowKnockoutAzOtherFederalIncome`, {
      '/azResidencyStatus': createEnumWrapper(`fullYear`, `/azResidencyOptions`),
    });
  });
  it(`a Massachusetts return stops when box 16 differs from box 1a plus box 2a`, ({ task }) => {
    computedStateMismatch(task, `ma`, `/flowKnockoutMaOtherFederalIncome`, {
      '/maResidencyStatus': createEnumWrapper(`fullYear`, `/maResidencyOptions`),
    });
  });
  it(`an Idaho return stops when box 16 differs from box 1a plus box 2a`, ({ task }) => {
    computedStateMismatch(task, `id`, `/flowKnockoutIdOtherFederalIncome`, {
      '/idResidencyStatus': createEnumWrapper(`fullYear`, `/idResidencyOptions`),
    });
  });
  it(`box 16 stop text names a state return computed here`, () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const phrase = `a state return computed here (\`/stateReturnComputed\`)`;
    const sources = [
      resolve(here, `../../fact-dictionary/generate-src/xml-src/dividends.xml`),
      resolve(here, `../../../../../backend/src/main/java/gov/irs/directfile/api/pdf/PrintRefusingKnockouts.java`),
      resolve(here, `../../../../../backend/src/test/java/gov/irs/directfile/api/pdf/PrintRefusingKnockoutsTest.java`),
    ];
    for (const file of sources) {
      expect(readFileSync(file, `utf8`), file).toContain(phrase);
    }
    const en = readFileSync(resolve(here, `../../locales/en.dividends.yaml`), `utf8`);
    const es = readFileSync(resolve(here, `../../locales/es.dividends.yaml`), `utf8`);
    expect(en).toContain(
      `When this tool computes your state return, an amount in box 16 has to equal box 1a plus box 2a.`
    );
    expect(en).toContain(`When this tool computes your state return, box 16 has to equal box 1a plus box 2a.`);
    expect(en).toContain(`computes your state return, when you live in Alaska`);
    expect(en).not.toContain(`/stateReturnComputed`);
    expect(en).not.toContain(`Pennsylvania, Illinois, North Carolina, Arizona, Massachusetts, or Idaho`);
    expect(es).toContain(`calcula su declaración estatal, una cantidad en el encasillado 16`);
    expect(es).toContain(`Cuando esta herramienta calcula su declaración estatal, el encasillado 16`);
    expect(es).toContain(`cuando esta herramienta calcula su declaración estatal, cuando usted vive en`);
    expect(es).not.toContain(`/stateReturnComputed`);
    expect(es).not.toContain(`Pensilvania, Illinois`);
  });
});
