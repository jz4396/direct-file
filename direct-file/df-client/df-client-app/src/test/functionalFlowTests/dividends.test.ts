import { it, describe, expect } from 'vitest';
import { baseFilerData } from '../testData.js';
import {
  createBooleanWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import makeGivenFacts from './functionalFlowUtils.js';
import { setupFactGraph } from '../setupFactGraph.js';

const flow = createFlowConfig(flowNodes);
const givenFacts = makeGivenFacts(flow);
const path = `/flow/income/dividends`;
const id = `86a0f000-0000-4000-8000-000000000001`;
const base = (status: string, extra: Record<string, unknown> = {}) =>
  setupFactGraph({
    ...baseFilerData,
    '/dividendReports': { $type: `gov.irs.factgraph.persisters.CollectionWrapper`, item: { items: [id] } },
    '/filingStatus': createEnumWrapper(status, `/filingStatusOptions`),
    [`/dividendReports/#${id}/payer`]: createStringWrapper(`Index Fund Co`),
    ...extra,
  }).factGraph;
const at = (g: ReturnType<typeof base>, route: string, task: Parameters<ReturnType<typeof givenFacts>['atPath']>[2]) =>
  givenFacts(g).atPath(`${path}/${route}`, id, task);

describe(`The \`dividends\` (Form 1099-DIV) subcategory`, () => {
  it(`asks whose 1099-DIV only when filing jointly`, ({ task }) => {
    expect(at(base(`marriedFilingJointly`), `1099-div-add-whose`, task)).toRouteNextTo(`${path}/1099-div-payer`);
  });
  it(`payer to boxes 1a and 1b`, ({ task }) => {
    expect(at(base(`single`), `1099-div-payer`, task)).toRouteNextTo(`${path}/1099-div-boxes-1a-1b`);
  });
  it(`asks about the holding period only when box 1b has an amount`, ({ task }) => {
    const withQd = base(`single`, {
      [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`),
      [`/dividendReports/#${id}/writableQualifiedDividends`]: createDollarWrapper(`300`),
    });
    expect(at(withQd, `1099-div-boxes-1a-1b`, task)).toRouteNextTo(`${path}/1099-div-holding-period`);
    const noQd = base(`single`, { [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`) });
    expect(at(noQd, `1099-div-boxes-1a-1b`, task)).toRouteNextTo(`${path}/1099-div-box-2a`);
  });
  it(`a holding-period failure routes to its knockout`, ({ task }) => {
    const g = base(`single`, {
      [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`),
      [`/dividendReports/#${id}/writableQualifiedDividends`]: createDollarWrapper(`300`),
      [`/dividendReports/#${id}/qualifiedDividendsHoldingPeriodNotMet`]: createBooleanWrapper(true),
    });
    expect(at(g, `1099-div-holding-period`, task)).toRouteNextTo(`${path}/1099-div-holding-period-knockout`);
  });
  it(`box 2a > 0 continues to box 3 (#86b: Form 1040 line 7a or Schedule D line 13, no knockout)`, ({ task }) => {
    const g = base(`single`, {
      [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`),
      [`/dividendReports/#${id}/writableCapitalGainDistributions`]: createDollarWrapper(`10`),
    });
    expect(at(g, `1099-div-box-2a`, task)).toRouteNextTo(`${path}/1099-div-box-2b`);
    expect(at(g, `1099-div-box-2b`, task)).toRouteNextTo(`${path}/1099-div-box-2d`);
    expect(at(g, `1099-div-box-2d`, task)).toRouteNextTo(`${path}/1099-div-boxes-2e-2f`);
    expect(at(g, `1099-div-boxes-2e-2f`, task)).toRouteNextTo(`${path}/1099-div-box-3`);
    const withLoss = base(`single`, {
      [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`),
      [`/dividendReports/#${id}/writableCapitalGainDistributions`]: createDollarWrapper(`3000`),
      [`/dividendReports/#${id}/writableCollectibles28RateGain`]: createDollarWrapper(`1000`),
      '/writableLongTermCapitalLossCarryover': createDollarWrapper(`200`),
    });
    expect(at(withLoss, `1099-div-box-2d`, task)).toRouteNextTo(`${path}/1099-div-box-2d-loss-knockout`);
    const overBox2d = base(`single`, {
      [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`),
      [`/dividendReports/#${id}/writableCapitalGainDistributions`]: createDollarWrapper(`3000`),
      [`/dividendReports/#${id}/writableCollectibles28RateGain`]: createDollarWrapper(`3001`),
    });
    expect(at(overBox2d, `1099-div-box-6`, task)).toRouteNextTo(`${path}/1099-div-amounts-knockout`);
  });
  it(`box 3 asks about basis, and above basis routes to its knockout`, ({ task }) => {
    const box3 = { [`/dividendReports/#${id}/writableNondividendDistributions`]: createDollarWrapper(`50`) };
    const ord = { [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`) };
    expect(at(base(`single`, { ...ord, ...box3 }), `1099-div-box-3`, task)).toRouteNextTo(
      `${path}/1099-div-box-3-basis`
    );
    expect(at(base(`single`, ord), `1099-div-box-3`, task)).toRouteNextTo(`${path}/1099-div-box-4`);
    const over = base(`single`, {
      ...ord,
      ...box3,
      [`/dividendReports/#${id}/nondividendDistributionsExceedBasis`]: createBooleanWrapper(true),
    });
    expect(at(over, `1099-div-box-3-basis`, task)).toRouteNextTo(`${path}/1099-div-box-3-knockout`);
  });
  it(`box 4 to box 5; box 5 asks the REIT holding period; a no stops; box 7 asks about the 904(j) requirements`, ({
    task,
  }) => {
    const ord = { [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`) };
    expect(at(base(`single`, ord), `1099-div-box-4`, task)).toRouteNextTo(`${path}/1099-div-box-5`);
    const box5 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection199ADividends`]: createDollarWrapper(`5`),
    });
    expect(at(box5, `1099-div-box-5`, task)).toRouteNextTo(`${path}/1099-div-box-5-holding`);
    const held = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection199ADividends`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(true),
    });
    expect(at(held, `1099-div-box-5-holding`, task)).toRouteNextTo(`${path}/1099-div-box-5-carryforward`);
    const noCarry = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection199ADividends`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
    });
    expect(at(noCarry, `1099-div-box-5-carryforward`, task)).toRouteNextTo(`${path}/1099-div-box-6`);
    const carry = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection199ADividends`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(true),
      '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(true),
    });
    expect(at(carry, `1099-div-box-5-carryforward`, task)).toRouteNextTo(`${path}/1099-div-box-5-qbi-knockout`);
    const notQualified = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection199ADividends`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/section199ADividendsHoldingPeriodMet`]: createBooleanWrapper(false),
    });
    expect(at(notQualified, `1099-div-box-5-holding`, task)).toRouteNextTo(`${path}/1099-div-box-5-knockout`);
    expect(at(base(`single`, ord), `1099-div-box-5`, task)).toRouteNextTo(`${path}/1099-div-box-6`);
    const atBox6 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableInvestmentExpenses`]: createDollarWrapper(`500`),
    });
    expect(at(atBox6, `1099-div-box-6`, task)).toRouteNextTo(`${path}/1099-div-box-7`);
    const overBox6 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableInvestmentExpenses`]: createDollarWrapper(`501`),
    });
    expect(at(overBox6, `1099-div-box-6`, task)).toRouteNextTo(`${path}/1099-div-amounts-knockout`);
    const overBox2e = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableSection897OrdinaryDividends`]: createDollarWrapper(`501`),
    });
    expect(at(overBox2e, `1099-div-box-6`, task)).toRouteNextTo(`${path}/1099-div-amounts-knockout`);
    expect(at(base(`single`, ord), `1099-div-box-6`, task)).toRouteNextTo(`${path}/1099-div-box-7`);
    const box7 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableForeignTaxPaid`]: createDollarWrapper(`5`),
    });
    expect(at(box7, `1099-div-box-7`, task)).toRouteNextTo(`${path}/1099-div-box-7-election`);
    const declined = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableForeignTaxPaid`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/foreignTaxElectionRequirementsMet`]: createBooleanWrapper(false),
    });
    expect(at(declined, `1099-div-box-7-election`, task)).toRouteNextTo(`${path}/1099-div-box-7-knockout`);
    const elected = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableForeignTaxPaid`]: createDollarWrapper(`5`),
      [`/dividendReports/#${id}/foreignTaxElectionRequirementsMet`]: createBooleanWrapper(true),
    });
    expect(at(elected, `1099-div-box-7-election`, task)).toRouteNextTo(`${path}/1099-div-box-9`);
    expect(at(base(`single`, ord), `1099-div-box-7`, task)).toRouteNextTo(`${path}/1099-div-box-9`);
    expect(at(base(`single`, ord), `1099-div-box-9`, task)).toRouteNextTo(`${path}/1099-div-box-10`);
    const box9 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableCashLiquidationDistributions`]: createDollarWrapper(`5000`),
    });
    expect(at(box9, `1099-div-box-10`, task)).toRouteNextTo(`${path}/1099-div-liquidation-basis`);
    const box10 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableNoncashLiquidationDistributions`]: createDollarWrapper(`2000`),
    });
    expect(at(box10, `1099-div-box-10`, task)).toRouteNextTo(`${path}/1099-div-liquidation-basis`);
    const underBasis = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableCashLiquidationDistributions`]: createDollarWrapper(`5000`),
      [`/dividendReports/#${id}/liquidationDistributionsExceedBasis`]: createBooleanWrapper(false),
    });
    expect(at(underBasis, `1099-div-liquidation-basis`, task)).toRouteNextTo(`${path}/1099-div-box-12`);
    const overBasis = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableNoncashLiquidationDistributions`]: createDollarWrapper(`2000`),
      [`/dividendReports/#${id}/liquidationDistributionsExceedBasis`]: createBooleanWrapper(true),
    });
    expect(at(overBasis, `1099-div-liquidation-basis`, task)).toRouteNextTo(`${path}/1099-div-liquidation-knockout`);
    expect(at(base(`single`, ord), `1099-div-box-10`, task)).toRouteNextTo(`${path}/1099-div-box-12`);
    expect(at(base(`single`, ord), `1099-div-box-12`, task)).toRouteNextTo(`${path}/1099-div-box-13`);
    const box12 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableExemptInterestDividends`]: createDollarWrapper(`80`),
    });
    expect(at(box12, `1099-div-box-12`, task)).toRouteNextTo(`${path}/1099-div-box-13`);
    expect(at(box12, `1099-div-box-13`, task)).toRouteNextTo(`${path}/1099-div-box-11`);
    const box13 = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableExemptInterestDividends`]: createDollarWrapper(`80`),
      [`/dividendReports/#${id}/writableSpecifiedPrivateActivityBondInterestDividends`]: createDollarWrapper(`80`),
    });
    expect(at(box13, `1099-div-box-13`, task)).toRouteNextTo(`${path}/1099-div-box-11`);
    const box13Over = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableExemptInterestDividends`]: createDollarWrapper(`80`),
      [`/dividendReports/#${id}/writableSpecifiedPrivateActivityBondInterestDividends`]: createDollarWrapper(`81`),
    });
    expect(at(box13Over, `1099-div-box-13`, task)).toRouteNextTo(`${path}/1099-div-box-13-knockout`);
  });
  it(`box 11 checked asks Form 8938; unchecked does not; Yes stops and No continues`, ({ task }) => {
    // Form 1099-DIV (Rev. December 2027) draft, Instructions for Recipient, Box 11. 26 U.S.C. 6038D.
    const ord = { [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`) };
    const unchecked = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(false),
    });
    expect(at(unchecked, `1099-div-box-11`, task)).toRouteNextTo(`${path}/1099-div-boxes-14-16`);
    const checked = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(true),
    });
    expect(at(checked, `1099-div-box-11`, task)).toRouteNextTo(`${path}/1099-div-form-8938`);
    const form8938No = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(true),
      '/requiredToFileForm8938': createBooleanWrapper(false),
    });
    expect(at(form8938No, `1099-div-form-8938`, task)).toRouteNextTo(`${path}/1099-div-boxes-14-16`);
    const form8938Yes = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(true),
      '/requiredToFileForm8938': createBooleanWrapper(true),
    });
    expect(at(form8938Yes, `1099-div-form-8938`, task)).toRouteNextTo(`${path}/1099-div-form-8938-knockout`);
    const line7aYes = base(`single`, {
      ...ord,
      '/hasForeignAccounts': createBooleanWrapper(true),
      [`/dividendReports/#${id}/fatcaFilingRequirement`]: createBooleanWrapper(true),
    });
    expect(at(line7aYes, `1099-div-box-11`, task)).toRouteNextTo(`${path}/1099-div-boxes-14-16`);
  });
  it(`other boxes and nominee answers route to their knockouts`, ({ task }) => {
    const ord = { [`/dividendReports/#${id}/ordinaryDividends`]: createDollarWrapper(`500`) };
    const stateInfo = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
    });
    expect(at(stateInfo, `1099-div-boxes-14-16`, task)).toRouteNextTo(`${path}/1099-div-unsupported-boxes`);
    const box14 = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/writableStateTaxWithheld`]: createDollarWrapper(`25`),
      [`/dividendReports/#${id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
    });
    expect(at(box14, `1099-div-boxes-14-16`, task)).toRouteNextTo(`${path}/1099-div-box-14-knockout`);
    const nyBox14 = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`ny`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/writableStateTaxWithheld`]: createDollarWrapper(`100`),
      [`/dividendReports/#${id}/writableState`]: createEnumWrapper(`sameState`, `/incomeFormStateOptions`),
    });
    expect(at(nyBox14, `1099-div-boxes-14-16`, task)).toRouteNextTo(`${path}/1099-div-unsupported-boxes`);
    const nyOtherState = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`ny`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/writableStateTaxWithheld`]: createDollarWrapper(`25`),
      [`/dividendReports/#${id}/writableState`]: createEnumWrapper(`differentState`, `/incomeFormStateOptions`),
    });
    expect(at(nyOtherState, `1099-div-boxes-14-16`, task)).toRouteNextTo(`${path}/1099-div-box-14-knockout`);
    const box16 = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`pa`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/writableStateDistribution`]: createDollarWrapper(`100`),
    });
    expect(at(box16, `1099-div-boxes-14-16`, task)).toRouteNextTo(`${path}/1099-div-box-16-knockout`);
    const other = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(true),
    });
    expect(at(other, `1099-div-unsupported-boxes`, task)).toRouteNextTo(`${path}/1099-div-unsupported-boxes-knockout`);
    const none = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
    });
    expect(at(none, `1099-div-unsupported-boxes`, task)).toRouteNextTo(`${path}/1099-div-nominee`);
    const nominee = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(true),
    });
    expect(at(nominee, `1099-div-nominee`, task)).toRouteNextTo(`${path}/1099-div-nominee-ordinary`);
    const qualified = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/writableQualifiedDividends`]: createDollarWrapper(`200`),
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(true),
      [`/dividendReports/#${id}/writableNomineeOrdinaryDividends`]: createDollarWrapper(`100`),
    });
    expect(at(qualified, `1099-div-nominee-ordinary`, task)).toRouteNextTo(`${path}/1099-div-nominee-qualified`);
    const otherBoxes = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(true),
      [`/dividendReports/#${id}/writableNomineeOrdinaryDividends`]: createDollarWrapper(`100`),
    });
    expect(at(otherBoxes, `1099-div-nominee-ordinary`, task)).toRouteNextTo(`${path}/1099-div-nominee-other-boxes`);
    const stops = base(`single`, {
      ...ord,
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(true),
      [`/dividendReports/#${id}/writableNomineeOrdinaryDividends`]: createDollarWrapper(`100`),
      [`/dividendReports/#${id}/nomineeShareOfOtherBoxes`]: createBooleanWrapper(true),
    });
    expect(at(stops, `1099-div-nominee-other-boxes`, task)).toRouteNextTo(`${path}/1099-div-nominee-knockout`);
    const supported = base(`single`, {
      ...ord,
      '/filerResidenceAndIncomeState': createEnumWrapper(`fl`, `/scopedStateOptions`),
      [`/dividendReports/#${id}/hasUnsupportedBoxes`]: createBooleanWrapper(false),
      [`/dividendReports/#${id}/receivedAsNominee`]: createBooleanWrapper(true),
      [`/dividendReports/#${id}/writableNomineeOrdinaryDividends`]: createDollarWrapper(`100`),
      [`/dividendReports/#${id}/nomineeShareOfOtherBoxes`]: createBooleanWrapper(false),
    });
    expect(at(supported, `1099-div-nominee-other-boxes`, task)).toRouteNextTo(`${path}/1099-div-nominee-filing-duty`);
  });
});
