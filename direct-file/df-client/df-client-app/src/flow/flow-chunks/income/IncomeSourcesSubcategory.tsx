/* eslint-disable max-len */
import { Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  Boolean,
  ContextHeading,
  DFModal,
  DFAlert,
  Heading,
  InfoDisplay,
  LimitingString,
  SaveAndOrContinueButton,
  IconDisplay,
  KnockoutButton,
  SetFactAction,
} from '../../ContentDeclarations.js';

export const IncomeSourcesSubcategory = (
  <Subcategory
    route='income-sources'
    completeIf='/incomeSourcesIsComplete'
    dataItems={[
      {
        itemKey: `capitalGainsNone`,
        conditions: [{ operator: `isFalse`, condition: `/soldCapitalAssets` }],
      },
    ]}
  >
    <Screen route='income-sources-intro'>
      <ContextHeading i18nKey='/heading/income' />
      <Heading
        i18nKey='/heading/income/income-sources-intro'
        condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        batches={[`updates-1`]}
      />
      <Heading
        i18nKey='/heading/income/income-sources-intro-mfj'
        condition='/isFilingStatusMFJ'
        batches={[`updates-1`]}
      />
      <InfoDisplay
        i18nKey='/info/income/income-sources-intro'
        condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        batches={[`updates-1`]}
      />
      <InfoDisplay
        i18nKey='/info/income/income-sources-intro-mfj'
        condition='/isFilingStatusMFJ'
        batches={[`updates-1`]}
      />
      <SaveAndOrContinueButton />
    </Screen>
    <Screen route='income-supported-intro'>
      <Heading i18nKey='/heading/income/intro' batches={[`updates-1`]} />
      <InfoDisplay
        i18nKey='/info/income/intro'
        condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        batches={[`updates-1`]}
      />
      <InfoDisplay i18nKey='/info/income/intro-mfj' condition='/isFilingStatusMFJ' batches={[`updates-1`]} />
      <SaveAndOrContinueButton />
    </Screen>
    <SubSubcategory route='reportable-income'>
      <Screen route='income-not-supported-intro'>
        <Heading i18nKey='/heading/income/not-supported-intro' />
        <InfoDisplay
          i18nKey='/info/income/income-sources/not-supported-intro-1'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`, `updates-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/not-supported-intro-1-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`, `updates-1`]}
        />
        <DFModal i18nKey='/info/income/income-sources/not-supported-not-sure' batches={[`updates-1`]} />
        <InfoDisplay i18nKey='/info/income/income-sources-not-supported' batches={[`schedule-b-1`, `updates-1`]} />
        <DFAlert i18nKey='/info/income/income-sources-not-supported' headingLevel='h3' type='info' />
        <SetFactAction path='/hasSeenIncomeNotSupportedIntro' source='/flowTrue' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='income-supported-options'>
        <Heading
          i18nKey='/heading/income/income-supported-options'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        />
        <Heading i18nKey='/heading/income/income-supported-options-mfj' condition='/isFilingStatusMFJ' />
        <InfoDisplay i18nKey='/info/income/income-supported-options' batches={[`updates-1`]} />
        <Boolean
          path='/incomeSourcesSupported'
          i18nKeySuffixContext='self'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`updates-1`]}
        />
        <Boolean
          path='/incomeSourcesSupported'
          i18nKeySuffixContext='mfj'
          condition='/isFilingStatusMFJ'
          batches={[`updates-1`]}
        />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen
        route='income-sources-supported-knockout'
        condition={{ operator: `isFalse`, condition: `/incomeSourcesSupported` }}
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/income-sources-supported' />
        <DFAlert i18nKey='/info/knockout/income-sources-supported' headingLevel='h2' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='income-sources-breather'>
        <Heading i18nKey='/heading/income/income-sources-breather' batches={[`updates-1`]} />
        <InfoDisplay
          i18nKey='/info/income/income-sources-breather'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`updates-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources-breather-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`updates-1`]}
        />
        <SaveAndOrContinueButton />
      </Screen>
    </SubSubcategory>
    <SubSubcategory route='foreign-accounts-and-foreign-trusts'>
      <Screen route='foreign-accounts'>
        <Heading
          i18nKey='/heading/income/income-sources/foreign-accounts'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/foreign-accounts-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <DFModal
          i18nKey='/info/income/income-sources/foreign-accounts/what-counts-as-foreign-account'
          batches={[`schedule-b-1`]}
        />
        <DFModal
          i18nKey='/info/income/income-sources/foreign-accounts/what-is-financial-interest-signature-authority'
          batches={[`schedule-b-1`]}
        />
        <Boolean path='/hasForeignAccounts' batches={[`schedule-b-1`]} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='foreign-account-fbar' condition='/hasForeignAccounts'>
        <Heading
          i18nKey='/heading/income/income-sources/foreign-account-fbar'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/foreign-account-fbar-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <InfoDisplay i18nKey='/info/income/income-sources/foreign-account-fbar' batches={[`schedule-b-1`]} />
        <Boolean path='/requiredToFileFinCENForm114' batches={[`schedule-b-1`]} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='foreign-account-countries' condition='/flowShouldAskForeignAccountCountries'>
        <Heading i18nKey='/heading/income/income-sources/foreign-account-countries' batches={[`schedule-b-1`]} />
        <InfoDisplay i18nKey='/info/income/income-sources/foreign-account-countries' batches={[`schedule-b-1`]} />
        <LimitingString path='/foreignAccountCountryLine1' />
        <LimitingString path='/foreignAccountCountryLine2' required={false} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='form-8938-required' condition='/flowShouldAskForm8938'>
        <Heading
          i18nKey='/heading/income/income-sources/form-8938-required'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/form-8938-required-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <InfoDisplay i18nKey='/info/income/income-sources/form-8938-required' batches={[`schedule-b-1`]} />
        <Boolean path='/requiredToFileForm8938' batches={[`schedule-b-1`]} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='foreign-trusts-grantor' condition='/flowShouldAskScheduleBLine8'>
        <Heading
          i18nKey='/heading/income/income-sources/foreign-trusts-grantor'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/foreign-trusts-grantor-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/foreign-trusts-grantor'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/foreign-trusts-grantor-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <DFModal
          i18nKey='/info/income/income-sources/foreign-accounts/what-counts-as-foreign-trust'
          batches={[`schedule-b-1`]}
        />
        <Boolean path='/isForeignTrustsGrantor' batches={[`schedule-b-1`]} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='foreign-trusts-transactions' condition='/flowShouldAskForeignTrustsTransactions'>
        <Heading
          i18nKey='/heading/income/income-sources/foreign-trusts-transactions'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`schedule-b-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/foreign-trusts-transactions-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`schedule-b-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/foreign-trusts-transactions'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`updates-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/foreign-trusts-transactions-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`updates-1`]}
        />
        <DFModal i18nKey='/info/income/income-sources/foreign-accounts/what-counts-as-foreign-trust' />
        <Boolean path='/hasForeignTrustsTransactions' batches={[`schedule-b-1`]} />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='foreign-accounts-trusts-knockout' condition='/scheduleBPartIIIOutOfScope' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/foreign-accounts-trusts' batches={[`schedule-b-1`]} />
        <DFAlert
          i18nKey='/info/knockout/foreign-accounts-trusts'
          headingLevel='h3'
          type='warning'
          batches={[`schedule-b-1`]}
        />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    <SubSubcategory route='digital-assets'>
      <Screen route='digital-assets-received'>
        <Heading
          i18nKey='/heading/income/income-sources/digital-assets-received'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        />
        <Heading i18nKey='/heading/income/income-sources/digital-assets-received-mfj' condition='/isFilingStatusMFJ' />
        <DFModal i18nKey='/info/income/income-sources/digital-assets-received' batches={[`updates-1`]} />
        <Boolean path='/receivedDigitalAssets' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='digital-assets-disposed' condition={{ operator: `isFalse`, condition: `/receivedDigitalAssets` }}>
        <Heading
          i18nKey='/heading/income/income-sources/digital-assets-disposed'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        />
        <Heading i18nKey='/heading/income/income-sources/digital-assets-disposed-mfj' condition='/isFilingStatusMFJ' />
        <DFModal i18nKey='/info/income/income-sources/digital-assets-disposed' />
        <Boolean path='/disposedDigitalAssets' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen
        route='digital-assets-knockout'
        condition={{ operator: `isFalse`, condition: `/notDigitalAssets` }}
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/digital-assets' />
        <DFAlert i18nKey='/info/knockout/digital-assets' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='capital-assets-sold'>
        <Heading i18nKey='/heading/income/income-sources/capital-assets-sold' />
        <InfoDisplay i18nKey='/info/income/income-sources/capital-assets-sold' />
        <Boolean path='/soldCapitalAssets' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='capital-assets-knockout' condition='/flowKnockoutCapitalAssets' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/capital-assets' />
        <DFAlert i18nKey='/info/knockout/capital-assets' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='collectibles-sold' condition={{ operator: `isFalse`, condition: `/soldCapitalAssets` }}>
        <Heading i18nKey='/heading/income/income-sources/collectibles' />
        <InfoDisplay i18nKey='/info/income/income-sources/collectibles' />
        <Boolean path='/soldCollectibles' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='collectibles-sold-knockout' condition='/flowKnockoutCollectibles' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/collectibles' />
        <DFAlert i18nKey='/info/knockout/collectibles' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='unrecaptured-1250-gain' condition={{ operator: `isFalse`, condition: `/soldCapitalAssets` }}>
        <Heading i18nKey='/heading/income/income-sources/unrecaptured-1250-gain' />
        <InfoDisplay i18nKey='/info/income/income-sources/unrecaptured-1250-gain' />
        <Boolean path='/hasUnrecapturedSection1250Gain' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='unrecaptured-1250-gain-knockout' condition='/flowKnockoutUnrecaptured1250Gain' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/unrecaptured-1250-gain' />
        <DFAlert i18nKey='/info/knockout/unrecaptured-1250-gain' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #77 Form 6251: AMT items this tool doesn't compute (lines 2c-2t, 3, 8) */}
      <Screen route='amt-preference-items'>
        <Heading i18nKey='/heading/income/income-sources/amt-preference-items' />
        <InfoDisplay i18nKey='/info/income/income-sources/amt-preference-items' />
        <Boolean path='/hasAmtPreferenceItems' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='amt-preference-items-knockout' condition='/flowKnockoutAmtPreferenceItems' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/amt-preference-items' />
        <DFAlert i18nKey='/info/knockout/amt-preference-items' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #159: household employment taxes (Schedule H, Schedule 2 line 17a); cites in householdEmployment.xml */}
      <Screen route='household-employees'>
        <Heading i18nKey='/heading/income/income-sources/household-employees' />
        <InfoDisplay i18nKey='/info/income/income-sources/household-employees' />
        <Boolean path='/hasHouseholdEmployeeScheduleH' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='household-employees-knockout' condition='/flowKnockoutScheduleH' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/household-employees' />
        <DFAlert i18nKey='/info/knockout/household-employees' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    <SubSubcategory route='iras'>
      <Screen route='ira-contributions'>
        <Heading
          i18nKey='/heading/income/income-sources/ira-contributions'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`updates-1`]}
        />
        <Heading
          i18nKey='/heading/income/income-sources/ira-contributions-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`updates-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/ira-contributions'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
          batches={[`updates-1`]}
        />
        <InfoDisplay
          i18nKey='/info/income/income-sources/ira-contributions-mfj'
          condition='/isFilingStatusMFJ'
          batches={[`updates-1`]}
        />
        <DFModal i18nKey='/info/income/income-sources/ira-contributions' batches={[`updates-1`]} />
        <Boolean path='/madeIraContributions' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ira-contributions-ko' condition='/madeIraContributions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ira-contributions' batches={[`updates-1`]} />
        <DFAlert i18nKey='/info/knockout/ira-contributions' headingLevel='h3' type='warning' batches={[`updates-1`]} />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
  </Subcategory>
);
