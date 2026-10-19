/**
 * #119: line facts printed on the 2026 draft Schedules 1 and 2 (backend pdf/2026/IRS1040S1, IRS1040S2). Synthetic data.
 * Schedule 2 (Form 1040) 2026 draft https://www.irs.gov/pub/irs-dft/f1040s2--dft.pdf, form page 2 (PDF p. 3):
 * line 15 "Add lines 4 through 11 and line 14", line 17d "Add lines 17a through 17c", line 20 "Add lines 16c, 17d, 18,
 * and 19c", line 21 "Add lines 15 and 20". Schedule 1 (Form 1040) 2026 draft
 * https://www.irs.gov/pub/irs-dft/f1040s1--dft.pdf: line 3 (Schedule C), line 5 (Schedule E), line 15 (deductible part
 * of self-employment tax).
 */
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, primaryFilerId, singleFilerData } from '../testData.js';

const w2Id = `11900000-0000-4000-8000-000000000001`;
const bizId = `11900000-0000-4000-8000-000000000002`;
const intId = `11900000-0000-4000-8000-000000000003`;

const w2 = (wages: string, oasdi: string) => ({
  '/formW2s': createCollectionWrapper([w2Id]),
  [`/formW2s/#${w2Id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/formW2s/#${w2Id}/writableWages`]: createDollarWrapper(wages),
  [`/formW2s/#${w2Id}/writableOasdiWages`]: createDollarWrapper(oasdi),
  [`/formW2s/#${w2Id}/writableMedicareWages`]: createDollarWrapper(wages),
});
const scheduleC = (gross: string, expenses: string) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/wantsQbiDeduction': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([bizId]),
  [`/scheduleCBusinesses/#${bizId}/businessName`]: createStringWrapper(`Synthetic Consulting`),
  [`/scheduleCBusinesses/#${bizId}/writableGrossReceipts`]: createDollarWrapper(gross),
  [`/scheduleCBusinesses/#${bizId}/writableTotalExpenses`]: createDollarWrapper(expenses),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});
const interest = (amount: string) => ({
  '/interestReports': createCollectionWrapper([intId]),
  [`/interestReports/#${intId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/interestReports/#${intId}/payer`]: createStringWrapper(`Synthetic Savings Bank`),
  [`/interestReports/#${intId}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${intId}/writable1099Amount`]: createDollarWrapper(amount),
  [`/interestReports/#${intId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});
const graph = (facts: Record<string, unknown>) =>
  setupFactGraph({ ...baseFilerData, ...singleFilerData, ...facts }).factGraph;
const dollars = (fg: ReturnType<typeof graph>, p: string) => {
  const r = fg.get(p as ConcretePath);
  expect(r.complete, `${p} complete`).toBe(true);
  return r.get.toString();
};

describe(`2026 Schedules 1 and 2 printed line facts (#119)`, () => {
  it(`Schedule 2 lines 4, 15, 17d, 20 and 21 tie out (wages over $200,000, Schedule C, interest)`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/schedule2Line4`,
      `/schedule2Line15`,
      `/schedule2Line17d`,
      `/schedule2Line20`,
      `/schedule1Line3`,
      `/schedule1Line15`,
    ];
    const fg = graph({ ...w2(`250000`, `184500`), ...scheduleC(`50000`, `10000`), ...interest(`10000`) });
    // Schedule SE: 40,000 x 92.35% = 36,940; social security part $0 (W-2 at the $184,500 base); 2.9% = 1,071.26.
    expect(dollars(fg, `/schedule2Line4`)).toBe(`1071.00`);
    expect(dollars(fg, `/schedule2Line4`)).toBe(dollars(fg, `/selfEmploymentTax`));
    // Form 8959 line 18: 36,940 x 0.9% = 332.46 (line 10 is $0: wages are over $200,000).
    expect(dollars(fg, `/line11AdditionalMedicareTax`)).toBe(`332.00`);
    const line15 =
      Number(dollars(fg, `/schedule2Line4`)) +
      Number(dollars(fg, `/schedule2Line6NetInvestmentIncomeTax`)) +
      Number(dollars(fg, `/line11AdditionalMedicareTax`));
    expect(Number(dollars(fg, `/schedule2Line15`))).toBe(line15);
    // Form 8959 line 12: (250,000 - 200,000) x 0.9% = 450.
    expect(dollars(fg, `/line17bAdditionalMedicareTax`)).toBe(`450.00`);
    expect(dollars(fg, `/schedule2Line17d`)).toBe(`450.00`);
    expect(dollars(fg, `/schedule2Line20`)).toBe(`450.00`);
    expect(Number(dollars(fg, `/line21OfSchedule2`))).toBe(line15 + 450);
    expect(dollars(fg, `/schedule1Line3`)).toBe(`40000.00`);
    expect(dollars(fg, `/schedule1Line15`)).toBe(`536.00`); // 1,071 / 2 = 535.50, whole dollars
  });

  it(`no Schedule C or E: the print-only facts are $0, which prints blank`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule2Line4`, `/schedule1Line3`, `/schedule1Line5`, `/schedule1Line15`];
    const fg = graph({
      ...w2(`50000`, `50000`),
      ...interest(`100`),
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    for (const p of [`/schedule2Line4`, `/schedule2Line17d`, `/schedule2Line20`]) {
      expect(dollars(fg, p), p).toBe(`0.00`);
    }
    for (const p of [`/schedule1Line3`, `/schedule1Line5`, `/schedule1Line15`]) {
      expect(dollars(fg, p), p).toBe(`0.00`);
    }
  });
});
