import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { mkdir, cp } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");
const functionsDir = path.resolve(workspaceRoot, "netlify/functions");

await mkdir(functionsDir, { recursive: true });

await esbuild({
  entryPoints: [path.resolve(artifactDir, "src/netlify-entry.ts")],
  platform: "node",
  bundle: true,
  format: "cjs",
  outdir: functionsDir,
  entryNames: "api",
  logLevel: "info",
  external: [
    "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt",
    "argon2", "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil",
    "utf-8-validate", "ssh2", "cpu-features", "dtrace-provider", "pg-native",
  ],
  sourcemap: false,
  // Replace import.meta.url with CJS-compatible equivalent so that any
  // transitive lib code that calls fileURLToPath(import.meta.url) works.
  define: {
    "import.meta.url": "__importMetaUrl",
  },
  banner: {
    js: `var __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
  },
});

const migrationsSource = path.resolve(workspaceRoot, "lib/db/migrations");
const migrationsDest = path.resolve(functionsDir, "migrations");
await cp(migrationsSource, migrationsDest, { recursive: true });

console.log("✅ Netlify function built → netlify/functions/api.mjs");
