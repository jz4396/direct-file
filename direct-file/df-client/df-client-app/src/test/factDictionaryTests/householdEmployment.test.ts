import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { createBooleanWrapper, createDollarWrapper } from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';
import { filerWithRefundDueData, uuid as w2Id } from '../testData.js';
import { enLocale, esLocale } from '../../locales/featureLocales.js';

/**
 * #159: household employment taxes (Schedule H, Schedule 2 line 17a) are not computed, so a household employee
 * stops the return even when there is no dependent care claim.
 * 2026 Instructions for Schedule H (Form 1040), early-release draft, https://www.irs.gov/pub/irs-dft/i1040sh--dft.pdf
 * (SHA-256 685fa1486b3a6e5712c5552da3ef0eb5f7b245dec3d3f28e642e37efe15dbf1e), page 2 (PDF p. 3), "Who Needs To File
 * Schedule H?": "You must file Schedule H if you answer "Yes" to any of the questions on lines A, B, and C of
 * Schedule H."
 * 2026 Schedule H (Form 1040), early-release draft, https://www.irs.gov/pub/irs-dft/f1040sh--dft.pdf
 * (SHA-256 0fbdf600ded379d23f381286a3f9b35d15af062c83072b50de149d5c5afb3077), page 1 (PDF p. 2): line A "Did you pay
 * any one household employee cash wages of $3,000 or more in 2026?"; line C "Did you pay total cash wages of $1,000 or
 * more in any calendar quarter of 2025 or 2026 to all household employees?"
 * Full quotes and statute links: householdEmployment.xml /hasHouseholdEmployeeScheduleH.
 */
const get = (data: Record<string, unknown>, p: string) => setupFactGraph(data).factGraph.get(p as ConcretePath).get;

describe(`Schedule H household employment taxes knockout (#159)`, () => {
  it(`is a submission-blocking fact`, () => {
    expect(submissionBlockingFacts).toContain(`/flowKnockoutScheduleH`);
  });

  it(`household employee and no dependent care claim: knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleH`, `/flowIsKnockedOut`];
    const data = { ...filerWithRefundDueData, '/hasHouseholdEmployeeScheduleH': createBooleanWrapper(true) };
    expect(get(filerWithRefundDueData, `/flowIsKnockedOut`)).toBe(false);
    // No dependent care claim, so the dependent care household-employee knockout is not on.
    expect(get(data, `/flowKnockoutHouseholdEmployee`)).toBe(false);
    expect(get(data, `/cdccQualified`)).toBe(false);
    expect(get(data, `/flowKnockoutScheduleH`)).toBe(true);
    expect(get(data, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`answer no: not knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleH`, `/flowIsKnockedOut`];
    const data = { ...filerWithRefundDueData, '/hasHouseholdEmployeeScheduleH': createBooleanWrapper(false) };
    expect(get(data, `/flowKnockoutScheduleH`)).toBe(false);
    expect(get(data, `/flowIsKnockedOut`)).toBe(false);
  });

  it(`question never answered: unaffected (placeholder false)`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutScheduleH`];
    expect(get(filerWithRefundDueData, `/flowKnockoutScheduleH`)).toBe(false);
  });

  it(`the dependent care question still stops the return on its own`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutHouseholdEmployee`, `/flowIsKnockedOut`];
    const data = { ...filerWithRefundDueData, '/flowKnockoutHouseholdEmployee': createBooleanWrapper(true) };
    expect(get(data, `/flowKnockoutScheduleH`)).toBe(false);
    expect(get(data, `/flowIsKnockedOut`)).toBe(true);
  });

  // Schedule 2 (2026 draft) line 13h, "Income you received from a nonqualified deferred compensation plan that fails
  // to meet the requirements of section 409A", is W-2 box 12 code Z: General Instructions for Forms W-2 and W-3
  // (2026), https://www.irs.gov/pub/irs-pdf/iw2w3.pdf p. 22, "Code Z—Income under a nonqualified deferred
  // compensation plan that fails to satisfy section 409A." That code already stops the return.
  it(`W-2 box 12 code Z (Schedule 2 line 13h) stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/knockoutForBox12Value`, `/flowIsKnockedOut`];
    const data = { ...filerWithRefundDueData, [`/formW2s/#${w2Id}/nqdcDeferrals`]: createDollarWrapper(`500.00`) };
    expect(get(data, `/knockoutForBox12Value`)).toBe(true);
    expect(get(data, `/flowIsKnockedOut`)).toBe(true);
  });

  it(`en and es strings exist for the screener and the knockout`, () => {
    for (const loc of [enLocale, esLocale]) {
      expect(loc.headings[`/heading/income/income-sources/household-employees`]).toBeTruthy();
      expect(loc.headings[`/heading/knockout/household-employees`]).toBeTruthy();
      expect(loc.info[`/info/income/income-sources/household-employees`].body).toBeTruthy();
      expect(loc.info[`/info/knockout/household-employees`].alertText.body).toBeTruthy();
      expect(loc.fields[`/hasHouseholdEmployeeScheduleH`].boolean[`yes`]).toBeTruthy();
      expect(loc.fields[`/hasHouseholdEmployeeScheduleH`].boolean[`no`]).toBeTruthy();
    }
    expect(enLocale.info[`/info/income/income-sources/household-employees`].body).toContain(`$3,000`);
    expect(esLocale.info[`/info/income/income-sources/household-employees`].body).toContain(`$3,000`);
  });
});
