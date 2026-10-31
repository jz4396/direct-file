// Golden end-to-end scenarios (synthetic data), #135: profiles 5 and 7, profile A (dividends + NIIT), profile B
// (Florida only), profile C (PA to FL part-year resident with AMT and NIIT), profile D (head of household, 65 or
// older, itemizing, with a qualifying child), profile E (PA to FL part-year resident with AMT and dividends),
// profile F (full-year Pennsylvania resident, head of household, with AMT and Schedule C), profile G (married
// filing jointly, Florida, two qualifying children: Schedule 8812, Form 2441 and the EITC), profile H
// (full-year Pennsylvania resident, Schedule E Part I residential rental, and dividends), and profile I
// (married filing jointly, Florida, wages, standard deduction, AMTI inside the exemption phaseout).
// The fixtures are in goldenProfiles.ts.
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
//      fixture SSNs other than profiles C, D, F, and G are in the 900 area, which SSA never issues; the app reads them
//      as neither an SSN nor (with these group numbers) an ITIN, so EITC is $0 on those profiles. Profile H uses
//      900-46-1009 (group 46, outside the ITIN ranges). Profiles C and D use
//      444-00-4444 (group 00, never issued [SSA]), which the app reads as an SSN. Profile F uses 444-00-1007 and the
//      child uses 444-00-1008, also group 00. Profile G uses 444-00-2001 through 444-00-2004, also group 00. Every
//      childless profile's AGI is above $19,540, so EITC is $0 on each. Profile D's AGI is above the one-child
//      "Completed Phaseout Amount (All other filing statuses)" of "$51,593" ([RP] p. 15 §4.06(1)), and profile F's AGI
//      is above that amount too, so EITC is $0 on both. Profile G is under the two-child joint completed phaseout and
//      its EITC is computed in that block. The other profiles have no child, so their CTC is $0. Profile F's child tax
//      credit is reduced by the §24(b) phaseout.
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
  createDollarWrapper,
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
  profileEDividendId,
  profileEPaToFlAmtDividends,
  profileESaleId,
  profileFBusinessId,
  profileFChildId,
  profileFPaAmtScheduleC,
  profileGChild1Id,
  profileGChild2Id,
  profileGMfjTwoChildren,
  profileGPrimaryW2,
  profileGSpouseW2,
  profileGWithW2s,
  profileHDividendId,
  profileHPaRentalDividends,
  profileIMfjAmtPhaseout,
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
  it(`the 900-area TINs are neither an SSN nor an ITIN to the app; only profile G gets EITC, and only profiles D, F, and G get CTC`, () => {
    for (const [name, facts] of Object.entries(goldenProfiles)) {
      const g = graph(facts);
      const groupZero =
        name.startsWith(`profileC`) ||
        name.startsWith(`profileD`) ||
        name.startsWith(`profileF`) ||
        name.startsWith(`profileG`);
      const hasChild = name.startsWith(`profileD`) || name.startsWith(`profileF`) || name.startsWith(`profileG`);
      expect(get(g, `/primaryFiler/tin/isSSN`).get, name).toBe(groupZero);
      expect(get(g, `/primaryFiler/tin/isITIN`).get, name).toBe(false);
      if (name.startsWith(`profileG`)) {
        expect(get(g, `/earnedIncomeCredit`).get.toString(), name).not.toBe(`0.00`);
        continue; // profile G checks the child tax credit, Form 2441 and the EITC in its own block
      }
      expect(get(g, `/earnedIncomeCredit`).get.toString(), name).toBe(`0.00`);
      if (hasChild) continue; // profiles D and F check the child tax credit and EITC in their own blocks below
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
  // The filer is 65 or older; the package prints the 2026 Form 1040, which anyone may file (Instructions for Form 1040
  //   (2025) [GI] p. 12, "Everyone can file Form 1040."). These rows check the computed values only.
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

describe(`golden end-to-end scenario (synthetic data): profile E, PA to FL part-year with AMT and dividends`, () => {
  // Single; moved from Pennsylvania to Florida on July 1, 2026; SSN 900-45-1006 (900 area, group 45, outside the ITIN
  //   ranges). Same wages and FL-period sale as profile C, plus Form 1099-DIV box 1a = box 1b $2,000, all received
  //   while a PA resident (/paPartYearResidentDividends $2,000, so PA Schedule B line 4 is $0).
  // W-2 #1 (PA): box 1, box 5 and box 16 $150,000, box 2 $30,000, box 6 $2,175 [3102], box 17 $4,700.
  // W-2 #2 (FL): box 1 and box 5 $100,000, box 2 $20,000, box 6 $1,450 [3102], $0 earned while a PA resident.
  // Form 8949 box D: acquired 2020-03-02, sold 2026-09-15 (FL period), proceeds $450,000, basis $100,000, gain
  //   $350,000 [SD].
  // Form 1040: line 1a 250,000; line 3a 2,000; line 3b 2,000 (Schedule B Part II: ordinary dividends over $1,500);
  //   Schedule D lines 15 and 16 350,000, lines 18 and 19 0; line 7a 350,000; line 9 and line 11 (AGI) 602,000;
  //   line 12 standard deduction 16,100 [RP p. 18]; line 15 taxable income 585,900.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 585,900  2) 2,000  3) 350,000  4) 352,000  5) 233,900  6) 49,450 [RP p. 13]
  //   7) 49,450  8) 49,450  9) 0  10) 352,000  11) 0  12) 352,000  13) 545,500 [RP p. 13]  14) 545,500  15) 233,900
  //   16) 311,600  17) 311,600  18) 15% = 46,740  19) 311,600  20) 40,400  21) 20% = 8,080
  //   22) tax on 233,900 [RP p. 11]: 41,024 + 32% x 32,125 = 51,304  23) 106,124
  //   24) tax on 585,900 [RP p. 11]: 58,448 + 35% x 329,675 = 173,834.25, entered 173,834 [GI p. 23]
  //   25) smaller = 106,124.
  // Form 6251 [6251] [55d]: line 2a 16,100; line 4 AMTI 602,000; line 5: 90,100 [RP p. 16] less 50% x (602,000 -
  //   500,000 [RP p. 17]) = 51,000, so 39,100; line 6 562,900. Part III: 12) 562,900  13) 352,000 (QDCG line 4)
  //   17) 210,900  18) 26% x 210,900 = 54,834 (210,900 <= 244,500 [RP p. 16])  19) 49,450  20) 233,900  21) 0
  //   22) 352,000  24) 352,000  25) 545,500  27) 233,900  28) 233,900  29) 311,600  30) 311,600
  //   31) 15% = 46,740  33) 40,400  34) 20% = 8,080  38) 54,834 + 46,740 + 8,080 = 109,654
  //   39) 28% x 562,900 - 4,890 = 152,722 [55]  40) 109,654; line 10 regular tax 106,124;
  //   line 11 AMT 109,654 - 106,124 = 3,530.
  // Form 8959 [3101]: line 1 250,000; line 6 50,000; line 7 450. Part V: line 19 3,625; line 21 3,625;
  //   line 24 0 [3102].
  // Form 8960 [8960] [1411]: line 2 dividends 2,000; line 5a gain 350,000; line 8 and line 12 352,000; line 13 MAGI
  //   602,000; line 14 200,000; line 15 402,000; line 16 352,000; line 17 3.8% = 13,376.
  // Form 1040: line 17 3,530; Schedule 2 line 21 13,376 + 450 = 13,826; line 24 total tax 106,124 + 3,530 + 13,826 =
  //   123,480; line 33 payments 50,000; amount owed 73,480.
  // PA-40 [PA] [TRC]: oval (P). Line 1a 150,000 [PA p. 10]. Line 3 2,000: all ordinary dividends were received while a
  //   PA resident, so Schedule B line 4 is $0 and Schedule B is not required (2025 PA-40 Schedule B, WHO MUST COMPLETE,
  //   only when lines 2-11 have an amount). Line 5 0: the sale is in the FL
  //   period [PA p. 43]. Lines 9 and 11 152,000. Line 12 3.07% x 152,000 = 4,666.40. Line 13 and line 24 4,700.
  //   Line 29 overpayment 33.60. School code 99999 (did not live in PA on Dec. 31). FL: no return [FL].
  const g = graph(profileEPaToFlAmtDividends);
  it(`Form 1040 income, Schedule B, Schedule D and line 16 tax (QDCG worksheet)`, () => {
    expectDollars(g, {
      '/wages': `250000.00`,
      '/ordinaryDividends': `2000.00`,
      '/qualifiedDividends': `2000.00`,
      '/scheduleDLine15': `350000.00`,
      '/scheduleDLine16': `350000.00`,
      '/totalIncome': `602000.00`,
      '/agi': `602000.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `585900.00`,
      '/qdcgLine1': `585900.00`,
      '/qdcgLine2': `2000.00`,
      '/qdcgLine3': `350000.00`,
      '/qdcgLine4': `352000.00`,
      '/qdcgLine5': `233900.00`,
      '/qdcgLine18': `46740.00`,
      '/qdcgLine20': `40400.00`,
      '/qdcgLine21': `8080.00`,
      '/qdcgLine22': `51304.00`,
      '/qdcgLine23': `106124.00`,
      '/qdcgLine24': `173834.00`,
      '/qdcgLine25': `106124.00`,
      '/tentativeTaxFromTaxableIncome': `106124.00`,
    });
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/dividendReports/#${profileEDividendId}/payer` as string).get).toBe(`Example Dividend Fund`);
  });
  it(`Form 6251 AMT inside the exemption phaseout, with the dividends in Part III`, () => {
    expectDollars(g, {
      '/form6251Line2a': `16100.00`,
      '/form6251Line4': `602000.00`,
      '/form6251Line5': `39100.00`,
      '/form6251Line6': `562900.00`,
      '/form6251Line12': `562900.00`,
      '/form6251Line13': `352000.00`,
      '/form6251Line17': `210900.00`,
      '/form6251Line18': `54834.00`,
      '/form6251Line31': `46740.00`,
      '/form6251Line33': `40400.00`,
      '/form6251Line34': `8080.00`,
      '/form6251Line38': `109654.00`,
      '/form6251Line39': `152722.00`,
      '/form6251Line40': `109654.00`,
      '/form6251Line10': `106124.00`,
      '/amt': `3530.00`,
    });
    expect(get(g, `/form6251Required`).get).toBe(true);
    expect(get(g, `/form8949Transactions/#${profileESaleId}/paSoldWhilePaResident` as string).get).toBe(false);
  });
  it(`Form 8959 and Form 8960`, () => {
    expectDollars(g, {
      '/form8959Line1': `250000.00`,
      '/form8959Line6': `50000.00`,
      '/form8959Line7': `450.00`,
      '/form8959Line24': `0.00`,
      '/form8960Line2': `2000.00`,
      '/form8960Line5a': `350000.00`,
      '/form8960Line8': `352000.00`,
      '/form8960Line12': `352000.00`,
      '/form8960Line13': `602000.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line15': `402000.00`,
      '/form8960Line16': `352000.00`,
      '/form8960Line17': `13376.00`,
    });
    expect(get(g, `/requiresForm8960`).get).toBe(true);
  });
  it(`Form 1040 total tax, payments and amount owed`, () => {
    expectDollars(g, {
      '/totalAdditionalTaxesOwed': `3530.00`,
      '/line21OfSchedule2': `13826.00`,
      '/totalTax': `123480.00`,
      '/totalPayments': `50000.00`,
      '/balanceDue': `73480.00`,
    });
  });
  it(`PA-40 taxes the PA-period dividends and leaves out the FL-period gain`, () => {
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(true);
    expect(get(g, `/paResidencyStatusPartYear`).get).toBe(true);
    expect(get(g, `/paPartYearHasDividends`).get).toBe(true);
    expect(get(g, `/paSchoolCode`).get.toString()).toBe(`99999`);
    expectDollars(g, {
      '/paLine1a': `150000.00`,
      '/paLine3': `2000.00`,
      '/paPartYearNonresidentDividends': `0.00`,
      '/paLine5': `0.00`,
      '/paLine9': `152000.00`,
      '/paLine11': `152000.00`,
      '/paLine12': `4666.40`,
      '/paLine13': `4700.00`,
      '/paLine24': `4700.00`,
      '/paLine29': `33.60`,
      '/stateRefund': `33.60`,
    });
    for (const form of [`PA40`]) {
      const when = pdfIncludeWhen(form);
      expect(get(g, when as string).get, `${form} includeWhen`).toBe(true);
    }
  });
  it(`nothing stops the return`, () => {
    for (const p of [
      `/flowKnockoutPaScheduleB`,
      `/flowKnockoutPaDividends`,
      `/flowKnockoutPaScheduleD`,
      `/flowKnockoutPaPartYear`,
      `/flowKnockoutStateReturn`,
    ]) {
      expect(get(g, p).complete, p).toBe(true);
      expect(get(g, p).get, p).toBe(false);
    }
    expectNotStopped(g);
  });
  it(`flow: the part-year dividend question is on the path, and a nonresident portion stops the return`, ({ task }) => {
    const givenFacts = makeGivenFacts(createFlowConfig(flowNodes));
    const at = `/flow/your-taxes/amount/pa-unsupported-items`;
    expect(givenFacts(g).atPath(at, null, task)).toRouteNextTo(`/flow/your-taxes/amount/pa-part-year-dividends`);
    const partial = graph({
      ...profileEPaToFlAmtDividends,
      '/paPartYearResidentDividends': createDollarWrapper(`1000`),
    });
    expect(get(partial, `/paLine3`).get.toString()).toBe(`1000.00`);
    expect(get(partial, `/paPartYearNonresidentDividends`).get.toString()).toBe(`1000.00`);
    expect(get(partial, `/flowKnockoutPaScheduleB`).get).toBe(true);
    expect(get(partial, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(partial, `/flowIsKnockedOut`).get).toBe(true);
    // Unanswered allocation: PA-40 line 3 stays incomplete (not $0). The Schedule B and dividend stops stay
    // incomplete, so submission and print fail closed.
    const withoutAllocation = { ...profileEPaToFlAmtDividends };
    delete withoutAllocation[`/paPartYearResidentDividends`];
    const bare = graph(withoutAllocation);
    expect(get(bare, `/paLine3`).complete).toBe(false);
    expect(get(bare, `/paLine9`).complete).toBe(false);
    expect(get(bare, `/flowKnockoutPaScheduleB`).complete).toBe(false);
    expect(get(bare, `/flowKnockoutPaDividends`).complete).toBe(false);
    expect(get(bare, `/flowIsKnockedOut`).complete).toBe(false);
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
  it(`1099-DIV dividends received while not a PA resident need PA Schedule B line 4`, () => {
    // $40 of $100 received while a PA resident: the $60 nonresident portion is PA Schedule B line 4 [PA p. 32, p. 43].
    const n = stops(
      {
        ...profileCPaToFlAmtNiit,
        ...profileCRows.qualifiedDividends(`13500000-0000-4000-8000-000000000c12`, `Example Fund`, 100, 100),
        '/paHasExemptObligationDividends': createBooleanWrapper(false),
        '/paPartYearResidentDividends': createDollarWrapper(`40`),
      },
      `/flowKnockoutPaScheduleB`
    );
    expect(get(n, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(n, `/paPartYearNonresidentDividends`).get.toString()).toBe(`60.00`);
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

// Stops this profile asserts. Each one is <BlockSubmissionOnTrue />. Full-year Schedule C is on PA-40 line 4; Form
// 8995 PDF prints (#17); submission still stops because there is no MeF mapping. No PA Schedule C PDF is produced.
const PROFILE_F_STOPPED = [
  `/flowKnockoutForm8995WithoutTy2026Template`,
  `/flowKnockoutForm8960Unsupported`,
  // PA-40 IN (2025) p. 17: must use PA Schedule C; this slice has no PA Schedule C PDF.
  `/flowKnockoutPaScheduleC`,
  `/flowKnockoutStateReturn`,
  `/flowIsKnockedOut`,
];

describe(`golden end-to-end scenario (synthetic data): profile F, full-year PA, AMT, and Schedule C`, () => {
  // Head of household, full-year Pennsylvania resident [PA] [TRC]; filer born 1985-04-12 (under 65), SSN 444-00-1007;
  //   child born 2014-06-01 (12 at year end), SSN 444-00-1008, lived in the home 12 months; both group 00 [SSA].
  //   School code 22275 (Harrisburg). No interest, no dividends, no sales.
  // W-2: box 1 and box 5 and box 16 $190,000, box 3 $184,500, box 2 $40,000, box 4 $11,439 (6.2% x 184,500,
  //   IRC §3101(a), https://www.law.cornell.edu/uscode/text/26/3101), box 6 $2,755 (1.45% only [3102]), box 17 $6,000.
  // Schedule C (single expense total; line-item questions not started, so /flowKnockoutScheduleCOutOfScope is
  //   complete false): Example Consulting, gross receipts $64,858, expenses $12,000, line 31 net profit $52,858.
  //   26 U.S.C. 61, 162 (https://www.law.cornell.edu/uscode/text/26/162).
  // Schedule SE: NESE = round(52,858 x 0.9235) = 48,814 (26 U.S.C. 1402(a)(12),
  //   https://www.law.cornell.edu/uscode/text/26/1402). OASDI wage base $184,500 is already used by box 3, so the
  //   12.4% OASDI part is $0 (26 U.S.C. 1402(b)(1); the 2026 base is $184,500, 90 FR 49050). HI = round(48,814 x
  //   0.029) = 1,416 (26 U.S.C. 1401(b)(1),
  //   https://www.law.cornell.edu/uscode/text/26/1401). Deductible half = round(1,416 x 0.5) = 708 (26 U.S.C. 164(f),
  //   Schedule 1 line 15). The questions for lines 1a, 1b, 4b, Part II, 5a, 5b, checkbox A, and 8c are answered no,
  //   so /flowKnockoutScheduleSEOutOfScope is complete false (26 U.S.C. 1402(a), 1402(c)(1), 1402(e), 1402(g),
  //   1402(j), 1402(l)).
  // Form 1040: line 1a 190,000; Schedule 1 line 3 52,858; line 8 52,858; line 9 242,858; line 10 708; line 11 AGI
  //   242,150.
  // Schedule A: real estate tax $40,400. Line 5e is the smaller of line 5d or $40,400 (AGI is under the $505,000
  //   phase-down). IRC §164(b)(7)(A)(ii) (https://www.law.cornell.edu/uscode/text/26/164): "in the case of any
  //   taxable year beginning in calendar year 2026, $40,400". No mortgage interest, no gifts, so line 18 is 40,400.
  //   The head-of-household standard deduction is $24,150 [RP p. 18 §4.14(1) "Heads of Households (§ 1(j)(2)(B))
  //   $24,150"], so the filer itemizes. No senior deduction (born after January 1, 1962).
  // Form 8995 (computed; the PDF prints, #17; submission still stops because there is no MeF mapping): line 2 = 52,858 - 708 =
  //   52,150; line 5 = round(20% x 52,150) = 10,430 (26 U.S.C. 199A(a),
  //   https://www.law.cornell.edu/uscode/text/26/199A). Line 11, taxable income before the deduction, = 242,150 -
  //   40,400 = 201,750, which is the head-of-household threshold. Rev. Proc. 2025-32 §3.26, PDF pp. 21-22:
  //   "All Other Returns $201,750". At the threshold, not over it, so Form 8995-A does not apply. Line 14 =
  //   round(20% x 201,750) = 40,350. Line 16 minimum $400 does not bind (active QBI is at least $1,000, 199A(i)).
  //   Line 17 = 10,430 -> Form 1040 line 13b.
  // Form 1040: line 14 40,400 + 10,430 = 50,830; line 15 191,320.
  // Line 16, over $100,000 so the Tax Computation Worksheet [GI p. 36], [RP] p. 10 §4.01 Table 2 (Heads of
  //   Households): "Over $105,700 but not over $201,750 $16,155 plus 24% of the excess over $105,700":
  //   16,155 + 24% x 85,620 = 36,703.80, entered 36,704.
  // Form 6251 [6251] [55] [55d]: line 1a 50,830 (no Schedule 1-A line 43); line 1b 191,320; line 2a 40,400 (Schedule A
  //   line 5e; the QBI deduction is not an AMT preference and is not added back); line 4 AMTI 231,720, under the
  //   $500,000 phaseout [RP p. 17], so line 5 exemption 90,100 [RP p. 16 "Unmarried Individuals (other than Surviving
  //   Spouses) $90,100", which is also the head-of-household amount]; line 6 141,620; line 7 26% x 141,620 =
  //   36,821.20, entered 36,821 (141,620 is not over $244,500 [RP p. 16]); line 10 regular tax 36,704; line 11 AMT
  //   117. No preference items, and the return is not married filing separately.
  // Form 8959 [3101]: Medicare wages 190,000 are under $200,000, so line 7 is 0. Part IV: line 13 NESE 48,814;
  //   line 16 = 200,000 - 190,000 = 10,000 (26 U.S.C. 1401(b)(2)(B)); line 17 38,814; line 18 round(38,814 x 0.009)
  //   = 349 (Schedule 2 line 11).
  // Form 8960 is computed and the return stops (/flowKnockoutForm8960Unsupported). MAGI 242,150 is over the $200,000
  //   head-of-household threshold [1411], and the return has both Schedule C and itemized deductions. Line 4b (the
  //   non-section 1411 trade-or-business adjustment) and the Part II itemized allocation are not modeled. A
  //   materially participating consulting business is generally not net investment income under §1411(c)(2). The
  //   engine still puts Schedule C net profit on line 4a and still adds line 17 to Schedule 2 line 6. Those dollars
  //   are what the graph computes; they are not a filed NIIT. Line 4a 52,858; line 8 and line 12 52,858; line 15
  //   242,150 - 200,000 = 42,150; line 16 42,150; line 17 round(42,150 x 0.038) = 1,602.
  // Schedule 2 line 21 = SE tax 1,416 + line 17 1,602 + additional Medicare 349 = 3,367. Line 2 (AMT) is Form 1040
  //   line 17, not line 21.
  // Child tax credit: one qualifying child under 17, maximum $2,200 [RP p. 14 §4.05(1)]. IRC §24(h)(3)
  //   (https://www.law.cornell.edu/uscode/text/26/24): "the threshold amount shall be $400,000 in the case of a joint
  //   return ($200,000 in any other case)". IRC §24(b): the credit "shall be reduced by $50 for each $1,000 (or
  //   fraction thereof)" of AGI over that threshold. Excess 42,150 rounds up to 43,000; 5% x 43,000 = 2,150; credit
  //   2,200 - 2,150 = 50. EIC is $0 [EITC].
  // Form 1040: line 18 36,704 + 117 = 36,821; line 19 50; line 22 36,771; line 23 3,367; line 24 total tax 40,138;
  //   line 25a 40,000; amount owed 138.
  // PA-40 as modeled [PA] [TRC]. Line 4 = federal Schedule C line 31 $52,858 (72 P.S. §7303(a)(2);
  //   https://codes.findlaw.com/pa/title-72-ps-taxation-and-fiscal-affairs/pa-st-sect-72-7303/; [PA] p. 17 LINE 4).
  //   No PA Schedule C PDF is produced; the federal Schedule C PDF is not the PA schedule. Line 1a = box 16
  //   190,000. Line 9 = 190,000 + 52,858 = 242,858. Line 12 3.07% x 242,858 = 7,455.74. Line 13 and line 24 6,000.
  //   Schedule SP: eligibility income is line 9, $242,858, which is over the 10% column for an unmarried claimant
  //   with one dependent child (base $6,500 + $9,500, plus $2,250 to the 10% column = $18,250). 72 P.S. §7304
  //   (https://codes.findlaw.com/pa/title-72-ps-taxation-and-fiscal-affairs/pa-st-sect-72-7304/). Line 21 is $0.
  //   Line 26 tax due 7,455.74 - 6,000 = 1,455.74. The return still stops: /flowKnockoutForm8995WithoutTy2026Template
  //   and /flowKnockoutForm8960Unsupported. /flowKnockoutPaUnsupportedIncome is false on this supported path.
  // Print: Form 8995 prints (#17). Form 8960 refuses the package. /flowKnockoutAmtPreferenceItems (answered no) and
  //   /flowKnockoutAmtMfsAddBack stay complete false.
  const g = graph(profileFPaAmtScheduleC);
  const expectStoppedOnly = (fg: Fg) => {
    const stopped = new Set(PROFILE_F_STOPPED);
    for (const path of submissionBlockingFacts.filter((p) => !p.includes(`*`) && p !== `/flowIncomplete`)) {
      const r = get(fg, path);
      if (stopped.has(path)) {
        expect(r.complete, path).toBe(true);
        expect(r.get, path).toBe(true);
      } else {
        expect(r.complete && r.get === true, path).toBe(false);
      }
    }
  };

  it(`Schedule C single expense total and Schedule SE`, () => {
    expect(get(g, `/scheduleCBusinesses/#${profileFBusinessId}/businessName` as string).get).toBe(`Example Consulting`);
    expect(get(g, `/flowKnockoutScheduleCOutOfScope`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleSEOutOfScope`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleSEOutOfScope`).get).toBe(false);
    expectDollars(g, {
      '/scheduleCNetProfitOrLoss': `52858.00`,
      '/schedule1Line3': `52858.00`,
      '/primaryFilerSeNetEarnings': `48814.00`,
      '/primaryFilerSeSocialSecurityTax': `0.00`,
      '/primaryFilerSeMedicareTax': `1416.00`,
      '/selfEmploymentTax': `1416.00`,
      '/deductibleSelfEmploymentTax': `708.00`,
      '/schedule1Line15': `708.00`,
    });
  });
  it(`Form 1040 income, Schedule A, and Form 8995 at the head-of-household threshold`, () => {
    expect(get(g, `/filingStatus`).get.toString()).toBe(`headOfHousehold`);
    expect(get(g, `/form8995Required`).get).toBe(true);
    expect(get(g, `/flowKnockoutQbiAboveThreshold`).complete).toBe(true);
    expect(get(g, `/flowKnockoutQbiAboveThreshold`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleCQbi`).get).toBe(false);
    expectDollars(g, {
      '/wages': `190000.00`,
      '/totalIncome': `242858.00`,
      '/adjustmentsToIncome': `708.00`,
      '/agi': `242150.00`,
      '/scheduleALine5e': `40400.00`,
      '/scheduleALine18': `40400.00`,
      '/standardOrItemizedDeductions': `40400.00`,
      '/form8995Line2': `52150.00`,
      '/form8995Line5': `10430.00`,
      '/form8995Line11': `201750.00`,
      '/form8995Line14': `40350.00`,
      '/form8995Line16': `400.00`,
      '/form8995Line17': `10430.00`,
      '/qualifiedBusinessIncomeDeduction': `10430.00`,
      '/totalDeductions': `50830.00`,
      '/taxableIncome': `191320.00`,
      '/tentativeTaxFromTaxableIncome': `36704.00`,
    });
  });
  it(`Form 6251 AMT under the exemption phaseout`, () => {
    expect(get(g, `/hasAmtPreferenceItems`).get).toBe(false);
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).complete).toBe(true);
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).get).toBe(false);
    expect(get(g, `/flowKnockoutAmtMfsAddBack`).complete).toBe(true);
    expect(get(g, `/flowKnockoutAmtMfsAddBack`).get).toBe(false);
    expect(get(g, `/form6251Required`).get).toBe(true);
    expectDollars(g, {
      '/form6251Line1a': `50830.00`,
      '/form6251Line1b': `191320.00`,
      '/form6251Line2a': `40400.00`,
      '/form6251Line4': `231720.00`,
      '/form6251Line5': `90100.00`,
      '/form6251Line6': `141620.00`,
      '/form6251Line7': `36821.00`,
      '/form6251Line10': `36704.00`,
      '/amt': `117.00`,
      '/schedule2Line2': `117.00`,
    });
  });
  it(`Form 8959 on self-employment income, and Form 8960 dollars that are computed but not filed`, () => {
    expect(get(g, `/flowKnockoutForm8960Unsupported`).complete).toBe(true);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(true);
    expect(get(g, `/requiresForm8960`).get).toBe(true);
    expectDollars(g, {
      '/form8959Line1': `190000.00`,
      '/form8959Line7': `0.00`,
      '/form8959Line13': `48814.00`,
      '/form8959Line16': `10000.00`,
      '/form8959Line17': `38814.00`,
      '/form8959Line18': `349.00`,
      '/line11AdditionalMedicareTax': `349.00`,
      '/form8960Line4a': `52858.00`,
      '/form8960Line8': `52858.00`,
      '/form8960Line12': `52858.00`,
      '/form8960Line13': `242150.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line15': `42150.00`,
      '/form8960Line16': `42150.00`,
      '/form8960Line17': `1602.00`,
      '/schedule2Line4': `1416.00`,
      '/schedule2Line6NetInvestmentIncomeTax': `1602.00`,
      '/line21OfSchedule2': `3367.00`,
    });
  });
  it(`child tax credit after the phaseout, total tax, and the amount owed`, () => {
    expect(get(g, `/familyAndHousehold/#${profileFChildId}/tin/isSSN` as string).get).toBe(true);
    expect(get(g, `/primaryFiler/tin/isSSN`).get).toBe(true);
    expectDollars(g, {
      '/totalCtc': `50.00`,
      '/nonRefundableCredits': `50.00`,
      '/additionalCtc': `0.00`,
      '/earnedIncomeCredit': `0.00`,
      '/taxLessNonRefundableCredits': `36771.00`,
      '/totalTax': `40138.00`,
      '/formW2Withholding': `40000.00`,
      '/totalPayments': `40000.00`,
      '/balanceDue': `138.00`,
    });
    expect(get(g, `/eitcQualified`).get).toBe(false);
  });
  it(`PA-40 line 4 is federal Schedule C line 31; PA Schedule C + Form 8995 stop; Schedule SP does not qualify`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/paLine4`).get.toString()).toBe(`52858.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutPaScheduleC`).get).toBe(true);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(true);
    expect(get(g, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
    expect(get(g, `/paSpLine15`).get.toString()).toBe(`0/1`);
    expectDollars(g, {
      '/paLine1a': `190000.00`,
      '/paLine1c': `190000.00`,
      '/paLine4': `52858.00`,
      '/paLine9': `242858.00`,
      '/paLine11': `242858.00`,
      '/paLine12': `7455.74`,
      '/paLine13': `6000.00`,
      '/paSpLine11': `242858.00`,
      '/paLine21': `0.00`,
      '/paLine24': `6000.00`,
      '/paLine26': `1455.74`,
      '/paLine29': `0.00`,
    });
    for (const path of [
      `/flowKnockoutQbiPriorYearCarryforward`,
      `/flowKnockoutQbiCooperativePatron`,
      `/flowKnockoutQbiMixedParticipation`,
      `/flowKnockoutScheduleCSpouseBusiness`,
      `/flowKnockoutScheduleCEarnedIncomeCredits`,
      `/flowKnockoutPaUnsupportedIncome`,
      `/flowKnockoutPaScheduleA`,
      `/flowKnockoutPaScheduleB`,
      `/flowKnockoutPaScheduleD`,
      `/flowKnockoutPaDividends`,
      `/flowKnockoutPaPartYear`,
      `/flowKnockoutPaUnsupportedItems`,
      `/flowKnockoutPaNonresidentPaSourcePay`,
      `/flowKnockoutPaSpUnsupported`,
    ]) {
      expect(get(g, path).complete, path).toBe(true);
      expect(get(g, path).get, path).toBe(false);
    }
    expectStoppedOnly(g);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile F negative rows (each stops the return)`, () => {
  const stops = (facts: Record<string, unknown>, knockout: string) => {
    const n = graph(facts);
    expect(submissionBlockingFacts).toContain(knockout);
    expect(get(n, knockout).complete, knockout).toBe(true);
    expect(get(n, knockout).get, knockout).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).complete).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).get).toBe(true);
    return n;
  };

  it(`depreciation (Form 4562) stops on the Schedule C out-of-scope knockout`, () => {
    stops(
      {
        ...profileFPaAmtScheduleC,
        [`/scheduleCBusinesses/#${profileFBusinessId}/hasDepreciationOrSection179`]: createBooleanWrapper(true),
      },
      `/flowKnockoutScheduleCOutOfScope`
    );
  });
  it(`one dollar less of state and local tax puts line 11 over the Form 8995 threshold`, () => {
    // Itemized deduction 40,399. Taxable income before the QBI deduction = 242,150 - 40,399 = 201,751, over the
    // $201,750 head-of-household threshold, so Form 8995-A applies and is not computed.
    const n = stops(
      { ...profileFPaAmtScheduleC, '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`40399`) },
      `/flowKnockoutQbiAboveThreshold`
    );
    expectDollars(n, { '/form8995Line11': `201751.00`, '/agi': `242150.00` });
    expect(get(n, `/flowKnockoutScheduleCQbi`).get).toBe(true);
    expect(get(n, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(n, `/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
  });
  it(`AMT preference items stop the return and are not added into line 4`, () => {
    const n = stops(
      { ...profileFPaAmtScheduleC, '/hasAmtPreferenceItems': createBooleanWrapper(true) },
      `/flowKnockoutAmtPreferenceItems`
    );
    expectDollars(n, { '/form6251Line4': `231720.00`, '/amt': `117.00` });
    expect(get(n, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(n, `/paLine4`).get.toString()).toBe(`52858.00`);
  });
});

// The only submission-blocking fact this return sets true. Schedule EIC is required for a nonzero EIC with a
// qualifying child, and /flowKnockoutScheduleEicWithoutTy2026Template stays until the §152(c)(4) tie-breaker is fully
// modeled (eitc.xml). The credit itself is computed.
const PROFILE_G_STOPPED = [`/flowKnockoutScheduleEicWithoutTy2026Template`, `/flowIsKnockedOut`];

describe(`golden end-to-end scenario (synthetic data): profile G, MFJ, two children, Schedule 8812, Form 2441, EITC`, () => {
  // Married filing jointly, Florida resident [FL]. Harper Example, born 1985-06-12, SSN 444-00-2001. Reese Example,
  //   born 1986-11-03, SSN 444-00-2002. Robin Example, born 2018-04-12 (8 at year end), SSN 444-00-2003. Sky Example,
  //   born 2020-09-15 (6 at year end), SSN 444-00-2004. Each child lived in the home 12 months. Every SSN is group 00
  //   [SSA]. No interest, no dividends, no sales, standard deduction.
  // W-2 #1 (Harper): box 1, box 3 and box 5 $28,000, box 2 $500, box 4 $1,736 (6.2%, IRC §3101(a)), box 6 $406
  //   (1.45% only [3102]). W-2 #2 (Reese): the same. No box 10 dependent care benefits, no box 12, no box 17.
  // Form 2441 qualifying expenses $3,000 for each child ($6,000 together), paid to a care provider. No prior-year
  //   credit.
  // Form 1040: line 1a/1z and line 9 and line 11 (AGI) 56,000. Line 12 standard deduction 32,200 [RP p. 18 §4.14(1)
  //   "Married Individuals Filing Joint Returns and Surviving Spouses $32,200"]. Neither spouse is 65 or older or
  //   blind, so no additional amount. Line 15 taxable income 23,800.
  // Line 16, Tax Table [GI p. 36]. Row for 23,800 is the $50 row whose midpoint is 23,825 (the same midpoint rule as
  //   [GI] p. 69). [RP] p. 10 §4.01 Table 1: "Not over $24,800 — 10% of the taxable income." 10% x 23,825 = 2,382.50,
  //   which rounds to 2,383 (half up, as [GI] p. 69 rounds 10% x $3,025 = $302.50 to 303).
  // Form 2441, IRC §21 (https://www.law.cornell.edu/uscode/text/26/21). §21(b)(1)(A): a qualifying individual "has not
  //   attained age 13". §21(c): expenses "shall not exceed— (1) $3,000 if there is 1 qualifying individual ... or (2)
  //   $6,000 if there are 2 or more". §21(d)(1): the expenses taken into account "shall not exceed— (A) in the case of
  //   an individual who is not married ... such individual's earned income ... or (B) in the case of an individual who
  //   is married ... the lesser of such individual's earned income or the earned income of his spouse". Each spouse's
  //   earned income is $28,000, so line 6 is the $6,000 of expenses. §21(a)(2), as amended for 2026: "the term
  //   'applicable percentage' means 50 percent— (A) reduced (but not below 35 percent) by 1 percentage point for each
  //   $2,000 or fraction thereof by which the taxpayer's adjusted gross income ... exceeds $15,000". AGI $56,000 is
  //   $41,000 over $15,000, which is 21 points, so 50% − 21% = 29%, and the 35% floor applies. 2026 Form 2441 draft
  //   https://www.irs.gov/pub/irs-dft/f2441--dft.pdf (SHA-256 67eca7567ce5ff06e72d40a07db487f406da33139e664c0c0d9c67a4e31e9385),
  //   instructions What's New: the maximum percentage is 50%. Line 9a = round(35% x 6,000) = 2,100. Line 10, the
  //   credit limit worksheet, is Form 1040 line 18, 2,383 (no foreign tax credit). Line 11 = the smaller of 2,100 and
  //   2,383 = 2,100, which is Schedule 3 line 2 and part of line 8.
  // Schedule 8812, IRC §24 (https://www.law.cornell.edu/uscode/text/26/24). Two qualifying children under 17.
  //   [RP] p. 14 §4.05(1): "the maximum amount of the credit allowed under § 24(a) is $2,200." Line 5 = 2 x 2,200 =
  //   4,400. §24(h)(3): "the threshold amount shall be $400,000 in the case of a joint return ($200,000 in any other
  //   case)." AGI is under $400,000, so the §24(b) phaseout is 0 and line 12 is 4,400. Credit Limit Worksheet A,
  //   line 13 = line 18 minus the Schedule 3 credits that come ahead of the child tax credit = 2,383 − 2,100 = 283.
  //   Line 14 (Form 1040 line 19) = the smaller of 4,400 and 283 = 283. Line 16a remaining = 4,117.
  //   [RP] p. 14 §4.05(2): "the amount used in § 24(d)(1)(A) to determine the amount of the credit under § 24 that may
  //   be refundable is $1,700." Line 16b = 2 x 1,700 = 3,400, and the remaining potential additional credit is the
  //   smaller of 4,117 and 3,400 = 3,400. §24(h)(6) substitutes "$2,500" for "$3,000" in §24(d)(1)(B)(i). Earned
  //   income over that threshold is 56,000 − 2,500 = 53,500. §24(d)(1)(B)(i): "15 percent of so much of the taxpayer's
  //   earned income ... as exceeds" that amount: round(15% x 53,500) = 8,025. Two children, so the three-or-more
  //   worksheet does not apply. Additional child tax credit (line 27, Form 1040 line 28) = the smaller of 3,400 and
  //   8,025 = 3,400. 2026 Schedule 8812 draft https://www.irs.gov/pub/irs-dft/f1040s8--dft.pdf (SHA-256
  //   0638b2863bdaeadfd3fccee12a9145bf92a442d8de156584c5602cc7e3881422).
  // EITC, IRC §32 (https://www.law.cornell.edu/uscode/text/26/32). §32(b): two qualifying children, credit percentage
  //   40 percent, phaseout percentage 21.06 percent. [RP] p. 15 §4.06(1): earned income amount "Two $18,290";
  //   "Threshold Phaseout Amount (Married Filing Jointly) ... Two $31,160"; "Completed Phaseout Amount (Married Filing
  //   Jointly) ... Two $65,899". Maximum credit = round(40% x 18,290) = 7,316. §32(i) and [RP] p. 15 §4.06(2): the
  //   credit "is not allowed ... if the aggregate amount of certain investment income exceeds $12,200." Investment
  //   income is $0. The EIC table uses $50 rows and the credit at the midpoint (the same construction as the Tax
  //   Table). Earned income and AGI are both $56,000, so the row midpoint is $56,025. That is above $31,160 + $25, so
  //   the phaseout applies: 21.06% x (56,025 − 31,160) = 21.06% x 24,865 = 5,236.569. 7,316 − 5,236.569 = 2,079.431,
  //   which rounds to 2,079. The AGI column is the same amount, so line 27a is 2,079. 2026 Schedule EIC draft
  //   https://www.irs.gov/pub/irs-dft/f1040sei--dft.pdf (SHA-256
  //   fc9784fd1f64b2ea53e86d9a23a2b946f317c1bb92885e18f8a614252dcf7ef3): "Complete and attach to Form 1040 or 1040-SR
  //   only if you have a qualifying child." §32(c)(3)(D)(i) requires the child's name, age and TIN on the return. The
  //   tool stops the return on /flowKnockoutScheduleEicWithoutTy2026Template because the §152(c)(4) tie-breaker is not
  //   fully modeled. The dollars above are what the graph computes.
  // Form 1040: line 18 2,383; line 19 283; line 20 2,100; line 21 2,383; line 22 and line 24 0. Line 27a 2,079; line 28
  //   3,400; line 32a 5,479. Schedule 3-A (2026 draft, a filer who is a U.S. citizen and elects to receive the federal
  //   public benefit): line 2 5,479, line 5 0, line 6 5,479, line 8 amount 0, so Form 1040 line 32b is 0 and line 32c
  //   is 5,479. Line 25a 1,000; line 33 6,479; line 34 overpayment 6,479; amount owed 0.
  // Form 8959 is not required (Medicare wages $56,000 are under the $250,000 joint threshold [3101]). Form 8960 is not
  //   required (MAGI $56,000 is under the $250,000 joint threshold [1411]).
  const g = graph(profileGMfjTwoChildren);
  const expectStoppedOnly = (fg: Fg) => {
    const stopped = new Set(PROFILE_G_STOPPED);
    for (const path of submissionBlockingFacts.filter((p) => !p.includes(`*`) && p !== `/flowIncomplete`)) {
      const r = get(fg, path);
      if (stopped.has(path)) {
        expect(r.complete, path).toBe(true);
        expect(r.get, path).toBe(true);
      } else {
        expect(r.complete && r.get === true, path).toBe(false);
      }
    }
  };

  it(`filing status, two qualifying children, and wages`, () => {
    expect(get(g, `/filingStatus`).get.toString()).toBe(`marriedFilingJointly`);
    expect(get(g, `/primaryFiler/tin/isSSN`).get).toBe(true);
    expect(get(g, `/secondaryFiler/tin/isSSN`).get).toBe(true);
    expect(get(g, `/familyAndHousehold/#${profileGChild1Id}/tin/isSSN` as string).get).toBe(true);
    expect(get(g, `/familyAndHousehold/#${profileGChild2Id}/tin/isSSN` as string).get).toBe(true);
    expect(get(g, `/ctcEligibleDependents`).get.toString()).toBe(`2`);
    expect(get(g, `/numEitcDependentsCollectionForCalculation`).get.toString()).toBe(`2`);
    expectDollars(g, {
      '/wages': `56000.00`,
      '/totalIncome': `56000.00`,
      '/agi': `56000.00`,
      '/standardOrItemizedDeductions': `32200.00`,
      '/taxableIncome': `23800.00`,
      '/tentativeTaxFromTaxableIncome': `2383.00`,
    });
  });
  it(`Form 2441 child and dependent care credit at the 35% floor`, () => {
    expect(get(g, `/cdccQualified`).get).toBe(true);
    expect(get(g, `/knockoutCdccWorksheetA`).get).toBe(false);
    expect(get(g, `/cdccCareExpensesDecimalAmount`).get.toString()).toBe(`0.35`);
    expectDollars(g, {
      '/cdccQualifyingExpenses': `6000.00`,
      '/cdccLowerOfEarnedIncomeAndExpenses': `6000.00`,
      '/cdccTentativeExpenseAmount': `2100.00`,
      '/cdccCreditLimit': `2383.00`,
      '/cdccTotalCredit': `2100.00`,
      '/line8OfSchedule3': `2100.00`,
    });
  });
  it(`Schedule 8812 nonrefundable child tax credit and additional child tax credit`, () => {
    expectDollars(g, {
      '/totalPotentialCtc': `4400.00`,
      '/dependentCreditPhaseout': `0.00`,
      '/dependentCreditLessPhaseout': `4400.00`,
      '/sched8812CreditLimit': `283.00`,
      '/totalCtcAndOdc': `283.00`,
      '/totalCtc': `283.00`,
      '/totalOdc': `0.00`,
      '/remainingCtcAndOdc': `4117.00`,
      '/totalPotentialActc': `3400.00`,
      '/remainingPotentialActc': `3400.00`,
      '/regularMaximumActc': `8025.00`,
      '/additionalCtc': `3400.00`,
    });
  });
  it(`EITC for two children, in the phaseout`, () => {
    expect(get(g, `/eitcQualified`).get).toBe(true);
    expect(get(g, `/eitcRoundedAGI`).get.toString()).toBe(`56025.00`);
    expectDollars(g, {
      '/earnedIncomeCredit': `2079.00`,
    });
  });
  it(`Form 1040 credits, payments and refund; Schedule 3-A leaves the refund in place`, () => {
    expect(get(g, `/pdfIncludeSchedule3A`).get).toBe(true);
    expect(get(g, `/schedule3ALine8`).get.toString()).toBe(`0.00`);
    expectDollars(g, {
      '/nonRefundableCredits': `2383.00`,
      '/taxLessNonRefundableCredits': `0.00`,
      '/line21OfSchedule2': `0.00`,
      '/totalTax': `0.00`,
      '/totalOtherPaymentsRefundableCredits': `5479.00`,
      '/schedule3ALine2': `5479.00`,
      '/schedule3ALine6': `5479.00`,
      '/schedule3AAmountForForm1040Line32b': `0.00`,
      '/form1040Line32c': `5479.00`,
      '/formW2Withholding': `1000.00`,
      '/totalPayments': `6479.00`,
      '/overpayment': `6479.00`,
      '/balanceDue': `0.00`,
    });
    expect(get(g, `/requiresForm8959`).get).toBe(false);
    expect(get(g, `/requiresForm8960`).get).toBe(false);
  });
  it(`Florida resident: no state return; the return stops only because Schedule EIC is not produced`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expect(get(g, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    expect(get(g, `/pdfIncludeScheduleEic`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleEicWithoutTy2026Template`).get).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).complete).toBe(true);
    expect(get(g, `/flowIsKnockedOut`).get).toBe(true);
    expectStoppedOnly(g);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile G negative rows (each stops the return)`, () => {
  const stops = (facts: Record<string, unknown>, knockout: string) => {
    const n = graph(facts);
    expect(submissionBlockingFacts).toContain(knockout);
    expect(get(n, knockout).complete, knockout).toBe(true);
    expect(get(n, knockout).get, knockout).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).complete).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).get).toBe(true);
    return n;
  };

  it(`a Florida W-2 with state tax withheld in box 17 [FL]`, () => {
    const n = stops(
      {
        ...profileGMfjTwoChildren,
        ...profileGWithW2s({ ...profileGPrimaryW2, box16: 28000, box17: 100 }, profileGSpouseW2),
      },
      `/flowKnockoutFloridaStateWithholding`
    );
    expectDollars(n, {
      '/cdccTotalCredit': `2100.00`,
      '/totalCtc': `283.00`,
      '/additionalCtc': `3400.00`,
      '/earnedIncomeCredit': `2079.00`,
    });
    expect(get(n, `/flowKnockoutScheduleEicWithoutTy2026Template`).get).toBe(true);
  });
  it(`a household employee stops the return`, () => {
    const n = stops(
      { ...profileGMfjTwoChildren, '/flowKnockoutHouseholdEmployee': createBooleanWrapper(true) },
      `/flowIsKnockedOut`
    );
    expect(get(n, `/flowKnockoutHouseholdEmployee`).get).toBe(true);
    expectDollars(n, { '/cdccTotalCredit': `2100.00`, '/earnedIncomeCredit': `2079.00` });
  });
  it(`Form 2441 prior-year worksheet A stops the return and does not invent a prior-year credit`, () => {
    const n = stops(
      {
        ...profileGMfjTwoChildren,
        '/cdccHasCreditForPriorYearExpenses': createBooleanWrapper(true),
        '/cdccClaimedCreditForPriorYearExpenses': createBooleanWrapper(false),
      },
      `/flowIsKnockedOut`
    );
    expect(get(n, `/knockoutCdccWorksheetA`).get).toBe(true);
    expectDollars(n, { '/cdccCreditForPriorYearExpenses': `0.00`, '/cdccTotalCredit': `2100.00` });
  });
});

// Stops this profile asserts. Each one is <BlockSubmissionOnTrue />. Full-year Schedule E Part I is on PA-40 line 6
// (#276) once Part II–IV are answered no; /flowKnockoutPaUnsupportedIncome is false.
const PROFILE_H_STOPPED: string[] = [];

describe(`golden end-to-end scenario (synthetic data): profile H, full-year PA, Schedule E rental, and dividends`, () => {
  // Single, full-year Pennsylvania resident [PA] [TRC]; born 1988-03-15 (under 65, not blind), SSN 900-46-1009
  //   (900 area, group 46, outside the ITIN ranges). Address 123 Example St, Harrisburg, PA 17101. School code
  //   22275 (Harrisburg). Fixed identifiers. Standard deduction, the same choice as profile 7.
  // W-2: box 1, box 3, box 5, and box 16 $48,000; box 2 $5,200; box 4 $2,976 (6.2% x 48,000, IRC §3101(a),
  //   https://www.law.cornell.edu/uscode/text/26/3101; the 2026 OASDI wage base is $184,500); box 6 $696
  //   (1.45% only [3102]); box 17 $1,600.
  // Schedule E Part I, one residential rental, the supported totals (no per-property address is collected).
  //   Instructions for Schedule E (2026) draft, https://www.irs.gov/pub/irs-dft/i1040se--dft.pdf, printed p. 2
  //   (PDF p. 3): "Use Schedule E (Form 1040) to report income or loss from rental real estate, royalties,
  //   partnerships, S corporations, estates, trusts, and residual interests in REMICs."
  //   Line 3 rents $15,000; line 4 royalties $0; lines 5-17 and 19 expenses $3,000; line 18 depreciation $0
  //   (answered no, so Form 4562 is not required). 26 U.S.C. 61(a)(5),
  //   https://www.law.cornell.edu/uscode/text/26/61: gross income includes "Rents". 26 U.S.C. 212,
  //   https://www.law.cornell.edu/uscode/text/26/212: a deduction for ordinary and necessary expenses "for the
  //   production or collection of income" and "for the management, conservation, or maintenance of property held
  //   for the production of income".
  //   Line 21 = 15,000 + 0 - 3,000 = 12,000. No loss, so lines 22 and 25 are $0 and Form 8582 / Form 6198 do not
  //   apply (26 U.S.C. 469, 465, 461(l)). Line 26 = 12,000. Schedule E (2026) draft,
  //   https://www.irs.gov/pub/irs-dft/f1040se--dft.pdf, p. 1, line 26: "Total rental real estate and royalty
  //   income or (loss). ... Schedule 1 (Form 1040), line 5." Part II, Part III, and Part IV are answered no, so
  //   lines 32, 37, and 39 are $0. Line 41 = 12,000. Not a section 162 trade or business (26 U.S.C. 199A), no
  //   personal use (26 U.S.C. 280A), no substantial services. K-1s are out of scope.
  // Form 1099-DIV: payer Example Dividend Fund; box 1a $1,800; box 1b $1,200. Box 1b is not larger than box 1a.
  //   No box 2a, box 5, nominee, or other unsupported box. Holding period met. Ordinary dividends are over
  //   $1,500, so Schedule B is required. Instructions for Schedule B (Form 1040) (2025),
  //   https://www.irs.gov/pub/irs-pdf/i1040sb.pdf, p. 1: "You had over $1,500 of taxable interest or ordinary
  //   dividends." Part III is answered no (no foreign account, no foreign trust). No PA Schedule B line has an amount.
  // Form 1040: line 1a 48,000; line 2b 0; line 3a 1,200; line 3b 1,800; Schedule 1 line 5 and line 8 12,000;
  //   line 9 and line 11 (AGI) 61,800. No adjustments. Line 12 standard deduction 16,100 [RP p. 18 §4.14(1):
  //   "Unmarried Individuals (other than Surviving Spouses and Heads of Households) ... $16,100"]. Line 15
  //   taxable income 45,700. AGI is under the $200,000 single threshold [1411 (b)(3)], so Form 8960 line 17 is
  //   $0 and the Schedule E rents do not stop the federal return. No Form 8959 (Medicare wages under $200,000
  //   [3101]). AMTI 61,800 is under the $90,100 exemption [RP p. 16], so AMT is $0.
  // Line 16, QDCG worksheet [GI p. 38]: 1) 45,700  2) 1,200  3) 0 (no Schedule D; /soldCapitalAssets is no)
  //   4) 1,200  5) 44,500  6) 49,450 [RP p. 13 §4.03: "All Other Individuals $49,450 $545,500"]  7) 45,700
  //   8) 44,500  9) 1,200 (taxed at 0%; taxable income is under the zero-rate amount)  10) 1,200  11) 1,200
  //   12) 0  13) 545,500  14) 45,700  15) 45,700  16) 0  17) 0  18) 0  19) 1,200  20) 0  21) 0
  //   22) tax on 44,500 by the Tax Table [GI p. 36: "If your taxable income is less than $100,000, you must use
  //   the Tax Table"]: row 44,500-44,550, midpoint 44,525, [RP p. 11 Table 3] 1,240 + 12% x (44,525 - 12,400) =
  //   1,240 + 12% x 32,125 = 5,095  23) 5,095
  //   24) tax on 45,700: row 45,700-45,750, midpoint 45,725: 1,240 + 12% x (45,725 - 12,400) = 1,240 + 12% x
  //   33,325 = 5,239  25) smaller = 5,095.
  // Total tax 5,095; withholding 5,200; overpayment 105. EITC is $0 [EITC]: the TIN is not an SSN, and AGI is
  //   over $19,540. No qualifying child, so the child tax credit is $0.
  // PA-40 as modeled [PA] [TRC]. Line 6 = federal Schedule E Part I net $12,000 (#276). [PA] p. 18, LINE 6:
  //   "You may use federal Schedule E, if using only Part I, and with the following adjustments". 72 P.S.
  //   §7303(a)(4) (https://codes.findlaw.com/pa/title-72-ps-taxation-and-fiscal-affairs/pa-st-sect-72-7303/).
  //   /flowKnockoutPaUnsupportedIncome is false. Line 1a = box 16 48,000 [PA p. 10]. Line 1b $0. Line 1c
  //   48,000. Line 2 $0. Line 3 = federal line 3b 1,800 [PA p. 15 / p. 32]. Lines 4, 5, 7, and 8 are $0. Line 9
  //   adds only the positive amounts [PA p. 20]: 48,000 + 1,800 + 12,000 = 61,800. Line 10 $0. Line 11 61,800.
  //   Line 12 3.07% x 61,800 = 1,897.26 [TRC] [PA p. 21]. Line 13 and line 24 1,600. Line 21 $0 (eligibility
  //   income 61,800 is over the tax-forgiveness table). Line 26 tax due 1,897.26 - 1,600 = 297.26.
  const g = graph(profileHPaRentalDividends);
  const expectStoppedOnly = (fg: Fg) => {
    const stopped = new Set(PROFILE_H_STOPPED);
    for (const path of submissionBlockingFacts.filter((p) => !p.includes(`*`) && p !== `/flowIncomplete`)) {
      const r = get(fg, path);
      if (stopped.has(path)) {
        expect(r.complete, path).toBe(true);
        expect(r.get, path).toBe(true);
      } else {
        expect(r.complete && r.get === true, path).toBe(false);
      }
    }
  };

  it(`Schedule E Part I net rental income on Schedule 1 line 5`, () => {
    expect(get(g, `/hasScheduleEIncome`).get).toBe(true);
    expect(get(g, `/scheduleESectionIsComplete`).get).toBe(true);
    expect(get(g, `/requiresSchedule1`).get).toBe(true);
    for (const path of [
      `/flowKnockoutScheduleELoss`,
      `/flowKnockoutScheduleEDepreciation`,
      `/flowKnockoutScheduleEPersonalUse`,
      `/flowKnockoutScheduleESubstantialServices`,
      `/flowKnockoutScheduleETradeOrBusinessQbi`,
      `/flowKnockoutScheduleEEitc`,
      `/flowKnockoutScheduleEPartII`,
      `/flowKnockoutScheduleEPartIV`,
    ]) {
      expect(get(g, path).complete, path).toBe(true);
      expect(get(g, path).get, path).toBe(false);
    }
    expectDollars(g, {
      '/scheduleERents': `15000.00`,
      '/scheduleERoyalties': `0.00`,
      '/scheduleEExpenses': `3000.00`,
      '/scheduleENetIncome': `12000.00`,
      '/scheduleEPartIILine32': `0.00`,
      '/scheduleEPartIIILine37': `0.00`,
      '/scheduleELine41': `12000.00`,
      '/schedule1Line5': `12000.00`,
    });
  });
  it(`Form 1040 income, standard deduction, and line 16 tax (QDCG worksheet)`, () => {
    expect(get(g, `/requiresScheduleB`).get).toBe(true);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).complete).toBe(true);
    expect(get(g, `/flowKnockoutScheduleBPartIII`).get).toBe(false);
    expect(get(g, `/requiresSchedule2`).get).toBe(false);
    expect(get(g, `/requiresForm8960`).get).toBe(false);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).complete).toBe(true);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
    expect(get(g, `/form6251Required`).get).toBe(false);
    expectDollars(g, {
      '/wages': `48000.00`,
      '/interestIncome': `0.00`,
      '/ordinaryDividends': `1800.00`,
      '/qualifiedDividends': `1200.00`,
      '/otherIncome': `12000.00`,
      '/totalIncome': `61800.00`,
      '/adjustmentsToIncome': `0.00`,
      '/agi': `61800.00`,
      '/standardOrItemizedDeductions': `16100.00`,
      '/taxableIncome': `45700.00`,
      '/qdcgLine1': `45700.00`,
      '/qdcgLine2': `1200.00`,
      '/qdcgLine3': `0.00`,
      '/qdcgLine4': `1200.00`,
      '/qdcgLine5': `44500.00`,
      '/qdcgLine6': `49450.00`,
      '/qdcgLine9': `1200.00`,
      '/qdcgLine10': `1200.00`,
      '/qdcgLine12': `0.00`,
      '/qdcgLine13': `545500.00`,
      '/qdcgLine18': `0.00`,
      '/qdcgLine21': `0.00`,
      '/qdcgLine22': `5095.00`,
      '/qdcgLine23': `5095.00`,
      '/qdcgLine24': `5239.00`,
      '/qdcgLine25': `5095.00`,
      '/tentativeTaxFromTaxableIncome': `5095.00`,
      '/amt': `0.00`,
      '/form6251Line4': `61800.00`,
      '/form8959Line7': `0.00`,
      '/form8960Line13': `61800.00`,
      '/form8960Line14': `200000.00`,
      '/form8960Line17': `0.00`,
      '/totalTax': `5095.00`,
      '/formW2Withholding': `5200.00`,
      '/totalPayments': `5200.00`,
      '/overpayment': `105.00`,
    });
  });
  it(`PA-40 line 6 is federal Schedule E Part I net; wages and dividends are still computed`, () => {
    expect(get(g, `/stateReturnPaFiled`).get).toBe(true);
    expect(get(g, `/stateReturnIsPaPartYear`).get).toBe(false);
    expect(get(g, `/paSchoolCode`).get.toString()).toBe(`22275`);
    expect(get(g, `/paLine6`).get.toString()).toBe(`12000.00`);
    expect(get(g, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(g, `/flowKnockoutStateReturn`).get).toBe(false);
    expectDollars(g, {
      '/paLine1a': `48000.00`,
      '/paLine1b': `0.00`,
      '/paLine1c': `48000.00`,
      '/paLine2': `0.00`,
      '/paLine3': `1800.00`,
      '/paLine4': `0.00`,
      '/paLine5': `0.00`,
      '/paLine6': `12000.00`,
      '/paLine9': `61800.00`,
      '/paLine11': `61800.00`,
      '/paLine12': `1897.26`,
      '/paLine13': `1600.00`,
      '/paLine21': `0.00`,
      '/paLine24': `1600.00`,
      '/paLine26': `297.26`,
      '/paLine29': `0.00`,
    });
    for (const path of [
      `/flowKnockoutPaUnsupportedIncome`,
      `/flowKnockoutPaScheduleA`,
      `/flowKnockoutPaScheduleB`,
      `/flowKnockoutPaScheduleD`,
      `/flowKnockoutPaDividends`,
      `/flowKnockoutPaPartYear`,
      `/flowKnockoutPaUnsupportedItems`,
      `/flowKnockoutPaNonresidentPaSourcePay`,
      `/flowKnockoutPaSpUnsupported`,
      `/flowKnockoutPaUnreimbursedEmployeeExpenses`,
    ]) {
      expect(get(g, path).complete, path).toBe(true);
      expect(get(g, path).get, path).toBe(false);
    }
    expectStoppedOnly(g);
    expectNotStopped(g);
  });
  it(`answering the rental no leaves line 6 at $0`, () => {
    // The same wages and dividends, with Schedule E Part I answered no. Line 6 is $0.
    const n = graph({ ...profileHPaRentalDividends, '/hadScheduleEIncome': createBooleanWrapper(false) });
    expect(get(n, `/hasScheduleEIncome`).get).toBe(false);
    expect(get(n, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expect(get(n, `/flowKnockoutStateReturn`).get).toBe(false);
    expectDollars(n, {
      '/scheduleENetIncome': `0.00`,
      '/agi': `49800.00`,
      '/paLine3': `1800.00`,
      '/paLine6': `0.00`,
      '/paLine9': `49800.00`,
      '/paLine12': `1528.86`,
      '/paLine29': `71.14`,
    });
    expectNotStopped(n);
  });
  it(`ordinary dividends of $2,501 do not require PA Schedule B`, () => {
    // PA-40 Schedule B (2025) instructions, PDF p. 3, WHO MUST COMPLETE: only when lines 2 through 11 have an amount.
    const n = graph({
      ...profileHPaRentalDividends,
      [`/dividendReports/#${profileHDividendId}/ordinaryDividends`]: createDollarWrapper(`2501`),
      [`/dividendReports/#${profileHDividendId}/writableQualifiedDividends`]: createDollarWrapper(`1200`),
    });
    expect(get(n, `/flowKnockoutPaScheduleB`).get).toBe(false);
    expect(get(n, `/flowKnockoutPaDividends`).get).toBe(false);
    expectDollars(n, { '/ordinaryDividends': `2501.00`, '/paLine3': `2501.00` });
    expectNotStopped(n);
  });
});

describe(`golden end-to-end scenario (synthetic data): profile H negative rows (each stops the return)`, () => {
  const stops = (facts: Record<string, unknown>, knockout: string) => {
    const n = graph(facts);
    expect(submissionBlockingFacts).toContain(knockout);
    expect(get(n, knockout).complete, knockout).toBe(true);
    expect(get(n, knockout).get, knockout).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).complete).toBe(true);
    expect(get(n, `/flowIsKnockedOut`).get).toBe(true);
    return n;
  };

  it(`depreciation (Form 4562) stops on the Schedule E depreciation knockout`, () => {
    const n = stops(
      { ...profileHPaRentalDividends, '/scheduleEHasDepreciation': createBooleanWrapper(true) },
      `/flowKnockoutScheduleEDepreciation`
    );
    expect(get(n, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expectDollars(n, { '/scheduleENetIncome': `12000.00`, '/paLine6': `12000.00` });
  });
  it(`expenses above rents stop on the Schedule E loss knockout`, () => {
    // Rents 15,000 - expenses 20,000 = a 5,000 loss. 26 U.S.C. 469, 465, and 461(l) are not computed.
    const n = stops(
      { ...profileHPaRentalDividends, '/scheduleEWritableExpenses': createDollarWrapper(`20000`) },
      `/flowKnockoutScheduleELoss`
    );
    expectDollars(n, { '/scheduleENetIncome': `-5000.00`, '/paLine6': `-5000.00` });
  });
  it(`box 2a capital gain distributions stop on the PA Schedule B knockout`, () => {
    // PA-40 Schedule B line 10. PA Schedule B (2025) instructions, PDF p. 3, WHO MUST COMPLETE, and PDF p. 4, LINE 10.
    const n = stops(
      {
        ...profileHPaRentalDividends,
        [`/dividendReports/#${profileHDividendId}/writableCapitalGainDistributions`]: createDollarWrapper(`10`),
      },
      `/flowKnockoutPaScheduleB`
    );
    expect(get(n, `/flowKnockoutPaDividends`).get).toBe(true);
    expect(get(n, `/flowKnockoutPaUnsupportedIncome`).get).toBe(false);
    expectDollars(n, { '/ordinaryDividends': `1800.00`, '/paLine3': `1800.00`, '/paLine6': `12000.00` });
  });
});

describe(`golden end-to-end scenario (synthetic data): profile I, MFJ, Florida, AMTI in the exemption phaseout`, () => {
  // Married filing jointly, Florida residents [FL]; both under 65 and not blind. Primary SSN 900-47-1010, spouse
  //   SSN 900-48-1011 (900 area, groups 47 and 48, outside the ITIN ranges). Address 123 Example St, Miami, FL
  //   33101. Spouse has no income forms. The filer does not itemize.
  // W-2 (primary): box 1 and box 5 $1,100,000, box 2 $300,000, box 6 $24,050. Box 6 is 1.45% x 1,100,000 = 15,950
  //   plus the employer's 0.9% on this employer's box 5 over $200,000, 0.9% x 900,000 = 8,100 [3101] [3102].
  //   No box 16 or 17. No interest, dividends, or sales.
  // Form 1040: line 1a 1,100,000; line 9 and line 11 (AGI) 1,100,000; line 12 standard deduction 32,200
  //   [RP p. 18 §4.14(1): "Married Individuals Filing Joint Returns and Surviving Spouses $32,200"]; line 15
  //   taxable income 1,067,800. Over $100,000, so the Tax Computation Worksheet [GI p. 36], [RP] p. 10 §4.01
  //   Table 1 (joint): "Over $768,700 $206,583.50 plus 37% of the excess over $768,700": 206,583.50 + 37% x
  //   299,100 = 206,583.50 + 110,667 = 317,250.50, entered 317,251 (half a dollar up).
  // Form 6251 [6251] [55] [55d]: line 1a 32,200 (no Schedule 1-A line 43); line 1b 1,067,800; line 2a 32,200
  //   (the standard deduction; IRC §56(b)(1)(E)). Line 4 AMTI 1,100,000, strictly between the joint threshold
  //   $1,000,000 and the complete phaseout $1,280,400 [RP p. 17 §4.10]. Line 5 exemption 140,200 [RP p. 16
  //   §4.10: "Joint Returns or Surviving Spouses $140,200"] less 50% x (1,100,000 - 1,000,000) = 50,000 [55d],
  //   so 90,200. Line 6 1,009,800. Line 6 is over the $244,500 28% breakpoint [RP p. 16 §4.10; IRC
  //   §55(b)(1)(A)], so line 7 is 28% x 1,009,800 - 4,890 = 282,744 - 4,890 = 277,854. The $4,890 offset is
  //   2% x $244,500 [6251 line 7]. No capital gain and no qualified dividends, so Part III is not used. Line 8
  //   is $0. Line 9 277,854. Line 10 regular tax 317,251. Line 11 AMT 0: the tentative minimum tax does not
  //   exceed the regular tax [55(a)]. Schedule 2 line 2 is line 11.
  // Form 8959 [3101]: line 1 Medicare wages 1,100,000; joint threshold 250,000 (§3101(b)(2)(A)); line 6 850,000;
  //   line 7 0.9% = 7,650 (Schedule 2 line 17b). Part V: line 19 box 6 24,050; line 21 1.45% x 1,100,000 =
  //   15,950; line 22 8,100; line 24 8,100 (1040 line 25c). No self-employment income.
  // Form 8960 [1411]: no interest, dividends, or gain, so net investment income is $0 and line 17 is $0. The
  //   filer does not itemize, so the Part II allocation stop does not apply.
  // Form 1040: line 16 317,251; line 17 0; line 18 317,251; line 22 317,251 (no credits; the TINs are not SSNs
  //   [EITC]); line 23 7,650; line 24 total tax 324,901; line 25a 300,000; line 25c 8,100; line 33 payments
  //   308,100; amount owed 16,801. FL: no return [FL].
  const g = graph(profileIMfjAmtPhaseout);

  it(`Form 1040 income, the standard deduction, and line 16 tax`, () => {
    expect(get(g, `/filingStatus`).get.toString()).toBe(`marriedFilingJointly`);
    expect(get(g, `/itemizesDeductions`).get).toBe(false);
    expectDollars(g, {
      '/wages': `1100000.00`,
      '/totalIncome': `1100000.00`,
      '/agi': `1100000.00`,
      '/standardOrItemizedDeductions': `32200.00`,
      '/taxableIncome': `1067800.00`,
      '/tentativeTaxFromTaxableIncome': `317251.00`,
    });
  });
  it(`Form 6251 exemption inside the joint phaseout, lines 7 through 11, and Schedule 2 line 2`, () => {
    expect(get(g, `/hasAmtPreferenceItems`).get).toBe(false);
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).complete).toBe(true);
    expect(get(g, `/flowKnockoutAmtPreferenceItems`).get).toBe(false);
    expect(get(g, `/flowKnockoutAmtMfsAddBack`).complete).toBe(true);
    expect(get(g, `/flowKnockoutAmtMfsAddBack`).get).toBe(false);
    expect(get(g, `/form6251UsesPartIII`).get).toBe(false);
    const amti = Number(get(g, `/form6251Line4`).get);
    // Strictly inside the band [RP p. 17 §4.10]: threshold $1,000,000, complete phaseout $1,280,400.
    expect(amti).toBeGreaterThan(1000000);
    expect(amti).toBeLessThan(1280400);
    // IRC §55(d)(1) exemption $140,200 [RP p. 16 §4.10], reduced under §55(d)(2) by 50% of the excess over the
    // threshold. §55(d)(4)(A)(ii)(IV) substitutes 50 percent for 25 percent [55d].
    const line5 = 140200 - 0.5 * (amti - 1000000);
    expect(get(g, `/form6251Line5`).get.toString()).toBe(line5.toFixed(2));
    expectDollars(g, {
      '/form6251ExemptionAmount': `140200.00`,
      '/form6251PhaseoutThreshold': `1000000.00`,
      '/form6251Line1b': `1067800.00`,
      '/form6251Line2a': `32200.00`,
      '/form6251Line4': `1100000.00`,
      '/form6251ExemptionReduction': `50000.00`,
      '/form6251Line5': `90200.00`,
      '/form6251Line6': `1009800.00`,
      '/form6251Line7': `277854.00`,
      '/form6251Line9': `277854.00`,
      '/form6251Line10': `317251.00`,
      '/amt': `0.00`,
      '/schedule2Line2': `0.00`,
    });
    expect(get(g, `/form6251Required`).get).toBe(false);
  });
  it(`Form 8959 Additional Medicare Tax on joint wages over $250,000`, () => {
    expect(get(g, `/requiresForm8959`).get).toBe(true);
    expectDollars(g, {
      '/form8959Line1': `1100000.00`,
      '/form8959Threshold': `250000.00`,
      '/form8959Line6': `850000.00`,
      '/form8959Line7': `7650.00`,
      '/line17bAdditionalMedicareTax': `7650.00`,
      '/form8959Line19': `24050.00`,
      '/form8959Line21': `15950.00`,
      '/form8959Line22': `8100.00`,
      '/form8959Line24': `8100.00`,
      '/line21OfSchedule2': `7650.00`,
    });
  });
  it(`Form 1040 total tax, payments, and amount owed`, () => {
    expectDollars(g, {
      '/totalAdditionalTaxesOwed': `0.00`,
      '/totalTax': `324901.00`,
      '/formW2Withholding': `300000.00`,
      '/totalWithholding': `308100.00`,
      '/totalPayments': `308100.00`,
      '/balanceDue': `16801.00`,
    });
  });
  it(`Florida files no state return, and nothing stops the return`, () => {
    expect(get(g, `/livedInFl`).get).toBe(true);
    expect(get(g, `/stateReturnComputed`).get).toBe(false);
    expect(get(g, `/stateReturnPaFiled`).get).toBe(false);
    expect(get(g, `/scheduleAWantsToItemize`).get).toBe(false);
    expect(get(g, `/flowKnockoutScheduleAOverallLimit`).get).toBe(false);
    expect(get(g, `/flowKnockoutForm8960Unsupported`).get).toBe(false);
    expectNotStopped(g);
  });
});
