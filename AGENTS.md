# Agent Instructions

- Do not run `npm run build`, `npm run build:web`, or other build commands unless the user explicitly asks for a build.
- For code changes, prefer targeted edits and lightweight checks that do not build the project.
- When a change requires a rebuild before the user can see it in `npm run preview`, explicitly say so in the final response and include the command to run.
- Frontend changes under `src/`, static assets under `public/`, Vite config changes, and dependency changes require `npm run build` before `npm run preview` reflects them.
- API-only changes under `functions/` generally require restarting `npm run preview`, not rebuilding, unless shared frontend-bundled code also changed.
