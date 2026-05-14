export type Visibility = 'private' | 'public';
export type WeightUnit = 'lb' | 'kg';

export type Nutrients = {
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
  calories: number;
};

export type FoodNutrition = Nutrients & {
  servingQuantity: number;
  servingUnit?: string;
  servingGrams?: number | null;
};

export type Totals = Nutrients & {
  macroCalories: number;
  proteinCalories: number;
  fatCalories: number;
  carbohydrateCalories: number;
  proteinPercent: number;
  fatPercent: number;
  carbohydratePercent: number;
};

export type WeightPoint = {
  date: string;
  value: number;
  unit: WeightUnit;
  valueLb: number;
};
