import { it, describe, expect } from 'vitest';
import { Path } from '../../flow/Path.js';
import { createEnumWrapper } from '../persistenceWrappers.js';
import { makeW2Data, mfjFilerData, mfsFilerData, singleFilerData } from '../testData.js';
import { setupFactGraph } from '../setupFactGraph.js';

/**
 * #64: TY2026 Saver's credit AGI limits, Notice 2025-67 pp. 3-4 (https://www.irs.gov/pub/irs-drop/n-25-67.pdf),
 * IRC §25B(b)(1) (https://www.law.cornell.edu/uscode/text/26/25B). Joint $48,500 / $52,500 / $80,500; head of
 * household $36,375 / $39,375 / $60,375; all other taxpayers $24,250 / $26,250 / $40,250.
 * The 50/20/10% tier edges (x.49 / x.50 AGI) are in saversCredit.test.ts; this file covers the eligibility ceiling.
 */
const hohData = { ...mfjFilerData, '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`) };
const statuses: [string, Record<string, unknown>, number][] = [
  [`MFJ`, mfjFilerData, 80500],
  [`HoH`, hohData, 60375],
  [`single`, singleFilerData, 40250],
  [`MFS`, mfsFilerData, 40250],
];

describe(`TY2026 Saver's credit AGI ceiling (#64)`, () => {
  statuses.forEach(([label, data, max]) => {
    it(`${label}: AGI ${max} is eligible, ${max + 1} is not`, ({ task }) => {
      task.meta.testedFactPaths = [`/saversCreditMaxAgiLimit`, `/isAgiEligibleForSaversCredit`];
      const at = setupFactGraph({ ...data, ...makeW2Data(max) }).factGraph;
      const over = setupFactGraph({ ...data, ...makeW2Data(max + 1) }).factGraph;
      expect(at.get(Path.concretePath(`/saversCreditMaxAgiLimit`, null)).get.toString()).toBe(`${max}.00`);
      expect(at.get(Path.concretePath(`/isAgiEligibleForSaversCredit`, null)).get).toBe(true);
      expect(over.get(Path.concretePath(`/isAgiEligibleForSaversCredit`, null)).get).toBe(false);
    });
  });
});
