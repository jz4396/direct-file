/* eslint-disable max-len */
import { Screen, Subcategory, SubSubcategory } from '../../flowDeclarations.js';
import {
  BigContent,
  Boolean,
  DFAlert,
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
      {/* #123 PA Schedules A, B, and D are not produced. PA Schedule C prints for a full-year line-item business. */}
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
