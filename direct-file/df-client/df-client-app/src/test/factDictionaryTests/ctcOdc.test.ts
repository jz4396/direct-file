import { it, describe, expect } from 'vitest';
import { Path } from '../../flow/Path.js';
import { baseFilerData, makeChildData, makeW2Data, mfjFilerData, primaryFilerId, spouseId } from '../testData.js';
import { createBooleanWrapper, createDayWrapper, createEnumWrapper, createTinWrapper } from '../persistenceWrappers.js';
import { CURRENT_TAX_YEAR } from '../../constants/taxConstants.js';
import { setupFactGraph } from '../setupFactGraph.js';

const childDependentId = `4fa3a5a7-a9d1-43a9-a0fb-277596e70d48`;
const childDependentId2 = `71c66f78-31b0-4a92-ab5b-c211784b16c7`;
const childDependentId3 = `8f4b5c65-2b14-46fa-bb8b-c449103c798a`;

const dob = {
  barelyFourteenAtStartOfYear: `${parseInt(CURRENT_TAX_YEAR) - 14}-01-01`,
  eighteen: `${parseInt(CURRENT_TAX_YEAR) - 18}-01-01`,
  adult: `1987-01-01`,
};
const childData = makeChildData(childDependentId, dob.barelyFourteenAtStartOfYear);
const child2Data = makeChildData(childDependentId2, dob.barelyFourteenAtStartOfYear);
const child3Data = makeChildData(childDependentId3, dob.eighteen);

const filerWithChild = {
  ...baseFilerData,
  [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(dob.adult),
  [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  [`/filingStatus`]: createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
  '/familyAndHousehold': {
    $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
    item: { items: [`${childDependentId}`] },
  },
  ...childData,
};

describe(`CTC eligibility`, () => {
  it(`has credits available when the filer has a ctc qualifying child`, ({ task }) => {
    task.meta.testedFactPaths = [`/hasPotentialCredits`];

    const { factGraph } = setupFactGraph(filerWithChild);
    expect(factGraph.get(Path.concretePath(`/familyAndHousehold/*/qualifyingChild`, childDependentId)).get).toBe(true);
    expect(factGraph.get(Path.concretePath(`/familyAndHousehold/*/eligibleCtc`, childDependentId)).get).toBe(true);
    expect(factGraph.get(Path.concretePath(`/hasPotentialCredits`, null)).get).toBe(true);
  });
});

describe(`CTC and ODC amounts`, () => {
  const testCases = [
    {
      name: `HOH filer with 3 QC (2 under 17 and one older) and limited taxes because of wages`,
      filer: {
        ...filerWithChild,
        '/scheduleAWantsToItemize': createBooleanWrapper(false),
        ...makeW2Data(56800),
        '/familyAndHousehold': {
          $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
          item: { items: [`${childDependentId}`, `${childDependentId2}`, `${childDependentId3}`] },
        },
        ...child2Data,
        ...child3Data,
      },
      // /tentativeTaxFromTaxableIncome is 3567 from TY2026 tax tables (HoH std ded $24,150), this caps this credit
      // For the 2 QC under 17, we get 2200 * 2 = 4400 (Rev. Proc. 2025-32 §4.05 p.14)
      // For the 1 QC over 17, we get 500, for a total potential credit of 4900
      // We are capped to 3567, from which we take 500 for ODC, leaving 3067 for CTC
      odcAmount: `500.00`,
      ctcAmount: `3067.00`,
      total: `3567.00`,
    },
    {
      name: `HOH filer with 3 QC (2 under 17 and one older) and partial phase out in wages`,
      filer: {
        ...filerWithChild,
        ...makeW2Data(201000),
        '/familyAndHousehold': {
          $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
          item: { items: [`${childDependentId}`, `${childDependentId2}`, `${childDependentId3}`] },
        },
        ...child2Data,
        ...child3Data,
      },
      // For the 2 QC under 17, we get 2200 * 2 = 4400
      // For the 1 QC over 17, we get 500, for a total potential credit of 4900
      // /dependentCreditPhaseoutThreshold is 200000, income is $1000 over that.
      // /dependentCreditPhaseout is .05 * 1000 = 50
      // So credit = 4900 - 50 = 4850
      // odc is phased out first and taken out first so odc = 450 leaving 4400 for ctc
      odcAmount: `450.00`,
      ctcAmount: `4400.00`,
      total: `4850.00`,
    },
    {
      name: `HOH filer with 3 QC (2 under 17 and one older) and partial phase out in wages with rounding`,
      filer: {
        ...filerWithChild,
        ...makeW2Data(222412),
        '/familyAndHousehold': {
          $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
          item: { items: [`${childDependentId}`, `${childDependentId2}`, `${childDependentId3}`] },
        },
        ...child2Data,
        ...child3Data,
      },
      // For the 2 QC under 17, we get 2200 * 2 = 4400
      // For the 1 QC over 17, we get 500, for a total potential credit of 4900
      // /dependentCreditPhaseoutThreshold is 200000
      // We round income to 223000, so this income is $23000 over threshold.
      // /dependentCreditPhaseout is .05 * 23000 = 1150
      // odc is phased out to zero
      // So credit = 4900 - 1150 = 3750
      // odc is phased out first and taken out first so odc = 0 leaving 3750 for ctc
      odcAmount: `0.00`,
      ctcAmount: `3750.00`,
      total: `3750.00`,
    },
    {
      name: `HOH filer with 2 QC (both under 17) and non limiting wages`,
      filer: {
        ...filerWithChild,
        ...makeW2Data(75000),
        '/familyAndHousehold': {
          $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
          item: { items: [`${childDependentId}`, `${childDependentId2}`] },
        },
        ...child2Data,
      },
      // For the 2 QC under 17, we get 2200 * 2 = 4400 (Rev. Proc. 2025-32 §4.05 p.14)
      // /dependentCreditPhaseoutThreshold is 200000
      // Income is under the threshold so no phaseout
      // So ctc is 4400
      odcAmount: `0.00`,
      ctcAmount: `4400.00`,
      total: `4400.00`,
    },
  ];

  for (const c of testCases) {
    it(c.name, ({ task }) => {
      task.meta.testedFactPaths = [`/totalOdc`, `/totalCtc`, `/totalCtcAndOdc`];

      const { factGraph } = setupFactGraph(c.filer);
      expect(factGraph.get(Path.concretePath(`/totalOdc`, null)).get.toString()).toBe(c.odcAmount);
      expect(factGraph.get(Path.concretePath(`/totalCtc`, null)).get.toString()).toBe(c.ctcAmount);
      expect(factGraph.get(Path.concretePath(`/totalCtcAndOdc`, null)).get.toString()).toBe(c.total);
    });
  }
});

// #182: IRC §24(h)(7)(A)(i), as amended by P.L. 119-21 §70104(b): no CTC "unless the taxpayer includes on the return
// ... the taxpayer's social security number (or, in the case of a joint return, the social security number of at
// least 1 spouse)". §24(h)(4)(C): a child denied the CTC "by reason of paragraph (7)" is treated as a dependent for
// the $500 credit for other dependents. https://www.law.cornell.edu/uscode/text/26/24
describe(`CTC filer SSN requirement (#182)`, () => {
  // 9XX-70-XXXX is in the ITIN group range (Tin.isITIN); 555-55-5555 and 111-11-1111 are the suite's SSNs.
  const itin = createTinWrapper({ area: `900`, group: `70`, serial: `0001` });
  const primaryValidity = (v: string) => ({
    [`/primaryFilerSsnEmploymentValidity`]: createEnumWrapper(v, `/primaryFilerSsnEmploymentValidityOptions`),
  });
  const primaryNonCitizen = { [`/filers/#${primaryFilerId}/isUsCitizenFullYear`]: createBooleanWrapper(false) };
  const primaryItin = { [`/filers/#${primaryFilerId}/tin`]: itin };
  const spouseItin = { [`/filers/#${spouseId}/tin`]: itin };
  const mfjWithChild = {
    ...filerWithChild,
    ...mfjFilerData,
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(dob.adult),
    [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
  };
  // Only an 18-year-old dependent: no child meets the CTC age test (ODC only).
  const noCtcAgeChild = {
    ...baseFilerData,
    [`/filers/#${primaryFilerId}/dateOfBirth`]: createDayWrapper(dob.adult),
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
    [`/filingStatus`]: createEnumWrapper(`headOfHousehold`, `/filingStatusOptions`),
    '/familyAndHousehold': {
      $type: `gov.irs.factgraph.persisters.CollectionWrapper`,
      item: { items: [`${childDependentId3}`] },
    },
    ...child3Data,
  };
  type FactPath = Parameters<typeof Path.concretePath>[0];
  const get = (fg: ReturnType<typeof setupFactGraph>[`factGraph`], path: FactPath, id: string | null = null) =>
    fg.get(Path.concretePath(path, id));
  const expectCtc = (data: object, ctc: boolean) => {
    const { factGraph } = setupFactGraph(data);
    expect(get(factGraph, `/familyAndHousehold/*/meetsChildCtcTests`, childDependentId).get).toBe(true);
    expect(get(factGraph, `/filerSsnRequirementForCtcMet`).get).toBe(ctc);
    expect(get(factGraph, `/familyAndHousehold/*/eligibleCtc`, childDependentId).get).toBe(ctc);
    expect(get(factGraph, `/familyAndHousehold/*/eligibleOdc`, childDependentId).get).toBe(!ctc);
    expect(get(factGraph, `/ctcEligibleDependents`).get).toBe(ctc ? 1 : 0);
    expect(get(factGraph, `/odcEligibleDependents`).get).toBe(ctc ? 0 : 1);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).get).toBe(false);
    return factGraph;
  };

  it(`SSN citizen filer is unchanged: CTC`, ({ task }) => {
    task.meta.testedFactPaths = [`/filerSsnRequirementForCtcMet`, `/familyAndHousehold/*/eligibleCtc`];
    expectCtc(filerWithChild, true);
  });

  it(`single (HoH) ITIN filer: no CTC; the child falls to the ODC under §24(h)(4)(C)`, ({ task }) => {
    task.meta.testedFactPaths = [`/familyAndHousehold/*/eligibleOdc`, `/totalCtc`, `/totalOdc`];
    const fg = expectCtc({ ...filerWithChild, ...primaryItin, ...makeW2Data(56800) }, false);
    // ODC is $500 per dependent, §24(h)(4)(A); tax before credits exceeds $500 at these wages.
    expect(get(fg, `/totalCtc`).get.toString()).toBe(`0.00`);
    expect(get(fg, `/totalOdc`).get.toString()).toBe(`500.00`);
  });

  it(`MFJ, ITIN primary and SSN spouse: CTC (at least 1 spouse)`, ({ task }) => {
    task.meta.testedFactPaths = [`/filerSsnRequirementForCtcMet`];
    expectCtc({ ...mfjWithChild, ...primaryItin }, true);
  });

  it(`MFJ, SSN primary and ITIN spouse: CTC`, ({ task }) => {
    task.meta.testedFactPaths = [`/filerSsnRequirementForCtcMet`];
    expectCtc({ ...mfjWithChild, ...spouseItin }, true);
  });

  it(`MFJ, both spouses ITIN: no CTC, ODC only`, ({ task }) => {
    task.meta.testedFactPaths = [`/filerSsnRequirementForCtcMet`];
    expectCtc({ ...mfjWithChild, ...primaryItin, ...spouseItin }, false);
  });

  it(`non-citizen filer whose card reads "Not valid for employment": no CTC`, ({ task }) => {
    task.meta.testedFactPaths = [`/filers/*/ssnValidForCtc`];
    const fg = expectCtc(
      {
        ...filerWithChild,
        ...primaryNonCitizen,
        ...primaryValidity(`notValid`),
        [`/filers/#${primaryFilerId}/writableHasSSNOnlyForBenefits`]: createBooleanWrapper(false),
      },
      false
    );
    // The same SSN still meets IRC §32(m) for the EITC, which is why the EITC fact isn't reused.
    expect(get(fg, `/filers/*/ssnValidForEitc`, primaryFilerId).get).toBe(true);
  });

  it(`non-citizen filer with "Valid for work only with DHS authorization" in effect: CTC`, ({ task }) => {
    task.meta.testedFactPaths = [`/filers/*/ssnValidForCtc`];
    expectCtc({ ...filerWithChild, ...primaryNonCitizen, ...primaryValidity(`validOnlyWithDhsAuthorization`) }, true);
  });

  it(`sole qualifying filer with expired DHS authorization: knockout, not a silent pass or fail`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCtcFilerSsnDhsExpired`, `/flowIsKnockedOut`];
    const { factGraph } = setupFactGraph({
      ...filerWithChild,
      ...primaryNonCitizen,
      ...primaryValidity(`validOnlyWithDhsAuthorizationExpired`),
    });
    expect(get(factGraph, `/filers/*/ssnDhsAuthorizationExpired`, primaryFilerId).get).toBe(true);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).get).toBe(true);
    expect(get(factGraph, `/flowIsKnockedOut`).get).toBe(true);
  });

  it(`expired DHS authorization doesn't stop the return when the other spouse has a qualifying SSN`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCtcFilerSsnDhsExpired`];
    expectCtc(
      { ...mfjWithChild, ...primaryNonCitizen, ...primaryValidity(`validOnlyWithDhsAuthorizationExpired`) },
      true
    );
  });

  it(`MFJ, expired DHS authorization and an ITIN spouse: knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCtcFilerSsnDhsExpired`];
    const { factGraph } = setupFactGraph({
      ...mfjWithChild,
      ...spouseItin,
      ...primaryNonCitizen,
      ...primaryValidity(`validOnlyWithDhsAuthorizationExpired`),
    });
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).get).toBe(true);
  });

  it(`expired DHS authorization with no CTC-age child: no knockout`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCtcFilerSsnDhsExpired`];
    const { factGraph } = setupFactGraph({
      ...noCtcAgeChild,
      ...primaryNonCitizen,
      ...primaryValidity(`validOnlyWithDhsAuthorizationExpired`),
    });
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).complete).toBe(true);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).get).toBe(false);
  });

  it(`unanswered card legend leaves the CTC incomplete rather than false`, ({ task }) => {
    task.meta.testedFactPaths = [`/filerSsnRequirementForCtcMet`, `/familyAndHousehold/*/eligibleCtc`];
    const data: Record<string, unknown> = { ...filerWithChild, ...primaryNonCitizen };
    delete data[`/primaryFilerSsnEmploymentValidity`];
    const { factGraph } = setupFactGraph(data);
    expect(get(factGraph, `/filerSsnRequirementForCtcMet`).complete).toBe(false);
    expect(get(factGraph, `/familyAndHousehold/*/eligibleCtc`, childDependentId).complete).toBe(false);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).complete).toBe(false);
  });

  it(`unanswered card legend with no CTC-age child doesn't leave the knockout incomplete`, ({ task }) => {
    task.meta.testedFactPaths = [`/flowKnockoutCtcFilerSsnDhsExpired`];
    const data: Record<string, unknown> = { ...noCtcAgeChild, ...primaryNonCitizen };
    delete data[`/primaryFilerSsnEmploymentValidity`];
    const { factGraph } = setupFactGraph(data);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).complete).toBe(true);
    expect(get(factGraph, `/flowKnockoutCtcFilerSsnDhsExpired`).get).toBe(false);
  });
});
