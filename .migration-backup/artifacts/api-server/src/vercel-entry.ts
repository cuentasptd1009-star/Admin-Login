import { runMigrations } from "@workspace/db";
import app from "./app";

let migrationsDone = false;

export const ready = (async () => {
  if (!migrationsDone) {
    await runMigrations();
    migrationsDone = true;
  }
})();

export { app };
