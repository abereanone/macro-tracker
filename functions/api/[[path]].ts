import { calendarDaysInclusive, calculateGoalTarget, calculateLoggedNutrition, calculateTotals, convertConsumedQuantityToServingQuantity, convertQuantityToGrams, estimateMaintenanceCalories, estimateMaintenanceFromLoggedDays, estimateMaintenanceFromRecentWindow, toLb } from '../../src/shared/calculations';
import { Resend } from 'resend';
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

type Env = { DB: D1Database; RESEND_API_KEY: string; DEV_AUTH_BYPASS?: string };
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
type DbSession = { user_id: string };
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
type DbMaintenanceSnapshot = {
  id: string;
  calculated_date: string;
  maintenance_calories: number;
  source: string;
  start_date: string | null;
  end_date: string | null;
  calorie_start_date: string | null;
  calorie_end_date: string | null;
  period_days: number | null;
  logged_day_count: number | null;
  average_logged_calories: number | null;
  estimated_period_calories: number | null;
  weight_change_lb: number | null;
  daily_weight_adjustment: number | null;
};
type DbDailyGoal = { id: string; label: string; goal_type: string; minutes: number | null; active: number; sort_order: number };
type DbFriendInvite = {
  id: string;
  inviter_user_id: string;
  invitee_email: string;
  token_hash: string;
  status: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

const sessionCookieName = 'macro_session';
const loginCodeExpiresMs = 10 * 60 * 1000;
const sessionExpiresMs = 30 * 24 * 60 * 60 * 1000;
const friendInviteExpiresMs = 14 * 24 * 60 * 60 * 1000;
const maintenanceLookbackDays = 14;
const maxLoginAttempts = 5;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const segments = (ctx.params.path ?? []) as string[];
    const path = `/${segments.join('/')}`;
    const method = ctx.request.method.toUpperCase();

    if (method === 'OPTIONS') return json({ ok: true });
    if (method === 'POST' && path === '/auth/request-code') return requestLoginCode(ctx);
    if (method === 'POST' && path === '/auth/verify-code') return verifyLoginCode(ctx);
    if (method === 'GET' && path === '/auth/dev-users') return listDevUsers(ctx);
    if (method === 'POST' && path === '/auth/dev-login') return devLogin(ctx);
    if (method === 'POST' && path === '/auth/logout') return logout(ctx);

    const user = await requireUser(ctx);

    if (method === 'GET' && path === '/me') return json({ ok: true, user: mapUser(user) });
    if (method === 'PUT' && path === '/me/settings') return updateSettings(ctx, user);
    if (method === 'POST' && path === '/me/delete-data') return deleteMyData(ctx, user);
    if (path === '/help-dismissals' && method === 'GET') return listHelpDismissals(ctx, user);
    if (path === '/help-dismissals' && method === 'POST') return dismissHelp(ctx, user);

    if (path === '/friends' && method === 'GET') return listFriends(ctx, user);
    if (segments[0] === 'friends' && segments[1] && method === 'DELETE') return removeFriendAccess(ctx, user, segments[1]);
    if (path === '/friend-invites' && method === 'POST') return createFriendInvite(ctx, user, url);
    if (path === '/friend-invites/accept' && method === 'POST') return acceptFriendInvite(ctx, user);
    if (segments[0] === 'friend-invites' && segments[1] && method === 'DELETE') return revokeFriendInvite(ctx, user, segments[1]);

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

    if (segments[0] === 'days' && segments[1] && method === 'GET') return getDay(ctx, await readableUser(ctx, user, url), segments[1]);
    if (path === '/diary-items' && method === 'POST') return createDiaryItem(ctx, user);
    if (segments[0] === 'diary-items' && segments[1] && method === 'PUT') return updateDiaryItem(ctx, user, segments[1]);
    if (segments[0] === 'diary-items' && segments[1] && method === 'DELETE') return deleteDiaryItem(ctx, user, segments[1]);

    if (path === '/weight' && method === 'GET') return listWeight(ctx, await readableUser(ctx, user, url), url);
    if (path === '/weight' && method === 'POST') return upsertWeight(ctx, user);
    if (segments[0] === 'weight' && segments[1] && method === 'PUT') return updateWeight(ctx, user, segments[1]);
    if (segments[0] === 'weight' && segments[1] && method === 'DELETE') return deleteWeight(ctx, user, segments[1]);

    if (path === '/reports/summary' && method === 'GET') return reportSummary(ctx, await readableUser(ctx, user, url), url);
    if (path === '/reports/maintenance' && method === 'GET') return reportMaintenance(ctx, await readableUser(ctx, user, url), url);
    if (path === '/reports/two-week-weight-loss' && method === 'GET') return reportTwoWeekWeightLoss(ctx, await readableUser(ctx, user, url));
    if (path === '/daily-goals' && method === 'GET') return listDailyGoals(ctx, user);
    if (path === '/daily-goals' && method === 'PUT') return updateDailyGoals(ctx, user);
    if (path === '/daily-goal-completions' && method === 'POST') return setDailyGoalCompletion(ctx, user);
    if (path === '/goal-plans' && method === 'POST') return createGoalPlan(ctx, user);
    if (path === '/goal-plans' && method === 'GET') return listGoalPlans(ctx, user, url);
    if (path === '/goal-plans/active' && method === 'GET') return activeGoalPlan(ctx, await readableUser(ctx, user, url));
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

function dateInUserTimezone(user: DbUser, date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: user.timezone || 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function maintenanceWindow(user: DbUser) {
  const end = dateInUserTimezone(user);
  return { start: addDays(end, -maintenanceLookbackDays), end };
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function requireEmail(value: unknown) {
  try {
    return normalizeEmail(value);
  } catch (err) {
    throw new ApiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Enter a valid email address.');
  }
}

function requireLoginCode(value: unknown) {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', 'Enter the 6 digit code.');
  const normalized = value.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) throw new ApiError('VALIDATION_ERROR', 'Enter the 6 digit code.');
  return normalized;
}

function randomCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, '0');
}

function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function requireDevAuthBypass(ctx: Ctx) {
  if (String(ctx.env.DEV_AUTH_BYPASS ?? '').trim().toLowerCase() !== 'true') {
    throw new ApiError('NOT_FOUND', 'Not found.', 404);
  }
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
  const token = getCookie(ctx.request, sessionCookieName);
  if (!token) throw new ApiError('UNAUTHORIZED', 'Log in with an email code first.', 401);
  const tokenHash = await sha256(token);
  const session = await ctx.env.DB.prepare(
    'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?',
  )
    .bind(tokenHash, nowIso())
    .first<DbSession>();
  if (!session) throw new ApiError('UNAUTHORIZED', 'Log in with an email code first.', 401);
  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<DbUser>();
  if (!user) throw new ApiError('UNAUTHORIZED', 'Log in with an email address first.', 401);
  return user;
}

async function requestLoginCode(ctx: Ctx) {
  const input = await body(ctx);
  const email = requireEmail(input.email);
  const recent = await ctx.env.DB.prepare(
    'SELECT created_at FROM auth_login_codes WHERE email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(email, new Date(Date.now() - 60_000).toISOString())
    .first<{ created_at: string }>();
  if (recent) throw new ApiError('RATE_LIMITED', 'Wait a minute before requesting another code.', 429);

  const code = randomCode();
  const codeHash = await sha256(`${email}:${code}`);
  await ctx.env.DB.prepare(
    'UPDATE auth_login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL',
  )
    .bind(nowIso(), email)
    .run();
  await ctx.env.DB.prepare(
    'INSERT INTO auth_login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id(), email, codeHash, futureIso(loginCodeExpiresMs), nowIso())
    .run();

  const resend = new Resend(ctx.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Macro Tracker <login@macros.michaelcoughlin.net>',
    to: email,
    subject: 'Your Macro Tracker login code',
    text: `Your Macro Tracker login code is ${code}. It expires in 10 minutes.`,
  });

  return json({ ok: true });
}

async function verifyLoginCode(ctx: Ctx) {
  const input = await body(ctx);
  const email = requireEmail(input.email);
  const code = requireLoginCode(input.code);
  const codeHash = await sha256(`${email}:${code}`);
  const challenge = await ctx.env.DB.prepare(
    'SELECT id, attempt_count FROM auth_login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(email, nowIso())
    .first<{ id: string; attempt_count: number }>();
  if (!challenge) throw new ApiError('UNAUTHORIZED', 'Request a new login code.', 401);
  if (challenge.attempt_count >= maxLoginAttempts) {
    throw new ApiError('UNAUTHORIZED', 'Too many attempts. Request a new login code.', 401);
  }

  const matched = await ctx.env.DB.prepare(
    'SELECT id FROM auth_login_codes WHERE id = ? AND code_hash = ?',
  )
    .bind(challenge.id, codeHash)
    .first<{ id: string }>();
  if (!matched) {
    await ctx.env.DB.prepare('UPDATE auth_login_codes SET attempt_count = attempt_count + 1 WHERE id = ?').bind(challenge.id).run();
    throw new ApiError('UNAUTHORIZED', 'That code is not correct.', 401);
  }

  await ctx.env.DB.prepare('UPDATE auth_login_codes SET used_at = ? WHERE id = ?').bind(nowIso(), challenge.id).run();

  const user = await findOrCreateUserByEmail(ctx, email);
  return createSessionResponse(ctx, user);
}

async function devLogin(ctx: Ctx) {
  requireDevAuthBypass(ctx);
  const input = await body(ctx);
  const email = requireEmail(input.email);
  const user = await findOrCreateUserByEmail(ctx, email);
  return createSessionResponse(ctx, user);
}

async function listDevUsers(ctx: Ctx) {
  requireDevAuthBypass(ctx);
  const users = await ctx.env.DB.prepare(
    'SELECT id, email, first_name, last_name FROM users ORDER BY email LIMIT 100',
  ).all<Pick<DbUser, 'id' | 'email' | 'first_name' | 'last_name'>>();
  return json({
    ok: true,
    users: users.results.map((user) => ({
      id: user.id,
      email: user.email,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
    })),
  });
}

async function findOrCreateUserByEmail(ctx: Ctx, email: string) {
  let user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUser>();
  if (!user) {
    const userId = id();
    await ctx.env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(userId, email).run();
    user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
  }
  if (!user) throw new ApiError('SERVER_ERROR', 'Could not create user.', 500);
  return user;
}

async function createSessionResponse(ctx: Ctx, user: DbUser) {
  const token = randomToken();
  await ctx.env.DB.prepare(
    'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id(), user.id, await sha256(token), futureIso(sessionExpiresMs))
    .run();
  return json(
    { ok: true, user: mapUser(user) },
    { headers: { 'set-cookie': sessionCookie(ctx.request, token, Math.floor(sessionExpiresMs / 1000)) } },
  );
}

async function logout(ctx: Ctx) {
  const token = getCookie(ctx.request, sessionCookieName);
  if (token) {
    await ctx.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(nowIso(), await sha256(token))
      .run();
  }
  return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
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

function displayName(user: Pick<DbUser, 'email' | 'first_name' | 'last_name'>) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
}

function mapFriendUser(user: Pick<DbUser, 'id' | 'email' | 'first_name' | 'last_name'>) {
  return {
    id: user.id,
    email: user.email,
    name: displayName(user),
  };
}

async function readableUser(ctx: Ctx, viewer: DbUser, url: URL) {
  const ownerId = url.searchParams.get('ownerUserId')?.trim();
  if (!ownerId || ownerId === viewer.id) return viewer;
  const access = await ctx.env.DB.prepare(
    'SELECT id FROM friend_access WHERE viewer_user_id = ? AND owner_user_id = ?',
  )
    .bind(viewer.id, ownerId)
    .first<{ id: string }>();
  if (!access) throw new ApiError('FORBIDDEN', 'You do not have access to that friend.', 403);
  const owner = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ownerId).first<DbUser>();
  if (!owner) throw new ApiError('NOT_FOUND', 'Friend not found.', 404);
  return owner;
}

async function listFriends(ctx: Ctx, user: DbUser) {
  const viewable = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, fa.created_at
     FROM friend_access fa
     JOIN users u ON u.id = fa.owner_user_id
     WHERE fa.viewer_user_id = ?
     ORDER BY u.email`,
  )
    .bind(user.id)
    .all<Pick<DbUser, 'id' | 'email' | 'first_name' | 'last_name'> & { created_at: string }>();
  const sharedWith = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, fa.created_at
     FROM friend_access fa
     JOIN users u ON u.id = fa.viewer_user_id
     WHERE fa.owner_user_id = ?
     ORDER BY u.email`,
  )
    .bind(user.id)
    .all<Pick<DbUser, 'id' | 'email' | 'first_name' | 'last_name'> & { created_at: string }>();
  const receivedInvites = await ctx.env.DB.prepare(
    `SELECT fi.*, u.email AS inviter_email, u.first_name AS inviter_first_name, u.last_name AS inviter_last_name
     FROM friend_invites fi
     JOIN users u ON u.id = fi.inviter_user_id
     WHERE fi.invitee_email = ? AND fi.status = 'pending' AND fi.expires_at > ?
     ORDER BY fi.created_at DESC`,
  )
    .bind(user.email, nowIso())
    .all<DbFriendInvite & { inviter_email: string; inviter_first_name: string | null; inviter_last_name: string | null }>();
  const sentInvites = await ctx.env.DB.prepare(
    `SELECT id, invitee_email, status, expires_at, created_at
     FROM friend_invites
     WHERE inviter_user_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
  )
    .bind(user.id)
    .all<Pick<DbFriendInvite, 'id' | 'invitee_email' | 'status' | 'expires_at' | 'created_at'>>();
  return json({
    ok: true,
    friends: viewable.results.map((row) => ({ ...mapFriendUser(row), createdAt: row.created_at })),
    sharedWith: sharedWith.results.map((row) => ({ ...mapFriendUser(row), createdAt: row.created_at })),
    receivedInvites: receivedInvites.results.map((invite) => ({
      id: invite.id,
      inviter: {
        id: invite.inviter_user_id,
        email: invite.inviter_email,
        name: displayName({ email: invite.inviter_email, first_name: invite.inviter_first_name, last_name: invite.inviter_last_name }),
      },
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    })),
    sentInvites: sentInvites.results.map((invite) => ({
      id: invite.id,
      email: invite.invitee_email,
      status: invite.status,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    })),
  });
}

async function createFriendInvite(ctx: Ctx, user: DbUser, url: URL) {
  const input = await body(ctx);
  const email = requireEmail(input.email);
  if (email === user.email) throw new ApiError('VALIDATION_ERROR', 'Invite another person, not your own email.');
  const token = randomToken();
  const inviteId = id();
  const expiresAt = futureIso(friendInviteExpiresMs);
  await ctx.env.DB.prepare(
    `INSERT INTO friend_invites (id, inviter_user_id, invitee_email, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(inviteId, user.id, email, await sha256(token), expiresAt)
    .run();
  const inviteUrl = `${url.origin}/app/friends?invite=${encodeURIComponent(token)}`;
  const resend = new Resend(ctx.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Macro Tracker <login@macros.michaelcoughlin.net>',
    to: email,
    subject: `${displayName(user)} invited you to view their Macro Tracker`,
    text: `${displayName(user)} invited you to view their Macro Tracker diary and progress.\n\nAccept the invite here: ${inviteUrl}\n\nIf you do not want access, you can ignore this email. This invite expires in 14 days.`,
  });
  return json({ ok: true, invite: { id: inviteId, email, expiresAt } });
}

async function acceptFriendInvite(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const inviteId = typeof input.inviteId === 'string' ? input.inviteId.trim() : '';
  const invite = token
    ? await ctx.env.DB.prepare('SELECT * FROM friend_invites WHERE token_hash = ? AND status = ? AND expires_at > ?')
      .bind(await sha256(token), 'pending', nowIso())
      .first<DbFriendInvite>()
    : inviteId
      ? await ctx.env.DB.prepare('SELECT * FROM friend_invites WHERE id = ? AND status = ? AND expires_at > ?')
        .bind(inviteId, 'pending', nowIso())
        .first<DbFriendInvite>()
      : null;
  if (!invite) throw new ApiError('NOT_FOUND', 'Invite not found or expired.', 404);
  if (invite.invitee_email !== user.email) throw new ApiError('FORBIDDEN', 'This invite was sent to a different email address.', 403);
  if (invite.inviter_user_id === user.id) throw new ApiError('VALIDATION_ERROR', 'You cannot accept your own invite.');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO friend_access (id, viewer_user_id, owner_user_id, invite_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(viewer_user_id, owner_user_id) DO UPDATE SET invite_id = excluded.invite_id`,
    ).bind(id(), user.id, invite.inviter_user_id, invite.id),
    ctx.env.DB.prepare(
      "UPDATE friend_invites SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(user.id, nowIso(), invite.id),
  ]);
  return listFriends(ctx, user);
}

async function revokeFriendInvite(ctx: Ctx, user: DbUser, inviteId: string) {
  await ctx.env.DB.prepare(
    "UPDATE friend_invites SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND inviter_user_id = ? AND status = 'pending'",
  )
    .bind(inviteId, user.id)
    .run();
  return listFriends(ctx, user);
}

async function removeFriendAccess(ctx: Ctx, user: DbUser, ownerId: string) {
  await ctx.env.DB.prepare('DELETE FROM friend_access WHERE viewer_user_id = ? AND owner_user_id = ?')
    .bind(user.id, ownerId)
    .run();
  return listFriends(ctx, user);
}

async function listHelpDismissals(ctx: Ctx, user: DbUser) {
  const result = await ctx.env.DB.prepare('SELECT help_key FROM help_dismissals WHERE user_id = ?')
    .bind(user.id)
    .all<{ help_key: string }>();
  return json({ ok: true, dismissed: result.results.map((row) => row.help_key) });
}

async function dismissHelp(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const helpKey = requireString(input.helpKey, 'Help key');
  await ctx.env.DB.prepare(
    `INSERT INTO help_dismissals (id, user_id, help_key)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, help_key) DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP`,
  )
    .bind(id(), user.id, helpKey)
    .run();
  return listHelpDismissals(ctx, user);
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
    ctx.env.DB.prepare('DELETE FROM user_maintenance_snapshots WHERE user_id = ?').bind(user.id),
    ctx.env.DB.prepare('DELETE FROM daily_goal_completions WHERE user_id = ?').bind(user.id),
    ctx.env.DB.prepare('DELETE FROM daily_goal_definitions WHERE user_id = ?').bind(user.id),
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
  const dailyGoals = await dailyGoalsForDate(ctx, user, eatenDate);
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
    dailyGoals,
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
  const maintenance = weight && entryDate === dateInUserTimezone(user) ? await recalculateMaintenanceSnapshot(ctx, user, weight) : null;
  return json({ ok: true, weight, maintenance });
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
     FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ? GROUP BY eaten_date ORDER BY eaten_date DESC`,
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
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all<DbWeight>();
  if (weights.results.length < 2) {
    const selectedTotal = await ctx.env.DB.prepare('SELECT COALESCE(SUM(calories), 0) AS totalCalories FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ?')
      .bind(user.id, start, end)
      .first<{ totalCalories: number }>();
    return json({
      ok: true,
      canCalculate: false,
      start,
      end,
      totalCalories: Number(selectedTotal?.totalCalories ?? 0),
      weightEntryCount: weights.results.length,
      message: 'At least two weight entries are required in the selected range.',
    });
  }
  const startWeight = mapWeightPoint(weights.results[0]);
  const endWeight = mapWeightPoint(weights.results[weights.results.length - 1]);
  const loggedDays = await loggedCaloriesBetweenWeights(ctx, user, startWeight.date, endWeight.date);
  if (!loggedDays.length) {
    return json({
      ok: true,
      canCalculate: false,
      start: startWeight.date,
      end: endWeight.date,
      requestedStart: start,
      requestedEnd: end,
      startWeight,
      endWeight,
      message: 'At least one logged food day is required between weight entries.',
    });
  }
  return json({
    ok: true,
    canCalculate: true,
    requestedStart: start,
    requestedEnd: end,
    startWeight,
    endWeight,
    ...estimateMaintenanceFromLoggedDays({ startWeight, endWeight, loggedCaloriesByDay: loggedDays }),
  });
}

async function reportTwoWeekWeightLoss(ctx: Ctx, user: DbUser) {
  const window = maintenanceWindow(user);
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, window.start, window.end)
    .all<DbWeight>();
  const todayWeight = weights.results.find((weight) => weight.entry_date === window.end);
  if (!todayWeight) {
    return json({
      ok: true,
      canCalculate: false,
      start: window.start,
      end: window.end,
      message: "Add today's weight to calculate weight loss over the last two weeks.",
    });
  }

  const startWeight = weights.results.find((weight) => weight.entry_date < window.end);
  if (!startWeight) {
    return json({
      ok: true,
      canCalculate: false,
      start: window.start,
      end: window.end,
      endWeight: mapWeightPoint(todayWeight),
      message: 'Add an earlier weight entry from the last two weeks to calculate weight loss.',
    });
  }

  const start = mapWeightPoint(startWeight);
  const end = mapWeightPoint(todayWeight);
  return json({
    ok: true,
    canCalculate: true,
    windowStart: window.start,
    windowEnd: window.end,
    startWeight: start,
    endWeight: end,
    days: calendarDaysInclusive(start.date, end.date) - 1,
    weightLossLb: Math.round((start.valueLb - end.valueLb + Number.EPSILON) * 100) / 100,
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

async function loggedCaloriesBetweenWeights(ctx: Ctx, user: DbUser, startDate: string, endDate: string) {
  const result = await ctx.env.DB.prepare(
    `SELECT eaten_date AS date, SUM(calories) AS calories
     FROM diary_items
     WHERE user_id = ? AND eaten_date >= ? AND eaten_date < ?
     GROUP BY eaten_date ORDER BY eaten_date`,
  )
    .bind(user.id, startDate, endDate)
    .all<{ date: string; calories: number }>();
  return result.results.map((row) => ({ date: row.date, calories: Number(row.calories) }));
}

function mapMaintenanceSnapshot(snapshot: DbMaintenanceSnapshot) {
  return {
    calculatedDate: snapshot.calculated_date,
    maintenanceCalories: Math.round(Number(snapshot.maintenance_calories)),
    estimatedMaintenanceCalories: Math.round(Number(snapshot.maintenance_calories)),
    source: snapshot.source,
    start: snapshot.start_date,
    end: snapshot.end_date,
    calorieStart: snapshot.calorie_start_date,
    calorieEnd: snapshot.calorie_end_date,
    days: snapshot.period_days,
    loggedDayCount: snapshot.logged_day_count,
    averageLoggedCalories: snapshot.average_logged_calories,
    estimatedPeriodCalories: snapshot.estimated_period_calories,
    weightChangeLb: snapshot.weight_change_lb,
    dailyWeightAdjustment: snapshot.daily_weight_adjustment,
  };
}

async function latestMaintenance(ctx: Ctx, user: DbUser) {
  const window = maintenanceWindow(user);
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, window.start, window.end)
    .all<DbWeight>();
  const todayWeight = weights.results.find((weight) => weight.entry_date === window.end);
  if (todayWeight) {
    const priorWeight = weights.results.find((weight) => weight.entry_date < window.end);
    if (priorWeight) {
      const loggedDays = await loggedCaloriesBetweenWeights(ctx, user, window.start, window.end);
      if (loggedDays.length >= 7) {
        const estimate = estimateMaintenanceFromRecentWindow({
          windowStart: window.start,
          windowEnd: window.end,
          startWeight: mapWeightPoint(priorWeight),
          endWeight: mapWeightPoint(todayWeight),
          loggedCaloriesByDay: loggedDays,
        });
        return {
          ...estimate,
          source: 'weigh-in',
          calculatedDate: window.end,
          maintenanceCalories: estimate.estimatedMaintenanceCalories,
        };
      }
    }

    const weight = mapWeightPoint(todayWeight);
    return {
      calculatedDate: weight.date,
      maintenanceCalories: Math.round(weight.valueLb * 10),
      estimatedMaintenanceCalories: Math.round(weight.valueLb * 10),
      source: 'body-weight-fallback',
      latestWeight: weight,
      message: 'Starting estimate: add an earlier weight and at least 7 logged food days in the last two weeks to estimate maintenance calories.',
    };
  }

  const allWeights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY entry_date')
    .bind(user.id)
    .all<DbWeight>();
  const latestWeight = allWeights.results.length > 0 ? allWeights.results[allWeights.results.length - 1] : null;
  if (!latestWeight) return null;

  const weight = mapWeightPoint(latestWeight);
  return {
    calculatedDate: weight.date,
    maintenanceCalories: Math.round(weight.valueLb * 10),
    estimatedMaintenanceCalories: Math.round(weight.valueLb * 10),
    source: 'body-weight-fallback',
    latestWeight: weight,
    message: "Starting estimate: add today's weight to calculate maintenance from the last two weeks.",
  };
}

async function recalculateMaintenanceSnapshot(ctx: Ctx, user: DbUser, endWeight: DbWeight) {
  const window = maintenanceWindow(user);
  const priorWeight = await ctx.env.DB.prepare(
    'SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? AND entry_date < ? ORDER BY entry_date ASC LIMIT 1',
  )
    .bind(user.id, window.start, window.end, endWeight.entry_date)
    .first<DbWeight>();
  if (priorWeight) {
    const startWeight = mapWeightPoint(priorWeight);
    const finishWeight = mapWeightPoint(endWeight);
    const loggedDays = await loggedCaloriesBetweenWeights(ctx, user, window.start, window.end);
    if (loggedDays.length >= 7) {
      const estimate = estimateMaintenanceFromRecentWindow({
        windowStart: window.start,
        windowEnd: window.end,
        startWeight,
        endWeight: finishWeight,
        loggedCaloriesByDay: loggedDays,
      });
      const snapshotId = id();
      await ctx.env.DB.prepare(
        `INSERT INTO user_maintenance_snapshots
         (id, user_id, calculated_date, maintenance_calories, source, start_date, end_date, calorie_start_date, calorie_end_date, period_days, logged_day_count, average_logged_calories, estimated_period_calories, weight_change_lb, daily_weight_adjustment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          snapshotId,
          user.id,
          finishWeight.date,
          estimate.estimatedMaintenanceCalories,
          'weigh-in',
          estimate.start,
          estimate.end,
          estimate.calorieStart,
          estimate.calorieEnd,
          estimate.days,
          estimate.loggedDayCount,
          estimate.averageLoggedCalories,
          estimate.estimatedPeriodCalories,
          estimate.weightChangeLb,
          estimate.dailyWeightAdjustment,
        )
        .run();
      const snapshot = await ctx.env.DB.prepare('SELECT * FROM user_maintenance_snapshots WHERE id = ?').bind(snapshotId).first<DbMaintenanceSnapshot>();
      return snapshot ? mapMaintenanceSnapshot(snapshot) : null;
    }
  }
  return null;
}

async function ensureDailyGoalDefaults(ctx: Ctx, user: DbUser) {
  const existing = await ctx.env.DB.prepare('SELECT goal_type FROM daily_goal_definitions WHERE user_id = ?')
    .bind(user.id)
    .all<{ goal_type: string }>();
  const types = new Set(existing.results.map((row) => row.goal_type));
  const needsDiaryGoalUpgrade = !types.has('supplements');
  const defaults = [
    { type: 'move', label: 'Movement', minutes: 10, active: 1, sort: 0 },
    { type: 'exercise', label: 'Workout', minutes: 30, active: 1, sort: 1 },
    { type: 'supplements', label: 'Supplements', minutes: null, active: 1, sort: 2 },
    { type: 'sunlight', label: 'Get morning sunlight', minutes: null, active: 0, sort: 3 },
    { type: 'custom', label: 'Enter your own goal', minutes: null, active: 0, sort: 4 },
  ];
  for (const goal of defaults) {
    if (types.has(goal.type)) continue;
    await ctx.env.DB.prepare(
      'INSERT INTO daily_goal_definitions (id, user_id, label, goal_type, minutes, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id(), user.id, goal.label, goal.type, goal.minutes, goal.active, goal.sort)
      .run();
  }
  if (needsDiaryGoalUpgrade) {
    await ctx.env.DB.prepare(
      "UPDATE daily_goal_definitions SET active = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND goal_type IN ('move', 'exercise', 'supplements')",
    )
      .bind(user.id)
      .run();
  }
}

function mapDailyGoal(goal: DbDailyGoal, completed = false) {
  return {
    id: goal.id,
    label: goal.label,
    goalType: goal.goal_type,
    minutes: goal.minutes,
    active: Boolean(goal.active),
    sortOrder: goal.sort_order,
    completed,
  };
}

async function dailyGoalRows(ctx: Ctx, user: DbUser, activeOnly = false) {
  await ensureDailyGoalDefaults(ctx, user);
  const query = activeOnly
    ? 'SELECT * FROM daily_goal_definitions WHERE user_id = ? AND active = 1 ORDER BY sort_order, created_at'
    : 'SELECT * FROM daily_goal_definitions WHERE user_id = ? ORDER BY sort_order, created_at';
  const goals = await ctx.env.DB.prepare(query).bind(user.id).all<DbDailyGoal>();
  return goals.results;
}

async function listDailyGoals(ctx: Ctx, user: DbUser) {
  const goals = await dailyGoalRows(ctx, user);
  return json({ ok: true, goals: goals.map((goal) => mapDailyGoal(goal)) });
}

async function updateDailyGoals(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const goals = Array.isArray(input.goals) ? input.goals : [];
  await ensureDailyGoalDefaults(ctx, user);
  for (const rawGoal of goals) {
    const goal = rawGoal as Record<string, unknown>;
    const goalId = typeof goal.id === 'string' ? goal.id.trim() : '';
    const label = typeof goal.label === 'string' ? goal.label.trim() : '';
    const active = goal.active ? 1 : 0;
    const minutes = goal.minutes === null || goal.minutes === undefined || goal.minutes === '' ? null : positiveNumber(goal.minutes, 'Minutes');

    if (goalId) {
      const existing = await ctx.env.DB.prepare('SELECT * FROM daily_goal_definitions WHERE id = ? AND user_id = ?')
        .bind(goalId, user.id)
        .first<DbDailyGoal>();
      if (!existing) continue;
      const updatedLabel = label || existing.label;
      await ctx.env.DB.prepare(
        'UPDATE daily_goal_definitions SET label = ?, minutes = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      )
        .bind(updatedLabel, minutes, active, goalId, user.id)
        .run();
    } else if (label) {
      const maxSort = await ctx.env.DB.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM daily_goal_definitions WHERE user_id = ?',
      )
        .bind(user.id)
        .first<{ next: number }>();
      await ctx.env.DB.prepare(
        'INSERT INTO daily_goal_definitions (id, user_id, label, goal_type, minutes, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(id(), user.id, label, 'custom', null, 1, maxSort?.next ?? 99)
        .run();
    }
  }
  return listDailyGoals(ctx, user);
}

async function dailyGoalsForDate(ctx: Ctx, user: DbUser, entryDate: string) {
  const goals = await dailyGoalRows(ctx, user, true);
  if (!goals.length) return [];
  const completions = await ctx.env.DB.prepare(
    'SELECT goal_id, completed FROM daily_goal_completions WHERE user_id = ? AND entry_date = ?',
  )
    .bind(user.id, entryDate)
    .all<{ goal_id: string; completed: number }>();
  const completionMap = new Map(completions.results.map((row) => [row.goal_id, Boolean(row.completed)]));
  return goals.map((goal) => mapDailyGoal(goal, completionMap.get(goal.id) ?? false));
}

async function setDailyGoalCompletion(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const goalId = requireString(input.goalId, 'Daily goal');
  const entryDate = requireDate(input.entryDate, 'Date');
  const completed = input.completed ? 1 : 0;
  const goal = await ctx.env.DB.prepare('SELECT * FROM daily_goal_definitions WHERE id = ? AND user_id = ? AND active = 1')
    .bind(goalId, user.id)
    .first<DbDailyGoal>();
  if (!goal) throw new ApiError('NOT_FOUND', 'Daily goal not found.', 404);
  await ctx.env.DB.prepare(
    `INSERT INTO daily_goal_completions (id, user_id, goal_id, entry_date, completed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, goal_id, entry_date) DO UPDATE SET completed = excluded.completed, updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(id(), user.id, goalId, entryDate, completed)
    .run();
  return json({ ok: true, goal: mapDailyGoal(goal, Boolean(completed)) });
}

async function createGoalPlan(ctx: Ctx, user: DbUser) {
  const input = await body(ctx);
  const goalWeightValue = positiveNumber(input.goalWeightValue, 'Goal weight');
  const goalWeightUnit = requireWeightUnit(input.goalWeightUnit ?? 'lb');
  let targetDate: string;
  if (input.goalMode === 'pace') {
    const weeklyPaceLb = positiveNumber(input.weeklyPaceLb, 'Weekly pace');
    const latestWeight = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY entry_date DESC LIMIT 1')
      .bind(user.id)
      .first<DbWeight>();
    if (!latestWeight) throw new ApiError('VALIDATION_ERROR', 'Add a current weight before setting a pace goal.');
    const currentWeightLb = toLb(latestWeight.weight_value, latestWeight.weight_unit);
    const goalWeightLb = toLb(goalWeightValue, goalWeightUnit);
    const weeks = Math.abs(goalWeightLb - currentWeightLb) / weeklyPaceLb;
    targetDate = addDays(dateInUserTimezone(user), Math.max(1, Math.ceil(weeks * 7)));
  } else {
    targetDate = requireDate(input.targetDate, 'Target date');
  }
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
  const maintenance = await latestMaintenance(ctx, user);
  const plan = await ctx.env.DB.prepare('SELECT * FROM goal_plans WHERE user_id = ? AND is_active = 1 AND (archived_at IS NULL OR archived_at = \'\') ORDER BY created_at DESC LIMIT 1')
    .bind(user.id)
    .first<{ id: string; goal_weight_value: number; goal_weight_unit: 'lb' | 'kg'; target_date: string }>();
  if (!plan) return json({ ok: true, plan: null, maintenance });
  const latestWeight = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY entry_date DESC LIMIT 1').bind(user.id).first<DbWeight>();
  if (!latestWeight) return json({ ok: true, plan, maintenance, calculation: null, message: 'Add a current weight to calculate target calories.' });
  if (!maintenance) return json({ ok: true, plan, maintenance, calculation: null, message: 'Add a current weight to estimate maintenance calories.' });
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
  const calculation = calculateGoalTarget({
    currentWeightLb: latestWeightLb,
    goalWeightLb,
    currentDate: dateInUserTimezone(user),
    targetDate: plan.target_date,
    maintenanceCalories: maintenance.maintenanceCalories,
  });
  return json({ ok: true, plan, goalPace, maintenance, calculation });
}

async function maintenanceForRange(ctx: Ctx, user: DbUser, start: string, end: string) {
  const weights = await ctx.env.DB.prepare('SELECT * FROM weight_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date')
    .bind(user.id, start, end)
    .all<DbWeight>();
  if (weights.results.length < 2) return null;
  const startWeight = mapWeightPoint(weights.results[0]);
  const endWeight = mapWeightPoint(weights.results[weights.results.length - 1]);
  const total = await ctx.env.DB.prepare('SELECT COALESCE(SUM(calories), 0) AS totalCalories FROM diary_items WHERE user_id = ? AND eaten_date BETWEEN ? AND ?')
    .bind(user.id, startWeight.date, endWeight.date)
    .first<{ totalCalories: number }>();
  return {
    start: startWeight.date,
    end: endWeight.date,
    requestedStart: start,
    requestedEnd: end,
    startWeight,
    endWeight,
    ...estimateMaintenanceCalories({ start: startWeight.date, end: endWeight.date, totalCalories: Number(total?.totalCalories ?? 0), startWeight, endWeight }),
  };
}
