import { describe, expect, it } from 'vitest';
import {
  FOOD_MATCH_THRESHOLD,
  expandUpcE,
  foodMatchScore,
  labelNumber,
  labelScanHasNutrition,
  labelScanToFoodDraft,
  normalizeBarcode,
  openFoodFactsReading,
  parseLabelScanReading,
  parseServingSize,
  type LabelScanReading,
} from '../src/shared/labelScan';

const baseReading: LabelScanReading = {
  readable: true,
  productName: 'Sunny Acres Honey Oat Granola',
  servingSizeText: '2/3 cup (55g)',
  servingAmount: 0.667,
  servingUnit: 'cup',
  servingGrams: 55,
  per100g: false,
  calories: 230,
  proteinG: 3,
  fatG: 8,
  carbohydrateG: 37,
};

describe('label scan parsing', () => {
  it('parses JSON wrapped in a code fence', () => {
    const reading = parseLabelScanReading('```json\n{"readable":true,"calories":230,"proteinG":"3g","fatG":8,"carbohydrateG":"37 g","servingAmount":"2/3"}\n```');
    expect(reading).toMatchObject({ readable: true, calories: 230, proteinG: 3, fatG: 8, carbohydrateG: 37 });
    expect(reading?.servingAmount).toBeCloseTo(0.667, 3);
  });

  it('returns null for text without JSON', () => {
    expect(parseLabelScanReading('I cannot read this label.')).toBeNull();
    expect(parseLabelScanReading('{not json}')).toBeNull();
  });

  it('reads label-style numbers', () => {
    expect(labelNumber('<1g')).toBe(0.5);
    expect(labelNumber('1 1/2')).toBe(1.5);
    expect(labelNumber('2,5 g')).toBe(2.5);
    expect(labelNumber(-3)).toBeNull();
    expect(labelNumber('n/a')).toBeNull();
  });

  it('knows when no nutrition values were read', () => {
    expect(labelScanHasNutrition({ ...baseReading, calories: null, proteinG: null, fatG: null, carbohydrateG: null })).toBe(false);
    expect(labelScanHasNutrition(baseReading)).toBe(true);
  });
});

describe('label scan food drafts', () => {
  it('keeps cup servings with their gram weight', () => {
    expect(labelScanToFoodDraft(baseReading)).toEqual({
      description: 'Sunny Acres Honey Oat Granola',
      servingQuantity: 0.67,
      servingUnit: 'cup',
      servingGrams: 55,
      proteinG: 3,
      fatG: 8,
      carbohydrateG: 37,
      calories: 230,
      servingSizeText: '2/3 cup (55g)',
      barcode: null,
      source: 'label',
      warnings: [],
    });
  });

  it('maps countable servings to units', () => {
    const draft = labelScanToFoodDraft({ ...baseReading, servingAmount: 3, servingUnit: 'cookies', servingGrams: 30 });
    expect(draft).toMatchObject({ servingQuantity: 3, servingUnit: 'unit', servingGrams: 30 });
  });

  it('maps teaspoons to tablespoons and containers to packages', () => {
    expect(labelScanToFoodDraft({ ...baseReading, servingAmount: 2, servingUnit: 'tsp', servingGrams: 8 })).toMatchObject({ servingQuantity: 0.67, servingUnit: 'tbsp' });
    expect(labelScanToFoodDraft({ ...baseReading, servingAmount: 1, servingUnit: 'bottles', servingGrams: 500 })).toMatchObject({ servingQuantity: 1, servingUnit: 'package' });
  });

  it('falls back to grams for volume servings', () => {
    expect(labelScanToFoodDraft({ ...baseReading, servingAmount: 8, servingUnit: 'fl oz', servingGrams: 240 })).toMatchObject({ servingQuantity: 240, servingUnit: 'g', servingGrams: 240 });
  });

  it('uses 100 g for per-100 g labels', () => {
    const draft = labelScanToFoodDraft({ ...baseReading, per100g: true, servingAmount: null, servingUnit: null, servingGrams: null });
    expect(draft).toMatchObject({ servingQuantity: 100, servingUnit: 'g', servingGrams: 100 });
    expect(draft.warnings[0]).toContain('per 100 g');
  });

  it('warns about missing values and fills calories from macros', () => {
    const draft = labelScanToFoodDraft({ ...baseReading, productName: null, calories: null, fatG: null, servingGrams: null });
    expect(draft.description).toBe('');
    expect(draft.fatG).toBe(0);
    expect(draft.calories).toBe(160);
    expect(draft.warnings).toEqual([
      "Couldn't read the serving weight in grams. Enter it from the label.",
      "Couldn't read fat. Enter it from the label.",
      "Couldn't read calories, so they were calculated from the macros.",
    ]);
  });

  it('flags calories that disagree with the macros', () => {
    const draft = labelScanToFoodDraft({ ...baseReading, calories: 400 });
    expect(draft.warnings).toEqual(["Label calories (400) don't match the macros (about 232). Double-check the numbers."]);
  });

  it('warns when the serving size is unreadable', () => {
    const draft = labelScanToFoodDraft({ ...baseReading, servingAmount: null, servingUnit: null, servingGrams: null });
    expect(draft.servingQuantity).toBeNull();
    expect(draft.warnings).toContain("Couldn't read the serving size. Enter it from the label.");
  });
});

describe('barcodes', () => {
  it('normalizes UPC-A to EAN-13 and validates check digits', () => {
    expect(normalizeBarcode('038000138416')).toBe('0038000138416');
    expect(normalizeBarcode('3017620422003')).toBe('3017620422003');
    expect(normalizeBarcode('0 38000 13841 6')).toBe('0038000138416');
    expect(normalizeBarcode('03800013841 7')).toBeNull();
    expect(normalizeBarcode('12345')).toBeNull();
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });

  it('expands UPC-E codes to UPC-A', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(normalizeBarcode(expandUpcE('04252614')!)).toBe('0042100005264');
    expect(expandUpcE('12345')).toBeNull();
  });
});

describe('Open Food Facts products', () => {
  it('parses serving sizes', () => {
    expect(parseServingSize('2/3 cup (55 g)')).toEqual({ amount: 2 / 3, unit: 'cup', grams: 55 });
    expect(parseServingSize('30 g')).toEqual({ amount: 30, unit: 'g', grams: 30 });
    expect(parseServingSize('1 portion (28.349 g)')).toEqual({ amount: 1, unit: 'portion', grams: 28.349 });
    expect(parseServingSize(null)).toEqual({ amount: null, unit: null, grams: null });
  });

  it('uses per-serving values when the product lists them', () => {
    const reading = openFoodFactsReading({
      product_name: 'Original Potato Crisps',
      brands: 'Pringles',
      serving_size: '1 portion (28.349 g)',
      serving_quantity: 28.349,
      nutriments: { 'energy-kcal_serving': 152, proteins_serving: 0.992, fat_serving: 9.07, carbohydrates_serving: 16.2, 'energy-kcal_100g': 536 },
    });
    expect(reading).toMatchObject({ productName: 'Pringles Original Potato Crisps', per100g: false, servingAmount: 1, servingGrams: 28.349, calories: 152 });
    expect(labelScanToFoodDraft(reading!, { barcode: '0038000138416', source: 'open-food-facts' })).toMatchObject({
      servingQuantity: 1,
      servingUnit: 'unit',
      servingGrams: 28.35,
      proteinG: 1,
      fatG: 9.1,
      carbohydrateG: 16.2,
      calories: 152,
      barcode: '0038000138416',
      source: 'open-food-facts',
    });
  });

  it('falls back to per 100 g and kJ energy', () => {
    const reading = openFoodFactsReading({
      product_name: 'Nutella',
      brands: 'Nutella, Ferrero',
      nutriments: { energy_100g: 2252, proteins_100g: 6.3, fat_100g: 30.9, carbohydrates_100g: 57.5 },
    });
    expect(reading).toMatchObject({ productName: 'Nutella', per100g: true, proteinG: 6.3 });
    expect(reading?.calories).toBeCloseTo(538.2, 1);
  });

  it('returns null without nutrition', () => {
    expect(openFoodFactsReading({ product_name: 'Mystery', nutriments: {} })).toBeNull();
  });
});

describe('matching scanned foods to existing foods', () => {
  const scanned = {
    description: 'Sunny Acres Honey Oat Granola Clusters',
    servingQuantity: 0.67,
    servingUnit: 'cup',
    servingGrams: 55,
    calories: 230,
    proteinG: 3,
    fatG: 8,
    carbohydrateG: 37,
  };

  it('matches the same name', () => {
    expect(foodMatchScore(scanned, { ...scanned, description: 'sunny acres honey-oat granola clusters', servingGrams: null, servingQuantity: 1, servingUnit: 'unit' })).toBeGreaterThanOrEqual(FOOD_MATCH_THRESHOLD);
  });

  it('matches a shorter name with the same nutrition per gram', () => {
    const existing = { ...scanned, description: 'Honey Oat Granola', servingQuantity: 100, servingUnit: 'g', servingGrams: 100, calories: 418, proteinG: 5.5, fatG: 14.5, carbohydrateG: 67.3 };
    expect(foodMatchScore(scanned, existing)).toBeGreaterThanOrEqual(FOOD_MATCH_THRESHOLD);
  });

  it('does not match a different flavor from the same brand', () => {
    const existing = { ...scanned, description: 'Sunny Acres Maple Pecan Granola', calories: 260, fatG: 12, carbohydrateG: 33 };
    expect(foodMatchScore(scanned, existing)).toBeLessThan(FOOD_MATCH_THRESHOLD);
  });
});
