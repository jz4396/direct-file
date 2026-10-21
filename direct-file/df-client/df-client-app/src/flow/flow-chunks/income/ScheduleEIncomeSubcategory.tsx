/* eslint-disable max-len */
import { Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  ContextHeading,
  Dollar,
  DFAlert,
  Heading,
  InfoDisplay,
  KnockoutButton,
  SaveAndOrContinueButton,
  IconDisplay,
} from '../../ContentDeclarations.js';
import type { ConditionString } from '../../Condition.js';

/**
 * Schedule E Part I MVP: rental real estate and royalties (#38, spec PR #8; TY2026, filed in 2027).
 * Supported: net income with no depreciation, no personal use, no K-1 income. Everything else knocks out.
 * Computations and cites live in backend/src/main/resources/tax/scheduleE.xml.
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
        itemKey: `scheduleENone`,
        conditions: [{ operator: `isFalse`, condition: `/hasScheduleEIncome` }],
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
      <Screen route='schedule-e-part-ii' condition='/hasScheduleEIncome'>
        <Heading i18nKey='/heading/income/schedule-e/part-ii' />
        <Boolean path='/scheduleEHasPartIIIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      {knockout(`schedule-e-part-ii-knockout`, `/flowKnockoutScheduleEPartII`, `schedule-e-part-ii`)}
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
