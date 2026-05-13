import { describe, expect, it } from 'vitest';
import { calculateGoalTarget, calculateLoggedNutrition, calculateTotals, estimateMaintenanceCalories, toLb } from '../src/shared/calculations';

describe('nutrition calculations', () => {
  it('scales logged nutrients proportionally', () => {
    expect(
      calculateLoggedNutrition(
        { servingQuantity: 100, proteinG: 31, fatG: 3.6, carbohydrateG: 0, calories: 165 },
        150,
      ),
    ).toEqual({ proteinG: 46.5, fatG: 5.4, carbohydrateG: 0, calories: 247.5 });
  });

  it('uses macro calories for macro percentages', () => {
    const totals = calculateTotals([{ proteinG: 50, fatG: 20, carbohydrateG: 100, calories: 800 }]);
    expect(totals.macroCalories).toBe(780);
    expect(totals.proteinPercent).toBe(25.6);
    expect(totals.fatPercent).toBe(23.1);
    expect(totals.carbohydratePercent).toBe(51.3);
  });

  it('returns zero macro percentages when no macros are logged', () => {
    const totals = calculateTotals([]);
    expect(totals.proteinPercent).toBe(0);
    expect(totals.fatPercent).toBe(0);
    expect(totals.carbohydratePercent).toBe(0);
  });
});

describe('weight and maintenance calculations', () => {
  it('normalizes kilograms to pounds', () => {
    expect(toLb(100, 'kg')).toBeCloseTo(220.46226218);
  });

  it('estimates maintenance when weight is unchanged', () => {
    const result = estimateMaintenanceCalories({
      start: '2026-05-01',
      end: '2026-05-07',
      totalCalories: 14000,
      startWeight: { date: '2026-05-01', value: 185, unit: 'lb', valueLb: 185 },
      endWeight: { date: '2026-05-07', value: 185, unit: 'lb', valueLb: 185 },
    });
    expect(result.estimatedMaintenanceCalories).toBe(2000);
  });

  it('adds estimated deficit back when weight decreased', () => {
    const result = estimateMaintenanceCalories({
      start: '2026-05-01',
      end: '2026-05-07',
      totalCalories: 14000,
      startWeight: { date: '2026-05-01', value: 185, unit: 'lb', valueLb: 185 },
      endWeight: { date: '2026-05-07', value: 184, unit: 'lb', valueLb: 184 },
    });
    expect(result.estimatedMaintenanceCalories).toBe(2500);
  });

  it('subtracts estimated surplus when weight increased', () => {
    const result = estimateMaintenanceCalories({
      start: '2026-05-01',
      end: '2026-05-07',
      totalCalories: 17500,
      startWeight: { date: '2026-05-01', value: 185, unit: 'lb', valueLb: 185 },
      endWeight: { date: '2026-05-07', value: 186, unit: 'lb', valueLb: 186 },
    });
    expect(result.estimatedMaintenanceCalories).toBe(2000);
  });
});

describe('goal planning', () => {
  it('calculates a target intake for weight loss by date', () => {
    const result = calculateGoalTarget({
      currentWeightLb: 185,
      goalWeightLb: 175,
      currentDate: '2026-05-13',
      targetDate: '2026-07-22',
      maintenanceCalories: 2500,
    });
    expect(result.days).toBe(70);
    expect(result.dailyAdjustment).toBe(500);
    expect(result.targetCalories).toBe(2000);
  });
});
