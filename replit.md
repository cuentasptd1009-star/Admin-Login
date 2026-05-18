# Super TV

A streaming platform (IPTV) app where users log in with an access code to watch live channels, movies, and series.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/super-tv run dev` — run the frontend (port 19603)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter (routing) + TailwindCSS v4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Video: HLS.js, FLV.js, Dash.js

## Where things live

- `artifacts/super-tv/` — React + Vite frontend
- `artifacts/api-server/` — Express API server
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `lib/db/src/schema/` — Drizzle ORM schema
- `lib/db/migrations/` — SQL migrations
- `attached_assets/` — image assets referenced by the frontend

## Architecture decisions

- Code-based access auth — users log in with an access code, not email/password
- Two admin roles: `admin` (full access) and `subadmin` (limited panel)
- Video streaming via HLS/FLV/Dash depending on stream format
- PWA-enabled with service worker and app manifest
- TV keyboard navigation support built into the UI

## Product

- Login with access code to access the streaming platform
- Home screen with channels, movies, and series organized in rows
- Live TV player with HLS/FLV/Dash stream support
- VOD player for movies and series
- Admin panel to manage channels, codes, users, packages
- Subadmin panel for limited admin operations
- PWA installable on Android and iOS

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`
- Then run `pnpm run typecheck:libs` to rebuild the lib declarations
- The `api-zod` index must only export from `./generated/api` (not `./generated/types`) to avoid duplicate export conflicts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
