// #91 ty2026.json pendingReview sweep.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConcretePath } from '@irs/js-factgraph-scala';
import { setupFactGraph } from '../setupFactGraph.js';

const config = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../../../../../backend/src/main/resources/taxYears/ty2026.json`), `utf-8`)
);
const fg = setupFactGraph({}).factGraph;
const val = (p: string) => fg.get(p as ConcretePath).get;

describe(`Saver's Credit testing period cutoff (#91)`, () => {
  // 26 U.S.C. 25B(d)(2)(B)(iii), https://www.law.cornell.edu/uscode/text/26/25B: the testing period includes "the
  // period after such taxable year and before the due date (including extensions) for filing the return". The TY2026
  // due date is April 15, 2027 (/defaultTaxDay; 26 U.S.C. 6072(a)), extended 6 months (26 U.S.C. 6081(a)) to
  // Friday, October 15, 2027. The interview asks about distributions "before October N".
  const n = () => Number(val(`/saversCreditOctDateForSameYearContribution`));
  const inTestingPeriod = (isoDay: string) => {
    const [y, m, d] = isoDay.split(`-`).map(Number);
    return y === 2027 && m === 10 ? d < n() : y === 2027 && m < 10;
  };

  it(`N is the day of the extended due date, October 15, 2027`, ({ task }) => {
    task.meta.testedFactPaths = [`/saversCreditOctDateForSameYearContribution`, `/defaultTaxDay`];
    expect(val(`/defaultTaxDay`).toString()).toBe(`2027-04-15`);
    const extended = new Date(Date.UTC(2027, 3 + 6, 15));
    expect(extended.toISOString().slice(0, 10)).toBe(`2027-10-15`);
    expect(extended.getUTCDay()).toBe(5); // Friday: no weekend or holiday shift under 26 U.S.C. 7503
    expect(n()).toBe(extended.getUTCDate());
  });

  it(`October 14, 2027 is in the testing period; October 15, 2027 is not`, ({ task }) => {
    task.meta.testedFactPaths = [`/saversCreditOctDateForSameYearContribution`];
    expect(inTestingPeriod(`2027-10-14`)).toBe(true);
    expect(inTestingPeriod(`2027-10-15`)).toBe(false);
  });
});

describe(`ty2026.json pendingReview after the sweep (#91)`, () => {
  type Entry = { fact: string; status: string; note: string; taggedYear: number };
  const pending: Entry[] = config.pendingReview;

  it(`keeps only structural entries, the MFS threshold awaiting the 2026 i1040, and the repealed PTC caps`, () => {
    for (const e of pending) {
      const allowed =
        e.status === `structural` ||
        e.fact === `/MFSFilingThresholdAmount` ||
        e.fact.startsWith(`/ptcRepaymentLimitation`);
      expect(allowed, e.fact).toBe(true);
      expect(e.note.length, e.fact).toBeGreaterThan(20);
    }
  });

  it(`the six PTC repayment caps are not retagged and cite their TY2026 repeal`, () => {
    // Rev. Proc. 2025-32 sec. 2.04, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf p. 5: "Section 71305 of the OBBBA
    // removes sec. 36B(f)(2)(B) ... effective for taxable years beginning after December 31, 2025."
    const caps = pending.filter((e) => e.fact.startsWith(`/ptcRepaymentLimitation`));
    expect(caps).toHaveLength(6);
    for (const e of caps) {
      expect(e.taggedYear).toBe(2024);
      expect(e.status).toBe(`stale`);
      expect(e.note).toContain(`/flowKnockoutPtcTy2026RulesNotImplemented`);
    }
    const params: { fact: string }[] = config.parameters;
    expect(params.some((p) => p.fact.startsWith(`/ptcRepaymentLimitation`))).toBe(false);
  });

  it(`moves the statutory, poverty line and Saver's Credit facts into parameters`, () => {
    const params = new Set((config.parameters as { fact: string }[]).map((p) => p.fact));
    for (const f of [
      `/hsaExcessContributionsPenalty`,
      `/hsaOver55AdditionalCoverageLimit`,
      `/maxOdcAmount`,
      `/dependentCreditPhaseoutThreshold`,
      `/actcRefundabilityThreshold`,
      `/maxStudentLoadDeduction`,
      `/federalPovertyLineMagicNumberStartingNumber`,
      `/federalPovertyLineMagicNumberIncrement`,
      `/saversCreditOctDateForSameYearContribution`,
    ]) {
      expect(params.has(f), f).toBe(true);
    }
  });
});
