import type { FoodNutrition, Nutrients, Totals, WeightPoint, WeightUnit } from './types';

export const KG_TO_LB = 2.2046226218;
export const LB_TO_KG = 0.45359237;
export const OZ_TO_G = 28.349523125;
export const LB_TO_G = 453.59237;
export const CALORIES_PER_POUND = 3500;

export function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function toLb(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value * KG_TO_LB : value;
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value * LB_TO_KG : value;
}

export function calculateLoggedNutrition(food: FoodNutrition, consumedQuantity: number): Nutrients {
  if (food.servingQuantity <= 0) {
    throw new Error('Serving quantity must be greater than zero.');
  }
  if (consumedQuantity <= 0) {
    throw new Error('Consumed quantity must be greater than zero.');
  }

  const ratio = consumedQuantity / food.servingQuantity;
  return {
    proteinG: round(food.proteinG * ratio, 2),
    fatG: round(food.fatG * ratio, 2),
    carbohydrateG: round(food.carbohydrateG * ratio, 2),
    calories: round(food.calories * ratio, 2),
  };
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const from = normalizeFoodUnit(fromUnit);
  const to = normalizeFoodUnit(toUnit);
  if (from === to) return quantity;

  const fromGrams = gramsPerUnit(from);
  const toGrams = gramsPerUnit(to);
  if (!fromGrams || !toGrams) {
    throw new Error(`Cannot convert from ${fromUnit} to ${toUnit}.`);
  }

  return (quantity * fromGrams) / toGrams;
}

export function convertConsumedQuantityToServingQuantity(food: FoodNutrition, quantity: number, quantityUnit: string): number {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  if (!food.servingUnit) return quantity;

  const consumedUnit = normalizeFoodUnit(quantityUnit);
  const servingUnit = normalizeFoodUnit(food.servingUnit);
  if (consumedUnit === servingUnit) return quantity;

  const consumedGrams = convertQuantityToGrams(quantity, consumedUnit, food);
  const gramsPerServingUnit = gramsPerFoodServingUnit(food);
  if (!gramsPerServingUnit) {
    throw new Error(`Cannot convert from ${quantityUnit} to ${food.servingUnit} without serving grams.`);
  }

  return consumedGrams / gramsPerServingUnit;
}

export function convertQuantityToGrams(quantity: number, unit: string, food?: FoodNutrition): number {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const normalized = normalizeFoodUnit(unit);
  const unitGrams = gramsPerUnit(normalized);
  if (unitGrams) return quantity * unitGrams;

  if (food?.servingUnit && normalizeFoodUnit(food.servingUnit) === normalized) {
    const gramsPerServingUnit = gramsPerFoodServingUnit(food);
    if (gramsPerServingUnit) return quantity * gramsPerServingUnit;
  }

  throw new Error(`Cannot convert ${unit} to grams without serving grams.`);
}

export function gramsPerFoodServingUnit(food: FoodNutrition): number | null {
  if (food.servingGrams && food.servingGrams > 0) return food.servingGrams / food.servingQuantity;
  if (!food.servingUnit) return null;
  const unitGrams = gramsPerUnit(normalizeFoodUnit(food.servingUnit));
  return unitGrams;
}

function normalizeFoodUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  if (['gram', 'grams'].includes(normalized)) return 'g';
  if (['ounce', 'ounces'].includes(normalized)) return 'oz';
  if (['pound', 'pounds', 'lbs'].includes(normalized)) return 'lb';
  if (['kilogram', 'kilograms'].includes(normalized)) return 'kg';
  return normalized;
}

function gramsPerUnit(unit: string): number | null {
  if (unit === 'g') return 1;
  if (unit === 'oz') return OZ_TO_G;
  if (unit === 'lb') return LB_TO_G;
  if (unit === 'kg') return 1000;
  return null;
}

export function calculateTotals(items: Nutrients[]): Totals {
  const base = items.reduce(
    (acc, item) => ({
      proteinG: acc.proteinG + item.proteinG,
      fatG: acc.fatG + item.fatG,
      carbohydrateG: acc.carbohydrateG + item.carbohydrateG,
      calories: acc.calories + item.calories,
    }),
    { proteinG: 0, fatG: 0, carbohydrateG: 0, calories: 0 },
  );

  const proteinCalories = base.proteinG * 4;
  const fatCalories = base.fatG * 9;
  const carbohydrateCalories = base.carbohydrateG * 4;
  const macroCalories = proteinCalories + fatCalories + carbohydrateCalories;

  return {
    calories: round(base.calories, 1),
    proteinG: round(base.proteinG, 1),
    fatG: round(base.fatG, 1),
    carbohydrateG: round(base.carbohydrateG, 1),
    macroCalories: round(macroCalories, 1),
    proteinCalories: round(proteinCalories, 1),
    fatCalories: round(fatCalories, 1),
    carbohydrateCalories: round(carbohydrateCalories, 1),
    proteinPercent: macroCalories ? round((proteinCalories / macroCalories) * 100, 1) : 0,
    fatPercent: macroCalories ? round((fatCalories / macroCalories) * 100, 1) : 0,
    carbohydratePercent: macroCalories ? round((carbohydrateCalories / macroCalories) * 100, 1) : 0,
  };
}

export function calendarDaysInclusive(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return 0;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

export function estimateMaintenanceCalories(input: {
  start: string;
  end: string;
  totalCalories: number;
  startWeight: WeightPoint;
  endWeight: WeightPoint;
}) {
  const days = calendarDaysInclusive(input.start, input.end);
  if (days <= 0) {
    throw new Error('End date must be on or after start date.');
  }
  const weightChangeLb = input.endWeight.valueLb - input.startWeight.valueLb;
  const averageCalories = input.totalCalories / days;
  const estimatedMaintenanceCalories = (input.totalCalories - weightChangeLb * CALORIES_PER_POUND) / days;

  return {
    days,
    totalCalories: round(input.totalCalories, 1),
    averageCalories: round(averageCalories, 1),
    weightChangeLb: round(weightChangeLb, 2),
    estimatedMaintenanceCalories: round(estimatedMaintenanceCalories, 0),
  };
}

export function estimateMaintenanceFromLoggedDays(input: {
  startWeight: WeightPoint;
  endWeight: WeightPoint;
  loggedCaloriesByDay: { date: string; calories: number }[];
}) {
  const days = calendarDaysInclusive(input.startWeight.date, input.endWeight.date) - 1;
  if (days <= 0) {
    throw new Error('End weight date must be after start weight date.');
  }

  const loggedDays = input.loggedCaloriesByDay.filter(
    (day) => day.date >= input.startWeight.date && day.date < input.endWeight.date,
  );
  if (!loggedDays.length) {
    throw new Error('At least one logged food day is required between weight entries.');
  }

  const loggedCalories = loggedDays.reduce((sum, day) => sum + day.calories, 0);
  const averageLoggedCalories = loggedCalories / loggedDays.length;
  const estimatedPeriodCalories = averageLoggedCalories * days;
  const weightChangeLb = input.endWeight.valueLb - input.startWeight.valueLb;
  const dailyWeightAdjustment = (weightChangeLb * CALORIES_PER_POUND) / days;
  const estimatedMaintenanceCalories = averageLoggedCalories - dailyWeightAdjustment;

  return {
    start: input.startWeight.date,
    end: input.endWeight.date,
    calorieStart: input.startWeight.date,
    calorieEnd: previousDate(input.endWeight.date),
    days,
    loggedDayCount: loggedDays.length,
    loggedCalories: round(loggedCalories, 1),
    averageLoggedCalories: round(averageLoggedCalories, 1),
    estimatedPeriodCalories: round(estimatedPeriodCalories, 1),
    weightChangeLb: round(weightChangeLb, 2),
    dailyWeightAdjustment: round(dailyWeightAdjustment, 0),
    estimatedMaintenanceCalories: round(estimatedMaintenanceCalories, 0),
  };
}

export function estimateMaintenanceFromRecentWindow(input: {
  windowStart: string;
  windowEnd: string;
  startWeight: WeightPoint;
  endWeight: WeightPoint;
  loggedCaloriesByDay: { date: string; calories: number }[];
}) {
  const windowDays = calendarDaysInclusive(input.windowStart, input.windowEnd) - 1;
  if (windowDays <= 0) {
    throw new Error('Window end date must be after window start date.');
  }

  const days = calendarDaysInclusive(input.startWeight.date, input.endWeight.date) - 1;
  if (days <= 0) {
    throw new Error('End weight date must be after start weight date.');
  }
  if (days > windowDays) {
    throw new Error('Weight period cannot be longer than the maintenance window.');
  }

  const loggedDays = input.loggedCaloriesByDay.filter(
    (day) => day.date >= input.windowStart && day.date < input.windowEnd,
  );
  if (!loggedDays.length) {
    throw new Error('At least one logged food day is required in the maintenance window.');
  }

  const loggedCalories = loggedDays.reduce((sum, day) => sum + day.calories, 0);
  const averageLoggedCalories = loggedCalories / loggedDays.length;
  const estimatedPeriodCalories = averageLoggedCalories * windowDays;
  const weightChangeLb = input.endWeight.valueLb - input.startWeight.valueLb;
  const dailyWeightAdjustment = (weightChangeLb * CALORIES_PER_POUND) / days;
  const estimatedMaintenanceCalories = averageLoggedCalories - dailyWeightAdjustment;

  return {
    start: input.startWeight.date,
    end: input.endWeight.date,
    calorieStart: input.windowStart,
    calorieEnd: previousDate(input.windowEnd),
    days,
    windowDays,
    loggedDayCount: loggedDays.length,
    loggedCalories: round(loggedCalories, 1),
    averageLoggedCalories: round(averageLoggedCalories, 1),
    estimatedPeriodCalories: round(estimatedPeriodCalories, 1),
    weightChangeLb: round(weightChangeLb, 2),
    dailyWeightAdjustment: round(dailyWeightAdjustment, 0),
    estimatedMaintenanceCalories: round(estimatedMaintenanceCalories, 0),
  };
}

function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function calculateGoalTarget(input: {
  currentWeightLb: number;
  goalWeightLb: number;
  currentDate: string;
  targetDate: string;
  maintenanceCalories: number;
}) {
  const days = calendarDaysInclusive(input.currentDate, input.targetDate) - 1;
  if (days <= 0) {
    throw new Error('Target date must be in the future.');
  }
  const poundsToLose = input.currentWeightLb - input.goalWeightLb;
  const dailyAdjustment = (Math.abs(poundsToLose) * CALORIES_PER_POUND) / days;
  const targetCalories =
    poundsToLose >= 0 ? input.maintenanceCalories - dailyAdjustment : input.maintenanceCalories + dailyAdjustment;
  const weeklyChangeLb = (Math.abs(poundsToLose) / days) * 7;

  return {
    days,
    weightChangeLb: round(input.goalWeightLb - input.currentWeightLb, 2),
    dailyAdjustment: round(dailyAdjustment, 0),
    weeklyChangeLb: round(weeklyChangeLb, 2),
    targetCalories: round(targetCalories, 0),
    unrealistic: dailyAdjustment > 1000 || weeklyChangeLb > 2,
  };
}
