// #92 Form 2210, Underpayment of Estimated Tax by Individuals (TY2026 draft layout).
// Form 2210 (2026) draft, https://www.irs.gov/pub/irs-dft/f2210--dft.pdf, p. 1, line 7: "Subtract line 6 from line 4.
// If less than $1,000, stop; you don't owe a penalty." "If box A or E applies (but not B, C, or D), file only page 1 of
// Form 2210." "If box B, C, or D applies, you must figure your penalty and file Form 2210."
// 26 U.S.C. 6654(e)(1) ($1,000), https://www.law.cornell.edu/uscode/text/26/6654
// Lines 1-7 are computed. Any Part II box knocks out (page 1 needs prior-year tax, which isn't collected); with no box
// the IRS figures any penalty and bills, and Form 1040 line 38 is never computed or printed.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import mfjScenario from '../scenarioTests/jsonScenarios/form2210-mfj-irs-will-bill.json';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeW2Data,
  primaryFilerId,
  singleFilerData,
} from '../testData.js';

const w2Id = `92a00000-0000-4000-8000-000000000001`;

const minimal = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const graph = (
  status: Record<string, unknown>,
  wages: number,
  withholding: number,
  extra: Record<string, unknown> = {}
) =>
  setupFactGraph({
    ...minimal,
    ...baseFilerData,
    ...status,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/flowHasSeenDeductions': createBooleanWrapper(true),
    ...makeW2Data(wages, w2Id),
    [`/formW2s/#${w2Id}/writableFederalWithholding`]: createDollarWrapper(`${withholding}`),
    ...extra,
  }).factGraph;
type Fg = ReturnType<typeof graph>;
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => get(fg, p).get;
const dollars = (fg: Fg, p: string) => val(fg, p).toString();

const allNo = {
  '/form2210WaiverRequested': createBooleanWrapper(false),
  '/form2210AnnualizedIncome': createBooleanWrapper(false),
  '/form2210WithholdingOnActualDates': createBooleanWrapper(false),
};
const answers = (jointPriorYear: boolean, over: Record<string, unknown> = {}) => ({
  ...allNo,
  '/form2210FiledJointReturnPriorYear': createBooleanWrapper(jointPriorYear),
  ...over,
});

// A complete MFJ return (synthetic scenario fixture, 900-area test SSNs) with its one W-2's withholding replaced and
// its Part II answers removed. Box 6 withholding is 1.45% of box 5, so Form 8959 line 24 (Form 1040 line 25c) is $0
// (26 U.S.C. 3101(b)(1)).
const mfjW2 = `c5d398cc-f754-4049-8bf3-fc1ecc079efb`;
const PART_II_ANSWERS = [
  `/form2210WaiverRequested`,
  `/form2210AnnualizedIncome`,
  `/form2210WithholdingOnActualDates`,
  `/form2210FiledJointReturnPriorYear`,
];
const mfjBase = Object.fromEntries(
  Object.entries(mfjScenario.facts as Record<string, unknown>).filter(([k]) => !PART_II_ANSWERS.includes(k))
);
const mfjGraph = (withholding: number, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...mfjBase,
    [`/formW2s/#${mfjW2}/writableFederalWithholding`]: createDollarWrapper(`${withholding}`),
    ...extra,
  } as never).factGraph;

// Builds a return whose line 7 is exactly `line7`: wages fix line 4, and withholding is set to line 4 - line 7.
type Status = `single` | `mfj`;
const WAGES = 60000;
const build = (status: Status, withholding: number, extra: Record<string, unknown> = {}) =>
  status === `mfj` ? mfjGraph(withholding, extra) : graph(singleFilerData, WAGES, withholding, extra);
const withLine7 = (status: Status, line7: number, extra: Record<string, unknown> = {}) => {
  const fg = build(status, Number(dollars(build(status, 0), `/form2210Line7`)) - line7, extra);
  expect(get(fg, `/form2210Line7`).complete).toBe(true);
  expect(dollars(fg, `/form2210Line7`)).toBe(`${line7}.00`);
  return fg;
};

const PART_II_FACTS = [
  `/form2210AskPartII`,
  `/flowKnockoutForm2210`,
  `/form2210ShowIrsWillBillNote`,
  `/form2210PartIIIsComplete`,
];

describe(`Form 2210 (#92): Part I lines 1-7`, () => {
  it(`single, $60,000 wages, no withholding: lines 1-7 from Form 1040 lines 22, 23, 32 and 25d`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form2210Line1`,
      `/form2210Line2`,
      `/form2210Line3`,
      `/form2210Line4`,
      `/form2210Line5`,
      `/form2210Line6`,
      `/form2210Line7`,
    ];
    const fg = graph(singleFilerData, WAGES, 0);
    expect(dollars(fg, `/form2210Line1`)).toBe(dollars(fg, `/taxLessNonRefundableCredits`));
    expect(dollars(fg, `/form2210Line2`)).toBe(dollars(fg, `/line21OfSchedule2`));
    expect(dollars(fg, `/form2210Line3`)).toBe(dollars(fg, `/totalOtherPaymentsRefundableCredits`));
    const l4 = Number(dollars(fg, `/form2210Line4`));
    expect(l4).toBe(
      Number(dollars(fg, `/form2210Line1`)) +
        Number(dollars(fg, `/form2210Line2`)) -
        Number(dollars(fg, `/form2210Line3`))
    );
    expect(l4).toBeGreaterThan(1000);
    expect(Number(dollars(fg, `/form2210Line5`))).toBeCloseTo(l4 * 0.9, 2);
    expect(dollars(fg, `/form2210Line6`)).toBe(`0.00`);
    expect(Number(dollars(fg, `/form2210Line7`))).toBe(l4);
  });

  it(`line 6 is Form 1040 line 25d withholding, and line 7 = line 4 - line 6`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210Line6`, `/form2210Line7`];
    const fg = graph(singleFilerData, WAGES, 2500);
    expect(dollars(fg, `/form2210Line6`)).toBe(`2500.00`);
    expect(dollars(fg, `/form2210Line6`)).toBe(dollars(fg, `/totalWithholding`));
    expect(Number(dollars(fg, `/form2210Line7`))).toBe(Number(dollars(fg, `/form2210Line4`)) - 2500);
  });

  it(`the $1,000 threshold is 26 U.S.C. 6654(e)(1)`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210NoPenaltyThreshold`];
    expect(dollars(graph(singleFilerData, WAGES, 0), `/form2210NoPenaltyThreshold`)).toBe(`1000.00`);
  });
});

describe(`Form 2210 (#92): line 7 threshold`, () => {
  it(`line 7 = $999: no questions, no note, no knockout, all complete`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210MayOwePenalty`, ...PART_II_FACTS];
    const fg = withLine7(`single`, 999);
    expect(dollars(fg, `/form2210Line7`)).toBe(`999.00`);
    expect(val(fg, `/form2210MayOwePenalty`)).toBe(false);
    for (const p of PART_II_FACTS) expect(get(fg, p).complete).toBe(true);
    expect(val(fg, `/form2210AskPartII`)).toBe(false);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
    expect(val(fg, `/form2210ShowIrsWillBillNote`)).toBe(false);
    expect(val(fg, `/form2210PartIIIsComplete`)).toBe(true);
  });

  it(`line 7 = $1,000: the Part II questions are asked and must be answered`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210MayOwePenalty`, ...PART_II_FACTS];
    const fg = withLine7(`single`, 1000);
    expect(dollars(fg, `/form2210Line7`)).toBe(`1000.00`);
    expect(val(fg, `/form2210MayOwePenalty`)).toBe(true);
    expect(val(fg, `/form2210AskPartII`)).toBe(true);
    // Unanswered: the knockout stays complete and false; completion holds the return instead.
    expect(get(fg, `/flowKnockoutForm2210`).complete).toBe(true);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
    expect(val(fg, `/form2210PartIIIsComplete`)).toBe(false);
    expect(val(fg, `/form2210ShowIrsWillBillNote`)).toBe(false);
  });

  it(`line 7 = $1,000 with every answer no: IRS will bill note, no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [...PART_II_FACTS, `/flowIsKnockedOut`];
    const fg = withLine7(`single`, 1000, answers(false));
    expect(val(fg, `/form2210PartIIIsComplete`)).toBe(true);
    expect(val(fg, `/form2210ShowIrsWillBillNote`)).toBe(true);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`Form 1040 line 22 = $0 (no wages): nothing asked, knockout complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210Line1`, ...PART_II_FACTS];
    const fg = graph(singleFilerData, 0, 0);
    expect(dollars(fg, `/form2210Line1`)).toBe(`0.00`);
    expect(val(fg, `/form2210AskPartII`)).toBe(false);
    expect(get(fg, `/flowKnockoutForm2210`).complete).toBe(true);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
  });
});

describe(`Form 2210 (#92): ordinary return with no Form 2210 issue`, () => {
  it(`withholding covers the tax: the knockout is complete and false, and nothing blocks submission`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm2210`, `/form2210PartIIIsComplete`, `/flowIsKnockedOut`];
    const fg = graph(singleFilerData, WAGES, 6000);
    expect(get(fg, `/totalTax`).complete).toBe(true);
    expect(val(fg, `/form2210MayOwePenalty`)).toBe(false);
    const ko = get(fg, `/flowKnockoutForm2210`);
    expect(ko.complete).toBe(true);
    expect(ko.hasValue).toBe(true);
    expect(ko.get).toBe(false);
    expect(val(fg, `/form2210PartIIIsComplete`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(false);
  });
});

describe(`Form 2210 (#92): the knockout never stays incomplete`, () => {
  it(`total tax not yet complete (capital asset and Schedule A questions unanswered): lines 4 and 7 are incomplete, the knockout is complete and false`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form2210Line7`, `/form2210AskPartII`, `/flowKnockoutForm2210`];
    const unanswered = Object.fromEntries(
      Object.entries(mfjBase).filter(([k]) => k !== `/soldCapitalAssets` && k !== `/scheduleAWantsToItemize`)
    );
    const fg = setupFactGraph(unanswered as never).factGraph;
    expect(get(fg, `/totalTax`).complete).toBe(false);
    expect(get(fg, `/form2210Line7`).complete).toBe(false);
    expect(get(fg, `/form2210AskPartII`).complete).toBe(true);
    expect(val(fg, `/form2210AskPartII`)).toBe(false);
    const ko = get(fg, `/flowKnockoutForm2210`);
    expect(ko.complete).toBe(true);
    expect(ko.get).toBe(false);
  });
});

describe(`Form 2210 (#92): each Part II box knocks out (BlockSubmissionOnTrue, /flowIsKnockedOut)`, () => {
  const stops = (fg: Fg) => {
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
    expect(val(fg, `/form2210ShowIrsWillBillNote`)).toBe(false);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutForm2210`);
  };
  for (const [label, fact] of [
    [`A/B waiver requested`, `/form2210WaiverRequested`],
    [`C annualized income installment method`, `/form2210AnnualizedIncome`],
    [`D withholding on the dates actually withheld`, `/form2210WithholdingOnActualDates`],
  ]) {
    it(`box ${label}`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutForm2210`, `/flowIsKnockedOut`, fact];
      stops(withLine7(`single`, 1000, answers(false, { [fact]: createBooleanWrapper(true) })));
    });
  }

  it(`a yes counts as soon as it's answered, before the later questions`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm2210`];
    const fg = withLine7(`single`, 1000, { '/form2210WaiverRequested': createBooleanWrapper(true) });
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(true);
  });

  it(`the same yes under $1,000 does nothing`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm2210`];
    const fg = withLine7(`single`, 999, answers(true, { '/form2210WaiverRequested': createBooleanWrapper(true) }));
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
  });
});

describe(`Form 2210 (#92): box E, a joint return for 2025 or 2026 but not both`, () => {
  it(`single for 2026, joint for 2025: box E, knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210BoxE`, `/flowKnockoutForm2210`];
    const fg = withLine7(`single`, 1000, answers(true));
    expect(val(fg, `/form2210BoxE`)).toBe(true);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });
  it(`single for both years: no box E`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210BoxE`, `/flowKnockoutForm2210`];
    const fg = withLine7(`single`, 1000, answers(false));
    expect(val(fg, `/form2210BoxE`)).toBe(false);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
  });
  it(`MFJ for 2026, not joint for 2025: box E, knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210BoxE`, `/flowKnockoutForm2210`];
    const fg = withLine7(`mfj`, 1000, answers(false));
    expect(dollars(fg, `/form2210Line7`)).toBe(`1000.00`);
    expect(val(fg, `/form2210BoxE`)).toBe(true);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(true);
  });
  it(`MFJ for both years: no box E, IRS will bill note`, ({ task }) => {
    task.meta.testedFactPaths = [`/form2210BoxE`, `/form2210ShowIrsWillBillNote`];
    const fg = withLine7(`mfj`, 1000, answers(true));
    expect(val(fg, `/form2210BoxE`)).toBe(false);
    expect(val(fg, `/flowKnockoutForm2210`)).toBe(false);
    expect(val(fg, `/form2210ShowIrsWillBillNote`)).toBe(true);
  });
});

describe(`Form 2210 (#92): line 38 is never computed, printed or exported`, () => {
  const resources = path.resolve(__dirname, `../../../../../backend/src/main/resources`);
  it(`no fact holds a penalty amount`, () => {
    const xml = fs.readFileSync(path.join(resources, `tax/form2210.xml`), `utf-8`);
    expect(xml).not.toMatch(/path="\/[^"]*[Pp]enaltyAmount/);
    expect(xml).not.toMatch(/form2210Line(8|9|1\d)"/);
  });
  it(`the 2026 Form 1040 PDF has no field mapped to line 38`, () => {
    const yml = fs.readFileSync(path.join(resources, `pdf/2026/IRS1040/en/configuration.yml`), `utf-8`);
    expect(yml).not.toMatch(/#\s*38\b/);
    expect(yml).not.toMatch(/form2210/i);
  });
  it(`no MeF field reads a Form 2210 fact`, () => {
    const mef = fs.readFileSync(path.join(resources, `factgraphservice/xmlFactPaths`), `utf-8`);
    expect(mef).not.toMatch(/form2210/i);
  });
});
