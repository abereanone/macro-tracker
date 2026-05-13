# Macro Tracker

A Cloudflare Pages + React + TypeScript app for tracking foods, saved meals, daily macros, body weight, protein goals, estimated maintenance calories, and goal-weight calorie targets.

Version 1 intentionally uses simple email-as-user login. It is not secure authentication, but all owned data is still associated with `user_id` and API access rules enforce ownership plus public/private visibility.

## Stack

- React, TypeScript, Vite
- Cloudflare Pages Functions
- Cloudflare D1
- Wrangler for local development and deployment
- Vitest for calculation tests

## Setup

```powershell
npm install
copy .dev.vars.example .dev.vars
wrangler d1 create macro_tracker
```

Update `wrangler.toml` with the D1 `database_id` returned by Cloudflare.

Apply the local migration:

```powershell
npm run db:migrate
```

Run the app with the Pages Functions backend:

```powershell
npm run build
npm run preview
```

For frontend-only iteration:

```powershell
npm run dev
```

The API requires Pages Functions and D1, so use `npm run preview` for end-to-end local testing.

## Scripts

- `npm run dev` starts Vite.
- `npm run build` type-checks and builds the frontend.
- `npm run preview` serves the built app through Wrangler Pages with local D1.
- `npm run db:migrate` applies D1 migrations locally.
- `npm test` runs unit tests.

## Main API Areas

- `POST /api/auth/simple-login`
- `GET /api/me`
- `PUT /api/me/settings`
- `GET/POST/PUT/DELETE /api/foods`
- `GET/POST/PUT/DELETE /api/saved-meals`
- `POST /api/saved-meals/:id/add-to-diary`
- `GET /api/days/:date`
- `POST/PUT/DELETE /api/diary-items`
- `GET/POST/PUT/DELETE /api/weight`
- `GET /api/reports/summary`
- `GET /api/reports/maintenance`
- `POST /api/goal-plans`
- `GET /api/goal-plans/active`

## Security Notes

This first iteration stores the normalized email in a simple cookie named `macro_user_email`. The auth boundary is centralized in `functions/api/[[path]].ts` through `requireUser`, so future magic-link sessions can replace that lookup without rewriting handlers.

All SQL statements use D1 prepared statements with bound parameters.
