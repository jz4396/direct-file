import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { Path } from '../../flow/Path.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, singleFilerData } from '../testData.js';

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
    [`filers.xml`, `/filers/*/dateOfBirth`, `2026-01-01`],
    [`imported.xml`, `/importedPrimaryFilerDateOfBirth`, `2026-01-01`],
    [`familyAndHousehold.xml`, `/familyAndHousehold/*/dateOfBirth`, `2027-01-01`],
    [`filers.xml`, `/secondaryFilerDateOfDeath`, `2027-01-01`],
    [`form1099Rs.xml`, `/form1099Rs/*/writableDateOfPayment`, `2027-01-01`],
  ])(`%s %s max is %s`, (file, factPath, expected) => {
    expect(maxLimit(file, factPath)).toBe(expected);
  });
});

describe(`#91 TY2026 premium tax credit knockout`, () => {
  const scenarioDir = path.resolve(__dirname, `backend-scenarios`);
  const ptcScenarios = fs.readdirSync(scenarioDir).filter((f) => f.startsWith(`ptc-`) && f.endsWith(`.json`));

  it(`has PTC scenarios to check`, () => {
    expect(ptcScenarios.length).toBeGreaterThan(0);
  });

  it.each(ptcScenarios)(`%s: knocked out whenever Form 8962 is needed`, (file) => {
    const facts = JSON.parse(fs.readFileSync(path.join(scenarioDir, file), `utf-8`)).facts;
    const { factGraph } = setupFactGraph(facts);
    const at = (p: string) => factGraph.get(Path.concretePath(p as never, null) as ConcretePath);
    const needs8962 = at(`/needsToFileForm8962`);
    const ko = at(`/flowKnockoutPtcTy2026RulesNotImplemented`);
    if (needs8962.complete && needs8962.get === true) {
      expect(ko.get).toBe(true);
      expect(at(`/flowIsKnockedOut`).get).toBe(true);
    } else {
      expect(ko.complete && ko.get === true).toBe(false);
    }
  });

  it(`a return with no Marketplace coverage is not knocked out by it`, () => {
    const k = fg().get(Path.concretePath(`/flowKnockoutPtcTy2026RulesNotImplemented` as never, null) as ConcretePath);
    expect(k.complete && k.get === true).toBe(false);
  });
});
