// #208: a return that claims the EIC with a qualifying child needs Schedule EIC, which has no TY2026 template yet.
// - 26 U.S.C. 32(c)(3)(D)(i), https://www.law.cornell.edu/uscode/text/26/32: "A qualifying child shall not be taken
//   into account under subsection (b) unless the taxpayer includes the name, age, and TIN of the qualifying child on
//   the return of tax for the taxable year."
// - 2026 draft Schedule EIC (https://www.irs.gov/pub/irs-dft/f1040sei--dft.pdf), form page 1: "Complete and attach to
//   Form 1040 or 1040-SR only if you have a qualifying child."
// - EIC figures: Rev. Proc. 2025-32 sec. 4.06, p. 15 (one qualifying child: earned income amount $13,020, 34%,
//   maximum $4,427); Schedule C earned income as in scheduleCEarnedIncomeCredits.test.ts (#117).
import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';
import { baseFilerData, filerWithW2NoDeductionsNoCreditsBaseData, makeChildData, primaryFilerId } from '../testData.js';
import { profile5AmtAnd8959 } from '../scenarioTests/goldenProfiles.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';

const KO = `/flowKnockoutScheduleEicWithoutTy2026Template`;
const businessId = `e2080000-0000-4000-8000-000000000001`;
const childId = `e2080000-0000-4000-8000-000000000002`;

const noW2 = {
  ...Object.fromEntries(
    Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s/`))
  ),
  '/formW2s': createCollectionWrapper([]),
};

const single = {
  ...noW2,
  ...baseFilerData,
  '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1990-01-01`),
  '/eitcQcOfAnother': createBooleanWrapper(false),
  '/eitcHadImproperClaims': createBooleanWrapper(false),
};

const withChild = {
  '/familyAndHousehold': createCollectionWrapper([childId]),
  ...makeChildData(childId, `2016-01-01`),
};

const scheduleC = (gross: number) => ({
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  '/wantsQbiDeduction': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([businessId]),
  [`/scheduleCBusinesses/#${businessId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Sample Services`),
  [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`${gross}`),
  [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`0`),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});

const graph = (data: Record<string, unknown>) => {
  const { factGraph } = setupFactGraph(data as Parameters<typeof setupFactGraph>[0]);
  const get = (p: string) => factGraph.get(p as ConcretePath);
  return { get, str: (p: string) => get(p).get.toString() };
};

describe(`Schedule EIC without a TY2026 template (#208)`, () => {
  it(`is a submission-blocking input to /flowIsKnockedOut`, () => {
    expect(submissionBlockingFacts).toContain(KO);
  });

  it(`ordinary return with no dependents: the knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get } = graph(profile5AmtAnd8959);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`EIC with one qualifying child: Schedule EIC is needed, so the return is knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [KO, `/flowIsKnockedOut`];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(15000) });
    expect(str(`/earnedIncomeCredit`)).toBe(`4427.00`);
    expect(str(`/numEitcQualifyingChildren`)).toBe(`1`);
    expect(get(`/pdfIncludeScheduleEic`).get).toBe(true);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`EIC with no qualifying child: no Schedule EIC, the knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get, str } = graph({ ...single, ...scheduleC(15000) });
    expect(get(`/eitcQualified`).get).toBe(true);
    expect(str(`/numEitcQualifyingChildren`)).toBe(`0`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });

  it(`qualifying child but income past the phaseout ($0 EIC): the knockout is complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(80000) });
    expect(str(`/earnedIncomeCredit`)).toBe(`0.00`);
    expect(get(KO).complete).toBe(true);
    expect(get(KO).get).toBe(false);
  });
});
