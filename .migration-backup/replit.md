# Super TV

A streaming platform app ("Tu Streaming de Confianza") with access-code-based authentication, live channels, movies, series, admin panels, and TV remote keyboard navigation support.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (note: typecheck:libs step will show collision warnings from the OpenAPI naming scheme; the runtime is unaffected)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/super-tv/`) with wouter routing
- API: Express 5 (`artifacts/api-server/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db/`)
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild for server, Vite for frontend
- Media: HLS.js, FLV.js, Dash.js for streaming playback

## Where things live

- `artifacts/super-tv/src/pages/` — page components (login, home, player, admin, subadmin, movie-detail, series-detail)
- `artifacts/super-tv/src/components/` — UI components (HeroBanner, ContentRow, ContentCard, MiniPlayer, TvKeyboard, etc.)
- `artifacts/super-tv/src/hooks/` — custom hooks (TV keyboard nav, voice search, PWA install)
- `artifacts/api-server/src/routes/` — Express API routes
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/db/src/schema/supertv.ts` — Drizzle database schema
- `lib/db/migrations/` — SQL migration files
- `attached_assets/` — brand images and app assets

## Architecture decisions

- Access-code based auth (no username/password for end users) — codes expire and have device limits
- Admin/Subadmin role hierarchy — admins manage subadmins who distribute codes
- In-memory LRU cache for auth token lookups to reduce DB load
- Service Worker + PWA manifest for installable web app experience
- TV-first keyboard navigation with custom hook for remote control support

## Product

Super TV is a streaming service where users authenticate with access codes. They can browse live channels, movies, and series. Admins manage the content library, access codes, subadmins, and packages. Subadmins sell access codes to end users. Supports HLS/FLV/DASH streaming protocols.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After running `pnpm --filter @workspace/api-spec run codegen`, the `lib/api-zod/src/index.ts` barrel will be regenerated with `export * from "./generated/types"` which causes TS2308 collisions. This is a known issue with the OpenAPI spec using `*Body` component names. The fix is to remove that line after codegen. The runtime (esbuild) is unaffected.
- `vercel.json` is kept for reference but the app runs on Replit via the workflow system, not Vercel.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
