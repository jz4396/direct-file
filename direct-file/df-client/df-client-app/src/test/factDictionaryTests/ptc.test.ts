import { it, describe, expect } from 'vitest';
import { Path } from '../../flow/Path.js';
import { createBooleanWrapper, createEnumWrapper } from '../persistenceWrappers.js';
import { makeW2Data, mfjFilerData, primaryFilerId, singleFilerData, spouseId } from '../testData.js';
import { setupFactGraph } from '../setupFactGraph.js';

describe(`Premium tax credit`, () => {
  const ptcSingleFiler = {
    ...singleFilerData,
    [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(false),
  };
  describe(`allocations KO`, () => {
    it(`true if basic conditions met`, ({ task }) => {
      task.meta.testedFactPaths = [`/needsAllocations`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(true),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(true),
      });
      expect(factGraph.get(Path.concretePath(`/needsAllocations`, null)).get).toBe(true);
    });

    it(`false if edited to no longer have qualifying plan`, ({ task }) => {
      task.meta.testedFactPaths = [`/needsAllocations`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(false),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(true),
      });

      expect(factGraph.get(Path.concretePath(`/needsAllocations`, null)).get).toBe(false);
    });

    it(`false if edited to no longer be eligible for ptc`, ({ task }) => {
      task.meta.testedFactPaths = [`/needsAllocations`];
      const { factGraph } = setupFactGraph({
        ...mfjFilerData,
        [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
        [`/filers/#${primaryFilerId}/potentialClaimerMustFile`]: createBooleanWrapper(true),
        '/maritalStatus': createEnumWrapper(`married`, `/maritalStatusOptions`),
        '/filingStatusChoice': createEnumWrapper(`wantsMarriedFilingJointly`, `/filingStatusInitialOptions`),
        [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
        [`/filers/#${spouseId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
        [`/MFJRequiredToFile`]: createBooleanWrapper(false),
        [`/MFJDependentsFilingForCredits`]: createBooleanWrapper(false),
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(true),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(true),
      });

      expect(factGraph.get(Path.concretePath(`/needsAllocations`, null)).get).toBe(false);
      expect(factGraph.get(Path.concretePath(`/maybeEligibleForPtc`, null)).get).toBe(false);
    });

    it(`incomplete if enrollee-not-part-of-tax-family screen is incomplete`, ({ task }) => {
      task.meta.testedFactPaths = [`/needsAllocations`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(true),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(true),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(true),
      });

      expect(factGraph.get(Path.concretePath(`/needsAllocations`, null)).complete).toBe(false);
      expect(
        factGraph.get(Path.concretePath(`/writableIsAdditionalPersonPartofDifferentTaxFamily`, null)).complete
      ).toBe(false);
    });
  });

  describe(`employer-sponsored plan KO`, () => {
    const basicSetupForEmployerSponsorPlanKo = {
      ...ptcSingleFiler,
      [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(true),
      [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
      [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(false),
      [`/writableHasEmployerSponsoredPlan`]: createBooleanWrapper(true),
    };

    it(`true if basic conditions met`, ({ task }) => {
      task.meta.testedFactPaths = [`/hasEmployerSponsoredPlan`];
      const { factGraph } = setupFactGraph({
        ...basicSetupForEmployerSponsorPlanKo,
      });
      expect(factGraph.get(Path.concretePath(`/hasEmployerSponsoredPlan`, null)).get).toBe(true);
    });

    it(`true regardless of APTC`, ({ task }) => {
      task.meta.testedFactPaths = [`/hasEmployerSponsoredPlan`];
      const { factGraph } = setupFactGraph({
        ...basicSetupForEmployerSponsorPlanKo,
        [`/writableHasAdvancedPtc`]: createBooleanWrapper(true),
      });
      expect(factGraph.get(Path.concretePath(`/hasEmployerSponsoredPlan`, null)).get).toBe(true);

      const { factGraph: factGraph2 } = setupFactGraph({
        ...basicSetupForEmployerSponsorPlanKo,
        [`/writableHasAdvancedPtc`]: createBooleanWrapper(false),
      });
      expect(factGraph2.get(Path.concretePath(`/hasEmployerSponsoredPlan`, null)).get).toBe(true);
    });

    it(`false when not eligible because of qualifying plan`, ({ task }) => {
      task.meta.testedFactPaths = [`/hasEmployerSponsoredPlan`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(false),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(false),
        [`/writableHasAdvancedPtc`]: createBooleanWrapper(false),
        [`/writableHasEmployerSponsoredPlan`]: createBooleanWrapper(true),
      });
      expect(factGraph.get(Path.concretePath(`/hasEmployerSponsoredPlan`, null)).get).toBe(false);
    });

    it(`false when not eligible because of not eligible for PTC`, ({ task }) => {
      task.meta.testedFactPaths = [`/hasEmployerSponsoredPlan`];
      const { factGraph } = setupFactGraph({
        ...mfjFilerData,
        [`/filers/#${primaryFilerId}/canBeClaimed`]: createBooleanWrapper(true),
        [`/filers/#${primaryFilerId}/potentialClaimerMustFile`]: createBooleanWrapper(true),
        '/maritalStatus': createEnumWrapper(`married`, `/maritalStatusOptions`),
        '/filingStatusChoice': createEnumWrapper(`wantsMarriedFilingJointly`, `/filingStatusInitialOptions`),
        [`/filers/#${spouseId}/canBeClaimed`]: createBooleanWrapper(false),
        [`/filers/#${spouseId}/isUsCitizenFullYear`]: createBooleanWrapper(true),
        [`/MFJRequiredToFile`]: createBooleanWrapper(false),
        [`/MFJDependentsFilingForCredits`]: createBooleanWrapper(false),
        [`/writableHasPtcQualifyingPlan`]: createBooleanWrapper(true),
        [`/writableIsAdditionalPersonInEnrollmentFamily`]: createBooleanWrapper(false),
        [`/writableIsEnrolledWithOtherFamily`]: createBooleanWrapper(false),
        [`/writableHasAdvancedPtc`]: createBooleanWrapper(false),
        [`/writableHasEmployerSponsoredPlan`]: createBooleanWrapper(true),
      });
      expect(factGraph.get(Path.concretePath(`/hasEmployerSponsoredPlan`, null)).get).toBe(false);
    });
  });

  describe(`FederalPovertyLevelPct Form 8962, Line 5`, () => {
    it(`calculates correct value`, ({ task }) => {
      // This test is brittle and will break next tax year when the values changes. The intent was to test a specific
      // edge case where the numbers caused incorrect rounding previously. This was fixed by adding an explicit
      // truncate function. Feel free to delete when these tests fail
      task.meta.testedFactPaths = [`/householdIncomeAsPercent`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        ...makeW2Data(7511),
      });
      // #91: TY2026 uses the 2025 HHS poverty guidelines, 90 FR 5917 (Jan. 17, 2025),
      // https://www.govinfo.gov/content/pkg/FR-2025-01-17/pdf/2025-01377.pdf p. 5917: "$15,650" for one person.
      expect(factGraph.get(Path.concretePath(`/federalPovertyLevelThreshold`, null)).get.toString()).toBe(`15650.00`);
      // calculates 7511 * 100 / 15650 = 47.9936... which should be truncated to give 47, not rounded to 48
      expect(factGraph.get(Path.concretePath(`/householdIncomeAsPercent`, null)).get).toBe(47);
    });
  });

  describe(`ptcAnnualContributionAmount Form 8962, Line 8a`, () => {
    it(`calculates correct value`, ({ task }) => {
      // This test is brittle and will break next tax year when the values changes. The intent was to test a specific
      // edge case where the numbers caused incorrect rounding previously. This was fixed by adding an explicit
      // truncate function. Feel free to delete when these tests fail
      task.meta.testedFactPaths = [`/ptcAnnualContributionAmount`];
      const { factGraph } = setupFactGraph({
        ...ptcSingleFiler,
        ...makeW2Data(38337),
      });
      // #91: 38337 * 100 / 15650 (2025 HHS guideline, 90 FR 5917 p. 5917) = 244.96, truncated to 244%. The
      // applicable percentage table is still the TY2024 one (ptc.xml /applicableFigure: from 150% to 300% of the
      // poverty line, 0.04% for each percentage point over 150%; see /flowKnockoutPtcTy2026RulesNotImplemented):
      // (244 - 150) x 0.0004 = 0.0376.
      expect(factGraph.get(Path.concretePath(`/formattedApplicableFigure`, null)).get).toBe(`0.0376`);
      // calculates Round(38337 * 0.0376) = Round(1441.4712), which rounds down
      expect(factGraph.get(Path.concretePath(`/ptcAnnualContributionAmount`, null)).get.toString()).toBe(`1441.00`);
    });
  });
});
