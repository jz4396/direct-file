import { describe, it, expect } from 'vitest';
import {
  TaxYearConfig,
  applyConfig,
  loadTaxYearConfig,
  loadTaxYearRegistry,
  quoteCoverageErrors,
  readXmlModules,
  taggedFacts,
} from '../../fact-dictionary/yearConfig/yearConfig.js';

/**
 * TY2026 AMT, §1(j) top bracket, and OBBBA statutory amounts that are read from
 * taxYears/ty2026.json rather than written into the fact dictionary by hand. Indexed amounts
 * cite Rev. Proc. 2025-32 (or the 2026 draft form that prints them); statutory amounts cite the IRC.
 */
const registry = loadTaxYearRegistry();
const config = loadTaxYearConfig(registry.currentTaxYear);
const modules = readXmlModules();
const facts = taggedFacts(modules);

type Expected = { file: string; values: string[]; source: `rp-2025-32` | `irc` | `f6251-dft` };
const EXPECTED: Record<string, Expected> = {
  '/form6251ExemptionAmount': {
    file: `form6251.xml`,
    values: [`Dollar:70100`, `Dollar:140200`, `Dollar:90100`],
    source: `rp-2025-32`,
  },
  '/form6251PhaseoutThreshold': {
    file: `form6251.xml`,
    values: [`Dollar:1000000`, `Dollar:500000`],
    source: `rp-2025-32`,
  },
  '/form6251RateBreakpoint': { file: `form6251.xml`, values: [`Dollar:122250`, `Dollar:244500`], source: `rp-2025-32` },
  '/form6251RateOffset': { file: `form6251.xml`, values: [`Dollar:2445`, `Dollar:4890`], source: `f6251-dft` },
  '/flowKnockoutAmtMfsAddBack': { file: `form6251.xml`, values: [`Dollar:640200`], source: `rp-2025-32` },
  '/flowKnockoutScheduleAOverallLimit': { file: `scheduleA.xml`, values: [`Dollar:384350`], source: `rp-2025-32` },
  '/scheduleASaltThreshold': { file: `scheduleA.xml`, values: [`Dollar:252500`, `Dollar:505000`], source: `irc` },
  '/scheduleASaltLimitBeforeMfsHalving': {
    file: `scheduleA.xml`,
    values: [`Dollar:10000`, `Dollar:40400`, `Rational:30/100`, `Dollar:0`],
    source: `irc`,
  },
  '/schedule1ALine9': { file: `schedule1A.xml`, values: [`Dollar:25000`], source: `irc` },
  '/schedule1ALine11': { file: `schedule1A.xml`, values: [`Dollar:300000`, `Dollar:150000`], source: `irc` },
  '/schedule1AOvertimeLine21': {
    file: `schedule1AOvertime.xml`,
    values: [`Dollar:25000`, `Dollar:12500`],
    source: `irc`,
  },
  '/schedule1AOvertimeLine23': {
    file: `schedule1AOvertime.xml`,
    values: [`Dollar:300000`, `Dollar:150000`],
    source: `irc`,
  },
  '/carLoanLine30': { file: `carLoanInterest.xml`, values: [`Dollar:10000`], source: `irc` },
  '/carLoanLine32': { file: `carLoanInterest.xml`, values: [`Dollar:200000`, `Dollar:100000`], source: `irc` },
  '/schedule1ASeniorAmount': { file: `schedule1A.xml`, values: [`Dollar:6000`], source: `irc` },
  '/schedule1ALine38': { file: `schedule1A.xml`, values: [`Dollar:150000`, `Dollar:75000`], source: `irc` },
  '/schedule1ALine40': { file: `schedule1A.xml`, values: [`Rational:6/100`], source: `irc` },
  '/cdccCareExpensesFallOffThreshold': { file: `cdcc.xml`, values: [`Dollar:15000`], source: `irc` },
  '/cdccCareExpensesSecondPhaseoutThreshold': {
    file: `cdcc.xml`,
    values: [`Dollar:150000`, `Dollar:75000`],
    source: `irc`,
  },
  '/cdccMaxClaimableExpenseWithOneQP': { file: `cdcc.xml`, values: [`Dollar:3000`], source: `irc` },
  '/cdccMaxClaimableExpenseWithTwoQP': { file: `cdcc.xml`, values: [`Dollar:6000`], source: `irc` },
  '/cdccMaximumExclusionForNonMFS': { file: `cdcc.xml`, values: [`Dollar:7500`], source: `irc` },
  '/cdccMaximumExclusionForMFS': { file: `cdcc.xml`, values: [`Dollar:3750`], source: `irc` },
  '/netInvestmentIncomeThresholdForMfjOrQss': { file: `interest.xml`, values: [`Dollar:250000`], source: `irc` },
  '/netInvestmentIncomeThresholdForMfs': { file: `interest.xml`, values: [`Dollar:125000`], source: `irc` },
  '/netInvestmentIncomeThresholdForSingleOrHoh': { file: `interest.xml`, values: [`Dollar:200000`], source: `irc` },
  '/maxMFJMedicareWages': { file: `formW2s.xml`, values: [`Dollar:250000`], source: `irc` },
  '/maxMFSMedicareWages': { file: `formW2s.xml`, values: [`Dollar:125000`], source: `irc` },
  '/maxNonMFSorMFJMedicareWages': { file: `formW2s.xml`, values: [`Dollar:200000`], source: `irc` },
  '/maxIndividualMedicareWages': { file: `formW2s.xml`, values: [`Dollar:200000`], source: `irc` },
};

/** Indexed TY2026 figures that should only ever appear in facts driven by ty2026.json. */
const TY2026_ONLY_FIGURES = [
  `70100`,
  `140200`,
  `90100`,
  `122250`,
  `244500`,
  `2445`,
  `4890`,
  `640200`,
  `384350`,
  `252500`,
  `505000`,
  `40400`,
];

const FACT_PATTERN = /<Fact path="([^"]+)">([\s\S]*?)<\/Fact>/g;
const clone = (c: TaxYearConfig): TaxYearConfig => JSON.parse(JSON.stringify(c));

describe(`TY2026 AMT, §68 and OBBBA amounts come from ty2026.json`, () => {
  it.each(Object.entries(EXPECTED))(`%s is a tagged TY2026 parameter with unchanged values`, (fact, expected) => {
    const xml = facts.find((f) => f.fact === fact);
    expect(xml?.taxYear).toBe(2026);
    expect(xml?.file).toBe(expected.file);
    expect(xml?.values).toEqual(expected.values);
    const parameter = config.parameters.find((p) => p.fact === fact);
    expect(parameter?.values).toEqual(expected.values);
    expect(parameter?.cite[0].source).toBe(expected.source);
  });

  it(`cites statutory (OBBBA, §1411, §3101) amounts to the IRC, not the Rev. Proc.`, () => {
    for (const [fact, expected] of Object.entries(EXPECTED).filter(([, e]) => e.source === `irc`)) {
      const sources = config.parameters.find((p) => p.fact === fact)?.cite.map((c) => c.source) ?? [];
      expect(sources, fact).not.toContain(`rp-2025-32`);
    }
  });

  it(`writes a changed parameter value into the fact dictionary`, () => {
    for (const fact of Object.keys(EXPECTED)) {
      const c = clone(config);
      const parameter = c.parameters.find((p) => p.fact === fact);
      if (!parameter?.values) throw new Error(`missing ${fact}`);
      const i = parameter.values.findIndex((v) => v.startsWith(`Dollar:`) && v !== `Dollar:0`);
      const target = i >= 0 ? i : 0;
      const [type] = parameter.values[target].split(`:`);
      parameter.values[target] = type === `Dollar` ? `Dollar:1` : `Rational:1/100`;
      const changed = applyConfig(c, modules);
      expect(changed.get(EXPECTED[fact].file), fact).toBeDefined();
    }
  });

  it(`does not hardcode an indexed TY2026 figure in any untagged fact`, () => {
    const offenders: string[] = [];
    for (const [file, xml] of modules) {
      for (const [, fact, body] of xml.matchAll(FACT_PATTERN)) {
        if (/<TaxYear>/.test(body)) continue;
        for (const figure of TY2026_ONLY_FIGURES) {
          if (new RegExp(`<Dollar>\\s*${figure}(\\.0+)?\\s*</Dollar>`).test(body)) {
            offenders.push(`${file} ${fact} ${figure}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it(`accepts a rate written out as "n percent" in a statute quote`, () => {
    const cite = [{ source: `irc`, quote: `shall be reduced by 30 percent of the excess` }];
    expect(quoteCoverageErrors(`/x`, [`Rational:30/100`], cite)).toEqual([]);
    expect(quoteCoverageErrors(`/x`, [`Rational:6/100`], cite)).toEqual([`/x: cited quotes do not contain 6%`]);
  });
});
