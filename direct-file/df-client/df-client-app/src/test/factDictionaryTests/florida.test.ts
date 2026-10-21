// Issue #81: Florida residents file federal only (Fla. Const. art. VII, sec. 5(a)).
import { describe, it, expect } from 'vitest';
import { baseFilerData, primaryFilerId } from '../testData.js';
import { createCollectionWrapper, createDollarWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { Path } from '../../flow/Path.js';
import type { Path as FDPath } from '../../fact-dictionary/Path.js';
import { setupFactGraph } from '../setupFactGraph.js';

const w2Id = `81f10000-e491-4e23-b02d-ade63dce5881`;

const w2 = (state: `sameState` | `differentState`, box17?: string) => ({
  '/formW2s': createCollectionWrapper([w2Id]),
  [`/formW2s/#${w2Id}/filer`]: {
    item: { id: primaryFilerId },
    $type: `gov.irs.factgraph.persisters.CollectionItemWrapper`,
  },
  [`/formW2s/#${w2Id}/writableState`]: createEnumWrapper(state, `/incomeFormStateOptions`),
  [`/formW2s/#${w2Id}/writableStateWages`]: createDollarWrapper(`50000.00`),
  ...(box17 ? { [`/formW2s/#${w2Id}/writableStateWithholding`]: createDollarWrapper(box17) } : {}),
});

const residentOf = (st: string) => ({
  '/filerResidenceAndIncomeState': createEnumWrapper(st, `/scopedStateOptions`),
});

const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], p: FDPath) => fg.get(Path.concretePath(p, null)).get;

describe(`Florida residents (#81)`, () => {
  it(`full-year FL resident with a FL W-2 and $0 box 17 is not stopped`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/livedInFl`,
      `/flowKnockoutUnsupportedState`,
      `/flowKnockoutBox15IncomeFromDifferentState`,
      `/flowKnockoutFloridaStateWithholding`,
      `/scopedStateDoesNotHavePersonalIncomeTax`,
      `/hasNoStateIncomeTax`,
    ];
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`fl`), ...w2(`sameState`) });
    expect(get(factGraph, `/livedInFl`)).toBe(true);
    expect(get(factGraph, `/flowKnockoutUnsupportedState`)).toBe(false);
    expect(get(factGraph, `/flowKnockoutBox15IncomeFromDifferentState`)).toBe(false);
    expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`)).toBe(false);
    expect(get(factGraph, `/scopedStateDoesNotHavePersonalIncomeTax`)).toBe(true);
    expect(get(factGraph, `/hasNoStateIncomeTax`)).toBe(true);
    expect(factGraph.get(Path.concretePath(`/formW2s/*/missingStateIncome`, w2Id)).get).toBe(false);
  });

  it(`FL resident with state tax withheld in W-2 box 17 is stopped`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutFloridaStateWithholding`, `/flowIsKnockedOut`];
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`fl`), ...w2(`sameState`, `100.00`) });
    expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`)).toBe(true);
    expect(get(factGraph, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`FL resident with wages from another state (e.g. PA) is stopped`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutBox15IncomeFromDifferentState`, `/flowIsKnockedOut`];
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`fl`), ...w2(`differentState`) });
    expect(get(factGraph, `/flowKnockoutBox15IncomeFromDifferentState`)).toBe(true);
    expect(get(factGraph, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`FL withholding stop is scoped to FL only (NJ box 17 unchanged)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutFloridaStateWithholding`, `/scopedStateDoesNotHavePersonalIncomeTax`];
    const { factGraph } = setupFactGraph({ ...baseFilerData, ...residentOf(`nj`), ...w2(`sameState`, `100.00`) });
    expect(get(factGraph, `/flowKnockoutFloridaStateWithholding`)).toBe(false);
    expect(get(factGraph, `/scopedStateDoesNotHavePersonalIncomeTax`)).toBe(false);
  });
});
