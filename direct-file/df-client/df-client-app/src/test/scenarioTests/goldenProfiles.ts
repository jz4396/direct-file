// Golden end-to-end scenarios (synthetic data), #135: profiles 5 and 7, profile A (dividends + NIIT), profile B
// (Florida only), profile C (PA to FL part-year resident with AMT and NIIT), profile D (head of household, 65 or
// older, itemizing, with a qualifying child), profile E (PA to FL part-year resident with AMT and dividends),
// profile F (full-year Pennsylvania resident, head of household, with AMT and Schedule C), profile G (married
// filing jointly, Florida, two qualifying children: Schedule 8812, Form 2441 and the EITC), and profile H
// (full-year Pennsylvania resident, Schedule E Part I residential rental, and dividends).
// Every name, SSN, address, EIN and payer
// in this file is made up. SSNs use the 900-999 area (never issued by SSA), with group numbers outside the ITIN
// ranges, or group 00 (never issued by SSA either), so no fixture can match a real person. The expected figures are
// hand-computed in goldenProfiles.test.ts.
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
  makeChildData,
  mfjFilerData,
  mfsFilerData,
  primaryFilerId,
  singleFilerData,
  spouseId,
} from '../testData.js';

export const GOLDEN_SSN_PATTERN = /^9\d{2}-?\d{2}-?\d{4}$/;

/**
 * SSN-shaped test numbers a golden profile may use where the fact graph must read a TIN as an SSN (a 9xx area is
 * never an SSN to the fact graph, Tin.isSSN). Each one has group number 00, which SSA never assigns:
 * https://www.ssa.gov/employer/randomizationfaqs.html "SSN randomization will not assign group number 00 or serial
 * number 0000. SSNs containing group number 00 or serial number 0000 will continue to be invalid."
 * goldenProfiles.test.ts checks the group number.
 */
export const GOLDEN_SSN_ALLOWLIST: readonly string[] = [
  `444-00-4444`,
  `444-00-0333`,
  `444-00-1007`,
  `444-00-1008`,
  `444-00-2001`,
  `444-00-2002`,
  `444-00-2003`,
  `444-00-2004`,
];

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
  '/someFilerHadNonW2HsaActivity': createBooleanWrapper(false),
  '/writablePrimaryFilerHadNonW2HsaActivity': createBooleanWrapper(false),
  '/hasHouseholdEmployeeScheduleH': createBooleanWrapper(false),
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

export type W2 = {
  id: string;
  employer: string;
  ein: [string, string];
  box1: number;
  box2: number;
  box3?: number;
  box4?: number;
  box5?: number;
  box6?: number;
  box16?: number;
  box17?: number;
  paPartYearState?: `pa` | `fl`;
  residentPeriodWages?: number;
  /** Defaults to the primary filer. */
  filerId?: string;
  /** Defaults to the `ssn` argument of `w2s`. */
  tin?: [string, string, string];
};
const w2s = (ssn: [string, string, string], ...forms: W2[]) => {
  let out: Record<string, unknown> = { '/formW2s': createCollectionWrapper(forms.map((f) => f.id)) };
  for (const f of forms) {
    const p = `/formW2s/#${f.id}`;
    const tin = f.tin ?? ssn;
    out = {
      ...out,
      [`${p}/filer`]: createCollectionItemWrapper(f.filerId ?? primaryFilerId),
      [`${p}/employerName`]: createStringWrapper(f.employer),
      [`${p}/ein`]: createEinWrapper(...f.ein),
      [`${p}/employerAddress`]: createAddressWrapper(`500 Sample Ave`, `Harrisburg`, `17101`, `PA`),
      [`${p}/addressMatchesReturn`]: createBooleanWrapper(true),
      [`${p}/statutoryEmployee`]: createBooleanWrapper(false),
      [`${p}/thirdPartySickPay`]: createBooleanWrapper(false),
      [`${p}/hasRRTACodes`]: createBooleanWrapper(false),
      [`${p}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
      [`${p}/tin`]: createTinWrapper({ area: tin[0], group: tin[1], serial: tin[2] }),
      [`${p}/nonstandardOrCorrectedChoice`]: createEnumWrapper(`neither`, `/form1099RsNonstandardCorrectedOptions`),
      [`${p}/writableCombatPay`]: createDollarWrapper(`0`),
      [`${p}/writableDependentCareBenefits`]: createDollarWrapper(`0`),
      [`${p}/writableWages`]: createDollarWrapper(`${f.box1}`),
      [`${p}/writableFederalWithholding`]: createDollarWrapper(`${f.box2}`),
      ...(f.box3 === undefined ? {} : { [`${p}/writableOasdiWages`]: createDollarWrapper(`${f.box3}`) }),
      ...(f.box4 === undefined ? {} : { [`${p}/writableOasdiWithholding`]: createDollarWrapper(`${f.box4}`) }),
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
  '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
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
    // 1.45% x 210,000 = 3,045, plus the employer's 0.9% on wages over $200,000 (IRC §3102(f)(1)): 90.
    box6: 3135,
  }),
  ...qualifiedDividends(`13500000-0000-4000-8000-000000000a02`, `Example Dividend Fund`, 20000, 15000),
};

/** Profile A boundary row: the same income on a joint return (spouse with no income). */
export const profileADividendsNiitMfj = {
  ...profileADividendsNiit,
  ...mfjFilerData,
  ...spouse(morgan),
  // Spouse state-scope screening answers: same state as the filer, no Alaska PFD, no income forms.
  '/spouseLivesInTPState': createEnumWrapper(`sameState`, `/spouseScopedStateOptions`),
  '/spouseReceivedAlaskaPfd': createBooleanWrapper(false),
  '/spouseIncomeFormsInScopedState': createEnumWrapper(`noForms`, `/primaryFilerW2And1099IntStateOptions`),
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

/** One Form 8949 box D (long-term, basis reported) sale. */
export const form8949Sale = (id: string, acquired: string, sold: string, proceeds: number, basis: number) => ({
  '/form8949Transactions': createCollectionWrapper([id]),
  [`/form8949Transactions/#${id}/description`]: createStringWrapper(`100 sh Example Index Fund`),
  [`/form8949Transactions/#${id}/dateAcquired`]: createDayWrapper(acquired),
  [`/form8949Transactions/#${id}/dateAcquiredIsVariousOrInherited`]: createBooleanWrapper(false),
  [`/form8949Transactions/#${id}/dateSold`]: createDayWrapper(sold),
  [`/form8949Transactions/#${id}/proceeds`]: createDollarWrapper(`${proceeds}`),
  [`/form8949Transactions/#${id}/costBasis`]: createDollarWrapper(`${basis}`),
  [`/form8949Transactions/#${id}/box`]: createEnumWrapper(`D`, `/form8949BoxOptions`),
  [`/form8949Transactions/#${id}/holdingPeriod`]: createEnumWrapper(`longTerm`, `/form8949HoldingPeriodOptions`),
  [`/form8949Transactions/#${id}/hasSeenLastAvailableScreen`]: createBooleanWrapper(true),
  '/form8949TransactionsIsDone': createBooleanWrapper(true),
});

/**
 * Profile C: single, moved from Pennsylvania to Florida on July 1, 2026 (PA part-year resident). A PA W-2 for the PA
 * period and a FL W-2 for the FL period, plus a $350,000 long-term gain from a sale in the FL period: Form 6251 AMT
 * inside the exemption phaseout (the 50% rate), Form 8960 NIIT on the gain, and a PA-40 that leaves the gain out
 * (a nonresident is not taxed on gains from intangible property).
 */
const quinn: Person = { first: `Quinn`, last: `Example`, ssn: [`444`, `00`, `4444`], dob: `1979-09-12` };
export const profileCPaW2: W2 = {
  id: `13500000-0000-4000-8000-000000000c01`,
  employer: `Sample Manufacturing Co`,
  ein: [`00`, `0000301`],
  box1: 150000,
  box2: 30000,
  box5: 150000,
  // 1.45% x 150,000; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 2175,
  box16: 150000,
  box17: 4700,
  paPartYearState: `pa`,
};
export const profileCFlW2: W2 = {
  id: `13500000-0000-4000-8000-000000000c02`,
  employer: `Example Coastal Services Inc`,
  ein: [`00`, `0000302`],
  box1: 100000,
  box2: 20000,
  box5: 100000,
  // 1.45% x 100,000; no 0.9% (under $200,000 from this employer).
  box6: 1450,
  paPartYearState: `fl`,
  residentPeriodWages: 0,
};
export const profileCSaleId = `13500000-0000-4000-8000-000000000c03`;
export const profileCPaToFlAmtNiit = {
  ...single(quinn, { street: `123 Example St`, city: `Tallahassee`, zip: `32301`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
  '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
  '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
  '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
  ...w2s(quinn.ssn, profileCPaW2, profileCFlW2),
  ...form8949Sale(profileCSaleId, `2020-03-02`, `2026-09-15`, 450000, 100000),
};

/** Profile C negative-row inputs (each row in goldenProfiles.test.ts changes one thing). */
export const profileCRows = {
  w2s: (...forms: W2[]) => w2s(quinn.ssn, ...forms),
  interest,
  qualifiedDividends,
  spouse: () => spouse(morgan),
};

/**
 * Profile D: head of household, Florida resident, filer born March 15, 1960 (66 at the end of 2026), one daughter
 * born May 1, 2010 who lived in the home all year. W-2 wages $125,000 and $1,000 of Form 1099-INT interest; itemizes
 * $41,500 of real estate tax, $500 of personal property tax, $15,000 of mortgage interest and $3,000 of cash gifts:
 * the $40,400 SALT cap, the 0.5%-of-AGI charitable floor, the Schedule 1-A senior deduction phaseout, Form 6251 with
 * no AMT, and the child tax credit.
 */
const dana: Person = { first: `Dana`, last: `Example`, ssn: [`444`, `00`, `4444`], dob: `1960-03-15` };
export const profileDChildId = `13500000-0000-4000-8000-000000000d03`;
export const profileDW2: W2 = {
  id: `13500000-0000-4000-8000-000000000d01`,
  employer: `Example Coastal Services Inc`,
  ein: [`00`, `0000401`],
  box1: 125000,
  box2: 14000,
  box3: 125000,
  // 6.2% x 125,000 (IRC §3101(a), https://www.law.cornell.edu/uscode/text/26/3101).
  box4: 7750,
  box5: 125000,
  // 1.45% x 125,000 = 1,812.50; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 1812.5,
};
export const profileDHohItemizerChild = {
  ...single(dana, { street: `123 Example St`, city: `Gainesville`, zip: `32601`, state: `FL` }),
  '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
  '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  '/familyAndHousehold': createCollectionWrapper([profileDChildId]),
  ...makeChildData(profileDChildId, `2010-05-01`),
  [`/familyAndHousehold/#${profileDChildId}/firstName`]: createStringWrapper(`Riley`),
  [`/familyAndHousehold/#${profileDChildId}/lastName`]: createStringWrapper(`Example`),
  [`/familyAndHousehold/#${profileDChildId}/monthsLivedWithTPInUS`]: createEnumWrapper(
    `twelve`,
    `/monthsLivedWithTPInUSOptions`
  ),
  [`/familyAndHousehold/#${profileDChildId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `0333` }),
  [`/familyAndHousehold/#${profileDChildId}/hasIpPin`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${profileDChildId}/unableToCareForSelf`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${profileDChildId}/tpPaidMostOfHomeUpkeep`]: createBooleanWrapper(true),
  '/hohQualifyingPerson': createCollectionItemWrapper(profileDChildId),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(false),
  '/receivedImproperClaims': createBooleanWrapper(false),
  ...w2s(dana.ssn, profileDW2),
  ...interest(`13500000-0000-4000-8000-000000000d02`, `Example Savings Bank`, 1000),
  '/scheduleAWantsToItemize': createBooleanWrapper(true),
  '/scheduleAWritableMedical': createDollarWrapper(`0`),
  '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`0`),
  '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`41500`),
  '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`500`),
  '/scheduleAWritableMortgageInterest': createDollarWrapper(`15000`),
  '/scheduleAWritableCashGifts': createDollarWrapper(`3000`),
  '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
  '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
};

/**
 * Profile E: single, moved from Pennsylvania to Florida on July 1, 2026. Same wages and FL-period long-term gain as
 * profile C, plus $2,000 of qualified dividends received entirely while a PA resident (under the $2,500 PA Schedule B
 * tool limit, and PA Schedule B line 4 is $0 because none were received while a nonresident). Form 6251 AMT inside the
 * exemption phaseout, Form 8960 on the dividends and the gain, and a PA-40 that taxes the dividends and the PA wages.
 */
const parker: Person = { first: `Parker`, last: `Example`, ssn: [`900`, `45`, `1006`], dob: `1982-06-18` };
export const profileEPaW2: W2 = {
  id: `13500000-0000-4000-8000-000000000e01`,
  employer: `Sample Manufacturing Co`,
  ein: [`00`, `0000801`],
  box1: 150000,
  box2: 30000,
  box5: 150000,
  // 1.45% x 150,000; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 2175,
  box16: 150000,
  box17: 4700,
  paPartYearState: `pa`,
};
export const profileEFlW2: W2 = {
  id: `13500000-0000-4000-8000-000000000e02`,
  employer: `Example Coastal Services Inc`,
  ein: [`00`, `0000802`],
  box1: 100000,
  box2: 20000,
  box5: 100000,
  // 1.45% x 100,000; no 0.9% (under $200,000 from this employer).
  box6: 1450,
  paPartYearState: `fl`,
  residentPeriodWages: 0,
};
export const profileESaleId = `13500000-0000-4000-8000-000000000e03`;
export const profileEDividendId = `13500000-0000-4000-8000-000000000e04`;
export const profileEPaToFlAmtDividends = {
  ...single(parker, { street: `123 Example St`, city: `Tallahassee`, zip: `32301`, state: `FL` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`moreThanOne`, `/scopedStateOptions`),
  '/paPartYearMove': createEnumWrapper(`paToFl`, `/paPartYearMoveOptions`),
  '/paPartYearMoveDate': createDayWrapper(`2026-07-01`),
  '/paPartYearHasNonresidentPaSourcePay': createBooleanWrapper(false),
  '/paHasExemptObligationDividends': createBooleanWrapper(false),
  '/paPartYearResidentDividends': createDollarWrapper(`2000`),
  ...w2s(parker.ssn, profileEPaW2, profileEFlW2),
  ...form8949Sale(profileESaleId, `2020-03-02`, `2026-09-15`, 450000, 100000),
  ...qualifiedDividends(profileEDividendId, `Example Dividend Fund`, 2000, 2000),
};

/**
 * Profile F: full-year Pennsylvania resident, head of household, one child. W-2 wages plus one Schedule C
 * (single expense total) sized so taxable income before the section 199A deduction is exactly the head-of-household
 * Form 8995 threshold, and the $40,400 SALT cap produces Form 6251 AMT. PA-40 line 4 stays $0: any Schedule C on a
 * PA-40 stops the return. Form 8995 is computed and the print stops because there is no TY2026 template.
 */
const skyler: Person = { first: `Skyler`, last: `Example`, ssn: [`444`, `00`, `1007`], dob: `1985-04-12` };
export const profileFBusinessId = `13500000-0000-4000-8000-000000000f01`;
export const profileFChildId = `13500000-0000-4000-8000-000000000f03`;
export const profileFW2: W2 = {
  id: `13500000-0000-4000-8000-000000000f02`,
  employer: `Sample Manufacturing Co`,
  ein: [`00`, `0000901`],
  box1: 190000,
  box2: 40000,
  box3: 184500,
  // 6.2% x 184,500 (the OASDI wage base). IRC §3101(a).
  box4: 11439,
  box5: 190000,
  // 1.45% x 190,000; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 2755,
  box16: 190000,
  box17: 6000,
};
export const profileFPaAmtScheduleC = {
  ...single(skyler, { street: `123 Example St`, city: `Harrisburg`, zip: `17101`, state: `PA` }),
  [`/filers/#${primaryFilerId}/occupation`]: createStringWrapper(`Consultant`),
  '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
  '/filingStatus': createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
  '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
  '/paSchoolDistrictCode': createStringWrapper(`22275`),
  '/paHasSpNontaxableIncome': createBooleanWrapper(false),
  '/familyAndHousehold': createCollectionWrapper([profileFChildId]),
  ...makeChildData(profileFChildId, `2014-06-01`),
  [`/familyAndHousehold/#${profileFChildId}/firstName`]: createStringWrapper(`Rowan`),
  [`/familyAndHousehold/#${profileFChildId}/writableMiddleInitial`]: createStringWrapper(``),
  [`/familyAndHousehold/#${profileFChildId}/lastName`]: createStringWrapper(`Example`),
  [`/familyAndHousehold/#${profileFChildId}/monthsLivedWithTPInUS`]: createEnumWrapper(
    `twelve`,
    `/monthsLivedWithTPInUSOptions`
  ),
  [`/familyAndHousehold/#${profileFChildId}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial: `1008` }),
  [`/familyAndHousehold/#${profileFChildId}/hasIpPin`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${profileFChildId}/unableToCareForSelf`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${profileFChildId}/tpPaidMostOfHomeUpkeep`]: createBooleanWrapper(true),
  '/hohQualifyingPerson': createCollectionItemWrapper(profileFChildId),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(false),
  '/receivedImproperClaims': createBooleanWrapper(false),
  ...w2s(skyler.ssn, profileFW2),
  '/hadSelfEmploymentIncome': createBooleanWrapper(true),
  // Answered no. Unanswered, /flowKnockoutScheduleSEOutOfScope stays incomplete and refuses the print.
  // 26 U.S.C. 1402(a), 1402(a)(1), 1402(a)(8), 1402(a)(14), 1402(c)(1), 1402(c)(4), 1402(e), 1402(g), 1402(j), 1402(l).
  '/hadFarmSelfEmploymentIncome': createBooleanWrapper(false),
  '/hadChurchEmployeeIncome': createBooleanWrapper(false),
  '/usesSeOptionalMethod': createBooleanWrapper(false),
  '/hasMinisterOrSeExemption': createBooleanWrapper(false),
  '/hasNotarySeExclusion': createBooleanWrapper(false),
  '/hadForm8919Wages': createBooleanWrapper(false),
  '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
  '/qbiIsCooperativePatron': createBooleanWrapper(false),
  '/scheduleCBusinesses': createCollectionWrapper([profileFBusinessId]),
  '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
  [`/scheduleCBusinesses/#${profileFBusinessId}/filer`]: createCollectionItemWrapper(primaryFilerId),
  [`/scheduleCBusinesses/#${profileFBusinessId}/businessName`]: createStringWrapper(`Example Consulting`),
  [`/scheduleCBusinesses/#${profileFBusinessId}/materiallyParticipates`]: createBooleanWrapper(true),
  [`/scheduleCBusinesses/#${profileFBusinessId}/writableGrossReceipts`]: createDollarWrapper(`64858`),
  [`/scheduleCBusinesses/#${profileFBusinessId}/writableTotalExpenses`]: createDollarWrapper(`12000`),
  '/scheduleAWantsToItemize': createBooleanWrapper(true),
  '/scheduleAWritableMedical': createDollarWrapper(`0`),
  '/scheduleAWritableStateLocalIncomeOrSalesTax': createDollarWrapper(`0`),
  '/scheduleAWritableRealEstateTaxes': createDollarWrapper(`40400`),
  '/scheduleAWritablePersonalPropertyTaxes': createDollarWrapper(`0`),
  '/scheduleAWritableMortgageInterest': createDollarWrapper(`0`),
  '/scheduleAWritableCashGifts': createDollarWrapper(`0`),
  '/scheduleAWritableElectsToItemize': createBooleanWrapper(false),
  '/scheduleAHasUnsupportedItems': createBooleanWrapper(false),
};

/**
 * Profile G (issue #135 suggested profile 2): married filing jointly, Florida resident, two qualifying children.
 * Each spouse has $28,000 of W-2 wages. Each child has $3,000 of qualifying care expenses (Form 2441). Schedule 8812,
 * the child and dependent care credit, and the earned income credit for two children are all computed. The return
 * still stops on /flowKnockoutScheduleEicWithoutTy2026Template: a nonzero EIC with a qualifying child needs Schedule
 * EIC, and the tie-breaker for a child who is the qualifying child of more than one person is not fully modeled.
 */
const harper: Person = { first: `Harper`, last: `Example`, ssn: [`444`, `00`, `2001`], dob: `1985-06-12` };
const reese: Person = { first: `Reese`, last: `Example`, ssn: [`444`, `00`, `2002`], dob: `1986-11-03` };
export const profileGChild1Id = `13500000-0000-4000-8000-000000001003`;
export const profileGChild2Id = `13500000-0000-4000-8000-000000001004`;
const profileGChild = (id: string, dob: string, first: string, serial: string) => ({
  ...makeChildData(id, dob),
  [`/familyAndHousehold/#${id}/firstName`]: createStringWrapper(first),
  [`/familyAndHousehold/#${id}/writableMiddleInitial`]: createStringWrapper(``),
  [`/familyAndHousehold/#${id}/lastName`]: createStringWrapper(`Example`),
  [`/familyAndHousehold/#${id}/monthsLivedWithTPInUS`]: createEnumWrapper(`twelve`, `/monthsLivedWithTPInUSOptions`),
  [`/familyAndHousehold/#${id}/tin`]: createTinWrapper({ area: `444`, group: `00`, serial }),
  [`/familyAndHousehold/#${id}/hasIpPin`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${id}/unableToCareForSelf`]: createBooleanWrapper(false),
  [`/familyAndHousehold/#${id}/cdccHasDependentCareExpenses`]: createBooleanWrapper(true),
  [`/familyAndHousehold/#${id}/cdccHadExpensesPaidToQualifyingProvider`]: createBooleanWrapper(true),
  [`/familyAndHousehold/#${id}/writableCdccQualifyingExpenseAmount`]: createDollarWrapper(`3000`),
});
export const profileGPrimaryW2: W2 = {
  id: `13500000-0000-4000-8000-000000001001`,
  employer: `Example Harbor Co`,
  ein: [`00`, `0002101`],
  box1: 28000,
  box2: 500,
  box3: 28000,
  // 6.2% x 28,000 (IRC §3101(a), https://www.law.cornell.edu/uscode/text/26/3101).
  box4: 1736,
  box5: 28000,
  // 1.45% x 28,000; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 406,
  filerId: primaryFilerId,
  tin: harper.ssn,
};
export const profileGSpouseW2: W2 = {
  id: `13500000-0000-4000-8000-000000001002`,
  employer: `Sample Studio LLC`,
  ein: [`00`, `0002102`],
  box1: 28000,
  box2: 500,
  box3: 28000,
  box4: 1736,
  box5: 28000,
  box6: 406,
  filerId: spouseId,
  tin: reese.ssn,
};
export const profileGMfjTwoChildren = {
  ...single(harper, { street: `123 Example St`, city: `Tampa`, zip: `33602`, state: `FL` }),
  ...mfjFilerData,
  ...spouse(reese),
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(harper.dob),
  [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
  '/spouseLivesInTPState': createEnumWrapper(`sameState`, `/spouseScopedStateOptions`),
  '/spouseReceivedAlaskaPfd': createBooleanWrapper(false),
  '/spouseIncomeFormsInScopedState': createEnumWrapper(`onlySame`, `/primaryFilerW2And1099IntStateOptions`),
  '/familyAndHousehold': createCollectionWrapper([profileGChild1Id, profileGChild2Id]),
  ...profileGChild(profileGChild1Id, `2018-04-12`, `Robin`, `2003`),
  ...profileGChild(profileGChild2Id, `2020-09-15`, `Sky`, `2004`),
  '/writableCdccHasQualifyingExpenses': createBooleanWrapper(true),
  '/writableCdccTotalQualifiedDependentCareExpenses': createDollarWrapper(`6000`),
  '/cdccHasCreditForPriorYearExpenses': createBooleanWrapper(false),
  '/cdccClaimedCreditForPriorYearExpenses': createBooleanWrapper(true),
  '/cdccClaimedMaxCreditForPriorTaxYear': createBooleanWrapper(true),
  '/receivedImproperClaims': createBooleanWrapper(false),
  '/eitcQcOfAnother': createBooleanWrapper(false),
  '/eitcHadImproperClaims': createBooleanWrapper(false),
  // Schedule 3-A line 7 yes, line 8 yes: a U.S. citizen who wants the federal public benefit keeps line 32b at $0,
  // so the EIC and the additional child tax credit stay in the refund. 8 U.S.C. 1641(b).
  '/schedule3AWantsFederalPublicBenefit': createBooleanWrapper(true),
  '/schedule3AIsCitizenNationalOrQualifiedAlien': createBooleanWrapper(true),
  ...w2s(harper.ssn, profileGPrimaryW2, profileGSpouseW2),
};

/** Profile G with a different pair of W-2s (negative rows). */
export const profileGWithW2s = (...forms: W2[]) => ({
  ...profileGMfjTwoChildren,
  ...w2s(harper.ssn, ...forms),
});

/**
 * Profile H: full-year Pennsylvania resident, single, standard deduction. One W-2, one Schedule E Part I
 * residential rental (net income; no depreciation, personal use, substantial services, or per-property loss;
 * not a section 162 trade or business), and one Form 1099-DIV. Ordinary dividends are over $1,500, so federal
 * Schedule B Part II is required, and at or under $2,500, so PA Schedule B is not. Fixed identifiers: SSN
 * 900-46-1009, W-2 id 13500000-0000-4000-8000-000000001101, 1099-DIV id
 * 13500000-0000-4000-8000-000000001102. PA-40 line 6 stays $0: Schedule E income stops the return.
 */
const hayden: Person = { first: `Hayden`, last: `Example`, ssn: [`900`, `46`, `1009`], dob: `1988-03-15` };
export const profileHDividendId = `13500000-0000-4000-8000-000000001102`;
export const profileHW2: W2 = {
  id: `13500000-0000-4000-8000-000000001101`,
  employer: `Example Payroll LLC`,
  ein: [`00`, `0001101`],
  box1: 48000,
  box2: 5200,
  box3: 48000,
  // 6.2% x 48,000 (the wage base is $184,500). IRC §3101(a).
  box4: 2976,
  box5: 48000,
  // 1.45% x 48,000; no 0.9% (this employer paid under $200,000, IRC §3102(f)(1)).
  box6: 696,
  box16: 48000,
  box17: 1600,
};
export const profileHPaRentalDividends = {
  ...single(hayden, { street: `123 Example St`, city: `Harrisburg`, zip: `17101`, state: `PA` }),
  '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
  '/paSchoolDistrictCode': createStringWrapper(`22275`),
  '/paHasExemptObligationDividends': createBooleanWrapper(false),
  '/paHasSpNontaxableIncome': createBooleanWrapper(false),
  ...w2s(hayden.ssn, profileHW2),
  ...qualifiedDividends(profileHDividendId, `Example Dividend Fund`, 1800, 1200),
  '/hadScheduleEIncome': createBooleanWrapper(true),
  '/scheduleEProvidesSubstantialServices': createBooleanWrapper(false),
  '/scheduleEHasPersonalUse': createBooleanWrapper(false),
  '/scheduleEHasDepreciation': createBooleanWrapper(false),
  '/scheduleEAnyPropertyLoss': createBooleanWrapper(false),
  '/scheduleERentalIsTradeOrBusiness': createBooleanWrapper(false),
  '/scheduleEWritableRents': createDollarWrapper(`15000`),
  '/scheduleEWritableRoyalties': createDollarWrapper(`0`),
  '/scheduleEWritableExpenses': createDollarWrapper(`3000`),
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
  profileCPaToFlAmtNiit,
  profileDHohItemizerChild,
  profileEPaToFlAmtDividends,
  profileFPaAmtScheduleC,
  profileGMfjTwoChildren,
  profileHPaRentalDividends,
};
