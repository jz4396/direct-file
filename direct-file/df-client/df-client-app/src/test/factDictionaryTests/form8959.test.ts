// #82 Form 8959, Additional Medicare Tax (TY2026 draft layout). Sources: f8959 (2026 draft), i8959 (2026 draft),
// 26 U.S.C. 3101(b)(2) and 1401(b)(2). Thresholds $250,000 MFJ / $125,000 MFS / $200,000 other (not indexed).
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, mfjFilerData, mfsFilerData, primaryFilerId, singleFilerData, spouseId } from '../testData.js';

type W2 = { owner: string; box1: string; box2?: string; box5: string; box6?: string; rrta?: boolean };
const w2Ids = [`82a00000-0000-4000-8000-000000000001`, `82a00000-0000-4000-8000-000000000002`];

const w2Facts = (w2s: W2[]) => {
  const out: Record<string, unknown> = { '/formW2s': createCollectionWrapper(w2Ids.slice(0, w2s.length)) };
  w2s.forEach((w, i) => {
    const id = w2Ids[i];
    out[`/formW2s/#${id}/filer`] = createCollectionItemWrapper(w.owner);
    out[`/formW2s/#${id}/writableWages`] = createDollarWrapper(w.box1);
    out[`/formW2s/#${id}/writableMedicareWages`] = createDollarWrapper(w.box5);
    if (w.box2) out[`/formW2s/#${id}/writableFederalWithholding`] = createDollarWrapper(w.box2);
    if (w.box6) out[`/formW2s/#${id}/writableMedicareWithholding`] = createDollarWrapper(w.box6);
    if (w.rrta) {
      out[`/formW2s/#${id}/hasRRTACodes`] = createBooleanWrapper(true);
    }
  });
  return out;
};

const graph = (status: Record<string, unknown>, w2s: W2[]) =>
  setupFactGraph({ ...baseFilerData, ...status, ...w2Facts(w2s) }).factGraph;
const val = (fg: ReturnType<typeof graph>, p: string) => fg.get(p as ConcretePath).get;
const dollars = (fg: ReturnType<typeof graph>, p: string) => val(fg, p).toString();

describe(`Form 8959 Additional Medicare Tax (#82)`, () => {
  it(`single, $300,000 Medicare wages, employer withheld 1.45% + 0.9% over $200,000`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form8959Line1`,
      `/form8959Line6`,
      `/form8959Line7`,
      `/form8959Line12`,
      `/form8959Line21`,
      `/form8959Line22`,
      `/form8959Line24`,
      `/line17bAdditionalMedicareTax`,
      `/requiresSchedule2`,
      `/line21OfSchedule2`,
      `/otherFormWithholding`,
      `/totalWithholding`,
      `/flowKnockoutForm8959Unsupported`,
    ];
    // box 6 = 300,000 x 1.45% + 100,000 x 0.9% = 4,350 + 900 = 5,250
    const fg = graph(singleFilerData, [
      { owner: primaryFilerId, box1: `300000`, box2: `60000`, box5: `300000`, box6: `5250` },
    ]);
    expect(dollars(fg, `/form8959Line1`)).toBe(`300000.00`);
    expect(dollars(fg, `/form8959Line6`)).toBe(`100000.00`);
    expect(dollars(fg, `/form8959Line7`)).toBe(`900.00`);
    expect(dollars(fg, `/form8959Line12`)).toBe(`900.00`);
    expect(dollars(fg, `/line17bAdditionalMedicareTax`)).toBe(`900.00`);
    expect(dollars(fg, `/line11AdditionalMedicareTax`)).toBe(`0.00`);
    expect(dollars(fg, `/form8959Line18`)).toBe(`0.00`);
    expect(val(fg, `/requiresSchedule2`)).toBe(true);
    expect(dollars(fg, `/line21OfSchedule2`)).toBe(`900.00`);
    expect(dollars(fg, `/form8959Line21`)).toBe(`4350.00`);
    expect(dollars(fg, `/form8959Line22`)).toBe(`900.00`);
    expect(dollars(fg, `/form8959Line24`)).toBe(`900.00`);
    expect(dollars(fg, `/otherFormWithholding`)).toBe(`900.00`);
    expect(dollars(fg, `/totalWithholding`)).toBe(`60900.00`);
    expect(val(fg, `/flowKnockoutForm8959Unsupported`)).toBe(false);
    expect(val(fg, `/requiresForm8959`)).toBe(true);
  });

  it(`single at $200,000 or less owes nothing and no Form 8959 is required`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8959Line12`, `/form8959Line24`, `/requiresForm8959`];
    const fg = graph(singleFilerData, [{ owner: primaryFilerId, box1: `200000`, box5: `200000`, box6: `2900` }]);
    expect(dollars(fg, `/form8959Line12`)).toBe(`0.00`);
    expect(dollars(fg, `/form8959Line24`)).toBe(`0.00`);
    expect(val(fg, `/requiresForm8959`)).toBe(false);
    expect(val(fg, `/requiresSchedule2`)).toBe(false);
  });

  it(`MFJ, i8959 Example 5: $150,000 + $175,000 wages owe 0.9% of $75,000 = $675, no extra withholding`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8959Threshold`, `/form8959Line7`, `/form8959Line22`];
    const fg = graph(mfjFilerData, [
      { owner: primaryFilerId, box1: `150000`, box5: `150000`, box6: `2175` },
      { owner: spouseId, box1: `175000`, box5: `175000`, box6: `2537.50` },
    ]);
    expect(dollars(fg, `/form8959Threshold`)).toBe(`250000.00`);
    expect(dollars(fg, `/form8959Line7`)).toBe(`675.00`);
    expect(dollars(fg, `/form8959Line22`)).toBe(`0.00`);
  });

  it(`MFJ, one spouse $260,000: employer withholding over $200,000 is credited on line 24`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8959Line7`, `/form8959Line24`];
    // box 6 = 260,000 x 1.45% + 60,000 x 0.9% = 3,770 + 540 = 4,310
    const fg = graph(mfjFilerData, [{ owner: primaryFilerId, box1: `260000`, box5: `260000`, box6: `4310` }]);
    expect(dollars(fg, `/form8959Line7`)).toBe(`90.00`);
    expect(dollars(fg, `/form8959Line24`)).toBe(`540.00`);
    expect(val(fg, `/flowKnockoutForm8959Unsupported`)).toBe(false);
  });

  it(`MFS uses $125,000: $150,000 wages owe $225`, ({ task }) => {
    task.meta.testedFactPaths = [`/form8959Threshold`, `/form8959Line7`];
    const fg = graph(mfsFilerData, [{ owner: primaryFilerId, box1: `150000`, box5: `150000`, box6: `2175` }]);
    expect(dollars(fg, `/form8959Threshold`)).toBe(`125000.00`);
    expect(dollars(fg, `/form8959Line7`)).toBe(`225.00`);
  });

  it(`RRTA W-2 over $125,000 stops the return (Part II / line 23 not supported)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8959Unsupported`, `/flowIsKnockedOut`];
    const fg = graph(singleFilerData, [{ owner: primaryFilerId, box1: `150000`, box5: `0`, rrta: true }]);
    expect(val(fg, `/flowKnockoutForm8959Unsupported`)).toBe(true);
    expect(val(fg, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`RRTA W-2 under $125,000 with no Form 8959 amounts is not stopped by Form 8959`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutForm8959Unsupported`];
    const fg = graph(singleFilerData, [{ owner: primaryFilerId, box1: `90000`, box5: `0`, rrta: true }]);
    expect(val(fg, `/flowKnockoutForm8959Unsupported`)).toBe(false);
  });
});
