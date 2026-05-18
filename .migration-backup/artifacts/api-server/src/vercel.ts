import app from "./app";
import { runMigrations } from "@workspace/db";
import { logger } from "./lib/logger";

export { app };

export const ready = (async () => {
  try {
    await runMigrations();
    logger.info("Database migrations applied");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      logger.info("Schema already up to date, skipping migrations");
    } else {
      logger.error({ err }, "Failed to run database migrations");
    }
  }
})();
