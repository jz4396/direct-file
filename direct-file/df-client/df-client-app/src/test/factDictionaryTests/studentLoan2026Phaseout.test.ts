import { it, describe, expect } from 'vitest';
import { Path } from '../../flow/Path.js';
import { createBooleanWrapper, createDollarWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { baseFilerData, makeW2Data, primaryFilerId } from '../testData.js';
import { setupFactGraph } from '../setupFactGraph.js';

/**
 * #63: TY2026 §221 phaseout. Rev. Proc. 2025-32 §3.29, p. 23 (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf):
 * "the $2,500 maximum deduction ... begins to phase out under § 221(b)(2)(B) ... for taxpayers with modified
 * adjusted gross income in excess of $85,000 ($175,000 for joint returns), and is completely phased out for
 * taxpayers with modified adjusted gross income of $100,000 or more ($205,000 or more for joint returns)."
 * IRC §221(b) (https://www.law.cornell.edu/uscode/text/26/221). Reduction = $2,500 x (MAGI - start) / range,
 * range $15,000 ($30,000 joint), ratio to 3 decimals per the Student Loan Interest Deduction Worksheet.
 */
const build = (status: `single` | `marriedFilingJointly`, wages: number, interest = `2500.00`) =>
  setupFactGraph({
    ...baseFilerData,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    [`/filingStatus`]: createEnumWrapper(status, `/filingStatusOptions`),
    ...makeW2Data(wages),
    [`/hadStudentLoanInterestPayments`]: createBooleanWrapper(true),
    [`/studentLoansQualify`]: createBooleanWrapper(true),
    [`/studentLoanInterestAmount`]: createDollarWrapper(interest),
  }).factGraph;
const amount = (fg: ReturnType<typeof build>) =>
  fg.get(Path.concretePath(`/studentLoanInterestAdjustmentAmount`, null)).get.toString();

describe(`TY2026 student loan interest phaseout (#63)`, () => {
  const cases: [`single` | `marriedFilingJointly`, number, string][] = [
    // single / HOH / QSS: $85,000 - $100,000
    [`single`, 84999, `2500.00`],
    [`single`, 85000, `2500.00`], // not "in excess of $85,000"
    [`single`, 85001, `2500.00`], // 1/15,000 = 0.000 at 3 decimals
    [`single`, 92500, `1250.00`], // 7,500 / 15,000 = 0.500
    [`single`, 99999, `0.00`], // 14,999 / 15,000 = 1.000 at 3 decimals (worksheet rounding)
    [`single`, 100000, `0.00`], // "completely phased out ... of $100,000 or more"
    [`single`, 100001, `0.00`],
    // joint: $175,000 - $205,000
    [`marriedFilingJointly`, 175000, `2500.00`],
    [`marriedFilingJointly`, 190000, `1250.00`], // 15,000 / 30,000 = 0.500
    [`marriedFilingJointly`, 205000, `0.00`],
    [`marriedFilingJointly`, 205001, `0.00`],
  ];
  cases.forEach(([status, wages, expected]) => {
    it(`${status} MAGI ${wages}: deduction ${expected}`, ({ task }) => {
      task.meta.testedFactPaths = [`/studentLoanInterestAdjustmentAmount`];
      expect(amount(build(status, wages))).toBe(expected);
    });
  });

  it(`phaseout constants are the TY2026 amounts`, ({ task }) => {
    const paths = [
      `/studentLoanPhaseOutStart`,
      `/studentLoanPhaseOutComplete`,
      `/studentLoanPhaseOutStartMfj`,
      `/studentLoanPhaseOutCompleteMfj`,
      `/maxIncomeForNonMFJStudentLoanInterestDeduction`,
      `/maxIncomeForMFJStudentLoanInterestDeduction`,
      `/maxStudentLoadDeduction`,
    ];
    task.meta.testedFactPaths = paths;
    const fg = build(`single`, 50000);
    expect(paths.map((p) => fg.get(Path.concretePath(p as never, null)).get.toString())).toEqual([
      `85000.00`,
      `100000.00`,
      `175000.00`,
      `205000.00`,
      `100000.00`,
      `205000.00`,
      `2500.00`,
    ]);
  });
});
