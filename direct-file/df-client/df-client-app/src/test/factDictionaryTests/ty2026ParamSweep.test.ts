import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { ConcretePath, DayFactory } from '@irs/js-factgraph-scala';
import { Path } from '../../flow/Path.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, primaryFilerId, singleFilerData } from '../testData.js';

/**
 * #91: TY2026 residual parameter sweep. Every value pinned here is cited in the fact's Description in the
 * fact dictionary and in the PR findings table.
 */
const fg = () => setupFactGraph({ ...baseFilerData, ...singleFilerData }).factGraph;
const get = (p: string) =>
  fg()
    .get(Path.concretePath(p as never, null) as ConcretePath)
    .get.toString();

const TAX_DIR = path.resolve(__dirname, `../../../../../backend/src/main/resources/tax`);
const factBody = (file: string, factPath: string) => {
  const xml = fs.readFileSync(path.join(TAX_DIR, file), `utf-8`);
  const start = xml.indexOf(`<Fact path="${factPath}">`);
  expect(start, `${factPath} in ${file}`).toBeGreaterThanOrEqual(0);
  return xml.slice(start, xml.indexOf(`</Fact>`, start));
};
const maxLimit = (file: string, factPath: string) => {
  const m = /<Limit type="Max">[\s\S]*?<(Day|Dollar)>([^<]+)<\/(?:Day|Dollar)>/.exec(factBody(file, factPath));
  return m?.[2].trim();
};

describe(`#91 TY2026 derived parameters`, () => {
  it(`educator expense limit is $350 (Rev. Proc. 2025-32 sec. 4.12, p. 17)`, () => {
    expect(get(`/maxIndividualEducatorExpensesLimit`)).toBe(`350.00`);
  });
  it(`qualifying relative gross income limit is $5,300 (Rev. Proc. 2025-32 sec. 4.23, p. 20)`, () => {
    expect(get(`/grossIncomeLimit`)).toBe(`5300.00`);
  });
  // 90 FR 49047 (Nov. 3, 2025), p. 49050: "The OASDI contribution and benefit base is $184,500 for remuneration paid
  // in 2026 and self-employment income earned in tax years beginning in 2026."
  it(`multiple-W-2 OASDI wage limit is the 2026 wage base, $184,500`, () => {
    expect(get(`/maxOasdiWagesOnMultipleW2sForOnePerson`)).toBe(`184500.00`);
    expect(get(`/maxOasdiWagesOnMultipleW2sForOnePerson`)).toBe(get(`/socialSecurityWageBaseTy2026`));
  });
  it(`Form 5498-SA furnishing date is June 1, 2027 (May 31, 2027 is Memorial Day)`, () => {
    expect(get(`/hsaForm5498DueDate`)).toBe(`2027-06-01`);
  });
  it(`2026 Alaska PFD is $1,000 plus a $200 energy relief payment`, () => {
    expect(get(`/alaskaPfdAmountDividendPortion`)).toBe(`1000.00`);
    expect(get(`/alaskaPfdAmountEnergyReliefPaymentPortion`)).toBe(`200.00`);
    expect(get(`/alaskaPfdAmount`)).toBe(`1200.00`);
  });
});

describe(`#91 TY2026 writable limits`, () => {
  it.each([
    [`educatorAdjustment.xml`, `/primaryEducatorExpensesWritable`, `350`],
    [`educatorAdjustment.xml`, `/secondaryEducatorExpensesWritable`, `350`],
    [`filers.xml`, `/filers/*/dateOfBirth`, `2025-12-31`],
    [`imported.xml`, `/importedPrimaryFilerDateOfBirth`, `2025-12-31`],
    [`familyAndHousehold.xml`, `/familyAndHousehold/*/dateOfBirth`, `2026-12-31`],
    [`filers.xml`, `/secondaryFilerDateOfDeath`, `2026-12-31`],
    [`form1099Rs.xml`, `/form1099Rs/*/writableDateOfPayment`, `2026-12-31`],
  ])(`%s %s max is %s`, (file, factPath, expected) => {
    expect(maxLimit(file, factPath)).toBe(expected);
  });
});

describe(`#88 TY2026 premium tax credit scenarios`, () => {
  const scenarioDir = path.resolve(__dirname, `backend-scenarios`);
  const ptcScenarios = fs.readdirSync(scenarioDir).filter((f) => f.startsWith(`ptc-`) && f.endsWith(`.json`));
  const knockouts = [
    `/flowKnockoutPtcAllocationOfPolicyAmounts`,
    `/flowKnockoutPtcAlternativeCalculationForYearOfMarriage`,
    `/flowKnockoutPtcSelfEmployedHealthInsurance`,
    `/flowKnockoutPtcHouseholdIncomeBelow100PercentFpl`,
    `/flowKnockoutPtcIncomeBasedSpecialEnrollmentPeriod`,
  ];

  it(`has PTC scenarios to check`, () => {
    expect(ptcScenarios.length).toBeGreaterThan(0);
  });

  it.each(ptcScenarios)(`%s: no repayment limitation applies (Rev. Proc. 2025-32 sec. 2.04, p. 5)`, (file) => {
    const facts = JSON.parse(fs.readFileSync(path.join(scenarioDir, file), `utf-8`)).facts;
    const { factGraph } = setupFactGraph(facts);
    const at = (p: string) => factGraph.get(Path.concretePath(p as never, null) as ConcretePath);
    const excess = at(`/netPtcAmountWhenNegative`);
    if (excess.complete) {
      expect(at(`/lesserOfNetPtcAmountAndRepaymentLimitation`).get.toString()).toBe(excess.get.toString());
    }
    expect(at(`/isRepaymentLimitationIsActive`).get).toBe(false);
  });

  it(`a return with no Marketplace coverage is not knocked out by any PTC knockout`, () => {
    for (const k of knockouts) {
      const r = fg().get(Path.concretePath(k as never, null) as ConcretePath);
      expect(r.complete && r.get === true, k).toBe(false);
    }
  });
});

/**
 * #166: the TY2026 date limits are exact. `<Limit type="Max">` is inclusive (fact-graph-scala limits/Max.scala
 * compares with LessThanOrEqual), so each limit is the last day accepted and the next day is rejected.
 * Last day of tax year 2026: dependent date of birth, spouse date of death (26 U.S.C. 6013(d)(1)(B), "if one dies
 * before the close of the taxable year of the other", https://www.law.cornell.edu/uscode/text/26/6013) and the
 * Form 1099-R date of payment. Filer dates of birth must be before tax year 2026 (the upstream TY2024 bound rolled
 * forward two years).
 */
describe(`#166 TY2026 date limits: last valid day accepted, next day rejected`, () => {
  const depId = `a1b2c3d4-0000-4000-8000-000000000166`;
  const r1099Id = `b1b2c3d4-0000-4000-8000-000000000166`;
  const data = {
    ...baseFilerData,
    ...singleFilerData,
    '/familyAndHousehold': { $type: `gov.irs.factgraph.persisters.CollectionWrapper`, item: { items: [depId] } },
    '/form1099Rs': { $type: `gov.irs.factgraph.persisters.CollectionWrapper`, item: { items: [r1099Id] } },
  };
  const violations = (abstractPath: string, id: string | null, day: string) => {
    const { factGraph } = setupFactGraph(data);
    const p = Path.concretePath(abstractPath as never, id) as ConcretePath;
    factGraph.set(p, DayFactory(day).right);
    const res = factGraph.save();
    return res.limitViolations.filter((v: { factPath: string }) => v.factPath === p).length;
  };
  it.each([
    [`/filers/*/dateOfBirth`, primaryFilerId, `2025-12-31`, `2026-01-01`],
    [`/importedPrimaryFilerDateOfBirth`, null, `2025-12-31`, `2026-01-01`],
    [`/familyAndHousehold/*/dateOfBirth`, depId, `2026-12-31`, `2027-01-01`],
    [`/secondaryFilerDateOfDeath`, null, `2026-12-31`, `2027-01-01`],
    [`/form1099Rs/*/writableDateOfPayment`, r1099Id, `2026-12-31`, `2027-01-01`],
  ] as [string, string | null, string, string][])(`%s: %s accepts %s, rejects %s`, (factPath, id, lastOk, firstBad) => {
    expect(violations(factPath, id, lastOk)).toBe(0);
    expect(violations(factPath, id, firstBad)).toBe(1);
  });
});
