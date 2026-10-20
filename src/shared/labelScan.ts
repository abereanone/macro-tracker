// Food scanning: a barcode lookup (our foods, then Open Food Facts) or a vision model
// reading nutrition label photos produces a reading; the rules here turn it into a
// food draft the user reviews before saving. Shared so the API and the tests use the
// same rules.

import { convertQuantityToGrams } from './calculations';

export const LABEL_SCAN_MAX_PHOTOS = 2;

export const labelScanPrompt = `You read photos of packaged food. You will get one or two photos. One shows the Nutrition Facts label. The other, if present, may show the front of the package or the rest of the label.

Return only a JSON object with exactly these keys:
{
  "readable": true if a nutrition label is visible and legible, otherwise false,
  "productName": brand and product name from the package (e.g. "Sunny Acres Honey Oat Granola"), or null if not shown,
  "servingSizeText": the serving size exactly as printed (e.g. "2/3 cup (55g)"), or null,
  "servingAmount": the household serving amount as a number (e.g. 0.667 for "2/3 cup", 3 for "3 cookies"), or null,
  "servingUnit": the household serving unit (e.g. "cup", "tbsp", "bar", "cookies", "slice", "g"), or null,
  "servingGrams": the weight of one serving in grams, or mL for drinks (e.g. 55), or null,
  "per100g": true only if the label lists values per 100 g or 100 mL and has no per-serving values,
  "calories": calories (kcal) per serving,
  "proteinG": protein grams per serving,
  "fatG": total fat grams per serving,
  "carbohydrateG": total carbohydrate grams per serving
}

Rules:
- Use per-serving values. If the label has a per-serving column and a per-container column, use per serving.
- Use Total Fat, not saturated or trans fat. Use Total Carbohydrate, not sugars or fiber.
- Ignore % Daily Value numbers.
- If energy is only given in kJ, divide by 4.184 to get kcal.
- Write "<1g" as 0.5.
- If both photos show parts of the label, combine them.
- Use null for any value you cannot read clearly. Do not guess.`;

export type LabelScanReading = {
  readable: boolean;
  productName: string | null;
  servingSizeText: string | null;
  servingAmount: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  per100g: boolean;
  calories: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
};

export type LabelScanSource = 'label' | 'open-food-facts';

export type LabelScanDraft = {
  description: string;
  servingQuantity: number | null;
  servingUnit: string;
  servingGrams: number | null;
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
  calories: number;
  servingSizeText: string | null;
  barcode: string | null;
  source: LabelScanSource;
  warnings: string[];
};

export function parseLabelScanReading(text: string): LabelScanReading | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;

  return {
    readable: raw.readable !== false,
    productName: labelText(raw.productName),
    servingSizeText: labelText(raw.servingSizeText),
    servingAmount: labelNumber(raw.servingAmount),
    servingUnit: labelText(raw.servingUnit),
    servingGrams: labelNumber(raw.servingGrams),
    per100g: raw.per100g === true,
    calories: labelNumber(raw.calories),
    proteinG: labelNumber(raw.proteinG),
    fatG: labelNumber(raw.fatG),
    carbohydrateG: labelNumber(raw.carbohydrateG),
  };
}

export function labelScanHasNutrition(reading: LabelScanReading): boolean {
  return [reading.calories, reading.proteinG, reading.fatG, reading.carbohydrateG].some((value) => value != null);
}

export function labelScanToFoodDraft(
  reading: LabelScanReading,
  { barcode = null, source = 'label' }: { barcode?: string | null; source?: LabelScanSource } = {},
): LabelScanDraft {
  const warnings: string[] = [];
  if (source === 'open-food-facts') {
    warnings.push('Found in Open Food Facts, a community database. Check it against the package.');
  }
  const serving = reading.per100g
    ? { quantity: 100, unit: 'g', grams: 100 }
    : servingFromLabel(reading.servingAmount, reading.servingUnit, reading.servingGrams);
  if (reading.per100g) warnings.push('Nutrition is listed per 100 g, so the food is set up per 100 g.');
  if (serving.quantity == null) {
    warnings.push("Couldn't read the serving size. Enter it from the label.");
  } else if (!['g', 'oz'].includes(serving.unit) && serving.grams == null) {
    warnings.push("Couldn't read the serving weight in grams. Enter it from the label.");
  }

  const missing = (
    [
      ['protein', reading.proteinG],
      ['fat', reading.fatG],
      ['carbs', reading.carbohydrateG],
    ] as const
  )
    .filter(([, value]) => value == null)
    .map(([label]) => label);
  if (missing.length) warnings.push(`Couldn't read ${joinLabels(missing)}. Enter ${missing.length === 1 ? 'it' : 'them'} from the label.`);

  const proteinG = roundTo(reading.proteinG ?? 0, 1);
  const fatG = roundTo(reading.fatG ?? 0, 1);
  const carbohydrateG = roundTo(reading.carbohydrateG ?? 0, 1);
  const macroCalories = Math.round(proteinG * 4 + fatG * 9 + carbohydrateG * 4);
  const calories = reading.calories == null ? macroCalories : Math.round(reading.calories);
  if (reading.calories == null) {
    warnings.push("Couldn't read calories, so they were calculated from the macros.");
  } else if (missing.length === 0 && macroCalories > 0 && Math.abs(calories - macroCalories) > Math.max(20, calories * 0.2)) {
    warnings.push(`Label calories (${calories}) don't match the macros (about ${macroCalories}). Double-check the numbers.`);
  }
  if (calories > 1500 || proteinG > 200 || fatG > 200 || carbohydrateG > 300) {
    warnings.push('Some numbers look unusually high for one serving. Double-check them.');
  }

  return {
    description: (reading.productName ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
    servingQuantity: serving.quantity,
    servingUnit: serving.unit,
    servingGrams: serving.grams,
    proteinG,
    fatG,
    carbohydrateG,
    calories,
    servingSizeText: reading.servingSizeText,
    barcode,
    source,
    warnings,
  };
}

// Accepts UPC-A, EAN-13, EAN-8 and GTIN-14 digits and returns the canonical form we
// store and look up: 12-digit UPC-A codes become EAN-13 by adding a leading zero, the
// same way Open Food Facts stores them.
export function normalizeBarcode(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12) digits = `0${digits}`;
  if (![8, 13, 14].includes(digits.length) || !validGtinCheckDigit(digits)) return null;
  return digits;
}

function validGtinCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

// Small US packages use 8-digit UPC-E codes; databases index the 12-digit UPC-A form.
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [system, d1, d2, d3, d4, d5, d6, check] = code.split('');
  let middle: string;
  if (['0', '1', '2'].includes(d6)) middle = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') middle = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') middle = `${d1}${d2}${d3}${d4}00000${d5}`;
  else middle = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${system}${middle}${check}`;
}

// "2/3 cup (55 g)" -> { amount: 0.667, unit: "cup", grams: 55 }; "30 g" -> grams 30.
export function parseServingSize(text: string | null | undefined): { amount: number | null; unit: string | null; grams: number | null } {
  const none = { amount: null, unit: null, grams: null };
  if (!text) return none;
  const value = text.trim();
  const weight = /\(\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml)\s*\)/i.exec(value);
  const household = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*[.,]?\d+)\s*([^\d(]*)/.exec(value);
  const grams = weight ? labelNumber(weight[1]) : null;
  if (!household) return { ...none, grams };
  const amount = labelNumber(household[1]);
  const unit = household[2].trim().replace(/\s+/g, ' ') || null;
  if (!weight && unit && /^(g|gr|grams?|ml)$/i.test(unit)) return { amount, unit: 'g', grams: amount };
  return { amount, unit, grams };
}

export type OpenFoodFactsProduct = {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
};

// Open Food Facts gives per-serving values when the package lists them, otherwise
// per 100 g.
export function openFoodFactsReading(product: OpenFoodFactsProduct): LabelScanReading | null {
  const nutriments = product.nutriments ?? {};
  const value = (key: string, basis: 'serving' | '100g') => labelNumber(nutriments[`${key}_${basis}`]);
  const kcal = (basis: 'serving' | '100g') => {
    const direct = value('energy-kcal', basis);
    if (direct != null) return direct;
    const kj = value('energy-kj', basis) ?? value('energy', basis);
    return kj == null ? null : kj / 4.184;
  };
  const values = (basis: 'serving' | '100g') => ({
    calories: kcal(basis),
    proteinG: value('proteins', basis),
    fatG: value('fat', basis),
    carbohydrateG: value('carbohydrates', basis),
  });
  const serving = parseServingSize(product.serving_size);
  const servingGrams = labelNumber(product.serving_quantity) ?? serving.grams;
  const perServing = values('serving');
  const usePerServing = perServing.calories != null && servingGrams != null;
  const nutrition = usePerServing ? perServing : values('100g');

  const reading: LabelScanReading = {
    readable: true,
    productName: openFoodFactsProductName(product),
    servingSizeText: labelText(product.serving_size),
    servingAmount: usePerServing ? serving.amount : null,
    servingUnit: usePerServing ? serving.unit : null,
    servingGrams: usePerServing ? servingGrams : null,
    per100g: !usePerServing,
    ...nutrition,
  };
  return labelScanHasNutrition(reading) ? reading : null;
}

export function openFoodFactsProductName(product: OpenFoodFactsProduct): string | null {
  const name = labelText(product.product_name);
  const brand = labelText(product.brands?.split(',')[0]);
  if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${name}`;
  return name ?? brand;
}

type ComparableFood = {
  description: string;
  servingQuantity: number | null;
  servingUnit: string;
  servingGrams: number | null;
  calories: number;
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
};

const nameStopWords = new Set(['and', 'with', 'the', 'of', 'a', 'in', 'for', 'or']);

export function foodNameTokens(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !nameStopWords.has(token));
  return [...new Set(tokens)];
}

// Scores how likely an existing food is the product just scanned, from 0 upward.
// Names alone must be close; matching nutrition per gram lets a shorter name like
// "Honey Oat Granola" match "Sunny Acres Honey Oat Granola Clusters".
export function foodMatchScore(scanned: ComparableFood, existing: ComparableFood): number {
  const a = foodNameTokens(scanned.description);
  const b = foodNameTokens(existing.description);
  const shared = a.filter((token) => b.includes(token)).length;
  const nameScore = a.length && b.length ? (2 * shared) / (a.length + b.length) : 0;
  return nameScore + (sameNutrition(scanned, existing) ? 0.4 : 0);
}

export const FOOD_MATCH_THRESHOLD = 0.75;

function sameNutrition(a: ComparableFood, b: ComparableFood): boolean {
  const gramsA = servingWeight(a);
  const gramsB = servingWeight(b);
  if (!gramsA || !gramsB) return false;
  const per100 = (food: ComparableFood, grams: number) =>
    [food.calories, food.proteinG, food.fatG, food.carbohydrateG].map((value) => (value / grams) * 100);
  const [calA, ...macrosA] = per100(a, gramsA);
  const [calB, ...macrosB] = per100(b, gramsB);
  if (Math.abs(calA - calB) > Math.max(8, calA * 0.06)) return false;
  return macrosA.every((value, index) => Math.abs(value - macrosB[index]) <= Math.max(1.5, value * 0.1));
}

function servingWeight(food: ComparableFood): number | null {
  if (food.servingGrams && food.servingGrams > 0) return food.servingGrams;
  if (!food.servingQuantity) return null;
  try {
    return convertQuantityToGrams(food.servingQuantity, food.servingUnit);
  } catch {
    return null;
  }
}

// Maps the label's household serving ("2/3 cup (55g)", "3 cookies (30g)") onto the
// units the food form offers. Falls back to grams when the household unit has no
// equivalent, since nearly every label prints the gram weight.
function servingFromLabel(amount: number | null, rawUnit: string | null, rawGrams: number | null) {
  // The food form accepts two decimals.
  const grams = rawGrams == null ? null : roundTo(rawGrams, 2);
  const unit = rawUnit ? labelUnit(rawUnit) : null;
  if (unit?.unit === 'g') {
    const quantity = amount == null ? grams : roundTo(amount, 2);
    return { quantity, unit: 'g', grams: quantity };
  }
  if (unit && amount != null && amount > 0) {
    return { quantity: roundTo(amount * unit.factor, 2), unit: unit.unit, grams };
  }
  if (grams != null && grams > 0) return { quantity: grams, unit: 'g', grams };
  return { quantity: null, unit: 'g', grams: null };
}

const gramUnits = ['g', 'gm', 'gr', 'gram'];
// Volumes and large weights have no household unit in the food form; use grams.
const gramsOnlyUnits = ['ml', 'milliliter', 'millilitre', 'l', 'liter', 'litre', 'fl oz', 'fluid ounce', 'kg', 'kilogram', 'lb', 'pound'];
const ounceUnits = ['oz', 'ounce'];
const tablespoonUnits = ['tbsp', 'tbs', 'tbl', 'tablespoon'];
const teaspoonUnits = ['tsp', 'teaspoon'];
const cupUnits = ['cup'];
const packageUnits = ['package', 'pkg', 'container', 'pouch', 'can', 'bottle', 'pack', 'packet', 'box', 'bag', 'carton', 'jar', 'tub'];

function labelUnit(rawUnit: string): { unit: string; factor: number } | null {
  const unit = rawUnit.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  const is = (words: string[]) => words.some((word) => unit === word || unit === `${word}s` || unit === `${word}es`);
  if (is(gramUnits)) return { unit: 'g', factor: 1 };
  if (is(gramsOnlyUnits)) return null;
  if (is(ounceUnits)) return { unit: 'oz', factor: 1 };
  if (is(tablespoonUnits)) return { unit: 'tbsp', factor: 1 };
  if (is(teaspoonUnits)) return { unit: 'tbsp', factor: 1 / 3 };
  if (is(cupUnits)) return { unit: 'cup', factor: 1 };
  if (is(packageUnits)) return { unit: 'package', factor: 1 };
  // Countable servings: bars, cookies, slices, pieces, eggs...
  return { unit: 'unit', factor: 1 };
}

function labelText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.toLowerCase() !== 'null' ? text : null;
}

export function labelNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim().toLowerCase();
  if (!text) return null;
  if (!text.includes('.') && /\d,\d/.test(text)) text = text.replace(',', '.');

  const lessThan = /^(<|less than)\s*/.exec(text);
  if (lessThan) {
    const bound = labelNumber(text.slice(lessThan[0].length));
    return bound == null ? null : bound / 2;
  }
  const mixed = /^(\d+)\s+(\d+)\/(\d+)/.exec(text);
  if (mixed && Number(mixed[3]) > 0) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)/.exec(text);
  if (fraction && Number(fraction[2]) > 0) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = /^\d*\.?\d+/.exec(text);
  return decimal ? Number(decimal[0]) : null;
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
