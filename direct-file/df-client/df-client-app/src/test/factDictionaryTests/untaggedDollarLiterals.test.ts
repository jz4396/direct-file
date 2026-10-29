import { describe, it, expect } from 'vitest';
import { readXmlModules } from '../../fact-dictionary/yearConfig/yearConfig.js';

/**
 * Every non-zero <Dollar> literal, every <Rational> that is not 0 and not n/n, and every <Int>
 * whose absolute value is at least 100 belongs to a fact tagged <TaxYear>, so it is listed
 * in the year's parameter file with the authority for it (Rev. Proc. page and quote, IRC
 * section and quote, an IRS form or instructions page and quote, or the HHS poverty
 * guidelines notice). Fact paths written with single quotes are included.
 *
 * The facts below are the only exceptions. A `structural` entry is arithmetic, not a
 * tax-law amount (rounding to a table band, cents, a sign test, a field length). A
 * `remaining` entry is a tax-law amount that still needs a citable source or a review of
 * its value before it can be tagged. A new untagged literal of those kinds, or an entry
 * here that no longer needs to be here, fails this test.
 */
type Exception = { kind: `structural` | `remaining`; reason: string };

const CENTS_INPUT = `rounds a typed amount to whole dollars`;
const TAX_TABLE = `Tax Table band rounding ($5/$25/$50 bands up to $100,000 and the $3,000 band start)`;
const EITC_TABLE = `EIC Table band rounding`;
const UNIT_DOLLAR = `multiplies by $1 to turn a ratio into a Dollar`;
const PHASEOUT_ROUNDING = `rounds up to the next $1,000 before the phaseout rate`;
const THOUSAND_SCALE = `1/1000 scale factor: count of whole $1,000s before a phaseout that is cited on the threshold fact`;
const HUNDRED_SCALE = `100/1 scale factor: multiplies that count by the $100 already cited on the phaseout fact`;

const EXCEPTIONS: Record<string, Exception> = {
  '/carLoanPartialThousandAddend': {
    kind: `structural`,
    reason: `adds $999.99 so a partial $1,000 increases to the next whole thousand before the § 163(h)(4)(C) rate on /carLoanLine35`,
  },
  '/carLoanLine34': {
    kind: `structural`,
    reason: `adds $999.99 then multiplies by 1/1000 to round up to the next $1,000; the $200 rate is /carLoanLine35`,
  },
  '/roundedDependentCreditMagiAboveThreshold': { kind: `structural`, reason: PHASEOUT_ROUNDING },
  '/cdccCareExpensesSecondPhaseoutStep': {
    kind: `structural`,
    reason: `§ 21(a)(2) one percentage point per $2,000 ($4,000 joint) stored as 1/2000 and 1/4000`,
  },
  '/cdccCareExpensesDecimalAmount': {
    kind: `structural`,
    reason: `§ 21(a)(2) percentage steps written as decimals, including the 1/2000 step`,
  },
  '/writableCdccCarryoverAmountFromPriorTaxYear': { kind: `structural`, reason: `minimum of one cent` },
  '/maxEitcFromAGI': { kind: `structural`, reason: EITC_TABLE },
  '/eitcAmountWithoutCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcRoundedEarnedIncomeWithoutCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcAmountWithPrimaryCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcRoundedEarnedIncomeWithPrimaryCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcAmountWithSecondaryCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcRoundedEarnedIncomeWithSecondaryCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcAmountWithBothTPCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcRoundedEarnedIncomeWithBothTPCombatPay': { kind: `structural`, reason: EITC_TABLE },
  '/eitcRoundedAGI': { kind: `structural`, reason: EITC_TABLE },
  '/roundedTaxableIncome': { kind: `structural`, reason: TAX_TABLE },
  '/qdcgRoundedLine5': { kind: `structural`, reason: TAX_TABLE },
  '/minimumInterestIncome': {
    kind: `structural`,
    reason: `$10 Form 1099-INT payer reporting floor; bounds an input, not a tax amount`,
  },
  '/minimumUnemploymentCompensation': {
    kind: `structural`,
    reason: `$10 Form 1099-G payer reporting floor; bounds an input, not a tax amount`,
  },
  '/householdIncomeAsPercent': { kind: `structural`, reason: UNIT_DOLLAR },
  '/applicableFigure': {
    kind: `structural`,
    reason: `Form 8962 line 7 applicable figure rounded to four decimals by scaling with 1/10000`,
  },
  '/ptcAnnualContributionAmount': { kind: `structural`, reason: UNIT_DOLLAR },
  '/meetsOneDollarCombinedCreditLimit': {
    kind: `structural`,
    reason: `checks whether the combined credit limit is exactly $1`,
  },
  '/socialSecurityBenefitsWkshtLine7': { kind: `structural`, reason: `one-half written as a Dollar` },
  '/socialSecurityBenefitsAreLossUpto3k': {
    kind: `structural`,
    reason: `sign test against the § 1341(a)(3) $3,000 (cited on /maximumSocialSecurityBenefitsRepaidSupported)`,
  },
  '/socialSecurityBenefitsAreLossGreaterThan3k': {
    kind: `structural`,
    reason: `sign test against the § 1341(a)(3) $3,000 (cited on /maximumSocialSecurityBenefitsRepaidSupported)`,
  },
  '/taxableSocialSecurityBenefits': { kind: `remaining`, reason: `§ 86(a)(2) 85 percent stored as a Dollar` },
  '/socialSecurityBenefitsWkshtLine16': { kind: `remaining`, reason: `§ 86(a) 85 and 50 percent stored as Dollars` },
  '/w2MinAmount': {
    kind: `structural`,
    reason: `unused $600 constant; Form W-2 furnishing is § 6051(a), not the § 6041(a) information-return threshold`,
  },
  '/paScheduleAThreshold': {
    kind: `remaining`,
    reason: `tool limit of $2,500 on top of PA Schedule A triggers; 2026 PA-40 instructions are not published`,
  },
  '/paScheduleBThreshold': {
    kind: `remaining`,
    reason: `tool limit of $2,500 on top of PA Schedule B triggers; 2026 PA-40 instructions are not published`,
  },
  '/paSpTableBase': {
    kind: `remaining`,
    reason: `standing PA Tax Forgiveness table ($6,500 / $13,000 / $9,500); 2026 PA-40 instructions are not published`,
  },
  '/paSpLine15': {
    kind: `remaining`,
    reason: `standing PA Tax Forgiveness $250 columns and 9/10 through 1/10; #102 parked, 2026 PA-40 instructions are not published`,
  },
  '/paSpCouldQualify': {
    kind: `remaining`,
    reason: `standing PA Tax Forgiveness 10% column ($2,250); 2026 PA-40 instructions are not published`,
  },
  '/phaseInRatesFor1Qc': {
    kind: `remaining`,
    reason: `§ 32(b)(1) prints the one-child credit percentage as 34 in the table column, without a percent sign`,
  },
  '/phaseInRatesFor2Qc': {
    kind: `remaining`,
    reason: `§ 32(b)(1) prints the two-child credit percentage as 40 in the table column, without a percent sign`,
  },
  '/phaseInRatesFor3OrMoreQc': {
    kind: `remaining`,
    reason: `§ 32(b)(1) prints the three-child credit percentage as 45 in the table column, without a percent sign`,
  },
  '/isTaxYearLeapYear': {
    kind: `structural`,
    reason: `calendar years divisible by 4, standing in for the leap-year rule; 2026 is not one of them`,
  },
  '/familyAndHousehold/*/daysLivedWithTPInUS': {
    kind: `structural`,
    reason: `cumulative days at each month-end, used to test whether the person lived with the taxpayer`,
  },
  '/isHouseholdIncome401PercentOfPovertyLine': {
    kind: `structural`,
    reason: `one more than the § 36B 400 percent of the poverty line, so income above that line compares at 401`,
  },
  '/form8949Transactions/*/description': {
    kind: `structural`,
    reason: `Form 8949 column (a) description is limited to 100 characters`,
  },
  '/schedule1ALine13': { kind: `structural`, reason: THOUSAND_SCALE },
  '/schedule1ALine14': { kind: `structural`, reason: HUNDRED_SCALE },
  '/schedule1AOvertimeLine25': { kind: `structural`, reason: THOUSAND_SCALE },
  '/schedule1AOvertimeLine26': { kind: `structural`, reason: HUNDRED_SCALE },
  '/overtimeSelfFiguredAmount': {
    kind: `structural`,
    reason: `premium share of a reported total: 1/3 of time-and-a-half, 1/4 of double time, or 1/2 of the premium (§ 225(c)(1) excess over the regular rate)`,
  },
};
for (const field of [
  `writablePtcAnnualPremium`,
  `writableAptcAnnualAmount`,
  ...[`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`].map(
    (m) => `writablePtcMonthlyPremium${m}`
  ),
]) {
  EXCEPTIONS[`/1095As/*/${field}`] = { kind: `structural`, reason: CENTS_INPUT };
}

const FACT_PATTERN = /<Fact path=["']([^"']+)["']>([\s\S]*?)<\/Fact>/g;
const AMOUNT_PATTERN = /<(Dollar|Int|Rational)>([^<]*)<\/\1>/g;

/** Non-zero dollars, rationals other than 0 and n/n, and ints of at least 100. */
function isGuardedLiteral(type: string, text: string): boolean {
  if (type === `Dollar`) return Number(text) !== 0;
  if (type === `Int`) return Math.abs(Number(text)) >= 100;
  if (type === `Rational`) {
    const [num, den] = text.split(`/`);
    return num !== `0` && num !== den;
  }
  return false;
}

function untaggedAmountFacts(modules: Map<string, string>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const xml of modules.values()) {
    for (const m of xml.matchAll(FACT_PATTERN)) {
      if (m[2].includes(`<TaxYear>`)) continue;
      const amounts = [...m[2].matchAll(AMOUNT_PATTERN)]
        .filter((d) => isGuardedLiteral(d[1], d[2].trim()))
        .map((d) => `${d[1]}:${d[2].trim()}`);
      if (amounts.length) found.set(m[1], amounts);
    }
  }
  return found;
}

describe(`untagged Dollar, Rational, and large Int literals`, () => {
  const found = untaggedAmountFacts(readXmlModules());

  it(`appear only in facts listed as structural or remaining, each with a reason`, () => {
    const unlisted = [...found.keys()].filter((f) => !(f in EXCEPTIONS));
    expect(unlisted, `tag these facts <TaxYear> and cite them in the parameter file`).toEqual([]);
    for (const [fact, e] of Object.entries(EXCEPTIONS)) {
      expect(e.reason.length, fact).toBeGreaterThan(10);
    }
  });

  it(`lists no fact that has no untagged Dollar, Rational, or large Int literal`, () => {
    const stale = Object.keys(EXCEPTIONS).filter((f) => !found.has(f));
    expect(stale, `remove these from EXCEPTIONS`).toEqual([]);
  });
});
