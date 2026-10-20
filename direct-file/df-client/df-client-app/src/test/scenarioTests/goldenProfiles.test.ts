// Golden end-to-end scenarios (synthetic data), #135 first slice: profiles 5 and 7. The fixtures are in
// goldenProfiles.ts. Every expected figure below was worked by hand from the cited source, line by line.
//
// Sources (page = PDF page):
// [RP] Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
//      (SHA-256 e9ada115fb43a4af5ea326ca91edd40ab0bf29b9be01d2c13d7b8fa96214635b)
//      p. 11 §4.01 Table 3 (unmarried): "Over $12,400 but not over $50,400 $1,240 plus 12% of the excess over
//      $12,400"; "Over $50,400 but not over $105,700 $5,800 plus 22% of the excess over $50,400"; "Over $201,775 but
//      not over $256,225 $41,024 plus 32% of the excess over $201,775"; "Over $640,600 $192,979.25 plus 37% of the
//      excess over $640,600".
//      p. 13 §4.03: "All Other Individuals $49,450 $545,500" (maximum zero rate / 15% rate amounts).
//      p. 16 §4.10: "Unmarried Individuals (other than Surviving Spouses) $90,100"; "the excess taxable income above
//      which the 28 percent tax rate applies is: ... All Other Taxpayers $244,500".
//      p. 17 §4.10: "Unmarried Individuals (other than Surviving Spouses) $500,000 $680,200" (threshold, complete
//      phaseout).
//      p. 18 §4.14(1): "Unmarried Individuals (other than Surviving Spouses and Heads of Households) ... $16,100".
// [GI] Form 1040 instructions (2025), https://www.irs.gov/pub/irs-pdf/i1040gi.pdf
//      (SHA-256 482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a)
//      p. 36: "If your taxable income is less than $100,000, you must use the Tax Table, later in these
//      instructions, to figure your tax." p. 69 Tax Table: row "3,000 3,050" single "303", i.e. the tax on the row
//      midpoint (10% x $3,025 = $302.50), rounded. p. 38 Qualified Dividends and Capital Gain Tax Worksheet, lines
//      1-25 (the 2025 dollar amounts on lines 6 and 13 are replaced by the [RP] p. 13 amounts).
// [6251] Form 6251 (2026) draft, https://www.irs.gov/pub/irs-dft/f6251--dft.pdf
//      (SHA-256 a547fc9d629e1f04bdc30e088214c716667b88cb1b45447c580c0ae33095b5cc) p. 2 lines 1-11, p. 3 Part III:
//      line 18 "If line 17 is $244,500 or less ... multiply line 17 by 26% (0.26). Otherwise, multiply line 17 by
//      28% (0.28) and subtract $4,890"; line 39 the same on line 12; line 40 "Enter the smaller of line 38 or
//      line 39 here and on line 7".
// [55] IRC §55(b)(1)(A), https://www.law.cornell.edu/uscode/text/26/55: "26 percent of so much of the taxable excess
//      as does not exceed $175,000, plus (ii) 28 percent of so much of the taxable excess as exceeds $175,000"
//      ($175,000 adjusted to $244,500 by [RP] p. 16).
// [3101] IRC §3101(b), https://www.law.cornell.edu/uscode/text/26/3101: (b)(1) "a tax equal to 1.45 percent of the
//      wages"; (b)(2) "a tax equal to 0.9 percent of wages ... which are in excess of— ... (C) in any other case,
//      $200,000."
// [1411] IRC §1411, https://www.law.cornell.edu/uscode/text/26/1411: (a)(1) "a tax equal to 3.8 percent of the lesser
//      of— (A) net investment income for such taxable year, or (B) the excess (if any) of— (i) the modified adjusted
//      gross income for such taxable year, over (ii) the threshold amount"; (b)(3) "in any other case, $200,000".
// [PA] PA-40 IN (2025), https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf
//      (SHA-256 e8996504a4302a65055e697ba6301a3e41a411a4802645a5fc5f653f7538c172; the 2026 booklet is not yet
//      published). p. 6 (P) Part-Year Resident: "PA law taxes part-year residents on all income from all sources
//      while a PA resident, and all income (loss) earned, received, and realized from PA sources when not a resident
//      of Pennsylvania." p. 10: "Box 16 of your Form W-2 usually shows your PA-taxable compensation if the W-2
//      includes PA withholding in Box 17." p. 14 LINE 2: "Report all PA-taxable interest income received or
//      credited during the year." p. 20 LINE 9: "Add only the positive income amounts from Lines 1c through 8."
//      p. 21 LINE 11: "Subtract Line 10 from Line 9." LINE 12: "Multiply Line 11 by 3.07 percent (0.0307)."
//      LINE 13: "Enter your total PA tax withheld from Box 17 of your federal Form(s) W2." p. 23 LINE 24: "Add Lines
//      13, 18, 21, 22, and 23." p. 24 LINE 29: "Subtract Line 12 (and subtract Lines 25 and 27, if you entered amounts
//      on these lines) from Line 24, and enter the difference here."
// [EITC] Rev. Proc. 2025-32 p. 15 §4.06(1): "Completed Phaseout Amount (All other filing statuses)" with no qualifying
//      children "$19,540". IRC §32(m), https://www.law.cornell.edu/uscode/text/26/32: "a taxpayer identification
//      number means a social security number issued to an individual by the Social Security Administration". The
//      fixture SSNs are in the 900 area, which SSA never issues; the app reads them as neither an SSN nor (with these
//      group numbers) an ITIN, so EITC is $0 on every profile. Every profile's AGI is also above $19,540. No profile
//      has a child, so the child tax credit SSN rule (§24(h)(7)) is not reached and CTC is $0.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  GOLDEN_SSN_PATTERN,
  goldenProfiles,
  profile5AmtAnd8959,
  profile7PaFullYear,
  profile7PaToFlPartYear,
} from './goldenProfiles.js';

type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const graph = (facts: Record<string, unknown>) => setupFactGraph(facts as never).factGraph;
const get = (g: Fg, p: string) => g.get(p as ConcretePath);
const expectDollars = (g: Fg, expected: Record<string, string>) => {
  for (const [path, value] of Object.entries(expected)) {
    const r = get(g, path);
    expect(r.complete, path).toBe(true);
    expect(r.get.toString(), path).toBe(value);
  }
};
// No submission-blocking fact is true for these returns. /flowIncomplete is left out: it tracks whether each
// interview section was marked done, which these fact-level fixtures don't model.
const expectNotStopped = (g: Fg) => {
  for (const path of submissionBlockingFacts.filter((p) => !p.includes(`*`) && p !== `/flowIncomplete`)) {
    const r = get(g, path);
    expect(r.complete && r.get === true, path).toBe(false);
  }
};

describe(`golden end-to-end scenario (synthetic data): fixtures`, () => {
  it(`every SSN is in the 900-999 test range`, () => {
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const tins = Object.entries(facts).filter(([path]) => path.endsWith(`/tin`));
      expect(tins.length, name).toBeGreaterThan(0);
      for (const [path, wrapper] of tins) {
        const { area, group, serial } = (wrapper as { item: { area: string; group: string; serial: string } }).item;
        expect(`${area}-${group}-${serial}`, `${name} ${path}`).toMatch(GOLDEN_SSN_PATTERN);
      }
    }
  });
  it(`the 900-area TINs are neither an SSN nor an ITIN to the app, and no profile gets EITC or CTC`, () => {
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const g = graph(facts);
      expect(get(g, `/primaryFiler/tin/isSSN`).get, name).toBe(false);
      expect(get(g, `/primaryFiler/tin/isITIN`).get, name).toBe(false);
      expect(get(g, `/eitcQualified`).get, name).toBe(false);
      expect(get(g, `/earnedIncomeCredit`).get.toString(), name).toBe(`0.00`);
      expect(get(g, `/totalCtc`).get.toString(), name).toBe(`0.00`);
      expect(get(g, `/nonRefundableCredits`).get.toString(), name).toBe(`0.00`);
    }
  });
});

describe(`golden end-to-end scenario (synthetic data): profile 5, Form 6251 AMT and Form 8959`, () => {
  // Single; W-2 box 1 and box 5 $250,000, box 2 $70,000, box 6 $4,075; Form 1099-DIV box 1a = box 1b $1,000,000.
  // Form 1040: line 1a 250,000; line 3a 1,000,000; line 3b 1,000,000; line 9 and line 11 (AGI) 1,250,000.
  //   line 12 standard deduction 16,100 [RP p. 18]; line 15 taxable income 1,233,900.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 1,233,900  2) 1,000,000  3) 0  4) 1,000,000  5) 233,900  6) 49,450
  //   [RP p. 13]  7) 49,450  8) 49,450  9) 0  10) 1,000,000  11) 0  12) 1,000,000  13) 545,500 [RP p. 13]
  //   14) 545,500  15) 233,900  16) 311,600  17) 311,600  18) 15% = 46,740  19) 311,600  20) 688,400
  //   21) 20% = 137,680  22) tax on 233,900 [RP p. 11]: 41,024 + 32% x 32,125 = 51,304  23) 235,724
  //   24) tax on 1,233,900: 192,979.25 + 37% x 593,300 = 412,500.25  25) smaller = 235,724.
  // Form 6251 [6251]: line 1a/2a standard deduction 16,100 added back; line 4 AMTI 1,250,000.
  //   line 5: 1,250,000 is over the $680,200 complete phaseout [RP p. 17], exemption 0; line 6 1,250,000.
  //   Part III: 12) 1,250,000  13) 1,000,000  17) 250,000  18) 28% x 250,000 - 4,890 = 65,110 [55]
  //   19) 49,450  20) 233,900  21) 0  22) 1,000,000  23) 0  24) 1,000,000  25) 545,500  28) 233,900  29) 311,600
  //   30) 311,600  31) 15% = 46,740  32) 311,600  33) 688,400  34) 20% = 137,680  38) 249,530
  //   39) 28% x 1,250,000 - 4,890 = 345,110  40) 249,530 = line 7 = line 9.
  //   line 10 regular tax 235,724; line 11 AMT 249,530 - 235,724 = 13,806 (Schedule 2 line 2).
  // Form 8959 [3101]: line 1 Medicare wages 250,000; threshold 200,000; line 6 50,000; line 7 0.9% = 450.
  //   Part V: line 19 box 6 4,075; line 20 250,000; line 21 1.45% = 3,625; line 22 450; line 24 450 (1040 line 25c).
  // Form 8960 [1411]: line 2 dividends 1,000,000 = line 8 = line 12; line 13 MAGI 1,250,000; line 14 200,000;
  //   line 15 1,050,000; line 16 1,000,000; line 17 3.8% = 38,000.
  // Form 1040: line 17 13,806; line 23 other taxes 38,000 + 450 = 38,450; line 24 total tax
  //   235,724 + 13,806 + 38,450 = 287,980; line 33 payments 70,000 + 450 = 70,450; amount owed 217,530.
  const g = graph(profile5AmtAnd8959);
  it(`Form 1040 income, deduction and line 16 tax`, () => {
    expectDollars(g, {
      '/wages': `250000.00`,
      '/ordinaryDividends': `1000000.00`,
      '/qualifiedDividends': `1000000.00`,
      '/totalIncome': `1250000.00`,
      '/agi': `1250000.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `1233900.00`,
      '/tentativeTaxFromTaxableIncome': `235724.00`,
    });
  });
  it(`Form 6251 AMT`, () => {
    expectDollars(g, {
      '/form6251Line2a': `16100.00`,
      '/form6251Line4': `1250000.00`,
      '/form6251Line5': `0.00`,
      '/form6251Line6': `1250000.00`,
      '/form6251Line17': `250000.00`,
      '/form6251Line18': `65110.00`,
      '/form6251Line20': `233900.00`,
      '/form6251Line21': `0.00`,
      '/form6251Line31': `46740.00`,
      '/form6251Line34': `137680.00`,
      '/form6251Line38': `249530.00`,
      '/form6251Line39': `345110.00`,
      '/form6251Line40': `249530.00`,
      '/form6251Line7': `249530.00`,
      '/form6251Line9': `249530.00`,
      '/form6251Line10': `235724.00`,
      '/amt': `13806.00`,
      '/schedule2Line2': `13806.00`,
    });
    expect(get(g, `/form6251Required`).get).toBe(true);
  });
  it(`Form 8959 Additional Medicare Tax`, () => {
    expectDollars(g, {
      '/form8959Line1': `250000.00`,
      '/form8959Line6': `50000.00`,
      '/form8959Line7': `450.00`,
      '/line17bAdditionalMedicareTax': `450.00`,
      '/form8959Line19': `4075.00`,
      '/form8959Line21': `3625.00`,
      '/form8959Line22': `450.00`,
      '/form8959Line24': `450.00`,
    });
    expect(get(g, `/requiresForm8959`).get).toBe(true);
  });
  it(`Form 8960 net investment income tax`, () => {
    expectDollars(g, {
      '/form8960Line2': `1000000.00`,
      '/form8960Line8': `1000000.00`,
      '/form8960Line12': `1000000.00`,
      '/form8960Line13': `1250000.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line15': `1050000.00`,
      '/form8960Line16': `1000000.00`,
      '/form8960Line17': `38000.00`,
      '/schedule2Line6NetInvestmentIncomeTax': `38000.00`,
    });
  });
  it(`Form 1040 total tax, payments and amount owed`, () => {
    expectDollars(g, {
      '/totalAdditionalTaxesOwed': `13806.00`,
      '/line21OfSchedule2': `38450.00`,
      '/totalTax': `287980.00`,
      '/otherFormWithholding': `450.00`,
      '/totalWithholding': `70450.00`,
      '/totalPayments': `70450.00`,
      '/balanceDue': `217530.00`,
    });
    expect(get(g, `/requiresSchedule2`).get).toBe(true);
  });
  it(`Florida resident: no state return; nothing stops the return`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expectNotStopped(g);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile 7, PA full-year resident`, () => {
  // Single; W-2 box 1 $62,000, box 2 $5,000, box 16 (PA) $65,000, box 17 $2,100; 1099-INT box 1 $800.
  // Form 1040: line 1a 62,000; line 2b 800; AGI 62,800; standard deduction 16,100 [RP p. 18]; taxable income 46,700.
  //   line 16: Tax Table [GI p. 36, p. 69], row 46,700-46,750, midpoint 46,725 with [RP p. 11]:
  //   1,240 + 12% x 34,325 = 5,359. Total tax 5,359; withholding 5,000; owed 359.
  // PA-40 [PA]: line 1a = box 16 65,000; line 1c 65,000; line 2 800; line 9 65,800; line 11 65,800;
  //   line 12 3.07% = 2,020.06; line 13 2,100; line 24 2,100; line 29 overpayment 2,100 - 2,020.06 = 79.94.
  const g = graph(profile7PaFullYear);
  it(`Form 1040`, () => {
    expectDollars(g, {
      '/totalIncome': `62800.00`,
      '/agi': `62800.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `46700.00`,
      '/tentativeTaxFromTaxableIncome': `5359.00`,
      '/amt': `0.00`,
      '/form8959Line7': `0.00`,
      '/totalTax': `5359.00`,
      '/totalPayments': `5000.00`,
      '/balanceDue': `359.00`,
    });
  });
  it(`PA-40`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(false);
    expectDollars(g, {
      '/paLine1a': `65000.00`,
      '/paLine1c': `65000.00`,
      '/paLine2': `800.00`,
      '/paLine9': `65800.00`,
      '/paLine11': `65800.00`,
      '/paLine12': `2020.06`,
      '/paLine13': `2100.00`,
      '/paLine24': `2100.00`,
      '/paLine26': `0.00`,
      '/paLine29': `79.94`,
      '/stateRefund': `79.94`,
    });
    expect(get(g, `/paSchoolCode`).get.toString()).toBe(`22275`);
  });
  it(`nothing stops the return`, () => {
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expectNotStopped(g);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile 7, PA to FL part-year resident`, () => {
  // Single; moved from PA to FL on July 1, 2026. W-2 #1 (PA job, before the move): box 1 and box 16 $30,000,
  // box 2 $2,500, box 17 $1,000. W-2 #2 (FL job, after the move): box 1 $40,000, box 2 $3,500, no PA wages, $0
  // earned while a PA resident.
  // Form 1040: wages 70,000 = AGI; standard deduction 16,100 [RP p. 18]; taxable income 53,900.
  //   line 16: Tax Table [GI p. 36, p. 69], row 53,900-53,950, midpoint 53,925 with [RP p. 11]:
  //   5,800 + 22% x 3,525 = 6,575.50, rounded 6,576. Withholding 6,000; owed 576.
  // PA-40 [PA p. 6]: income while a PA resident, plus PA-source income after the move (none: the FL wages are for
  //   work outside PA). line 1a 30,000; line 9 and line 11 30,000; line 12 3.07% = 921.00; line 13 1,000;
  //   line 29 overpayment 79.00.
  const g = graph(profile7PaToFlPartYear);
  it(`Form 1040`, () => {
    expectDollars(g, {
      '/wages': `70000.00`,
      '/agi': `70000.00`,
      '/taxableIncome': `53900.00`,
      '/tentativeTaxFromTaxableIncome': `6576.00`,
      '/totalTax': `6576.00`,
      '/totalPayments': `6000.00`,
      '/balanceDue': `576.00`,
    });
  });
  it(`PA-40 part-year`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(true);
    expectDollars(g, {
      '/paLine1a': `30000.00`,
      '/paLine9': `30000.00`,
      '/paLine11': `30000.00`,
      '/paLine12': `921.00`,
      '/paLine13': `1000.00`,
      '/paLine24': `1000.00`,
      '/paLine26': `0.00`,
      '/paLine29': `79.00`,
      '/stateRefund': `79.00`,
    });
  });
  it(`nothing stops the return`, () => {
    expect(get(g, `/flowKnockoutPaPartYear`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expectNotStopped(g);
  });
});
