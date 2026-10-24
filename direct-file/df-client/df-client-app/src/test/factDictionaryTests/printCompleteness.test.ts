// #89 print completeness: each form the TY2026 package would leave out or print on a 2024 template fails closed.
// - Schedule C: Instructions for Schedule C (2025), PDF p. 2, "Use Schedule C (Form 1040) to report income or (loss)
//   from a business you operated or a profession you practiced as a sole proprietor." 2026 draft Schedule 1 line 3,
//   "Business income or (loss). Attach Schedule C". No Schedule C template, so the return is knocked out.
// - Schedule 3-A: 2026 draft Form 1040 (https://www.irs.gov/pub/irs-dft/f1040--dft.pdf), lines 32a-32c, "If you
//   entered an amount on line 27a, 28, 29, or 30, attach Sch. 3-A"; 2026 draft Schedule 3-A
//   (https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf), "Complete Schedule 3-A (Form 1040) only if you are claiming
//   the earned income credit (EIC), additional child tax credit (ACTC), refundable American opportunity credit, or
//   refundable adoption credit." EIC 26 U.S.C. 32, ACTC 24(d), refundable AOTC 25A(i). No Schedule 3-A template and
//   no line 32b fact, so the return is knocked out.
// - Form 1040-SR: Instructions for Form 1040 (2025), PDF p. 12, "Everyone can file Form 1040." The package prints the
//   2026 draft Form 1040 for every filer (/pdfIncludeForm1040) instead of the 2024 Form 1040-SR template.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
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
import { goldenProfiles, profile5AmtAnd8959 } from '../scenarioTests/goldenProfiles.js';
import {
  submissionBlockingFacts,
  submissionBlockingFactsRequiringValue,
} from '../../fact-dictionary/generated/submissionBlockingFacts.js';

const SCHEDULE_C_KO = `/flowKnockoutScheduleCWithoutTy2026Template`;
const SCHEDULE_3A_KO = `/flowKnockoutSchedule3AWithoutTy2026Template`;
const businessId = `08900000-0000-4000-8000-000000000001`;
const childId = `08900000-0000-4000-8000-000000000002`;

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
type Get = ReturnType<typeof graph>[`get`];

const positive = (get: Get, p: string) => {
  const r = get(p);
  return r.complete && Number(String(r.get)) > 0;
};

describe(`#89 print completeness knockouts`, () => {
  it.each([SCHEDULE_C_KO, SCHEDULE_3A_KO])(`%s is a submission-blocking input to /flowIsKnockedOut`, (ko) => {
    expect(submissionBlockingFacts).toContain(ko);
    expect(submissionBlockingFactsRequiringValue).not.toContain(ko);
    const flowXml = fs.readFileSync(`./src/fact-dictionary/generate-src/xml-src/flow.xml`, `utf-8`);
    const knockedOut = flowXml.match(/<Fact path="\/flowIsKnockedOut">[\s\S]*?<\/Fact>/)?.[0] ?? ``;
    expect(knockedOut).toContain(`path="${ko}" />`);
  });

  it.each(Object.entries(goldenProfiles))(`golden profile %s: both knockouts are complete and false`, (_, profile) => {
    const { get } = graph(profile);
    for (const ko of [SCHEDULE_C_KO, SCHEDULE_3A_KO]) {
      expect(get(ko).complete, ko).toBe(true);
      expect(get(ko).get, ko).toBe(false);
    }
    expect(get(`/pdfIncludeForm1040`).get).toBe(true);
  });

  it(`every backend scenario: both knockouts are complete, and true exactly when the form is needed`, () => {
    const folder = `./src/test/factDictionaryTests/backend-scenarios`;
    const files = fs.readdirSync(folder).filter((f) => f.endsWith(`.json`));
    expect(files.length).toBeGreaterThan(100);
    let withScheduleC = 0;
    let withSchedule3A = 0;
    for (const file of files) {
      const { get } = graph(JSON.parse(fs.readFileSync(`${folder}/${file}`, `utf-8`)).facts);
      const c = get(SCHEDULE_C_KO);
      const a = get(SCHEDULE_3A_KO);
      expect(c.complete, file).toBe(true);
      expect(a.complete, file).toBe(true);
      const hasBusiness = get(`/hasScheduleCBusinesses`);
      expect(c.get, file).toBe(hasBusiness.complete && hasBusiness.get === true);
      const needs3A =
        positive(get, `/earnedIncomeCredit`) ||
        positive(get, `/additionalCtc`) ||
        positive(get, `/americanOpportunityCredit`);
      expect(a.get, file).toBe(needs3A);
      if (c.get) withScheduleC++;
      if (a.get) withSchedule3A++;
      expect(get(`/pdfIncludeForm1040`).get, file).toBe(true);
    }
    console.log(`#89 backend scenarios: ${files.length}, Schedule C ${withScheduleC}, Schedule 3-A ${withSchedule3A}`);
    expect(withSchedule3A).toBeGreaterThan(0);
    expect(withSchedule3A).toBeLessThan(files.length);
    expect(withScheduleC).toBeLessThan(files.length);
  });

  it(`ordinary return with no business and no refundable credit: both knockouts are complete and false`, ({ task }) => {
    task.meta.testedFactPaths = [SCHEDULE_C_KO, SCHEDULE_3A_KO];
    const { get } = graph(profile5AmtAnd8959);
    expect(get(SCHEDULE_C_KO).get).toBe(false);
    expect(get(SCHEDULE_3A_KO).get).toBe(false);
    expect(get(`/flowIsKnockedOut`).get).toBe(false);
  });

  it(`a Schedule C business knocks out the return`, ({ task }) => {
    task.meta.testedFactPaths = [SCHEDULE_C_KO, `/flowIsKnockedOut`];
    const { get } = graph({ ...single, ...scheduleC(80000) });
    expect(get(`/hasScheduleCBusinesses`).get).toBe(true);
    expect(get(SCHEDULE_C_KO).complete).toBe(true);
    expect(get(SCHEDULE_C_KO).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`self-employment answered yes with no business listed: no Schedule C, the knockout is complete and false`, ({
    task,
  }) => {
    task.meta.testedFactPaths = [SCHEDULE_C_KO];
    const { get } = graph({
      ...single,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([]),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    expect(get(SCHEDULE_C_KO).complete).toBe(true);
    expect(get(SCHEDULE_C_KO).get).toBe(false);
  });

  it(`EIC claimed (Form 1040 line 27a): Schedule 3-A is needed, so the return is knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [SCHEDULE_3A_KO, `/flowIsKnockedOut`];
    // Childless EIC on $9,000 of self-employment income (26 U.S.C. 32(b), Rev. Proc. 2025-32 sec. 4.06).
    const { get, str } = graph({ ...single, ...scheduleC(9000) });
    expect(Number(str(`/earnedIncomeCredit`))).toBeGreaterThan(0);
    expect(get(SCHEDULE_3A_KO).complete).toBe(true);
    expect(get(SCHEDULE_3A_KO).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`qualifying child past the EIC phaseout: the EIC is $0 and the knockout follows the ACTC alone`, ({ task }) => {
    task.meta.testedFactPaths = [SCHEDULE_3A_KO];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(80000) });
    expect(str(`/earnedIncomeCredit`)).toBe(`0.00`);
    expect(get(SCHEDULE_3A_KO).complete).toBe(true);
    expect(get(SCHEDULE_3A_KO).get).toBe(positive(get, `/additionalCtc`));
  });

  it(`Form 1040 prints for every filer, 65 or older too`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdfIncludeForm1040`];
    const { get } = graph({ ...single, [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`) });
    expect(get(`/xmlOver65SRIndicator`).get).toBe(true);
    expect(get(`/pdfIncludeForm1040`).complete).toBe(true);
    expect(get(`/pdfIncludeForm1040`).get).toBe(true);
  });
});
