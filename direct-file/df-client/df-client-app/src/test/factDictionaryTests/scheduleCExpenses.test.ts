import { describe, it, expect } from 'vitest';
import { ConcretePath } from '@irs/js-factgraph-scala';
import {
  createBooleanWrapper,
  createCollectionItemWrapper,
  createCollectionWrapper,
  createDollarWrapper,
  createEnumWrapper,
  createMultEnumWrapper,
  createStringWrapper,
} from '../persistenceWrappers.js';
import { setupFactGraph } from '../setupFactGraph.js';

const primaryFilerId = `959c03d1-af4a-447f-96aa-d19397048a44`;

/**
 * Schedule C lines 1-8, 10, 11, 14-27b, 28, and 31, plus the out-of-scope stops.
 * 26 U.S.C. 61, 162, 274(n), 465, 469. 2026 draft Schedule C and its instructions.
 */
const biz = `c59c03d1-af4a-447f-96aa-d19397048a11`;
const biz2 = `c59c03d1-af4a-447f-96aa-d19397048a12`;
const options = `/scheduleCExpenseLineOptions`;

const stopsOff = {
  hasInventoryOrCogs: false,
  hasCarTruckOrVehicleLoan: false,
  hasDepreciationOrSection179: false,
  hasDepletion: false,
  hasVehicleMachineryEquipmentRent: false,
  hasHomeOffice: false,
  hasEnergyEfficientBuildingsDeduction: false,
};

function dollars(path: string, amount: string) {
  return { [path]: createDollarWrapper(amount) };
}

function flag(path: string, value: boolean) {
  return { [path]: createBooleanWrapper(value) };
}

function business(id: string, facts: Record<string, ReturnType<typeof createDollarWrapper>>) {
  return {
    [`/scheduleCBusinesses/#${id}/filer`]: createCollectionItemWrapper(primaryFilerId),
    [`/scheduleCBusinesses/#${id}/businessName`]: createStringWrapper(`Synthetic Consulting`),
    [`/scheduleCBusinesses/#${id}/materiallyParticipates`]: createBooleanWrapper(true),
    ...facts,
  };
}

function stops(id: string, overrides: Partial<typeof stopsOff> = {}) {
  return Object.fromEntries(
    Object.entries({ ...stopsOff, ...overrides }).map(([key, value]) => [
      `/scheduleCBusinesses/#${id}/${key}`,
      createBooleanWrapper(value),
    ])
  );
}

function base(ids: string[], facts: Record<string, unknown>) {
  const { factGraph } = setupFactGraph({
    '/filers': createCollectionWrapper([primaryFilerId]),
    [`/filers/#${primaryFilerId}/firstName`]: createStringWrapper(`Test`),
    [`/filers/#${primaryFilerId}/isPrimaryFiler`]: createBooleanWrapper(true),
    '/maritalStatus': createEnumWrapper(`single`, `/maritalStatusOptions`),
    '/filingStatus': createEnumWrapper(`single`, `/filingStatusOptions`),
    '/hadSelfEmploymentIncome': createBooleanWrapper(true),
    '/qbiHasPriorYearLossCarryforward': createBooleanWrapper(false),
    '/qbiIsCooperativePatron': createBooleanWrapper(false),
    '/scheduleCBusinesses': createCollectionWrapper(ids),
    '/scheduleCBusinessesIsDone': createBooleanWrapper(true),
    ...facts,
  });
  const get = (path: string) => factGraph.get(path as ConcretePath);
  return { get };
}

const p = (id: string, tail: string) => `/scheduleCBusinesses/#${id}/${tail}`;

describe(`Schedule C expense lines`, () => {
  it(`keeps a single expense total on lines 1, 7, 28, and 31`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `10000`),
        ...dollars(p(biz, `writableTotalExpenses`), `2000`),
      }),
    });
    expect(get(p(biz, `line2ReturnsAndAllowances`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `line6OtherIncome`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `line7GrossIncome`)).get.toString()).toBe(`10000.00`);
    expect(get(p(biz, `totalExpenses`)).get.toString()).toBe(`2000.00`);
    expect(get(`/scheduleCNetProfitOrLoss`).get.toString()).toBe(`8000.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
    expect(get(p(biz, `line8Advertising`)).complete).toBe(false);
  });

  it(`does not treat an unanswered expense as zero`, () => {
    const { get } = base([biz], {
      ...business(biz, dollars(p(biz, `writableGrossReceipts`), `10000`)),
    });
    expect(get(p(biz, `totalExpenses`)).complete).toBe(false);
    expect(get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`figures lines 2, 6, 7, 8, 24b, 27b, 28, and 31 and ignores a stored expense total`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `10000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `500`),
        ...dollars(p(biz, `writableOtherIncome`), `200`),
        ...dollars(p(biz, `writableTotalExpenses`), `9999`),
        ...dollars(p(biz, `writableAdvertising`), `100`),
        ...dollars(p(biz, `writableMeals`), `101`),
        ...dollars(p(biz, `partV1Amount`), `40`),
      }),
      ...stops(biz),
      ...flag(p(biz, `otherIncomeNeedsAnotherForm`), false),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper(
        [`advertising`, `meals`, `otherExpenses`],
        options
      ),
      ...flag(p(biz, `mealsAreStandardHalfLimit`), true),
      ...flag(p(biz, `partVIncludesNewAmortization`), false),
      ...flag(p(biz, `hasAnotherPartVExpense`), false),
      [p(biz, `partV1Description`)]: createStringWrapper(`Bank fees`),
    });
    // line 3 = 10,000 - 500; line 5 = line 3; line 7 = 9,500 + 200
    expect(get(p(biz, `line7GrossIncome`)).get.toString()).toBe(`9700.00`);
    // 26 U.S.C. 274(n): half of 101 is 50.50, rounded half up to 51
    expect(get(p(biz, `line24bDeductibleMeals`)).get.toString()).toBe(`51.00`);
    expect(get(p(biz, `line27bOtherExpenses`)).get.toString()).toBe(`40.00`);
    expect(get(p(biz, `line28`)).get.toString()).toBe(`191.00`);
    expect(get(p(biz, `netProfitOrLoss`)).get.toString()).toBe(`9509.00`);
    expect(get(`/schedule1Line3`).get.toString()).toBe(`9509.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
    expect(get(p(biz, `line32aAllInvestmentAtRisk`)).get).toBe(false);
  });

  it(`adds a line-item profit and a single-total loss before Schedule SE`, () => {
    const { get } = base([biz, biz2], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `10000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableAdvertising`), `2000`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`advertising`], options),
      ...business(biz2, {
        ...dollars(p(biz2, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz2, `writableTotalExpenses`), `5000`),
      }),
    });
    // 8,000 profit offsets a 4,000 loss. 4,000 x 92.35% = 3,694. 26 U.S.C. 1402(a).
    expect(get(`/scheduleCNetProfitOrLoss`).get.toString()).toBe(`4000.00`);
    expect(get(`/primaryFilerSeNetProfit`).get.toString()).toBe(`4000.00`);
    expect(get(`/seNetEarningsFromSelfEmployment`).get.toString()).toBe(`3694.00`);
    expect(get(`/selfEmploymentTax`).get.toString()).toBe(`565.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`lets a fully at-risk loss flow and checks line 32a`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableAdvertising`), `1500`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`advertising`], options),
      ...flag(p(biz, `allInvestmentAtRisk`), true),
    });
    expect(get(p(biz, `netProfitOrLoss`)).get.toString()).toBe(`-500.00`);
    expect(get(p(biz, `line32aAllInvestmentAtRisk`)).get).toBe(true);
    expect(get(p(biz, `line32bSomeInvestmentNotAtRisk`)).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
    expect(get(`/selfEmploymentTax`).get.toString()).toBe(`0.00`);
  });

  it(`stops a loss without material participation and still reports the loss`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableAdvertising`), `1500`),
      }),
      [`/scheduleCBusinesses/#${biz}/materiallyParticipates`]: createBooleanWrapper(false),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`advertising`], options),
    });
    expect(get(p(biz, `netProfitOrLoss`)).get.toString()).toBe(`-500.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });

  it(`stops a loss that is not fully at risk and checks line 32b`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableAdvertising`), `1500`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`advertising`], options),
      ...flag(p(biz, `allInvestmentAtRisk`), false),
    });
    expect(get(p(biz, `line32bSomeInvestmentNotAtRisk`)).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });

  it(`stops inventory, a home office, a non-50-percent meal, and line 6 that needs another form`, () => {
    const common = {
      ...dollars(p(biz, `writableGrossReceipts`), `5000`),
      ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
      ...dollars(p(biz, `writableOtherIncome`), `0`),
    };
    const inventory = base([biz], {
      ...business(biz, common),
      ...stops(biz, { hasInventoryOrCogs: true }),
    });
    expect(inventory.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(inventory.get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
    expect(inventory.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const home = base([biz], {
      ...business(biz, common),
      ...stops(biz, { hasHomeOffice: true }),
    });
    expect(home.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const meals = base([biz], {
      ...business(biz, { ...common, ...dollars(p(biz, `writableMeals`), `80`) }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`meals`], options),
      ...flag(p(biz, `mealsAreStandardHalfLimit`), false),
    });
    expect(meals.get(p(biz, `line24bDeductibleMeals`)).complete).toBe(false);
    expect(meals.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const otherForm = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `5000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `300`),
      }),
      ...stops(biz),
      ...flag(p(biz, `otherIncomeNeedsAnotherForm`), true),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(otherForm.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
    expect(otherForm.get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
  });

  it(`stops interest that must be allocated, new amortization, and a fourth Part V line`, () => {
    const interest = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `4000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableMortgageInterest`), `100`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`mortgageInterest`], options),
      ...flag(p(biz, `interestNeedsAllocation`), true),
    });
    expect(interest.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const partV = {
      ...dollars(p(biz, `writableGrossReceipts`), `4000`),
      ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
      ...dollars(p(biz, `writableOtherIncome`), `0`),
      ...dollars(p(biz, `partV1Amount`), `10`),
      ...dollars(p(biz, `partV2Amount`), `20`),
      ...dollars(p(biz, `partV3Amount`), `30`),
    };
    const shared = {
      ...business(biz, partV),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([`otherExpenses`], options),
      [p(biz, `partV1Description`)]: createStringWrapper(`Bank fees`),
      [p(biz, `partV2Description`)]: createStringWrapper(`Dues`),
      [p(biz, `partV3Description`)]: createStringWrapper(`Postage`),
      ...flag(p(biz, `hasAnotherPartVExpense`), true),
      ...flag(p(biz, `hasAnotherPartVExpense2`), true),
    };
    const three = base([biz], {
      ...shared,
      ...flag(p(biz, `partVIncludesNewAmortization`), false),
      ...flag(p(biz, `hasMorePartVExpenses`), false),
    });
    expect(three.get(p(biz, `line27bOtherExpenses`)).get.toString()).toBe(`60.00`);
    expect(three.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);

    const fourth = base([biz], {
      ...shared,
      ...flag(p(biz, `partVIncludesNewAmortization`), false),
      ...flag(p(biz, `hasMorePartVExpenses`), true),
    });
    expect(fourth.get(p(biz, `line27bOtherExpenses`)).complete).toBe(false);
    expect(fourth.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const amort = base([biz], {
      ...shared,
      ...flag(p(biz, `partVIncludesNewAmortization`), true),
      ...flag(p(biz, `hasMorePartVExpenses`), false),
    });
    expect(amort.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });

  it(`leaves line 28 incomplete when expenses were claimed but no line was selected`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), true),
      [p(biz, `expenseLinesChosen`)]: createMultEnumWrapper([], options),
    });
    expect(get(p(biz, `line28`)).complete).toBe(false);
    expect(get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
  });

  it(`is complete and false with no self-employment income`, () => {
    const { factGraph } = setupFactGraph({
      '/hadSelfEmploymentIncome': createBooleanWrapper(false),
    });
    const knockout = factGraph.get(`/flowKnockoutScheduleCOutOfScope` as ConcretePath);
    expect(knockout.complete).toBe(true);
    expect(knockout.get).toBe(false);
  });

  it(`is complete and false when self-employment income was not asked`, () => {
    const { factGraph } = setupFactGraph({});
    const knockout = factGraph.get(`/flowKnockoutScheduleCOutOfScope` as ConcretePath);
    expect(knockout.complete).toBe(true);
    expect(knockout.get).toBe(false);
  });
});
