import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { filerWithW2NoDeductionsNoCreditsBaseData, primaryFilerId } from '../testData.js';

/**
 * Schedule SE lines this tool does not compute. 26 U.S.C. 1402(a), 1402(a)(1), 1402(a)(8), 1402(a)(12),
 * 1402(a)(14), 1402(b)(2), 1402(c)(1), 1402(c)(4), 1402(e), 1402(g), 1402(j), 1402(l), and 164(f)(1)
 * (https://www.law.cornell.edu/uscode/text/26/1402). Supported path: net profit floored at 0, times 92.35%,
 * OASDI 12.4% and Medicare 2.9%, half on Schedule 1 line 15.
 */
const KO = `/flowKnockoutScheduleSEOutOfScope`;
const QUESTIONS = [
  `/hadFarmSelfEmploymentIncome`,
  `/hadChurchEmployeeIncome`,
  `/usesSeOptionalMethod`,
  `/hasMinisterOrSeExemption`,
  `/hasNotarySeExclusion`,
  `/hadForm8919Wages`,
] as const;

const biz = `5e000000-0000-4000-8000-000000000001`;
const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
  '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
};
const seNo = Object.fromEntries(QUESTIONS.map((path) => [path, createBooleanWrapper(false)]));
const scheduleC = (extra: Record<string, unknown> = {}) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  ...seNo,
  '/scheduleCBusinesses': createCollectionWrapper([biz]),
  [`/scheduleCBusinesses/#${biz}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${biz}/businessName`]: createStringWrapper(`Gig Work`),
  [`/scheduleCBusinesses/#${biz}/writableGrossReceipts`]: createDollarWrapper(`10000`),
  [`/scheduleCBusinesses/#${biz}/writableTotalExpenses`]: createDollarWrapper(`2000`),
  [`/scheduleCBusinesses/#${biz}/materiallyParticipates`]: createBooleanWrapper(true),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  ...extra,
});

const fg = (data: Record<string, unknown>) => setupFactGraph(data).factGraph;
const read = (g: ReturnType<typeof fg>, path: string) => g.get(path as ConcretePath);

describe(`Schedule SE out-of-scope lines`, () => {
  it(`self-employment income not asked, or answered no: the knockout is complete false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    for (const data of [
      filerWithW2NoDeductionsNoCreditsBaseData,
      { ...filerWithW2NoDeductionsNoCreditsBaseData, '/hadSelfEmploymentIncome': createBooleanWrapper(false) },
    ]) {
      const knockout = read(fg(data), KO);
      expect(knockout.complete).toBe(true);
      expect(knockout.get).toBe(false);
    }
  });

  it(`scenario A, every answer no: SE tax $1,130 and the section 164(f) half $565; the knockout is false`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [
      KO,
      `/scheduleCNetProfitOrLoss`,
      `/seNetEarningsFromSelfEmployment`,
      `/selfEmploymentTax`,
      `/deductibleSelfEmploymentTax`,
      `/scheduleCSectionIsComplete`,
    ];
    const g = fg({ ...noW2, ...scheduleC() });
    expect(read(g, `/scheduleCNetProfitOrLoss`).get.toString()).toBe(`8000.00`);
    // round(8,000 × 0.9235) = 7,388. 26 U.S.C. 1402(a)(12).
    expect(read(g, `/seNetEarningsFromSelfEmployment`).get.toString()).toBe(`7388.00`);
    // round(7,388 × 0.124) = 916; round(7,388 × 0.029) = 214; total 1,130. 26 U.S.C. 1401(a), 1401(b)(1).
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
    // round(1,130 × 50%) = 565. 26 U.S.C. 164(f)(1).
    expect(read(g, `/deductibleSelfEmploymentTax`).get.toString()).toBe(`565.00`);
    const knockout = read(g, KO);
    expect(knockout.complete).toBe(true);
    expect(knockout.get).toBe(false);
    expect(read(g, `/scheduleCSectionIsComplete`).get).toBe(true);
  });

  it(`any yes stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/flowIsKnockedOut`, `/scheduleCSectionIsComplete`];
    for (const path of QUESTIONS) {
      const g = fg({ ...noW2, ...scheduleC({ [path]: createBooleanWrapper(true) }) });
      const knockout = read(g, KO);
      expect(knockout.complete, path).toBe(true);
      expect(knockout.get, path).toBe(true);
      expect(read(g, `/flowIsKnockedOut`).get, path).toBe(true);
      expect(read(g, `/scheduleCSectionIsComplete`).complete, path).toBe(true);
      expect(read(g, `/scheduleCSectionIsComplete`).get, path).toBe(false);
    }
  });

  it(`an unanswered question while self-employment income is yes stays incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/flowIsKnockedOut`];
    const { '/hadFarmSelfEmploymentIncome': _farm, ...rest } = scheduleC();
    const g = fg({ ...noW2, ...rest });
    expect(read(g, KO).complete).toBe(false);
    expect(read(g, `/flowIsKnockedOut`).complete).toBe(false);
    expect(read(g, `/selfEmploymentTax`).get.toString()).toBe(`1130.00`);
  });
});
