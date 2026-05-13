import type { FoodNutrition, Nutrients, Totals, WeightPoint, WeightUnit } from './types';

export const KG_TO_LB = 2.2046226218;
export const LB_TO_KG = 0.45359237;
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
