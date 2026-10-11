import { describe, it, expect } from 'vitest';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';
import { makeW2Data, mfjFilerData, mfsFilerData, primaryFilerId, singleFilerData } from '../testData.js';

/**
 * Schedule D + Form 8949 — worked examples for TY2026.
 * Cites: Rev. Proc. 2025-32 §4.03 p.13; IRC §1211(b), §1212(b), §1222; Form 8949 instr. (2025) pp.3–4, p.11;
 * Schedule D instr. (2025) p.3, p.10, p.14; QDCG Tax Worksheet—Form 1040 instr. (2025) p.38.
 */

const tx1 = `a1111111-1111-4111-8111-111111111111`;
const tx2 = `a2222222-2222-4222-8222-222222222222`;

function tx(
  id: string,
  opts: {
    description: string;
    proceeds: string;
    costBasis: string;
    box: string;
    holdingPeriod: string;
    adjustment?: string;
  }
) {
  const o: Record<string, unknown> = {
    [`/form8949Transactions/#${id}/description`]: createStringWrapper(opts.description),
    [`/form8949Transactions/#${id}/dateAcquired`]: createDayWrapper(`2024-06-01`),
    [`/form8949Transactions/#${id}/dateSold`]: createDayWrapper(
      opts.holdingPeriod === `longTerm` ? `2026-07-01` : `2024-12-01`
    ),
    [`/form8949Transactions/#${id}/proceeds`]: createDollarWrapper(opts.proceeds),
    [`/form8949Transactions/#${id}/costBasis`]: createDollarWrapper(opts.costBasis),
    [`/form8949Transactions/#${id}/box`]: createEnumWrapper(opts.box, `/form8949BoxOptions`),
    [`/form8949Transactions/#${id}/holdingPeriod`]: createEnumWrapper(
      opts.holdingPeriod,
      `/form8949HoldingPeriodOptions`
    ),
    [`/form8949Transactions/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  };
  if (opts.adjustment !== undefined) {
    o[`/form8949Transactions/#${id}/writableAdjustment`] = createDollarWrapper(opts.adjustment);
  }
  return o;
}

describe(`Schedule D / Form 8949 — no capital activity regression`, () => {
  it(`Form 1040 line 7 stays $0 with empty Form 8949 collection`, ({ task }) => {
    task.meta.testedFactPaths = [`/capitalGainsOrLosses`, `/capitalGainsOrLossesFor1040`, `/requiresScheduleD`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([]),
    });
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`0.00`);
    expect(factGraph.get(`/requiresScheduleD` as ConcretePath).get).toBe(false);
  });
});

describe(`Schedule D / Form 8949 — short-term only (Box A)`, () => {
  it(`ST gain $4,000 → Schedule D line 7 / 1040 line 7 = $4,000`, ({ task }) => {
    // Worked: proceeds 10000 − basis 6000 = 4000. Form 8949 instr. (2025) col (h) Examples p.11; Box A p.3.
    task.meta.testedFactPaths = [
      `/form8949Transactions/*/gainOrLoss`,
      `/scheduleDLine1b`,
      `/scheduleDLine7`,
      `/scheduleDLine16`,
      `/capitalGainsOrLosses`,
    ];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `100 sh XYZ`,
        proceeds: `10000`,
        costBasis: `6000`,
        box: `A`,
        holdingPeriod: `shortTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/form8949Transactions/#${tx1}/gainOrLoss` as ConcretePath).get.toString()).toBe(`4000.00`);
    expect(factGraph.get(`/scheduleDLine1b` as ConcretePath).get.toString()).toBe(`4000.00`);
    expect(factGraph.get(`/scheduleDLine7` as ConcretePath).get.toString()).toBe(`4000.00`);
    expect(factGraph.get(`/scheduleDLine16` as ConcretePath).get.toString()).toBe(`4000.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`4000.00`);
  });
});

describe(`Schedule D / Form 8949 — long-term only (Box D)`, () => {
  it(`LT gain $5,000 → line 15 / 1040 line 7 = $5,000; breakpoints available`, ({ task }) => {
    // Box D — Form 8949 instr. p.4. Breakpoints Rev. Proc. 2025-32 §4.03 p.13 (Single $49,450 / $545,500).
    task.meta.testedFactPaths = [
      `/scheduleDLine8b`,
      `/scheduleDLine15`,
      `/capitalGainsOrLosses`,
      `/capGainsZeroRateAmount`,
      `/capGains15RateAmount`,
      `/hasNetLongTermCapitalGain`,
    ];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `50 sh ABC`,
        proceeds: `15000`,
        costBasis: `10000`,
        box: `D`,
        holdingPeriod: `longTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/scheduleDLine15` as ConcretePath).get.toString()).toBe(`5000.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`5000.00`);
    expect(factGraph.get(`/hasNetLongTermCapitalGain` as ConcretePath).get).toBe(true);
    // Rev. Proc. 2025-32 §4.03 p.13 — All Other Individuals
    expect(factGraph.get(`/capGainsZeroRateAmount` as ConcretePath).get.toString()).toBe(`49450.00`);
    expect(factGraph.get(`/capGains15RateAmount` as ConcretePath).get.toString()).toBe(`545500.00`);
  });
});

describe(`Schedule D / Form 8949 — mixed ST + LT`, () => {
  it(`ST loss ($1,000) + LT gain $3,000 → net $2,000 on line 16 / 1040 line 7`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine7`, `/scheduleDLine15`, `/scheduleDLine16`, `/capitalGainsOrLosses`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1, tx2]),
      ...tx(tx1, {
        description: `ST loser`,
        proceeds: `2000`,
        costBasis: `3000`,
        box: `B`,
        holdingPeriod: `shortTerm`,
      }),
      ...tx(tx2, {
        description: `LT winner`,
        proceeds: `8000`,
        costBasis: `5000`,
        box: `E`,
        holdingPeriod: `longTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/scheduleDLine7` as ConcretePath).get.toString()).toBe(`-1000.00`);
    expect(factGraph.get(`/scheduleDLine15` as ConcretePath).get.toString()).toBe(`3000.00`);
    expect(factGraph.get(`/scheduleDLine16` as ConcretePath).get.toString()).toBe(`2000.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`2000.00`);
  });
});

describe(`Schedule D / Form 8949 — §1211(b) capital loss limitation`, () => {
  it(`Net ST loss ($8,000) limited to ($3,000) for non-MFS — IRC §1211(b)`, ({ task }) => {
    // Schedule D instr. (2025) p.3: gains plus $3,000; line 21 p.14.
    task.meta.testedFactPaths = [
      `/scheduleDLine16`,
      `/scheduleDLine21`,
      `/capitalLossLimit`,
      `/capitalGainsOrLosses`,
    ];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `big ST loss`,
        proceeds: `2000`,
        costBasis: `10000`,
        box: `C`,
        holdingPeriod: `shortTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/scheduleDLine16` as ConcretePath).get.toString()).toBe(`-8000.00`);
    expect(factGraph.get(`/capitalLossLimit` as ConcretePath).get.toString()).toBe(`3000.00`);
    expect(factGraph.get(`/scheduleDLine21` as ConcretePath).get.toString()).toBe(`3000.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`-3000.00`);
  });

  it(`MFS loss limit is $1,500 — IRC §1211(b)`, ({ task }) => {
    task.meta.testedFactPaths = [`/capitalLossLimit`, `/scheduleDLine21`, `/capitalGainsOrLosses`];
    const { factGraph } = setupFactGraph({
      ...mfsFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `MFS ST loss`,
        proceeds: `1000`,
        costBasis: `5000`,
        box: `C`,
        holdingPeriod: `shortTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/capitalLossLimit` as ConcretePath).get.toString()).toBe(`1500.00`);
    expect(factGraph.get(`/scheduleDLine21` as ConcretePath).get.toString()).toBe(`1500.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`-1500.00`);
  });

  it(`Net loss under the limit is fully allowed`, ({ task }) => {
    task.meta.testedFactPaths = [`/capitalGainsOrLosses`, `/scheduleDLine21`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `small ST loss`,
        proceeds: `1000`,
        costBasis: `2500`,
        box: `A`,
        holdingPeriod: `shortTerm`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/scheduleDLine16` as ConcretePath).get.toString()).toBe(`-1500.00`);
    expect(factGraph.get(`/scheduleDLine21` as ConcretePath).get.toString()).toBe(`1500.00`);
    expect(factGraph.get(`/capitalGainsOrLosses` as ConcretePath).get.toString()).toBe(`-1500.00`);
  });
});

describe(`Schedule D / Form 8949 — MFJ breakpoints`, () => {
  it(`MFJ zero/15% breakpoints match Rev. Proc. 2025-32 §4.03 p.13`, ({ task }) => {
    task.meta.testedFactPaths = [`/capGainsZeroRateAmount`, `/capGains15RateAmount`];
    const { factGraph } = setupFactGraph({
      ...mfjFilerData,
      '/form8949Transactions': createCollectionWrapper([]),
    });
    expect(factGraph.get(`/capGainsZeroRateAmount` as ConcretePath).get.toString()).toBe(`98900.00`);
    expect(factGraph.get(`/capGains15RateAmount` as ConcretePath).get.toString()).toBe(`613700.00`);
  });
});

describe(`Schedule D / Form 8949 — adjustment column (g)`, () => {
  it(`gainOrLoss = proceeds − basis + adjustment (Form 8949 instr. (2025) p.11 Example 3)`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8949Transactions/*/gainOrLoss`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, {
        description: `adj example`,
        proceeds: `6000`,
        costBasis: `2000`,
        box: `A`,
        holdingPeriod: `shortTerm`,
        adjustment: `-1000`,
      }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/form8949Transactions/#${tx1}/gainOrLoss` as ConcretePath).get.toString()).toBe(`3000.00`);
  });
});

const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], path: string) =>
  fg.get(path as ConcretePath).get.toString();

describe(`Schedule D / Form 8949 — digital-asset boxes G–L`, () => {
  it(`Box G totals with Box A on line 1b; Box J with Box D on line 8b (Schedule D 2025 line labels)`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleDLine1b`, `/scheduleDLine8b`, `/scheduleDLine16`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1, tx2]),
      ...tx(tx1, { description: `BTC`, proceeds: `3000`, costBasis: `2000`, box: `G`, holdingPeriod: `shortTerm` }),
      ...tx(tx2, { description: `ETH`, proceeds: `5000`, costBasis: `1000`, box: `J`, holdingPeriod: `longTerm` }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(get(factGraph, `/scheduleDLine1b`)).toBe(`1000.00`);
    expect(get(factGraph, `/scheduleDLine8b`)).toBe(`4000.00`);
    expect(get(factGraph, `/scheduleDLine16`)).toBe(`5000.00`);
  });

  it(`Part II box with a short-term holding period blocks submission (IRC §1222)`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasForm8949BoxHoldingPeriodMismatch`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, { description: `bad box`, proceeds: `3000`, costBasis: `2000`, box: `D`, holdingPeriod: `shortTerm` }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
    });
    expect(factGraph.get(`/hasForm8949BoxHoldingPeriodMismatch` as ConcretePath).get).toBe(true);
  });
});

describe(`Schedule D — prior-year capital loss carryover (lines 6 / 14)`, () => {
  it(`ST carryover $5,000 + LT gain $2,000 → line 16 ($3,000) → 1040 line 7 ($3,000)`, ({ task }) => {
    // Schedule D instr. (2025) p.10 Capital Loss Carryover Worksheet; IRC §1212(b)(1).
    task.meta.testedFactPaths = [
      `/scheduleDLine6`,
      `/scheduleDLine7`,
      `/scheduleDLine16`,
      `/scheduleDLine21`,
      `/capitalGainsOrLosses`,
    ];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([tx1]),
      ...tx(tx1, { description: `LT`, proceeds: `4000`, costBasis: `2000`, box: `D`, holdingPeriod: `longTerm` }),
      '/form8949TransactionsIsDone': createBooleanWrapper(true),
      '/writableShortTermCapitalLossCarryover': createDollarWrapper(`5000`),
    });
    expect(get(factGraph, `/scheduleDLine6`)).toBe(`5000.00`);
    expect(get(factGraph, `/scheduleDLine7`)).toBe(`-5000.00`);
    expect(get(factGraph, `/scheduleDLine16`)).toBe(`-3000.00`);
    expect(get(factGraph, `/scheduleDLine21`)).toBe(`3000.00`);
    expect(get(factGraph, `/capitalGainsOrLosses`)).toBe(`-3000.00`);
  });

  it(`LT carryover alone requires Schedule D and is limited to $3,000`, ({ task }) => {
    task.meta.testedFactPaths = [`/requiresScheduleD`, `/scheduleDLine14`, `/scheduleDLine15`, `/capitalGainsOrLosses`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      '/form8949Transactions': createCollectionWrapper([]),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`10000`),
    });
    expect(factGraph.get(`/requiresScheduleD` as ConcretePath).get).toBe(true);
    expect(get(factGraph, `/scheduleDLine14`)).toBe(`10000.00`);
    expect(get(factGraph, `/scheduleDLine15`)).toBe(`-10000.00`);
    expect(get(factGraph, `/capitalGainsOrLosses`)).toBe(`-3000.00`);
  });
});

describe(`QDCG Tax Worksheet (Form 1040 instr. (2025) p.38) — 0% / 15% / 20%`, () => {
  // Filer cannot be claimed so the full $16,100 standard deduction applies (Rev. Proc. 2025-32 §4.14 p.18).
  const notClaimable = { [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false) };
  const ltGain = (amount: number) => ({
    ...notClaimable,
    '/form8949Transactions': createCollectionWrapper([tx1]),
    ...tx(tx1, { description: `LT`, proceeds: `${amount}`, costBasis: `0`, box: `D`, holdingPeriod: `longTerm` }),
    '/form8949TransactionsIsDone': createBooleanWrapper(true),
  });

  it(`0% band: Single, wages $30,000 + LT gain $10,000 → gain taxed at 0%`, ({ task }) => {
    // Taxable income $23,900 (= $40,000 − $16,100 std ded., Rev. Proc. 2025-32 §4.14 p.18).
    // Line 5 = $13,900; line 9 = $10,000 at 0% (below $49,450, Rev. Proc. 2025-32 §4.03 p.13).
    // Line 22 = Tax Table on $13,900 (midpoint $13,925): $1,240 + 12% × $1,525 = $1,423.
    task.meta.testedFactPaths = [`/qdcgLine5`, `/qdcgLine9`, `/qdcgLine17`, `/qdcgLine20`, `/tentativeTaxFromTaxableIncome`];
    const { factGraph } = setupFactGraph({ ...singleFilerData, ...makeW2Data(30000), ...ltGain(10000) });
    expect(get(factGraph, `/taxableIncome`)).toBe(`23900.00`);
    expect(get(factGraph, `/qdcgLine5`)).toBe(`13900.00`);
    expect(get(factGraph, `/qdcgLine9`)).toBe(`10000.00`);
    expect(get(factGraph, `/qdcgLine17`)).toBe(`0.00`);
    expect(get(factGraph, `/qdcgLine20`)).toBe(`0.00`);
    expect(get(factGraph, `/tentativeTaxFromTaxableIncome`)).toBe(`1423.00`);
  });

  it(`15% band: Single, wages $100,000 + LT gain $20,000 → 15% × $20,000 = $3,000`, ({ task }) => {
    // Taxable income $103,900; line 5 $83,900 ≥ $49,450 so line 9 = 0; line 17 = $20,000; line 18 = $3,000.
    task.meta.testedFactPaths = [`/qdcgLine9`, `/qdcgLine17`, `/qdcgLine18`, `/qdcgLine21`, `/tentativeTaxFromTaxableIncome`];
    const { factGraph } = setupFactGraph({ ...singleFilerData, ...makeW2Data(100000), ...ltGain(20000) });
    expect(get(factGraph, `/taxableIncome`)).toBe(`103900.00`);
    expect(get(factGraph, `/qdcgLine9`)).toBe(`0.00`);
    expect(get(factGraph, `/qdcgLine17`)).toBe(`20000.00`);
    expect(get(factGraph, `/qdcgLine18`)).toBe(`3000.00`);
    expect(get(factGraph, `/qdcgLine21`)).toBe(`0.00`);
    // Tax on line 5 ($83,900, Tax Table midpoint $83,925) + $3,000 must be below regular tax on $103,900.
    const line25 = Number(get(factGraph, `/qdcgLine25`));
    expect(line25).toBe(Number(get(factGraph, `/qdcgLine22`)) + 3000);
    expect(line25).toBeLessThan(Number(get(factGraph, `/taxOnTaxableIncomeRegularRates`)));
    expect(get(factGraph, `/tentativeTaxFromTaxableIncome`)).toBe(line25.toFixed(2));
  });

  it(`20% band: Single, wages $600,000 + LT gain $100,000 → 20% × $100,000 = $20,000`, ({ task }) => {
    // Taxable income $683,900; line 5 $583,900 > $545,500 (Rev. Proc. 2025-32 §4.03 p.13) so line 16/17 = 0.
    task.meta.testedFactPaths = [`/qdcgLine14`, `/qdcgLine17`, `/qdcgLine20`, `/qdcgLine21`];
    const { factGraph } = setupFactGraph({ ...singleFilerData, ...makeW2Data(600000), ...ltGain(100000) });
    expect(get(factGraph, `/taxableIncome`)).toBe(`683900.00`);
    expect(get(factGraph, `/qdcgLine14`)).toBe(`545500.00`);
    expect(get(factGraph, `/qdcgLine17`)).toBe(`0.00`);
    expect(get(factGraph, `/qdcgLine20`)).toBe(`100000.00`);
    expect(get(factGraph, `/qdcgLine21`)).toBe(`20000.00`);
  });

  it(`No net capital gain → regular tax unchanged (worksheet not used)`, ({ task }) => {
    task.meta.testedFactPaths = [`/usesQdcgTaxWorksheet`, `/tentativeTaxFromTaxableIncome`];
    const { factGraph } = setupFactGraph({
      ...singleFilerData,
      ...makeW2Data(50000),
      ...notClaimable,
      '/form8949Transactions': createCollectionWrapper([]),
    });
    expect(factGraph.get(`/usesQdcgTaxWorksheet` as ConcretePath).get).toBe(false);
    expect(get(factGraph, `/tentativeTaxFromTaxableIncome`)).toBe(get(factGraph, `/taxOnTaxableIncomeRegularRates`));
  });
});
