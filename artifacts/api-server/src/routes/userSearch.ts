import { Router, type Request, type Response } from "express";
import { requireUserAuth, requireAdminAuth, extractToken } from "../lib/auth.js";
import { db } from "@workspace/db";
import { adminSessionsTable, sessionsTable, accessCodesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function requireAnyAuth(req: any, res: any, next: any) {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const adminSessions = await db.select().from(adminSessionsTable).where(eq(adminSessionsTable.token, token)).limit(1);
  if (adminSessions[0]) { req.adminSession = adminSessions[0]; return next(); }

  const userSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).limit(1);
  if (userSessions[0]) {
    const codes = await db.select().from(accessCodesTable).where(eq(accessCodesTable.id, userSessions[0].codeId)).limit(1);
    const code = codes[0];
    if (code && code.isActive && (code.expiresAt == null || code.expiresAt > new Date())) {
      req.userSession = userSessions[0];
      return next();
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}

const router = Router();

const YT_API = "https://www.googleapis.com/youtube/v3";
const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata";

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

const ADULT_RE = /\b(xxx|porno?|pornog\w*|sexo?|sexual\w*|er[oó]tic[ao]?|adulto?|nsfw|hentai|nude|desnud[ao]|naked|putit[ao]?|obscen\w*|escort|prostitu\w*)\b/i;

// Titles that indicate the video is NOT a full movie
const JUNK_TITLE_RE = /\b(resumen|reseña|resena|critica|crítica|hablando|hablamos|opinión|opinion|tráiler|trailer|trailers|teaser|capitulo|capítulo|episodio|episode|temporada|parte\s+\d|part\s+\d|anuncio|spot|making\s+of|behind\s+the\s+scenes|entrevista|interview|análisis|analisis|review\b|clip\s+oficial|clip\s+final|escena\s+final|opening|fan\s+made|reaccion|reacción|resumiendo|explicando|doblaje|doblado\s+al|explicacion|explicación|noticias|news|vs\b)/i;

function sanitizeText(str: string, maxLen = 500): string {
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Returns true if the title/duration combination looks like a full movie.
 * Filters out reviews, trailers, episodes, clips, etc.
 */
function isLikelyFullMovie(title: string, duration: string): boolean {
  if (JUNK_TITLE_RE.test(title)) return false;

  // If we have a parseable duration, reject anything under 40 minutes
  if (duration) {
    const hMatch = duration.match(/(\d+)h/);
    const mMatch = duration.match(/(\d+)m/);
    const h = hMatch ? parseInt(hMatch[1], 10) : 0;
    const m = mMatch ? parseInt(mMatch[1], 10) : 0;
    const totalMin = h * 60 + m;
    // Only filter if we got a non-zero duration reading
    if (totalMin > 0 && totalMin < 40) return false;
  }

  return true;
}

function buildYouTubeQuery(raw: string, type: "movie" | "series" = "movie"): string {
  let q = raw.trim();
  q = q.replace(/ciencia ficcion/gi, "science fiction");
  for (const [es, en] of Object.entries(GENRE_MAP)) {
    if (!es.includes(" ")) {
      q = q.replace(new RegExp(`\\b${es}\\b`, "gi"), en);
    }
  }
  q = q.replace(FILLER_RE, " ").replace(/\s{2,}/g, " ").trim();
  if (!q || q.length < 2) q = raw.trim();
  if (type === "series") {
    if (!q.toLowerCase().includes("full episode") && !q.toLowerCase().includes("temporada") && !q.toLowerCase().includes("season")) {
      q = `${q} full episodes`;
    }
  } else {
    // Always bias toward Spanish full movies
    const lower = q.toLowerCase();
    if (
      !lower.includes("pelicula completa") &&
      !lower.includes("película completa") &&
      !lower.includes("full movie")
    ) {
      q = `${q} película completa español`;
    }
  }
  return q;
}

function parseISODuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  if (h > 0) return `${h}h ${min}m`;
  if (min > 0) return `${min}m`;
  return "";
}

const ADULT_FILTER =
  ' -subject:adult -subject:"adults only" -subject:porn -subject:pornography -subject:xxx -subject:erotic -subject:erotica -subject:"18+" -collection:erotica';

function buildArchiveQuery(raw: string): string {
  const multiWord: [string, string][] = [
    ["ciencia ficción", "science fiction"],
    ["ciencia ficcion", "science fiction"],
    ["cine mudo", "silent film"],
  ];
  let q = raw.trim();
  for (const [es, en] of multiWord) q = q.replace(new RegExp(es, "gi"), en);
  for (const [es, en] of Object.entries(GENRE_MAP)) {
    if (!es.includes(" ")) q = q.replace(new RegExp(`\\b${es}\\b`, "gi"), en);
  }
  q = q.replace(FILLER_RE, " ").replace(/\s{2,}/g, " ").trim();
  if (!q || q.length < 2) q = raw.trim();
  const terms = q.split(/\s+/).map(t => t.replace(/[^\w\s\-']/g, "").trim()).filter(t => t.length > 1);
  if (terms.length === 0) return q;
  if (terms.length === 1) {
    const t = terms[0];
    return `(title:${t} OR subject:${t} OR description:${t})`;
  }
  const phrase = terms.join(" ");
  const andTerms = terms.join(" AND ");
  return `(title:"${phrase}" OR title:(${andTerms}) OR subject:(${andTerms}) OR description:(${andTerms}))`;
}

const VIDEO_PRIORITY = ["mp4", "mpeg4", "ogv", "avi", "mkv", "webm", "mov"];

function cleanIdentifier(id: string): string {
  return id.replace(/^\/+/, "").trim();
}

async function youtubeInternalSearch(q: string, maxResults = 10): Promise<any[]> {
  const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240101",
        hl: "es",
        gl: "US",
      },
    },
    query: q,
    params: "EgIQAQ%3D%3D",
  };
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) return [];
  const data = await res.json();

  const contents: any[] =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];

  const videos: any[] = [];
  for (const section of contents) {
    const items: any[] =
      section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const vr = item?.videoRenderer;
      if (!vr || !vr.videoId) continue;
      const videoId: string = vr.videoId;
      const title: string = vr.title?.runs?.[0]?.text ?? "";
      const channel: string = vr.ownerText?.runs?.[0]?.text ?? "";
      const thumb: string =
        vr.thumbnail?.thumbnails?.slice(-1)[0]?.url?.split("?")[0] ?? "";
      const durText: string = vr.lengthText?.simpleText ?? "";
      videos.push({ videoId, title, thumbnail: thumb, channel, duration: durText });
      if (videos.length >= maxResults) break;
    }
    if (videos.length >= maxResults) break;
  }
  return videos;
}

router.get("/user-search/youtube", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ items: [] });
    if (ADULT_RE.test(q)) return res.json({ items: [] });

    const contentType = req.query.type === "series" ? "series" : "movie";
    const smartQ = buildYouTubeQuery(q, contentType);

    // Fetch more results than needed so we can filter down to real movies
    const raw = await youtubeInternalSearch(smartQ, 20);
    if (raw.length === 0) return res.json({ items: [] });

    const items = raw
      .filter(v => isLikelyFullMovie(v.title, v.duration))
      .slice(0, 10)
      .map((v) => ({
        videoId: v.videoId,
        title: sanitizeText(v.title, 200),
        thumbnail: v.thumbnail,
        channel: sanitizeText(v.channel, 80),
        duration: v.duration,
      }));

    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

// Admin-accessible YouTube search — applies full-movie query and filters
router.get("/admin/youtube-search", requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ items: [] });
    if (ADULT_RE.test(q)) return res.json({ items: [] });

    // Apply the same full-movie query transformation for admin search
    const smartQ = buildYouTubeQuery(q, "movie");

    // Fetch more to compensate for filtering
    const raw = await youtubeInternalSearch(smartQ, 30);
    if (raw.length === 0) return res.json({ items: [] });

    const items = raw
      .filter(v => isLikelyFullMovie(v.title, v.duration))
      .slice(0, 20)
      .map((v) => ({
        videoId: v.videoId,
        title: sanitizeText(v.title, 200),
        thumbnail: v.thumbnail,
        channel: sanitizeText(v.channel, 80),
        duration: v.duration,
      }));

    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

router.get("/user-search/archive", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ items: [] });
    if (ADULT_RE.test(q)) return res.json({ items: [] });

    const smartQ = buildArchiveQuery(q);
    const params = new URLSearchParams();
    params.set("q", `mediatype:movies ${smartQ}${ADULT_FILTER}`);
    params.append("fl[]", "identifier");
    params.append("fl[]", "title");
    params.append("fl[]", "year");
    params.append("fl[]", "creator");
    params.set("rows", "8");
    params.set("start", "0");
    params.set("output", "json");
    params.append("sort[]", "downloads desc");

    const res2 = await fetch(`${ARCHIVE_SEARCH}?${params}`, { signal: AbortSignal.timeout(12000) });
    if (!res2.ok) return res.json({ items: [] });

    const data = await res2.json();
    const docs: any[] = data.response?.docs || [];

    const items = docs.map((d: any) => ({
      identifier: cleanIdentifier(String(d.identifier || "")),
      title: d.title ? String(Array.isArray(d.title) ? d.title[0] : d.title) : d.identifier,
      year: d.year ? String(d.year) : undefined,
      creator: d.creator ? String(Array.isArray(d.creator) ? d.creator[0] : d.creator) : undefined,
      thumbnail: `https://archive.org/services/img/${cleanIdentifier(String(d.identifier || ""))}`,
    })).filter((i: any) => i.identifier);

    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

router.get("/user-search/archive/video/:identifier", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const identifier = cleanIdentifier(String(req.params.identifier || ""));
    if (!identifier) return res.status(400).json({ error: "identifier requerido" });

    const metaRes = await fetch(`${ARCHIVE_META}/${encodeURIComponent(identifier)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!metaRes.ok) return res.status(404).json({ error: "No encontrado" });

    const data = await metaRes.json();
    const files: any[] = data.files || [];

    for (const ext of VIDEO_PRIORITY) {
      const f = files.find(
        (f: any) =>
          typeof f.name === "string" &&
          f.name.toLowerCase().endsWith(`.${ext}`) &&
          f.source !== "metadata"
      );
      if (f) {
        return res.json({
          url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
          title: data.metadata?.title || identifier,
        });
      }
    }
    res.status(404).json({ error: "Sin video reproducible" });
  } catch {
    res.status(500).json({ error: "Error al obtener video" });
  }
});

export default router;
