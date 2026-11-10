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
// WA, TN, and NH are in scope, and this slice leaves them as they are on main.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { baseFilerData, primaryFilerId } from '../testData.js';
import { createCollectionWrapper, createDollarWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { Path } from '../../flow/Path.js';
import type { Path as FDPath } from '../../fact-dictionary/Path.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';

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
    for (const cite of CITES) {
      expect(text, cite).toContain(cite);
    }
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

  it(`WA, TN, and NH residents stay in scope, the same as on main`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutUnsupportedState`,
      `/filerResidenceOrIncomeStateOutOfScope`,
      `/hasIncomeInScope`,
    ];
    for (const st of [`wa`, `tn`, `nh`] as const) {
      const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(st), ...w2() });
      expect(get(factGraph, `/filerResidenceOrIncomeStateOutOfScope`).get, st).toBe(false);
      expect(get(factGraph, `/filerResidenceOrIncomeOrW2StateOutOfScope`).get, st).toBe(false);
      expect(get(factGraph, `/hasIncomeInScope`).get, st).toBe(true);
      expect(get(factGraph, `/flowKnockoutUnsupportedState`).get, st).toBe(false);
      expect(get(factGraph, `/stateReturnComputed`).get, st).toBe(false);
      for (const row of STATES) {
        expect(get(factGraph, row.stateReturn).get, `${st} ${row.stateReturn}`).toBe(false);
      }
    }
  });

  it(`a New Jersey W-2 box 17 does not fire the new stops`, () => {
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`nj`), ...w2(`100.00`) });
    for (const st of STATES) {
      expect(get(factGraph, st.knockout).get).toBe(false);
      expect(get(factGraph, st.stateReturn).get).toBe(false);
    }
    expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`).get).toBe(false);
    expect(get(factGraph, `/flowKnockoutUnsupportedState`).get).toBe(false);
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
  });
});
