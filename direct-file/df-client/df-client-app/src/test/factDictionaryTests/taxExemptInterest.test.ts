// Form 1040 line 2a = Σ 1099-INT box 8 + Σ 1099-DIV box 12.
// Form 1040 instr. (2025) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf (the posted file is still the TAX YEAR 2025
// draft dated Feb 25, 2026). p. 25, Line 2a: "In general, your tax-exempt stated interest should be shown in box 8
// of Form 1099-INT ... Enter the total on line 2a." and "Also include on line 2a any exempt-interest dividends from a
// mutual fund or other regulated investment company. This amount should be shown in box 12 of Form 1099-DIV."
// p. 23, Rounding Off to Whole Dollars: "drop amounts under 50 cents and increase amounts from 50 to 99 cents to
// the next dollar" and "include cents when adding the amounts and round off only the total."
// 26 U.S.C. 103(a): "gross income does not include interest on any State or local bond."
// 26 U.S.C. 852(b)(5)(B): an exempt-interest dividend is treated as interest excludable under section 103(a).
// 26 U.S.C. 6012(d): the return shall include exempt interest received or accrued.
// Synthetic TINs only: SSN 444-00-2101 (group 00) and EINs in the 99-900xxxx range.
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEinWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, makeChildData, makeW2Data, primaryFilerId, singleFilerData } from '../testData.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';

const int1 = `86c00000-0000-4000-8000-000000000001`;
const int2 = `86c00000-0000-4000-8000-000000000002`;
const div1 = `86c00000-0000-4000-8000-000000000003`;
const div2 = `86c00000-0000-4000-8000-000000000004`;
const w2Id = `4623aac9-6d6f-424e-9ba2-8cdf19d45b10`;
const childId = `86c00000-0000-4000-8000-000000000006`;
const filerTin = createTinWrapper({ area: `444`, group: `00`, serial: `2101` });
const childTin = createTinWrapper({ area: `444`, group: `00`, serial: `2102` });

type Fg = ReturnType<typeof setupFactGraph>[`factGraph`];
const get = (fg: Fg, p: string) => fg.get(p as ConcretePath);
const val = (fg: Fg, p: string) => {
  const r = get(fg, p);
  expect(r.complete, `${p} complete`).toBe(true);
  return r.get.toString();
};

const interest = (id: string, box8: string, box1 = `0`, box9 = `0`, box13 = `0`) => ({
  [`/interestReports/#${id}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/interestReports/#${id}/payer`]: createStringWrapper(`City Water Authority`),
  [`/interestReports/#${id}/payer/tin`]: createEinWrapper(`99`, `9002101`),
  [`/interestReports/#${id}/writable1099Amount`]: createDollarWrapper(box1),
  [`/interestReports/#${id}/writableTaxExemptInterest`]: createDollarWrapper(box8),
  [`/interestReports/#${id}/writableSpecifiedPrivateActivityBondInterest`]: createDollarWrapper(box9),
  [`/interestReports/#${id}/writableBondPremiumOnTaxExemptBond`]: createDollarWrapper(box13),
  [`/interestReports/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});
const dividend = (id: string, box12: string, box1a = `0`, otherBoxes = false, box13 = `0`) => ({
  [`/dividendReports/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${id}/payer`]: createStringWrapper(`National Muni Fund`),
  [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(box1a),
  [`/dividendReports/#${id}/writableExemptInterestDividends`]: createDollarWrapper(box12),
  [`/dividendReports/#${id}/writableSpecifiedPrivateActivityBondInterestDividends`]: createDollarWrapper(box13),
  [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(otherBoxes),
  [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});

const graph = (extra: Record<string, unknown>) =>
  setupFactGraph({
    ...baseFilerData,
    ...singleFilerData,
    [`/filers/#${primaryFilerId}/tin`]: filerTin,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    '/filerResidenceAndIncomeState': createEnumWrapper(`nj`, `/scopedStateOptions`),
    '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
    '/soldCapitalAssets': createBooleanWrapper(false),
    '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
    '/paHasUnsupportedItems': createBooleanWrapper(false),
    '/paHasEstimatedInstallmentPayments': createBooleanWrapper(false),
    '/paHasExemptObligationDividends': createBooleanWrapper(false),
    '/paHasSpNontaxableIncome': createBooleanWrapper(false),
    ...extra,
  }).factGraph;

const withW2 = (wages: number) => ({
  ...makeW2Data(wages, w2Id),
  [`/formW2s/#${w2Id}/ein`]: createEinWrapper(`99`, `9002102`),
});

describe(`Form 1040 line 2a tax-exempt interest`, () => {
  it(`sums 1099-INT box 8 and 1099-DIV box 12, then rounds only the total`, ({ task }) => {
    task.meta.testedFactPaths = [`/taxExemptInterest`, `/totalExemptInterestDividends`, `/interestIncome`];
    // 100.40 + 50.25 + 10.10 + 0.14 = 160.89 → 161. 1.24 + 1.25 = 2.49 → 2. 0.25 + 0.25 = 0.50 → 1.
    const cents = graph({
      '/interestReports': createCollectionWrapper([int1, int2]),
      ...interest(int1, `100.40`),
      ...interest(int2, `50.25`),
      '/dividendReports': createCollectionWrapper([div1, div2]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `10.10`),
      ...dividend(div2, `0.14`),
    });
    expect(val(cents, `/totalExemptInterestDividends`)).toBe(`10.24`);
    expect(val(cents, `/taxExemptInterest`)).toBe(`161.00`);
    // 26 U.S.C. 103(a): the amount is not gross income, so line 2b and total income stay at wages only.
    expect(val(cents, `/interestIncome`)).toBe(`0.00`);

    const underHalf = graph({
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `1.24`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `1.25`),
    });
    expect(val(underHalf, `/taxExemptInterest`)).toBe(`2.00`);

    const halfUp = graph({
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `0.25`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `0.25`),
    });
    expect(val(halfUp, `/taxExemptInterest`)).toBe(`1.00`);
  });

  it(`a blank box 8 or box 12 is $0, and line 2a is a complete $0 with no forms`, () => {
    const blank = graph({
      '/interestReports': createCollectionWrapper([int1]),
      [`/interestReports/#${int1}/has1099`]: createBooleanWrapper(true),
      [`/interestReports/#${int1}/writable1099Amount`]: createDollarWrapper(`25`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `0`, `40`),
    });
    expect(val(blank, `/taxExemptInterest`)).toBe(`0.00`);
    expect(val(blank, `/interestIncome`)).toBe(`25.00`);
    expect(val(blank, `/ordinaryDividends`)).toBe(`40.00`);
    expect(val(graph({}), `/taxExemptInterest`)).toBe(`0.00`);
  });

  it(`box 8 and box 12 do not stop the return; box 9 and box 13 cannot exceed them; 1099-INT box 13 still stops`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutHasBonds`,
      `/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`,
      `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`,
      `/flowKnockoutDividendUnsupportedBoxes`,
      `/flowIsKnockedOut`,
    ];
    const supported = graph({
      ...withW2(40000),
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `500`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `125`),
    });
    expect(val(supported, `/taxExemptInterest`)).toBe(`625.00`);
    expect(get(supported, `/flowKnockoutHasBonds`).get).toBe(false);
    expect(get(supported, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(get(supported, `/flowIsKnockedOut`).get).toBe(false);

    // 26 U.S.C. 57(a)(5); 1099-INT instructions, box 9: "This amount is included in box 8."
    const box9 = graph({
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `500`, `0`, `500`, `0`),
    });
    expect(get(box9, `/flowKnockoutHasBonds`).get).toBe(false);
    expect(get(box9, `/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`).get).toBe(false);
    const box9Over = graph({
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `500`, `0`, `501`, `0`),
    });
    expect(get(box9Over, `/flowKnockoutHasBonds`).get).toBe(false);
    expect(get(box9Over, `/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`).get).toBe(true);
    expect(get(box9Over, `/flowIsKnockedOut`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutSpecifiedPrivateActivityBondInterestExceedsBox8`);

    // i1040gi p. 25: line 2a is the net of tax-exempt interest over amortized bond premium. Box 13 is not netted.
    const box13 = graph({
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `500`, `0`, `0`, `1`),
    });
    expect(get(box13, `/flowKnockoutHasBonds`).get).toBe(true);

    // 1099-DIV instructions, box 13: "This amount is included in box 12." Equal amounts are allowed.
    const divBox13 = graph({
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `20`, `0`, false, `20`),
    });
    expect(get(divBox13, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(get(divBox13, `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`).get).toBe(false);
    const divBox13Over = graph({
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `20`, `0`, false, `21`),
    });
    expect(get(divBox13Over, `/flowKnockoutDividendUnsupportedBoxes`).get).toBe(false);
    expect(get(divBox13Over, `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`).get).toBe(true);
    expect(submissionBlockingFacts).toContain(`/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`);
  });

  it(`line 2a moves §86 combined income and taxable social security benefits`, ({ task }) => {
    // 26 U.S.C. 86(b)(2)(B): modified adjusted gross income is "increased by the amount of interest received or accrued
    // ... which is exempt from tax." 26 U.S.C. 86(b)(1)(A) adds one-half of social security benefits and compares the
    // sum to the base amount. 26 U.S.C. 86(c)(1)(A): base amount $25,000. Worksheet: i1040gi PDF p. 32, line 4 "Enter
    // the amount, if any, from Form 1040 or 1040-SR, line 2a", line 5 "Combine lines 2, 3, and 4", line 8 $25,000.
    // Single. Benefits $20,000 (line 2 = $10,000). Wages $10,000 (line 3). No adjustments (line 6 = $0).
    // Without line 2a, line 7 = $20,000, which is under $25,000, so line 6b = $0.
    // With line 2a $6,000, line 7 = $26,000. Line 9 = $1,000. Line 10 = $9,000 (86(c)(2) $34,000 − $25,000).
    // Line 16 = 50% × $1,000 = $500, which is under 85% of benefits.
    task.meta.testedFactPaths = [
      `/taxExemptInterest`,
      `/socialSecurityBenefitsWkshtLine7`,
      `/taxableSocialSecurityBenefits`,
    ];
    // formType is derived (always SSA-1099), so it is not written. Box 5 is /ssaNetBenefits.
    const ssId = `86c00000-0000-4000-8000-000000000005`;
    const base = {
      ...withW2(10000),
      '/socialSecurityReports': createCollectionWrapper([ssId]),
      [`/socialSecurityReports/#${ssId}/ssaNetBenefits`]: createDollarWrapper(`20000`),
      [`/socialSecurityReports/#${ssId}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`/socialSecurityReports/#${ssId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
    };
    const none = graph(base);
    expect(val(none, `/taxExemptInterest`)).toBe(`0.00`);
    expect(val(none, `/socialSecurityBenefitsWkshtLine3`)).toBe(`10000.00`);
    expect(val(none, `/socialSecurityBenefitsWkshtLine7`)).toBe(`20000.00`);
    expect(val(none, `/taxableSocialSecurityBenefits`)).toBe(`0.00`);

    const fromBox8 = graph({
      ...base,
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `4000.40`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `1999.60`),
    });
    expect(val(fromBox8, `/taxExemptInterest`)).toBe(`6000.00`);
    expect(val(fromBox8, `/socialSecurityBenefitsWkshtLine3`)).toBe(`10000.00`);
    expect(val(fromBox8, `/socialSecurityBenefitsWkshtLine7`)).toBe(`26000.00`);
    expect(val(fromBox8, `/taxableSocialSecurityBenefits`)).toBe(`500.00`);
  });

  it(`line 2a increases §36B MAGI and leaves AGI unchanged`, ({ task }) => {
    // 26 U.S.C. 36B(d)(2)(B)(ii): modified adjusted gross income is adjusted gross income increased by "any amount of
    // interest received or accrued by the taxpayer during the taxable year which is exempt from tax."
    // Wages $31,300 are AGI (no adjustments). Line 2a $1,565. Household income $32,865.
    // 48-state poverty line for one person $15,650 (ptc /federalPovertyLevelThreshold). 32,865 / 15,650 = 210%.
    // Without line 2a the same wages are 200% (31,300 / 15,650).
    task.meta.testedFactPaths = [`/agi`, `/ptcMagi`, `/householdIncome`, `/householdIncomeAsPercent`];
    const wagesOnly = graph(withW2(31300));
    const withLine2a = graph({
      ...withW2(31300),
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `1000`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `565`),
    });
    expect(val(wagesOnly, `/agi`)).toBe(`31300.00`);
    expect(val(withLine2a, `/agi`)).toBe(`31300.00`);
    expect(val(withLine2a, `/totalIncome`)).toBe(`31300.00`);
    expect(val(wagesOnly, `/ptcMagi`)).toBe(`31300.00`);
    expect(val(withLine2a, `/taxExemptInterest`)).toBe(`1565.00`);
    expect(val(withLine2a, `/ptcMagi`)).toBe(`32865.00`);
    expect(val(withLine2a, `/householdIncome`)).toBe(`32865.00`);
    expect(val(wagesOnly, `/federalPovertyLevelThreshold`)).toBe(`15650.00`);
    expect(val(wagesOnly, `/householdIncomeAsPercent`)).toBe(`200`);
    expect(val(withLine2a, `/householdIncomeAsPercent`)).toBe(`210`);
  });

  it(`line 2a counts toward the EITC investment-income limit`, ({ task }) => {
    // i1040gi PDF p. 40, Investment Income step 1: "Add the amounts from Form 1040 or 1040-SR: Line 2a, Line 2b, Line
    // 3b, Line 7a" (line 7a not below zero). 26 U.S.C. 32(i)(2)(B): disqualified income includes "interest received or
    // accrued during the taxable year which is exempt from tax imposed by this chapter,". Exempt-interest dividends are that interest under
    // 26 U.S.C. 852(b)(5)(B). 26 U.S.C. 32(i)(2)(A) is interest and dividends includible in gross income (lines 2b and
    // 3b). Rev. Proc. 2025-32 §4.06(2), PDF p. 15: the disqualified-income amount for 2026 is $12,200.
    // Head of household, one qualifying child, wages $5,000 (under the earned-income limit). Child SSN 444-00-2102.
    task.meta.testedFactPaths = [`/belowEitcInvestmentIncomeLimit`, `/maybeEligibleForEitc`];
    const child = {
      '/familyAndHousehold': createCollectionWrapper([childId]),
      ...makeChildData(childId, `2012-01-01`),
      [`/familyAndHousehold/#${childId}/tin`]: childTin,
      [`/filingStatus`]: createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
      ...withW2(5000),
    };
    const atLimit = graph({
      ...child,
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `12200`),
    });
    expect(val(atLimit, `/taxExemptInterest`)).toBe(`12200.00`);
    expect(get(atLimit, `/belowEitcInvestmentIncomeLimit`).get).toBe(true);
    expect(get(atLimit, `/maybeEligibleForEitc`).get).toBe(true);

    // 12,200.50 rounds to 12,201 on line 2a (i1040gi p. 23), which is over $12,200.
    const overByRounding = graph({
      ...child,
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `12200.50`),
    });
    expect(val(overByRounding, `/taxExemptInterest`)).toBe(`12201.00`);
    expect(get(overByRounding, `/belowEitcInvestmentIncomeLimit`).get).toBe(false);
    expect(get(overByRounding, `/maybeEligibleForEitc`).get).toBe(false);

    // Line 2b $10,000 (32(i)(2)(A)) + line 2a $2,201 from box 12 = $12,201.
    const mixed = graph({
      ...child,
      '/interestReports': createCollectionWrapper([int1]),
      ...interest(int1, `0`, `10000`),
      '/dividendReports': createCollectionWrapper([div1]),
      '/dividendReportsIsDone': createBooleanWrapper(true),
      ...dividend(div1, `2201`),
    });
    expect(val(mixed, `/interestIncome`)).toBe(`10000.00`);
    expect(val(mixed, `/taxExemptInterest`)).toBe(`2201.00`);
    expect(get(mixed, `/belowEitcInvestmentIncomeLimit`).get).toBe(false);
    expect(get(mixed, `/maybeEligibleForEitc`).get).toBe(false);
  });
});
