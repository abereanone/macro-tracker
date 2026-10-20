import { describe, expect, it } from 'vitest';
import { labelNumber, labelScanHasNutrition, labelScanToFoodDraft, parseLabelScanReading, type LabelScanReading } from '../src/shared/labelScan';

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
