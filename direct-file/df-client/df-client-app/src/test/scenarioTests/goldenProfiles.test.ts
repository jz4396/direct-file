// Golden end-to-end scenarios (synthetic data), #135: profiles 5 and 7, profile A (dividends + NIIT), profile B
// (Florida only), profile C (PA to FL part-year resident with AMT and NIIT) and profile D (head of household, 65 or
// older, itemizing, with a qualifying child). The fixtures are in goldenProfiles.ts.
// Every expected figure below was worked by hand from the cited source, line by line.
//
// Sources (page = PDF page):
// [RP] Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
//      (SHA-256 e9ada115fb43a4af5ea326ca91edd40ab0bf29b9be01d2c13d7b8fa96214635b)
//      p. 11 §4.01 Table 3 (unmarried): "Over $12,400 but not over $50,400 $1,240 plus 12% of the excess over
//      $12,400"; "Over $50,400 but not over $105,700 $5,800 plus 22% of the excess over $50,400"; "Over $201,775 but
//      not over $256,225 $41,024 plus 32% of the excess over $201,775"; "Over $256,225 but not over $640,600 $58,448
//      plus 35% of the excess over $256,225"; "Over $640,600 $192,979.25 plus 37% of the excess over $640,600".
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
// [3102] IRC §3102(f)(1), https://www.law.cornell.edu/uscode/text/26/3102: "In the case of any tax imposed by
//      section 3101(b)(2), subsection (a) shall only apply to the extent to which the taxpayer receives wages from
//      the employer in excess of $200,000, and the employer may disregard the amount of wages received by such
//      taxpayer's spouse." So each W-2's box 6 is 1.45% of its box 5 plus 0.9% of that employer's box 5 over
//      $200,000, whatever the filing status; Form 8959 Part V credits the 0.9% part (line 24, 1040 line 25c).
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
//      on these lines) from Line 24, and enter the difference here." p. 32 PA Schedule B: PA-40 line 3 is
//      federal line 3b only without Schedule B adjustments; line 4 is "dividend income for a part-year resident
//      taxpayer during the period the taxpayer was a nonresident". p. 43: "As a nonresident, you do not pay PA
//      income tax on ordinary interest, ordinary dividends, and any gain you realize on the sale, exchange, or
//      disposition of intangible personal property, such as stocks and bonds."
// [SD] Schedule D (Form 1040) (2026) draft, https://www.irs.gov/pub/irs-dft/f1040sd--dft.pdf
//      (SHA-256 0df9af0711964b3198ea04bb0037b29d6afa85578a671553daed46251630b5f1) p. 2: line 15 "Net long-term
//      capital gain or (loss). Combine lines 8a through 14 in column (h)."; line 16 "Combine lines 7 and 15 and enter
//      the result"; line 17 "Are lines 15 and 16 both gains?"; line 20 "Are lines 18 and 19 both zero or blank and you
//      are not filing Form 4952?"
// [8960] Form 8960 (2026) draft, https://www.irs.gov/pub/irs-dft/f8960--dft.pdf
//      (SHA-256 2306f4f334a8b3b1ed73fd5045dec86eed194902923462bf485431c756f66982) p. 2: line 5a "Net gain or loss
//      from disposition of property"; line 8 "Total investment income"; line 12 "Net investment income"; line 15
//      "Subtract line 14 from line 13"; line 16 "Enter the smaller of line 12 or line 15"; line 17 "Multiply line 16
//      by 3.8% (0.038)." IRC §1411(c)(1)(A)(iii): "net gain (to the extent taken into account in computing taxable
//      income) attributable to the disposition of property".
// [55d] IRC §55(d), https://www.law.cornell.edu/uscode/text/26/55, as amended by Pub. L. 119-21 §70107 (taxable years
//      beginning after December 31, 2025): (d)(4)(A)(ii)(IV) substitutes "50 percent" for "25 percent" in the (d)(2)
//      exemption phaseout. [RP] p. 17 complete phaseout $680,200 = $500,000 + 2 x $90,100.
// [TRC] Tax Reform Code of 1971 §302 (72 P.S. §7302),
//      https://codes.findlaw.com/pa/title-72-ps-taxation-and-fiscal-affairs/pa-st-sect-72-7302/: (a) "a tax upon each
//      dollar of income received by that resident during that resident's taxable year at the rate of three and seven
//      hundredths per cent"; (b) a nonresident is taxed on "each of the classes of income hereinafter enumerated in
//      section 303 from sources within this Commonwealth".
// [PA43] [PA] p. 43, Compensation: "As a nonresident, you pay PA income tax on compensation for services you perform
//      in Pennsylvania. Your PA employer should report and withhold PA tax from the exact amount of your PA-taxable
//      compensation. If your employer does not report, or incorrectly reports, your PA-taxable compensation, you must
//      use PA Schedule NRH to apportion your compensation and any allowable employee business expenses." Also [PA]
//      p. 7: spouses "must file separate returns if: ... 2. Your taxable years begin on different dates for
//      part-year residents"; the spouse's residency isn't collected, so a joint part-year return stops. p. 17 LINE 5:
//      "Report your total net gains (losses) on PA Schedule D."
// [SSA] https://www.ssa.gov/employer/randomizationfaqs.html: "SSN randomization will not assign group number 00 or
//      serial number 0000. SSNs containing group number 00 or serial number 0000 will continue to be invalid."
// [EITC] Rev. Proc. 2025-32 p. 15 §4.06(1): "Completed Phaseout Amount (All other filing statuses)" with no qualifying
//      children "$19,540". IRC §32(m), https://www.law.cornell.edu/uscode/text/26/32: "a taxpayer identification
//      number means a social security number issued to an individual by the Social Security Administration". The
//      fixture SSNs other than profile C's are in the 900 area, which SSA never issues; the app reads them as neither
//      an SSN nor (with these group numbers) an ITIN, so EITC is $0 on those profiles. Profiles C and D use
//      444-00-4444 (group 00, never issued [SSA]), which the app reads as an SSN. Every childless profile's AGI is
//      above $19,540, so EITC is $0 on each. Only profile D has a child (444-00-0333, also group 00); its AGI is above
//      the one-child "Completed Phaseout Amount (All other filing statuses)" of "$51,593" ([RP] p. 15 §4.06(1)), so
//      its EITC is $0 too. The other profiles have no child, so their CTC is $0.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import fs from 'fs';
import path from 'path';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from '../functionalFlowTests/functionalFlowUtils.js';
import { mfjFilerData, mfsFilerData, primaryFilerId } from '../testData.js';
import {
  createAddressWrapper,
  createBooleanWrapper,
  createDayWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
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
  profileCFlW2,
  profileCPaToFlAmtNiit,
  profileCPaW2,
  profileCRows,
  profileCSaleId,
  profileDChildId,
  profileDHohItemizerChild,
  form8949Sale,
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
  it(`each allowlisted SSN has group 00 (never issued by SSA [SSA]) and a nonzero serial`, () => {
    for (const tin of GOLDEN_SSN_ALLOWLIST) {
      const [area, group, serial] = tin.split(`-`);
      expect(area, tin).toMatch(/^\d{3}$/);
      expect(group, tin).toBe(`00`);
      expect(serial, tin).toMatch(/^\d{4}$/);
      expect(serial, tin).not.toBe(`0000`);
    }
    expect(isGoldenTestTin(`123-45-6789`)).toBe(false);
    expect(isGoldenTestTin(`111-11-1111`)).toBe(false);
  });
  it(`every W-2 box 6 is 1.45% of box 5 plus the employer's 0.9% on box 5 over $200,000 [3102]`, () => {
    let checked = 0;
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const entries = facts as Record<string, { item?: unknown }>;
      for (const [p, wrapper] of Object.entries(entries)) {
        if (!p.endsWith(`/writableMedicareWages`)) continue;
        const box5 = Number((wrapper.item as string | number).toString());
        const box6Wrapper = entries[p.replace(`/writableMedicareWages`, `/writableMedicareWithholding`)];
        expect(box6Wrapper, `${name} ${p}`).toBeDefined();
        const box6 = Number((box6Wrapper.item as string | number).toString());
        // Rounded to the dollar, or to the cent (profile D's box 6 is $1,812.50).
        const exact = 0.0145 * box5 + 0.009 * Math.max(0, box5 - 200000);
        expect([Math.round(exact), Math.round(100 * exact) / 100], `${name} ${p}`).toContain(box6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it(`the 900-area TINs are neither an SSN nor an ITIN to the app; no profile gets EITC, and only profile D gets CTC`, () => {
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const g = graph(facts);
      const groupZero = name.startsWith(`profileC`) || name.startsWith(`profileD`);
      const hasChild = name.startsWith(`profileD`);
      expect(get(g, `/primaryFiler/tin/isSSN`).get, name).toBe(groupZero);
      expect(get(g, `/primaryFiler/tin/isITIN`).get, name).toBe(false);
      expect(get(g, `/earnedIncomeCredit`).get.toString(), name).toBe(`0.00`);
      if (hasChild) continue; // profile D's child tax credit and EITC are checked in its own block below
      expect(get(g, `/eitcQualified`).get, name).toBe(false);
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
  // Single Florida resident; W-2 box 1 and box 5 $210,000, box 2 $40,000, box 6 $3,135 [3102]; 1099-DIV box 1a $20,000,
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
  // Form 8959 [3101]: line 1 210,000; threshold 200,000; line 6 10,000; line 7 0.9% = 90. Part V: line 19 3,135;
  //   line 21 1.45% x 210,000 = 3,045; line 22 90; line 24 90 (1040 line 25c) [3102].
  // Form 8960 [1411]: line 2 dividends 20,000 = line 8 = line 12; line 13 MAGI 230,000; line 14 200,000; line 15
  //   30,000; line 16 smaller of line 12 or 15 = 20,000; line 17 3.8% = 760 (Schedule 2 line 12).
  // Form 1040: Schedule 2 line 21 760 + 90 = 850; line 24 total tax 42,584 + 850 = 43,434; line 33 payments
  //   40,000 + 90 = 40,090; amount owed 3,344.
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
      '/form8959Line19': `3135.00`,
      '/form8959Line21': `3045.00`,
      '/form8959Line22': `90.00`,
      '/form8959Line24': `90.00`,
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
      '/otherFormWithholding': `90.00`,
      '/totalPayments': `40090.00`,
      '/balanceDue': `3344.00`,
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
    //   $250,000 on a joint return [3101 (b)(2)(A)], line 7 0, but the employer withheld 0.9% on its wages over
    //   $200,000 [3102] whatever the filing status: line 24 90. Total tax 31,890; payments 40,090; refund 8,200.
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
      '/form8959Line24': `90.00`,
      '/totalTax': `31890.00`,
      '/totalPayments': `40090.00`,
      '/overpayment': `8200.00`,
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

describe(`golden end-to-end scenario (synthetic data): profile C, PA to FL part-year resident with AMT and NIIT`, () => {
  // Single; moved from Pennsylvania to Florida on July 1, 2026 (the first day in Florida); SSN 444-00-4444 (group 00
  //   [SSA]).
  // W-2 #1 (PA job): box 1, box 5 and box 16 $150,000, box 2 $30,000, box 6 $2,175 (1.45% only [3102]), box 17 $4,700.
  // W-2 #2 (FL job): box 1 and box 5 $100,000, box 2 $20,000, box 6 $1,450 (1.45% only [3102]), no box 16/17, $0
  //   earned while a PA resident.
  // Form 8949 box D: acquired 2020-03-02, sold 2026-09-15 (FL period), proceeds $450,000, basis $100,000, gain
  //   $350,000. No 1099-INT or 1099-DIV.
  // Form 1040: line 1a 250,000; Schedule D [SD] lines 15 and 16 350,000, lines 18 and 19 0, so line 20 is Yes and
  //   line 16 tax uses the QDCG worksheet; line 7a 350,000; line 9 and line 11 (AGI) 600,000; line 12 standard
  //   deduction 16,100 [RP p. 18]; line 15 taxable income 583,900.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 583,900  2) 0  3) 350,000  4) 350,000  5) 233,900  6) 49,450 [RP p. 13]
  //   7) 49,450  8) 49,450  9) 0  10) 350,000  11) 0  12) 350,000  13) 545,500 [RP p. 13]  14) 545,500  15) 233,900
  //   16) 311,600  17) 311,600  18) 15% = 46,740  19) 311,600  20) 38,400  21) 20% = 7,680
  //   22) tax on 233,900 [RP p. 11]: 41,024 + 32% x 32,125 = 51,304  23) 105,724
  //   24) tax on 583,900 [RP p. 11]: 58,448 + 35% x 327,675 = 173,134.25  25) smaller = 105,724.
  // Form 6251 [6251]: line 2a 16,100 added back; line 4 AMTI 600,000; line 5: exemption 90,100 [RP p. 16] less 50% x
  //   (600,000 - 500,000 [RP p. 17]) = 50,000 [55d], so 40,100; line 6 559,900. Part III: 12) 559,900  13) 350,000
  //   17) 209,900  18) 26% x 209,900 = 54,574 (209,900 <= 244,500 [RP p. 16])  19) 49,450  20) 233,900  21) 0
  //   22) 350,000  23) 0  24) 350,000  25) 545,500  27) 233,900  28) 233,900  29) 311,600  30) 311,600
  //   31) 15% = 46,740  32) 311,600  33) 38,400  34) 20% = 7,680  38) 54,574 + 46,740 + 7,680 = 108,994
  //   39) 28% x 559,900 - 4,890 = 151,882 [55]  40) 108,994 = line 7 = line 9; line 10 regular tax 105,724;
  //   line 11 AMT 108,994 - 105,724 = 3,270.
  //   Control (not run; the rate is in the dictionary): with the pre-2026 25% phaseout, line 5 = 90,100 - 25,000 =
  //   65,100, line 17 184,900, line 18 48,074, line 38 102,494 < 105,724, so AMT would be 0. AMT > 0 here shows the
  //   50% rate [55d] is applied.
  // Form 8959 [3101]: line 1 150,000 + 100,000 = 250,000; threshold 200,000; line 6 50,000; line 7 0.9% = 450.
  //   Part V: line 19 2,175 + 1,450 = 3,625; line 21 1.45% x 250,000 = 3,625; line 22 0; line 24 0. Neither employer
  //   paid over $200,000, so neither withheld the 0.9% [3102].
  // Form 8960 [8960] [1411]: line 5a 350,000 (§1411(c)(1)(A)(iii) net gain) = line 8 = line 12; line 13 MAGI 600,000;
  //   line 14 200,000; line 15 400,000; line 16 350,000; line 17 3.8% = 13,300.
  // Form 1040: line 17 3,270; Schedule 2 line 21 13,300 + 450 = 13,750; line 24 total tax 105,724 + 3,270 + 13,750 =
  //   122,744; line 33 payments 30,000 + 20,000 = 50,000; amount owed 72,744.
  // PA-40 [PA] [TRC]: oval (P) part-year resident [PA p. 6]. Line 1a = PA W-2 box 16 150,000 + FL W-2 PA-period share 0
  //   [PA p. 10]. Line 5 0: the sale is in the FL period and a nonresident is not taxed on gains from intangible
  //   property [PA p. 43]. Lines 9 and 11 150,000 (no standard deduction). Line 12 3.07% x 150,000 = 4,605.00.
  //   Line 13 and line 24 4,700. Line 29 overpayment 95.00. No PA Schedule D (no PA-period sale). FL: no return [FL].
  const g = graph(profileCPaToFlAmtNiit);
  it(`Form 1040 income, Schedule D, deduction and line 16 tax (QDCG worksheet)`, () => {
    expectDollars(g, {
      '/wages': `250000.00`,
      '/scheduleDLine15': `350000.00`,
      '/scheduleDLine16': `350000.00`,
      '/capitalGainsOrLossesFor1040': `350000.00`,
      '/totalIncome': `600000.00`,
      '/agi': `600000.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `583900.00`,
      '/qdcgLine1': `583900.00`,
      '/qdcgLine2': `0.00`,
      '/qdcgLine3': `350000.00`,
      '/qdcgLine4': `350000.00`,
      '/qdcgLine5': `233900.00`,
      '/qdcgLine6': `49450.00`,
      '/qdcgLine9': `0.00`,
      '/qdcgLine13': `545500.00`,
      '/qdcgLine16': `311600.00`,
      '/qdcgLine17': `311600.00`,
      '/qdcgLine18': `46740.00`,
      '/qdcgLine20': `38400.00`,
      '/qdcgLine21': `7680.00`,
      '/qdcgLine22': `51304.00`,
      '/qdcgLine23': `105724.00`,
      '/qdcgLine24': `173134.00`,
      '/qdcgLine25': `105724.00`,
      '/tentativeTaxFromTaxableIncome': `105724.00`,
    });
    // Line 20 Yes needs lines 18 and 19 to be zero: the 28% and unrecaptured §1250 inputs are complete and false.
    for (const p of [`/flowKnockoutCollectibles`, `/flowKnockoutUnrecaptured1250Gain`]) {
      expect(get(g, p).complete, p).toBe(true);
      expect(get(g, p).get, p).toBe(false);
    }
  });
  it(`Form 6251 AMT inside the exemption phaseout (50% rate)`, () => {
    expectDollars(g, {
      '/form6251Line2a': `16100.00`,
      '/form6251Line4': `600000.00`,
      '/form6251Line5': `40100.00`,
      '/form6251Line6': `559900.00`,
      '/form6251Line12': `559900.00`,
      '/form6251Line13': `350000.00`,
      '/form6251Line17': `209900.00`,
      '/form6251Line18': `54574.00`,
      '/form6251Line19': `49450.00`,
      '/form6251Line20': `233900.00`,
      '/form6251Line21': `0.00`,
      '/form6251Line22': `350000.00`,
      '/form6251Line24': `350000.00`,
      '/form6251Line25': `545500.00`,
      '/form6251Line27': `233900.00`,
      '/form6251Line28': `233900.00`,
      '/form6251Line29': `311600.00`,
      '/form6251Line30': `311600.00`,
      '/form6251Line31': `46740.00`,
      '/form6251Line32': `311600.00`,
      '/form6251Line33': `38400.00`,
      '/form6251Line34': `7680.00`,
      '/form6251Line38': `108994.00`,
      '/form6251Line39': `151882.00`,
      '/form6251Line40': `108994.00`,
      '/form6251Line7': `108994.00`,
      '/form6251Line9': `108994.00`,
      '/form6251Line10': `105724.00`,
      '/amt': `3270.00`,
    });
    expect(get(g, `/form6251Required`).get).toBe(true);
  });
  it(`Form 8959 Additional Medicare Tax, with no 0.9% withheld by either employer`, () => {
    expectDollars(g, {
      '/form8959Line1': `250000.00`,
      '/form8959Line6': `50000.00`,
      '/form8959Line7': `450.00`,
      '/form8959Line19': `3625.00`,
      '/form8959Line21': `3625.00`,
      '/form8959Line22': `0.00`,
      '/form8959Line24': `0.00`,
    });
  });
  it(`Form 8960 net investment income tax on the gain`, () => {
    expectDollars(g, {
      '/form8960Line5a': `350000.00`,
      '/form8960Line8': `350000.00`,
      '/form8960Line12': `350000.00`,
      '/form8960Line13': `600000.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line15': `400000.00`,
      '/form8960Line16': `350000.00`,
      '/form8960Line17': `13300.00`,
    });
    expect(get(g, `/requiresForm8960`).get).toBe(true);
  });
  it(`Form 1040 total tax, payments and amount owed`, () => {
    expectDollars(g, {
      '/totalAdditionalTaxesOwed': `3270.00`,
      '/line21OfSchedule2': `13750.00`,
      '/totalTax': `122744.00`,
      '/totalWithholding': `50000.00`,
      '/totalPayments': `50000.00`,
      '/balanceDue': `72744.00`,
    });
  });
  it(`PA-40 part-year return leaves out the FL-period gain`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(true);
    expect(get(g, `/form8949Transactions/#${profileCSaleId}/paSoldWhilePaResident` as string).get).toBe(false);
    expectDollars(g, {
      '/paLine1a': `150000.00`,
      '/paLine5': `0.00`,
      '/paLine9': `150000.00`,
      '/paLine10': `0.00`,
      '/paLine11': `150000.00`,
      '/paLine12': `4605.00`,
      '/paLine13': `4700.00`,
      '/paLine24': `4700.00`,
      '/paLine29': `95.00`,
      '/stateRefund': `95.00`,
    });
  });
  it(`files: every PA, AMT and state knockout is complete and false, and nothing blocks submission`, () => {
    for (const p of PROFILE_C_KNOCKOUTS) {
      expect(get(g, p).complete, p).toBe(true);
      expect(get(g, p).get, p).toBe(false);
    }
    expectNotStopped(g);
  });

  it(`row C-hi: proceeds $1,100,000 (gain $1,000,000), over the AMT complete phaseout`, () => {
    // AGI 1,250,000; taxable income 1,233,900. QDCG [GI p. 38]: 5) 233,900  18) 15% x 311,600 = 46,740
    //   20) 1,000,000 - 311,600 = 688,400  21) 20% = 137,680  22) 51,304 (as above)  23) 235,724; 24) tax on
    //   1,233,900: 192,979.25 + 37% x 593,300 = 412,500.25; line 16 235,724.
    // Form 6251: line 4 1,250,000 is over the $680,200 complete phaseout [RP p. 17], line 5 0, line 6 1,250,000;
    //   17) 250,000  18) 28% x 250,000 - 4,890 = 65,110  38) 65,110 + 46,740 + 137,680 = 249,530  39) 28% x 1,250,000
    //   - 4,890 = 345,110  40) 249,530; AMT 249,530 - 235,724 = 13,806.
    // Form 8960: line 12 1,000,000; line 15 1,250,000 - 200,000 = 1,050,000; line 16 1,000,000; line 17 38,000.
    // Total tax 235,724 + 13,806 + 38,000 + 450 = 287,980; payments 50,000; owed 237,980. PA-40 unchanged.
    const h = graph({
      ...profileCPaToFlAmtNiit,
      ...form8949Sale(profileCSaleId, `2020-03-02`, `2026-09-15`, 1100000, 100000),
    });
    expectDollars(h, {
      '/agi': `1250000.00`,
      '/tentativeTaxFromTaxableIncome': `235724.00`,
      '/form6251Line5': `0.00`,
      '/form6251Line40': `249530.00`,
      '/amt': `13806.00`,
      '/form8959Line7': `450.00`,
      '/form8960Line17': `38000.00`,
      '/totalTax': `287980.00`,
      '/balanceDue': `237980.00`,
      '/paLine12': `4605.00`,
      '/paLine29': `95.00`,
    });
    expectNotStopped(h);
  });
});

// Every knockout a PA to FL part-year return with a sale and AMT can reach (each has <BlockSubmissionOnTrue />).
const PROFILE_C_KNOCKOUTS = [
  `/flowKnockoutPaPartYear`,
  `/flowKnockoutPaScheduleA`,
  `/flowKnockoutPaScheduleB`,
  `/flowKnockoutPaScheduleD`,
  `/flowKnockoutPaDividends`,
  `/flowKnockoutPaNonresidentPaSourcePay`,
  `/flowKnockoutAmtMfsAddBack`,
  `/flowKnockoutAmtPreferenceItems`,
  `/flowKnockoutStateReturn`,
];

describe(`golden end-to-end scenario (synthetic data): profile D, head of household, 65+, itemizing, one child`, () => {
  // Head of household, Florida resident [FL]; filer born 1960-03-15 (66 on December 31, 2026), SSN 444-00-4444;
  //   daughter born 2010-05-01 (16 at year end), SSN 444-00-0333, lived in the home 12 months; both group 00 [SSA].
  // W-2: box 1, box 3 and box 5 $125,000, box 2 $14,000, box 4 $7,750 (6.2%, IRC §3101(a)), box 6 $1,812.50 (1.45%
  //   only; under $200,000 [3102]), no box 12. 1099-INT box 1 $1,000.
  // Schedule A inputs: real estate tax $41,500, personal property tax $500, mortgage interest (Form 1098) $15,000,
  //   cash gifts $3,000. No state income tax (Florida), no medical expenses.
  // Form 1040: line 1a/1z 125,000; line 2b 1,000; line 9 126,000; line 11a/11b (AGI) 126,000.
  // Schedule 1-A, senior deduction, IRC §151(d)(5)(C) (https://www.law.cornell.edu/uscode/text/26/151): (i) "a
  //   deduction in an amount equal to $6,000 for each qualified individual"; (iii)(I) "the $6,000 amount in clause (i)
  //   shall be reduced (but not below zero) by 6 percent of so much of the taxpayer's modified adjusted gross income
  //   as exceeds $75,000 ($150,000 in the case of a joint return)". 2026 draft Schedule 1-A
  //   (https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf,
  //   SHA-256 e22aec7feb2f5b734e16ee74d70acfdfdc0d66a5292f69cf0ced3b87543d95ac):
  //   line 37 "Enter the amount from line 3" (MAGI 126,000); line 38 "Enter $75,000 ($150,000 if married filing
  //   jointly)"; line 39 51,000; line 40 "Multiply line 39 by 6% (0.06)" = 3,060; line 41 "Subtract line 40 from
  //   $6,000" = 2,940; line 42a "If you have a valid social security number (see instructions) and were born before
  //   January 2, 1962" = 2,940; lines 43 and 44 2,940; line 44 "Enter here and on Form 1040 ... line 13a".
  // Schedule A (2026 draft, https://www.irs.gov/pub/irs-dft/f1040sa--dft.pdf, SHA-256
  //   d49acff9afc2faa178b7bf1f70d826d03c2c6def43700880f8ae5bb8bb5a0ffa): line 5a 0; 5b 41,500; 5c 500; 5d
  //   42,000; 5e "Enter the smaller of line 5d or $40,400 ($20,200 if married filing separately)" = 40,400 (AGI is
  //   under the $505,000 phase-down threshold); IRC §164(b)(7)(A)(ii)
  //   (https://www.law.cornell.edu/uscode/text/26/164):
  //   "in the case of any taxable year beginning in calendar year 2026, $40,400"; line 7 "Add lines 5e and 6" =
  //   40,400. Lines 8a, 8e, 10: 15,000.
  //   Line 11 3,000; IRC §170(b)(1)(I) (https://www.law.cornell.edu/uscode/text/26/170): "only to the extent that the
  //   aggregate of such contributions exceeds 0.5 percent of the taxpayer's contribution base": 0.5% x 126,000 = 630,
  //   so lines 13 and 15 are 2,370. Line 18 = 40,400 + 15,000 + 2,370 = 57,770 -> Form 1040 line 12e. The standard
  //   deduction would be $24,150 [RP p. 18 §4.14(1) "Heads of Households (§ 1(j)(2)(B)) $24,150"] plus $2,050 [RP
  //   p. 18 §4.14(3) "increased to $2,050 if the individual is also unmarried and not a surviving spouse"] = 26,200,
  //   less than 57,770, so the filer itemizes.
  // Form 1040: line 14 57,770 + 2,940 = 60,710; line 15 126,000 - 60,710 = 65,290.
  // Line 16: Tax Table [GI p. 36]; row "65,250 65,300" ([GI] p. 75), midpoint 65,275 with [RP] p. 10 §4.01 Table 2
  //   (Heads of Households): "Over $17,700 but not over $67,450 $1,770 plus 12% of the excess over $17,700":
  //   1,770 + 12% x 47,575 = 7,479.
  // Form 6251 [6251]: line 1a "Subtract Schedule 1-A (Form 1040), line 43, from Form 1040 ... line 14" = 60,710 -
  //   2,940 = 57,770; line 1b "Subtract line 1a from Form 1040 ... line 11b" = 68,230; line 2a "If filing Schedule A
  //   (Form 1040), enter the taxes from Schedule A, line 7" = 40,400; line 4 108,630; line 5 exemption 90,100 [RP p. 16
  //   §4.10 "Unmarried Individuals (other than Surviving Spouses) $90,100"] (AMTI under the $500,000 threshold [RP
  //   p. 17]); line 6 18,530; line 7 26% x 18,530 = 4,817.80 -> 4,818 (18,530 <= 244,500); line 9 4,818; line 10
  //   regular tax 7,479; line 11 AMT 0.
  // Schedule 8812: one qualifying child under 17 with an SSN, [RP] p. 14 §4.05(1): "the maximum amount of the credit
  //   allowed under § 24(a) is $2,200"; IRC §24(h)(3) (https://www.law.cornell.edu/uscode/text/26/24): "the
  //   threshold amount shall be $400,000 in the case of a joint return ($200,000 in any other case)"; AGI is under
  //   $200,000, so 2,200 -> Form 1040 line 19.
  // Form 1040: line 22 7,479 - 2,200 = 5,279; line 24a 5,279 (no Schedule 2 taxes); line 25a 14,000; line 33 14,000;
  //   line 34 and line 35a overpayment 8,721.
  // EIC 0 (AGI over $51,593 [EITC]). Form 8959 is not required: box 5 125,000 is under the $200,000 threshold [3101].
  //   Form 8960 is not required: MAGI 126,000 is under the $200,000 head-of-household threshold [1411].
  // The filer is 65 or older, so the PDF package would print the Form 1040-SR template, which is still the 2024 one
  //   (Ty2026PdfPackageTest EXCLUDED); these rows check the computed values only.
  const g = graph(profileDHohItemizerChild);
  it(`Form 1040 income and Schedule 1-A senior deduction`, () => {
    expect(get(g, `/filingStatus`).get.toString()).toBe(`headOfHousehold`);
    expectDollars(g, {
      '/wages': `125000.00`,
      '/interestIncome': `1000.00`,
      '/totalIncome': `126000.00`,
      '/agi': `126000.00`,
      '/schedule1ALine38': `75000.00`,
      '/schedule1ALine39': `51000.00`,
      '/schedule1ALine40': `3060.00`,
      '/schedule1ALine41': `2940.00`,
      '/schedule1ALine42a': `2940.00`,
      '/schedule1ALine43': `2940.00`,
      '/schedule1ALine44': `2940.00`,
    });
  });
  it(`Schedule A: SALT cap, mortgage interest and the 0.5% charitable floor`, () => {
    expectDollars(g, {
      '/scheduleAStateLocalIncomeOrSalesTax': `0.00`,
      '/scheduleARealEstateTaxes': `41500.00`,
      '/scheduleAPersonalPropertyTaxes': `500.00`,
      '/scheduleALine5d': `42000.00`,
      '/scheduleALine5e': `40400.00`,
      '/scheduleAMortgageInterest': `15000.00`,
      '/scheduleACashGifts': `3000.00`,
      '/scheduleALine13': `2370.00`,
      '/scheduleALine18': `57770.00`,
      '/standardOrItemizedDeductions': `57770.00`,
    });
  });
  it(`Form 1040 deductions, taxable income and line 16 tax (Tax Table)`, () => {
    expectDollars(g, {
      '/totalDeductions': `60710.00`,
      '/taxableIncome': `65290.00`,
      '/tentativeTaxFromTaxableIncome': `7479.00`,
    });
  });
  it(`Form 6251: no AMT`, () => {
    expectDollars(g, {
      '/form6251Line1a': `57770.00`,
      '/form6251Line1b': `68230.00`,
      '/form6251Line2a': `40400.00`,
      '/form6251Line4': `108630.00`,
      '/form6251Line5': `90100.00`,
      '/form6251Line6': `18530.00`,
      '/form6251Line7': `4818.00`,
      '/form6251Line10': `7479.00`,
      '/amt': `0.00`,
    });
  });
  it(`child tax credit, total tax, payments and refund; no EIC, Form 8959 or Form 8960`, () => {
    expect(get(g, `/familyAndHousehold/#${profileDChildId}/tin/isSSN` as string).get).toBe(true);
    expectDollars(g, {
      '/totalCtc': `2200.00`,
      '/totalCtcAndOdc': `2200.00`,
      '/taxLessNonRefundableCredits': `5279.00`,
      '/line21OfSchedule2': `0.00`,
      '/totalTax': `5279.00`,
      '/formW2Withholding': `14000.00`,
      '/totalPayments': `14000.00`,
      '/overpayment': `8721.00`,
      '/earnedIncomeCredit': `0.00`,
    });
    expect(get(g, `/requiresForm8959`).get).toBe(false);
    expect(get(g, `/requiresForm8960`).get).toBe(false);
  });
  it(`Florida resident: no state return; nothing stops the return`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expectNotStopped(g);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile C negative rows (each stops the return)`, () => {
  const stops = (facts: Record<string, unknown>, knockout: string, viaStateReturn = true) => {
    const n = graph(facts);
    expect(submissionBlockingFacts).toContain(knockout);
    expect(get(n, knockout).complete, knockout).toBe(true);
    expect(get(n, knockout).get, knockout).toBe(true);
    if (viaStateReturn) expect(get(n, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).complete).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).get).toBe(true);
    return n;
  };
  const sale = (sold: string) => form8949Sale(profileCSaleId, `2020-03-02`, sold, 450000, 100000);

  it(`a sale dated before the move (PA period) needs PA Schedule D [PA43]`, () => {
    const n = stops({ ...profileCPaToFlAmtNiit, ...sale(`2026-06-30`) }, `/flowKnockoutPaScheduleD`);
    expect(get(n, `/form8949Transactions/#${profileCSaleId}/paSoldWhilePaResident` as string).get).toBe(true);
  });
  it(`boundary: PA to FL, a sale on the move date is in the FL period (no PA knockout)`, () => {
    const n = graph({ ...profileCPaToFlAmtNiit, ...sale(`2026-07-01`) });
    expect(get(n, `/form8949Transactions/#${profileCSaleId}/paSoldWhilePaResident` as string).get).toBe(false);
    expectDollars(n, { '/paLine5': `0.00`, '/paLine12': `4605.00` });
    for (const p of PROFILE_C_KNOCKOUTS) expect(get(n, p).get, p).toBe(false);
    expectNotStopped(n);
  });
  it(`boundary: FL to PA, a sale on the move date is in the PA period (PA Schedule D)`, () => {
    const n = stops(
      {
        ...profileCPaToFlAmtNiit,
        '/address': createAddressWrapper(`123 Example St`, `Harrisburg`, `17101`, `PA`),
        '/paPartYearMove': createEnumWrapper(`flToPa`, `/paPartYearMoveOptions`),
        '/paSchoolDistrictCode': createStringWrapper(`22275`),
        ...sale(`2026-07-01`),
      },
      `/flowKnockoutPaScheduleD`
    );
    expect(get(n, `/form8949Transactions/#${profileCSaleId}/paSoldWhilePaResident` as string).get).toBe(true);
  });
  it(`any 1099-INT on a part-year return needs PA Schedule A`, () => {
    stops(
      {
        ...profileCPaToFlAmtNiit,
        ...profileCRows.interest(`13500000-0000-4000-8000-000000000c11`, `Example Bank`, 100),
      },
      `/flowKnockoutPaScheduleA`
    );
  });
  it(`any 1099-DIV on a part-year return needs PA Schedule B`, () => {
    const n = stops(
      {
        ...profileCPaToFlAmtNiit,
        ...profileCRows.qualifiedDividends(`13500000-0000-4000-8000-000000000c12`, `Example Fund`, 100, 100),
      },
      `/flowKnockoutPaScheduleB`
    );
    expect(get(n, `/flowKnockoutPaDividends`).get).toBe(true);
  });
  it(`a joint part-year return [PA p. 7]`, () => {
    stops(
      {
        ...profileCPaToFlAmtNiit,
        ...mfjFilerData,
        ...profileCRows.spouse(),
        [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1979-09-12`),
      },
      `/flowKnockoutPaPartYear`
    );
  });
  it(`a FL W-2 with state tax withheld in box 17 [FL]`, () => {
    stops(
      { ...profileCPaToFlAmtNiit, ...profileCRows.w2s(profileCPaW2, { ...profileCFlW2, box16: 100000, box17: 100 }) },
      `/flowKnockoutPaPartYear`
    );
  });
  it(`yes to PA-source pay while living in FL needs PA Schedule NRH [PA43]`, () => {
    stops(
      { ...profileCPaToFlAmtNiit, '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(true) },
      `/flowKnockoutPaNonresidentPaSourcePay`
    );
  });
  it(`the PA-source pay question is complete and false when it doesn't apply`, () => {
    // Full-year PA resident, Florida only, and a part-year return that answered no.
    for (const [name, facts] of Object.entries({ profile7PaFullYear, profile5AmtAnd8959, profile7PaToFlPartYear })) {
      const r = get(graph(facts), `/flowKnockoutPaNonresidentPaSourcePay`);
      expect(r.complete, name).toBe(true);
      expect(r.get, name).toBe(false);
    }
  });
  const mfs = (gain: number) => ({
    ...profileCPaToFlAmtNiit,
    ...mfsFilerData,
    ...profileCRows.spouse(),
    '/MFSLivingSpouseFilingReturn': createBooleanWrapper(true),
    '/MFSSpouseFilingReturn': createBooleanWrapper(true),
    '/MFSSpouseHasNRTIN': createBooleanWrapper(false),
    '/spouseItemizes': createBooleanWrapper(false),
    '/MFSSpouse65OrOlder': createBooleanWrapper(false),
    '/MFSSpouseHasGrossIncome': createBooleanWrapper(false),
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1979-09-12`),
    ...form8949Sale(profileCSaleId, `2020-03-02`, `2026-09-15`, 100000 + gain, 100000),
  });
  it(`married filing separately with AMTI over $640,200 (§55(d)(2) add-back not supported) [RP p. 17]`, () => {
    // AMTI = wages 250,000 + gain 400,000 = 650,000 > 640,200.
    const n = stops(mfs(400000), `/flowKnockoutAmtMfsAddBack`, false);
    expectDollars(n, { '/form6251Line4': `650000.00` });
  });
  it(`boundary: married filing separately with AMTI of exactly $640,200 does not stop on the add-back`, () => {
    const n = graph(mfs(390200));
    expectDollars(n, { '/form6251Line4': `640200.00` });
    expect(get(n, `/flowKnockoutAmtMfsAddBack`).complete).toBe(true);
    expect(get(n, `/flowKnockoutAmtMfsAddBack`).get).toBe(false);
  });
  it(`AMT adjustments or preference items (ISOs, private activity bond interest, AMT basis)`, () => {
    stops(
      { ...profileCPaToFlAmtNiit, '/hasAmtPreferenceItems': createBooleanWrapper(true) },
      `/flowKnockoutAmtPreferenceItems`,
      false
    );
  });

  it(`flow: yes to the PA-source pay question routes to its knockout screen`, ({ task }) => {
    const givenFacts = makeGivenFacts(createFlowConfig(flowNodes));
    const at = `/flow/your-taxes/amount/pa-part-year-nonresident-pa-pay`;
    const yes = graph({ ...profileCPaToFlAmtNiit, '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(true) });
    expect(givenFacts(yes).atPath(at, null, task)).toRouteNextTo(`${at}-knockout`);
    expect(givenFacts(graph(profileCPaToFlAmtNiit)).atPath(at, null, task)).not.toRouteNextTo(`${at}-knockout`);
  });
});
