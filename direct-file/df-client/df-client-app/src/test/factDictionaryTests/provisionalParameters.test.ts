import { describe, it, expect } from 'vitest';
import {
  loadTaxYearConfig,
  loadTaxYearRegistry,
  SourceAuthority,
  TaxYearConfig,
} from '../../fact-dictionary/yearConfig/yearConfig.js';
import {
  provisionalChecklistLines,
  provisionalChecklistText,
  provisionalFindings,
} from '../../fact-dictionary/yearConfig/provisional.js';

/**
 * TY2026 parameters cited only through a draft or a prior-year form stay flagged until a final
 * form is pinned. Statute and Rev. Proc. cites alone count as final. Mirrors
 * Ty2026ProvisionalParametersTest.
 */
const config = loadTaxYearConfig(loadTaxYearRegistry().currentTaxYear);
const clone = (c: TaxYearConfig): TaxYearConfig => JSON.parse(JSON.stringify(c));
const fact = (c: TaxYearConfig, path: string) => {
  const parameter = c.parameters.find((p) => p.fact === path);
  if (!parameter) {
    throw new Error(`missing ${path}`);
  }
  return parameter;
};

const MISSING = `/form6251RateOffset: every form or instruction cite is draft or priorYear, but provisional is missing`;
const STALE = `/statusBasedDisabilityIncome: provisional is stale; a form or instruction cite is final`;
const NO_KIND = `f6251-dft: source has no kind`;

describe(`provisional TY2026 parameters`, () => {
  it(`prints the re-pin checklist and accepts the shipped flags`, () => {
    const text = provisionalChecklistText(config);
    // The checklist is the re-pin sweep's list; it has to show up in the test output.
    // eslint-disable-next-line no-console
    console.log(text);
    expect(provisionalFindings(config)).toEqual([]);
    const lines = provisionalChecklistLines(config);
    const flagged = [
      ...config.parameters.filter((p) => p.provisional),
      ...config.pendingReview.filter((p) => p.provisional),
    ];
    expect(lines).toHaveLength(flagged.length);
    for (const path of [
      `/ksTaxTableLimit`,
      `/idFoodTaxCreditPerFiler`,
      `/maTaxTableThreshold`,
      `/ilExemptionAgiLimit`,
      `/azTaxRate`,
      `/ncStandardDeductionHoh`,
      `/form6251RateOffset`,
      // i1040gi-2025 is on this parameter. /MFSFilingThresholdAmount is pendingReview, below.
      `/socialSecurityBenefitsWkshtLine10`,
      // The spec's examples did not name i8960-2025. The guard requires the flag.
      `/netInvestmentIncomeThresholdForMfs`,
      // Draft Schedule SE plus the final SSA notice. The notice is not a form cite.
      `/seOptionalMethodMaximumIncome`,
    ]) {
      expect(lines.some((line) => line.startsWith(`- ${path} (`)), path).toBe(true);
    }
    expect(lines.some((line) => line.startsWith(`- /MFSFilingThresholdAmount pendingReview`))).toBe(true);
    expect(lines.some((line) => line.includes(`/statusBasedDisabilityIncome`))).toBe(false);
    expect(fact(config, `/maxCtcAmount`).provisional).toBeUndefined();
  });

  it(`fails when every form cite is interim and provisional is missing`, () => {
    const edited = clone(config);
    delete fact(edited, `/form6251RateOffset`).provisional;
    expect(provisionalFindings(edited)).toEqual([MISSING]);
  });

  it(`fails when provisional remains on a final form cite`, () => {
    const edited = clone(config);
    fact(edited, `/statusBasedDisabilityIncome`).provisional = {
      reason: `stale`,
      repinFrom: `nowhere`,
      tracking: `#91`,
    };
    expect(provisionalFindings(edited)).toEqual([STALE]);
  });

  it(`fails when a source has no kind`, () => {
    const edited = clone(config);
    delete (edited.sources[`f6251-dft`] as { kind?: SourceAuthority }).kind;
    expect(provisionalFindings(edited)).toEqual([NO_KIND]);

    const legacy = clone(config);
    legacy.sources[`rp-2025-32`].kind = `pdf` as SourceAuthority;
    expect(provisionalFindings(legacy)).toEqual([`rp-2025-32: source has no kind`]);
  });

  it(`fails when provisional is missing reason, repinFrom, or tracking`, () => {
    const edited = clone(config);
    fact(edited, `/form6251RateOffset`).provisional = { reason: ``, repinFrom: ``, tracking: `` };
    expect(provisionalFindings(edited)).toEqual([
      `/form6251RateOffset: provisional needs reason, repinFrom, and tracking`,
    ]);
  });
});
