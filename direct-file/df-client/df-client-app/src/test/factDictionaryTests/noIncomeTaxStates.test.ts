// Refs #93. Full-year TX, NV, SD, WY, and AK follow the Florida no-state-return path.
// Cites are the spec's, kept intact:
// TX: Tex. Const. art. VIII, §24-a (personal income tax prohibited; https://tcss.legis.texas.gov).
//     The Texas Comptroller has no individual income tax return.
// NV: Nev. Const. art. 10, §1(9): "No income tax shall be levied upon the wages or personal income of natural persons."
// AK: AS 43.20.012(a)(1)–(2): "The tax imposed by this chapter does not apply to (1) an individual; (2) a fiduciary"
//     (https://www.akleg.gov/basis/statutes.asp?media=print&secStart=43.20.012&secEnd=43.20.012).
//     The individual tax was repealed by ch. 2 SSSLA 1980. The Permanent Fund Dividend stays federal income only
//     (Schedule 1 line 8g). There's no state return.
// SD: SD Department of Revenue: "South Dakota is one of seven states that does not impose a state income tax"
//     (https://dor.sd.gov/individuals/taxes/).
// WY: State of Wyoming: "Wyoming does not possess an individual or corporate income tax"
//     (https://www.wyo.gov/about-wyoming). Wyo. Stat. Title 39 has no individual income tax chapter.
// On main, /filerResidenceOrIncomeStateOutOfScope is true only for noneOfThese and moreThanOne.
// Slice 2 adds the WA, TN, and NH no-state-return facts and stops. It does not change that scope fact.
// WA capital gains: RCW 82.87.040; RCW 82.87.060(1) $250,000 standard deduction, indexed under RCW 82.87.150
// (WA DOR: "The standard deduction for 2025 is $278,000"; 2026 figure not yet published). The WA return is not produced.
// TN: Hall income tax (Tenn. Code Ann. §67-2-101 et seq.) repealed for tax years beginning January 1, 2021
// (TN DOR Notice #17-09). No stop beyond box 17.
// NH: RSA ch. 77 repealed by 2021, 91:99, II, eff. Jan. 1, 2025. No Interest & Dividends stop.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { baseFilerData, mfjFilerData, primaryFilerId, spouseId } from '../testData.js';
import {
  createBooleanWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { Path } from '../../flow/Path.js';
import type { Path as FDPath } from '../../fact-dictionary/Path.js';
import { setupFactGraph } from '../setupFactGraph.js';
import {
  submissionBlockingFacts,
  submissionBlockingFactsRequiringValue,
} from '../../fact-dictionary/generated/submissionBlockingFacts.js';

const w2Id = `93f10000-e491-4e23-b02d-ade63dce5893`;

const w2 = (box17?: string) => ({
  '/formW2s': createCollectionWrapper([w2Id]),
  [`/formW2s/#${w2Id}/filer`]: {
    item: { id: primaryFilerId },
    $type: `gov.irs.factgraph.persisters.CollectionItemWrapper`,
  },
  [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
  [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`50000.00`),
  ...(box17 ? { [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(box17) } : {}),
});

const residentOf = (st: string) => ({
  '/filerResidenceAndIncomeState': createEnumWrapper(st, `/scopedStateOptions`),
});

const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], p: FDPath) => fg.get(Path.concretePath(p, null));

const STATES = [
  {
    code: `tx`,
    livedIn: `/livedInTx`,
    stateReturn: `/stateReturnIsTx`,
    knockout: `/flowKnockoutTexasStateWithholding`,
  },
  {
    code: `nv`,
    livedIn: `/livedInNv`,
    stateReturn: `/stateReturnIsNv`,
    knockout: `/flowKnockoutNevadaStateWithholding`,
  },
  {
    code: `sd`,
    livedIn: `/livedInSd`,
    stateReturn: `/stateReturnIsSd`,
    knockout: `/flowKnockoutSouthDakotaStateWithholding`,
  },
  {
    code: `wy`,
    livedIn: `/livedInWy`,
    stateReturn: `/stateReturnIsWy`,
    knockout: `/flowKnockoutWyomingStateWithholding`,
  },
  {
    code: `ak`,
    livedIn: `/livedInAk`,
    stateReturn: `/stateReturnIsAk`,
    knockout: `/flowKnockoutAlaskaStateWithholding`,
  },
] as const;

/** Spec cites, verbatim. XML stores "&" as "&amp;"; the assertion unescapes that. */
const CITES = [
  `Tex. Const. art. VIII, §24-a (personal income tax prohibited; https://tcss.legis.texas.gov). ` +
    `The Texas Comptroller has no individual income tax return.`,
  `Nev. Const. art. 10, §1(9): "No income tax shall be levied upon the wages or personal income of natural persons."`,
  `AS 43.20.012(a)(1)–(2): "The tax imposed by this chapter does not apply to (1) an individual; (2) a fiduciary" ` +
    `(https://www.akleg.gov/basis/statutes.asp?media=print&secStart=43.20.012&secEnd=43.20.012). ` +
    `The individual tax was repealed by ch. 2 SSSLA 1980. The Permanent Fund Dividend stays federal income only ` +
    `(Schedule 1 line 8g). There's no state return.`,
  `SD Department of Revenue: "South Dakota is one of seven states that does not impose a state income tax" ` +
    `(https://dor.sd.gov/individuals/taxes/).`,
  `State of Wyoming: "Wyoming does not possess an individual or corporate income tax" ` +
    `(https://www.wyo.gov/about-wyoming). Wyo. Stat. Title 39 has no individual income tax chapter.`,
];

const SLICE2 = [
  {
    code: `wa`,
    livedIn: `/livedInWa`,
    stateReturn: `/stateReturnIsWa`,
    knockout: `/flowKnockoutWashingtonStateWithholding`,
  },
  {
    code: `tn`,
    livedIn: `/livedInTn`,
    stateReturn: `/stateReturnIsTn`,
    knockout: `/flowKnockoutTennesseeStateWithholding`,
  },
  {
    code: `nh`,
    livedIn: `/livedInNh`,
    stateReturn: `/stateReturnIsNh`,
    knockout: `/flowKnockoutNewHampshireStateWithholding`,
  },
] as const;

/** Spec cites for slice 2, verbatim. XML stores "&" as "&amp;"; the assertion unescapes that. */
const SLICE2_CITES = [
  `RCW 82.87.040 imposes the tax on WA long-term capital gains`,
  `RCW 82.87.060(1): "A standard deduction of $250,000 per individual, or in the case of spouses or domestic partners, their combined standard deduction is limited to $250,000…"`,
  `indexed under RCW 82.87.150 (WA DOR: "The standard deduction for 2025 is $278,000"; 2026 figure not yet published)`,
  `statutory floor; deliberately conservative since the indexed amount is higher`,
  `The WA return is not produced.`,
  `None of the three imposes a wage income tax, so withholding there is out of scope.`,
  `Hall income tax (Tenn. Code Ann. §67-2-101 et seq.) "is fully repealed for tax years beginning January 1, 2021"`,
  `TN DOR Notice #17-09 (Pub. Ch. 181, §13), https://www.tn.gov/content/dam/tn/revenue/documents/notices/income/income17-09.pdf`,
  `RSA ch. 77 repealed by 2021, 91:99, II, eff. Jan. 1, 2025 (https://gc.nh.gov/rsa/html/V/77/77-mrg.htm)`,
  `NH DRA: "The I&D Tax was repealed for taxable periods beginning after December 31, 2024" (https://www.revenue.nh.gov/taxes-glance/interest-dividends-tax)`,
  `The State of New Hampshire does not have an income tax on an individual's reported W-2 wages.`,
  `There is no TY2026 I&D residue, so an I&D stop would block valid returns.`,
];

const WA_TN_NH_SCENARIOS = [
  [`hoh-13k.json`, `tn`],
  [`cdcc-mfj-dep-care-benefits-only.json`, `tn`],
  [`mfj-cdcc-combat-pay-2024-verified.json`, `tn`],
  [`single-43k-no-credits.json`, `wa`],
  [`edc-failing-validation-ats.json`, `nh`],
  [`hoh-benefit-split-combat-pay-sched-lep-other-withholding.json`, `nh`],
  [`hoh-itin-ctc.json`, `nh`],
  [`mef-ats-1040sr-eic.json`, `nh`],
  [`mfj-adjustments-spouse-didnt-file-last-year.json`, `nh`],
  [`mfs-nra-spouse-combat-pay-not-used-didnt-file-last-year.json`, `nh`],
  [`qss-additional-standard-deduction-disabled-eic-ip-pin-other-withholding.json`, `nh`],
  [`single-can-be-claimed-no-job-est-payments-pay-later-didnt-file-last-year.json`, `nh`],
] as const;

const saleId = `93f20000-e491-4e23-b02d-ade63dce5893`;
const longTermSale = (proceeds: string) => ({
  '/soldCapitalAssets': createBooleanWrapper(false),
  '/form8949Transactions': createCollectionWrapper([saleId]),
  [`/form8949Transactions/#${saleId}/description`]: createStringWrapper(`100 sh Example Index Fund`),
  [`/form8949Transactions/#${saleId}/dateAcquired`]: createDayWrapper(`2020-01-15`),
  [`/form8949Transactions/#${saleId}/dateAcquiredIsVariousOrInherited`]: createBooleanWrapper(false),
  [`/form8949Transactions/#${saleId}/dateSold`]: createDayWrapper(`2026-06-01`),
  [`/form8949Transactions/#${saleId}/proceeds`]: createDollarWrapper(proceeds),
  [`/form8949Transactions/#${saleId}/costBasis`]: createDollarWrapper(`0.00`),
  [`/form8949Transactions/#${saleId}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${saleId}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${saleId}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});

const distributions = (amounts: { id: string; filer: string; box2a: string }[]) => ({
  '/dividendReports': createCollectionWrapper(amounts.map((d) => d.id)),
  ...Object.fromEntries(
    amounts.flatMap((d) => [
      [
        `/dividendReports/#${d.id}/filer`,
        {
          item: { id: d.filer },
          $type: `gov.irs.factgraph.persisters.CollectionItemWrapper`,
        },
      ],
      [`/dividendReports/#${d.id}/writableCapitalGainDistributions`, createDollarWrapper(d.box2a)],
    ])
  ),
  '/dividendReportsIsDone': createBooleanWrapper(true),
});

const xmlText = () => {
  const dir = path.resolve(__dirname, `../../fact-dictionary/generate-src/xml-src`);
  return [`filers.xml`, `stateReturn.xml`, `formW2s.xml`, `constants2b.xml`, `flow.xml`]
    .map((name) => fs.readFileSync(path.join(dir, name), `utf8`))
    .join(`\n`)
    .replaceAll(`&amp;`, `&`)
    .replace(/\s+/g, ` `);
};

describe(`No-income-tax states other than Florida (Refs #93)`, () => {
  it(`keeps every spec cite intact in the fact descriptions`, () => {
    const text = xmlText();
    for (const cite of [...CITES, ...SLICE2_CITES]) {
      expect(text, cite).toContain(cite);
    }
    expect(text).not.toContain(`<Fact path="/flowKnockoutNewHampshireInterest`);
    expect(text).not.toContain(`<Fact path="/flowKnockoutNhInterest`);
  });

  for (const st of STATES) {
    it(`${st.code} full-year single W-2: ${st.stateReturn} true and no state return`, ({ task }) => {
      task.meta.testedFactPaths = [
        st.livedIn,
        st.stateReturn,
        `/stateReturnComputed`,
        `/flowKnockoutUnsupportedState`,
        `/hasIncomeInScope`,
        st.knockout,
      ];
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(st.code), ...w2() });
      expect(get(factGraph, st.livedIn).get).toBe(true);
      expect(get(factGraph, st.stateReturn).get).toBe(true);
      expect(get(factGraph, `/stateReturnIsPa`).get).toBe(false);
      expect(get(factGraph, `/stateReturnIsFl`).get).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get).toBe(false);
      expect(get(factGraph, `/stateTaxLiability`).complete).toBe(false);
      expect(get(factGraph, `/stateRefund`).complete).toBe(false);
      expect(get(factGraph, `/stateAmountOwed`).complete).toBe(false);
      expect(get(factGraph, `/flowKnockoutStateReturn`).get).toBe(false);
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get).toBe(false);
      expect(get(factGraph, `/hasIncomeInScope`).get).toBe(true);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get).toBe(false);
      expect(get(factGraph, `/scopedStateDoesNotHavePersonalIncomeTax`).get).toBe(true);
      expect(get(factGraph, `/hasNoStateIncomeTax`).get).toBe(true);
      expect(get(factGraph, st.knockout).get).toBe(false);
      expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    });

    it(`${st.code} resident with W-2 box 17 > 0 is stopped`, ({ task }) => {
      task.meta.testedFactPaths = [st.knockout, `/flowIsKnockedOut`];
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(st.code), ...w2(`100.00`) });
      expect(get(factGraph, st.knockout).get).toBe(true);
      expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(true);
      expect(submissionBlockingFacts).toContain(st.knockout);
      for (const other of STATES) {
        if (other.knockout !== st.knockout) expect(get(factGraph, other.knockout).get).toBe(false);
      }
    });

    it(`${st.code}: moreThanOne still stops and does not compute a state return`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutUnsupportedState`, st.stateReturn, `/stateReturnComputed`];
      const { factGraph } = setupFactGraph({
        ...baseFilerData,
        ...residentOf(`moreThanOne`),
        '/paPartYearMove': createEnumWrapper(`other`, `/paPartYearMoveOptions`),
      });
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get).toBe(true);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get).toBe(true);
      expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(true);
      expect(get(factGraph, st.livedIn).get).toBe(false);
      expect(get(factGraph, st.stateReturn).get).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get).toBe(false);
      expect(get(factGraph, st.knockout).get).toBe(false);
    });
  }

  it(`WA, TN, and NH full-year residents stay in scope and take only their own no-return fact`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutUnsupportedState`,
      `/filerResidenceOrIncomeStateOutOfScope`,
      `/hasIncomeInScope`,
      `/stateReturnIsWa`,
      `/stateReturnIsTn`,
      `/stateReturnIsNh`,
      `/flowKnockoutWashingtonCapitalGainsTax`,
    ];
    for (const st of SLICE2) {
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(st.code), ...w2() });
      expect(get(factGraph, st.livedIn).get, st.code).toBe(true);
      expect(get(factGraph, st.stateReturn).get, st.code).toBe(true);
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get, st.code).toBe(false);
      expect(get(factGraph, `/filerResidenceOrIncomeOrW2StateOutOfScope`).get, st.code).toBe(false);
      expect(get(factGraph, `/hasIncomeInScope`).get, st.code).toBe(true);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get, st.code).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get, st.code).toBe(false);
      expect(get(factGraph, `/stateReturnIsPa`).get, st.code).toBe(false);
      expect(get(factGraph, `/stateReturnIsFl`).get, st.code).toBe(false);
      expect(get(factGraph, `/flowKnockoutStateReturn`).get, st.code).toBe(false);
      expect(get(factGraph, `/hasNoStateIncomeTax`).get, st.code).toBe(true);
      expect(get(factGraph, st.knockout).get, st.code).toBe(false);
      expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).complete, st.code).toBe(true);
      expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).get, st.code).toBe(false);
      for (const other of SLICE2) {
        if (other.code !== st.code) {
          expect(get(factGraph, other.livedIn).get, `${st.code} ${other.livedIn}`).toBe(false);
          expect(get(factGraph, other.stateReturn).get, `${st.code} ${other.stateReturn}`).toBe(false);
        }
      }
      for (const row of STATES) {
        expect(get(factGraph, row.stateReturn).get, `${st.code} ${row.stateReturn}`).toBe(false);
        expect(get(factGraph, row.knockout).get, `${st.code} ${row.knockout}`).toBe(false);
      }
    }
  });

  for (const st of SLICE2) {
    it(`${st.code} resident with W-2 box 17 > 0 is stopped`, ({ task }) => {
      task.meta.testedFactPaths = [st.knockout, `/flowIsKnockedOut`];
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(st.code), ...w2(`100.00`) });
      expect(get(factGraph, st.knockout).get).toBe(true);
      expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(true);
      expect(submissionBlockingFacts).toContain(st.knockout);
      expect(submissionBlockingFactsRequiringValue).not.toContain(st.knockout);
      for (const other of [...SLICE2, ...STATES]) {
        if (other.knockout !== st.knockout) expect(get(factGraph, other.knockout).get).toBe(false);
      }
      expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    });

    it(`${st.code}: moreThanOne still stops and does not compute a state return`, ({ task }) => {
      task.meta.testedFactPaths = [`/flowKnockoutUnsupportedState`, st.stateReturn, `/stateReturnComputed`];
      const { factGraph } = setupFactGraph({
        ...baseFilerData,
        ...residentOf(`moreThanOne`),
        '/paPartYearMove': createEnumWrapper(`other`, `/paPartYearMoveOptions`),
      });
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get).toBe(true);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get).toBe(true);
      expect(get(factGraph, st.livedIn).get).toBe(false);
      expect(get(factGraph, st.stateReturn).get).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get).toBe(false);
      expect(get(factGraph, st.knockout).get).toBe(false);
    });
  }

  it(`a New Jersey W-2 box 17 does not fire the new stops`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`nj`), ...w2(`100.00`) });
    for (const st of STATES) {
      expect(get(factGraph, st.knockout).get).toBe(false);
      expect(get(factGraph, st.stateReturn).get).toBe(false);
    }
    expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    expect(get(factGraph, `/flowKnockoutUnsupportedState`).get).toBe(false);
    for (const st of SLICE2) {
      expect(get(factGraph, st.knockout).get).toBe(false);
      expect(get(factGraph, st.stateReturn).get).toBe(false);
    }
    expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);
  });

  it(`Pennsylvania and Florida full-year residents are unchanged`, () => {
    const pa = setupFactGraph({ ...baseFilerData, ...residentOf(`pa`), ...w2(`100.00`) }).factGraph;
    expect(get(pa, `/stateReturnIsPa`).get).toBe(true);
    expect(get(pa, `/stateReturnComputed`).get).toBe(true);
    expect(get(pa, `/flowKnockoutUnsupportedState`).get).toBe(false);
    for (const st of STATES) expect(get(pa, st.knockout).get).toBe(false);

    const fl = setupFactGraph({ ...baseFilerData, ...residentOf(`fl`), ...w2() }).factGraph;
    expect(get(fl, `/livedInFl`).get).toBe(true);
    expect(get(fl, `/stateReturnIsFl`).get).toBe(true);
    expect(get(fl, `/stateReturnComputed`).get).toBe(false);
    expect(get(fl, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    expect(get(fl, `/flowKnockoutUnsupportedState`).get).toBe(false);
    for (const graph of [pa, fl]) {
      for (const st of SLICE2) {
        expect(get(graph, st.stateReturn).get).toBe(false);
        expect(get(graph, st.knockout).get).toBe(false);
      }
      expect(get(graph, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);
    }
  });

  it(`blocks submission on the Washington capital gains stop and not as a top-level fact`, () => {
    expect(submissionBlockingFacts).toContain(`/flowKnockoutWashingtonCapitalGainsTax`);
    expect(submissionBlockingFactsRequiringValue).not.toContain(`/flowKnockoutWashingtonCapitalGainsTax`);
  });

  it(`WA Schedule D net long-term gain of $250,000 does not stop and $250,001 does`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutWashingtonCapitalGainsTax`,
      `/scheduleDLine15`,
      `/requiresScheduleD`,
      `/flowIsKnockedOut`,
    ];
    const atFloor = setupFactGraph({
      ...baseFilerData,
      ...residentOf(`wa`),
      ...longTermSale(`250000.00`),
    }).factGraph;
    expect(get(atFloor, `/requiresScheduleD`).get).toBe(true);
    expect(get(atFloor, `/scheduleDLine15`).get.toString()).toBe(`250000.00`);
    expect(get(atFloor, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);
    expect(get(atFloor, `/flowIsKnockedOut`).get).toBe(false);

    const over = setupFactGraph({
      ...baseFilerData,
      ...residentOf(`wa`),
      ...longTermSale(`250001.00`),
    }).factGraph;
    expect(get(over, `/requiresScheduleD`).get).toBe(true);
    expect(get(over, `/scheduleDLine15`).get.toString()).toBe(`250001.00`);
    expect(get(over, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(true);
    expect(get(over, `/flowIsKnockedOut`).get).toBe(true);
    expect(get(over, `/stateReturnComputed`).get).toBe(false);
  });

  it(`WA capital gain distributions of $250,000 do not stop and $250,001 does, without Schedule D`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutWashingtonCapitalGainsTax`,
      `/totalCapitalGainDistributions`,
      `/requiresScheduleD`,
    ];
    const divId = `93f30000-e491-4e23-b02d-ade63dce5893`;
    const atFloor = setupFactGraph({
      ...baseFilerData,
      ...residentOf(`wa`),
      ...distributions([{ id: divId, filer: primaryFilerId, box2a: `250000.00` }]),
    }).factGraph;
    expect(get(atFloor, `/requiresScheduleD`).get).toBe(false);
    expect(get(atFloor, `/totalCapitalGainDistributions`).get.toString()).toBe(`250000.00`);
    expect(get(atFloor, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);

    const over = setupFactGraph({
      ...baseFilerData,
      ...residentOf(`wa`),
      ...distributions([{ id: divId, filer: primaryFilerId, box2a: `250001.00` }]),
    }).factGraph;
    expect(get(over, `/requiresScheduleD`).get).toBe(false);
    expect(get(over, `/totalCapitalGainDistributions`).get.toString()).toBe(`250001.00`);
    expect(get(over, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(true);
    expect(get(over, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`MFJ Washington filers use the combined long-term gain against one $250,000 deduction`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutWashingtonCapitalGainsTax`, `/totalCapitalGainDistributions`];
    const primaryDiv = `93f30000-e491-4e23-b02d-ade63dce5894`;
    const spouseDiv = `93f30000-e491-4e23-b02d-ade63dce5895`;
    const atFloor = setupFactGraph({
      ...baseFilerData,
      ...mfjFilerData,
      ...residentOf(`wa`),
      ...distributions([
        { id: primaryDiv, filer: primaryFilerId, box2a: `150000.00` },
        { id: spouseDiv, filer: spouseId, box2a: `100000.00` },
      ]),
    }).factGraph;
    expect(get(atFloor, `/totalCapitalGainDistributions`).get.toString()).toBe(`250000.00`);
    expect(get(atFloor, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);

    const over = setupFactGraph({
      ...baseFilerData,
      ...mfjFilerData,
      ...residentOf(`wa`),
      ...distributions([
        { id: primaryDiv, filer: primaryFilerId, box2a: `150000.00` },
        { id: spouseDiv, filer: spouseId, box2a: `100001.00` },
      ]),
    }).factGraph;
    expect(get(over, `/totalCapitalGainDistributions`).get.toString()).toBe(`250001.00`);
    expect(get(over, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(true);
    expect(get(over, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`Tennessee and the #326 states do not take the Washington capital gains stop`, () => {
    const divId = `93f30000-e491-4e23-b02d-ade63dce5896`;
    for (const code of [`tn`, `nh`, `tx`, `fl`, `pa`] as const) {
      const { factGraph } = setupFactGraph({
        ...baseFilerData,
        ...residentOf(code),
        ...distributions([{ id: divId, filer: primaryFilerId, box2a: `250001.00` }]),
      });
      expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).get, code).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get, code).toBe(code === `pa`);
    }
    const pa = setupFactGraph({
      ...baseFilerData,
      ...residentOf(`pa`),
      ...distributions([{ id: divId, filer: primaryFilerId, box2a: `250001.00` }]),
    }).factGraph;
    expect(get(pa, `/stateReturnComputed`).get).toBe(true);
    expect(get(pa, `/flowKnockoutWashingtonCapitalGainsTax`).get).toBe(false);
  });

  it(`hoh-13k and the other 11 WA, TN, and NH scenarios stay in scope`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/filerResidenceOrIncomeStateOutOfScope`,
      `/flowKnockoutUnsupportedState`,
      `/hasIncomeInScope`,
      `/flowKnockoutWashingtonCapitalGainsTax`,
    ];
    const dir = path.resolve(__dirname, `backend-scenarios`);
    expect(WA_TN_NH_SCENARIOS).toHaveLength(12);
    for (const [file, code] of WA_TN_NH_SCENARIOS) {
      const scenario = JSON.parse(fs.readFileSync(path.join(dir, file), `utf8`)) as { facts: object };
      const { factGraph } = setupFactGraph(scenario.facts);
      const row = SLICE2.find((st) => st.code === code);
      expect(row, file).toBeDefined();
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get, file).toBe(false);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get, file).toBe(false);
      expect(get(factGraph, `/hasIncomeInScope`).get, file).toBe(true);
      expect(get(factGraph, `/stateReturnComputed`).get, file).toBe(false);
      expect(get(factGraph, row!.livedIn).get, file).toBe(true);
      expect(get(factGraph, row!.stateReturn).get, file).toBe(true);
      expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).complete, file).toBe(true);
      expect(get(factGraph, `/flowKnockoutWashingtonCapitalGainsTax`).get, file).toBe(false);
      for (const st of SLICE2) expect(get(factGraph, st.knockout).get, `${file} ${st.knockout}`).toBe(false);
    }
  });
});
