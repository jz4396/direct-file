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
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`0.00`);
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

  it(`leaves an unanswered inventory method incomplete and stops a home office, a non-50-percent meal, and line 6 that needs another form`, () => {
    const common = {
      ...dollars(p(biz, `writableGrossReceipts`), `5000`),
      ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
      ...dollars(p(biz, `writableOtherIncome`), `0`),
    };
    // Yes to inventory, with line 33 still blank, is not a completed stop. Line 4 stays incomplete.
    const inventory = base([biz], {
      ...business(biz, common),
      ...stops(biz, { hasInventoryOrCogs: true }),
    });
    expect(inventory.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(inventory.get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
    expect(inventory.get(`/flowKnockoutScheduleCOutOfScope`).complete).toBe(false);

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

const methodOptions = `/scheduleCInventoryMethodOptions`;

/**
 * 2026 draft Schedule C, PDF p. 3. Line 36 is purchases less personal use. Line 40 adds lines 35 through 39.
 * Line 42 subtracts line 41 from line 40 and is line 4.
 * Hand worksheet: 1,000 + (5,000 − 200) + 300 + 400 + 50 = 6,550; 6,550 − 1,500 = 5,050.
 */
const worksheet = {
  beginning: `1000`,
  purchases: `5000`,
  personal: `200`,
  labor: `300`,
  materials: `400`,
  other: `50`,
  ending: `1500`,
};

const zeroInventory = {
  beginning: `0`,
  purchases: `0`,
  personal: `0`,
  labor: `0`,
  materials: `0`,
  other: `0`,
  ending: `0`,
};

function method(id: string, value: string) {
  return {
    [p(id, `inventoryAccountingMethod`)]: createEnumWrapper(value, methodOptions),
  };
}

function partIIIAmounts(
  id: string,
  amounts: {
    beginning: string;
    purchases: string;
    personal: string;
    labor: string;
    materials: string;
    other: string;
    ending: string;
  }
) {
  return {
    ...dollars(p(id, `writableInventoryAtBeginning`), amounts.beginning),
    ...dollars(p(id, `writablePurchases`), amounts.purchases),
    ...dollars(p(id, `writablePersonalUseWithdrawals`), amounts.personal),
    ...dollars(p(id, `writableInventoryLabor`), amounts.labor),
    ...dollars(p(id, `writableInventoryMaterials`), amounts.materials),
    ...dollars(p(id, `writableInventoryOtherCosts`), amounts.other),
    ...dollars(p(id, `writableInventoryAtEnd`), amounts.ending),
  };
}

function simplePartIII(id: string, receipts: string, inventoryMethod = `cost`, amounts = worksheet) {
  return {
    ...business(id, {
      ...dollars(p(id, `writableGrossReceipts`), receipts),
      ...dollars(p(id, `writableReturnsAndAllowances`), `0`),
      ...dollars(p(id, `writableOtherIncome`), `0`),
      ...dollars(p(id, `writablePriorThreeYearAverageGrossReceipts`), `0`),
      ...partIIIAmounts(id, amounts),
    }),
    ...stops(id, { hasInventoryOrCogs: true }),
    ...method(id, inventoryMethod),
    ...flag(p(id, `inventoryValuationChanged`), false),
    ...flag(p(id, `isTaxShelter`), false),
    ...flag(p(id, `openingInventoryDiffersFromPriorClosing`), false),
    ...flag(p(id, `hasDeductibleExpenses`), false),
  };
}

describe(`Schedule C Part III cost of goods sold`, () => {
  it(`carries the hand worksheet to line 4, Schedule 1, and Schedule SE`, () => {
    const { get } = base([biz], simplePartIII(biz, `20000`));
    expect(get(`/scheduleCSmallBusinessGrossReceiptsLimit`).get.toString()).toBe(`32000000.00`);
    expect(get(p(biz, `line35InventoryAtBeginning`)).get.toString()).toBe(`1000.00`);
    expect(get(p(biz, `line36PurchasesLessPersonalUse`)).get.toString()).toBe(`4800.00`);
    expect(get(p(biz, `line37InventoryLabor`)).get.toString()).toBe(`300.00`);
    expect(get(p(biz, `line38InventoryMaterials`)).get.toString()).toBe(`400.00`);
    expect(get(p(biz, `line39InventoryOtherCosts`)).get.toString()).toBe(`50.00`);
    expect(get(p(biz, `line40GoodsAvailable`)).get.toString()).toBe(`6550.00`);
    expect(get(p(biz, `line41InventoryAtEnd`)).get.toString()).toBe(`1500.00`);
    expect(get(p(biz, `line42CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(get(p(biz, `line42IsNegative`)).get).toBe(false);
    expect(get(p(biz, `line35DiffersFromPriorYearClosing`)).get).toBe(false);
    expect(get(p(biz, `failsSection448cGrossReceiptsTest`)).get).toBe(false);
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(get(p(biz, `line33aCost`)).get).toBe(true);
    expect(get(p(biz, `line33bLowerOfCostOrMarket`)).get).toBe(false);
    expect(get(p(biz, `line34ChangeNo`)).get).toBe(true);
    expect(get(p(biz, `line3`)).get.toString()).toBe(`20000.00`);
    expect(get(p(biz, `line5GrossProfit`)).get.toString()).toBe(`14950.00`);
    expect(get(p(biz, `line7GrossIncome`)).get.toString()).toBe(`14950.00`);
    expect(get(p(biz, `line28`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `netProfitOrLoss`)).get.toString()).toBe(`14950.00`);
    expect(get(`/scheduleCNetProfitOrLoss`).get.toString()).toBe(`14950.00`);
    expect(get(`/schedule1Line3`).get.toString()).toBe(`14950.00`);
    // 14,950 × 92.35% = 13,806.325, rounded half up to 13,806. 26 U.S.C. 1402(a)(12).
    expect(get(`/seNetEarningsFromSelfEmployment`).get.toString()).toBe(`13806.00`);
    expect(get(`/selfEmploymentTax`).get.toString()).toBe(`2112.00`);
    expect(get(`/deductibleSelfEmploymentTax`).get.toString()).toBe(`1056.00`);
    expect(get(p(biz, `partIIIStop`)).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).complete).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`uses the same dollars for lower of cost or market`, () => {
    const { get } = base([biz], simplePartIII(biz, `20000`, `lowerOfCostOrMarket`));
    expect(get(p(biz, `line33bLowerOfCostOrMarket`)).get).toBe(true);
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(get(`/schedule1Line3`).get.toString()).toBe(`14950.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`keeps line 4 at zero when there is no inventory and Part III is blank`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `20000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `netProfitOrLoss`)).get.toString()).toBe(`20000.00`);
    expect(get(p(biz, `line35DiffersFromPriorYearClosing`)).complete).toBe(true);
    expect(get(p(biz, `line35DiffersFromPriorYearClosing`)).get).toBe(false);
    expect(get(p(biz, `line42IsNegative`)).complete).toBe(true);
    expect(get(p(biz, `line42IsNegative`)).get).toBe(false);
    expect(get(p(biz, `partIIIStop`)).get).toBe(false);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`keeps line 4 at zero for the section 471(c) method with no Part III amounts`, () => {
    const { get } = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `8000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...partIIIAmounts(biz, zeroInventory),
      }),
      ...stops(biz),
      ...method(biz, `nonincidentalMaterialsAndSupplies`),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(get(p(biz, `partIIIContradictsNoInventory`)).get).toBe(false);
    expect(get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`0.00`);
    expect(get(`/schedule1Line3`).get.toString()).toBe(`8000.00`);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);
  });

  it(`uses this year's line 1 only as receipts, and stops when the 3-prior-year average exceeds $32,000,000`, () => {
    // Rev. Proc. 2025-32 §4.30, PDF p. 23: the § 448(c) test "does not exceed $32,000,000."
    // The test is the prior 3 years, not this year's line 1.
    const atLimit = base([biz], {
      ...simplePartIII(biz, `32000001`, `cost`, zeroInventory),
      ...dollars(p(biz, `writablePriorThreeYearAverageGrossReceipts`), `32000000`),
    });
    expect(atLimit.get(p(biz, `failsSection448cGrossReceiptsTest`)).get).toBe(false);
    expect(atLimit.get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`0.00`);
    expect(atLimit.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);

    const over = base([biz], {
      ...simplePartIII(biz, `20000`, `cost`, zeroInventory),
      ...dollars(p(biz, `writablePriorThreeYearAverageGrossReceipts`), `32000001`),
    });
    expect(over.get(p(biz, `failsSection448cGrossReceiptsTest`)).get).toBe(true);
    expect(over.get(p(biz, `simplePartIIIApplies`)).get).toBe(false);
    expect(over.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(over.get(p(biz, `netProfitOrLoss`)).complete).toBe(false);
    expect(over.get(p(biz, `partIIIStop`)).get).toBe(true);
    expect(over.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
    expect(over.get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`stops a tax shelter even when the 3-prior-year average does not exceed $32,000,000`, () => {
    const { get } = base([biz], {
      ...simplePartIII(biz, `20000`),
      ...flag(p(biz, `isTaxShelter`), true),
    });
    expect(get(p(biz, `failsSection448cGrossReceiptsTest`)).get).toBe(false);
    expect(get(p(biz, `simplePartIIIApplies`)).get).toBe(false);
    expect(get(p(biz, `line42CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(get(p(biz, `partIIIStop`)).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`stops a negative line 42 and does not replace it with zero`, () => {
    const negative = {
      beginning: `0`,
      purchases: `0`,
      personal: `0`,
      labor: `0`,
      materials: `0`,
      other: `0`,
      ending: `100`,
    };
    const { get } = base([biz], simplePartIII(biz, `20000`, `cost`, negative));
    expect(get(p(biz, `line40GoodsAvailable`)).get.toString()).toBe(`0.00`);
    expect(get(p(biz, `line42CostOfGoodsSold`)).get.toString()).toBe(`-100.00`);
    expect(get(p(biz, `line42IsNegative`)).get).toBe(true);
    expect(get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(get(p(biz, `partIIIStop`)).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`stops when the line 35 screener says opening inventory differs from last year's closing inventory`, () => {
    const { get } = base([biz], {
      ...simplePartIII(biz, `20000`),
      ...flag(p(biz, `openingInventoryDiffersFromPriorClosing`), true),
    });
    expect(get(p(biz, `asksLine35Screener`)).get).toBe(true);
    expect(get(p(biz, `line35DiffersFromPriorYearClosing`)).get).toBe(true);
    expect(get(p(biz, `simplePartIIIApplies`)).get).toBe(false);
    expect(get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(get(p(biz, `partIIIStop`)).get).toBe(true);
    expect(get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
    expect(get(`/flowIsKnockedOut`).get).toBe(true);
  });

  it(`leaves an unanswered 3-prior-year average or line 35 screener incomplete`, () => {
    const withoutAverage = simplePartIII(biz, `20000`) as Record<string, unknown>;
    delete withoutAverage[p(biz, `writablePriorThreeYearAverageGrossReceipts`)];
    const unanswered = base([biz], withoutAverage);
    expect(unanswered.get(p(biz, `simplePartIIIApplies`)).complete).toBe(false);
    expect(unanswered.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(unanswered.get(`/flowKnockoutScheduleCOutOfScope`).complete).toBe(false);

    const withoutScreener = simplePartIII(biz, `20000`) as Record<string, unknown>;
    delete withoutScreener[p(biz, `openingInventoryDiffersFromPriorClosing`)];
    const missingScreener = base([biz], withoutScreener);
    expect(missingScreener.get(p(biz, `asksLine35Screener`)).get).toBe(true);
    expect(missingScreener.get(p(biz, `line35DiffersFromPriorYearClosing`)).complete).toBe(false);
    expect(missingScreener.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(missingScreener.get(`/flowKnockoutScheduleCOutOfScope`).complete).toBe(false);
  });

  it(`stops line 33c, a line 34 change, and the no-inventory method while Part III is required`, () => {
    const other = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `20000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
      }),
      ...stops(biz, { hasInventoryOrCogs: true }),
      ...method(biz, `other`),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(other.get(p(biz, `line33cOther`)).get).toBe(true);
    expect(other.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(other.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const changed = base([biz], {
      ...simplePartIII(biz, `20000`),
      ...flag(p(biz, `inventoryValuationChanged`), true),
    });
    expect(changed.get(p(biz, `line34ChangeYes`)).get).toBe(true);
    expect(changed.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(changed.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const noInventoryMethod = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `20000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
      }),
      ...stops(biz, { hasInventoryOrCogs: true }),
      ...method(biz, `nonincidentalMaterialsAndSupplies`),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(noInventoryMethod.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(noInventoryMethod.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });

  it(`stops Part III amounts or a cost method after a no to inventory`, () => {
    const amount = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `20000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
        ...dollars(p(biz, `writableInventoryAtBeginning`), `1000`),
      }),
      ...stops(biz),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(amount.get(p(biz, `partIIIContradictsNoInventory`)).get).toBe(true);
    expect(amount.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(amount.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);

    const costMethod = base([biz], {
      ...business(biz, {
        ...dollars(p(biz, `writableGrossReceipts`), `20000`),
        ...dollars(p(biz, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz, `writableOtherIncome`), `0`),
      }),
      ...stops(biz),
      ...method(biz, `cost`),
      ...flag(p(biz, `hasDeductibleExpenses`), false),
    });
    expect(costMethod.get(p(biz, `partIIIStop`)).get).toBe(true);
    expect(costMethod.get(p(biz, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(costMethod.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });

  it(`adds a Part III profit to a no-inventory business and stops the return when another business uses line 33c`, () => {
    const both = base([biz, biz2], {
      ...simplePartIII(biz, `20000`),
      ...business(biz2, {
        ...dollars(p(biz2, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz2, `writableTotalExpenses`), `0`),
      }),
    });
    expect(both.get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(both.get(`/scheduleCNetProfitOrLoss`).get.toString()).toBe(`15950.00`);
    expect(both.get(`/schedule1Line3`).get.toString()).toBe(`15950.00`);
    expect(both.get(`/seNetEarningsFromSelfEmployment`).get.toString()).toBe(`14730.00`);
    expect(both.get(`/selfEmploymentTax`).get.toString()).toBe(`2254.00`);
    expect(both.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(false);

    const stopped = base([biz, biz2], {
      ...simplePartIII(biz, `20000`),
      ...business(biz2, {
        ...dollars(p(biz2, `writableGrossReceipts`), `1000`),
        ...dollars(p(biz2, `writableReturnsAndAllowances`), `0`),
        ...dollars(p(biz2, `writableOtherIncome`), `0`),
      }),
      ...stops(biz2, { hasInventoryOrCogs: true }),
      ...method(biz2, `other`),
      ...flag(p(biz2, `hasDeductibleExpenses`), false),
    });
    expect(stopped.get(p(biz, `line4CostOfGoodsSold`)).get.toString()).toBe(`5050.00`);
    expect(stopped.get(p(biz2, `line4CostOfGoodsSold`)).complete).toBe(false);
    expect(stopped.get(`/scheduleCNetProfitOrLoss`).complete).toBe(false);
    expect(stopped.get(`/flowKnockoutScheduleCOutOfScope`).get).toBe(true);
  });
});
