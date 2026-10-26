/* eslint-disable max-len */
import { CollectionLoop, Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  CollectionItemManager,
  CollectionItemReference,
  ContextHeading,
  Dollar,
  DFAlert,
  GenericString,
  Heading,
  InfoDisplay,
  KnockoutButton,
  LimitingString,
  MultiEnum,
  SaveAndOrContinueButton,
  IconDisplay,
} from '../../ContentDeclarations.js';

/**
 * Schedule C interview: Part I income, supported Part II lines, and up to three Part V lines.
 * Computations and cites live in scheduleC.xml.
 */
export const ScheduleCIncomeSubcategory = (
  <Subcategory
    route='schedule-c'
    completeIf='/scheduleCSectionIsComplete'
    collectionContext='/scheduleCBusinesses'
    dataItems={[
      {
        itemKey: `scheduleCHasBusiness`,
        conditions: [`/hasScheduleCBusinesses`],
      },
      {
        itemKey: `scheduleCNone`,
        conditions: [{ operator: `isFalse`, condition: `/hasScheduleCBusinesses` }],
      },
    ]}
  >
    <SubSubcategory route='schedule-c-eligibility'>
      <Screen route='schedule-c-intro'>
        <ContextHeading displayOnlyOn='edit' i18nKey='/heading/income/schedule-c' />
        <Heading i18nKey='/heading/income/schedule-c/intro' />
        <InfoDisplay i18nKey='/info/income/schedule-c/intro' />
        <Boolean path='/hadSelfEmploymentIncome' />
        <SaveAndOrContinueButton />
      </Screen>

      <Screen route='schedule-c-qbi-carryforward' condition='/hadSelfEmploymentIncome'>
        <Heading i18nKey='/heading/income/schedule-c/qbi-carryforward' />
        <InfoDisplay i18nKey='/info/income/schedule-c/qbi-carryforward' />
        <Boolean path='/qbiHasPriorYearLossCarryforward' />
        <SaveAndOrContinueButton />
      </Screen>

      <Screen route='schedule-c-qbi-cooperative' condition='/hadSelfEmploymentIncome'>
        <Heading i18nKey='/heading/income/schedule-c/qbi-cooperative' />
        <InfoDisplay i18nKey='/info/income/schedule-c/qbi-cooperative' />
        <Boolean path='/qbiIsCooperativePatron' />
        <SaveAndOrContinueButton />
      </Screen>

      <Screen route='schedule-c-qbi-knockout' condition='/flowKnockoutScheduleCQbi' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/schedule-c-qbi' />
        <DFAlert i18nKey='/info/knockout/schedule-c-qbi' headingLevel='h2' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>

    <Screen route='schedule-c-loop-intro' condition='/hadSelfEmploymentIncome'>
      <Heading i18nKey='/heading/income/schedule-c/loop-intro' />
      <InfoDisplay i18nKey='/info/income/schedule-c/loop-intro' />
      <CollectionItemManager
        path='/scheduleCBusinesses'
        loopName='/scheduleCBusinesses'
        donePath='/scheduleCBusinessesIsDone'
      />
    </Screen>

    <CollectionLoop
      loopName='/scheduleCBusinesses'
      collection='/scheduleCBusinesses'
      iconName='AttachMoney'
      collectionItemCompletedCondition='/scheduleCBusinesses/*/isComplete'
      donePath='/scheduleCBusinessesIsDone'
    >
      <SubSubcategory route='schedule-c-business'>
        <Screen route='schedule-c-business-basics'>
          <Heading i18nKey='/heading/income/schedule-c/business-basics' />
          <CollectionItemReference path='/scheduleCBusinesses/*/filer' displayOnlyOn='edit' />
          <GenericString path='/scheduleCBusinesses/*/filer/fullName' displayOnlyOn='data-view' />
          <LimitingString path='/scheduleCBusinesses/*/businessName' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-i'>
          <Heading i18nKey='/heading/income/schedule-c/part-i' />
          <InfoDisplay i18nKey='/info/income/schedule-c/part-i' />
          <Dollar path='/scheduleCBusinesses/*/writableGrossReceipts' />
          <Dollar path='/scheduleCBusinesses/*/writableReturnsAndAllowances' />
          <Dollar path='/scheduleCBusinesses/*/writableOtherIncome' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-other-income-form' condition='/scheduleCBusinesses/*/otherIncomeAboveZero'>
          <Heading i18nKey='/heading/income/schedule-c/other-income-form' />
          <InfoDisplay i18nKey='/info/income/schedule-c/other-income-form' />
          <Boolean path='/scheduleCBusinesses/*/otherIncomeNeedsAnotherForm' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-inventory'>
          <Heading i18nKey='/heading/income/schedule-c/inventory' />
          <InfoDisplay i18nKey='/info/income/schedule-c/inventory' />
          <Boolean path='/scheduleCBusinesses/*/hasInventoryOrCogs' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-vehicle'>
          <Heading i18nKey='/heading/income/schedule-c/vehicle' />
          <InfoDisplay i18nKey='/info/income/schedule-c/vehicle' />
          <Boolean path='/scheduleCBusinesses/*/hasCarTruckOrVehicleLoan' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-depreciation'>
          <Heading i18nKey='/heading/income/schedule-c/depreciation' />
          <InfoDisplay i18nKey='/info/income/schedule-c/depreciation' />
          <Boolean path='/scheduleCBusinesses/*/hasDepreciationOrSection179' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-depletion'>
          <Heading i18nKey='/heading/income/schedule-c/depletion' />
          <InfoDisplay i18nKey='/info/income/schedule-c/depletion' />
          <Boolean path='/scheduleCBusinesses/*/hasDepletion' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-equipment-rent'>
          <Heading i18nKey='/heading/income/schedule-c/equipment-rent' />
          <InfoDisplay i18nKey='/info/income/schedule-c/equipment-rent' />
          <Boolean path='/scheduleCBusinesses/*/hasVehicleMachineryEquipmentRent' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-home-office'>
          <Heading i18nKey='/heading/income/schedule-c/home-office' />
          <InfoDisplay i18nKey='/info/income/schedule-c/home-office' />
          <Boolean path='/scheduleCBusinesses/*/hasHomeOffice' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-energy'>
          <Heading i18nKey='/heading/income/schedule-c/energy' />
          <InfoDisplay i18nKey='/info/income/schedule-c/energy' />
          <Boolean path='/scheduleCBusinesses/*/hasEnergyEfficientBuildingsDeduction' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-has-expenses'>
          <Heading i18nKey='/heading/income/schedule-c/has-expenses' />
          <InfoDisplay i18nKey='/info/income/schedule-c/has-expenses' />
          <Boolean path='/scheduleCBusinesses/*/hasDeductibleExpenses' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-which-expenses' condition='/scheduleCBusinesses/*/hasDeductibleExpenses'>
          <Heading i18nKey='/heading/income/schedule-c/which-expenses' />
          <InfoDisplay i18nKey='/info/income/schedule-c/which-expenses' />
          <MultiEnum path='/scheduleCBusinesses/*/expenseLinesChosen' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-expense-amounts' condition='/scheduleCBusinesses/*/hasSelectedExpenseLines'>
          <Heading i18nKey='/heading/income/schedule-c/expense-amounts' />
          <InfoDisplay i18nKey='/info/income/schedule-c/expense-amounts' />
          <Dollar path='/scheduleCBusinesses/*/writableAdvertising' condition='/scheduleCBusinesses/*/choseAdvertising' />
          <Dollar
            path='/scheduleCBusinesses/*/writableCommissionsAndFees'
            condition='/scheduleCBusinesses/*/choseCommissionsAndFees'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableContractLabor'
            condition='/scheduleCBusinesses/*/choseContractLabor'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableEmployeeBenefitPrograms'
            condition='/scheduleCBusinesses/*/choseEmployeeBenefitPrograms'
          />
          <Dollar path='/scheduleCBusinesses/*/writableInsurance' condition='/scheduleCBusinesses/*/choseInsurance' />
          <Dollar
            path='/scheduleCBusinesses/*/writableMortgageInterest'
            condition='/scheduleCBusinesses/*/choseMortgageInterest'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableOtherInterest'
            condition='/scheduleCBusinesses/*/choseOtherInterest'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableLegalAndProfessional'
            condition='/scheduleCBusinesses/*/choseLegalAndProfessional'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableOfficeExpense'
            condition='/scheduleCBusinesses/*/choseOfficeExpense'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writablePensionAndProfitSharing'
            condition='/scheduleCBusinesses/*/chosePensionAndProfitSharing'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableRentOtherBusinessProperty'
            condition='/scheduleCBusinesses/*/choseRentOtherBusinessProperty'
          />
          <Dollar
            path='/scheduleCBusinesses/*/writableRepairsAndMaintenance'
            condition='/scheduleCBusinesses/*/choseRepairsAndMaintenance'
          />
          <Dollar path='/scheduleCBusinesses/*/writableSupplies' condition='/scheduleCBusinesses/*/choseSupplies' />
          <Dollar
            path='/scheduleCBusinesses/*/writableTaxesAndLicenses'
            condition='/scheduleCBusinesses/*/choseTaxesAndLicenses'
          />
          <Dollar path='/scheduleCBusinesses/*/writableTravel' condition='/scheduleCBusinesses/*/choseTravel' />
          <Dollar path='/scheduleCBusinesses/*/writableMeals' condition='/scheduleCBusinesses/*/choseMeals' />
          <Dollar path='/scheduleCBusinesses/*/writableUtilities' condition='/scheduleCBusinesses/*/choseUtilities' />
          <Dollar path='/scheduleCBusinesses/*/writableWages' condition='/scheduleCBusinesses/*/choseWages' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-meals-limit' condition='/scheduleCBusinesses/*/choseMeals'>
          <Heading i18nKey='/heading/income/schedule-c/meals-limit' />
          <InfoDisplay i18nKey='/info/income/schedule-c/meals-limit' />
          <Boolean path='/scheduleCBusinesses/*/mealsAreStandardHalfLimit' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-wage-credits' condition='/scheduleCBusinesses/*/choseWages'>
          <Heading i18nKey='/heading/income/schedule-c/wage-credits' />
          <InfoDisplay i18nKey='/info/income/schedule-c/wage-credits' />
          <Boolean path='/scheduleCBusinesses/*/wagesReducedByEmploymentCredits' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-interest-allocation' condition='/scheduleCBusinesses/*/choseMortgageOrOtherInterest'>
          <Heading i18nKey='/heading/income/schedule-c/interest-allocation' />
          <InfoDisplay i18nKey='/info/income/schedule-c/interest-allocation' />
          <Boolean path='/scheduleCBusinesses/*/interestNeedsAllocation' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-amortization' condition='/scheduleCBusinesses/*/choseOtherExpenses'>
          <Heading i18nKey='/heading/income/schedule-c/amortization' />
          <InfoDisplay i18nKey='/info/income/schedule-c/amortization' />
          <Boolean path='/scheduleCBusinesses/*/partVIncludesNewAmortization' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-1' condition='/scheduleCBusinesses/*/choseOtherExpenses'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-1' />
          <InfoDisplay i18nKey='/info/income/schedule-c/part-v' />
          <LimitingString path='/scheduleCBusinesses/*/partV1Description' />
          <Dollar path='/scheduleCBusinesses/*/partV1Amount' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-another' condition='/scheduleCBusinesses/*/choseOtherExpenses'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-another' />
          <Boolean path='/scheduleCBusinesses/*/hasAnotherPartVExpense' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-2' condition='/scheduleCBusinesses/*/hasAnotherPartVExpense'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-2' />
          <LimitingString path='/scheduleCBusinesses/*/partV2Description' />
          <Dollar path='/scheduleCBusinesses/*/partV2Amount' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-another-2' condition='/scheduleCBusinesses/*/hasAnotherPartVExpense'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-another-2' />
          <Boolean path='/scheduleCBusinesses/*/hasAnotherPartVExpense2' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-3' condition='/scheduleCBusinesses/*/hasAnotherPartVExpense2'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-3' />
          <LimitingString path='/scheduleCBusinesses/*/partV3Description' />
          <Dollar path='/scheduleCBusinesses/*/partV3Amount' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-part-v-more' condition='/scheduleCBusinesses/*/hasAnotherPartVExpense2'>
          <Heading i18nKey='/heading/income/schedule-c/part-v-more' />
          <InfoDisplay i18nKey='/info/income/schedule-c/part-v-more' />
          <Boolean path='/scheduleCBusinesses/*/hasMorePartVExpenses' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-material-participation'>
          <Heading i18nKey='/heading/income/schedule-c/material-participation' />
          <InfoDisplay i18nKey='/info/income/schedule-c/material-participation' />
          <Boolean path='/scheduleCBusinesses/*/materiallyParticipates' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-at-risk' condition='/scheduleCBusinesses/*/hasLoss'>
          <Heading i18nKey='/heading/income/schedule-c/at-risk' />
          <InfoDisplay i18nKey='/info/income/schedule-c/at-risk' />
          <Boolean path='/scheduleCBusinesses/*/allInvestmentAtRisk' />
          <SaveAndOrContinueButton />
        </Screen>
      </SubSubcategory>
    </CollectionLoop>

    <Screen route='schedule-c-out-of-scope-knockout' condition='/flowKnockoutScheduleCOutOfScope' isKnockout={true}>
      <IconDisplay name='ErrorOutline' size={9} isCentered />
      <Heading i18nKey='/heading/knockout/schedule-c-out-of-scope' />
      <DFAlert i18nKey='/info/knockout/schedule-c-out-of-scope' headingLevel='h2' type='warning' />
      <KnockoutButton i18nKey='button.knockout' />
    </Screen>

    <Screen
      route='schedule-c-qbi-participation-knockout'
      condition='/flowKnockoutQbiMixedParticipation'
      isKnockout={true}
    >
      <IconDisplay name='ErrorOutline' size={9} isCentered />
      <Heading i18nKey='/heading/knockout/schedule-c-qbi' />
      <DFAlert i18nKey='/info/knockout/schedule-c-qbi' headingLevel='h2' type='warning' />
      <KnockoutButton i18nKey='button.knockout' />
    </Screen>
  </Subcategory>
);
