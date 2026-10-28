// #239: Schedule C and Schedule 3-A are in the TY2026 package.
// - Schedule C: Instructions for Schedule C (2025), PDF p. 2. 2026 draft Schedule C line 31, "If a profit, enter on
//   both Schedule 1 (Form 1040), line 3, and on Schedule SE, line 2." 26 U.S.C. 1402(a). Form 8995 still stops a
//   Schedule C return (Instructions for Form 1040 (2025) draft, PDF p. 35).
// - Schedule 3-A: 2026 draft Form 1040, lines 27a, 28, 29 and 30, "attach Sch. 3-A"; line 32b is the amount from
//   Schedule 3-A. 26 U.S.C. 32, 24(d), 25A(i), 23. Part II line 8: 8 U.S.C. 1641(b). No Schedule 3-A instructions
//   are posted yet.
// - Form 1040-SR: Instructions for Form 1040 (2025), PDF p. 12, "Everyone can file Form 1040." The package prints the
//   2026 draft Form 1040 for every filer (/pdfIncludeForm1040).
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
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  makeChildData,
  makeW2Data,
  primaryFilerId,
} from '../testData.js';
import { goldenProfiles, profile5AmtAnd8959 } from '../scenarioTests/goldenProfiles.js';
import { submissionBlockingFacts } from '../../fact-dictionary/generated/submissionBlockingFacts.js';

const REMOVED = [`/flowKnockoutScheduleCWithoutTy2026Template`, `/flowKnockoutSchedule3AWithoutTy2026Template`];
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
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadChurchEmployeeIncome': createBooleanWrapper(false),
  '/usesSeOptionalMethod': createBooleanWrapper(false),
  '/hasMinisterOrSeExemption': createBooleanWrapper(false),
  '/hasNotarySeExclusion': createBooleanWrapper(false),
  '/hadForm8919Wages': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([businessId]),
  [`/scheduleCBusinesses/#${businessId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${businessId}/businessName`]: createStringWrapper(`Synthetic Consulting`),
  [`/scheduleCBusinesses/#${businessId}/writableGrossReceipts`]: createDollarWrapper(`${gross}`),
  [`/scheduleCBusinesses/#${businessId}/writableTotalExpenses`]: createDollarWrapper(`0`),
  [`/scheduleCBusinesses/#${businessId}/materiallyParticipates`]: createBooleanWrapper(true),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
});

const line8 = (yes: boolean) => ({
  '/schedule3AWantsFederalPublicBenefit': createBooleanWrapper(true),
  '/schedule3AIsCitizenNationalOrQualifiedAlien': createBooleanWrapper(yes),
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

describe(`#239 Schedule C and Schedule 3-A print`, () => {
  it(`the #236 template knockouts are gone from the blocking list and from /flowIsKnockedOut`, () => {
    for (const ko of REMOVED) {
      expect(submissionBlockingFacts).not.toContain(ko);
    }
    const flowXml = fs.readFileSync(`./src/fact-dictionary/generate-src/xml-src/flow.xml`, `utf-8`);
    const knockedOut = flowXml.match(/<Fact path="\/flowIsKnockedOut">[\s\S]*?<\/Fact>/)?.[0] ?? ``;
    for (const ko of REMOVED) {
      expect(knockedOut).not.toContain(ko);
    }
    expect(knockedOut).toContain(`/flowKnockoutForm8995WithoutTy2026Template`);
  });

  it.each(Object.entries(goldenProfiles))(
    `golden profile %s: Form 1040 prints; Schedule 3-A is attached only when a refundable credit is claimed`,
    (name, profile) => {
      const { get } = graph(profile);
      // Profile G claims the EIC and the additional child tax credit, so Schedule 3-A is attached.
      const schedule3A = name === `profileGMfjTwoChildren`;
      expect(get(`/pdfIncludeSchedule3A`).complete).toBe(true);
      expect(get(`/pdfIncludeSchedule3A`).get).toBe(schedule3A);
      expect(get(`/pdfIncludeForm1040`).get).toBe(true);
    }
  );

  it(`every backend scenario: Schedule 3-A is included exactly when line 27a, 28 or 29 is above $0`, () => {
    const folder = `./src/test/factDictionaryTests/backend-scenarios`;
    const files = fs.readdirSync(folder).filter((f) => f.endsWith(`.json`));
    expect(files.length).toBeGreaterThan(100);
    let withSchedule3A = 0;
    for (const file of files) {
      const { get } = graph(JSON.parse(fs.readFileSync(`${folder}/${file}`, `utf-8`)).facts);
      const include = get(`/pdfIncludeSchedule3A`);
      expect(include.complete, file).toBe(true);
      const needs3A =
        positive(get, `/earnedIncomeCredit`) ||
        positive(get, `/additionalCtc`) ||
        positive(get, `/americanOpportunityCredit`);
      expect(include.get, file).toBe(needs3A);
      if (include.get) withSchedule3A++;
      expect(get(`/pdfIncludeForm1040`).get, file).toBe(true);
    }
    expect(withSchedule3A).toBeGreaterThan(0);
    expect(withSchedule3A).toBeLessThan(files.length);
  });

  it(`ordinary return with no business and no refundable credit is not knocked out`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdfIncludeSchedule3A`, `/flowIsKnockedOut`];
    const { get } = graph(profile5AmtAnd8959);
    expect(get(`/pdfIncludeSchedule3A`).get).toBe(false);
    expect(get(`/flowIsKnockedOut`).get).toBe(false);
  });

  it(`Schedule C line 31 equals Schedule 1 line 3; Form 8995 still stops the return`, ({ task }) => {
    task.meta.testedFactPaths = [`/scheduleCNetProfitOrLoss`, `/schedule1Line3`, `/flowIsKnockedOut`];
    const { get, str } = graph({ ...single, ...scheduleC(80000) });
    expect(get(`/hasScheduleCBusinesses`).get).toBe(true);
    expect(str(`/scheduleCNetProfitOrLoss`)).toBe(str(`/schedule1Line3`));
    expect(str(`/primaryFilerSeNetProfit`)).toBe(str(`/scheduleCNetProfitOrLoss`));
    expect(Number(str(`/scheduleCNetProfitOrLoss`))).toBeGreaterThan(0);
    expect(get(`/flowKnockoutForm8995WithoutTy2026Template`).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`self-employment answered yes with no business listed does not attach Schedule C`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasScheduleCBusinesses`];
    const { get } = graph({
      ...single,
      '/hadSelfEmploymentIncome': createBooleanWrapper(true),
      '/wantsQbiDeduction': createBooleanWrapper(false),
      '/scheduleCBusinesses': createCollectionWrapper([]),
      '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    });
    expect(get(`/hasScheduleCBusinesses`).complete).toBe(true);
    expect(get(`/hasScheduleCBusinesses`).get).toBe(false);
  });

  it(`childless EIC: line 8 yes puts $0 on Form 1040 line 32b`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdfIncludeSchedule3A`, `/schedule3AAmountForForm1040Line32b`, `/schedule3ALine6`];
    // Wages below the standard deduction, so line 24a is $0 and line 6 follows line 2 (26 U.S.C. 32).
    const { get, str } = graph({ ...single, ...makeW2Data(10000), ...line8(true) });
    expect(Number(str(`/earnedIncomeCredit`))).toBeGreaterThan(0);
    expect(get(`/pdfIncludeSchedule3A`).get).toBe(true);
    expect(Number(str(`/schedule3ALine6`))).toBeGreaterThan(0);
    expect(str(`/schedule3AAmountForForm1040Line32b`)).toBe(`0.00`);
    expect(str(`/schedule3ALine8`)).toBe(`0.00`);
  });

  it(`childless EIC: line 8 no carries line 6 to line 8 and Form 1040 line 32b`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule3ALine8`, `/schedule3AAmountForForm1040Line32b`, `/form1040Line32c`];
    const { str } = graph({ ...single, ...makeW2Data(10000), ...line8(false) });
    expect(Number(str(`/schedule3ALine6`))).toBeGreaterThan(0);
    expect(str(`/schedule3ALine8`)).toBe(str(`/schedule3ALine6`));
    expect(str(`/schedule3AAmountForForm1040Line32b`)).toBe(str(`/schedule3ALine6`));
    const cents = (s: string) => Math.round(Number(s) * 100);
    expect(cents(str(`/form1040Line32c`))).toBe(
      cents(str(`/totalOtherPaymentsRefundableCredits`)) - cents(str(`/schedule3AAmountForForm1040Line32b`))
    );
  });

  it(`line 7 no carries line 6 to Form 1040 line 32b and does not reach line 8`, ({ task }) => {
    task.meta.testedFactPaths = [`/schedule3AAmountForForm1040Line32b`, `/schedule3ALine8Applies`];
    const { get, str } = graph({
      ...single,
      ...makeW2Data(10000),
      '/schedule3AWantsFederalPublicBenefit': createBooleanWrapper(false),
    });
    expect(str(`/schedule3AAmountForForm1040Line32b`)).toBe(str(`/schedule3ALine6`));
    expect(get(`/schedule3ALine8Applies`).get).toBe(false);
    expect(get(`/schedule3ALine8`).complete).toBe(false);
  });

  it(`no amount on lines 27a, 28 or 29: Schedule 3-A is not included`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdfIncludeSchedule3A`];
    const { get, str } = graph({ ...single, ...withChild, ...scheduleC(80000) });
    expect(str(`/earnedIncomeCredit`)).toBe(`0.00`);
    expect(get(`/pdfIncludeSchedule3A`).get).toBe(positive(get, `/additionalCtc`));
    const wagesOnly = graph({ ...single, ...makeW2Data(80000) });
    expect(wagesOnly.str(`/earnedIncomeCredit`)).toBe(`0.00`);
    expect(wagesOnly.get(`/additionalCtc`).get.toString()).toBe(`0.00`);
    expect(wagesOnly.get(`/pdfIncludeSchedule3A`).get).toBe(false);
  });

  it(`Form 1040 prints for every filer, 65 or older too`, ({ task }) => {
    task.meta.testedFactPaths = [`/pdfIncludeForm1040`];
    const { get } = graph({ ...single, [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(`1950-01-01`) });
    expect(get(`/xmlOver65SRIndicator`).get).toBe(true);
    expect(get(`/pdfIncludeForm1040`).complete).toBe(true);
    expect(get(`/pdfIncludeForm1040`).get).toBe(true);
  });
});
