// Golden end-to-end scenarios (synthetic data), #135 profiles 5 and 7. Every name, SSN, address, EIN and payer in
// this file is made up: SSNs use the 900-999 area (never issued by SSA), with group numbers outside the ITIN ranges,
// so no fixture can match a real person. The expected figures are hand-computed in goldenProfiles.test.ts.
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
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

export const GOLDEN_SSN_PATTERN = /^9\d{2}-?\d{2}-?\d{4}$/;

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

export const goldenProfiles = {
  profile5AmtAnd8959,
  profile7PaFullYear,
  profile7PaToFlPartYear,
};
