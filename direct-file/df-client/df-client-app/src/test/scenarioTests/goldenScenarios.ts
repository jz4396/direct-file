import { ExportedFactRecord } from './scenarios.test.js';

// Snapshot values will be generated and then will be vetted by tax experts or checked against vetted tax returns.
// If changing the snapshot, make sure it is correct (or make a to-do to indicate it needs verifying)
export const singleNoDependentsWithTwoW2s01: ExportedFactRecord = {
  // this test case is just a sample for now and is not vetted as to correctness
  // TY2026 single standard deduction: Rev. Proc. 2025-32 §4.14, p. 18 ($16,100)
  '/standardOrItemizedDeductions': { isComplete: true, value: `16100.00` },
  '/agi': { isComplete: true, value: `39674.00` },
  '/totalIncome': { isComplete: true, value: `39674.00` },
  '/achPaymentDate': { isComplete: false },
};
