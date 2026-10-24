/**
 * #186: knockouts and top-level submission-blocking facts are complete when they don't apply.
 *
 * fact-graph-scala `Any` is Complete(false) only when every operand is complete false, so one incomplete knockout leaves
 * /flowIsKnockedOut incomplete on a clean return. The server and client gates (FactGraphService.submissionBlockingFactPaths
 * and Condition.ts submissionBlockingFactPaths) accept a top-level blocking fact only on a complete false, so every
 * clean golden end-to-end scenario (synthetic data) and backend scenario must have each /flowIsKnockedOut operand
 * Complete(false) and each top-level blocking fact complete.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { ConcretePath, FactGraph } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { goldenProfiles } from '../scenarioTests/goldenProfiles.js';
import { submissionBlockingFactsRequiringValue } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
} from '../persistenceWrappers.js';
import {
  baseFilerData,
  basePrimaryFilerHSAFactsWithoutContributionAmounts,
  makeSimpleHsaDistributionDataWithoutCollection,
  mfsFilerData,
  primaryFilerId,
  singleFilerWithHsaDeductions,
  spouseId,
  mfjBothWithQualifiedHsaDeductions,
} from '../testData.js';

const FLOW_XML = `./src/fact-dictionary/generate-src/xml-src/flow.xml`;
const SCENARIOS = `./src/test/factDictionaryTests/backend-scenarios`;
const BACKEND_GOLDEN = path.join(
  `..`,
  `..`,
  `backend`,
  `src`,
  `test`,
  `resources`,
  `submission-blocking`,
  `golden-profile5-complete.json`
);

/** The operands of /flowIsKnockedOut's Any: [path, negated]. */
function knockoutOperands(): [string, boolean][] {
  const xml = fs.readFileSync(FLOW_XML, `utf-8`);
  const fact = xml.match(/<Fact path="\/flowIsKnockedOut">[\s\S]*?<\/Fact>/)![0];
  const body = fact.match(/<Derived>\s*<Any>([\s\S]*)<\/Any>\s*<\/Derived>/)![1];
  const out: [string, boolean][] = [];
  for (const m of body.matchAll(
    /<Not>\s*<Dependency[^>]*path="([^"]+)"[^>]*\/>\s*<\/Not>|<Dependency[^>]*path="([^"]+)"[^>]*\/>/g
  )) {
    out.push(m[1] ? [m[1], true] : [m[2], false]);
  }
  return out;
}

/** Persisted metadata such as /meta/migrationsApplied is not a fact. */
const withoutMeta = (facts: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(facts).filter(([k]) => !k.startsWith(`/meta/`)));

const returns: [string, Record<string, unknown>][] = [
  ...Object.entries(goldenProfiles).map(([k, v]) => [`golden profile ${k}`, v] as [string, Record<string, unknown>]),
  [`backend golden-profile5-complete.json`, JSON.parse(fs.readFileSync(BACKEND_GOLDEN, `utf-8`)).facts],
  ...fs
    .readdirSync(SCENARIOS)
    .filter((f) => f.endsWith(`.json`))
    .sort()
    .map(
      (f) => [f, JSON.parse(fs.readFileSync(`${SCENARIOS}/${f}`, `utf-8`)).facts] as [string, Record<string, unknown>]
    ),
];

const read = (factGraph: FactGraph, p: string) => {
  const r = factGraph.get(p as ConcretePath);
  return { complete: r.complete, value: r.hasValue ? r.get : undefined };
};

describe(`knockouts are complete false when they don't apply (#186)`, () => {
  const operands = knockoutOperands();

  it(`reads the /flowIsKnockedOut operands`, () => {
    expect(operands.length).toBeGreaterThan(100);
    expect(operands.filter(([, neg]) => neg).length).toBeGreaterThan(0);
  });

  it(`every operand is Complete(false) and every top-level blocking fact is complete on every clean return`, () => {
    const failures: string[] = [];
    let clean = 0;
    for (const [name, facts] of returns) {
      const { factGraph } = setupFactGraph(withoutMeta(facts));
      // A return is knocked out when any operand reads true (complete or placeholder); the rest are clean.
      const fired = operands.some(([p, neg]) => {
        const { value } = read(factGraph, p);
        return neg ? value === false : value === true;
      });
      if (fired) continue;
      clean++;
      for (const [p, neg] of operands) {
        const { complete, value } = read(factGraph, p);
        if (!complete || value !== neg)
          failures.push(`${name}: ${neg ? `Not ` : ``}${p} = ${complete ? `` : `incomplete `}${value}`);
      }
      for (const p of submissionBlockingFactsRequiringValue) {
        const { complete, value } = read(factGraph, p);
        if (!complete) failures.push(`${name}: top-level blocking ${p} = incomplete ${value}`);
      }
      const ko = read(factGraph, `/flowIsKnockedOut`);
      if (!ko.complete || ko.value !== false) failures.push(`${name}: /flowIsKnockedOut = ${ko.complete} ${ko.value}`);
    }
    expect(failures).toEqual([]);
    // Most returns are clean; the Schedule C and Schedule 3-A template knockouts (#89) take out the business and
    // EIC/ACTC returns, which leaves 99 clean returns on this tree.
    expect(clean).toBeGreaterThan(90);
  }, 600000);
});

const t = createBooleanWrapper(true);
const distId = `186a0000-0000-4000-8000-000000000001`;
const hsaDistribution = (extra: Record<string, unknown>) => ({
  ...singleFilerWithHsaDeductions,
  '/hsaDistributions': createCollectionWrapper([distId]),
  ...makeSimpleHsaDistributionDataWithoutCollection(distId, 500),
  ...extra,
});

/** Each changed knockout still fires in its true case. */
const trueCases: [string, string, Record<string, unknown>][] = [
  [
    `HSA MFS line 6 "yes"`,
    `/flowKnockoutMFSLine6Check`,
    {
      ...baseFilerData,
      ...mfsFilerData,
      ...basePrimaryFilerHSAFactsWithoutContributionAmounts,
      [`/filers/#${primaryFilerId}/typeOfHdhp`]: createEnumWrapper(`family`, `/typeOfHdhpOptions`),
      [`/filers/#${primaryFilerId}/writableMfsLine6Check`]: t,
    },
  ],
  [
    `qualified HSA funding distribution, primary filer`,
    `/flowKnockoutMadeQualifiedHsaFundingDistribution`,
    { ...singleFilerWithHsaDeductions, [`/filers/#${primaryFilerId}/hasMadeQualifiedHsaFundingDistribution`]: t },
  ],
  [
    `qualified HSA funding distribution, spouse on a joint return`,
    `/flowKnockoutMadeQualifiedHsaFundingDistribution`,
    { ...mfjBothWithQualifiedHsaDeductions, [`/filers/#${spouseId}/hasMadeQualifiedHsaFundingDistribution`]: t },
  ],
  [
    `Archer MSA or Medicare Advantage MSA`,
    `/flowKnockoutHsaMedicalSavingsAccountType`,
    { ...singleFilerWithHsaDeductions, '/hasHsaMedicalSavingsAccountType': t },
  ],
  [
    `excess HSA contributions from a prior year`,
    `/flowKnockoutHsaExcessContributions`,
    { ...singleFilerWithHsaDeductions, '/writableHasHsaExcessContributionsPreviousYear': t },
  ],
  [
    `HSA distribution code other than normal`,
    `/flowKnockoutHsaDistributionCode`,
    hsaDistribution({
      [`/hsaDistributions/#${distId}/hsaDistributionCode`]: createEnumWrapper(
        `disability`,
        `/hsaDistributionCodeOptions`
      ),
    }),
  ],
  [
    `earnings on excess HSA contributions`,
    `/flowKnockoutEarningsOnExcessContributions`,
    hsaDistribution({
      [`/hsaDistributions/#${distId}/hasWithdrawnExcessContributions`]: t,
      [`/hsaDistributions/#${distId}/writableWithdrawnExcessContributionsAmount`]: createDollarWrapper(`100`),
      [`/hsaDistributions/#${distId}/writableEarningsOnExcessContributions`]: createDollarWrapper(`10`),
    }),
  ],
  [
    `HSA distribution not used for qualified medical expenses`,
    `/flowKnockoutHsaUnqualifiedDistributions`,
    hsaDistribution({ [`/hsaDistributions/#${distId}/writableQualifiedMedExpenses`]: createDollarWrapper(`100`) }),
  ],
  [
    `HSA distribution after death with a fair market value`,
    `/flowKnockoutHsaDistributionFMV`,
    hsaDistribution({
      [`/hsaDistributions/#${distId}/hsaDistributionCode`]: createEnumWrapper(
        `deathOtherThanCode6`,
        `/hsaDistributionCodeOptions`
      ),
      [`/hsaDistributions/#${distId}/writableFmvOnDateOfDeath`]: createDollarWrapper(`500`),
    }),
  ],
];

describe(`changed knockouts keep their true cases (#186)`, () => {
  for (const [desc, p, facts] of trueCases) {
    it(`${p}: ${desc}`, () => {
      const { factGraph } = setupFactGraph(facts);
      expect(read(factGraph, p).value).toBe(true);
    });
  }
});
