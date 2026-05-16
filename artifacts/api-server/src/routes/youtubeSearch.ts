import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { moviesTable, seriesTable, seasonsTable, episodesTable } from "@workspace/db";
import { requireAdminAuth } from "../lib/auth.js";
import { cache } from "../lib/cache.js";

const router = Router();

const YT_API = "https://www.googleapis.com/youtube/v3";

// Spanish → English genre/keyword translations (shared with archiveSearch logic)
const GENRE_MAP: Record<string, string> = {
  "acción": "action", "accion": "action",
  "comedia": "comedy", "comedias": "comedy",
  "terror": "horror", "miedo": "horror",
  "drama": "drama", "dramas": "drama",
  "romance": "romance", "romántica": "romance", "romantica": "romance", "amor": "love",
  "aventura": "adventure", "aventuras": "adventure",
  "animación": "animation", "animacion": "animation", "animada": "animation",
  "ciencia ficcion": "science fiction", "scifi": "sci-fi",
  "thriller": "thriller", "suspenso": "thriller",
  "documental": "documentary", "documentales": "documentary",
  "western": "western",
  "fantasía": "fantasy", "fantasia": "fantasy",
  "misterio": "mystery",
  "policial": "crime", "crimen": "crime",
  "musical": "musical",
  "guerra": "war",
  "histórica": "historical", "historica": "historical",
  "infantil": "children", "niños": "children", "familia": "family",
  "clásica": "classic", "clasica": "classic", "clásico": "classic", "clasico": "classic",
  "mexicana": "mexican", "mexicano": "mexican",
  "latina": "latin", "latino": "latin",
  "española": "spanish", "espanol": "spanish",
  "vampiro": "vampire", "zombies": "zombie",
  "mafia": "mafia", "gangster": "gangster",
  "boxeo": "boxing", "deporte": "sports",
  "música": "music", "musica": "music",
  "superhéroe": "superhero", "superheroe": "superhero",
  "biografía": "biography", "biopic": "biography",
  "espionaje": "spy",
  "psicológica": "psychological", "psicologica": "psychological",
};

const FILLER_RE = /\b(peliculas?|películas?|pelis?|de|del|en|las?|los?|un|una|el|la|quiero|ver|buscar|busco|hay|buenas?|mejores?|tipo|genero|género|año|años|anos?|busca|cine|sobre|con|para|que|es|son|muy|más|mas|todo|todos)\b/gi;

function buildYouTubeQuery(raw: string): string {
  let q = raw.trim();
  q = q.replace(/ciencia ficcion/gi, "science fiction");
  for (const [es, en] of Object.entries(GENRE_MAP)) {
    if (!es.includes(" ")) {
      q = q.replace(new RegExp(`\\b${es}\\b`, "gi"), en);
    }
  }
  q = q.replace(FILLER_RE, " ").replace(/\s{2,}/g, " ").trim();
  if (!q || q.length < 2) q = raw.trim();
  // Append "full movie" to bias results toward full films
  if (!q.toLowerCase().includes("full movie") && !q.toLowerCase().includes("pelicula completa")) {
    q = `${q} full movie`;
  }
  return q;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?#]+)/);
  return m ? m[1] : null;
}

function sanitizeText(str: string, maxLen = 500): string {
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}

function parseISODuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const sec = parseInt(m[3] || "0");
  if (h > 0) return `${h}h ${min}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

router.get("/youtube/search", requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "YOUTUBE_API_KEY no configurada. Ve a Secrets del proyecto y agrega tu clave de YouTube Data API v3.",
        needsKey: true,
      });
    }

    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ items: [] });

    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const pageToken = String(req.query.pageToken || "");
    const lang = req.query.lang ? String(req.query.lang).trim() : "";

    const smartQ = buildYouTubeQuery(q);

    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: smartQ,
      safeSearch: "strict",
      videoDuration: "long",
      maxResults: "20",
      key: apiKey,
    });
    if (pageToken) searchParams.set("pageToken", pageToken);
    if (lang) searchParams.set("relevanceLanguage", lang.slice(0, 2));

    const searchRes = await fetch(`${YT_API}/search?${searchParams}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!searchRes.ok) {
      const errBody = await searchRes.json().catch(() => ({}));
      const msg = errBody?.error?.message || `YouTube API error: ${searchRes.status}`;
      return res.status(500).json({ error: msg });
    }
    const searchData = await searchRes.json();
    const searchItems: any[] = searchData.items || [];
    const nextPageToken: string = searchData.nextPageToken || "";

    if (searchItems.length === 0) return res.json({ items: [], nextPageToken });

    // Fetch duration for each video
    const videoIds = searchItems.map((i: any) => i.id?.videoId).filter(Boolean).join(",");
    const detailParams = new URLSearchParams({ part: "contentDetails", id: videoIds, key: apiKey });
    const detailRes = await fetch(`${YT_API}/videos?${detailParams}`, {
      signal: AbortSignal.timeout(10000),
    });
    const detailData = detailRes.ok ? await detailRes.json() : { items: [] };
    const durationMap: Record<string, string> = {};
    for (const v of detailData.items || []) {
      durationMap[v.id] = parseISODuration(v.contentDetails?.duration || "");
    }

    const items = searchItems.map((item: any) => {
      const videoId: string = item.id?.videoId || "";
      const snippet = item.snippet || {};
      const year = snippet.publishedAt ? new Date(snippet.publishedAt).getFullYear() : undefined;
      return {
        videoId,
        title: sanitizeText(snippet.title || "", 300),
        description: sanitizeText(snippet.description || "", 300),
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
        channel: sanitizeText(snippet.channelTitle || "", 100),
        year: year ? String(year) : undefined,
        duration: durationMap[videoId] || "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });

    res.json({ items, nextPageToken });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/youtube/import", requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { videoId, title, description, year, category, thumbnail } = req.body;
    if (!videoId) return res.status(400).json({ error: "videoId requerido" });

    const cleanTitle = sanitizeText(String(title || videoId), 500);
    const cleanDesc = description ? sanitizeText(String(description), 1000) : null;
    const cleanYear = year ? parseInt(String(year)) || null : null;
    const cleanCategory = category ? String(category).slice(0, 200) : null;
    const poster = thumbnail ? String(thumbnail) : `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    const filePath = `https://www.youtube.com/watch?v=${videoId}`;

    const [movie] = await db
      .insert(moviesTable)
      .values({
        title: cleanTitle,
        filePath,
        videoFormat: "youtube",
        description: cleanDesc,
        poster,
        category: cleanCategory,
        year: cleanYear,
      })
      .returning();

    cache.invalidatePrefix("movies:");
    res.json({ movie });
  } catch (e: any) {
    const detail = (e?.cause as any)?.message ?? e?.cause ?? e.message;
    console.error("[youtube/import] DB error:", String(detail));
    res.status(500).json({ error: String(detail) });
  }
});

// ── YouTube Playlist Importer ─────────────────────────────────────────────────

function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Fetch up to maxItems playlist video entries (handles pagination) */
async function fetchPlaylistItems(playlistId: string, apiKey: string, maxItems = 200): Promise<Array<{ videoId: string; title: string; thumbnail: string; position: number }>> {
  const items: Array<{ videoId: string; title: string; thumbnail: string; position: number }> = [];
  let pageToken = "";
  while (items.length < maxItems) {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId,
      maxResults: "50",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await fetch(`${YT_API}/playlistItems?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) break;
    const data = await r.json() as any;
    for (const it of data.items || []) {
      const sn = it.snippet || {};
      const vid = sn.resourceId?.videoId;
      if (!vid || sn.title === "Private video" || sn.title === "Deleted video") continue;
      items.push({
        videoId: vid,
        title: sanitizeText(sn.title || vid, 300),
        thumbnail: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
        position: sn.position ?? items.length,
      });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return items.sort((a, b) => a.position - b.position);
}

// Preview: return playlist info + video list without importing
router.get("/youtube/playlist-preview", requireAdminAuth, async (req: Request, res: Response) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "YOUTUBE_API_KEY no configurada", needsKey: true });

  const url = String(req.query.url || "").trim();
  const playlistId = extractPlaylistId(url);
  if (!playlistId) return res.status(400).json({ error: "URL de playlist inválida. Debe contener ?list=..." });

  try {
    // Fetch playlist metadata
    const metaParams = new URLSearchParams({ part: "snippet", id: playlistId, key: apiKey });
    const metaRes = await fetch(`${YT_API}/playlists?${metaParams}`, { signal: AbortSignal.timeout(10000) });
    if (!metaRes.ok) return res.status(500).json({ error: "Error al obtener información de la playlist" });
    const metaData = await metaRes.json() as any;
    const playlist = metaData.items?.[0];
    if (!playlist) return res.status(404).json({ error: "Playlist no encontrada o es privada" });

    const sn = playlist.snippet || {};
    const items = await fetchPlaylistItems(playlistId, apiKey, 200);

    res.json({
      playlistId,
      title: sanitizeText(sn.title || "", 300),
      description: sanitizeText(sn.description || "", 500),
      thumbnail: sn.thumbnails?.medium?.url || sn.thumbnails?.standard?.url || "",
      channelTitle: sanitizeText(sn.channelTitle || "", 100),
      itemCount: items.length,
      items,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Import: create series + season + all episodes from playlist
router.post("/youtube/import-playlist", requireAdminAuth, async (req: Request, res: Response) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "YOUTUBE_API_KEY no configurada", needsKey: true });

  const { playlistId, title, description, poster, banner, category, genre, year } = req.body;
  if (!playlistId) return res.status(400).json({ error: "playlistId requerido" });
  if (!title) return res.status(400).json({ error: "title requerido" });

  try {
    const items = await fetchPlaylistItems(playlistId, apiKey, 200);
    if (items.length === 0) return res.status(400).json({ error: "La playlist está vacía o es privada" });

    // Create series
    const [series] = await db.insert(seriesTable).values({
      title: sanitizeText(String(title), 500),
      description: description ? sanitizeText(String(description), 1000) : null,
      poster: poster || items[0].thumbnail,
      banner: banner || null,
      category: category ? String(category).slice(0, 200) : null,
      genre: genre ? String(genre).slice(0, 100) : null,
      year: year ? parseInt(String(year)) || null : null,
    }).returning();

    // Create Season 1
    const [season] = await db.insert(seasonsTable).values({
      seriesId: series.id,
      seasonNumber: 1,
      title: "Temporada 1",
    }).returning();

    // Create episodes
    for (let i = 0; i < items.length; i++) {
      const ep = items[i];
      await db.insert(episodesTable).values({
        seriesId: series.id,
        seasonId: season.id,
        episodeNumber: i + 1,
        title: ep.title,
        filePath: `https://www.youtube.com/watch?v=${ep.videoId}`,
        videoFormat: "youtube",
        thumbnail: ep.thumbnail,
        order: i,
      });
    }

    cache.invalidatePrefix("series:");
    res.json({ series, seasonId: season.id, episodesCreated: items.length });
  } catch (e: any) {
    const detail = (e?.cause as any)?.message ?? e?.cause ?? e.message;
    console.error("[youtube/import-playlist] error:", String(detail));
    res.status(500).json({ error: String(detail) });
  }
});

export default router;
