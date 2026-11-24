/* eslint-disable max-len */
import { Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  BigContent,
  Boolean,
  DFAlert,
  Enum,
  Dollar,
  ContextHeading,
  DFModal,
  GenericString,
  Heading,
  IconDisplay,
  InfoDisplay,
  KnockoutButton,
  SaveAndOrContinueButton,
  SetFactAction,
  SummaryTable,
  TaxReturnAlert,
} from '../../ContentDeclarations.js';

export const AmountSubcategory = (
  <Subcategory
    route='amount'
    completeIf={[`/flowHasSeenAmount`, `/form2210PartIIIsComplete`, `/schedule3AQuestionsComplete`]}
  >
    {/* #93: WA capital gains excise. RCW 82.87.040; RCW 82.87.060(1) $250,000. The WA return is not produced. */}
    <SubSubcategory route='wa-capital-gains' hidden={true}>
      <Screen route='wa-capital-gains-ko' condition='/flowKnockoutWashingtonCapitalGainsTax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/income/wa-capital-gains-ko' />
        <InfoDisplay i18nKey='/info/knockout/income/wa-capital-gains-ko' />
        <DFAlert i18nKey='/info/knockout/generic-other-ways-to-file' headingLevel='h2' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #78 PA-40 core: full-year PA residents. */}
    <SubSubcategory route='pa-40'>
      {/* #123 PA-40 School Code (PA-40 IN p. 5): the district where the filer lived on Dec. 31. */}
      <Screen route='pa-school-district' condition='/paAskSchoolDistrictCode'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-school-district' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-school-district' />
        <GenericString path='/paSchoolDistrictCode' />
        <SaveAndOrContinueButton />
      </Screen>
      {/* #102 PA-40 line 1b (PA Schedule UE) isn't computed: ask, and knock out on yes. */}
      <Screen route='pa-unreimbursed-employee-expenses' condition='/stateReturnPaFiled'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-unreimbursed-employee-expenses' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-unreimbursed-employee-expenses' />
        <Boolean path='/paHasUnreimbursedEmployeeExpenses' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen
        route='pa-unreimbursed-employee-expenses-knockout'
        condition='/flowKnockoutPaUnreimbursedEmployeeExpenses'
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-unreimbursed-employee-expenses' />
        <DFAlert i18nKey='/info/knockout/pa-unreimbursed-employee-expenses' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #86 PA Schedule B adjustments to dividends aren't computed: ask, and knock out on yes. */}
      <Screen route='pa-exempt-obligation-dividends' condition='/paAskExemptObligationDividends'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-exempt-obligation-dividends' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-exempt-obligation-dividends' />
        <Boolean path='/paHasExemptObligationDividends' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-dividends-knockout' condition='/flowKnockoutPaDividends' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-dividends' />
        <DFAlert i18nKey='/info/knockout/pa-dividends' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #86: 1099-DIV box 6 is included in box 1a (26 U.S.C. 67(g)). No PA subtraction is pinned. */}
      <Screen
        route='pa-dividend-investment-expenses-knockout'
        condition='/flowKnockoutPaDividendInvestmentExpenses'
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-dividend-investment-expenses' />
        <DFAlert i18nKey='/info/knockout/pa-dividend-investment-expenses' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-unsupported-items' condition='/stateReturnPaFiled'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-unsupported-items' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-unsupported-items' />
        <Boolean path='/paHasUnsupportedItems' />
        <SaveAndOrContinueButton />
      </Screen>
      {/* #80 PA part-year residency. */}
      <Screen route='pa-part-year-interest' condition='/paPartYearHasInterest'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-part-year-interest' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-part-year-interest' />
        <Dollar path='/paPartYearResidentInterest' />
        <SaveAndOrContinueButton />
      </Screen>
      {/* #135: 1099-DIVs have no dates. Dividends received while not a PA resident are PA Schedule B line 4. */}
      <Screen route='pa-part-year-dividends' condition='/paPartYearHasDividends'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-part-year-dividends' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-part-year-dividends' />
        <Dollar path='/paPartYearResidentDividends' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-part-year-knockout' condition='/flowKnockoutPaPartYear' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-part-year' />
        <DFAlert i18nKey='/info/knockout/pa-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #135 PA-source pay in the nonresident period needs PA Schedule NRH (PA-40 IN p. 43): ask, and knock out on yes. */}
      <Screen route='pa-part-year-nonresident-pa-pay' condition='/stateReturnIsPaPartYear'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-part-year-nonresident-pa-pay' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-part-year-nonresident-pa-pay' />
        <Boolean path='/paPartYearHasNonresidentPaSourcePay' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen
        route='pa-part-year-nonresident-pa-pay-knockout'
        condition='/flowKnockoutPaNonresidentPaSourcePay'
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-part-year-nonresident-pa-pay' />
        <DFAlert i18nKey='/info/knockout/pa-part-year-nonresident-pa-pay' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-unsupported-items-knockout' condition='/flowKnockoutPaUnsupportedItems' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-unsupported-items' />
        <DFAlert i18nKey='/info/knockout/pa-unsupported-items' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-schedule-c-tax-shelter' condition='/paAskScheduleCTaxShelter'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-schedule-c-tax-shelter' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-schedule-c-tax-shelter' />
        <Boolean path='/paHasScheduleCTaxShelter' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-unsupported-income-knockout' condition='/flowKnockoutPaUnsupportedIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-unsupported-income' />
        <DFAlert i18nKey='/info/knockout/pa-unsupported-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* #123 PA Schedules A and D are not printed. PA Schedule C prints for a full-year line-item business.
          PA Schedule B prints for the full-year, not-joint taxpayer Form 1099-DIV box 2a path (#89). This screen stays
          for every other Schedule B amount. For a full-year resident, each spouse's line 12 is still PA-40 line 3. */}
      <Screen route='pa-schedule-a-knockout' condition='/flowKnockoutPaScheduleA' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-schedule-a' />
        <DFAlert i18nKey='/info/knockout/pa-schedule-a' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-schedule-b-knockout' condition='/flowKnockoutPaScheduleB' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-schedule-b' />
        <DFAlert i18nKey='/info/knockout/pa-schedule-b' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-schedule-c-knockout' condition='/flowKnockoutPaScheduleC' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-schedule-c' />
        <DFAlert i18nKey='/info/knockout/pa-schedule-c' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-schedule-d-knockout' condition='/flowKnockoutPaScheduleD' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-schedule-d' />
        <DFAlert i18nKey='/info/knockout/pa-schedule-d' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen
        route='pa-k1-part-ii-capital-gain-knockout'
        condition='/flowKnockoutPaK1PartIICapitalGain'
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-k1-part-ii-capital-gain' />
        <DFAlert i18nKey='/info/knockout/pa-k1-part-ii-capital-gain' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen
        route='pa-k1-guaranteed-payments-knockout'
        condition='/flowKnockoutPaK1GuaranteedPayments'
        isKnockout={true}
      >
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-k1-guaranteed-payments' />
        <DFAlert i18nKey='/info/knockout/pa-k1-guaranteed-payments' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-k1-1041-capital-gain-knockout' condition='/flowKnockoutPaK11041CapitalGain' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-k1-1041-capital-gain' />
        <DFAlert i18nKey='/info/knockout/pa-k1-1041-capital-gain' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='pa-k1-1041-box-7-knockout' condition='/flowKnockoutPaK11041Box7' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-k1-1041-box-7' />
        <DFAlert i18nKey='/info/knockout/pa-k1-1041-box-7' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      {/* PA-40 line 15. Lines 14, 16, 17 and Form REV-459B stay stopped. */}
      <Screen route='pa-estimated-installment-payments' condition='/stateReturnPaFiled'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-estimated-installment-payments' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-estimated-installment-payments' />
        <Boolean path='/paHasEstimatedInstallmentPayments' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-estimated-installment-payments-amount' condition='/paHasEstimatedInstallmentPayments'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-estimated-installment-payments-amount' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-estimated-installment-payments-amount' />
        <Dollar path='/paEstimatedInstallmentPayments' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-sp-nontaxable-income' condition='/flowShowPaSpQuestion'>
        <Heading i18nKey='/heading/your-taxes/amount/pa-sp-nontaxable-income' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/pa-sp-nontaxable-income' />
        <Boolean path='/paHasSpNontaxableIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='pa-sp-unsupported-knockout' condition='/flowKnockoutPaSpUnsupported' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/pa-sp-unsupported' />
        <DFAlert i18nKey='/info/knockout/pa-sp-unsupported' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 3: full-year Illinois resident, W-2 wages only. No local return. */}
    <SubSubcategory route='il-1040'>
      <Screen route='il-residency' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-residency' />
        <Enum path='/ilResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-part-year-knockout' condition='/flowKnockoutIlPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-part-year' />
        <DFAlert i18nKey='/info/knockout/il-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-more-than-one-knockout' condition='/flowKnockoutIlLivedInMoreThanOneState' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-more-than-one-state' />
        <DFAlert i18nKey='/info/knockout/il-more-than-one-state' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-w2-knockout' condition='/flowKnockoutIlW2NotIllinois' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-w2-not-illinois' />
        <DFAlert i18nKey='/info/knockout/il-w2-not-illinois' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-other-income-knockout' condition='/flowKnockoutIlOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-other-income' />
        <DFAlert i18nKey='/info/knockout/il-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-schedule-m' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-schedule-m' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-schedule-m' />
        <Boolean path='/ilHasScheduleM' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-schedule-m-knockout' condition='/flowKnockoutIlScheduleM' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-schedule-m' />
        <DFAlert i18nKey='/info/knockout/il-schedule-m' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-eitc' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-eitc' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-eitc' />
        <Boolean path='/ilClaimsIlEitcOrCtc' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-dependents-knockout' condition='/flowKnockoutIlDependentsOrEitc' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-dependents' />
        <DFAlert i18nKey='/info/knockout/il-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-credits' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-credits' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-credits' />
        <Boolean path='/ilHasNonrefundableCredits' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-credits-knockout' condition='/flowKnockoutIlNonrefundableCredits' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-credits' />
        <DFAlert i18nKey='/info/knockout/il-credits' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-household-knockout' condition='/flowKnockoutIlHouseholdEmployment' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-household' />
        <DFAlert i18nKey='/info/knockout/il-household' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-use-tax' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-use-tax' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-use-tax' />
        <Boolean path='/ilHasUseTax' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-use-tax-knockout' condition='/flowKnockoutIlUseTax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-use-tax' />
        <DFAlert i18nKey='/info/knockout/il-use-tax' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-surcharge' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-surcharge' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-surcharge' />
        <Boolean path='/ilHasCannabisOrGamingSurcharge' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-surcharge-knockout' condition='/flowKnockoutIlCannabisGamingSurcharge' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-surcharge' />
        <DFAlert i18nKey='/info/knockout/il-surcharge' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-pass-through' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-pass-through' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-pass-through' />
        <Boolean path='/ilHasPassThroughWithholdingOrCredit' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-pass-through-knockout' condition='/flowKnockoutIlPassThrough' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-pass-through' />
        <DFAlert i18nKey='/info/knockout/il-pass-through' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-estimates' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-estimates' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-estimates' />
        <Boolean path='/ilHasEstimatedOrPriorYearCredit' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-estimates-knockout' condition='/flowKnockoutIlEstimatedPayments' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-estimates' />
        <DFAlert i18nKey='/info/knockout/il-estimates' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-2210' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-2210' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-2210' />
        <Boolean path='/ilNeedsForm2210' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-2210-knockout' condition='/flowKnockoutIl2210' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-2210' />
        <DFAlert i18nKey='/info/knockout/il-2210' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-schedule-g' condition='/stateReturnIsIl'>
        <Heading i18nKey='/heading/your-taxes/amount/il-schedule-g' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/il-schedule-g' />
        <Boolean path='/ilHasScheduleGDonation' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='il-schedule-g-knockout' condition='/flowKnockoutIlScheduleG' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-schedule-g' />
        <DFAlert i18nKey='/info/knockout/il-schedule-g' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-dependent-filer-knockout' condition='/flowKnockoutIlClaimedAsDependent' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-claimed-as-dependent' />
        <DFAlert i18nKey='/info/knockout/il-claimed-as-dependent' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='il-wit-rows-knockout' condition='/flowKnockoutIlWitTooManyRows' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/il-wit-rows' />
        <DFAlert i18nKey='/info/knockout/il-wit-rows' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 4: full-year North Carolina resident, W-2 wages only. No local return. */}
    <SubSubcategory route='nc-d400'>
      <Screen route='nc-residency' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-residency' />
        <Enum path='/ncResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-part-year-knockout' condition='/flowKnockoutNcPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-part-year' />
        <DFAlert i18nKey='/info/knockout/nc-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-county' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-county' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-county' />
        <GenericString path='/ncCounty' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-veteran' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-veteran' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-veteran' />
        <Boolean path='/ncIsVeteran' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-spouse-veteran' condition='/ncAskSpouseVeteran'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-spouse-veteran' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-spouse-veteran' />
        <Boolean path='/ncSpouseIsVeteran' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-schedule-s' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-schedule-s' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-schedule-s' />
        <Boolean path='/ncHasScheduleS' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-schedule-s-knockout' condition='/flowKnockoutNcScheduleS' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-schedule-s' />
        <DFAlert i18nKey='/info/knockout/nc-schedule-s' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-other-income-knockout' condition='/flowKnockoutNcOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-other-income' />
        <DFAlert i18nKey='/info/knockout/nc-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-child-deduction' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-child-deduction' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-child-deduction' />
        <Boolean path='/ncClaimsChildDeduction' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-dependents-knockout' condition='/flowKnockoutNcDependentsOrChildDeduction' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-dependents' />
        <DFAlert i18nKey='/info/knockout/nc-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-itemized' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-itemized' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-itemized' />
        <Boolean path='/ncItemizes' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-itemized-knockout' condition='/flowKnockoutNcItemizedDeductions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-itemized' />
        <DFAlert i18nKey='/info/knockout/nc-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-credits' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-credits' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-credits' />
        <Boolean path='/ncHasD400TcCredit' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-credits-knockout' condition='/flowKnockoutNcCredits' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-credits' />
        <DFAlert i18nKey='/info/knockout/nc-credits' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-use-tax' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-use-tax' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-use-tax' />
        <Boolean path='/ncHasUseTax' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-use-tax-knockout' condition='/flowKnockoutNcUseTax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-use-tax' />
        <DFAlert i18nKey='/info/knockout/nc-use-tax' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-payments' condition='/stateReturnIsNc'>
        <Heading i18nKey='/heading/your-taxes/amount/nc-payments' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/nc-payments' />
        <Boolean path='/ncHasOtherPayments' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='nc-payments-knockout' condition='/flowKnockoutNcOtherPayments' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-payments' />
        <DFAlert i18nKey='/info/knockout/nc-payments' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-w2-knockout' condition='/flowKnockoutNcW2NotNorthCarolina' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-w2' />
        <DFAlert i18nKey='/info/knockout/nc-w2' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='nc-mfs-itemized-knockout' condition='/flowKnockoutNcMfsSpouseItemizes' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/nc-mfs-itemized' />
        <DFAlert i18nKey='/info/knockout/nc-mfs-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 5: full-year Arizona resident, W-2 wages only. No local return. */}
    <SubSubcategory route='az-140'>
      <Screen route='az-residency' condition='/stateReturnIsAz'>
        <Heading i18nKey='/heading/your-taxes/amount/az-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/az-residency' />
        <Enum path='/azResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='az-part-year-knockout' condition='/flowKnockoutAzPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-part-year' />
        <DFAlert i18nKey='/info/knockout/az-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-w2-knockout' condition='/flowKnockoutAzW2NotArizona' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-w2' />
        <DFAlert i18nKey='/info/knockout/az-w2' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-other-income-knockout' condition='/flowKnockoutAzOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-other-income' />
        <DFAlert i18nKey='/info/knockout/az-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-dependents-knockout' condition='/flowKnockoutAzDependentsOrQualifyingPerson' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-dependents' />
        <DFAlert i18nKey='/info/knockout/az-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-age-blind-knockout' condition='/flowKnockoutAzAgeOrBlind' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-age-blind' />
        <DFAlert i18nKey='/info/knockout/az-age-blind' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-itemized-knockout' condition='/flowKnockoutAzItemizedDeductions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-itemized' />
        <DFAlert i18nKey='/info/knockout/az-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-charity-knockout' condition='/flowKnockoutAzCharitableContributions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-charity' />
        <DFAlert i18nKey='/info/knockout/az-charity' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-low-income-knockout' condition='/flowKnockoutAzLowIncomeCredit' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-low-income' />
        <DFAlert i18nKey='/info/knockout/az-low-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-schedule-1a-knockout' condition='/flowKnockoutAzSchedule1A' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-schedule-1a' />
        <DFAlert i18nKey='/info/knockout/az-schedule-1a' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='az-filing-status-knockout' condition='/flowKnockoutAzFilingStatus' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/az-filing-status' />
        <DFAlert i18nKey='/info/knockout/az-filing-status' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 6: full-year Massachusetts resident, W-2 wages only. No local return. */}
    <SubSubcategory route='ma-form-1'>
      <Screen route='ma-residency' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-residency' />
        <Enum path='/maResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-part-year-knockout' condition='/flowKnockoutMaPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-part-year' />
        <DFAlert i18nKey='/info/knockout/ma-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-w2-knockout' condition='/flowKnockoutMaW2NotMassachusetts' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-w2' />
        <DFAlert i18nKey='/info/knockout/ma-w2' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-other-income-knockout' condition='/flowKnockoutMaOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-other-income' />
        <DFAlert i18nKey='/info/knockout/ma-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-dependents-knockout' condition='/flowKnockoutMaDependentsOrQualifyingPerson' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-dependents' />
        <DFAlert i18nKey='/info/knockout/ma-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-age-blind-knockout' condition='/flowKnockoutMaAgeOrBlind' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-age-blind' />
        <DFAlert i18nKey='/info/knockout/ma-age-blind' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-filing-status-knockout' condition='/flowKnockoutMaFilingStatus' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-filing-status' />
        <DFAlert i18nKey='/info/knockout/ma-filing-status' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-itemized-knockout' condition='/flowKnockoutMaItemizedDeductions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-itemized' />
        <DFAlert i18nKey='/info/knockout/ma-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-use-tax' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-use-tax' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-use-tax' />
        <Boolean path='/maHasUseTax' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-use-tax-knockout' condition='/flowKnockoutMaUseTax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-use-tax' />
        <DFAlert i18nKey='/info/knockout/ma-use-tax' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-rent' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-rent' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-rent' />
        <Dollar path='/maRentPaid' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-optional-rate' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-optional-rate' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-optional-rate' />
        <Boolean path='/maElectsOptionalRate' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-mcc' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-mcc' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-mcc' />
        <Boolean path='/maHasFullYearMcc' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-spouse-mcc' condition='/maAskSpouse'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-spouse-mcc' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-spouse-mcc' />
        <Boolean path='/maSpouseHasFullYearMcc' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-mcc-knockout' condition='/flowKnockoutMaNoFullYearMcc' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-mcc' />
        <DFAlert i18nKey='/info/knockout/ma-mcc' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-retirement' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-retirement' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-retirement' />
        <Boolean path='/maHasRetirementContribution' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-retirement-knockout' condition='/flowKnockoutMaRetirementContribution' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-retirement' />
        <DFAlert i18nKey='/info/knockout/ma-retirement' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-insurer' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-insurer' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-insurer' />
        <GenericString path='/maInsurerName' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-subscriber' condition='/stateReturnIsMa'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-subscriber' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-subscriber' />
        <GenericString path='/maSubscriberId' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-spouse-insurer' condition='/maAskSpouse'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-spouse-insurer' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-spouse-insurer' />
        <GenericString path='/maSpouseInsurerName' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-spouse-subscriber' condition='/maAskSpouse'>
        <Heading i18nKey='/heading/your-taxes/amount/ma-spouse-subscriber' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ma-spouse-subscriber' />
        <GenericString path='/maSpouseSubscriberId' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ma-tax-table-knockout' condition='/flowKnockoutMaTaxTable' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-tax-table' />
        <DFAlert i18nKey='/info/knockout/ma-tax-table' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-surtax-knockout' condition='/flowKnockoutMaSurtax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-surtax' />
        <DFAlert i18nKey='/info/knockout/ma-surtax' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ma-eitc-knockout' condition='/flowKnockoutMaEarnedIncomeCredit' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ma-eitc' />
        <DFAlert i18nKey='/info/knockout/ma-eitc' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 7: full-year Idaho resident, W-2 wages only. No local return. */}
    <SubSubcategory route='id-form-40'>
      <Screen route='id-residency' condition='/stateReturnIsId'>
        <Heading i18nKey='/heading/your-taxes/amount/id-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/id-residency' />
        <Enum path='/idResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='id-part-year-knockout' condition='/flowKnockoutIdPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-part-year' />
        <DFAlert i18nKey='/info/knockout/id-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-w2-knockout' condition='/flowKnockoutIdW2NotIdaho' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-w2' />
        <DFAlert i18nKey='/info/knockout/id-w2' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-other-income-knockout' condition='/flowKnockoutIdOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-other-income' />
        <DFAlert i18nKey='/info/knockout/id-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-dependents-knockout' condition='/flowKnockoutIdDependents' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-dependents' />
        <DFAlert i18nKey='/info/knockout/id-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-age-blind-knockout' condition='/flowKnockoutIdAgeOrBlind' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-age-blind' />
        <DFAlert i18nKey='/info/knockout/id-age-blind' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-claimed-knockout' condition='/flowKnockoutIdClaimedAsDependent' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-claimed' />
        <DFAlert i18nKey='/info/knockout/id-claimed' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-filing-status-knockout' condition='/flowKnockoutIdFilingStatus' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-filing-status' />
        <DFAlert i18nKey='/info/knockout/id-filing-status' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-itemized-knockout' condition='/flowKnockoutIdItemizedDeductions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-itemized' />
        <DFAlert i18nKey='/info/knockout/id-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-schedule-1a-knockout' condition='/flowKnockoutIdSchedule1A' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-schedule-1a' />
        <DFAlert i18nKey='/info/knockout/id-schedule-1a' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-use-tax' condition='/stateReturnIsId'>
        <Heading i18nKey='/heading/your-taxes/amount/id-use-tax' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/id-use-tax' />
        <Boolean path='/idHasUseTax' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='id-use-tax-knockout' condition='/flowKnockoutIdUseTax' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-use-tax' />
        <DFAlert i18nKey='/info/knockout/id-use-tax' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-public-assistance' condition='/stateReturnIsId'>
        <Heading i18nKey='/heading/your-taxes/amount/id-public-assistance' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/id-public-assistance' />
        <Boolean path='/idReceivedPublicAssistance' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='id-public-assistance-knockout' condition='/flowKnockoutIdPublicAssistance' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-public-assistance' />
        <DFAlert i18nKey='/info/knockout/id-public-assistance' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='id-snap' condition='/stateReturnIsId'>
        <Heading i18nKey='/heading/your-taxes/amount/id-snap' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/id-snap' />
        <Boolean path='/idReceivedSnapOrIncarcerated' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='id-spouse-snap' condition='/idAskSpouse'>
        <Heading i18nKey='/heading/your-taxes/amount/id-spouse-snap' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/id-spouse-snap' />
        <Boolean path='/idSpouseReceivedSnapOrIncarcerated' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='id-snap-knockout' condition='/flowKnockoutIdSnapOrIncarcerated' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/id-snap' />
        <DFAlert i18nKey='/info/knockout/id-snap' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #93 slice 8: full-year Kansas resident, W-2 wages only, line 7 over $100,000. No local return. */}
    <SubSubcategory route='ks-form-k-40'>
      <Screen route='ks-residency' condition='/stateReturnIsKs'>
        <Heading i18nKey='/heading/your-taxes/amount/ks-residency' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/ks-residency' />
        <Enum path='/ksResidencyStatus' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='ks-part-year-knockout' condition='/flowKnockoutKsPartYearOrNonresident' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-part-year' />
        <DFAlert i18nKey='/info/knockout/ks-part-year' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-w2-knockout' condition='/flowKnockoutKsW2NotKansas' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-w2' />
        <DFAlert i18nKey='/info/knockout/ks-w2' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-other-income-knockout' condition='/flowKnockoutKsOtherFederalIncome' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-other-income' />
        <DFAlert i18nKey='/info/knockout/ks-other-income' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-dependents-knockout' condition='/flowKnockoutKsDependents' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-dependents' />
        <DFAlert i18nKey='/info/knockout/ks-dependents' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-age-blind-knockout' condition='/flowKnockoutKsAgeOrBlind' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-age-blind' />
        <DFAlert i18nKey='/info/knockout/ks-age-blind' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-claimed-knockout' condition='/flowKnockoutKsClaimedAsDependent' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-claimed' />
        <DFAlert i18nKey='/info/knockout/ks-claimed' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-filing-status-knockout' condition='/flowKnockoutKsFilingStatus' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-filing-status' />
        <DFAlert i18nKey='/info/knockout/ks-filing-status' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-itemized-knockout' condition='/flowKnockoutKsItemizedDeductions' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-itemized' />
        <DFAlert i18nKey='/info/knockout/ks-itemized' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-eitc-knockout' condition='/flowKnockoutKsEarnedIncomeCredit' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-eitc' />
        <DFAlert i18nKey='/info/knockout/ks-eitc' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-form-2441-knockout' condition='/flowKnockoutKsForm2441' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-form-2441' />
        <DFAlert i18nKey='/info/knockout/ks-form-2441' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-schedule-1a-knockout' condition='/flowKnockoutKsSchedule1A' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-schedule-1a' />
        <DFAlert i18nKey='/info/knockout/ks-schedule-1a' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='ks-tax-table-knockout' condition='/flowKnockoutKsTaxTable' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/ks-tax-table' />
        <DFAlert i18nKey='/info/knockout/ks-tax-table' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
    </SubSubcategory>
    {/* #77 Form 6251 cases this tool doesn't compute */}
    <Screen route='amt-mfs-add-back-knockout' condition='/flowKnockoutAmtMfsAddBack' isKnockout={true}>
      <IconDisplay name='ErrorOutline' size={9} isCentered />
      <Heading i18nKey='/heading/knockout/amt-mfs-add-back' />
      <DFAlert i18nKey='/info/knockout/amt-mfs-add-back' headingLevel='h3' type='warning' />
      <KnockoutButton i18nKey='button.knockout' />
    </Screen>
    {/* #86 Form 8615 (tax for certain children who have unearned income) isn't computed */}
    <Screen route='form-8615-knockout' condition='/flowKnockoutForm8615' isKnockout={true}>
      <IconDisplay name='ErrorOutline' size={9} isCentered />
      <Heading i18nKey='/heading/knockout/form-8615' />
      <DFAlert i18nKey='/info/knockout/form-8615' headingLevel='h3' type='warning' />
      <KnockoutButton i18nKey='button.knockout' />
    </Screen>
    {/* 2026 draft Schedule 3-A line 7, then line 8 (8 U.S.C. 1641(b)), when line 6 is more than zero. */}
    <SubSubcategory route='schedule-3a'>
      <Screen route='schedule-3a-line-7' condition='/schedule3ALine6IsPositive'>
        <Heading i18nKey='/heading/your-taxes/amount/schedule-3a-line-7' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/schedule-3a-line-7' />
        <Boolean path='/schedule3AWantsFederalPublicBenefit' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='schedule-3a-line-8' condition='/schedule3ALine8Applies'>
        <Heading i18nKey='/heading/your-taxes/amount/schedule-3a-line-8' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/schedule-3a-line-8' />
        <Boolean path='/schedule3AIsCitizenNationalOrQualifiedAlien' />
        <SaveAndOrContinueButton />
      </Screen>
    </SubSubcategory>
    {/* #92 Form 2210: lines 1-7 are computed; when a penalty is possible, ask the Part II questions. Any box knocks
        out; with none, the IRS figures any penalty and sends a bill, and Form 1040 line 38 stays blank. */}
    <SubSubcategory route='estimated-tax-penalty'>
      <Screen route='est-tax-penalty-waiver' condition='/form2210AskPartII'>
        <Heading i18nKey='/heading/your-taxes/amount/est-tax-penalty-waiver' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/est-tax-penalty-waiver' />
        <Boolean path='/form2210WaiverRequested' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='est-tax-penalty-annualized' condition='/form2210AskPartII'>
        <Heading i18nKey='/heading/your-taxes/amount/est-tax-penalty-annualized' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/est-tax-penalty-annualized' />
        <Boolean path='/form2210AnnualizedIncome' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='est-tax-penalty-withholding-dates' condition='/form2210AskPartII'>
        <Heading i18nKey='/heading/your-taxes/amount/est-tax-penalty-withholding-dates' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/est-tax-penalty-withholding-dates' />
        <Boolean path='/form2210WithholdingOnActualDates' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='est-tax-penalty-joint-prior-year' condition='/form2210AskPartII'>
        <Heading
          i18nKey='/heading/your-taxes/amount/est-tax-penalty-joint-prior-year'
          condition={{ operator: `isFalse`, condition: `/isFilingStatusMFJ` }}
        />
        <Heading
          i18nKey='/heading/your-taxes/amount/est-tax-penalty-joint-prior-year-mfj'
          condition='/isFilingStatusMFJ'
        />
        <Boolean path='/form2210FiledJointReturnPriorYear' />
        <SaveAndOrContinueButton />
      </Screen>
      <Screen route='est-tax-penalty-knockout' condition='/flowKnockoutForm2210' isKnockout={true}>
        <IconDisplay name='ErrorOutline' size={9} isCentered />
        <Heading i18nKey='/heading/knockout/form-2210' />
        <DFAlert i18nKey='/info/knockout/form-2210' headingLevel='h3' type='warning' />
        <KnockoutButton i18nKey='button.knockout' />
      </Screen>
      <Screen route='est-tax-penalty-irs-will-bill' condition='/form2210ShowIrsWillBillNote'>
        <Heading i18nKey='/heading/your-taxes/amount/est-tax-penalty-irs-will-bill' />
        <InfoDisplay i18nKey='/info/your-taxes/amount/est-tax-penalty-irs-will-bill' />
        <SaveAndOrContinueButton />
      </Screen>
    </SubSubcategory>
    <Screen route='tax-amount-intro'>
      <ContextHeading displayOnlyOn='edit' i18nKey='/heading/your-taxes/amount/tax-amount' />
      <Heading i18nKey='/heading/your-taxes/amount/tax-amount-intro' />
      <TaxReturnAlert
        type='warning'
        i18nKey='/info/your-taxes/amount/tax-amount-has-changed'
        conditions={[{ operator: `isTrueAndComplete`, condition: `/flowHasAmountChanged` }]}
        checklistSubcategoryWarningLabel='/info/your-taxes/amount/tax-amount-has-changed'
      />
      <InfoDisplay i18nKey='/info/your-taxes/amount/tax-amount-intro' />
      <SaveAndOrContinueButton />
    </Screen>
    <Screen route='tax-amount-number'>
      <Heading
        i18nKey='/heading/your-taxes/amount/tax-amount-number-owed'
        condition={{ operator: `isFalse`, condition: `/dueRefund` }}
      />
      <Heading i18nKey='/heading/your-taxes/amount/tax-amount-number-refund' condition='/dueRefund' />
      <BigContent
        i18nKey='/info/your-taxes/amount/tax-amount-number-owed'
        condition={{ operator: `isFalse`, condition: `/dueRefund` }}
      />
      <BigContent i18nKey='/info/your-taxes/amount/tax-amount-number-refund' condition='/dueRefund' />
      <DFModal i18nKey='/info/your-taxes/amount/irs-may-adjust' />
      <DFModal i18nKey='/info/your-taxes/amount/tax-amount-means-to-owe' condition='/owesBalance' />
      <DFModal i18nKey='/info/your-taxes/amount/tax-amount-means-to-refund' condition='/dueRefund' />
      <DFModal i18nKey='/info/your-taxes/amount/tax-amount-means-to-zero' condition='/zeroBalance' />
      <DFModal
        i18nKey='/info/your-taxes/amount/tax-amount-withholdings-effect'
        condition={{ operator: `isFalse`, condition: `/zeroBalance` }}
      />
      <SaveAndOrContinueButton />
    </Screen>
    <Screen route='tax-amount-explanation' actAsDataView={true}>
      <Heading i18nKey='/heading/your-taxes/amount/tax-amount-explanation' />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-total-income'
        items={[
          {
            itemKey: `totalIncome`,
          },
        ]}
      />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-adjustments'
        items={[
          {
            itemKey: `adjustmentsSubheader`,
            conditions: [`/hasAdjustmentsToIncome`],
          },
          {
            itemKey: `hsaDeductions`,
            conditions: [`/hasHsaDeduction`],
            indent: true,
          },
          {
            itemKey: `educatorAdjustments`,
            conditions: [`/isReceivingEducatorExpensesAdjustment`],
            indent: true,
          },
          {
            itemKey: `studentLoanDeduction`,
            conditions: [`/isReceivingStudentLoanInterestAdjustment`],
            indent: true,
          },
          {
            itemKey: `agi`,
            showTopBorder: true,
          },
          {
            itemKey: `standardDeduction`,
          },
          {
            itemKey: `taxableIncome`,
            showTopBorder: true,
          },
        ]}
      />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-tax-amount'
        items={[
          {
            itemKey: `initialTaxAmount`,
            showTopBorder: true,
          },
        ]}
      />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-with-additional-taxes'
        items={[
          {
            itemKey: `excessAdvancePTC`,
          },
          {
            itemKey: `addtionalTaxes`,
            showTopBorder: true,
          },
        ]}
        condition={`/owesPtc`}
      />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-credits'
        batches={[`ptc-1`]}
        items={[
          {
            itemKey: `nonrefundableCredits`,
            conditions: [`/isReceivingNonrefundableCredits`],
          },
          {
            itemKey: `cdcc`,
            conditions: [`/isReceivingCdccCredit`],
            indent: true,
          },
          {
            itemKey: `edc`,
            indent: true,
            conditions: [`/isReceivingEdc`],
          },
          {
            itemKey: `odc`,
            conditions: [`/isReceivingOdc`],
            indent: true,
          },
          {
            itemKey: `ctc`,
            conditions: [`/isReceivingCtc`],
            indent: true,
          },
          {
            itemKey: `savers`,
            conditions: [`/isReceivingSaversCredit`],
            indent: true,
          },
          {
            itemKey: `refundableCredits`,
            conditions: [`/isReceivingRefundableCredits`],
          },
          {
            itemKey: `ptcPositive`,
            conditions: [`/isReceivingPtc`],
            indent: true,
          },
          {
            itemKey: `actc`,
            conditions: [`/isReceivingActc`],
            indent: true,
          },
          {
            itemKey: `eitc`,
            conditions: [`/isReceivingEitc`],
            indent: true,
          },
          {
            itemKey: `taxAmount`,
            showTopBorder: true,
          },
        ]}
      />
      <SummaryTable
        i18nKey='/info/your-taxes/amount/tax-amount-explanation-final'
        items={[
          {
            itemKey: `withholdings`,
          },
          {
            itemKey: `estimated`,
          },
          {
            itemKey: `taxAmount`,
            showTopBorder: true,
          },
        ]}
      />
      <InfoDisplay i18nKey='/info/your-taxes/amount/tax-amount-explanation-refund' condition='/dueRefund' />
      <InfoDisplay i18nKey='/info/your-taxes/amount/tax-amount-explanation-owe' condition='/owesBalance' />
      <InfoDisplay i18nKey='/info/your-taxes/amount/tax-amount-explanation-zero' condition='/zeroBalance' />
      <SetFactAction path='/flowHasSeenAmount' source='/flowTrue' />
      <SetFactAction path='/flowHasAmountChanged' source='/flowFalse' />
      <SaveAndOrContinueButton />
    </Screen>
  </Subcategory>
);
