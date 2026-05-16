# Super TV

Una plataforma de streaming IPTV y VOD con panel de administración, soporte para películas, series y canales en vivo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 3001)
- `pnpm --filter @workspace/super-tv run dev` — run the frontend (port 19603)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provided by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 3001)
- Frontend: React 19 + Vite (port 19603, proxied to external port 3000)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Video: hls.js, dash.js, flv.js

## Where things live

- `lib/db/src/schema/schema/supertv.ts` — DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — API contract
- `artifacts/api-server/src/routes/` — all API routes
- `artifacts/super-tv/src/pages/admin.tsx` — full admin panel (3700+ lines)
- `artifacts/api-server/src/routes/smartImport.ts` — unified smart link importer
- `artifacts/api-server/src/routes/terabox.ts` — Terabox-specific importer

## Architecture decisions

- Custom token-based auth (opaque 32-byte hex tokens, stored in DB). No JWT or external auth provider.
- Two auth systems: access codes for users, username+password for admin/subadmins.
- Tokens stored in localStorage; injected into API calls via Authorization header.
- Cloudinary used for image storage (thumbnails, posters); credentials via Replit Secrets.
- Smart import system auto-detects link type (Terabox vs HTTP directory) and folder structure (movies vs series vs multi-series).

## Product

- **Super TV** — streaming platform where users log in with access codes and watch live channels, movies, and series.
- **Admin panel** (`/admin`) — full content management: codes, channels, movies, series, subadmins, packages, avatars, settings.
- **Subadmin panel** (`/subadmin`) — limited panel for resellers to manage codes.
- **Smart Import** — paste any link (Terabox, HTTP directory) → auto-reads folder structure → imports movies/series organized by folders.

## User preferences

- Admin username: `admin@admin`, password set via `ADMIN_PASSWORD` env var.
- All channels and access codes must be preserved when making changes.

## Gotchas

- API server runs on port 3001 (not 5000), proxied through Vite at `/api`.
- Frontend runs on port 19603, exposed externally on port 3000.
- Always run `pnpm install` before starting if node_modules are missing.
- `pnpm --filter db push` runs automatically in `scripts/post-merge.sh` after merges.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
