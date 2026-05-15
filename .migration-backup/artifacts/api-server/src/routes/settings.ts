import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminAuth, requireSuperAdmin, hashPassword, verifyPassword } from "../lib/auth.js";
import { z } from "zod";

const router = Router();

const ALLOWED_KEYS = ["whatsappNumber"] as const;
type SettingKey = typeof ALLOWED_KEYS[number];

router.get("/settings/public", async (_req: Request, res: Response) => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({
    whatsappNumber: map["whatsappNumber"] ?? null,
  });
});

const UpdateSettingsBody = z.object({
  whatsappNumber: z.string().nullable().optional(),
});

router.put("/admin/settings", requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: { key: SettingKey; value: string | null }[] = [];
  if (parsed.data.whatsappNumber !== undefined) {
    updates.push({ key: "whatsappNumber", value: parsed.data.whatsappNumber });
  }

  for (const { key, value } of updates) {
    if (value === null || value === "") {
      await db.delete(settingsTable).where(eq(settingsTable.key, key));
    } else {
      await db
        .insert(settingsTable)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value, updatedAt: new Date() },
        });
    }
  }

  res.json({ success: true });
});

const ChangePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(4),
});

router.post("/admin/change-password", requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  if (process.env.ADMIN_PASSWORD) {
    res.status(400).json({
      error: "La contraseña está fijada por variable de entorno ADMIN_PASSWORD. Elimínala primero para poder cambiarla desde aquí.",
    });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [stored] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "adminPasswordHash"))
    .limit(1);
  const currentHash = stored?.value ?? null;

  if (!currentHash) {
    res.status(503).json({ error: "Admin password not configured." });
    return;
  }

  if (!verifyPassword(currentPassword, currentHash)) {
    res.status(401).json({ error: "La contraseña actual es incorrecta" });
    return;
  }

  const newHash = hashPassword(newPassword);
  await db
    .insert(settingsTable)
    .values({ key: "adminPasswordHash", value: newHash, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: newHash, updatedAt: new Date() },
    });

  res.json({ success: true });
});

export default router;
