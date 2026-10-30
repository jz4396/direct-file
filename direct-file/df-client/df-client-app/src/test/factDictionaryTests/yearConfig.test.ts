import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CURRENT_TAX_YEAR } from '../../constants/taxConstants.js';
import {
  TAX_YEARS_FOLDER,
  TaxYearConfig,
  UnknownTaxYearError,
  applyConfig,
  applyParameterToXml,
  loadTaxYearConfig,
  loadTaxYearRegistry,
  quoteCoverageErrors,
  quotedForms,
  readXmlModules,
  taggedFacts,
  validateConfig,
} from '../../fact-dictionary/yearConfig/yearConfig.js';

/**
 * Per-tax-year parameter file (backend/src/main/resources/taxYears). The TY2026 file is the
 * source of truth for every fact tagged <TaxYear>2026</TaxYear>; each entry carries the
 * authority for its values: a Rev. Proc. 2025-32 or IRS form/instructions page and quote, an IRC
 * section and quote, or the HHS poverty guidelines notice (Federal Register page and quote).
 */
const registry = loadTaxYearRegistry();
const config = loadTaxYearConfig(registry.currentTaxYear);
const modules = readXmlModules();
const facts = taggedFacts(modules);

const clone = (c: TaxYearConfig): TaxYearConfig => JSON.parse(JSON.stringify(c));
const param = (c: TaxYearConfig, fact: string) => {
  const p = c.parameters.find((x) => x.fact === fact);
  if (!p) throw new Error(`missing ${fact}`);
  return p;
};

describe(`tax year registry`, () => {
  it(`selects the current tax year, which matches CURRENT_TAX_YEAR and /taxYear`, () => {
    expect(registry.currentTaxYear).toBe(Number(CURRENT_TAX_YEAR));
    expect(config.taxYear).toBe(registry.currentTaxYear);
    expect(param(config, `/taxYear`).values).toEqual([`Int:${CURRENT_TAX_YEAR}`]);
  });

  it(`has no fallback for a year that is not registered`, () => {
    expect(() => loadTaxYearConfig(2019)).toThrow(UnknownTaxYearError);
    expect(() => loadTaxYearConfig(registry.currentTaxYear + 1)).toThrow(UnknownTaxYearError);
  });

  it(`rejects a parameter file whose declared year disagrees with the registry`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `taxyears-`));
    try {
      fs.writeFileSync(
        path.join(dir, `registry.json`),
        JSON.stringify({ currentTaxYear: 2026, years: [{ taxYear: 2026, config: `ty2026.json`, enabled: true }] })
      );
      fs.writeFileSync(path.join(dir, `ty2026.json`), JSON.stringify({ ...config, taxYear: 2025 }));
      expect(() => loadTaxYearConfig(2026, dir)).toThrow(/declares tax year 2025/);
      fs.writeFileSync(path.join(dir, `registry.json`), JSON.stringify({ currentTaxYear: 2027, years: [] }));
      expect(() => loadTaxYearRegistry(dir)).toThrow(UnknownTaxYearError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`keeps TY2026 enabled for new returns`, () => {
    expect(registry.years.find((y) => y.taxYear === 2026)?.enabled).toBe(true);
  });

  it(`requires an explicit boolean enabled flag on every year`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `taxyears-`));
    const write = (entry: Record<string, unknown>) =>
      fs.writeFileSync(path.join(dir, `registry.json`), JSON.stringify({ currentTaxYear: 2026, years: [entry] }));
    try {
      write({ taxYear: 2026, config: `ty2026.json` });
      expect(() => loadTaxYearRegistry(dir)).toThrow(/2026 has no boolean enabled flag/);
      write({ taxYear: 2026, config: `ty2026.json`, enabled: `true` });
      expect(() => loadTaxYearRegistry(dir)).toThrow(/2026 has no boolean enabled flag/);
      write({ taxYear: 2026, config: `ty2026.json`, enabled: false });
      expect(loadTaxYearRegistry(dir).years[0].enabled).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`lists only parameter files that exist`, () => {
    for (const y of registry.years) {
      expect(fs.existsSync(path.join(TAX_YEARS_FOLDER, y.config))).toBe(true);
    }
  });
});

describe(`TY2026 parameter file`, () => {
  it(`agrees with the fact dictionary XML, covers every <TaxYear>-tagged fact, and cites every parameter`, () => {
    expect(validateConfig(config, facts)).toEqual([]);
  });

  it(`lists every fact tagged ${CURRENT_TAX_YEAR} as a parameter and every other tagged fact for review`, () => {
    const tagged = facts.filter((f) => f.taxYear === config.taxYear).map((f) => f.fact);
    expect(config.parameters.map((p) => p.fact).sort()).toEqual(tagged.sort());
    const other = facts.filter((f) => f.taxYear !== config.taxYear).map((f) => f.fact);
    expect(config.pendingReview.map((p) => p.fact).sort()).toEqual(other.sort());
  });

  it(`is already applied: writing it into the XML changes nothing`, () => {
    expect([...applyConfig(config, modules).keys()]).toEqual([]);
  });

  it(`cites the Rev. Proc. 2025-32 rate tables for both regular-rate tax facts`, () => {
    const tables = param(config, `/taxOnTaxableIncomeRegularRates`).cite;
    expect(tables.map((c) => c.section)).toEqual([
      `§4.01 Table 1, § 1(j)(2)(A)`,
      `§4.01 Table 2, § 1(j)(2)(B)`,
      `§4.01 Table 3, § 1(j)(2)(C)`,
      `§4.01 Table 4, § 1(j)(2)(D)`,
    ]);
    expect(param(config, `/qdcgLine22`).valuesFrom).toBe(`/taxOnTaxableIncomeRegularRates`);
  });
});

describe(`validation catches`, () => {
  it(`a parameter with no cite`, () => {
    const c = clone(config);
    param(c, `/MFJStandardDeduction`).cite = [];
    expect(validateConfig(c, facts)).toEqual([`/MFJStandardDeduction: no cite`]);
  });

  it(`a Rev. Proc. cite with no page, or a statute cite with no section`, () => {
    const c = clone(config);
    delete param(c, `/maxCtcAmount`).cite[0].page;
    param(c, `/capitalLossLimit`).cite[0].section = `1211`;
    expect(validateConfig(c, facts)).toEqual([
      `/maxCtcAmount cite 1: rp-2025-32 cite needs a page`,
      `/capitalLossLimit cite 1: statute cite needs a section like "§ 1211(b)(1)"`,
    ]);
  });

  it(`a value changed in the parameter file but not in its quote, or not in the XML`, () => {
    const c = clone(config);
    param(c, `/HoHStandardDeduction`).values = [`Dollar:24200`];
    expect(validateConfig(c, facts)).toEqual([
      `/HoHStandardDeduction: XML values ["Dollar:24150"] differ from parameter file ["Dollar:24200"]`,
      `/HoHStandardDeduction: cited quotes do not contain $24,200`,
    ]);
  });

  it(`a value changed in the XML only`, () => {
    const edited = new Map(modules);
    edited.set(
      `ctcOdc.xml`,
      applyParameterToXml(modules.get(`ctcOdc.xml`) as string, `/maxCtcAmount`, [`Dollar:2000`])
    );
    expect(validateConfig(config, taggedFacts(edited))).toEqual([
      `/maxCtcAmount: XML values ["Dollar:2000"] differ from parameter file ["Dollar:2200"]`,
    ]);
  });

  it(`a newly tagged fact that the parameter file does not list`, () => {
    const c = clone(config);
    c.parameters = c.parameters.filter((p) => p.fact !== `/capitalLossLimit`);
    expect(validateConfig(c, facts)).toEqual([
      `/capitalLossLimit (scheduleD.xml, TaxYear 2026) is not in the TY2026 parameter file`,
    ]);
  });

  it(`a pendingReview entry marked current without a cite`, () => {
    const c = clone(config);
    const entry = c.pendingReview.find((p) => p.fact === `/MFSFilingThresholdAmount`);
    if (!entry) throw new Error(`missing /MFSFilingThresholdAmount`);
    delete entry.cite;
    expect(validateConfig(c, facts)).toEqual([`/MFSFilingThresholdAmount: no cite`]);
  });
});

describe(`accepted authorities`, () => {
  const onlyFrom = (fact: string, source: string) => {
    const c = clone(config);
    const p = param(c, fact);
    p.cite = p.cite.filter((x) => x.source === source);
    expect(p.cite.length).toBeGreaterThan(0);
    return c;
  };

  it(`a statute cite (IRC section, URL, and quote) with no Rev. Proc. cite`, () => {
    expect(config.sources[`irc`].kind).toBe(`statute`);
    for (const fact of [
      `/scheduleASaltLimitBeforeMfsHalving`,
      `/schedule1ALine9`,
      `/edcExemptionAmount`,
      `/netEdcAmount`,
      `/form8995Line5`,
      `/nonItemizerCharitableIfStandard`,
    ]) {
      expect(param(config, fact).cite.every((x) => x.source === `irc`)).toBe(true);
      expect(validateConfig(onlyFrom(fact, `irc`), facts)).toEqual([]);
    }
  });

  it(`the HHS poverty guidelines notice (Federal Register page and quote) as the source of a dollar amount`, () => {
    expect(config.sources[`fr-2025-01377`].kind).toBe(`pdf`);
    for (const fact of [`/federalPovertyLineMagicNumberStartingNumber`, `/federalPovertyLineMagicNumberIncrement`]) {
      expect(validateConfig(onlyFrom(fact, `fr-2025-01377`), facts)).toEqual([]);
    }
  });

  it(`but not a statute cite whose quote lacks the amount`, () => {
    const c = clone(config);
    param(c, `/seNetEarningsThreshold`).cite[0].quote = `the net earnings from self-employment`;
    expect(validateConfig(c, facts)).toEqual([`/seNetEarningsThreshold: cited quotes do not contain $400`]);
  });
});

describe(`applying a parameter`, () => {
  it(`swaps exactly the cited literal and keeps the surrounding XML`, () => {
    const xml = modules.get(`standardDeduction.xml`) as string;
    const swapped = applyParameterToXml(xml, `/MFJStandardDeduction`, [`Dollar:99999`]);
    expect(swapped).not.toBe(xml);
    expect(swapped.replace(`99999`, `32200`)).toBe(xml);
    const after = taggedFacts(new Map([[`standardDeduction.xml`, swapped]]));
    expect(after.find((f) => f.fact === `/MFJStandardDeduction`)?.values).toEqual([`Dollar:99999`]);
    expect(after.find((f) => f.fact === `/HoHStandardDeduction`)?.values).toEqual([`Dollar:24150`]);
  });

  it(`writes a valuesFrom table into the duplicate fact too`, () => {
    const c = clone(config);
    const table = param(c, `/taxOnTaxableIncomeRegularRates`);
    table.values = (table.values as string[]).map((v) => (v === `Dollar:24800` ? `Dollar:24900` : v));
    const changed = applyConfig(c, modules);
    expect([...changed.keys()].sort()).toEqual([`scheduleD3.xml`, `taxCalculations2.xml`]);
    const after = taggedFacts(changed);
    for (const fact of [`/taxOnTaxableIncomeRegularRates`, `/qdcgLine22`]) {
      expect(after.find((f) => f.fact === fact)?.values).toEqual(table.values);
    }
  });

  it(`refuses to change a literal's type or count`, () => {
    const xml = modules.get(`ctcOdc.xml`) as string;
    expect(() => applyParameterToXml(xml, `/maxCtcAmount`, [`Int:2200`])).toThrow(/is <Dollar> in XML/);
    expect(() => applyParameterToXml(xml, `/maxCtcAmount`, [`Dollar:1`, `Dollar:2`])).toThrow(/2 values/);
    expect(() => applyParameterToXml(xml, `/noSuchFact`, [])).toThrow(/not found/);
  });
});

describe(`quotedForms`, () => {
  it(`formats dollar amounts and rates the way the Rev. Proc. prints them`, () => {
    expect(quotedForms(`Dollar:206583.50`)).toBe(`$206,583.50`);
    expect(quotedForms(`Dollar:2480`)).toBe(`$2,480`);
    expect(quotedForms(`Rational:22/100`)).toBe(`22%`);
    expect(quotedForms(`Dollar:0`)).toBeNull();
    expect(quotedForms(`Int:2`)).toBeNull();
  });
});

describe(`quoteCoverageErrors with form: "table"`, () => {
  const tableQuote =
    `The credit percentage and the phaseout percentage shall be determined as follows: In the case of an eligible individual with: The credit percentage is: The phaseout percentage is: 1 qualifying child 34 15.98; 2 qualifying children 40 21.06; 3 or more qualifying children 45 21.06; No qualifying children 7.65 7.65`;

  it(`covers a whole-number rate with the bare table token`, () => {
    expect(
      quoteCoverageErrors(`/phaseInRatesFor1Qc`, [`Rational:34/100`], [
        { source: `irc`, section: `§ 32(b)(1)(A)`, url: `https://www.law.cornell.edu/uscode/text/26/32`, quote: tableQuote, form: `table` },
      ])
    ).toEqual([]);
  });

  it(`does not treat a bare table token as coverage without form: "table"`, () => {
    expect(
      quoteCoverageErrors(`/phaseInRatesFor1Qc`, [`Rational:34/100`], [
        { source: `irc`, section: `§ 32(b)(1)(A)`, url: `https://www.law.cornell.edu/uscode/text/26/32`, quote: tableQuote },
      ])
    ).toEqual([`/phaseInRatesFor1Qc: cited quotes do not contain 34%`]);
  });

  it(`does not let a longer number cover a bare whole-token rate`, () => {
    expect(
      quoteCoverageErrors(`/phaseInRatesFor1Qc`, [`Rational:34/100`], [
        { source: `irc`, section: `§ 32(b)(1)(A)`, url: `https://www.law.cornell.edu/uscode/text/26/32`, quote: `threshold 340 phaseout`, form: `table` },
      ])
    ).toEqual([`/phaseInRatesFor1Qc: cited quotes do not contain 34%`]);
  });
});
