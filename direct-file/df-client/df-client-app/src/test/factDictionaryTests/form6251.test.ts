import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
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
 * Rev. Proc. 2025-32 §4.10 (exemption and 28% breakpoint p. 16; phaseout p. 17) (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf):
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
const KOS = [`/flowKnockoutAmtPreferenceItems`, `/flowKnockoutAmtMfsAddBack`];
const noAmtKnockouts = (g: Fg) => KOS.forEach((k) => expect(get(g, k).get).toBe(false));

describe(`Form 6251 constants — Rev. Proc. 2025-32 §4.10 pp. 16 (exemption), 17 (phaseout)`, () => {
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

  // Rev. Proc. 2025-32 §4.10 p. 17: joint complete phaseout $1,280,400 = $1,000,000 + 2 x $140,200.
  // IRC §55(d)(2) and §55(d)(4)(A)(ii)(IV): 140,200 − 50% × (1,280,400 − 1,000,000) = 0.
  it(`MFJ boundary: AMTI $1,280,400, exemption is 0`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form6251Line4`,
      `/form6251ExemptionAmount`,
      `/form6251PhaseoutThreshold`,
      `/form6251ExemptionReduction`,
      `/form6251Line5`,
    ];
    const g = fg(clean(mfjFilerData, 1280400));
    expect(val(g, `/form6251Line4`)).toBe(`1280400.00`);
    expect(val(g, `/form6251ExemptionAmount`)).toBe(`140200.00`);
    expect(val(g, `/form6251PhaseoutThreshold`)).toBe(`1000000.00`);
    expect(val(g, `/form6251ExemptionReduction`)).toBe(`140200.00`);
    expect(val(g, `/form6251Line5`)).toBe(`0.00`);
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
    // #83: Form 8960 NIIT now also applies: NII $1,000,000 vs MAGI excess $1,100,000 − $200,000 = $900,000;
    // 3.8% × $900,000 = $34,200 on Schedule 2 line 6 (IRC §1411(a)(1)). Total tax 202,920 + 34,200 = 237,120.
    expect(val(g, `/schedule2Line6NetInvestmentIncomeTax`)).toBe(`34200.00`);
    expect(val(g, `/totalTax`)).toBe(`237120.00`);
    expect(get(g, `/requiresSchedule2`).get).toBe(true);
  });
  // #178: every amount entered on a Part III line is in whole dollars, half a dollar up (IRC 6102(a)(2); 26 CFR
  // 301.6102-1(a); Form 1040 instr. (2025) p. 23, Rounding Off to Whole Dollars: "If you do round to whole dollars, you
  // must round all amounts"). Line 38 adds the rounded lines 18, 31 and 34; line 40 is the smaller of 38 or 39.
  it(`single, $100,010 wages + $1,000,000 LTCG: lines 18, 31 and 39 round (31 = $69,238.50 -> $69,239), AMT $12,827`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/form6251Line18`,
      `/form6251Line31`,
      `/form6251Line34`,
      `/form6251Line38`,
      `/form6251Line39`,
      `/form6251Line40`,
      `/form6251Line7`,
      `/amt`,
    ];
    const g = fg({ ...clean(singleFilerData, 100010), ...ltGain(1000000) });
    expect(val(g, `/form6251Line12`)).toBe(`1100010.00`);
    expect(val(g, `/form6251Line17`)).toBe(`100010.00`);
    expect(val(g, `/form6251Line18`)).toBe(`26003.00`); // 26% × 100,010 = 26,002.60
    expect(val(g, `/form6251Line30`)).toBe(`461590.00`); // 545,500 − 83,910
    expect(val(g, `/form6251Line31`)).toBe(`69239.00`); // 15% × 461,590 = 69,238.50, half a dollar up
    expect(val(g, `/form6251Line33`)).toBe(`538410.00`);
    expect(val(g, `/form6251Line34`)).toBe(`107682.00`); // 20% × 538,410
    expect(val(g, `/form6251Line38`)).toBe(`202924.00`); // 26,003 + 69,239 + 107,682
    expect(val(g, `/form6251Line39`)).toBe(`303113.00`); // 28% × 1,100,010 − 4,890 = 303,112.80
    expect(val(g, `/form6251Line40`)).toBe(`202924.00`);
    expect(val(g, `/form6251Line7`)).toBe(`202924.00`);
    // regular tax: 69,238.50 + 107,682 + 13,176 (Tax Table on $83,910) = 190,096.50 -> 190,097. Before #178 line 7
    // was round(202,923.10) = 202,923 and the AMT $12,826.
    expect(val(g, `/form6251Line10`)).toBe(`190097.00`);
    expect(val(g, `/amt`)).toBe(`12827.00`);
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

describe(`#122 Form 6251 attached to the PDF — i6251 (2025) p. 1 "Who Must File" item 1: line 7 > line 10`, () => {
  it(`AMT $12,824 (line 7 $202,920 > line 10 $190,096): Form 6251 required`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251Required`];
    const g = fg({ ...clean(singleFilerData, 100000), ...ltGain(1000000) });
    expect(val(g, `/amt`)).toBe(`12824.00`);
    expect(get(g, `/form6251Required`).get).toBe(true);
  });
  it(`line 7 ≤ line 10 (AMT $0): not required, including when line 6 > 0`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251Required`];
    expect(get(fg(clean(singleFilerData, 50000)), `/form6251Required`).get).toBe(false);
    // MFJ $300,000 with $40,000 SALT: line 6 $159,800 > 0 and line 7 $41,548 < line 10 $47,596
    const g = fg({ ...clean(mfjFilerData, 300000), ...salt(40000) });
    expect(val(g, `/form6251Line6`)).toBe(`159800.00`);
    expect(get(g, `/form6251Required`).get).toBe(false);
  });
});

describe(`Form 6251 knockouts (BlockSubmissionOnTrue, wired into /flowIsKnockedOut)`, () => {
  it(`unsupported AMT items other than line 2g (ISOs, depreciation, NOL, AMTFTC) = yes knocks out`, ({ task }) => {
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
  /**
   * #164: no AMT exemption limit for a child subject to the kiddie tax for TY2026. 26 U.S.C. 55(d)(4)(A)
   * (https://www.law.cornell.edu/uscode/text/26/55): "In the case of any taxable year beginning after December 31,
   * 2017— ... (iii) subsection (j) of section 59 shall not apply." Pub. L. 119-21 sec. 70107(a)(1) struck the
   * ", and before January 1, 2026" end date (effective for taxable years beginning after Dec. 31, 2025, sec. 70107(d)).
   * Rev. Proc. 2025-32 sec. 4.11, p. 17 still prints the indexed sec. 59(j)(1)(B) amount ($9,750), as Rev. Proc. 2024-40
   * sec. 3.12, p. 11 did ($9,550) for 2025, when clause (iii) already applied.
   */
  describe(`#164 dependent filers get the full AMT exemption (sec. 59(j) off under sec. 55(d)(4)(A)(iii))`, () => {
    const dep = {
      [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
      [`/filers/#${primaryFilerId}/willBeClaimed`]: createBooleanWrapper(true),
      [`/filers/#${primaryFilerId}/potentialClaimerMustFile`]: createBooleanWrapper(true),
    };
    const interest = (amt: number) => makeInterestReportData(amt, undefined, primaryFilerId);

    it(`the AMT kiddie-tax knockout fact no longer exists and doesn't block submission`, () => {
      expect(submissionBlockingFacts).not.toContain(`/flowKnockoutAmtKiddieTax`);
    });

    it(`adult dependent with AMTI over earned income + $9,750: not knocked out, full $90,100 exemption`, ({ task }) => {
      task.meta.testedFactPaths = [`/form6251ExemptionAmount`, `/form6251Line5`, `/amt`, `/flowIsKnockedOut`];
      // Primary filer born 1987 (age 39 at the end of 2026) is not a child under sec. 1(g)(2).
      const g = fg({ ...clean(singleFilerData, 5000), ...dep, ...interest(30000) });
      expect(get(g, `/eitherFilerIsClaimedAsDependent`).get).toBe(true);
      expect(val(g, `/form6251Line4`)).not.toBe(`0.00`);
      expect(val(g, `/form6251ExemptionAmount`)).toBe(`90100.00`);
      expect(val(g, `/form6251Line5`)).toBe(`90100.00`);
      expect(val(g, `/amt`)).toBe(`0.00`);
      expect(get(g, `/flowKnockoutForm8615`).get).toBe(false);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });

    it(`adult dependent with large interest income: AMT uses the full exemption, not earned income + $9,750`, () => {
      const g = fg({ ...clean(singleFilerData, 5000), ...dep, ...interest(150000) });
      expect(val(g, `/form6251Line5`)).toBe(`90100.00`);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
    });

    it(`a child subject to sec. 1(g) still stops, on the Form 8615 knockout`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutForm8615`, `/flowIsKnockedOut`];
      const child = {
        ...clean(singleFilerData, 5000),
        ...dep,
        ...interest(30000),
        [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`2010-06-06`),
      };
      const g = fg(child);
      expect(get(g, `/flowKnockoutForm8615`).get).toBe(true);
      expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    });
  });
});

/**
 * Form 6251 line 2g. 26 U.S.C. 57(a)(5). Instructions for Form 6251 (2025) p. 3, Line 2g. 1099-INT box 9 is included
 * in box 8. 1099-DIV box 13 is included in box 12. No deduction that would have been allowable if the interest were
 * includible in gross income is collected, so the line is not reduced. MFJ standard deduction $32,200 and exemption
 * $140,200 (Rev. Proc. 2025-32 §4.01 and §4.10). Regular tax on taxable income $167,800 is $11,600 + 22% of $67,000
 * = $26,340.
 */
describe(`Form 6251 line 2g — specified private activity bond interest`, () => {
  const intId = `b7777777-7777-4777-8777-777777777771`;
  const divId = `b7777777-7777-4777-8777-777777777772`;
  const pab = (box8: string, box9: string, box12: string, box13: string) => ({
    '/interestReports': createCollectionWrapper([intId]),
    '/interestReportsIsDone': createBooleanWrapper(true),
    [`/interestReports/#${intId}/has1099`]: createBooleanWrapper(true),
    [`/interestReports/#${intId}/filer`]: createCollectionItemWrapper(primaryFilerId),
    [`/interestReports/#${intId}/payer`]: createStringWrapper(`City Water Authority`),
    [`/interestReports/#${intId}/writable1099Amount`]: createDollarWrapper(`0`),
    [`/interestReports/#${intId}/writableTaxExemptInterest`]: createDollarWrapper(box8),
    [`/interestReports/#${intId}/writableSpecifiedPrivateActivityBondInterest`]: createDollarWrapper(box9),
    [`/interestReports/#${intId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
    '/dividendReports': createCollectionWrapper([divId]),
    '/dividendReportsIsDone': createBooleanWrapper(true),
    [`/dividendReports/#${divId}/filer`]: createCollectionItemWrapper(primaryFilerId),
    [`/dividendReports/#${divId}/payer`]: createStringWrapper(`National Muni Fund`),
    [`/dividendReports/#${divId}/ordinaryDividends`]: createDollarWrapper(`0`),
    [`/dividendReports/#${divId}/writableExemptInterestDividends`]: createDollarWrapper(box12),
    [`/dividendReports/#${divId}/writableSpecifiedPrivateActivityBondInterestDividends`]: createDollarWrapper(box13),
    [`/dividendReports/#${divId}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
    [`/dividendReports/#${divId}/receivedAsNominee`]: createBooleanWrapper(false),
    [`/dividendReports/#${divId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  });

  it(`MFJ $200,000 wages and no line 2g: AMT $0 and Form 6251 is not required`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251Line2g`, `/form6251Line4`, `/amt`, `/form6251Required`];
    const g = fg(clean(mfjFilerData, 200000));
    expect(val(g, `/form6251Line2g`)).toBe(`0.00`);
    expect(val(g, `/form6251Line4`)).toBe(`200000.00`);
    expect(val(g, `/form6251Line6`)).toBe(`59800.00`);
    expect(val(g, `/form6251Line7`)).toBe(`15548.00`);
    expect(val(g, `/form6251Line10`)).toBe(`26340.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    expect(get(g, `/form6251Required`).get).toBe(false);
  });

  it(`line 2g $50,000 moves AMT from $0 to $2,208 and Form 6251 is required`, ({ task }) => {
    // Line 2a is box 8 $40,000 + box 12 $20,000 = $60,000. Line 2g is box 9 $30,000 + box 13 $20,000 = $50,000.
    // AMTI $250,000. Line 6 $109,800. Tentative minimum tax 26% × $109,800 = $28,548. AMT $2,208.
    task.meta.testedFactPaths = [
      `/form6251Line2g`,
      `/taxExemptInterest`,
      `/form6251Line4`,
      `/amt`,
      `/form6251Required`,
      `/flowKnockoutHasBonds`,
      `/flowIsKnockedOut`,
    ];
    const g = fg({ ...clean(mfjFilerData, 200000), ...pab(`40000`, `30000`, `20000`, `20000`) });
    expect(val(g, `/taxExemptInterest`)).toBe(`60000.00`);
    expect(val(g, `/form6251Line2g`)).toBe(`50000.00`);
    expect(val(g, `/form6251Line4`)).toBe(`250000.00`);
    expect(val(g, `/form6251Line6`)).toBe(`109800.00`);
    expect(val(g, `/form6251Line7`)).toBe(`28548.00`);
    expect(val(g, `/form6251Line10`)).toBe(`26340.00`);
    expect(val(g, `/amt`)).toBe(`2208.00`);
    expect(get(g, `/form6251Required`).get).toBe(true);
    expect(get(g, `/flowKnockoutHasBonds`).get).toBe(false);
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).get).toBe(false);
    expect(get(g, `/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`).get).toBe(false);
    expect(get(g, `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(false);
  });

  it(`line 2g $10,000 is computed and AMT stays $0, so Form 6251 is not required`, ({ task }) => {
    // AMTI $210,000. Line 6 $69,800. Tentative minimum tax $18,148, which is less than regular tax $26,340.
    task.meta.testedFactPaths = [`/form6251Line2g`, `/amt`, `/form6251Required`];
    const g = fg({ ...clean(mfjFilerData, 200000), ...pab(`10000`, `10000`, `0`, `0`) });
    expect(val(g, `/form6251Line2g`)).toBe(`10000.00`);
    expect(val(g, `/form6251Line4`)).toBe(`210000.00`);
    expect(val(g, `/form6251Line7`)).toBe(`18148.00`);
    expect(val(g, `/form6251Line10`)).toBe(`26340.00`);
    expect(val(g, `/amt`)).toBe(`0.00`);
    expect(get(g, `/form6251Required`).get).toBe(false);
  });

  it(`cents stay in the addition and only line 2g is rounded`, ({ task }) => {
    task.meta.testedFactPaths = [`/form6251Line2g`, `/taxExemptInterest`];
    const g = fg({ ...clean(mfjFilerData, 200000), ...pab(`10.40`, `10.40`, `10.40`, `10.40`) });
    expect(val(g, `/taxExemptInterest`)).toBe(`21.00`);
    expect(val(g, `/form6251Line2g`)).toBe(`21.00`);
  });

  it(`box 9 larger than box 8 stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`, `/flowIsKnockedOut`];
    const g = fg({ ...clean(mfjFilerData, 200000), ...pab(`8`, `9`, `0`, `0`) });
    expect(get(g, `/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`).get).toBe(true);
    expect(get(g, `/flowKnockoutHasBonds`).get).toBe(false);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`);
  });
});
