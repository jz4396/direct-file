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
  createTinWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeChildData,
  makeW2Data,
  mfjFilerData,
  primaryFilerId,
  spouseId,
} from '../testData.js';

/**
 * Schedule 8812 (Form 1040) 2026 draft (https://www.irs.gov/pub/irs-dft/f1040s8--dft.pdf), page 2, Part II-B, for
 * filers with three or more qualifying children:
 *   21 "Withheld social security, Medicare, and Additional Medicare taxes from Form(s) W-2, boxes 4 and 6"
 *   22 "Enter the total of the amounts from Schedule 1 (Form 1040), line 15; Schedule 2 (Form 1040), line 16c; and
 *      Schedule 2 (Form 1040), line 17c"
 *   23 "Add lines 21 and 22"; 24 earned income credit (+ Schedule 3 line 11); 25 "Subtract line 24 from line 23"
 *   26 "Enter the larger of line 20 or line 25"; 27 "the smaller of line 17 or line 26"
 * 26 U.S.C. 24(d)(2)(A)(ii) counts "50 percent of the taxes imposed by section 1401 on the self-employment income of
 * the taxpayer" as social security taxes: the 26 U.S.C. 164(f) deduction on Schedule 1 line 15.
 *
 * Synthetic data with test-only 9xx numbers. The children are declared tinType = ssn; 9xx numbers are never SSNs in
 * the fact graph, so these graphs exercise the computation only and are not fileable (/familyAndHouseholdHasInvalidTIN
 * is true; #181, #182).
 *
 * Shared hand computation: 3 qualifying children under 17, so line 5 = 3 x $2,200 = $6,600 and line 16b =
 * 3 x $1,700 = $5,100 (Rev. Proc. 2025-32 §4.05, p. 14). AGI stays under the standard deduction, so tax and line 14
 * are 0, line 16a = $6,600 and line 17 = $5,100. $13,000 of ordinary dividends is over the $12,200 EITC investment
 * income limit, so the EITC (line 24) is $0. Schedule SE: net earnings = round(profit x 0.9235); SE tax =
 * round(12.4%) + round(2.9%); Schedule 1 line 15 = round(half).
 */
const kids = [
  `c8812000-0000-4000-8000-000000000001`,
  `c8812000-0000-4000-8000-000000000002`,
  `c8812000-0000-4000-8000-000000000003`,
];
const biz1 = `b8812000-0000-4000-8000-000000000001`;
const biz2 = `b8812000-0000-4000-8000-000000000002`;
const div = `d8812000-0000-4000-8000-000000000001`;

const children = Object.assign(
  {
    '/familyAndHousehold': createCollectionWrapper(kids),
  },
  ...kids.map((id, i) => ({
    ...makeChildData(id, `2016-0${i + 1}-15`),
    [`/familyAndHousehold/#${id}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `001${i + 1}` }),
  }))
);

/** Facts needed for a complete /totalTax, without the base data's W-2. */
const completeNoW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

const base = {
  ...baseFilerData,
  ...completeNoW2,
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `0001` }),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1987-01-01`),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
  '/scheduleAWantsToItemize': createBooleanWrapper(false),
  '/receivedImproperClaims': createBooleanWrapper(false),
  ...children,
};

const dividends = (amount: number) => ({
  '/dividendReports': createCollectionWrapper([div]),
  [`/dividendReports/#${div}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${div}/payer`]: createStringWrapper(`Index Fund Co`),
  [`/dividendReports/#${div}/ordinaryDividends`]: createDollarWrapper(`${amount}`),
  [`/dividendReports/#${div}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${div}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/dividendReportsIsDone': createBooleanWrapper(true),
});

const business = (id: string, filer: string, profit: number) => ({
  [`/scheduleCBusinesses/#${id}/filer`]: createCollectionItemWrapper(filer),
  [`/scheduleCBusinesses/#${id}/businessName`]: createStringWrapper(`Gig Work ${id.slice(-1)}`),
  [`/scheduleCBusinesses/#${id}/writableGrossReceipts`]: createDollarWrapper(`${profit}`),
  [`/scheduleCBusinesses/#${id}/writableTotalExpenses`]: createDollarWrapper(`0`),
});

const scheduleC = (...b: { id: string; filer: string; profit: number }[]) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/wantsQbiDeduction': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper(b.map((x) => x.id)),
  ...Object.assign({}, ...b.map((x) => business(x.id, x.filer, x.profit))),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});

const dollars = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], path: string) => {
  const r = fg.get(path as ConcretePath);
  expect(r.complete, `${path} complete`).toBe(true);
  return r.get.toString();
};

/** The Schedule C stops that could apply here: none does (QBI not requested; no EITC or CDCC; MAGI under 1411(b)). */
const scheduleCKnockouts = [
  `/flowKnockoutScheduleCEarnedIncomeCredits`,
  `/flowKnockoutScheduleCQbi`,
  `/flowKnockoutScheduleCSpouseBusiness`,
  `/flowKnockoutForm8960Unsupported`,
];

const partIIBFacts = [
  `/pdf8812ContinueFromLine20`,
  `/pdf8812Line20`,
  `/pdf8812Line21`,
  `/actcSelfEmploymentAndOtherTaxes`,
  `/pdf8812Line22`,
  `/actcSocialSecurityTaxes`,
  `/pdf8812Line23`,
  `/pdf8812Line24`,
  `/socialSecurityOverEitc`,
  `/pdf8812Line25`,
  `/maximumActc`,
  `/pdf8812Line26`,
  `/additionalCtc`,
];

describe(`Schedule 8812 Part II-B lines 21-27 (2026 draft)`, () => {
  it(`HOH, 3 children, $13,000 dividends, $4,000 Schedule C: line 22 $283 lifts line 27 from $183 to $283`, ({
    task,
  }) => {
    task.meta.testedFactPaths = partIIBFacts;
    // SE: round(4,000 x .9235) = 3,694; round(458.06) + round(107.13) = 458 + 107 = 565; half = 282.50 -> 283.
    // 18a = 4,000 - 283 = 3,717; line 20 = round(15% x (3,717 - 2,500)) = round(182.55) = 183 < line 17 $5,100.
    // 21 = 0; 22 = 283; 23 = 283; 24 = 0; 25 = 283; 26 = max(183, 283) = 283; 27 = min(5,100, 283) = 283.
    const { factGraph } = setupFactGraph({
      ...base,
      ...dividends(13000),
      ...scheduleC({ id: biz1, filer: primaryFilerId, profit: 4000 }),
    });
    expect(factGraph.get(`/eitcQualified` as ConcretePath).get).toBe(false);
    expect(factGraph.get(`/familyAndHouseholdHasInvalidTIN` as ConcretePath).get).toBe(true);
    for (const ko of scheduleCKnockouts) {
      expect(factGraph.get(ko as ConcretePath).complete, `${ko} complete`).toBe(true);
      expect(factGraph.get(ko as ConcretePath).get, ko).toBe(false);
    }
    expect(dollars(factGraph, `/schedule1Line15`)).toBe(`283.00`);
    expect(dollars(factGraph, `/pdf8812Line17`)).toBe(`5100.00`);
    expect(dollars(factGraph, `/pdf8812Line18a`)).toBe(`3717.00`);
    expect(dollars(factGraph, `/pdf8812Line20`)).toBe(`183.00`);
    expect(factGraph.get(`/pdf8812ContinueFromLine20` as ConcretePath).get).toBe(true);
    expect(dollars(factGraph, `/pdf8812Line21`)).toBe(`0.00`);
    expect(dollars(factGraph, `/pdf8812Line22`)).toBe(`283.00`);
    expect(dollars(factGraph, `/pdf8812Line23`)).toBe(`283.00`);
    expect(dollars(factGraph, `/pdf8812Line24`)).toBe(`0.00`);
    expect(dollars(factGraph, `/pdf8812Line25`)).toBe(`283.00`);
    expect(dollars(factGraph, `/pdf8812Line26`)).toBe(`283.00`);
    expect(dollars(factGraph, `/additionalCtc`)).toBe(`283.00`);
  });

  it(`MFJ, both spouses with Schedule C: line 22 is Schedule 1 line 15 as a whole ($212 + $142 = $354)`, ({ task }) => {
    task.meta.testedFactPaths = partIIBFacts;
    // Per spouse (26 U.S.C. 1402; one Schedule SE each):
    //   $3,000: round(2,770.50) = 2,771; round(343.60) + round(80.36) = 344 + 80 = 424; half = 212.
    //   $2,000: 1,847; round(229.03) + round(53.56) = 229 + 54 = 283; half = 141.50 -> 142.
    // Schedule 1 line 15 = 212 + 142 = 354. The graph runs one Schedule SE on the combined $5,000 (4,618;
    // 573 + 134 = 707; half 354), equal here; a secondary filer's business stops the return
    // (/flowKnockoutScheduleCSpouseBusiness), so this graph checks the arithmetic only.
    // 18a = 5,000 - 354 = 4,646; line 20 = round(15% x 2,146) = round(321.90) = 322.
    // 22 = 354; 23 = 354; 25 = 354; 26 = max(322, 354) = 354; 27 = 354.
    const { factGraph } = setupFactGraph({
      ...base,
      ...mfjFilerData,
      [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `0002` }),
      [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
      '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
      ...dividends(13000),
      ...scheduleC({ id: biz1, filer: primaryFilerId, profit: 3000 }, { id: biz2, filer: spouseId, profit: 2000 }),
    });
    expect(factGraph.get(`/flowKnockoutScheduleCSpouseBusiness` as ConcretePath).get).toBe(true);
    expect(dollars(factGraph, `/schedule1Line15`)).toBe(`354.00`);
    expect(dollars(factGraph, `/pdf8812Line17`)).toBe(`5100.00`);
    expect(dollars(factGraph, `/pdf8812Line20`)).toBe(`322.00`);
    expect(dollars(factGraph, `/pdf8812Line22`)).toBe(dollars(factGraph, `/schedule1Line15`));
    expect(dollars(factGraph, `/pdf8812Line22`)).toBe(`354.00`);
    expect(dollars(factGraph, `/pdf8812Line23`)).toBe(`354.00`);
    expect(dollars(factGraph, `/pdf8812Line25`)).toBe(`354.00`);
    expect(dollars(factGraph, `/pdf8812Line26`)).toBe(`354.00`);
    expect(dollars(factGraph, `/additionalCtc`)).toBe(`354.00`);
  });

  it(`HOH, 3 children, $13,000 dividends, $10,000 Schedule C: line 20 $1,019 > line 25 $707, so 26 and 27 = line 20`, ({
    task,
  }) => {
    task.meta.testedFactPaths = partIIBFacts;
    // SE: 9,235; round(1,145.14) + round(267.82) = 1,145 + 268 = 1,413; half = 706.50 -> 707.
    // 18a = 10,000 - 707 = 9,293; line 20 = round(15% x 6,793) = round(1,018.95) = 1,019 < line 17 $5,100.
    // 22 = 707; 23 = 707; 25 = 707; 26 = max(1,019, 707) = 1,019; 27 = min(5,100, 1,019) = 1,019.
    const { factGraph } = setupFactGraph({
      ...base,
      ...dividends(13000),
      ...scheduleC({ id: biz1, filer: primaryFilerId, profit: 10000 }),
    });
    expect(dollars(factGraph, `/pdf8812Line20`)).toBe(`1019.00`);
    expect(factGraph.get(`/pdf8812ContinueFromLine20` as ConcretePath).get).toBe(true);
    expect(dollars(factGraph, `/pdf8812Line22`)).toBe(`707.00`);
    expect(dollars(factGraph, `/pdf8812Line23`)).toBe(`707.00`);
    expect(dollars(factGraph, `/pdf8812Line25`)).toBe(`707.00`);
    expect(dollars(factGraph, `/pdf8812Line26`)).toBe(`1019.00`);
    expect(dollars(factGraph, `/additionalCtc`)).toBe(`1019.00`);
  });

  it(`W-2 only: line 22 is $0, line 23 = line 21, and line 25 is withheld taxes less the EITC as before`, ({
    task,
  }) => {
    task.meta.testedFactPaths = partIIBFacts;
    // $4,000 wages, $248 social security + $58 Medicare withheld: line 21 = 306. 18a = 4,000;
    // line 20 = round(15% x 1,500) = 225. 22 = 0; 23 = 306; 24 = EITC; 25 = max(306 - EITC, 0);
    // 26 = larger of 20 and 25; 27 = smaller of 17 and 26.
    const w2 = `a8812000-0000-4000-8000-000000000001`;
    const { factGraph } = setupFactGraph({
      ...base,
      ...makeW2Data(4000, w2),
      [`/formW2s/#${w2}/tin`]: createTinWrapper({ area: `900`, group: `00`, serial: `0001` }),
      [`/formW2s/#${w2}/writableOasdiWages`]: createDollarWrapper(`4000`),
      [`/formW2s/#${w2}/writableMedicareWages`]: createDollarWrapper(`4000`),
      [`/formW2s/#${w2}/writableOasdiWithholding`]: createDollarWrapper(`248`),
      [`/formW2s/#${w2}/writableMedicareWithholding`]: createDollarWrapper(`58`),
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    const eitc = Number(dollars(factGraph, `/earnedIncomeCredit`));
    const line25 = Math.max(306 - eitc, 0);
    expect(dollars(factGraph, `/schedule1Line15`)).toBe(`0.00`);
    expect(dollars(factGraph, `/pdf8812Line20`)).toBe(`225.00`);
    expect(factGraph.get(`/pdf8812ContinueFromLine20` as ConcretePath).get).toBe(true);
    expect(dollars(factGraph, `/pdf8812Line21`)).toBe(`306.00`);
    expect(dollars(factGraph, `/pdf8812Line22`)).toBe(`0.00`);
    expect(dollars(factGraph, `/pdf8812Line23`)).toBe(`306.00`);
    expect(Number(dollars(factGraph, `/pdf8812Line24`))).toBe(eitc);
    expect(Number(dollars(factGraph, `/pdf8812Line25`))).toBe(line25);
    expect(Number(dollars(factGraph, `/socialSecurityOverEitc`))).toBe(line25);
    expect(Number(dollars(factGraph, `/pdf8812Line26`))).toBe(Math.max(225, line25));
    expect(Number(dollars(factGraph, `/additionalCtc`))).toBe(Math.min(5100, Math.max(225, line25)));
  });
});
