import { calculateGoalTarget, calculateLoggedNutrition, calculateTotals, convertConsumedQuantityToServingQuantity, convertQuantityToGrams, estimateMaintenanceCalories, toLb } from '../../src/shared/calculations';
import {
  nonNegativeNumber,
  normalizeEmail,
  optionalPositiveNumber,
  optionalString,
  positiveNumber,
  requireDate,
  requireString,
  requireVisibility,
  requireWeightUnit,
} from '../../src/shared/validation';

type Env = { DB: D1Database };
type Ctx = EventContext<Env, string, { path?: string[] }>;
type DbUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  protein_goal_g: number | null;
  calorie_goal_value: number | null;
  calorie_goal_type: string;
  preferred_weight_unit: string | null;
  timezone: string | null;
};
type DbFood = {
  id: string;
  owner_user_id: string;
  description: string;
  serving_quantity: number;
  serving_unit: string;
  serving_grams: number | null;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
  calories: number;
  visibility: string;
  notes: string | null;
};
type DbMeal = { id: string; owner_user_id: string; name: string; description: string | null; visibility: string };
type DbWeight = { id: string; entry_date: string; weight_value: number; weight_unit: 'lb' | 'kg'; notes: string | null };

const cookieName = 'macro_user_email';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const segments = (ctx.params.path ?? []) as string[];
    const path = `/${segments.join('/')}`;
    const method = ctx.request.method.toUpperCase();

    if (method === 'OPTIONS') return json({ ok: true });
    if (method === 'POST' && path === '/auth/simple-login') return simpleLogin(ctx);
    if (method === 'POST' && path === '/auth/logout') return logout();

    const user = await requireUser(ctx);

    if (method === 'GET' && path === '/me') return json({ ok: true, user: mapUser(user) });
    if (method === 'PUT' && path === '/me/settings') return updateSettings(ctx, user);
    if (method === 'POST' && path === '/me/delete-data') return deleteMyData(ctx, user);

    if (path === '/foods' && method === 'GET') return listFoods(ctx, user, url);
    if (path === '/foods' && method === 'POST') return createFood(ctx, user);
    if (segments[0] === 'foods' && segments[1] && method === 'PUT') return updateFood(ctx, user, segments[1]);
    if (segments[0] === 'foods' && segments[1] && method === 'DELETE') return archiveFood(ctx, user, segments[1]);
    if (segments[0] === 'foods' && segments[1] && segments[2] === 'copy' && method === 'POST') return copyFood(ctx, user, segments[1]);

    if (path === '/saved-meals' && method === 'GET') return listMeals(ctx, user, url);
    if (path === '/saved-meals' && method === 'POST') return createMeal(ctx, user);
    if (segments[0] === 'saved-meals' && segments[1] && method === 'PUT') return updateMeal(ctx, user, segments[1]);
    if (segments[0] === 'saved-meals' && segments[1] && method === 'DELETE') return archiveMeal(ctx, user, segments[1]);
    if (segments[0] === 'saved-meals' && segments[1] && segments[2] === 'copy' && method === 'POST') return copyMeal(ctx, user, segments[1]);
    if (segments[0] === 'saved-meals' && segments[1] && segments[2] === 'add-to-diary' && method === 'POST') return addMealToDiary(ctx, user, segments[1]);

    if (segments[0] === 'days' && segments[1] && method === 'GET') return getDay(ctx, user, segments[1]);
    if (path === '/diary-items' && method === 'POST') return createDiaryItem(ctx, user);
    if (segments[0] === 'diary-items' && segments[1] && method === 'PUT') return updateDiaryItem(ctx, user, segments[1]);
    if (segments[0] === 'diary-items' && segments[1] && method === 'DELETE') return deleteDiaryItem(ctx, user, segments[1]);

    if (path === '/weight' && method === 'GET') return listWeight(ctx, user, url);
    if (path === '/weight' && method === 'POST') return upsertWeight(ctx, user);
    if (segments[0] === 'weight' && segments[1] && method === 'PUT') return updateWeight(ctx, user, segments[1]);
    if (segments[0] === 'weight' && segments[1] && method === 'DELETE') return deleteWeight(ctx, user, segments[1]);

    if (path === '/reports/summary' && method === 'GET') return reportSummary(ctx, user, url);
    if (path === '/reports/maintenance' && method === 'GET') return reportMaintenance(ctx, user, url);
    if (path === '/goal-plans' && method === 'POST') return createGoalPlan(ctx, user);
    if (path === '/goal-plans' && method === 'GET') return listGoalPlans(ctx, user, url);
    if (path === '/goal-plans/active' && method === 'GET') return activeGoalPlan(ctx, user);
    if (segments[0] === 'goal-plans' && segments[1] && method === 'PUT') return archiveGoalPlan(ctx, user, segments[1]);

    return error('NOT_FOUND', 'Route not found.', 404);
  } catch (err) {
    if (err instanceof ApiError) return error(err.code, err.message, err.status);
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    return error('SERVER_ERROR', message, 500);
  }
};

class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { headers: { 'content-type': 'application/json', ...init.headers }, ...init });
}

function error(code: string, message: string, status: number) {
  return json({ ok: false, error: { code, message } }, { status });
}

async function body(ctx: Ctx) {
  try {
    return (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

function id() {
  return crypto.randomUUID();
}

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get('cookie') ?? '';
  return cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function requireUser(ctx: Ctx) {
  const email = getCookie(ctx.request, cookieName);
  if (!email) throw new ApiError('UNAUTHORIZED', 'Log in with an email address first.', 401);
  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(decodeURIComponent(email)).first<DbUser>();
  if (!user) throw new ApiError('UNAUTHORIZED', 'Log in with an email address first.', 401);
  return user;
}

async function simpleLogin(ctx: Ctx) {
  const input = await body(ctx);
  const email = normalizeEmail(input.email);
  let user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUser>();
  if (!user) {
    const userId = id();
    await ctx.env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(userId, email).run();
    user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
  }
  return json(
    { ok: true, user: mapUser(user!) },
    { headers: { 'set-cookie': `${cookieName}=${encodeURIComponent(email)}; Path=/; SameSite=Lax; Max-Age=31536000` } },
  );
}

function logout() {
  return json({ ok: true }, { headers: { 'set-cookie': `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0` } });
}

function mapUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name ?? '',
    lastName: user.last_name ?? '',
    proteinGoalG: user.protein_goal_g,
    calorieGoalValue: user.calorie_goal_value,
    calorieGoalType: (user.calorie_goal_type ?? 'manual') as 'manual' | 'goal-based',
    preferredWeightUnit: user.preferred_weight_unit ?? 'lb',
    timezone: user.timezone ?? 'America/New_York',
  };
}

async function updateSettings(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const firstName = optionalString(input.firstName);
  const lastName = optionalString(input.lastName);
  const proteinGoal = optionalPositiveNumber(input.proteinGoalG, 'Protein goal');
  const calorieGoalValue = optionalPositiveNumber(input.calorieGoalValue, 'Calorie goal');
  const calorieGoalType = input.calorieGoalType === 'goal-based' ? 'goal-based' : 'manual';
  const unit = input.preferredWeightUnit ? requireWeightUnit(input.preferredWeightUnit) : 'lb';
  const timezone = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : 'America/New_York';
  await ctx.env.DB.prepare(
    'UPDATE users SET first_name = ?, last_name = ?, protein_goal_g = ?, calorie_goal_value = ?, calorie_goal_type = ?, preferred_weight_unit = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  )
    .bind(firstName, lastName, proteinGoal, calorieGoalValue, calorieGoalType, unit, timezone, user.id)
    .run();
  const updated = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<DbUser>();
  return json({ ok: true, user: mapUser(updated!) });
}

async function deleteMyData(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  if (input.confirm !== 'YES! I understand!') {
    throw new ApiError('VALIDATION_ERROR', 'Confirmation is required before deleting data.');
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM diary_items WHERE user_id = ?').bind(user.id),
    ctx.env.DB.prepare('DELETE FROM weight_entries WHERE user_id = ?').bind(user.id),
    ctx.env.DB.prepare('DELETE FROM goal_plans WHERE user_id = ?').bind(user.id),
    ctx.env.DB.prepare(
      `DELETE FROM saved_meal_items
       WHERE saved_meal_id IN (
         SELECT id FROM saved_meals WHERE owner_user_id = ? AND visibility = 'private'
       )`,
    ).bind(user.id),
    ctx.env.DB.prepare("DELETE FROM saved_meals WHERE owner_user_id = ? AND visibility = 'private'").bind(user.id),
    ctx.env.DB.prepare(
      `DELETE FROM saved_meal_items
       WHERE food_id IN (
         SELECT id FROM foods WHERE owner_user_id = ? AND visibility = 'private'
       )`,
    ).bind(user.id),
    ctx.env.DB.prepare("DELETE FROM foods WHERE owner_user_id = ? AND visibility = 'private'").bind(user.id),
  ]);

  return json({ ok: true });
}

function mapFood(food: DbFood) {
  return {
    id: food.id,
    ownerUserId: food.owner_user_id,
    description: food.description,
    servingQuantity: food.serving_quantity,
    servingUnit: food.serving_unit,
    servingGrams: food.serving_grams,
    proteinG: food.protein_g,
    fatG: food.fat_g,
    carbohydrateG: food.carbohydrate_g,
    calories: food.calories,
    visibility: food.visibility,
    notes: food.notes,
  };
}

function foodInput(input: Record<string, unknown>) {
  return {
    description: requireString(input.description, 'Description'),
    servingQuantity: positiveNumber(input.servingQuantity, 'Serving quantity'),
    servingUnit: requireString(input.servingUnit, 'Serving unit'),
    servingGrams: optionalPositiveNumber(input.servingGrams, 'Serving grams'),
    proteinG: nonNegativeNumber(input.proteinG, 'Protein'),
    fatG: nonNegativeNumber(input.fatG, 'Fat'),
    carbohydrateG: nonNegativeNumber(input.carbohydrateG, 'Carbohydrates'),
    calories: nonNegativeNumber(input.calories, 'Calories'),
    visibility: requireVisibility(input.visibility ?? 'private'),
    notes: optionalString(input.notes),
  };
}

function defaultServingGrams(servingQuantity: number, servingUnit: string) {
  try {
    return convertQuantityToGrams(servingQuantity, servingUnit);
  } catch {
    return null;
  }
}

function requireServingGrams(servingQuantity: number, servingUnit: string, servingGrams: number | null) {
  const resolved = servingGrams ?? defaultServingGrams(servingQuantity, servingUnit);
  if (!resolved) throw new ApiError('VALIDATION_ERROR', 'Serving grams is required for this unit.');
  return resolved;
}

async function visibleFood(ctx: Ctx, user: DbUser, foodId: string) {
  const food = await ctx.env.DB.prepare(
    'SELECT * FROM foods WHERE id = ? AND archived_at IS NULL AND (owner_user_id = ? OR visibility = ?)',
  )
    .bind(foodId, user.id, 'public')
    .first<DbFood>();
  if (!food) throw new ApiError('NOT_FOUND', 'Food not found.', 404);
  return food;
}

async function ownFood(ctx: Ctx, user: DbUser, foodId: string) {
  const food = await ctx.env.DB.prepare('SELECT * FROM foods WHERE id = ? AND owner_user_id = ? AND archived_at IS NULL')
    .bind(foodId, user.id)
    .first<DbFood>();
  if (!food) throw new ApiError('NOT_FOUND', 'Food not found.', 404);
  return food;
}

async function assertUniqueFoodDescription(ctx: Ctx, user: DbUser, description: string, excludeFoodId?: string) {
  const existing = await ctx.env.DB.prepare(
    `SELECT id FROM foods
     WHERE owner_user_id = ? AND archived_at IS NULL AND lower(description) = lower(?) AND (? IS NULL OR id != ?)
     LIMIT 1`,
  )
    .bind(user.id, description, excludeFoodId ?? null, excludeFoodId ?? null)
    .first<{ id: string }>();
  if (existing) throw new ApiError('VALIDATION_ERROR', 'Food already exists in DB.');
}

async function listFoods(ctx: Ctx, user: DbUser, url: URL) {
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const terms = search.split(/\s+/).filter(Boolean).map(escapeLike);
  const scope = url.searchParams.get('scope') ?? 'all';
  const clauses = ['archived_at IS NULL'];
  const params: unknown[] = [];
  let orderBy = 'description';
  const orderParams: unknown[] = [];

  if (terms.length) {
    clauses.push(`(${terms.map(() => "lower(description) LIKE ? ESCAPE '\\'").join(' OR ')})`);
    params.push(...terms.map((term) => `%${term}%`));
    orderBy = `CASE
      WHEN lower(description) LIKE ? ESCAPE '\\' THEN 0
      WHEN ${terms.map(() => "lower(description) LIKE ? ESCAPE '\\'").join(' AND ')} THEN 1
      ELSE 2
    END, description`;
    orderParams.push(`${escapeLike(search)}%`, ...terms.map((term) => `%${term}%`));
  }

  if (scope === 'mine') {
    clauses.push('owner_user_id = ?');
    params.push(user.id);
  } else if (scope === 'public') {
    clauses.push('visibility = ?');
    params.push('public');
  } else {
    clauses.push('(owner_user_id = ? OR visibility = ?)');
    params.push(user.id, 'public');
  }
  const result = await ctx.env.DB.prepare(`SELECT * FROM foods WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`)
    .bind(...params, ...orderParams)
    .all<DbFood>();
  return json({ ok: true, foods: result.results.map(mapFood) });
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function createFood(ctx: Ctx, user: DbUser) {
  const data = foodInput(await body(ctx));
  const servingGrams = requireServingGrams(data.servingQuantity, data.servingUnit, data.servingGrams);
  await assertUniqueFoodDescription(ctx, user, data.description);
  const foodId = id();
  await ctx.env.DB.prepare(
    `INSERT INTO foods (id, owner_user_id, description, serving_quantity, serving_unit, serving_grams, protein_g, fat_g, carbohydrate_g, calories, visibility, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(foodId, user.id, data.description, data.servingQuantity, data.servingUnit, servingGrams, data.proteinG, data.fatG, data.carbohydrateG, data.calories, data.visibility, data.notes)
    .run();
  return json({ ok: true, food: mapFood((await ownFood(ctx, user, foodId))!) });
}

async function updateFood(ctx: Ctx, user: DbUser, foodId: string) {
  await ownFood(ctx, user, foodId);
  const data = foodInput(await body(ctx));
  const servingGrams = requireServingGrams(data.servingQuantity, data.servingUnit, data.servingGrams);
  await assertUniqueFoodDescription(ctx, user, data.description, foodId);
  await ctx.env.DB.prepare(
    `UPDATE foods SET description = ?, serving_quantity = ?, serving_unit = ?, serving_grams = ?, protein_g = ?, fat_g = ?, carbohydrate_g = ?, calories = ?, visibility = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(data.description, data.servingQuantity, data.servingUnit, servingGrams, data.proteinG, data.fatG, data.carbohydrateG, data.calories, data.visibility, data.notes, foodId, user.id)
    .run();
  return json({ ok: true, food: mapFood(await ownFood(ctx, user, foodId)) });
}

async function archiveFood(ctx: Ctx, user: DbUser, foodId: string) {
  await ownFood(ctx, user, foodId);
  await ctx.env.DB.prepare('UPDATE foods SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?')
    .bind(foodId, user.id)
    .run();
  return json({ ok: true });
}

async function copyFood(ctx: Ctx, user: DbUser, foodId: string) {
  const source = await visibleFood(ctx, user, foodId);
  const input: Record<string, unknown> = await body(ctx).catch(() => ({}));
  const visibility = input.visibility ? requireVisibility(input.visibility) : 'private';
  const newId = id();
  const servingGrams = source.serving_grams ?? defaultServingGrams(source.serving_quantity, source.serving_unit);
  await ctx.env.DB.prepare(
    `INSERT INTO foods (id, owner_user_id, description, serving_quantity, serving_unit, serving_grams, protein_g, fat_g, carbohydrate_g, calories, visibility, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId, user.id, source.description, source.serving_quantity, source.serving_unit, servingGrams, source.protein_g, source.fat_g, source.carbohydrate_g, source.calories, visibility, source.notes)
    .run();
  return json({ ok: true, food: mapFood(await ownFood(ctx, user, newId)) });
}

function mapMeal(meal: DbMeal, items: unknown[] = []) {
  return { id: meal.id, ownerUserId: meal.owner_user_id, name: meal.name, description: meal.description, visibility: meal.visibility, items };
}

async function visibleMeal(ctx: Ctx, user: DbUser, mealId: string) {
  const meal = await ctx.env.DB.prepare(
    'SELECT * FROM saved_meals WHERE id = ? AND archived_at IS NULL AND (owner_user_id = ? OR visibility = ?)',
  )
    .bind(mealId, user.id, 'public')
    .first<DbMeal>();
  if (!meal) throw new ApiError('NOT_FOUND', 'Saved meal not found.', 404);
  return meal;
}

async function ownMeal(ctx: Ctx, user: DbUser, mealId: string) {
  const meal = await ctx.env.DB.prepare('SELECT * FROM saved_meals WHERE id = ? AND owner_user_id = ? AND archived_at IS NULL')
    .bind(mealId, user.id)
    .first<DbMeal>();
  if (!meal) throw new ApiError('NOT_FOUND', 'Saved meal not found.', 404);
  return meal;
}

async function mealItems(ctx: Ctx, mealId: string) {
  const result = await ctx.env.DB.prepare(
    `SELECT smi.id, smi.food_id AS foodId, smi.quantity, smi.quantity_unit AS quantityUnit, smi.sort_order AS sortOrder,
      f.description AS foodDescription, f.serving_quantity AS servingQuantity, f.serving_unit AS servingUnit,
      f.protein_g AS proteinG, f.fat_g AS fatG, f.carbohydrate_g AS carbohydrateG, f.calories
     FROM saved_meal_items smi JOIN foods f ON f.id = smi.food_id
     WHERE smi.saved_meal_id = ? ORDER BY smi.sort_order, f.description`,
  )
    .bind(mealId)
    .all();
  return result.results;
}

async function listMeals(ctx: Ctx, user: DbUser, url: URL) {
  const search = `%${(url.searchParams.get('search') ?? '').trim()}%`;
  const scope = url.searchParams.get('scope') ?? 'all';
  const clauses = ['archived_at IS NULL', 'name LIKE ?'];
  const params: unknown[] = [search];
  if (scope === 'mine') {
    clauses.push('owner_user_id = ?');
    params.push(user.id);
  } else if (scope === 'public') {
    clauses.push('visibility = ?');
    params.push('public');
  } else {
    clauses.push('(owner_user_id = ? OR visibility = ?)');
    params.push(user.id, 'public');
  }
  const result = await ctx.env.DB.prepare(`SELECT * FROM saved_meals WHERE ${clauses.join(' AND ')} ORDER BY name LIMIT 100`)
    .bind(...params)
    .all<DbMeal>();
  const meals = await Promise.all(result.results.map(async (meal) => mapMeal(meal, await mealItems(ctx, meal.id))));
  return json({ ok: true, meals });
}

function mealInput(input: Record<string, unknown>) {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) throw new ApiError('VALIDATION_ERROR', 'Saved meal must contain at least one item.');
  return {
    name: requireString(input.name, 'Meal name'),
    description: optionalString(input.description),
    visibility: requireVisibility(input.visibility ?? 'private'),
    items: rawItems.map((item, index) => {
      const row = item as Record<string, unknown>;
      return {
        foodId: requireString(row.foodId, 'Food'),
        quantity: positiveNumber(row.quantity, 'Quantity'),
        quantityUnit: requireString(row.quantityUnit, 'Quantity unit'),
        sortOrder: index,
      };
    }),
  };
}

async function createMeal(ctx: Ctx, user: DbUser) {
  const data = mealInput(await body(ctx));
  for (const item of data.items) await visibleFood(ctx, user, item.foodId);
  const mealId = id();
  const batch: D1PreparedStatement[] = [
    ctx.env.DB.prepare('INSERT INTO saved_meals (id, owner_user_id, name, description, visibility) VALUES (?, ?, ?, ?, ?)')
      .bind(mealId, user.id, data.name, data.description, data.visibility),
    ...data.items.map((item) =>
      ctx.env.DB.prepare('INSERT INTO saved_meal_items (id, saved_meal_id, food_id, quantity, quantity_unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id(), mealId, item.foodId, item.quantity, item.quantityUnit, item.sortOrder),
    ),
  ];
  await ctx.env.DB.batch(batch);
  return json({ ok: true, meal: mapMeal(await ownMeal(ctx, user, mealId), await mealItems(ctx, mealId)) });
}

async function updateMeal(ctx: Ctx, user: DbUser, mealId: string) {
  await ownMeal(ctx, user, mealId);
  const data = mealInput(await body(ctx));
  for (const item of data.items) await visibleFood(ctx, user, item.foodId);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE saved_meals SET name = ?, description = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?')
      .bind(data.name, data.description, data.visibility, mealId, user.id),
    ctx.env.DB.prepare('DELETE FROM saved_meal_items WHERE saved_meal_id = ?').bind(mealId),
    ...data.items.map((item) =>
      ctx.env.DB.prepare('INSERT INTO saved_meal_items (id, saved_meal_id, food_id, quantity, quantity_unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id(), mealId, item.foodId, item.quantity, item.quantityUnit, item.sortOrder),
    ),
  ]);
  return json({ ok: true, meal: mapMeal(await ownMeal(ctx, user, mealId), await mealItems(ctx, mealId)) });
}

async function archiveMeal(ctx: Ctx, user: DbUser, mealId: string) {
  await ownMeal(ctx, user, mealId);
  await ctx.env.DB.prepare('UPDATE saved_meals SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?')
    .bind(mealId, user.id)
    .run();
  return json({ ok: true });
}

async function copyMeal(ctx: Ctx, user: DbUser, mealId: string) {
  const source = await visibleMeal(ctx, user, mealId);
  const items = await mealItems(ctx, mealId);
  const input: Record<string, unknown> = await body(ctx).catch(() => ({}));
  const visibility = input.visibility ? requireVisibility(input.visibility) : 'private';
  const newId = id();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO saved_meals (id, owner_user_id, name, description, visibility) VALUES (?, ?, ?, ?, ?)')
      .bind(newId, user.id, source.name, source.description, visibility),
    ...items.map((item, index) =>
      ctx.env.DB.prepare('INSERT INTO saved_meal_items (id, saved_meal_id, food_id, quantity, quantity_unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id(), newId, String(item.foodId), Number(item.quantity), String(item.quantityUnit), index),
    ),
  ]);
  return json({ ok: true, meal: mapMeal(await ownMeal(ctx, user, newId), await mealItems(ctx, newId)) });
}

function diaryPayload(input: Record<string, unknown>) {
  return {
    foodId: requireString(input.foodId, 'Food'),
    eatenDate: requireDate(input.eatenDate, 'Date'),
    mealLabel: optionalString(input.mealLabel),
    quantity: positiveNumber(input.quantity, 'Quantity'),
    quantityUnit: requireString(input.quantityUnit, 'Quantity unit'),
    notes: optionalString(input.notes),
  };
}

async function insertDiary(ctx: Ctx, user: DbUser, food: DbFood, data: { eatenDate: string; mealLabel: string | null; quantity: number; quantityUnit: string; notes?: string | null }, sourceMealId: string | null = null) {
  const servingQuantity = convertConsumedQuantityToServingQuantity(
    { servingQuantity: food.serving_quantity, servingUnit: food.serving_unit, servingGrams: food.serving_grams, proteinG: food.protein_g, fatG: food.fat_g, carbohydrateG: food.carbohydrate_g, calories: food.calories },
    data.quantity,
    data.quantityUnit,
  );
  const nutrients = calculateLoggedNutrition(
    {
      servingQuantity: food.serving_quantity,
      proteinG: food.protein_g,
      fatG: food.fat_g,
      carbohydrateG: food.carbohydrate_g,
      calories: food.calories,
    },
    servingQuantity,
  );
  const diaryId = id();
  await ctx.env.DB.prepare(
    `INSERT INTO diary_items (id, user_id, food_id, source_saved_meal_id, eaten_date, meal_label, quantity, quantity_unit, protein_g, fat_g, carbohydrate_g, calories, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(diaryId, user.id, food.id, sourceMealId, data.eatenDate, data.mealLabel, data.quantity, data.quantityUnit, nutrients.proteinG, nutrients.fatG, nutrients.carbohydrateG, nutrients.calories, data.notes ?? null)
    .run();
  return diaryId;
}

async function createDiaryItem(ctx: Ctx, user: DbUser) {
  const data = diaryPayload(await body(ctx));
  const food = await visibleFood(ctx, user, data.foodId);
  const diaryId = await insertDiary(ctx, user, food, data);
  return json({ ok: true, item: await diaryItem(ctx, user, diaryId) });
}

async function diaryItem(ctx: Ctx, user: DbUser, itemId: string) {
  const item = await ctx.env.DB.prepare(
    `SELECT di.*, f.description AS foodDescription FROM diary_items di JOIN foods f ON f.id = di.food_id WHERE di.id = ? AND di.user_id = ?`,
  )
    .bind(itemId, user.id)
    .first();
  if (!item) throw new ApiError('NOT_FOUND', 'Diary item not found.', 404);
  return item;
}

async function updateDiaryItem(ctx: Ctx, user: DbUser, itemId: string) {
  const current = await diaryItem(ctx, user, itemId);
  const data = diaryPayload({ ...(await body(ctx)), foodId: String(current.food_id) });
  const food = await visibleFood(ctx, user, String(current.food_id));
  const servingQuantity = convertConsumedQuantityToServingQuantity(
    { servingQuantity: food.serving_quantity, servingUnit: food.serving_unit, servingGrams: food.serving_grams, proteinG: food.protein_g, fatG: food.fat_g, carbohydrateG: food.carbohydrate_g, calories: food.calories },
    data.quantity,
    data.quantityUnit,
  );
  const nutrients = calculateLoggedNutrition(
    { servingQuantity: food.serving_quantity, proteinG: food.protein_g, fatG: food.fat_g, carbohydrateG: food.carbohydrate_g, calories: food.calories },
    servingQuantity,
  );
  await ctx.env.DB.prepare(
    `UPDATE diary_items SET eaten_date = ?, meal_label = ?, quantity = ?, quantity_unit = ?, protein_g = ?, fat_g = ?, carbohydrate_g = ?, calories = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
  )
    .bind(data.eatenDate, data.mealLabel, data.quantity, data.quantityUnit, nutrients.proteinG, nutrients.fatG, nutrients.carbohydrateG, nutrients.calories, data.notes, itemId, user.id)
    .run();
  return json({ ok: true, item: await diaryItem(ctx, user, itemId) });
}

async function deleteDiaryItem(ctx: Ctx, user: DbUser, itemId: string) {
  await diaryItem(ctx, user, itemId);
  await ctx.env.DB.prepare('DELETE FROM diary_items WHERE id = ? AND user_id = ?').bind(itemId, user.id).run();
  return json({ ok: true });
}

async function addMealToDiary(ctx: Ctx, user: DbUser, mealId: string) {
  await visibleMeal(ctx, user, mealId);
  const input = await body(ctx);
  const eatenDate = requireDate(input.eatenDate, 'Date');
  const mealLabel = optionalString(input.mealLabel);
  const items = await ctx.env.DB.prepare(
    `SELECT smi.*, f.* FROM saved_meal_items smi JOIN foods f ON f.id = smi.food_id WHERE smi.saved_meal_id = ? ORDER BY smi.sort_order`,
  )
    .bind(mealId)
    .all<DbFood & { quantity: number; quantity_unit: string }>();
  const ids: string[] = [];
  for (const item of items.results) {
    ids.push(await insertDiary(ctx, user, item, { eatenDate, mealLabel, quantity: item.quantity, quantityUnit: item.quantity_unit }, mealId));
  }
  return json({ ok: true, items: await Promise.all(ids.map((itemId) => diaryItem(ctx, user, itemId))) });
}

async function getDay(ctx: Ctx, user: DbUser, date: string) {
  const eatenDate = requireDate(date);
  const items = await ctx.env.DB.prepare(
    `SELECT di.*, f.description AS foodDescription FROM diary_items di JOIN foods f ON f.id = di.food_id WHERE di.user_id = ? AND di.eaten_date = ? ORDER BY di.created_at`,
  )
    .bind(user.id, eatenDate)
    .all();
  const totals = calculateTotals(
    items.results.map((item) => ({
      proteinG: Number(item.protein_g),
      fatG: Number(item.fat_g),
      carbohydrateG: Number(item.carbohydrate_g),
      calories: Number(item.calories),
    })),
  );
  const weight = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date = ?').bind(user.id, eatenDate).first<DbWeight>();
  const goal = user.protein_goal_g;
  return json({
    ok: true,
    date: eatenDate,
    totals,
    proteinGoal: goal
      ? { goalG: goal, actualG: totals.proteinG, remainingG: Math.max(0, goal - totals.proteinG), met: totals.proteinG >= goal }
      : null,
    items: items.results,
    weight,
  });
}

async function listWeight(ctx: Ctx, user: DbUser, url: URL) {
  const start = requireDate(url.searchParams.get('start') ?? '1900-01-01', 'Start date');
  const end = requireDate(url.searchParams.get('end') ?? '2999-12-31', 'End date');
  const result = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all<DbWeight>();
  return json({ ok: true, weights: result.results });
}

async function upsertWeight(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const entryDate = requireDate(input.entryDate, 'Date');
  const weightValue = positiveNumber(input.weightValue, 'Weight');
  const weightUnit = requireWeightUnit(input.weightUnit ?? 'lb');
  const notes = optionalString(input.notes);
  const weightId = id();
  await ctx.env.DB.prepare(
    `INSERT INTO weight_entries (id, user_id, entry_date, weight_value, weight_unit, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, entry_date) DO UPDATE SET weight_value = excluded.weight_value, weight_unit = excluded.weight_unit, notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(weightId, user.id, entryDate, weightValue, weightUnit, notes)
    .run();
  const weight = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date = ?').bind(user.id, entryDate).first<DbWeight>();
  return json({ ok: true, weight });
}

async function updateWeight(ctx: Ctx, user: DbUser, weightId: string) {
  const input = await body(ctx);
  const entryDate = requireDate(input.entryDate, 'Date');
  const weightValue = positiveNumber(input.weightValue, 'Weight');
  const weightUnit = requireWeightUnit(input.weightUnit ?? 'lb');
  const notes = optionalString(input.notes);
  const result = await ctx.env.DB.prepare(
    'UPDATE weight_entries SET entry_date = ?, weight_value = ?, weight_unit = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
  )
    .bind(entryDate, weightValue, weightUnit, notes, weightId, user.id)
    .run();
  if (!result.meta.changes) throw new ApiError('NOT_FOUND', 'Weight entry not found.', 404);
  return json({ ok: true });
}

async function deleteWeight(ctx: Ctx, user: DbUser, weightId: string) {
  const result = await ctx.env.DB.prepare('DELETE FROM weight_entries WHERE id = ? AND user_id = ?').bind(weightId, user.id).run();
  if (!result.meta.changes) throw new ApiError('NOT_FOUND', 'Weight entry not found.', 404);
  return json({ ok: true });
}

async function reportSummary(ctx: Ctx, user: DbUser, url: URL) {
  const start = requireDate(url.searchParams.get('start'), 'Start date');
  const end = requireDate(url.searchParams.get('end'), 'End date');
  const days = await ctx.env.DB.prepare(
    `SELECT eaten_date AS date, SUM(calories) AS calories, SUM(protein_g) AS proteinG, SUM(fat_g) AS fatG, SUM(carbohydrate_g) AS carbohydrateG, COUNT(*) AS itemCount
     FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ? GROUP BY eaten_date ORDER BY eaten_date`,
  )
    .bind(user.id, start, end)
    .all();
  const weights = await ctx.env.DB.prepare('SELECT entry_date AS date, weight_value AS value, weight_unit AS unit FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all();
  return json({ ok: true, start, end, days: days.results, weights: weights.results });
}

async function reportMaintenance(ctx: Ctx, user: DbUser, url: URL) {
  const start = requireDate(url.searchParams.get('start'), 'Start date');
  const end = requireDate(url.searchParams.get('end'), 'End date');
  const total = await ctx.env.DB.prepare('SELECT COALESCE(SUM(calories), 0) AS totalCalories FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ?')
    .bind(user.id, start, end)
    .first<{ totalCalories: number }>();
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all<DbWeight>();
  if (weights.results.length < 2) {
    return json({
      ok: true,
      canCalculate: false,
      start,
      end,
      totalCalories: Number(total?.totalCalories ?? 0),
      weightEntryCount: weights.results.length,
      message: 'At least two weight entries are required in the selected range.',
    });
  }
  const startWeight = mapWeightPoint(weights.results[0]);
  const endWeight = mapWeightPoint(weights.results[weights.results.length - 1]);
  return json({
    ok: true,
    canCalculate: true,
    start,
    end,
    startWeight,
    endWeight,
    ...estimateMaintenanceCalories({ start, end, totalCalories: Number(total?.totalCalories ?? 0), startWeight, endWeight }),
  });
}

function mapWeightPoint(weight: DbWeight) {
  return {
    date: weight.entry_date,
    value: weight.weight_value,
    unit: weight.weight_unit,
    valueLb: toLb(weight.weight_value, weight.weight_unit),
  };
}

async function createGoalPlan(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const goalWeightValue = positiveNumber(input.goalWeightValue, 'Goal weight');
  const goalWeightUnit = requireWeightUnit(input.goalWeightUnit ?? 'lb');
  const targetDate = requireDate(input.targetDate, 'Target date');
  if (Date.parse(`${targetDate}T00:00:00Z`) <= Date.now()) throw new ApiError('VALIDATION_ERROR', 'Target date must be in the future.');
  await ctx.env.DB.prepare('UPDATE goal_plans SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(user.id).run();
  const goalId = id();
  await ctx.env.DB.prepare('INSERT INTO goal_plans (id, user_id, goal_weight_value, goal_weight_unit, target_date) VALUES (?, ?, ?, ?, ?)')
    .bind(goalId, user.id, goalWeightValue, goalWeightUnit, targetDate)
    .run();
  return activeGoalPlan(ctx, user);
}

async function listGoalPlans(ctx: Ctx, user: DbUser, url: URL) {
  const showArchived = url.searchParams.get('archived') === 'true';
  const query = showArchived
    ? 'SELECT * FROM goal_plans WHERE user_id = ? ORDER BY target_date DESC'
    : 'SELECT * FROM goal_plans WHERE user_id = ? AND (archived_at IS NULL OR archived_at = \'\') ORDER BY target_date DESC';
  const plans = await ctx.env.DB.prepare(query)
    .bind(user.id)
    .all<{ id: string; goal_weight_value: number; goal_weight_unit: 'lb' | 'kg'; target_date: string; created_at: string; is_active: number; archived_at?: string }>();
  return json({ ok: true, plans: plans.results });
}

async function archiveGoalPlan(ctx: Ctx, user: DbUser, goalId: string) {
  await ctx.env.DB.prepare('UPDATE goal_plans SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(goalId, user.id)
    .run();
  return json({ ok: true });
}

async function activeGoalPlan(ctx: Ctx, user: DbUser) {
  const plan = await ctx.env.DB.prepare('SELECT * FROM goal_plans WHERE user_id = ? AND is_active = 1 AND (archived_at IS NULL OR archived_at = \'\') ORDER BY created_at DESC LIMIT 1')
    .bind(user.id)
    .first<{ id: string; goal_weight_value: number; goal_weight_unit: 'lb' | 'kg'; target_date: string }>();
  if (!plan) return json({ ok: true, plan: null });
  const latestWeight = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY entry_date DESC LIMIT 1').bind(user.id).first<DbWeight>();
  if (!latestWeight) return json({ ok: true, plan, calculation: null, message: 'Add a current weight to calculate target calories.' });
  const latestWeightLb = toLb(latestWeight.weight_value, latestWeight.weight_unit);
  const goalWeightLb = toLb(plan.goal_weight_value, plan.goal_weight_unit);
  const daysToTarget = Math.max(
    0,
    Math.ceil((Date.parse(`${plan.target_date}T00:00:00Z`) - Date.parse(`${latestWeight.entry_date}T00:00:00Z`)) / 86_400_000),
  );
  const weeklyChangeLb = daysToTarget > 0 ? ((goalWeightLb - latestWeightLb) / daysToTarget) * 7 : 0;
  const goalPace = {
    latestWeight: mapWeightPoint(latestWeight),
    daysToTarget,
    weeklyChangeLb: Math.round((weeklyChangeLb + Number.EPSILON) * 100) / 100,
    direction: weeklyChangeLb < 0 ? 'lose' : weeklyChangeLb > 0 ? 'gain' : 'maintain',
  };
  const maintenanceEnd = latestWeight.entry_date;
  const maintenanceStart = new Date(Date.parse(`${maintenanceEnd}T00:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const maintenance = await maintenanceForRange(ctx, user, maintenanceStart, maintenanceEnd);
  if (!maintenance) return json({ ok: true, plan, goalPace, calculation: null, message: 'Add at least two weights and food logs to estimate maintenance.' });
  const calculation = calculateGoalTarget({
    currentWeightLb: latestWeightLb,
    goalWeightLb,
    currentDate: new Date().toISOString().slice(0, 10),
    targetDate: plan.target_date,
    maintenanceCalories: maintenance.estimatedMaintenanceCalories,
  });
  return json({ ok: true, plan, goalPace, maintenance, calculation });
}

async function maintenanceForRange(ctx: Ctx, user: DbUser, start: string, end: string) {
  const total = await ctx.env.DB.prepare('SELECT COALESCE(SUM(calories), 0) AS totalCalories FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ?')
    .bind(user.id, start, end)
    .first<{ totalCalories: number }>();
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all<DbWeight>();
  if (weights.results.length < 2) return null;
  const startWeight = mapWeightPoint(weights.results[0]);
  const endWeight = mapWeightPoint(weights.results[weights.results.length - 1]);
  return { start, end, startWeight, endWeight, ...estimateMaintenanceCalories({ start, end, totalCalories: Number(total?.totalCalories ?? 0), startWeight, endWeight }) };
}
