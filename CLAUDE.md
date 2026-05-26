# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A macro/nutrition tracker: React + TypeScript + Vite frontend, Cloudflare Pages Functions (TypeScript) backend, Cloudflare D1 (SQLite) database. Features: food database, diary logging, saved meals, body weight tracking, estimated maintenance calories, goal weight planner, and daily habit goals.

## Commands

```bash
npm run dev               # Vite dev server only (no API — frontend iteration)
npm run build             # TypeScript check + Vite build + copy-404 script
npm run preview           # Serve built dist/ through Wrangler Pages with local D1 (full stack)
npm test                  # Vitest unit tests (calculations only)
npm run db:migrate        # Apply D1 migrations locally
npm run db:clone:remote   # Clone remote D1 into local for testing against real data
```

**Two dev workflows:**
- `npm run dev` — fast Vite HMR for frontend-only changes; API calls will fail
- `npm run build && npm run preview` — full end-to-end with local D1 and Pages Functions

Frontend changes under `src/`, `public/`, Vite config, or dependencies require `npm run build` before `npm run preview` reflects them. API-only changes under `functions/` only need a `preview` restart.

**Do not run `npm run build` unless the user explicitly asks for it.** When a change requires a rebuild, say so and include the command.

## Architecture

**Frontend** (`src/`): Single React SPA (`src/main.tsx`). No router library — all state is managed in one tree. Compiled to `dist/` by Vite.

**Backend** (`functions/api/[[path]].ts`): Single Cloudflare Pages Function handling all API routes via path/method dispatch at the top of `onRequest`. No framework — typed with `@cloudflare/workers-types`. All D1 access uses prepared statements.

**Shared code** (`src/shared/`): `calculations.ts`, `types.ts`, and `validation.ts` are imported by **both** the frontend and the API worker. Changes here affect both sides and may require a rebuild.

**Database**: Cloudflare D1 bound as `ctx.env.DB`. Migrations in `migrations/`. Soft deletes via `archived_at`. Timestamps as ISO strings.

## Key Data Model Notes

- `diary_items` stores **pre-computed nutrients** (protein_g, fat_g, etc.) at log time by calling `calculateLoggedNutrition`. Nutrients are not recalculated from the food record on read — editing a food does not retroactively change diary entries.
- Foods and saved meals have `visibility`: `'private'` (owner only) or `'public'` (readable by all users). Ownership is checked separately from visibility for writes.
- `serving_grams` on a food is required for unit conversion when the serving unit is not a recognized mass unit (g, oz, lb, kg). The API enforces this via `requireServingGrams`.
- Maintenance calorie estimation requires at least 2 weight entries and at least 7 logged food days between them. Falls back to `weight_lb × 10` until enough data exists.
- `calorie_goal_type` is either `'manual'` (user-set value) or `'goal-based'` (derived from the active goal plan's `calculateGoalTarget` result).
- `daily_goal_definitions` are seeded with defaults on first access via `ensureDailyGoalDefaults`.

## Auth

Email → 6-digit code (sent via Resend) → 30-day session cookie (`macro_session`). On code verification, a user row is created if none exists. Session tokens are stored hashed (SHA-256). Rate limit: 1 code per minute per email.

## Environment Variables

In `.dev.vars` (see `.dev.vars.example`):
- `RESEND_API_KEY` — for sending login emails

## Tests

`tests/calculations.test.ts` covers `src/shared/calculations.ts`. Run with `npm test`. No API or component tests.
