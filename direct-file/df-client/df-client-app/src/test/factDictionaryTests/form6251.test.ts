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
  makeW2Data,
  mfjFilerData,
  mfsFilerData,
  makeInterestReportData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

/**
 * #77 Form 6251 (AMT) — TY2026.
 * Line numbers: Form 6251 (2026) draft, https://www.irs.gov/pub/irs-dft/f6251--dft.pdf
 * Rev. Proc. 2025-32 §4.10 pp. 16–17 (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf):
 *   p. 16 "the exemption amounts under § 55(d)(1) are: Joint Returns or Surviving Spouses $140,200 ...
 *   Unmarried Individuals (other than Surviving Spouses) $90,100 ... Married Individuals Filing Separate Returns $70,100"
 *   p. 16 "the excess taxable income above which the 28 percent tax rate applies is: Married Individuals Filing
 *   Separate Returns $122,250 All Other Taxpayers $244,500"
 *   p. 17 phaseout "Threshold Phaseout Amount ... Joint Returns or Surviving Spouses $1,000,000 $1,280,400;
 *   Unmarried Individuals $500,000 $680,200; Married Individuals Filing Separate Returns $500,000 $640,200"
 * IRC §55(d)(2) + §55(d)(4)(A)(ii)(IV) (50% phaseout rate): https://www.law.cornell.edu/uscode/text/26/55
 */
const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], p: string) => fg.get(p as ConcretePath);
const val = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], p: string) => get(fg, p).get.toString();
const ltId = `b7777777-7777-4777-8777-777777777777`;

const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);
const clean = (status: Record<string, unknown>, wages: number) => ({
  ...noW2,
  ...baseFilerData,
  ...status,
  ...makeW2Data(wages),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
  '/MFSSpouseHasGrossIncome': createBooleanWrapper(true),
  '/MFSSpouseFilingReturn': createBooleanWrapper(true),
  '/MFSSpouse65OrOlder': createBooleanWrapper(false),
  '/soldCapitalAssets': createBooleanWrapper(false),
  '/hasAmtPreferenceItems': createBooleanWrapper(false),
});
const ltGain = (gain: number) => ({
  '/soldCapitalAssets': createBooleanWrapper(true),
  '/soldCollectibles': createBooleanWrapper(false),
  '/hasUnrecapturedSection1250Gain': createBooleanWrapper(false),
  '/form8949Transactions': createCollectionWrapper([ltId]),
  [`/form8949Transactions/#${ltId}/description`]: createStringWrapper(`100 sh XYZ`),
  [`/form8949Transactions/#${ltId}/dateAcquired`]: createDayWrapper(`2020-06-01`),
  [`/form8949Transactions/#${ltId}/dateSold`]: createDayWrapper(`2026-07-01`),
  [`/form8949Transactions/#${ltId}/proceeds`]: createDollarWrapper(`${gain + 1000}`),
  [`/form8949Transactions/#${ltId}/costBasis`]: createDollarWrapper(`1000`),
  [`/form8949Transactions/#${ltId}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${ltId}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${ltId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});
const salt = (amount: number) => ({
  '/scheduleAWantsToItemize': createBooleanWrapper(true),
  '/scheduleAWritableMedical': createDollarWrapper(`0`),
  '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`${amount}`),
  '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`0`),
  '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
  '/scheduleAWritableMortgageInterest': createDollarWrapper(`0`),
  '/scheduleAWritableCashGifts': createDollarWrapper(`0`),
  '/scheduleAWritableElectsToItemize': createBooleanWrapper(true),
  '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
});
type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const fg = (d: Record<string, unknown>): Fg => setupFactGraph(d).factGraph;
const hohFilerData = {
  ...singleFilerData,
  '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
};
const KOS = [`/flowKnockoutAmtPreferenceItems`, `/flowKnockoutAmtMfsAddBack`, `/flowKnockoutAmtKiddieTax`];
const noAmtKnockouts = (g: Fg) => KOS.forEach((k) => expect(get(g, k).get).toBe(false));

describe(`Form 6251 constants — Rev. Proc. 2025-32 §4.10 pp. 16-17`, () => {
  for (const [l, s, ex, th, bp, off] of [
    [`single`, singleFilerData, `90100.00`, `500000.00`, `244500.00`, `4890.00`],
    [`HoH`, hohFilerData, `90100.00`, `500000.00`, `244500.00`, `4890.00`],
    [`MFJ`, mfjFilerData, `140200.00`, `1000000.00`, `244500.00`, `4890.00`],
    [`MFS`, mfsFilerData, `70100.00`, `500000.00`, `122250.00`, `2445.00`],
  ] as [string, Record<string, unknown>, string, string, string, string][])
    it(`${l}: exemption ${ex}, phaseout threshold ${th}, 28% breakpoint ${bp}, offset ${off}`, ({ task }) => {
      task.meta.testedFactPaths = [
        `/form6251ExemptionAmount`,
        `/form6251PhaseoutThreshold`,
        `/form6251RateBreakpoint`,
        `/form6251RateOffset`,
      ];
      const g = fg(clean(s, 50000));
      expect(val(g, `/form6251ExemptionAmount`)).toBe(ex);
      expect(val(g, `/form6251PhaseoutThreshold`)).toBe(th);
      expect(val(g, `/form6251RateBreakpoint`)).toBe(bp);
      expect(val(g, `/form6251RateOffset`)).toBe(off);
    });
});

describe(`Form 6251 — below the exemption`, () => {
  it(`single $50,000 wages: AMTI $50,000 < $90,100 exemption, line 6 = 0, AMT 0, Schedule 2 line 3 = 0`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form6251Line4`,
      `/form6251Line5`,
      `/form6251Line6`,
      `/amt`,
      `/totalAdditionalTaxesOwed`,
    ];
    const g = fg(clean(singleFilerData, 50000));
    // line 1b = AGI 50,000 − line 14 16,100 = 33,900; line 2a = 12e std ded 16,100 → line 4 = 50,000
    expect(val(g, `/form6251Line1b`)).toBe(`33900.00`);
    expect(val(g, `/form6251Line2a`)).toBe(`16100.00`);
    expect(val(g, `/form6251Line4`)).toBe(`50000.00`);
    expect(val(g, `/form6251Line5`)).toBe(`90100.00`);
    expect(val(g, `/form6251Line6`)).toBe(`0.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    expect(val(g, `/totalAdditionalTaxesOwed`)).toBe(`0.00`);
    noAmtKnockouts(g);
  });
  it(`MFJ $300,000 wages with $40,000 SALT itemized: SALT added back (line 2a), AMTI $300,000, no AMT`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251Line2a`, `/form6251Line4`, `/form6251Line7`, `/amt`];
    const g = fg({ ...clean(mfjFilerData, 300000), ...salt(40000) });
    expect(val(g, `/scheduleALine5e`)).toBe(`40000.00`);
    expect(val(g, `/taxableIncome`)).toBe(`260000.00`);
    expect(val(g, `/form6251Line2a`)).toBe(`40000.00`);
    expect(val(g, `/form6251Line4`)).toBe(`300000.00`);
    // (300,000 − 140,200) × 26% = 41,548 < regular tax 35,932 + 24% × 48,600 = 47,596
    expect(val(g, `/form6251Line7`)).toBe(`41548.00`);
    expect(val(g, `/form6251Line10`)).toBe(`47596.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    expect(val(g, `/totalTax`)).toBe(`47596.00`);
  });
});

describe(`Form 6251 — exemption phaseout (§55(d)(2), 50% per §55(d)(4)(A)(ii)(IV))`, () => {
  for (const [l, s, wages, ex] of [
    [`single at threshold`, singleFilerData, 500000, `90100.00`],
    [`single mid-phaseout`, singleFilerData, 600000, `40100.00`],
    [`single $200 short of complete`, singleFilerData, 680000, `100.00`],
    [`single complete phaseout $680,200`, singleFilerData, 680200, `0.00`],
    [`MFJ at threshold`, mfjFilerData, 1000000, `140200.00`],
    [`MFJ mid-phaseout`, mfjFilerData, 1100000, `90200.00`],
    [`MFJ complete phaseout $1,280,400`, mfjFilerData, 1280400, `0.00`],
    [`MFS at threshold`, mfsFilerData, 500000, `70100.00`],
    [`MFS complete phaseout $640,200`, mfsFilerData, 640200, `0.00`],
  ] as [string, Record<string, unknown>, number, string][])
    it(`${l}: wages ${wages} → line 5 ${ex}`, ({ task }) => {
      task.meta.testedFactPaths = [`/form6251ExemptionReduction`, `/form6251Line5`];
      const g = fg(clean(s, wages));
      expect(val(g, `/form6251Line4`)).toBe(`${wages}.00`);
      expect(val(g, `/form6251Line5`)).toBe(ex);
    });
});

describe(`Form 6251 — 26% / 28% (line 7)`, () => {
  for (const [l, s, wages, l6, l7] of [
    [`single line 6 = $244,500 → 26%`, singleFilerData, 334600, `244500.00`, `63570.00`],
    [`single line 6 = $264,500 → 28% − $4,890`, singleFilerData, 354600, `264500.00`, `69170.00`],
    [`MFJ line 6 = $244,500 → 26%`, mfjFilerData, 384700, `244500.00`, `63570.00`],
    [`MFJ line 6 = $259,800 → 28% − $4,890`, mfjFilerData, 400000, `259800.00`, `67854.00`],
    [`MFS line 6 = $122,250 → 26%`, mfsFilerData, 192350, `122250.00`, `31785.00`],
    [`MFS line 6 = $129,900 → 28% − $2,445`, mfsFilerData, 200000, `129900.00`, `33927.00`],
  ] as [string, Record<string, unknown>, number, string, string][])
    it(l, ({ task }) => {
      task.meta.testedFactPaths = [`/form6251Line6`, `/form6251Line7`, `/form6251Line9`];
      const g = fg(clean(s, wages));
      expect(val(g, `/form6251Line6`)).toBe(l6);
      expect(val(g, `/form6251Line7`)).toBe(l7);
      expect(val(g, `/form6251Line9`)).toBe(l7);
      // high-ordinary-income wage returns: regular tax exceeds TMT, so no AMT
      expect(val(g, `/amt`)).toBe(`0.00`);
    });
});

describe(`Form 6251 Part III — capital gain rates`, () => {
  it(`single, $100,000 wages + $1,000,000 LTCG: exemption fully phased out, Part III line 40 = $202,920, AMT $12,824`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/form6251UsesPartIII`,
      `/form6251Line18`,
      `/form6251Line31`,
      `/form6251Line34`,
      `/form6251Line40`,
      `/amt`,
      `/totalAdditionalTaxesOwed`,
      `/totalTax`,
    ];
    const g = fg({ ...clean(singleFilerData, 100000), ...ltGain(1000000) });
    expect(get(g, `/form6251UsesPartIII`).get).toBe(true);
    expect(val(g, `/form6251Line4`)).toBe(`1100000.00`);
    expect(val(g, `/form6251Line5`)).toBe(`0.00`);
    expect(val(g, `/form6251Line17`)).toBe(`100000.00`); // 1,100,000 − 1,000,000
    expect(val(g, `/form6251Line18`)).toBe(`26000.00`); // 26%
    expect(val(g, `/form6251Line23`)).toBe(`0.00`); // 49,450 − 83,900 < 0
    expect(val(g, `/form6251Line30`)).toBe(`461600.00`); // 545,500 − 83,900
    expect(val(g, `/form6251Line31`)).toBe(`69240.00`);
    expect(val(g, `/form6251Line34`)).toBe(`107680.00`); // 20% × 538,400
    expect(val(g, `/form6251Line39`)).toBe(`303110.00`); // 28% × 1,100,000 − 4,890
    expect(val(g, `/form6251Line7`)).toBe(`202920.00`);
    // regular tax: Tax Table on $83,900 (13,176) + 69,240 + 107,680 = 190,096
    expect(val(g, `/form6251Line10`)).toBe(`190096.00`);
    expect(val(g, `/amt`)).toBe(`12824.00`);
    expect(val(g, `/schedule2Line2`)).toBe(`12824.00`);
    expect(val(g, `/totalAdditionalTaxesOwed`)).toBe(`12824.00`);
    expect(val(g, `/totalTax`)).toBe(`202920.00`);
    expect(get(g, `/requiresSchedule2`).get).toBe(true);
  });
  it(`MFJ, $200,000 wages + $1,000,000 LTCG: mid-phaseout exemption $40,200, line 7 $219,253, AMT $15,208`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form6251Line5`, `/form6251Line7`, `/amt`];
    const g = fg({ ...clean(mfjFilerData, 200000), ...ltGain(1000000) });
    expect(val(g, `/form6251Line4`)).toBe(`1200000.00`);
    expect(val(g, `/form6251Line5`)).toBe(`40200.00`);
    expect(val(g, `/form6251Line18`)).toBe(`41548.00`); // 26% × 159,800
    expect(val(g, `/form6251Line31`)).toBe(`66885.00`); // 15% × (613,700 − 167,800)
    expect(val(g, `/form6251Line34`)).toBe(`110820.00`); // 20% × 554,100
    expect(val(g, `/form6251Line7`)).toBe(`219253.00`);
    expect(val(g, `/form6251Line10`)).toBe(`204045.00`); // 26,340 + 66,885 + 110,820
    expect(val(g, `/amt`)).toBe(`15208.00`);
  });
});

describe(`Form 6251 knockouts (BlockSubmissionOnTrue, wired into /flowIsKnockedOut)`, () => {
  it(`unsupported AMT items (ISOs, PAB interest, depreciation, NOL, AMTFTC) = yes knocks out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutAmtPreferenceItems`, `/flowIsKnockedOut`];
    const g = fg({ ...clean(singleFilerData, 50000), '/hasAmtPreferenceItems': createBooleanWrapper(true) });
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutAmtPreferenceItems`);
  });
  it(`unanswered AMT items question does not knock out`, () => {
    const d: Record<string, unknown> = clean(singleFilerData, 50000);
    delete d[`/hasAmtPreferenceItems`];
    expect(get(fg(d), `/flowKnockoutAmtPreferenceItems`).get).toBe(false);
  });
  it(`MFS with AMTI over $640,200 knocks out (§55(d)(2) MFS add-back not implemented); $640,200 does not`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutAmtMfsAddBack`, `/flowIsKnockedOut`];
    expect(get(fg(clean(mfsFilerData, 640200)), `/flowKnockoutAmtMfsAddBack`).get).toBe(false);
    const g = fg(clean(mfsFilerData, 640201));
    expect(get(g, `/flowKnockoutAmtMfsAddBack`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutAmtMfsAddBack`);
    // single at the same AMTI is not affected
    expect(get(fg(clean(singleFilerData, 700000)), `/flowKnockoutAmtMfsAddBack`).get).toBe(false);
  });
  it(`dependent filer with AMTI over earned income + $9,750 (Rev. Proc. 2025-32 §4.11 p. 17) knocks out`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/flowKnockoutAmtKiddieTax`, `/flowIsKnockedOut`];
    const dep = {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
      [`/filers/#${primaryFilerId}/willBeClaimed`]: createBooleanWrapper(true),
      [`/filers/#${primaryFilerId}/potentialClaimerMustFile`]: createBooleanWrapper(true),
    };
    const interest = (amt: number) => makeInterestReportData(amt, undefined, primaryFilerId);
    const ok = fg({ ...clean(singleFilerData, 5000), ...dep });
    expect(get(ok, `/flowKnockoutAmtKiddieTax`).get).toBe(false); // AMTI 5,000 ≤ 14,750
    const g = fg({ ...clean(singleFilerData, 5000), ...dep, ...interest(30000) });
    expect(get(g, `/eitherFilerIsClaimedAsDependent`).get).toBe(true);
    expect(get(g, `/flowKnockoutAmtKiddieTax`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutAmtKiddieTax`);
    // same income, not a dependent: no knockout
    expect(get(fg({ ...clean(singleFilerData, 5000), ...interest(30000) }), `/flowKnockoutAmtKiddieTax`).get).toBe(
      false
    );
  });
});
