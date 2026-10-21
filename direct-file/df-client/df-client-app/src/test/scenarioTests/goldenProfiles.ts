// Golden end-to-end scenarios (synthetic data), #135: profiles 5 and 7, profile A (dividends + NIIT) and profile B
// (Florida only). Every name, SSN, address, EIN and payer in this file is made up: SSNs use the 900-999 area (never
// issued by SSA), with group numbers outside the ITIN ranges, so no fixture can match a real person. The expected
// figures are hand-computed in goldenProfiles.test.ts.
import {
  createAddressWrapper,
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDayWrapper,
  createDollarWrapper,
  createEinWrapper,
  createEnumWrapper,
  createStringWrapper,
  createTinWrapper,
} from '../persistenceWrappers.js';
import {
  baseFilerData,
  filerWithW2NoDeductionsNoCreditsBaseData,
  mfjFilerData,
  mfsFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

export const GOLDEN_SSN_PATTERN = /^9\d{2}-?\d{2}-?\d{4}$/;

/**
 * SSN-shaped test numbers a golden profile may use where the fact graph must read a TIN as an SSN (a profile that
 * claims the child tax credit or EITC: IRC §24(h)(7), §32(m)). A 9xx area is never an SSN to the fact graph
 * (Tin.isSSN), so such a profile can't use one. Only numbers already used as SSNs by the shared upstream fixtures in
 * src/test/testData.ts are allowed; goldenProfiles.test.ts checks that each still appears there.
 */
export const GOLDEN_SSN_ALLOWLIST: readonly string[] = [`555-55-5555`, `111-11-1111`, `444-00-4444`];

export const isGoldenTestTin = (tin: string) => GOLDEN_SSN_PATTERN.test(tin) || GOLDEN_SSN_ALLOWLIST.includes(tin);

const noW2 = Object.fromEntries(
  Object.entries(filerWithW2NoDeductionsNoCreditsBaseData).filter(([k]) => !k.startsWith(`/formW2s`))
);

type Person = { first: string; last: string; ssn: [string, string, string]; dob: string };
type Home = { street: string; city: string; zip: string; state: string };

const single = (p: Person, home: Home) => ({
  ...noW2,
  ...baseFilerData,
  ...singleFilerData,
  [`/filers/#${primaryFilerId}/firstName`]: createStringWrapper(p.first),
  [`/filers/#${primaryFilerId}/writableMiddleInitial`]: createStringWrapper(``),
  [`/filers/#${primaryFilerId}/lastName`]: createStringWrapper(p.last),
  [`/filers/#${primaryFilerId}/occupation`]: createStringWrapper(`Analyst`),
  [`/filers/#${primaryFilerId}/tin`]: createTinWrapper({ area: p.ssn[0], group: p.ssn[1], serial: p.ssn[2] }),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(p.dob),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  '/email': { $type: `gov.irs.factgraph.persisters.EmailAddressWrapper`, item: { email: `filer@example.com` } },
  '/address': createAddressWrapper(home.street, home.city, home.zip, home.state),
  '/livedTogetherAllYearWithSpouse': createBooleanWrapper(true),
  '/hasAmtPreferenceItems': createBooleanWrapper(false),
  '/paHasUnreimbursedEmployeeExpenses': createBooleanWrapper(false),
  '/paHasUnsupportedItems': createBooleanWrapper(false),
  // Interview answers that clear the remaining screening questions (all "no").
  '/writablePrimaryFilerHadNonW2HsaActivity': createBooleanWrapper(false),
  '/writableHasHsaExcessContributionsPreviousYear': createBooleanWrapper(false),
  '/writableHasHsaWithdrawnExcessContributionsYesNo': createBooleanWrapper(false),
  '/writableHasPtcQualifyingPlan': createBooleanWrapper(false),
  '/overtimeNotOnW2CodeTT': createBooleanWrapper(false),
  '/hasUnreportedTips': createBooleanWrapper(false),
  '/hadSelfEmploymentIncome': createBooleanWrapper(false),
  '/hasHsaMedicalSavingsAccountType': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/hasMadeQualifiedHsaFundingDistribution`]: createBooleanWrapper(false),
  '/writableHasAdvancedPtc': createBooleanWrapper(false),
});

type W2 = {
  id: string;
  employer: string;
  ein: [string, string];
  box1: number;
  box2: number;
  box5?: number;
  box6?: number;
  box16?: number;
  box17?: number;
  paPartYearState?: `pa` | `fl`;
  residentPeriodWages?: number;
};
const w2s = (ssn: [string, string, string], ...forms: W2[]) => {
  let out: Record<string, unknown> = { '/formW2s': createCollectionWrapper(forms.map((f) => f.id)) };
  for (const f of forms) {
    const p = `/formW2s/#${f.id}`;
    out = {
      ...out,
      [`${p}/filer`]: createCollectionItemWrapper(primaryFilerId),
      [`${p}/employerName`]: createStringWrapper(f.employer),
      [`${p}/ein`]: createEinWrapper(...f.ein),
      [`${p}/employerAddress`]: createAddressWrapper(`500 Sample Ave`, `Harrisburg`, `17101`, `PA`),
      [`${p}/addressMatchesReturn`]: createBooleanWrapper(true),
      [`${p}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
      [`${p}/tin`]: createTinWrapper({ area: ssn[0], group: ssn[1], serial: ssn[2] }),
      [`${p}/nonstandardOrCorrectedChoice`]: createEnumWrapper(`neither`, `/form1099RsNonstandardCorrectedOptions`),
      [`${p}/writableCombatPay`]: createDollarWrapper(`0`),
      [`${p}/writableDependentCareBenefits`]: createDollarWrapper(`0`),
      [`${p}/writableWages`]: createDollarWrapper(`${f.box1}`),
      [`${p}/writableFederalWithholding`]: createDollarWrapper(`${f.box2}`),
      ...(f.box5 === undefined ? {} : { [`${p}/writableMedicareWages`]: createDollarWrapper(`${f.box5}`) }),
      ...(f.box6 === undefined ? {} : { [`${p}/writableMedicareWithholding`]: createDollarWrapper(`${f.box6}`) }),
      ...(f.box16 === undefined && f.box17 === undefined
        ? {}
        : { [`${p}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`) }),
      ...(f.box16 === undefined ? {} : { [`${p}/writableStateWages`]: createDollarWrapper(`${f.box16}`) }),
      ...(f.box17 === undefined ? {} : { [`${p}/writableStateWithholding`]: createDollarWrapper(`${f.box17}`) }),
      ...(f.paPartYearState === undefined
        ? {}
        : { [`${p}/paPartYearW2State`]: createEnumWrapper(f.paPartYearState, `/paPartYearW2StateOptions`) }),
      ...(f.residentPeriodWages === undefined
        ? {}
        : { [`${p}/paPartYearResidentPeriodWages`]: createDollarWrapper(`${f.residentPeriodWages}`) }),
    };
  }
  return out;
};

const interest = (id: string, payer: string, box1: number) => ({
  '/interestReports': createCollectionWrapper([id]),
  [`/interestReports/#${id}/payer`]: createStringWrapper(payer),
  [`/interestReports/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/interestReports/#${id}/has1099`]: createBooleanWrapper(true),
  [`/interestReports/#${id}/writable1099Amount`]: createDollarWrapper(`${box1}`),
  [`/interestReports/#${id}/writableInterestOnGovernmentBonds`]: createDollarWrapper(`0`),
  [`/interestReports/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
});

const qualifiedDividends = (id: string, payer: string, box1a: number, box1b: number) => ({
  '/dividendReports': createCollectionWrapper([id]),
  [`/dividendReports/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/dividendReports/#${id}/payer`]: createStringWrapper(payer),
  [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`${box1a}`),
  [`/dividendReports/#${id}/writableQualifiedDividends`]: createDollarWrapper(`${box1b}`),
  [`/dividendReports/#${id}/qualifiedDividendsHoldingPeriodNotMet`]: createBooleanWrapper(false),
  [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
  [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(false),
  [`/dividendReports/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/dividendReportsIsDone': createBooleanWrapper(true),
});

const casey: Person = { first: `Casey`, last: `Sample`, ssn: [`900`, `41`, `1001`], dob: `1980-02-17` };
const morgan: Person = { first: `Morgan`, last: `Sample`, ssn: [`900`, `42`, `1002`], dob: `1981-08-30` };
const taylor: Person = { first: `Taylor`, last: `Placeholder`, ssn: [`900`, `43`, `1003`], dob: `1992-04-03` };
const avery: Person = { first: `Avery`, last: `Sample`, ssn: [`900`, `12`, `3456`], dob: `1975-03-09` };
const jordan: Person = { first: `Jordan`, last: `Example`, ssn: [`900`, `23`, `4567`], dob: `1988-11-21` };
const riley: Person = { first: `Riley`, last: `Placeholder`, ssn: [`900`, `34`, `5678`], dob: `1990-05-14` };

/**
 * Profile 5: single Florida resident (no state return), high W-2 wages plus large qualified dividends:
 * Form 6251 AMT, Form 8959 Additional Medicare Tax (and Form 8960 NIIT on the dividends).
 */
export const profile5AmtAnd8959 = {
  ...single(avery, { street: `123 Example St`, city: `Tallahassee`, zip: `32301`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  ...w2s(avery.ssn, {
    id: `13500000-0000-4000-8000-000000000501`,
    employer: `Example Widgets LLC`,
    ein: [`00`, `0000501`],
    box1: 250000,
    box2: 70000,
    box5: 250000,
    box6: 4075,
  }),
  ...qualifiedDividends(`13500000-0000-4000-8000-000000000502`, `Example Index Fund`, 1000000, 1000000),
};

/** Profile 7a: PA full-year resident, single: W-2 and 1099-INT. */
export const profile7PaFullYear = {
  ...single(jordan, { street: `123 Example St`, city: `Harrisburg`, zip: `17101`, state: `PA` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
  '/paSchoolDistrictCode': createStringWrapper(`22275`),
  ...w2s(jordan.ssn, {
    id: `13500000-0000-4000-8000-000000000701`,
    employer: `Sample Manufacturing Co`,
    ein: [`00`, `0000701`],
    box1: 62000,
    box2: 5000,
    box16: 65000,
    box17: 2100,
  }),
  ...interest(`13500000-0000-4000-8000-000000000702`, `Example Savings Bank`, 800),
};

/** Profile 7b: part-year resident, moves from PA to FL on July 1, 2026, single: one W-2 from each state. */
export const profile7PaToFlPartYear = {
  ...single(riley, { street: `123 Example St`, city: `Tallahassee`, zip: `32301`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
  '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
  '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
  ...w2s(
    riley.ssn,
    {
      id: `13500000-0000-4000-8000-000000000711`,
      employer: `Sample Manufacturing Co`,
      ein: [`00`, `0000701`],
      box1: 30000,
      box2: 2500,
      box16: 30000,
      box17: 1000,
      paPartYearState: `pa`,
    },
    {
      id: `13500000-0000-4000-8000-000000000712`,
      employer: `Example Coastal Services Inc`,
      ein: [`00`, `0000712`],
      box1: 40000,
      box2: 3500,
      paPartYearState: `fl`,
      residentPeriodWages: 0,
    }
  ),
};

const spouse = (p: Person) => ({
  [`/filers/#${spouseId}/firstName`]: createStringWrapper(p.first),
  [`/filers/#${spouseId}/writableMiddleInitial`]: createStringWrapper(``),
  [`/filers/#${spouseId}/lastName`]: createStringWrapper(p.last),
  [`/filers/#${spouseId}/occupation`]: createStringWrapper(`Designer`),
  [`/filers/#${spouseId}/tin`]: createTinWrapper({ area: p.ssn[0], group: p.ssn[1], serial: p.ssn[2] }),
  [`/filers/#${spouseId}/dateOfBirth`]: createDayWrapper(p.dob),
});

/**
 * Profile A: single Florida resident, W-2 wages $210,000 plus Form 1099-DIV ordinary dividends $20,000 (qualified
 * $15,000): Form 8960 NIIT on the dividends, Form 8959 on wages over $200,000, QDCG worksheet.
 */
export const profileADividendsNiit = {
  ...single(casey, { street: `123 Example St`, city: `Orlando`, zip: `32801`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  ...w2s(casey.ssn, {
    id: `13500000-0000-4000-8000-000000000a01`,
    employer: `Example Analytics LLC`,
    ein: [`00`, `0000101`],
    box1: 210000,
    box2: 40000,
    box5: 210000,
    box6: 3045,
  }),
  ...qualifiedDividends(`13500000-0000-4000-8000-000000000a02`, `Example Dividend Fund`, 20000, 15000),
};

/** Profile A boundary row: the same income on a joint return (spouse with no income). */
export const profileADividendsNiitMfj = {
  ...profileADividendsNiit,
  ...mfjFilerData,
  ...spouse(morgan),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(casey.dob),
};

/** Profile A boundary row: married filing separately, W-2 $124,001 plus $1,000 dividends (MAGI $125,001). */
export const profileADividendsNiitMfs = {
  ...profileADividendsNiit,
  ...mfsFilerData,
  ...spouse(morgan),
  // Separate-return screening answers: the spouse files their own return, doesn't itemize, has an SSN (not an
  // NRA TIN), isn't 65 or older and has no gross income.
  '/MFSLivingSpouseFilingReturn': createBooleanWrapper(true),
  '/MFSSpouseFilingReturn': createBooleanWrapper(true),
  '/MFSSpouseHasNRTIN': createBooleanWrapper(false),
  '/spouseItemizes': createBooleanWrapper(false),
  '/MFSSpouse65OrOlder': createBooleanWrapper(false),
  '/MFSSpouseHasGrossIncome': createBooleanWrapper(false),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(casey.dob),
  ...w2s(casey.ssn, {
    id: `13500000-0000-4000-8000-000000000a01`,
    employer: `Example Analytics LLC`,
    ein: [`00`, `0000101`],
    box1: 124001,
    box2: 20000,
    box5: 124001,
    box6: 1798,
  }),
  ...qualifiedDividends(`13500000-0000-4000-8000-000000000a02`, `Example Dividend Fund`, 1000, 1000),
};

/** Profile B: single Florida resident, no state return: W-2, Form 1099-INT and Form 1099-DIV. */
export const profileBFloridaOnly = {
  ...single(taylor, { street: `123 Example St`, city: `Jacksonville`, zip: `32202`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  ...w2s(taylor.ssn, {
    id: `13500000-0000-4000-8000-000000000b01`,
    employer: `Example Coastal Services Inc`,
    ein: [`00`, `0000201`],
    box1: 48000,
    box2: 4000,
  }),
  ...interest(`13500000-0000-4000-8000-000000000b02`, `Example Savings Bank`, 600),
  ...qualifiedDividends(`13500000-0000-4000-8000-000000000b03`, `Example Index Fund`, 900, 400),
};

/** Profile B negative row: the same return with $150 of state income tax withheld in W-2 box 17. */
export const profileBFloridaStateWithholding = {
  ...profileBFloridaOnly,
  ...w2s(taylor.ssn, {
    id: `13500000-0000-4000-8000-000000000b01`,
    employer: `Example Coastal Services Inc`,
    ein: [`00`, `0000201`],
    box1: 48000,
    box2: 4000,
    box16: 48000,
    box17: 150,
  }),
};

export const goldenProfiles = {
  profileADividendsNiit,
  profileADividendsNiitMfj,
  profileADividendsNiitMfs,
  profileBFloridaOnly,
  profileBFloridaStateWithholding,
  profile5AmtAnd8959,
  profile7PaFullYear,
  profile7PaToFlPartYear,
};
