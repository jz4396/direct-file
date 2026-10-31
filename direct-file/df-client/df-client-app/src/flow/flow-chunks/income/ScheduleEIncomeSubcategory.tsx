/* eslint-disable max-len */
import { CollectionLoop, Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  CollectionItemManager,
  ContextHeading,
  Dollar,
  DFAlert,
  Enum,
  Heading,
  InfoDisplay,
  KnockoutButton,
  LimitingString,
  SaveAndOrContinueButton,
  IconDisplay,
} from '../../ContentDeclarations.js';
import type { ConditionString } from '../../Condition.js';

/**
 * Schedule E Part I MVP: rental real estate and royalties (#38, spec PR #8; TY2026, filed in 2027).
 * Part I supported: net income with no depreciation and no personal use.
 * A section 162 rental is a Form 8995 line 1 row. Safe harbor, aggregation, and a suspended loss stay stops.
 * Part II supported: domestic partnership or S corporation, nonnegative box 1, material participation.
 * Nonfarm Form 1065 box 14 code A is Schedule SE line 2 (26 U.S.C. 1402(a)) except on a joint return.
 * Part III supported: domestic estate or trust, nonnegative box 6 only, material participation.
 * Box 8 is other rental income (26 U.S.C. 469(c)(2) and 469(c)(4)) and stops the return.
 * Part IV (REMIC, Schedule Q (Form 1066)) is asked of every filer and is an explicit stop.
 * The Schedule K-1 question is asked of every filer, not only after a yes to rental or royalty income
 * (#232, #238, #85). Computations and cites live in backend/src/main/resources/tax/scheduleE.xml.
 */
const knockout = (route: string, condition: ConditionString, key: string) => (
  <Screen route={route} condition={condition} isKnockout={true}>
    <IconDisplay name='ErrorOutline' size={9} isCentered />
    <Heading i18nKey={`/heading/knockout/${key}`} />
    <DFAlert i18nKey={`/info/knockout/${key}`} headingLevel='h2' type='warning' />
    <KnockoutButton i18nKey='button.knockout' />
  </Screen>
);

export const ScheduleEIncomeSubcategory = (
  <Subcategory
    route='schedule-e'
    completeIf='/scheduleESectionIsComplete'
    dataItems={[
      {
        itemKey: `scheduleEHasIncome`,
        conditions: [`/hasScheduleEIncome`],
      },
      {
        itemKey: `scheduleEK1`,
        conditions: [`/scheduleEHasPartIIIncome`],
      },
      {
        itemKey: `scheduleENone`,
        conditions: [
          { operator: `isFalse`, condition: `/hasScheduleEIncome` },
          { operator: `isFalse`, condition: `/scheduleEHasPartIIIncome` },
          { operator: `isFalse`, condition: `/scheduleEHasPartIVIncome` },
        ],
      },
    ]}
  >
    <SubSubcategory route='schedule-e-eligibility'>
      <Screen route='schedule-e-intro'>
        <ContextHeading displayOnlyOn='edit' i18nKey='/heading/income/schedule-e' />
        <Heading i18nKey='/heading/income/schedule-e/intro' />
        <InfoDisplay i18nKey='/info/income/schedule-e/intro' />
        <Boolean path='/hadScheduleEIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-part-ii'>
        <Heading i18nKey='/heading/income/schedule-e/part-ii' />
        <InfoDisplay i18nKey='/info/income/schedule-e/part-ii' />
        <Boolean path='/scheduleEHasPartIIIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-part-ii-line-27' condition='/scheduleEHasPartIIIncome'>
        <Heading i18nKey='/heading/income/schedule-e/part-ii-line-27' />
        <InfoDisplay i18nKey='/info/income/schedule-e/part-ii-line-27' />
        <Boolean path='/scheduleEPartIILine27' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(
        `schedule-e-part-ii-line-27-knockout`,
        `/flowKnockoutScheduleEPartIILine27`,
        `schedule-e-part-ii-line-27`
      )}
      <Screen route='schedule-e-part-iii' condition='/scheduleEHasPartIIIncome'>
        <Heading i18nKey='/heading/income/schedule-e/part-iii' />
        <InfoDisplay i18nKey='/info/income/schedule-e/part-iii' />
        <Boolean path='/scheduleEHasPartIIIIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-estate-intro' condition='/scheduleEHasPartIIIIncome'>
        <Heading i18nKey='/heading/income/schedule-e/estate-intro' />
        <InfoDisplay i18nKey='/info/income/schedule-e/estate-intro' />
        <CollectionItemManager
          path='/scheduleEEstates'
          loopName='/scheduleEEstates'
          donePath='/scheduleEEstatesIsDone'
        />
      </Screen>
      <CollectionLoop
        loopName='/scheduleEEstates'
        collection='/scheduleEEstates'
        iconName='AttachMoney'
        collectionItemCompletedCondition='/scheduleEEstates/*/isComplete'
        donePath='/scheduleEEstatesIsDone'
      >
        <SubSubcategory route='schedule-e-estate'>
          <Screen route='schedule-e-estate-name'>
            <Heading i18nKey='/heading/income/schedule-e/estate-name' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-name' />
            <LimitingString path='/scheduleEEstates/*/entityName' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-estate-scope'>
            <Heading i18nKey='/heading/income/schedule-e/estate-scope' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-scope' />
            <Boolean path='/scheduleEEstates/*/isForeignBeneficiary' />
            <Boolean path='/scheduleEEstates/*/isForeignTrust' />
            <Boolean path='/scheduleEEstates/*/inconsistentTreatment' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-estate-interest-dividends'>
            <Heading i18nKey='/heading/income/schedule-e/estate-interest-dividends' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-interest-dividends' />
            <Dollar path='/scheduleEEstates/*/box1' />
            <Dollar path='/scheduleEEstates/*/box2a' />
            <Dollar path='/scheduleEEstates/*/box2b' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-estate-boxes'>
            <Heading i18nKey='/heading/income/schedule-e/estate-boxes' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-boxes' />
            <Dollar path='/scheduleEEstates/*/box5' />
            <Dollar path='/scheduleEEstates/*/box6' />
            <Dollar path='/scheduleEEstates/*/box7' />
            <Dollar path='/scheduleEEstates/*/box8' />
            <Boolean path='/scheduleEEstates/*/materiallyParticipates' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-estate-other'>
            <Heading i18nKey='/heading/income/schedule-e/estate-other' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-other' />
            <Boolean path='/scheduleEEstates/*/hasOtherK1Amount' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-estate-limits'>
            <Heading i18nKey='/heading/income/schedule-e/estate-limits' />
            <InfoDisplay i18nKey='/info/income/schedule-e/estate-limits' />
            <Boolean path='/scheduleEEstates/*/basisLimitApplies' />
            <Boolean path='/scheduleEEstates/*/anyAmountNotAtRisk' />
            <Boolean path='/scheduleEEstates/*/passiveDeductionOrLoss' />
            <SaveAndOrContinueButton />
          </Screen>
        </SubSubcategory>
      </CollectionLoop>
      {knockout(`schedule-e-part-iii-knockout`, `/flowKnockoutScheduleEPartIII`, `schedule-e-part-iii`)}
      <Screen route='schedule-e-part-iv'>
        <Heading i18nKey='/heading/income/schedule-e/part-iv' />
        <InfoDisplay i18nKey='/info/income/schedule-e/part-iv' />
        <Boolean path='/scheduleEHasPartIVIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(`schedule-e-part-iv-knockout`, `/flowKnockoutScheduleEPartIV`, `schedule-e-part-iv`)}
      <Screen route='schedule-e-k1-intro' condition='/scheduleEHasPartIIIncome'>
        <Heading i18nKey='/heading/income/schedule-e/k1-intro' />
        <InfoDisplay i18nKey='/info/income/schedule-e/k1-intro' />
        <CollectionItemManager path='/scheduleEK1s' loopName='/scheduleEK1s' donePath='/scheduleEK1sIsDone' />
      </Screen>
      <CollectionLoop
        loopName='/scheduleEK1s'
        collection='/scheduleEK1s'
        iconName='AttachMoney'
        collectionItemCompletedCondition='/scheduleEK1s/*/isComplete'
        donePath='/scheduleEK1sIsDone'
      >
        <SubSubcategory route='schedule-e-k1'>
          <Screen route='schedule-e-k1-name'>
            <Heading i18nKey='/heading/income/schedule-e/k1-name' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-name' />
            <LimitingString path='/scheduleEK1s/*/entityName' />
            <Enum path='/scheduleEK1s/*/entityType' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-scope'>
            <Heading i18nKey='/heading/income/schedule-e/k1-scope' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-scope' />
            <Boolean path='/scheduleEK1s/*/isForeignPartnership' />
            <Boolean path='/scheduleEK1s/*/isPubliclyTradedPartnership' />
            <Boolean path='/scheduleEK1s/*/isTradingBusiness' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-box1'>
            <Heading i18nKey='/heading/income/schedule-e/k1-box1' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-box1' />
            <Dollar path='/scheduleEK1s/*/box1' />
            <Boolean path='/scheduleEK1s/*/materiallyParticipates' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-box14'>
            <Heading i18nKey='/heading/income/schedule-e/k1-box14' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-box14' />
            <Dollar path='/scheduleEK1s/*/box14CodeA' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-box14-scope' condition='/scheduleEK1s/*/isPartnership'>
            <Heading i18nKey='/heading/income/schedule-e/k1-box14-scope' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-box14-scope' />
            <Boolean path='/scheduleEK1s/*/box14CodeAWasReduced' />
            <Boolean path='/scheduleEK1s/*/box14CodeAIsFarm' />
            <Boolean path='/scheduleEK1s/*/box14CodeANotLimitedPartnerAmount' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-other'>
            <Heading i18nKey='/heading/income/schedule-e/k1-other' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-other' />
            <Boolean path='/scheduleEK1s/*/hasQbiStatement' />
            <Boolean path='/scheduleEK1s/*/hasOtherK1Amount' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-k1-columns'>
            <Heading i18nKey='/heading/income/schedule-e/k1-columns' />
            <InfoDisplay i18nKey='/info/income/schedule-e/k1-columns' />
            <Boolean path='/scheduleEK1s/*/basisComputationRequired' />
            <Boolean path='/scheduleEK1s/*/anyAmountNotAtRisk' />
            <SaveAndOrContinueButton />
          </Screen>
        </SubSubcategory>
      </CollectionLoop>
      {knockout(`schedule-e-part-ii-knockout`, `/flowKnockoutScheduleEPartII`, `schedule-e-part-ii`)}
      {knockout(`schedule-e-k1-qbi-knockout`, `/flowKnockoutScheduleCQbiAndK1Box14CodeA`, `schedule-c-k1-box14`)}
      <Screen route='schedule-e-substantial-services' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/substantial-services' />
        <InfoDisplay i18nKey='/info/income/schedule-e/substantial-services' />
        <Boolean path='/scheduleEProvidesSubstantialServices' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(
        `schedule-e-substantial-services-knockout`,
        `/flowKnockoutScheduleESubstantialServices`,
        `schedule-e-substantial-services`
      )}
      <Screen route='schedule-e-personal-use' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/personal-use' />
        <InfoDisplay i18nKey='/info/income/schedule-e/personal-use' />
        <Boolean path='/scheduleEHasPersonalUse' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(`schedule-e-personal-use-knockout`, `/flowKnockoutScheduleEPersonalUse`, `schedule-e-personal-use`)}
      <Screen route='schedule-e-depreciation' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/depreciation' />
        <InfoDisplay i18nKey='/info/income/schedule-e/depreciation' />
        <Boolean path='/scheduleEHasDepreciation' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(`schedule-e-depreciation-knockout`, `/flowKnockoutScheduleEDepreciation`, `schedule-e-depreciation`)}
      <Screen route='schedule-e-trade-or-business' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/trade-or-business' />
        <InfoDisplay i18nKey='/info/income/schedule-e/trade-or-business' />
        <Boolean path='/scheduleERentalIsTradeOrBusiness' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-properties' condition='/scheduleERentalIsTradeOrBusiness'>
        <Heading i18nKey='/heading/income/schedule-e/properties' />
        <InfoDisplay i18nKey='/info/income/schedule-e/properties' />
        <CollectionItemManager
          path='/scheduleEProperties'
          loopName='/scheduleEProperties'
          donePath='/scheduleEPropertiesIsDone'
        />
      </Screen>
      <CollectionLoop
        loopName='/scheduleEProperties'
        collection='/scheduleEProperties'
        iconName='AttachMoney'
        collectionItemCompletedCondition='/scheduleEProperties/*/isComplete'
        donePath='/scheduleEPropertiesIsDone'
      >
        <SubSubcategory route='schedule-e-property'>
          <Screen route='schedule-e-property-name'>
            <Heading i18nKey='/heading/income/schedule-e/property-name' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-name' />
            <LimitingString path='/scheduleEProperties/*/propertyName' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-property-amounts'>
            <Heading i18nKey='/heading/income/schedule-e/property-amounts' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-amounts' />
            <Dollar path='/scheduleEProperties/*/writableRents' />
            <Dollar path='/scheduleEProperties/*/writableRoyalties' />
            <Dollar path='/scheduleEProperties/*/writableExpenses' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-property-participation'>
            <Heading i18nKey='/heading/income/schedule-e/property-participation' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-participation' />
            <Boolean path='/scheduleEProperties/*/materiallyParticipates' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-property-safe-harbor'>
            <Heading i18nKey='/heading/income/schedule-e/property-safe-harbor' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-safe-harbor' />
            <Boolean path='/scheduleEProperties/*/reliesOnRp201938SafeHarbor' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-property-aggregation'>
            <Heading i18nKey='/heading/income/schedule-e/property-aggregation' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-aggregation' />
            <Boolean path='/scheduleEProperties/*/isAggregated' />
            <SaveAndOrContinueButton />
          </Screen>
          <Screen route='schedule-e-property-suspended'>
            <Heading i18nKey='/heading/income/schedule-e/property-suspended' />
            <InfoDisplay i18nKey='/info/income/schedule-e/property-suspended' />
            <Boolean path='/scheduleEProperties/*/hasSuspendedPassiveLoss' />
            <SaveAndOrContinueButton />
          </Screen>
        </SubSubcategory>
      </CollectionLoop>
      <Screen route='schedule-e-qbi-carryforward' condition='/scheduleERentalIsTradeOrBusiness'>
        <Heading i18nKey='/heading/income/schedule-e/qbi-carryforward' />
        <InfoDisplay i18nKey='/info/income/schedule-e/qbi-carryforward' />
        <Boolean path='/qbiHasPriorYearLossCarryforward' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-qbi-cooperative' condition='/scheduleERentalIsTradeOrBusiness'>
        <Heading i18nKey='/heading/income/schedule-e/qbi-cooperative' />
        <InfoDisplay i18nKey='/info/income/schedule-e/qbi-cooperative' />
        <Boolean path='/qbiIsCooperativePatron' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(
        `schedule-e-trade-or-business-knockout`,
        `/flowKnockoutScheduleETradeOrBusinessQbi`,
        `schedule-e-trade-or-business`
      )}
      {knockout(`schedule-e-qbi-limit-knockout`, `/scheduleEShowsQbiLimitKnockout`, `schedule-e-qbi-limit`)}
    </SubSubcategory>
    <SubSubcategory route='schedule-e-amounts'>
      <Screen route='schedule-e-amounts' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/amounts' />
        <InfoDisplay i18nKey='/info/income/schedule-e/amounts' />
        <Dollar path='/scheduleEWritableRents' />
        <Dollar path='/scheduleEWritableRoyalties' />
        <Dollar path='/scheduleEWritableExpenses' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-e-any-loss' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/any-loss' />
        <InfoDisplay i18nKey='/info/income/schedule-e/any-loss' />
        <Boolean path='/scheduleEAnyPropertyLoss' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(`schedule-e-loss-knockout`, `/flowKnockoutScheduleELoss`, `schedule-e-loss`)}
      {knockout(`schedule-e-eitc-knockout`, `/flowKnockoutScheduleEEitc`, `schedule-e-eitc`)}
    </SubSubcategory>
  </Subcategory>
);
