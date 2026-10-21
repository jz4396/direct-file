/**
 * #116: 10% additional tax on early distributions, Form 1099-R code 1 without Form 5329. Synthetic data.
 * 26 U.S.C. 72(t)(1) https://www.law.cornell.edu/uscode/text/26/72#t_1: the tax "shall be increased by an amount equal
 * to 10 percent of the portion of such amount which is includible in gross income."
 * 2026 draft Instructions for Form 5329 https://www.irs.gov/pub/irs-dft/i5329--dft.pdf, PDF p. 2: "if distribution
 * code 1 is correctly shown in box 7a of all your Forms 1099-R and you owe the additional tax on the full amount shown
 * on each Form 1099-R, you don't have to file Form 5329. Instead, see the instructions for Schedule 2 (Form 1040),
 * line 5". 2026 draft Schedule 2 https://www.irs.gov/pub/irs-dft/f1040s2--dft.pdf, line 5: "Additional tax on IRAs or
 * other tax-favored accounts. Attach Form 5329 if required. If not required, check here".
 * Rounding: Instructions for Form 1040 (2025) https://www.irs.gov/pub/irs-pdf/i1040gi.pdf, PDF p. 23: "drop amounts
 * under 50 cents and increase amounts from 50 to 99 cents to the next dollar."
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
import { primaryFilerId } from '../testData.js';
import { profile5AmtAnd8959, profile7PaFullYear } from '../scenarioTests/goldenProfiles.js';

const r1 = `11600000-0000-4000-8000-000000000001`;
const r2 = `11600000-0000-4000-8000-000000000002`;

const form = (id: string, code: string, gross: string, taxable: string, exception = false) => ({
  [`/form1099Rs/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/form1099Rs/#${id}/writableGrossDistribution`]: createDollarWrapper(gross),
  [`/form1099Rs/#${id}/writableTaxableAmount`]: createDollarWrapper(taxable),
  [`/form1099Rs/#${id}/writableTaxableAmountNotDetermined`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/writableTotalDistribution`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/iraSepSimple`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/writableDistributionCode`]: createStringWrapper(code),
  [`/form1099Rs/#${id}/writableQualifiedEarlyDistribution`]: createBooleanWrapper(exception),
  [`/form1099Rs/#${id}/writableIsIndirectRollover`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/writableQualifiedDisasterDistribution`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/writableIsDistributionFromMilitaryRetirementPlan`]: createBooleanWrapper(false),
  [`/form1099Rs/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});
// Base: the golden end-to-end scenario (synthetic data) profile 5, a complete single FL return with no knockout.
const graph = (
  ids: string[],
  facts: Record<string, unknown> = {},
  base: Record<string, unknown> = profile5AmtAnd8959
) =>
  setupFactGraph({
    ...base,
    '/form1099Rs': createCollectionWrapper(ids),
    '/hasCompleted1099RSection': createBooleanWrapper(true),
    ...facts,
  } as never).factGraph;
type Fg = ReturnType<typeof graph>;
const complete = (fg: Fg, p: string) => {
  const r = fg.get(p as ConcretePath);
  expect(r.complete, `${p} complete`).toBe(true);
  return r.get.toString();
};
// Same check as the golden scenario test: the return is not knocked out (the base profile leaves some unrelated
// screening answers unset, so /flowIsKnockedOut is not asserted complete).
const notKnockedOut = (fg: Fg) => {
  const r = fg.get(`/flowIsKnockedOut` as ConcretePath);
  expect(r.complete && r.get === true, `/flowIsKnockedOut`).toBe(false);
};

describe(`Form 1099-R code 1: 10% additional tax on Schedule 2 line 5 (#116)`, () => {
  it(`ordinary return with no Form 1099-R: line 5 is $0 and the new knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/earlyDistributionAdditionalTax`,
      `/schedule2Line5`,
      `/schedule2Line5Form5329NotRequired`,
      `/flowKnockoutEarlyDistributionNotOnEveryForm1099R`,
    ];
    const fg = graph([]);
    expect(complete(fg, `/earlyDistributionAdditionalTax`)).toBe(`0.00`);
    expect(complete(fg, `/schedule2Line5`)).toBe(`0.00`);
    expect(complete(fg, `/schedule2Line5Form5329NotRequired`)).toBe(`false`);
    expect(complete(fg, `/flowKnockoutEarlyDistributionNotOnEveryForm1099R`)).toBe(`false`);
    notKnockedOut(fg);
  });

  it(`ordinary code 7 Form 1099-R: no additional tax and the new knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/earlyDistributionAdditionalTax`,
      `/flowKnockoutEarlyDistributionNotOnEveryForm1099R`,
    ];
    const fg = graph([r1], form(r1, `7`, `10000`, `10000`));
    expect(complete(fg, `/earlyDistributionAdditionalTax`)).toBe(`0.00`);
    expect(complete(fg, `/flowKnockoutEarlyDistributionNotOnEveryForm1099R`)).toBe(`false`);
    notKnockedOut(fg);
  });

  it(`box 2a $10,000 -> line 5 $1,000, box checked, through line 15 and line 21 to Form 1040 line 23`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/form1099Rs/*/hasUnsupportedDistributionCode`,
      `/earlyDistributionAdditionalTax`,
      `/schedule2Line5`,
      `/schedule2Line5Form5329NotRequired`,
      `/schedule2Line15`,
      `/line21OfSchedule2`,
      `/requiresSchedule2`,
    ];
    const fg = graph([r1], form(r1, `1`, `10000`, `10000`));
    expect(complete(fg, `/knockoutForForm1099RDistributionCode`)).toBe(`false`);
    notKnockedOut(fg);
    // Form 1040 line 5b carries the code 1 taxable amount.
    expect(complete(fg, `/taxablePensionsAndAnnuities`)).toBe(`10000.00`);
    expect(complete(fg, `/earlyDistributionAdditionalTax`)).toBe(`1000.00`);
    expect(complete(fg, `/schedule2Line5`)).toBe(`1000.00`);
    expect(complete(fg, `/schedule2Line5Form5329NotRequired`)).toBe(`true`);
    expect(complete(fg, `/requiresSchedule2`)).toBe(`true`);
    expect(Number(complete(fg, `/schedule2Line15`))).toBe(
      Number(complete(fg, `/schedule2Line4`)) +
        1000 +
        Number(complete(fg, `/schedule2Line6NetInvestmentIncomeTax`)) +
        Number(complete(fg, `/line11AdditionalMedicareTax`))
    );
    expect(Number(complete(fg, `/line21OfSchedule2`))).toBe(
      Number(complete(fg, `/schedule2Line15`)) + Number(complete(fg, `/schedule2Line20`))
    );
  });

  it(`two Forms 1099-R, $4,000 + $2,500 taxable -> $650`, ({ task }) => {
    task.meta.testedFactPaths = [`/earlyDistributionAdditionalTax`];
    const fg = graph([r1, r2], { ...form(r1, `1`, `4000`, `4000`), ...form(r2, `1`, `2500`, `2500`) });
    expect(complete(fg, `/earlyDistributionAdditionalTax`)).toBe(`650.00`);
    notKnockedOut(fg);
  });

  it(`box 2a $3,333 -> $333.30 -> $333; the taxable amount, not box 1, is used`, ({ task }) => {
    task.meta.testedFactPaths = [`/earlyDistributionAdditionalTax`];
    expect(complete(graph([r1], form(r1, `1`, `3333`, `3333`)), `/earlyDistributionAdditionalTax`)).toBe(`333.00`);
    expect(complete(graph([r1], form(r1, `1`, `5000`, `3335`)), `/earlyDistributionAdditionalTax`)).toBe(`334.00`);
  });

  it(`a claimed exception stops the return (Form 5329 Part I) and adds no line 5 amount`, ({ task }) => {
    task.meta.testedFactPaths = [
      `/flowKnockoutRetirementQualifiedEarlyDistribution`,
      `/earlyDistributionAdditionalTax`,
    ];
    const fg = graph([r1], form(r1, `1`, `10000`, `10000`, true));
    expect(complete(fg, `/flowKnockoutRetirementQualifiedEarlyDistribution`)).toBe(`true`);
    expect(complete(fg, `/flowIsKnockedOut`)).toBe(`true`);
    expect(complete(fg, `/earlyDistributionAdditionalTax`)).toBe(`0.00`);
  });

  it(`code 1 on one Form 1099-R and code 7 on another stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutEarlyDistributionNotOnEveryForm1099R`];
    const fg = graph([r1, r2], { ...form(r1, `1`, `4000`, `4000`), ...form(r2, `7`, `2500`, `2500`) });
    expect(complete(fg, `/flowKnockoutEarlyDistributionNotOnEveryForm1099R`)).toBe(`true`);
    expect(complete(fg, `/flowIsKnockedOut`)).toBe(`true`);
  });

  for (const code of [`1B`, `1J`, `1S`, `1P`, `J`, `S`, `T`, `Q`]) {
    it(`code ${code} stops the return`, ({ task }) => {
      task.meta.testedFactPaths = [`/knockoutForForm1099RDistributionCode`];
      const fg = graph([r1], form(r1, code, `10000`, `10000`));
      expect(complete(fg, `/knockoutForForm1099RDistributionCode`)).toBe(`true`);
      expect(complete(fg, `/flowIsKnockedOut`)).toBe(`true`);
    });
  }

  it(`box 2b taxable amount not determined stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutRetirementTaxableAmountNotDetermined`];
    const fg = graph([r1], {
      ...form(r1, `1`, `10000`, `10000`),
      [`/form1099Rs/#${r1}/writableTaxableAmountNotDetermined`]: createBooleanWrapper(true),
    });
    expect(complete(fg, `/flowKnockoutRetirementTaxableAmountNotDetermined`)).toBe(`true`);
    expect(complete(fg, `/flowIsKnockedOut`)).toBe(`true`);
  });

  it(`a code 1 distribution counts as a testing-period distribution for the saver's credit (26 U.S.C. 25B(d)(2)(A))`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [`/form1099Rs/*/hasDistributionCodeIncludedInSaversCredit`];
    const fg = graph([r1], form(r1, `1`, `10000`, `10000`));
    expect(complete(fg, `/form1099Rs/#${r1}/hasDistributionCodeIncludedInSaversCredit`)).toBe(`true`);
  });

  it(`PA-40 return with a code 1 Form 1099-R still stops (any Form 1099-R stops a PA-40)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutPaUnsupportedIncome`];
    const fg = graph([r1], form(r1, `1`, `10000`, `10000`), profile7PaFullYear);
    expect(complete(fg, `/stateReturnPaFiled`)).toBe(`true`);
    expect(complete(fg, `/flowKnockoutPaUnsupportedIncome`)).toBe(`true`);
    expect(complete(fg, `/flowIsKnockedOut`)).toBe(`true`);
  });
});
