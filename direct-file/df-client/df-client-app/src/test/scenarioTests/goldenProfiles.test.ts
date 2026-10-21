// Golden end-to-end scenarios (synthetic data), #135: profiles 5 and 7, profile A (dividends + NIIT) and profile B
// (Florida only). The fixtures are in goldenProfiles.ts. Every expected figure below was worked by hand from the
// cited source, line by line.
//
// Sources (page = PDF page):
// [RP] Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
//      (SHA-256 e9ada115fb43a4af5ea326ca91edd40ab0bf29b9be01d2c13d7b8fa96214635b)
//      p. 11 §4.01 Table 3 (unmarried): "Over $12,400 but not over $50,400 $1,240 plus 12% of the excess over
//      $12,400"; "Over $50,400 but not over $105,700 $5,800 plus 22% of the excess over $50,400"; "Over $201,775 but
//      not over $256,225 $41,024 plus 32% of the excess over $201,775"; "Over $640,600 $192,979.25 plus 37% of the
//      excess over $640,600".
//      p. 10 §4.01 Table 1 (joint): "Over $100,800 but not over $211,400 $11,600 plus 22% of the excess over
//      $100,800". p. 11 Table 3 (unmarried) and pp. 11-12 Table 4 (married filing separately) both: "Over $105,700
//      but not over $201,775 $17,966 plus 24% of the excess over $105,700".
//      p. 13 §4.03: "All Other Individuals $49,450 $545,500" (maximum zero rate / 15% rate amounts); "Married
//      Individuals Filing Joint Returns and Surviving Spouse $98,900 $613,700"; "Married Individuals Filing Separate
//      Returns $49,450 $306,850".
//      p. 16 §4.10: "Unmarried Individuals (other than Surviving Spouses) $90,100"; "the excess taxable income above
//      which the 28 percent tax rate applies is: ... All Other Taxpayers $244,500".
//      p. 17 §4.10: "Unmarried Individuals (other than Surviving Spouses) $500,000 $680,200" (threshold, complete
//      phaseout).
//      p. 16 §4.10: AMT exemption "Joint Returns or Surviving Spouses $140,200"; "Unmarried Individuals (other than
//      Surviving Spouses) $90,100" (married filing separately: half the joint amount, $70,100).
//      p. 18 §4.14(1): "Unmarried Individuals (other than Surviving Spouses and Heads of Households) ... $16,100";
//      "Married Individuals Filing Joint Returns and Surviving Spouses $32,200".
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
//      gross income for such taxable year, over (ii) the threshold amount"; (b)(1) "in the case of a taxpayer making a
//      joint return under section 6013 or a surviving spouse (as defined in section 2(a)), $250,000"; (b)(2) "in the
//      case of a married taxpayer (as defined in section 7703) filing a separate return, ½ of the dollar amount
//      determined under paragraph (1)"; (b)(3) "in any other case, $200,000"; (c)(1)(A)(i) net investment income
//      includes "gross income from interest, dividends, annuities, royalties, and rents". §1411 has no inflation
//      adjustment. Instructions for Form 8960 (2026) draft, https://www.irs.gov/pub/irs-dft/i8960--dft.pdf
//      (SHA-256 e0af7d344185a3dc0d50975261ab7cb3e7e0777d12c00cb2a91a83c61220cf40) p. 3: "Married filing jointly or
//      Qualifying surviving spouse is $250,000. • Married filing separately is $125,000. • Single or Head of
//      household is $200,000."
// [FL] Fla. Const. art. VII, §5(a), https://www.flsenate.gov/Laws/Constitution: "No tax upon estates or
//      inheritances or upon the income of natural persons who are residents or citizens of the state shall be levied
//      by the state, or under its authority, in excess of the aggregate of amounts which may be allowed to be
//      credited upon or deducted from any similar tax levied by the United States or any state."
//      The PA-40 template is printed only when /stateReturnPaFiled (pdf/2026/PA40/en/configuration.yml includeWhen).
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
import fs from 'fs';
import path from 'path';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from '../functionalFlowTests/functionalFlowUtils.js';
import { primaryFilerId } from '../testData.js';
import { createEnumWrapper } from '../persistenceWrappers.js';
import {
  GOLDEN_SSN_ALLOWLIST,
  goldenProfiles,
  isGoldenTestTin,
  profileADividendsNiit,
  profileADividendsNiitMfj,
  profileADividendsNiitMfs,
  profileBFloridaOnly,
  profileBFloridaStateWithholding,
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
  it(`every SSN is in the 900-999 test range or on the allowlist of upstream fixture SSNs`, () => {
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const tins = Object.entries(facts).filter(([path]) => path.endsWith(`/tin`));
      expect(tins.length, name).toBeGreaterThan(0);
      for (const [path, wrapper] of tins) {
        const { area, group, serial } = (wrapper as { item: { area: string; group: string; serial: string } }).item;
        expect(isGoldenTestTin(`${area}-${group}-${serial}`), `${name} ${path} ${area}-${group}-${serial}`).toBe(true);
      }
    }
  });
  it(`each allowlisted SSN is one the shared upstream fixtures already use`, () => {
    const testData = fs.readFileSync(path.resolve(__dirname, `../testData.ts`), `utf8`);
    for (const tin of GOLDEN_SSN_ALLOWLIST) {
      const [area, group, serial] = tin.split(`-`);
      expect(testData, tin).toContain(`area: \`${area}\`, group: \`${group}\`, serial: \`${serial}\``);
    }
    expect(isGoldenTestTin(`123-45-6789`)).toBe(false);
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

const pdfIncludeWhen = (form: string) => {
  const file = path.resolve(
    __dirname,
    `../../../../../backend/src/main/resources/pdf/2026/${form}/en/configuration.yml`
  );
  const m = /^includeWhen:\s*(\S+)/m.exec(fs.readFileSync(file, `utf8`));
  return m ? m[1] : undefined;
};

describe(`golden end-to-end scenario (synthetic data): profile A, dividends and NIIT`, () => {
  // Single Florida resident; W-2 box 1 and box 5 $210,000, box 2 $40,000, box 6 $3,045; 1099-DIV box 1a $20,000,
  // box 1b $15,000.
  // Form 1040: line 1a 210,000; line 3a 15,000; line 3b 20,000; line 9 and line 11 (AGI) 230,000; line 12 standard
  //   deduction 16,100 [RP p. 18]; line 15 taxable income 213,900. Schedule B Part II: dividends over $1,500.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 213,900  2) 15,000  3) 0  4) 15,000  5) 198,900  6) 49,450 [RP p. 13]
  //   7) 49,450  8) 49,450  9) 0  10) 15,000  11) 0  12) 15,000  13) 545,500 [RP p. 13]  14) 213,900  15) 198,900
  //   16) 15,000  17) 15,000  18) 15% = 2,250  19) 15,000  20) 0  21) 0
  //   22) tax on 198,900 [RP p. 11]: 17,966 + 24% x 93,200 = 40,334  23) 42,584
  //   24) tax on 213,900: 41,024 + 32% x 12,125 = 44,904  25) smaller = 42,584.
  // Form 6251 [6251]: line 4 AMTI 213,900 + 16,100 = 230,000; line 5 exemption 90,100 [RP p. 16] (AMTI under the
  //   $500,000 phaseout threshold [RP p. 17]); line 6 139,900. Part III: 17) 139,900 - 15,000 = 124,900
  //   18) 26% = 32,474 (124,900 <= 244,500 [RP p. 16])  30) 15,000  31) 15% = 2,250  34) 0  38) 34,724
  //   39) 26% x 139,900 = 36,374  40) 34,724 = line 7 = line 9; line 10 regular tax 42,584; line 11 AMT 0.
  // Form 8959 [3101]: line 1 210,000; threshold 200,000; line 6 10,000; line 7 0.9% = 90. Part V: line 19 3,045;
  //   line 21 1.45% x 210,000 = 3,045; line 22 0; line 24 0.
  // Form 8960 [1411]: line 2 dividends 20,000 = line 8 = line 12; line 13 MAGI 230,000; line 14 200,000; line 15
  //   30,000; line 16 smaller of line 12 or 15 = 20,000; line 17 3.8% = 760 (Schedule 2 line 12).
  // Form 1040: Schedule 2 line 21 760 + 90 = 850; line 24 total tax 42,584 + 850 = 43,434; line 33 payments
  //   40,000; amount owed 3,434.
  const g = graph(profileADividendsNiit);
  it(`Form 1040 income, deduction and line 16 tax`, () => {
    expectDollars(g, {
      '/wages': `210000.00`,
      '/ordinaryDividends': `20000.00`,
      '/qualifiedDividends': `15000.00`,
      '/totalIncome': `230000.00`,
      '/agi': `230000.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `213900.00`,
      '/tentativeTaxFromTaxableIncome': `42584.00`,
    });
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
  });
  it(`Form 6251: no AMT`, () => {
    expectDollars(g, {
      '/form6251Line4': `230000.00`,
      '/form6251Line5': `90100.00`,
      '/form6251Line6': `139900.00`,
      '/form6251Line17': `124900.00`,
      '/form6251Line18': `32474.00`,
      '/form6251Line31': `2250.00`,
      '/form6251Line38': `34724.00`,
      '/form6251Line39': `36374.00`,
      '/form6251Line40': `34724.00`,
      '/form6251Line10': `42584.00`,
      '/amt': `0.00`,
    });
    expect(get(g, `/form6251Required`).get).toBe(false);
  });
  it(`Form 8959 Additional Medicare Tax`, () => {
    expectDollars(g, {
      '/form8959Line1': `210000.00`,
      '/form8959Line6': `10000.00`,
      '/form8959Line7': `90.00`,
      '/form8959Line19': `3045.00`,
      '/form8959Line21': `3045.00`,
      '/form8959Line22': `0.00`,
      '/form8959Line24': `0.00`,
    });
    expect(get(g, `/requiresForm8959`).get).toBe(true);
  });
  it(`Form 8960 net investment income tax`, () => {
    expectDollars(g, {
      '/form8960Line2': `20000.00`,
      '/form8960Line8': `20000.00`,
      '/form8960Line12': `20000.00`,
      '/form8960Line13': `230000.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line15': `30000.00`,
      '/form8960Line16': `20000.00`,
      '/form8960Line17': `760.00`,
      '/schedule2Line6NetInvestmentIncomeTax': `760.00`,
    });
    expect(get(g, `/requiresForm8960`).get).toBe(true);
  });
  it(`Form 1040 total tax, payments and amount owed`, () => {
    expectDollars(g, {
      '/line21OfSchedule2': `850.00`,
      '/totalTax': `43434.00`,
      '/totalPayments': `40000.00`,
      '/balanceDue': `3434.00`,
    });
    expect(get(g, `/requiresSchedule2`).get).toBe(true);
  });
  it(`nothing stops the return`, () => {
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expectNotStopped(g);
  });

  it(`boundary: married filing jointly with the same income, MAGI under $250,000: no NIIT, no Form 8960`, () => {
    // Standard deduction 32,200 [RP p. 18]; taxable income 197,800. QDCG [GI p. 38]: 5) 182,800  6) 98,900
    //   [RP p. 13]  9) 0  13) 613,700  17) 15,000  18) 2,250  22) tax on 182,800 [RP p. 10]: 11,600 + 22% x 82,000
    //   = 29,640  23) 31,890  24) tax on 197,800: 11,600 + 22% x 97,000 = 32,940  25) 31,890.
    // Form 8960: line 13 230,000, line 14 250,000 [1411 (b)(1)]: line 15 0, line 17 0. Form 8959: threshold
    //   $250,000 on a joint return [3101 (b)(2)(A)], line 7 0. Total tax 31,890; payments 40,000; refund 8,110.
    const m = graph(profileADividendsNiitMfj);
    expectDollars(m, {
      '/standardOrItemizedDeductions': `32200.00`,
      '/taxableIncome': `197800.00`,
      '/tentativeTaxFromTaxableIncome': `31890.00`,
      '/form8960Line13': `230000.00`,
      '/form8960Line14': `250000.00`,
      '/form8960Line15': `0.00`,
      '/form8960Line17': `0.00`,
      '/form8959Line7': `0.00`,
      '/totalTax': `31890.00`,
      '/overpayment': `8110.00`,
    });
    expect(get(m, `/requiresForm8960`).get).toBe(false);
    expectNotStopped(m);
  });

  it(`boundary: married filing separately at MAGI $125,001: line 15 $1, 3.8% = $0.04 rounds to $0`, () => {
    // W-2 $124,001, 1099-DIV box 1a = 1b $1,000. Standard deduction 16,100 [RP p. 18]; taxable income 108,901.
    // QDCG [GI p. 38]: 5) 107,901  6) 49,450 [RP p. 13]  9) 0  13) 306,850  17) 1,000  18) 150  22) tax on 107,901
    //   (Table 4) 17,966 + 24% x 2,201 = 18,494.24  23) 18,644.24  24) tax on 108,901: 18,734.24  25) 18,644.24,
    //   18,644 in whole dollars.
    // Form 8960: line 13 125,001; line 14 125,000 [1411 (b)(2)]; line 15 1; line 16 1; line 17 0.038, which rounds
    //   to 0. Form 8960 is still required (MAGI over the threshold).
    const m = graph(profileADividendsNiitMfs);
    expectDollars(m, {
      '/agi': `125001.00`,
      '/taxableIncome': `108901.00`,
      '/tentativeTaxFromTaxableIncome': `18644.00`,
      '/form8960Line13': `125001.00`,
      '/form8960Line14': `125000.00`,
      '/form8960Line15': `1.00`,
      '/form8960Line16': `1.00`,
      '/form8960Line17': `0.00`,
      '/totalTax': `18644.00`,
    });
    expect(get(m, `/requiresForm8960`).get).toBe(true);
    expectNotStopped(m);
  });

  it(`boundary: head of household uses the $200,000 threshold`, () => {
    // [1411 (b)(3)] "in any other case"; i8960 (2026) draft p. 3 "Single or Head of household is $200,000".
    const h = graph({
      ...profileADividendsNiit,
      '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    });
    expectDollars(h, { '/form8960Line14': `200000.00` });
  });
});

describe(`golden end-to-end scenario (synthetic data): profile B, Florida only`, () => {
  // Single Florida resident; W-2 box 1 $48,000, box 2 $4,000, no box 16/17; 1099-INT box 1 $600; 1099-DIV box 1a
  // $900, box 1b $400.
  // Form 1040: line 1a 48,000; line 2b 600; line 3a 400; line 3b 900; AGI 49,500; standard deduction 16,100
  //   [RP p. 18]; taxable income 33,400. Neither interest nor dividends is over $1,500: no Schedule B.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 33,400  2) 400  4) 400  5) 33,000  6) 49,450 [RP p. 13]  7) 33,400
  //   8) 33,000  9) 400 (taxed at 0%)  10) 400  11) 400  12) 0  18) 0  21) 0  22) tax on 33,000 by the Tax Table
  //   method [GI p. 36]: row 33,000-33,050, midpoint 33,025: 1,240 + 12% x 20,625 = 3,715  23) 3,715
  //   24) tax on 33,400: row 33,400-33,450, midpoint 33,425: 1,240 + 12% x 21,025 = 3,763  25) 3,715.
  // Total tax 3,715; withholding 4,000; refund 285. No AMT (AMTI 49,500 under the 90,100 exemption [RP p. 16]),
  //   no Form 8959 or 8960.
  // State [FL]: no Florida return; /stateReturnComputed false, and the state amounts stay undefined, not $0.
  const g = graph(profileBFloridaOnly);
  it(`Form 1040`, () => {
    expectDollars(g, {
      '/wages': `48000.00`,
      '/interestIncome': `600.00`,
      '/ordinaryDividends': `900.00`,
      '/qualifiedDividends': `400.00`,
      '/agi': `49500.00`,
      '/taxableIncome': `33400.00`,
      '/tentativeTaxFromTaxableIncome': `3715.00`,
      '/amt': `0.00`,
      '/form8959Line7': `0.00`,
      '/form8960Line17': `0.00`,
      '/totalTax': `3715.00`,
      '/totalPayments': `4000.00`,
      '/overpayment': `285.00`,
    });
    expect(get(g, `/requiresScheduleB`).get).toBe(false);
    expect(get(g, `/requiresSchedule2`).get).toBe(false);
  });
  it(`no state return: nothing computed, amounts undefined rather than $0, no PA-40 printed`, () => {
    expect(get(g, `/livedInFl`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    for (const p of [`/stateTaxLiability`, `/stateRefund`, `/stateAmountOwed`]) {
      expect(get(g, p).complete, p).toBe(false);
    }
    for (const form of [`PA40`, `PA40SP`]) {
      const when = pdfIncludeWhen(form);
      expect(when, form).toBeDefined();
      expect(get(g, when as string).get, `${form} includeWhen ${when}`).toBe(false);
    }
  });
  it(`shows the no-Florida-return note`, ({ task }) => {
    const givenFacts = makeGivenFacts(createFlowConfig(flowNodes));
    expect(
      givenFacts(g).atPath(
        `/flow/you-and-your-family/about-you/about-you-state-income-1099-misc-pfd`,
        primaryFilerId,
        task
      )
    ).toRouteNextTo(`/flow/you-and-your-family/about-you/state-breather-fl`);
  });
  it(`nothing stops the return`, () => {
    expect(get(g, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    expectNotStopped(g);
  });
  it(`negative row: state tax withheld in W-2 box 17 stops the return`, () => {
    const n = graph(profileBFloridaStateWithholding);
    expect(get(n, `/flowKnockoutFloridaStateWithholding`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutFloridaStateWithholding`);
    expect(get(n, `/flowIsKnockedOut`).get).toBe(true);
  });
});
