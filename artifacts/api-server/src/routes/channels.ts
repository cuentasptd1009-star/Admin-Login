import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { db } from "@workspace/db";
import { channelsTable, settingsTable } from "@workspace/db";
import { eq, asc, ilike, or, sql, inArray } from "drizzle-orm";
import { URL as NodeURL } from "url";
import { cache, TTL } from "../lib/cache.js";
import { channelTracker } from "../lib/tracker.js";
import {
  CreateChannelBody,
  UpdateChannelBody,
  GetChannelParams,
  UpdateChannelParams,
  DeleteChannelParams,
  ListChannelsQueryParams,
  ImportChannelsBody,
} from "@workspace/api-zod";
import { requireAdminAuth, requireUserAuth, extractToken, getUserSession, getAdminSession } from "../lib/auth.js";
import type { InsertChannel } from "@workspace/db";
import { accessCodesTable } from "@workspace/db";

// ─── HLS segment in-memory cache ─────────────────────────────────────────────
// Each HLS segment is a short video chunk (2-10 s). Caching them means the
// first viewer downloads the segment from upstream; every subsequent viewer
// within the TTL is served instantly from RAM — zero upstream fetch, near-zero
// CPU per segment after the first one.
const MAX_CACHE_BYTES = 80 * 1024 * 1024; // 80 MB ceiling
const SEGMENT_TTL_MS = 20_000;            // 20 s (segments are usually 2-10 s)
const PLAYLIST_TTL_MS = 3_000;            // 3 s for m3u8 playlists

interface CachedSegment { data: Buffer; ct: string; expires: number; size: number }
const segmentCache = new Map<string, CachedSegment>();
let cacheUsedBytes = 0;

function segCacheGet(url: string): CachedSegment | null {
  const entry = segmentCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cacheUsedBytes -= entry.size;
    segmentCache.delete(url);
    return null;
  }
  return entry;
}

function segCacheSet(url: string, data: Buffer, ct: string, isPlaylist: boolean): void {
  const old = segmentCache.get(url);
  if (old) cacheUsedBytes -= old.size;

  // If we are over the ceiling, evict the oldest entries first
  while (cacheUsedBytes + data.byteLength > MAX_CACHE_BYTES && segmentCache.size > 0) {
    const firstKey = segmentCache.keys().next().value;
    if (!firstKey) break;
    const evicted = segmentCache.get(firstKey)!;
    cacheUsedBytes -= evicted.size;
    segmentCache.delete(firstKey);
  }

  const entry: CachedSegment = {
    data,
    ct,
    expires: Date.now() + (isPlaylist ? PLAYLIST_TTL_MS : SEGMENT_TTL_MS),
    size: data.byteLength,
  };
  segmentCache.set(url, entry);
  cacheUsedBytes += data.byteLength;
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,
  /^fc00:/i,
];

function isSafeRelayUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0") return false;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) return false;
  }
  return true;
}

function detectStreamFormat(url: string): string {
  const clean = url.toLowerCase().split("?")[0].split("#")[0];
  if (clean.endsWith(".m3u8") || clean.includes("/hls/")) return "hls";
  if (clean.endsWith(".mpd") || clean.includes("/dash/")) return "dash";
  if (clean.endsWith(".flv")) return "flv";
  return "native";
}

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith("http://") || relative.startsWith("https://")) return relative;
  try {
    const baseUrl = new NodeURL(base);
    if (relative.startsWith("/")) return `${baseUrl.protocol}//${baseUrl.host}${relative}`;
    const dir = base.substring(0, base.lastIndexOf("/") + 1);
    return `${dir}${relative}`;
  } catch {
    return relative;
  }
}

function rewriteM3U8(content: string, baseUrl: string, channelId: number, token: string): string {
  return content.split("\n").map((line) => {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) return line;
    const abs = resolveUrl(baseUrl, t);
    const s = Buffer.from(abs).toString("base64url");
    return `/api/channels/${channelId}/hls-relay?s=${s}&token=${encodeURIComponent(token)}`;
  }).join("\n");
}

async function checkHlsAuth(req: Request, res: Response): Promise<{ ok: boolean; token?: string }> {
  const token = (req.query.token as string) || extractToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return { ok: false }; }
  const userSession = await getUserSession(token);
  const adminSession = await getAdminSession(token);
  if (!userSession && !adminSession) { res.status(401).json({ error: "Unauthorized" }); return { ok: false }; }
  if (userSession) {
    const codeCacheKey = `auth:code:${userSession.codeId}`;
    let code = cache.get<{ isActive: boolean; expiresAt: Date | null } | null>(codeCacheKey);
    if (code === undefined) {
      const [row] = await db.select().from(accessCodesTable).where(eq(accessCodesTable.id, userSession.codeId)).limit(1);
      code = row ?? null;
      cache.set(codeCacheKey, code, 120_000);
    }
    if (!code || !code.isActive) { res.status(401).json({ error: "Code inactive" }); return { ok: false }; }
    if (code.expiresAt != null && code.expiresAt <= new Date()) { res.status(401).json({ error: "Code expired" }); return { ok: false }; }
  }
  return { ok: true, token };
}

const router = Router();

function parseM3U(content: string) {
  const lines = content.split("\n").map((l) => l.trim());
  const channels: { name: string; logo?: string; category?: string; streamUrl: string }[] = [];
  let currentName = "";
  let currentLogo = "";
  let currentCategory = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      currentName = nameMatch ? nameMatch[1].trim() : "Canal";
      currentLogo = logoMatch ? logoMatch[1] : "";
      currentCategory = groupMatch ? groupMatch[1] : "";
    } else if (
      line.startsWith("http://") ||
      line.startsWith("https://") ||
      line.startsWith("rtmp://") ||
      line.startsWith("rtsp://")
    ) {
      if (!currentName) currentName = "Canal";
      channels.push({
        name: currentName,
        logo: currentLogo || undefined,
        category: currentCategory || undefined,
        streamUrl: line,
      });
      currentName = "";
      currentLogo = "";
      currentCategory = "";
    }
  }
  return channels;
}

function detectLinks(content: string) {
  const urlRegex = /(?:https?|rtmp|rtmps|rtsp):\/\/[^\s\r\n"'<>]+/g;
  const matches = content.match(urlRegex) ?? [];
  return matches
    .filter((url) => !url.endsWith(".html") && !url.endsWith(".php"))
    .map((streamUrl, i) => ({ name: `Canal ${i + 1}`, streamUrl }));
}

router.get("/channels", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userSession = await getUserSession(token);
  const adminSession = await getAdminSession(token);
  if (!userSession && !adminSession) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Enforce code expiry for user sessions
  if (userSession) {
    const [code] = await db.select().from(accessCodesTable).where(eq(accessCodesTable.id, userSession.codeId)).limit(1);
    if (!code || !code.isActive) { res.status(401).json({ error: "Code inactive" }); return; }
    if (code.expiresAt != null && code.expiresAt <= new Date()) { res.status(401).json({ error: "Code expired" }); return; }
  }

  const isAdmin = !!adminSession;

  const parsed = ListChannelsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const cacheKey = `channels:list:${isAdmin ? "admin" : "user"}:${params.category ?? ""}:${params.search ?? ""}`;
  const cached = cache.get<object[]>(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    res.json(cached);
    return;
  }

  let query = db.select().from(channelsTable).$dynamic();
  
  if (params.category) {
    query = query.where(eq(channelsTable.category, params.category));
  } else if (params.search) {
    query = query.where(ilike(channelsTable.name, `%${params.search}%`));
  }

  const channels = await query.orderBy(asc(channelsTable.order));
  const result = channels.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    streamUrl: isAdmin ? c.streamUrl : null,
    streamFormat: detectStreamFormat(c.streamUrl),
  }));

  cache.set(cacheKey, result, TTL.MEDIUM);
  res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  res.json(result);
});

router.get("/channels/categories", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userSession = await getUserSession(token);
  const adminSession = await getAdminSession(token);
  if (!userSession && !adminSession) { res.status(401).json({ error: "Unauthorized" }); return; }

  const cacheKey = "channels:categories";
  const cached = cache.get<string[]>(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    res.json(cached);
    return;
  }

  const rows = await db
    .selectDistinct({ category: channelsTable.category })
    .from(channelsTable)
    .orderBy(asc(channelsTable.category));
  const allCats = rows.map((r) => r.category).filter(Boolean) as string[];

  const [orderSetting] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "channelCategoryOrder"))
    .limit(1);

  let result = allCats;
  if (orderSetting?.value) {
    try {
      const savedOrder: string[] = JSON.parse(orderSetting.value);
      const savedSet = new Set(savedOrder);
      const ordered = savedOrder.filter((c) => allCats.includes(c));
      const remaining = allCats.filter((c) => !savedSet.has(c));
      result = [...ordered, ...remaining];
    } catch {
      result = allCats;
    }
  }

  cache.set(cacheKey, result, TTL.LONG);
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  res.json(result);
});

router.get("/channels/category-order", requireAdminAuth, async (_req: Request, res: Response) => {
  const [orderSetting] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "channelCategoryOrder"))
    .limit(1);

  if (!orderSetting?.value) {
    res.json([]);
    return;
  }
  try {
    res.json(JSON.parse(orderSetting.value));
  } catch {
    res.json([]);
  }
});

router.post("/channels/category-order", requireAdminAuth, async (req: Request, res: Response) => {
  const { order } = req.body as { order?: unknown };
  if (!Array.isArray(order) || !order.every((o) => typeof o === "string")) {
    res.status(400).json({ error: "order must be an array of strings" });
    return;
  }
  await db
    .insert(settingsTable)
    .values({ key: "channelCategoryOrder", value: JSON.stringify(order), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(order), updatedAt: new Date() },
    });
  cache.invalidatePrefix("channels:");
  res.json({ success: true });
});

router.post("/channels/import", requireAdminAuth, async (req: Request, res: Response) => {
  const parsed = ImportChannelsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { content, format } = parsed.data;
  let toImport: { name: string; logo?: string; category?: string; streamUrl: string }[] = [];

  if (format === "m3u" || (format === "auto" && content.includes("#EXTM3U"))) {
    toImport = parseM3U(content);
  } else {
    toImport = detectLinks(content);
  }

  let imported = 0;
  let failed = 0;
  const createdChannels = [];

  const maxOrder = await db
    .select({ max: sql<number>`coalesce(max(${channelsTable.order}), 0)` })
    .from(channelsTable);
  let orderStart = (maxOrder[0]?.max ?? 0) + 1;

  for (const ch of toImport) {
    try {
      const [created] = await db
        .insert(channelsTable)
        .values({ ...ch, order: orderStart++ })
        .returning();
      createdChannels.push({ ...created, createdAt: created.createdAt.toISOString() });
      imported++;
    } catch {
      failed++;
    }
  }

  cache.invalidatePrefix("channels:");
  res.json({ imported, failed, channels: createdChannels });
});

router.post("/channels/reorder", requireAdminAuth, async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids must be an array" });
    return;
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(channelsTable).set({ order: i + 1 }).where(eq(channelsTable.id, ids[i]));
    }
  });
  cache.invalidatePrefix("channels:");
  res.json({ success: true });
});

router.get("/channels/:id/hls-proxy", async (req: Request, res: Response) => {
  const auth = await checkHlsAuth(req, res);
  if (!auth.ok) return;
  const token = auth.token!;

  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, parsed.data.id));
  if (!channel) { res.status(404).json({ error: "Not found" }); return; }

  channelTracker.record(channel.id, channel.name);

  // Check playlist cache first (avoids upstream fetch if recently fetched)
  const cached = segCacheGet(channel.streamUrl);
  if (cached) {
    res.setHeader("Content-Type", cached.ct);
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Cache", "HIT");
    // Rewrite with fresh token (token can change per request)
    const rewritten = rewriteM3U8(cached.data.toString("utf8"), channel.streamUrl, channel.id, token);
    res.send(rewritten);
    return;
  }

  try {
    const response = await fetch(channel.streamUrl, {
      headers: { "User-Agent": "Mozilla/5.0 SuperTV/1.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) { res.status(502).send("Stream unavailable"); return; }

    const ct = response.headers.get("content-type") || "";
    const isPlaylist = ct.includes("mpegurl") || channel.streamUrl.toLowerCase().includes(".m3u8");

    if (isPlaylist) {
      const text = await response.text();
      // Cache the raw playlist text so the next request is served without an upstream fetch
      segCacheSet(channel.streamUrl, Buffer.from(text, "utf8"), "application/vnd.apple.mpegurl", true);
      const rewritten = rewriteM3U8(text, channel.streamUrl, channel.id, token);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Cache", "MISS");
      res.send(rewritten);
    } else {
      res.setHeader("Content-Type", ct || "application/octet-stream");
      res.setHeader("Access-Control-Allow-Origin", "*");
      const buf = Buffer.from(await response.arrayBuffer());
      res.send(buf);
    }
  } catch {
    res.status(502).send("Stream unavailable");
  }
});

router.get("/channels/:id/hls-relay", async (req: Request, res: Response) => {
  const auth = await checkHlsAuth(req, res);
  if (!auth.ok) return;
  const token = auth.token!;

  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).send("Invalid id"); return; }

  const s = req.query.s as string;
  if (!s) { res.status(400).send("Missing segment"); return; }

  let segUrl: string;
  try {
    segUrl = Buffer.from(s, "base64url").toString("utf8");
  } catch {
    res.status(400).send("Invalid segment token");
    return;
  }

  if (!isSafeRelayUrl(segUrl)) {
    res.status(400).send("Invalid segment URL");
    return;
  }

  const isPlaylistUrl = segUrl.toLowerCase().includes(".m3u8");

  // ── Serve from cache if available (zero upstream fetch, zero CPU) ──────────
  const cached = segCacheGet(segUrl);
  if (cached) {
    res.setHeader("Content-Type", cached.ct);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Cache", "HIT");
    if (isPlaylistUrl) {
      res.setHeader("Cache-Control", "no-cache, no-store");
      const rewritten = rewriteM3U8(cached.data.toString("utf8"), segUrl, parsed.data.id, token);
      res.send(rewritten);
    } else {
      res.setHeader("Content-Length", String(cached.data.byteLength));
      res.send(cached.data);
    }
    return;
  }

  // ── Fetch from upstream and populate cache ────────────────────────────────
  try {
    const response = await fetch(segUrl, {
      headers: { "User-Agent": "Mozilla/5.0 SuperTV/1.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) { res.status(502).send("Segment unavailable"); return; }

    const ct = response.headers.get("content-type") || "";
    const isPlaylist = ct.includes("mpegurl") || isPlaylistUrl;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Cache", "MISS");

    if (isPlaylist) {
      const text = await response.text();
      const buf = Buffer.from(text, "utf8");
      segCacheSet(segUrl, buf, "application/vnd.apple.mpegurl", true);
      const rewritten = rewriteM3U8(text, segUrl, parsed.data.id, token);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.send(rewritten);
    } else {
      // Buffer the segment so we can cache it and serve it in one shot
      const buf = Buffer.from(await response.arrayBuffer());
      segCacheSet(segUrl, buf, ct || "video/MP2T", false);
      res.setHeader("Content-Type", ct || "video/MP2T");
      res.setHeader("Content-Length", String(buf.byteLength));
      res.send(buf);
    }
  } catch {
    res.status(502).send("Segment unavailable");
  }
});

router.get("/channels/:id/stream", async (req: Request, res: Response) => {
  const token = (req.query.token as string) || extractToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userSession = await getUserSession(token);
  const adminSession = await getAdminSession(token);

  if (!userSession && !adminSession) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (userSession) {
    const [code] = await db.select().from(accessCodesTable).where(eq(accessCodesTable.id, userSession.codeId)).limit(1);
    if (!code || !code.isActive) { res.status(401).json({ error: "Code inactive" }); return; }
    if (code.expiresAt != null && code.expiresAt <= new Date()) { res.status(401).json({ error: "Code expired" }); return; }
  }

  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, parsed.data.id));
  if (!channel) { res.status(404).json({ error: "Not found" }); return; }

  res.redirect(302, channel.streamUrl);
});

router.get("/channels/:id", async (req: Request, res: Response) => {
  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(eq(channelsTable.id, parsed.data.id));
  if (!channel) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const token = extractToken(req);
  let isAdmin = false;
  if (token) {
    const adminSession = await getAdminSession(token);
    if (adminSession) isAdmin = true;
  }

  res.json({ ...channel, createdAt: channel.createdAt.toISOString(), streamUrl: isAdmin ? channel.streamUrl : null });
});

router.post("/channels", requireAdminAuth, async (req: Request, res: Response) => {
  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const maxOrder = await db
    .select({ max: sql<number>`coalesce(max(${channelsTable.order}), 0)` })
    .from(channelsTable);
  const order = parsed.data.order ?? (maxOrder[0]?.max ?? 0) + 1;

  const [created] = await db
    .insert(channelsTable)
    .values({ ...parsed.data, order } as InsertChannel)
    .returning();
  cache.invalidatePrefix("channels:");
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.put("/channels/:id", requireAdminAuth, async (req: Request, res: Response) => {
  const params = UpdateChannelParams.safeParse(req.params);
  const body = UpdateChannelBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(channelsTable)
    .set(body.data)
    .where(eq(channelsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  cache.invalidatePrefix("channels:");
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.patch("/channels/:id/category", requireAdminAuth, async (req: Request, res: Response) => {
  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { category } = req.body as { category?: unknown };
  const cat = category === null || category === "" ? null : typeof category === "string" ? category.trim() : null;
  const [updated] = await db
    .update(channelsTable)
    .set({ category: cat ?? undefined })
    .where(eq(channelsTable.id, parsed.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  cache.invalidatePrefix("channels:");
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.patch("/channels/bulk-category", requireAdminAuth, async (req: Request, res: Response) => {
  const { ids, category } = req.body as { ids?: unknown; category?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'number')) {
    res.status(400).json({ error: "ids must be a non-empty array of numbers" });
    return;
  }
  const cat = category === null || category === '' ? null : typeof category === 'string' ? category.trim() : null;
  await db.update(channelsTable)
    .set({ category: cat ?? undefined })
    .where(inArray(channelsTable.id, ids as number[]));
  cache.invalidatePrefix("channels:");
  res.json({ success: true, updated: ids.length });
});

router.delete("/channels/bulk", requireAdminAuth, async (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'number')) {
    res.status(400).json({ error: "ids must be a non-empty array of numbers" });
    return;
  }
  await db.delete(channelsTable).where(inArray(channelsTable.id, ids as number[]));
  cache.invalidatePrefix("channels:");
  res.json({ success: true, deleted: ids.length });
});

router.delete("/channels/:id", requireAdminAuth, async (req: Request, res: Response) => {
  const parsed = DeleteChannelParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(channelsTable).where(eq(channelsTable.id, parsed.data.id));
  cache.invalidatePrefix("channels:");
  res.json({ success: true, message: "Deleted" });
});

router.post("/channels/:id/test-stream", requireAdminAuth, async (req: Request, res: Response) => {
  const parsed = GetChannelParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(eq(channelsTable.id, parsed.data.id));

  if (!channel) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const url = channel.streamUrl;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "SuperTV/1.0",
      },
    }).catch(async () => {
      return fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "SuperTV/1.0",
          Range: "bytes=0-0",
        },
      });
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    const ok = response.status >= 200 && response.status < 400;
    res.json({
      ok,
      status: response.status,
      latencyMs: latency,
      url,
      message: ok
        ? `Enlace activo (${response.status}) - ${latency}ms`
        : `El servidor respondió con error ${response.status}`,
    });
  } catch (err: unknown) {
    const latency = Date.now() - startTime;
    const error = err instanceof Error ? err : null;
    const isTimeout = error?.name === "AbortError";
    res.json({
      ok: false,
      status: 0,
      latencyMs: latency,
      url,
      message: isTimeout
        ? "Tiempo de espera agotado (8s) — el enlace no responde"
        : `No se pudo conectar: ${error?.message ?? "error desconocido"}`,
    });
  }
});

export default router;
