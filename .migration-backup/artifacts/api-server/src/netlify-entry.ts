import serverlessHttp from "serverless-http";
  import express, { type Request, type Response, type NextFunction } from "express";
  import cors from "cors";
  import compression from "compression";
  import path from "path";
  import router from "./routes";

  let migrationsDone = false;
  async function ensureMigrations() {
    if (migrationsDone) return;
    try {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      const { db } = await import("@workspace/db");
      const migrationsFolder = path.join(__dirname, "migrations");
      await migrate(db, { migrationsFolder });
      migrationsDone = true;
      console.log("[netlify] DB migrations applied");
    } catch (err) {
      console.error("[netlify] Migration error (non-fatal):", err);
      migrationsDone = true;
    }
  }

  const netlifyApp = express();
  netlifyApp.use(compression({ threshold: 1024 }));
  netlifyApp.use(cors());
  netlifyApp.use(express.json({ limit: "2mb" }));
  netlifyApp.use(express.urlencoded({ extended: false, limit: "2mb" }));

  netlifyApp.get("/api/debug", (_req, res) => {
    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasPgHost: !!process.env.PGHOST,
        dirname: __dirname,
      },
    });
  });

  netlifyApp.get("/api/db-test", async (_req, res) => {
    try {
      const { db } = await import("@workspace/db");
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`SELECT 1 AS ok`);
      res.json({ ok: true, result: result.rows });
    } catch (err: any) {
      const cause = err?.cause;
      res.status(500).json({
        ok: false,
        error: String(err?.message || err),
        code: err?.code || cause?.code,
        detail: err?.detail || cause?.detail,
        causeMessage: String(cause?.message || ""),
        causeCode: cause?.code,
        stack: String(err?.stack || "").slice(0, 800),
      });
    }
  });

  netlifyApp.use("/api", router);

  netlifyApp.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[netlify] Unhandled error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });

  const wrappedHandler = serverlessHttp(netlifyApp);

  export const handler = async (event: object, context: object) => {
    await ensureMigrations();
    return wrappedHandler(event, context);
  };
  