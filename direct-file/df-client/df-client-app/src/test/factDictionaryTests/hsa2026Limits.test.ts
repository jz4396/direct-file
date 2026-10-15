import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { Path } from '../../flow/Path.js';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseHSAFactsSkipToTestingPeriod, makeW2Data, primaryFilerId, singleFilerData } from '../testData.js';

/**
 * #62: TY2026 HSA / HDHP amounts, Rev. Proc. 2025-19 §2.01, p. 2
 * (https://www.irs.gov/pub/irs-drop/rp-25-19.pdf), IRC §223(b)(2) and §223(c)(2)
 * (https://www.law.cornell.edu/uscode/text/26/223):
 * "the annual limitation on deductions under § 223(b)(2)(A) for an individual with self-only coverage under a
 * high deductible health plan is $4,400 ... under § 223(b)(2)(B) for an individual with family coverage under a
 * high deductible health plan is $8,750." HDHP: deductible "not less than $1,700 for self-only coverage or $3,400
 * for family coverage" and out-of-pocket "do not exceed $8,500 for self-only coverage or $17,000 for family".
 * The $1,000 catch-up is statutory, §223(b)(3)(B).
 */
const w2Id = `9ba9d216-81a8-4944-81ac-9410b2fad150`;
const build = (coverage: `selfOnly` | `family`, contribution: string, dob = `1990-06-06`) =>
  setupFactGraph({
    ...singleFilerData,
    ...baseHSAFactsSkipToTestingPeriod,
    ...makeW2Data(50000, w2Id),
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(dob),
    [Path.concretePath(`/formW2s/*/filer`, w2Id)]: createCollectionItemWrapper(primaryFilerId),
    [`/formW2s/#${w2Id}/employerHsaContributions`]: createDollarWrapper(contribution),
    [`/filers/#${primaryFilerId}/enrolledInMedicare`]: createEnumWrapper(`noneOfYear`, `/enrolledInMedicareOptions`),
    [`/filers/#${primaryFilerId}/hsaHdhpCoverageStatus`]: createEnumWrapper(`allYear`, `/hsaHdhpCoverageStatusOptions`),
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    [`/filers/#${primaryFilerId}/typeOfHdhp`]: createEnumWrapper(coverage, `/typeOfHdhpOptions`),
  }).factGraph;
const get = (fg: ReturnType<typeof build>, p: string) => fg.get(p as ConcretePath).get.toString();

describe(`TY2026 HSA limits (#62, Rev. Proc. 2025-19 p. 2)`, () => {
  const constants: [string, string][] = [
    [`/hsaSelfOnlyCoverageLimit`, `4400.00`],
    [`/hsaFamilyCoverageLimit`, `8750.00`],
    [`/hsaOver55AdditionalCoverageLimit`, `1000.00`],
    [`/hdhpMinAnnualDeductibleSelf`, `1700.00`],
    [`/hdhpMinAnnualDeductibleFamily`, `3400.00`],
    [`/hdhpMaxOOPExpensesSelf`, `8500.00`],
    [`/hdhpMaxOOPExpensesFamily`, `17000.00`],
  ];
  constants.forEach(([path, expected]) => {
    it(`${path} is ${expected}`, ({ task }) => {
      task.meta.testedFactPaths = [path];
      expect(get(build(`selfOnly`, `0.00`), path)).toBe(expected);
    });
  });

  const edges: [`selfOnly` | `family`, string, string, boolean, string][] = [
    // [coverage, date of birth, contributions, exceeded, line 8 limit]
    [`selfOnly`, `1990-06-06`, `4400.00`, false, `4400.00`],
    [`selfOnly`, `1990-06-06`, `4401.00`, true, `4400.00`],
    [`family`, `1990-06-06`, `8750.00`, false, `8750.00`],
    [`family`, `1990-06-06`, `8751.00`, true, `8750.00`],
    [`selfOnly`, `1957-06-06`, `5400.00`, false, `5400.00`],
    [`selfOnly`, `1957-06-06`, `5401.00`, true, `5400.00`],
    [`family`, `1957-06-06`, `9750.00`, false, `9750.00`],
    [`family`, `1957-06-06`, `9751.00`, true, `9750.00`],
  ];
  edges.forEach(([cov, dob, amt, exceeded, limit]) => {
    it(`${cov}, born ${dob}, contributions ${amt}: limit ${limit}, exceeded = ${exceeded}`, ({ task }) => {
      task.meta.testedFactPaths = [
        `/primaryFiler/hsaTotalContributionLimit`,
        `/primaryFiler/hsaContributionLimitExceeded`,
      ];
      const fg = build(cov, amt, dob);
      expect(get(fg, `/primaryFiler/hsaTotalContributionLimit`)).toBe(limit);
      expect(get(fg, `/primaryFiler/hsaContributionLimitExceeded`)).toBe(String(exceeded));
    });
  });
});
