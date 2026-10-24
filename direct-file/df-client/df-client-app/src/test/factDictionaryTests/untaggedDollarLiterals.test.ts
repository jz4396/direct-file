import { describe, it, expect } from 'vitest';
import { readXmlModules } from '../../fact-dictionary/yearConfig/yearConfig.js';

/**
 * Every non-zero <Dollar> literal in the fact dictionary belongs to a fact tagged
 * <TaxYear>, so it is listed in the year's parameter file with the authority for it
 * (Rev. Proc. page and quote, IRC section and quote, or the HHS poverty guidelines notice).
 *
 * The facts below are the only exceptions. A `structural` entry is arithmetic, not a
 * tax-law amount (rounding to a table band, cents, a sign test). A `remaining` entry is a
 * tax-law amount that still needs a citable source or a review of its value before it can
 * be tagged. A new untagged Dollar literal, or an entry here that no longer needs to be
 * here, fails this test.
 */
type Exception = { kind: `structural` | `remaining`; reason: string };

const CENTS_INPUT = `rounds a typed amount to whole dollars`;
const TAX_TABLE = `Tax Table band rounding ($5/$25/$50 bands up to $100,000 and the $3,000 band start)`;
const EITC_TABLE = `EIC Table band rounding`;
const UNIT_DOLLAR = `multiplies by $1 to turn a ratio into a Dollar`;
const PHASEOUT_ROUNDING = `rounds up to the next $1,000 before the phaseout rate`;

const EXCEPTIONS: Record<string, Exception> = {
  '/carLoanLine34': { kind: `structural`, reason: PHASEOUT_ROUNDING },
  '/carLoanLine35': { kind: `structural`, reason: PHASEOUT_ROUNDING },
  '/roundedDependentCreditMagiAboveThreshold': { kind: `structural`, reason: PHASEOUT_ROUNDING },
  '/cdccCareExpensesDecimalAmount': { kind: `structural`, reason: `§ 21(a)(2) percentage steps written as decimals` },
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
  '/applicableFigure': { kind: `structural`, reason: `Form 8962 instructions Table 2 interpolation steps` },
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
  '/nonItemizerCharitableCap': {
    kind: `remaining`,
    reason: `§ 170(p) as amended by P.L. 119-21 § 70424; needs a source that prints $1,000 and $2,000`,
  },
  '/cdccMaxAllowedCreditWithOneQP': {
    kind: `remaining`,
    reason: `$1,050 is 35% of $3,000; review against the § 21(a)(2) rate as amended by P.L. 119-21`,
  },
  '/cdccMaxAllowedCreditWithTwoQP': {
    kind: `remaining`,
    reason: `$2,100 is 35% of $6,000; review against the § 21(a)(2) rate as amended by P.L. 119-21`,
  },
  '/w2MinAmount': { kind: `remaining`, reason: `review against the § 6041(a) threshold as amended by P.L. 119-21` },
  '/edcMaxSingleHohQssAgiLimit': { kind: `remaining`, reason: `needs the 2026 Schedule R instructions as a source` },
  '/edcMaxMfsAgiLimit': { kind: `remaining`, reason: `needs the 2026 Schedule R instructions as a source` },
  '/edcMaxMfjBothAgiLimit': { kind: `remaining`, reason: `needs the 2026 Schedule R instructions as a source` },
  '/edcMaxMfjOnlyOneAgiLimit': { kind: `remaining`, reason: `needs the 2026 Schedule R instructions as a source` },
  '/statusBasedDisabilityIncome': {
    kind: `remaining`,
    reason: `Schedule R line 11 $5,000; needs the 2026 Schedule R instructions as a source`,
  },
  '/paScheduleAThreshold': { kind: `remaining`, reason: `Pennsylvania law, not in the federal parameter file` },
  '/paScheduleBThreshold': { kind: `remaining`, reason: `Pennsylvania law, not in the federal parameter file` },
  '/paSpTableBase': { kind: `remaining`, reason: `Pennsylvania law, not in the federal parameter file` },
  '/paSpLine15': { kind: `remaining`, reason: `Pennsylvania law, not in the federal parameter file` },
  '/paSpCouldQualify': { kind: `remaining`, reason: `Pennsylvania law, not in the federal parameter file` },
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

const FACT_PATTERN = /<Fact path="([^"]+)">([\s\S]*?)<\/Fact>/g;
const DOLLAR_PATTERN = /<Dollar>([^<]*)<\/Dollar>/g;

function untaggedDollarFacts(modules: Map<string, string>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const xml of modules.values()) {
    for (const m of xml.matchAll(FACT_PATTERN)) {
      if (m[2].includes(`<TaxYear>`)) continue;
      const amounts = [...m[2].matchAll(DOLLAR_PATTERN)].map((d) => d[1].trim()).filter((v) => Number(v) !== 0);
      if (amounts.length) found.set(m[1], amounts);
    }
  }
  return found;
}

describe(`untagged Dollar literals`, () => {
  const found = untaggedDollarFacts(readXmlModules());

  it(`appear only in facts listed as structural or remaining, each with a reason`, () => {
    const unlisted = [...found.keys()].filter((f) => !(f in EXCEPTIONS));
    expect(unlisted, `tag these facts <TaxYear> and cite them in the parameter file`).toEqual([]);
    for (const [fact, e] of Object.entries(EXCEPTIONS)) {
      expect(e.reason.length, fact).toBeGreaterThan(10);
    }
  });

  it(`lists no fact that has no untagged Dollar literal`, () => {
    const stale = Object.keys(EXCEPTIONS).filter((f) => !found.has(f));
    expect(stale, `remove these from EXCEPTIONS`).toEqual([]);
  });
});
