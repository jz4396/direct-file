/* eslint-disable max-len */
import { CollectionLoop, Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  CollectionItemManager,
  CollectionItemReference,
  ContextHeading,
  DFAlert,
  Dollar,
  GenericString,
  Heading,
  IconDisplay,
  InfoDisplay,
  KnockoutButton,
  LimitingString,
  SaveAndOrContinueButton,
  SetFactAction,
  TaxReturnAlert,
} from '../../ContentDeclarations.js';
import type { ConditionString } from '../../Condition.js';

/**
 * Form 1099-DIV interview (#86): boxes 1a, 1b, 2a, 3, 4, 5, 7, 12 and 13.
 * Form 1040 line 3b = box 1a, line 3a = box 1b, line 7a or Schedule D line 13 = box 2a, line 25b includes box 4,
 * line 2a includes box 12. Qualified REIT dividends in box 5 are Form 8995 line 6 (26 U.S.C. 199A(b)(1)(B)). A no
 * to the 45-day holding period stops the return (26 CFR 1.199A-3(c)(2)(ii)). Box 13 is Form 6251 line 2g
 * (26 U.S.C. 57(a)(5)) and cannot exceed box 12. Every other box, and every case that can't be computed yet,
 * stops the return.
 * Computations and cites live in backend/src/main/resources/tax/dividends.xml.
 */
const knockout = (route: string, condition: ConditionString, key: string) => (
  <Screen route={route} condition={condition} isKnockout={true}>
    <IconDisplay name='ErrorOutline' size={9} isCentered />
    <Heading i18nKey={`/heading/knockout/${key}`} />
    <DFAlert i18nKey={`/info/knockout/${key}`} headingLevel='h2' type='warning' />
    <KnockoutButton i18nKey='button.knockout' />
  </Screen>
);

export const DividendIncomeSubcategory = (
  <Subcategory
    route='dividends'
    completeIf='/dividendReportsIsDone'
    collectionContext='/dividendReports'
    dataItems={[
      {
        itemKey: `dividendsTaxable`,
        conditions: [`/hasDividendIncome`],
      },
      {
        itemKey: `dividendsNone`,
        conditions: [{ operator: `isFalse`, condition: `/hasDividendIncome` }],
      },
    ]}
  >
    <Screen route='div-income-loop-intro'>
      <ContextHeading
        displayOnlyOn='edit'
        i18nKey='/heading/income/dividends'
        condition={{ operator: `isFalseOrIncomplete`, condition: `/hasDividendReports` }}
      />
      <Heading i18nKey='/heading/income/dividends' condition='/hasDividendReports' />
      <Heading
        i18nKey='/heading/income/dividends/intro'
        condition={{ operator: `isFalseOrIncomplete`, condition: `/hasDividendReports` }}
      />
      <InfoDisplay i18nKey='/info/income/dividends/intro' />
      <CollectionItemManager path='/dividendReports' loopName='/dividendReports' donePath='/dividendReportsIsDone' />
    </Screen>
    <CollectionLoop
      loopName='/dividendReports'
      collection='/dividendReports'
      iconName='AttachMoney'
      collectionItemCompletedCondition='/dividendReports/*/isComplete'
      donePath='/dividendReportsIsDone'
      dataViewSections={[
        {
          i18nKey: `dataviews./flow/income/dividends.primaryFiler`,
          condition: `/dividendReports/*/filer/isPrimaryFiler`,
        },
        {
          i18nKey: `dataviews./flow/income/dividends.secondaryFiler`,
          condition: `/dividendReports/*/filer/isSecondaryFiler`,
        },
      ]}
    >
      <SubSubcategory route='div-income-basic-info'>
        <Screen route='1099-div-add-whose' condition='/isFilingStatusMFJ'>
          <TaxReturnAlert
            i18nKey='/info/income/dividends/secondary-filer-income-without-mfj'
            headingLevel='h3'
            type='error'
            condition='/dividendReports/*/secondaryFilerUsedWithoutMFJ'
          />
          <Heading i18nKey='/heading/income/dividends/add-whose' />
          <CollectionItemReference path='/dividendReports/*/filer' displayOnlyOn='edit' />
          <GenericString path='/dividendReports/*/filer/fullName' displayOnlyOn='data-view' />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-payer'>
          <TaxReturnAlert
            i18nKey='/info/income/dividends/secondary-filer-income-without-mfj'
            headingLevel='h3'
            type='error'
            condition='/dividendReports/*/secondaryFilerUsedWithoutMFJ'
          />
          <Heading i18nKey='/heading/income/dividends/payer' />
          <InfoDisplay i18nKey='/info/income/dividends/payer' />
          <SetFactAction
            path='/dividendReports/*/filer'
            source='/primaryFiler'
            condition={{ operator: `isFalseOrIncomplete`, condition: `/treatAsMFJ` }}
          />
          <LimitingString path='/dividendReports/*/payer' />
          <SaveAndOrContinueButton />
        </Screen>
      </SubSubcategory>
      <SubSubcategory route='div-income-amounts'>
        <Screen route='1099-div-boxes-1a-1b'>
          <Heading i18nKey='/heading/income/dividends/boxes-1a-1b' />
          <InfoDisplay i18nKey='/info/income/dividends/boxes-1a-1b' />
          <Dollar path='/dividendReports/*/ordinaryDividends' />
          <Dollar path='/dividendReports/*/writableQualifiedDividends' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-holding-period' condition='/dividendReports/*/hasQualifiedDividends'>
          <Heading i18nKey='/heading/income/dividends/holding-period' />
          <InfoDisplay i18nKey='/info/income/dividends/holding-period' />
          <Boolean path='/dividendReports/*/qualifiedDividendsHoldingPeriodNotMet' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-holding-period-knockout`,
          `/flowKnockoutQualifiedDividendsHoldingPeriod`,
          `dividends-holding-period`
        )}
        <Screen route='1099-div-box-2a'>
          <Heading i18nKey='/heading/income/dividends/box-2a' />
          <InfoDisplay i18nKey='/info/income/dividends/box-2a' />
          <Dollar path='/dividendReports/*/writableCapitalGainDistributions' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-box-3'>
          <Heading i18nKey='/heading/income/dividends/box-3' />
          <InfoDisplay i18nKey='/info/income/dividends/box-3' />
          <Dollar path='/dividendReports/*/writableNondividendDistributions' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-box-3-basis' condition='/dividendReports/*/hasNondividendDistributions'>
          <Heading i18nKey='/heading/income/dividends/box-3-basis' />
          <InfoDisplay i18nKey='/info/income/dividends/box-3-basis' />
          <Boolean path='/dividendReports/*/nondividendDistributionsExceedBasis' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-box-3-knockout`,
          `/flowKnockoutNondividendDistributionsOverBasis`,
          `dividends-nondividend-over-basis`
        )}
      </SubSubcategory>
      <SubSubcategory route='div-income-tax-withheld'>
        <Screen route='1099-div-box-4'>
          <Heading i18nKey='/heading/income/dividends/box-4' />
          <InfoDisplay i18nKey='/info/income/dividends/box-4' />
          <Dollar path='/dividendReports/*/writableFederalTaxWithheld' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
      </SubSubcategory>
      <SubSubcategory route='div-income-other-boxes'>
        <Screen route='1099-div-box-5'>
          <Heading i18nKey='/heading/income/dividends/box-5' />
          <InfoDisplay i18nKey='/info/income/dividends/box-5' />
          <Dollar path='/dividendReports/*/writableSection199ADividends' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-box-5-holding' condition='/dividendReports/*/hasSection199ADividends'>
          <Heading i18nKey='/heading/income/dividends/box-5-holding' />
          <InfoDisplay i18nKey='/info/income/dividends/box-5-holding' />
          <Boolean path='/dividendReports/*/section199ADividendsHoldingPeriodMet' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-box-5-knockout`,
          `/flowKnockoutSection199ADividendsHoldingPeriod`,
          `dividends-section-199a`
        )}
        <Screen route='1099-div-box-5-carryforward' condition='/dividendReports/*/hasSection199ADividends'>
          <Heading i18nKey='/heading/income/schedule-c/qbi-carryforward' />
          <InfoDisplay i18nKey='/info/income/schedule-c/qbi-carryforward' />
          <Boolean path='/qbiHasPriorYearLossCarryforward' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-box-5-qbi-knockout`,
          `/section199ADividendsShowsQbiLimitKnockout`,
          `schedule-c-qbi`
        )}
        {knockout(
          `1099-div-amounts-knockout`,
          `/flowKnockoutDividendAmountsInconsistent`,
          `dividends-amounts-inconsistent`
        )}
        <Screen route='1099-div-box-7'>
          <Heading i18nKey='/heading/income/dividends/box-7' />
          <InfoDisplay i18nKey='/info/income/dividends/box-7' />
          <Dollar path='/dividendReports/*/writableForeignTaxPaid' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-box-7-election' condition='/dividendReports/*/hasForeignTaxPaid'>
          <Heading i18nKey='/heading/income/dividends/box-7-election' />
          <InfoDisplay i18nKey='/info/income/dividends/box-7-election' />
          <Boolean path='/dividendReports/*/foreignTaxElectionRequirementsMet' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(`1099-div-box-7-knockout`, `/flowKnockoutDividendForeignTaxPaid`, `dividends-foreign-tax`)}
        <Screen route='1099-div-box-12'>
          <Heading i18nKey='/heading/income/dividends/box-12' />
          <InfoDisplay i18nKey='/info/income/dividends/box-12' />
          <Dollar path='/dividendReports/*/writableExemptInterestDividends' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        <Screen route='1099-div-box-13'>
          <Heading i18nKey='/heading/income/dividends/box-13' />
          <InfoDisplay i18nKey='/info/income/dividends/box-13' />
          <Dollar path='/dividendReports/*/writableSpecifiedPrivateActivityBondInterestDividends' required={false} />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-box-13-knockout`,
          `/flowKnockoutSpecifiedPrivateActivityBondDividendsExceedBox12`,
          `dividends-box-13-exceeds-box-12`
        )}
        <Screen route='1099-div-unsupported-boxes'>
          <Heading i18nKey='/heading/income/dividends/unsupported-boxes' />
          <InfoDisplay i18nKey='/info/income/dividends/unsupported-boxes' />
          <Boolean path='/dividendReports/*/hasUnsupportedBoxes' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(
          `1099-div-unsupported-boxes-knockout`,
          `/flowKnockoutDividendUnsupportedBoxes`,
          `dividends-unsupported-boxes`
        )}
        <Screen route='1099-div-nominee'>
          <Heading i18nKey='/heading/income/dividends/nominee' />
          <InfoDisplay i18nKey='/info/income/dividends/nominee' />
          <Boolean path='/dividendReports/*/receivedAsNominee' />
          <SetFactAction path='/dividendReports/*/hasSeenLastAvailableScreen' source='/flowTrue' />
          <SaveAndOrContinueButton />
        </Screen>
        {knockout(`1099-div-nominee-knockout`, `/flowKnockoutDividendNominee`, `dividends-nominee`)}
      </SubSubcategory>
    </CollectionLoop>
  </Subcategory>
);
