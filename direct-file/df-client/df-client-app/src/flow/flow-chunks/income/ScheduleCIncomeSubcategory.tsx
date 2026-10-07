/* eslint-disable max-len */
import { CollectionLoop, Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  CollectionItemManager,
  CollectionItemReference,
  ContextHeading,
  Dollar,
  DFAlert,
  Heading,
  InfoDisplay,
  KnockoutButton,
  LimitingString,
  SaveAndOrContinueButton,
  IconDisplay,
} from '../../ContentDeclarations.js';

/**
 * MVP Schedule C + SE interview (gap PR #3).
 * Computations + cites live in scheduleC.xml / docs/tax/IMPLEMENTATION-SCHEDULE-C.md.
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
    <Screen route='schedule-c-intro'>
      <ContextHeading displayOnlyOn='edit' i18nKey='/heading/income/schedule-c' />
      <Heading i18nKey='/heading/income/schedule-c/intro' />
      <InfoDisplay i18nKey='/info/income/schedule-c/intro' />
      <Boolean path='/hadSelfEmploymentIncome' />
      <SaveAndOrContinueButton />
    </Screen>

    <Screen route='schedule-c-qbi' condition='/hadSelfEmploymentIncome'>
      <Heading i18nKey='/heading/income/schedule-c/qbi' />
      <InfoDisplay i18nKey='/info/income/schedule-c/qbi' />
      <Boolean path='/wantsQbiDeduction' />
      <SaveAndOrContinueButton />
    </Screen>

    <Screen
      route='schedule-c-qbi-knockout'
      condition='/flowKnockoutScheduleCQbi'
      isKnockout={true}
    >
      <IconDisplay name='ErrorOutline' size={9} isCentered />
      <Heading i18nKey='/heading/knockout/schedule-c-qbi' />
      <DFAlert i18nKey='/info/knockout/schedule-c-qbi' headingLevel='h2' type='warning' />
      <KnockoutButton i18nKey='button.knockout' />
    </Screen>

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
          <CollectionItemReference path='/scheduleCBusinesses/*/filer' />
          <LimitingString path='/scheduleCBusinesses/*/businessName' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='schedule-c-amounts'>
          <Heading i18nKey='/heading/income/schedule-c/amounts' />
          <InfoDisplay i18nKey='/info/income/schedule-c/amounts' />
          <Dollar path='/scheduleCBusinesses/*/writableGrossReceipts' />
          <Dollar path='/scheduleCBusinesses/*/writableTotalExpenses' />
          <SaveAndOrContinueButton />
        </Screen>
      </SubSubcategory>
    </CollectionLoop>
  </Subcategory>
);
