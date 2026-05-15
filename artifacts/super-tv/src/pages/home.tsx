import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  useListChannels, getListChannelsQueryKey,
  useListMovies, getListMoviesQueryKey,
  useListChannelCategories, getListChannelCategoriesQueryKey,
  useGetMe, getGetMeQueryKey,
  useListAvatars, getListAvatarsQueryKey,
  useUpdateProfile,
  type Channel,
} from '@workspace/api-client-react';

type SectionKey = 'channels' | 'movies' | 'series';

interface SectionConfig {
  order: SectionKey[];
  visibility: Record<SectionKey, boolean>;
}

const DEFAULT_SECTION_CONFIG: SectionConfig = {
  order: ['channels', 'movies', 'series'],
  visibility: { channels: true, movies: true, series: true },
};

function useSectionConfig(): SectionConfig {
  const [config, setConfig] = useState<SectionConfig>(DEFAULT_SECTION_CONFIG);
  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(d => {
        const order: SectionKey[] = Array.isArray(d.sectionOrder) ? d.sectionOrder : DEFAULT_SECTION_CONFIG.order;
        const visibility = d.sectionVisibility ?? DEFAULT_SECTION_CONFIG.visibility;
        setConfig({ order, visibility });
      })
      .catch(() => {});
  }, []);
  return config;
}
import { useQueryClient } from '@tanstack/react-query';
import { clearTokens, getToken } from '@/lib/auth';
import { setMiniPlayerState, updateMiniPlayerState, getMiniPlayerState, subscribeMiniPlayer } from '@/lib/mini-player-state';
import { useTvKeyboard } from '@/hooks/use-tv-keyboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, LogOut, Search, Tv, Film, Tv2, X, Download, Share2, UserCircle2, AlertTriangle, Lock, Mic, MicOff, Home as HomeIcon, Smartphone, Menu } from 'lucide-react';
import { getFavorites, getAllProgress, getHistory, toggleFavorite, getAllSeriesProgress } from '@/lib/user-data';
import { useVoiceSearch } from '@/hooks/use-voice-search';
import logo from '@assets/imagen_1777670460131.png';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { ContentRow, isChannel } from '@/components/ContentRow';
import type { ContentItem } from '@/components/ContentRow';
import { ProfileEditor } from '@/components/ProfileEditor';
import { HeroBanner, type HeroBannerItem } from '@/components/HeroBanner';
import { fetchSeries, type SeriesItem } from '@/lib/api';

type TabKey = 'home' | 'channels' | 'movies' | 'series';
type NavZone = 'sidebar' | 'rows' | 'miniplayer' | 'hero';
type SidebarItem =
  | { type: 'profile' }
  | { type: 'search' }
  | { type: 'mic' }
  | { type: 'nav'; navIdx: number }
  | { type: 'action'; actionKey: string; actionBtnIdx: number };

function getChannelGridCols(): number {
  const w = window.innerWidth;
  if (w >= 1536) return 10;
  if (w >= 1280) return 8;
  if (w >= 1024) return 6;
  if (w >= 768) return 5;
  if (w >= 640) return 4;
  return 3;
}

function buildMiniProxyUrl(ch: { id: number; streamUrl: string }): { url: string; streamFormat: string } {
  const token = getToken('user') || getToken('admin') || '';
  const lower = ch.streamUrl.toLowerCase().split('?')[0];
  if (lower.endsWith('.m3u8') || lower.includes('/hls/')) {
    return { url: `/api/channels/${ch.id}/hls-proxy?token=${encodeURIComponent(token)}`, streamFormat: 'hls' };
  }
  const isDash = lower.endsWith('.mpd') || lower.includes('/dash/');
  const isFlv = lower.endsWith('.flv');
  return { url: `/api/channels/${ch.id}/stream?token=${encodeURIComponent(token)}`, streamFormat: isDash ? 'dash' : isFlv ? 'flv' : 'native' };
}

interface ContentRowData {
  id: string;
  title: string;
  emoji: string;
  items: ContentItem[];
  showProgress?: boolean;
  showBadge?: boolean;
}

interface SeriesRowData {
  id: string;
  title: string;
  items: SeriesItem[];
}

function SeriesCard({ series, onClick, focused, onHover, onHoverEnd }: { series: SeriesItem; onClick: () => void; focused?: boolean; onHover?: () => void; onHoverEnd?: () => void }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      tabIndex={0}
      className={`flex-shrink-0 w-36 sm:w-40 md:w-44 cursor-pointer group rounded-xl overflow-hidden border transition-all duration-200 ${focused ? 'border-primary ring-2 ring-primary scale-105 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-10' : 'border-border hover:border-primary/60 hover:scale-[1.03]'}`}
    >
      <div className="relative aspect-[2/3] bg-muted overflow-hidden">
        {series.poster ? (
          <img src={series.poster} alt={series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2 p-2">
            <Tv2 className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground/50 text-center leading-tight line-clamp-3">{series.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <Play className="w-6 h-6 text-white fill-white mx-auto" />
        </div>
        <div className="absolute top-1.5 left-1.5">
          <span className="px-1.5 py-0.5 bg-blue-600/90 text-white text-[9px] font-bold rounded uppercase tracking-wider">Serie</span>
        </div>
      </div>
      <div className="p-2 bg-card">
        <p className="text-xs font-medium truncate leading-tight">{series.title}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{[series.year, series.genre].filter(Boolean).join(' · ') || series.category || ''}</p>
      </div>
    </div>
  );
}

interface ContinueItemData {
  id: number;
  title: string;
  poster?: string | null;
  type: 'movie' | 'series';
  time: number;
  duration: number;
  episodeInfo?: string;
  updatedAt: number;
}

function ContinueWatchingCard({ item, onClick, focused }: { item: ContinueItemData; onClick: () => void; focused?: boolean }) {
  const pct = item.duration > 0 ? Math.min((item.time / item.duration) * 100, 100) : 0;
  const remaining = item.duration > item.time ? Math.round((item.duration - item.time) / 60) : 0;
  return (
    <div
      onClick={onClick}
      tabIndex={0}
      className={`flex-shrink-0 w-36 sm:w-40 md:w-44 cursor-pointer group rounded-xl overflow-hidden border transition-all duration-200 ${focused ? 'border-primary ring-2 ring-primary scale-105 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-10' : 'border-border hover:border-primary/60 hover:scale-[1.03]'}`}
    >
      <div className="relative aspect-[2/3] bg-muted overflow-hidden">
        {item.poster ? (
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2 p-2">
            {item.type === 'series' ? <Tv2 className="w-8 h-8 text-muted-foreground/40" /> : <Film className="w-8 h-8 text-muted-foreground/40" />}
            <span className="text-[10px] text-muted-foreground/50 text-center leading-tight line-clamp-3">{item.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2 pb-4">
          <Play className="w-7 h-7 text-white fill-white mx-auto opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
        <div className="absolute top-1.5 left-1.5">
          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${item.type === 'series' ? 'bg-blue-600/90 text-white' : 'bg-primary/90 text-primary-foreground'}`}>
            {item.type === 'series' ? 'Serie' : 'Película'}
          </span>
        </div>
        {remaining > 0 && (
          <div className="absolute top-1.5 right-1.5">
            <span className="px-1.5 py-0.5 bg-black/70 text-white text-[9px] rounded">{remaining}m</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
          <div className="h-full bg-primary transition-all duration-300 rounded-r-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="p-2 bg-card">
        <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.episodeInfo ?? (item.type === 'movie' ? 'Película' : '')}</p>
      </div>
    </div>
  );
}

function ChannelCard({ ch, onClick, focused }: { ch: Channel; onClick: () => void; focused?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200 bg-[#1a1a2e] ${focused ? 'ring-2 ring-primary scale-105 shadow-[0_0_16px_rgba(220,38,38,0.4)] z-10 bg-[#1e1e38]' : 'hover:bg-[#1e1e38] hover:scale-[1.04]'}`}
    >
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#0d0d1a] flex items-center justify-center flex-shrink-0">
        {ch.logo ? (
          <img src={ch.logo} alt={ch.name} className="w-full h-full object-contain p-1.5" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-white/20"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg></div>`; }} />
        ) : (
          <Tv className="w-6 h-6 text-white/20" />
        )}
      </div>
      <p className="text-[10px] sm:text-xs text-center leading-tight w-full truncate px-0.5 text-white/70">{ch.name}</p>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { canInstall, install, showInstallButton, isIosSafari } = usePwaInstall();
  const { openKeyboard } = useTvKeyboard();
  const [showHint, setShowHint] = useState(false);
  const [showShortcutHint, setShowShortcutHint] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(() => {
    try { return localStorage.getItem('supertv_expiry_dismissed') === new Date().toDateString(); } catch { return false; }
  });

  const initialTab = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('tab');
      if (t === 'movies') return 'movies';
      if (t === 'series') return 'series';
      if (t === 'channels') return 'channels';
      return 'home';
    } catch { return 'home'; }
  })() as TabKey;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [zone, setZone] = useState<NavZone>('rows');
  const [sidebarItemIndex, setSidebarItemIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [colIndex, setColIndex] = useState(0);
  const [heroBtnIndex, setHeroBtnIndex] = useState(0);
  const [heroBannerIdx, setHeroBannerIdx] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [hoveredHero, setHoveredHero] = useState<HeroBannerItem | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const sectionConfig = useSectionConfig();

  const sectionDefs: Record<SectionKey, { key: TabKey; label: string; icon: typeof Tv }> = {
    channels: { key: 'channels', label: 'En vivo', icon: Tv },
    movies: { key: 'movies', label: 'Películas', icon: Film },
    series: { key: 'series', label: 'Series', icon: Tv2 },
  };

  const navItems = [
    { key: 'home' as TabKey, label: 'Inicio', icon: HomeIcon },
    ...sectionConfig.order
      .filter(s => sectionConfig.visibility[s])
      .map(s => sectionDefs[s]),
  ];

  const tabs = navItems;

  const { isListening, isSupported: voiceSupported, startListening, stopListening } = useVoiceSearch({
    onResult: (transcript) => { setSearchQuery(transcript); setRowIndex(0); setColIndex(0); setVoiceError(null); searchRef.current?.focus(); },
    onError: (err) => { setVoiceError(err === 'not-allowed' ? 'Permiso de micrófono denegado' : 'No se pudo reconocer la voz'); setTimeout(() => setVoiceError(null), 3000); },
  });

  const [favorites, setFavorites] = useState<number[]>(() => getFavorites());
  const [allProgress, setAllProgress] = useState(() => getAllProgress());
  const [watchHistory, setWatchHistory] = useState(() => getHistory());

  const { data: session, isError: sessionError } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data: avatars = [] } = useListAvatars({ query: { queryKey: getListAvatarsQueryKey() } });
  const updateProfileMutation = useUpdateProfile();
  const { data: allChannels = [], isLoading: channelsLoading } = useListChannels(undefined, { query: { queryKey: getListChannelsQueryKey() } });
  const { data: movies = [], isLoading: moviesLoading } = useListMovies(undefined, { query: { queryKey: getListMoviesQueryKey() } });
  const { data: categoriesFromApi = [] } = useListChannelCategories({ query: { queryKey: getListChannelCategoriesQueryKey() } });

  useEffect(() => { if (sessionError) { clearTokens(); setLocation('/'); } }, [sessionError, setLocation]);

  useEffect(() => {
    if ((activeTab === 'series' || activeTab === 'home') && seriesList.length === 0) {
      setSeriesLoading(true);
      fetchSeries().then(s => { setSeriesList(s); setSeriesLoading(false); }).catch(() => setSeriesLoading(false));
    }
  }, [activeTab]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const progressMap = useMemo(() => new Map(allProgress.map(p => [p.movieId, p])), [allProgress]);

  const continueWatching = useMemo(() => {
    if (!movies.length) return [];
    return allProgress.map(p => movies.find(m => m.id === p.movieId)).filter((m): m is typeof movies[0] => !!m).slice(0, 12);
  }, [movies, allProgress]);

  useEffect(() => {
    const hasSeriesProgress = getAllSeriesProgress().length > 0;
    if (hasSeriesProgress && seriesList.length === 0) {
      fetchSeries().then(s => setSeriesList(s)).catch(() => {});
    }
  }, []);

  const combinedContinueWatching = useMemo((): ContinueItemData[] => {
    const items: ContinueItemData[] = [];
    for (const p of allProgress) {
      const m = movies.find(mv => mv.id === p.movieId);
      if (m) items.push({ id: m.id, title: m.title, poster: (m as any).poster ?? null, type: 'movie', time: p.time, duration: p.duration, updatedAt: p.updatedAt });
    }
    const spList = getAllSeriesProgress();
    for (const p of spList) {
      const s = seriesList.find(sv => sv.id === p.seriesId);
      if (s) items.push({ id: s.id, title: s.title, poster: s.poster, type: 'series', time: p.time, duration: p.duration, episodeInfo: `T${p.seasonNumber}:E${p.episodeNumber}`, updatedAt: p.updatedAt });
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items.slice(0, 12);
  }, [allProgress, movies, seriesList]);

  const favoriteMovies = useMemo(() => {
    if (!movies.length || !favorites.length) return [];
    return favorites.map(fid => movies.find(m => m.id === fid)).filter((m): m is typeof movies[0] => !!m).slice(0, 14);
  }, [movies, favorites]);

  const recommendations = useMemo(() => {
    if (!movies.length) return [];
    const favCats = new Set(movies.filter(m => favSet.has(m.id)).map(m => m.category).filter(Boolean) as string[]);
    const watchedCats = new Set(watchHistory.map(h => h.category).filter(Boolean) as string[]);
    if (!favCats.size && !watchedCats.size) return [];
    const progressIds = new Set(allProgress.map(p => p.movieId));
    return movies.filter(m => !favSet.has(m.id) && !progressIds.has(m.id)).map(m => {
      let score = 0;
      if (m.category && favCats.has(m.category)) score += 3;
      if (m.category && watchedCats.has(m.category)) score += 1;
      return { m, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 14).map(x => x.m);
  }, [movies, favSet, watchHistory, allProgress]);

  const recentMovies = useMemo(() => {
    if (!movies.length) return [];
    return [...movies].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 14);
  }, [movies]);

  const channelsByCategory = useMemo(() => {
    const map = new Map<string, typeof allChannels>();
    allChannels.forEach(ch => { const cat = ch.category || 'Sin categoría'; if (!map.has(cat)) map.set(cat, []); map.get(cat)!.push(ch); });
    return map;
  }, [allChannels]);

  const moviesByCategory = useMemo(() => {
    const map = new Map<string, typeof movies>();
    movies.forEach(m => { const cat = m.category || 'Sin categoría'; if (!map.has(cat)) map.set(cat, []); map.get(cat)!.push(m); });
    return map;
  }, [movies]);

  const sevenDaysAgo = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, []);
  const isNew = useCallback((item: ContentItem) => {
    if (!('createdAt' in item)) return false;
    return new Date((item as typeof movies[0]).createdAt).getTime() > sevenDaysAgo;
  }, [sevenDaysAgo]);

  const daysLeft = (() => {
    if (!session?.expiresAt) return null;
    return Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  })();
  const isExpired = session?.type === 'user' && daysLeft !== null && daysLeft <= 0;
  const [showExpiredOverlay, setShowExpiredOverlay] = useState(true);
  useEffect(() => { if (isExpired) setShowExpiredOverlay(true); }, [isExpired]);

  const heroBannerItems = useMemo((): HeroBannerItem[] => {
    if (activeTab === 'home') {
      const anyMovies = movies as any[];
      const movFeatured = anyMovies.filter(m => m.featured).slice(0, 3);
      const serFeatured = seriesList.filter(s => s.featured).slice(0, 2);
      const movSource = movFeatured.length > 0 ? movFeatured : anyMovies.slice(0, 3);
      const serSource = serFeatured.length > 0 ? serFeatured : seriesList.slice(0, 2);
      const combined = [
        ...movSource.map((m: any) => ({ id: m.id, title: m.title, description: m.description, banner: m.banner, poster: m.poster, category: m.category, genre: m.genre, year: m.year, type: 'movie' as const })),
        ...serSource.map(s => ({ id: s.id, title: s.title, description: s.description, banner: s.banner, poster: s.poster, category: s.category, genre: s.genre, year: s.year, type: 'series' as const })),
      ];
      return combined.slice(0, 5);
    }
    if (activeTab === 'movies') {
      const anyMovies = movies as any[];
      const featured = anyMovies.filter(m => m.featured).slice(0, 5);
      const source = featured.length >= 2 ? featured : anyMovies.slice(0, 5);
      return source.map((m: any) => ({ id: m.id, title: m.title, description: m.description, banner: m.banner, poster: m.poster, category: m.category, genre: m.genre, year: m.year, type: 'movie' as const }));
    }
    if (activeTab === 'series' && seriesList.length > 0) {
      const featured = seriesList.filter(s => s.featured).slice(0, 5);
      const source = featured.length >= 2 ? featured : seriesList.slice(0, 5);
      return source.map(s => ({ id: s.id, title: s.title, description: s.description, banner: s.banner, poster: s.poster, category: s.category, genre: s.genre, year: s.year, type: 'series' as const }));
    }
    return [];
  }, [activeTab, movies, seriesList]);

  const contentRows = useMemo((): ContentRowData[] => {
    const q = searchQuery.trim().toLowerCase();
    if (activeTab === 'channels') {
      if (q) {
        const results = allChannels.filter(ch => ch.name.toLowerCase().includes(q));
        return [{ id: 'search', title: `Resultados: "${searchQuery}"`, emoji: '🔍', items: results as ContentItem[] }];
      }
      return [];
    }
    if (activeTab === 'home') {
      const rows: ContentRowData[] = [];
      if (recentMovies.length > 0) rows.push({ id: 'recent-mov', title: 'Películas recientes', emoji: '🎬', items: recentMovies as ContentItem[], showBadge: true });
      const recentSeries = seriesList.slice(0, 14);
      if (recentSeries.length > 0) rows.push({ id: 'recent-ser', title: 'Series disponibles', emoji: '📺', items: recentSeries.map(s => ({ ...s, _isSeries: true })) as unknown as ContentItem[] });
      return rows;
    }
    if (q) {
      const results = movies.filter(m => m.title.toLowerCase().includes(q));
      return [{ id: 'search', title: `Resultados: "${searchQuery}"`, emoji: '🔍', items: results as ContentItem[] }];
    }
    const rows: ContentRowData[] = [];
    if (continueWatching.length > 0) rows.push({ id: 'continue', title: 'Seguir viendo', emoji: '▶', items: continueWatching as ContentItem[], showProgress: true });
    if (favoriteMovies.length > 0) rows.push({ id: 'favs', title: 'Mis favoritos', emoji: '❤️', items: favoriteMovies as ContentItem[] });
    if (recommendations.length > 0) rows.push({ id: 'recs', title: 'Para ti', emoji: '⭐', items: recommendations as ContentItem[] });
    if (recentMovies.length > 0) rows.push({ id: 'recent', title: 'Recién agregadas', emoji: '🆕', items: recentMovies as ContentItem[], showBadge: true });
    const specialIds = new Set([...continueWatching.map(m => m.id), ...favoriteMovies.map(m => m.id), ...recommendations.map(m => m.id)]);
    const movCatOrder = [...moviesByCategory.keys()].sort((a, b) => {
      if (a === 'Sin categoría') return 1; if (b === 'Sin categoría') return -1;
      return (moviesByCategory.get(b)?.length ?? 0) - (moviesByCategory.get(a)?.length ?? 0);
    });
    for (const cat of movCatOrder) {
      const items = (moviesByCategory.get(cat) ?? []).filter(m => !specialIds.has(m.id));
      if (items.length > 0) rows.push({ id: `mv-${cat}`, title: cat, emoji: '🎬', items: items as ContentItem[] });
    }
    if (rows.length === 0 && movies.length > 0) rows.push({ id: 'mv-all', title: 'Todas las películas', emoji: '🎬', items: movies as ContentItem[] });
    return rows;
  }, [searchQuery, activeTab, allChannels, movies, moviesByCategory, continueWatching, recentMovies, recommendations, favoriteMovies, combinedContinueWatching, seriesList]);

  const seriesRows = useMemo((): SeriesRowData[] => {
    if (activeTab !== 'series') return [];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const results = seriesList.filter(s => s.title.toLowerCase().includes(q));
      return [{ id: 'search', title: `Resultados: "${searchQuery}"`, items: results }];
    }
    const seriesByCat = new Map<string, SeriesItem[]>();
    seriesList.forEach(s => { const cat = s.category || 'Series'; if (!seriesByCat.has(cat)) seriesByCat.set(cat, []); seriesByCat.get(cat)!.push(s); });
    const rows: SeriesRowData[] = [];
    if (seriesList.length > 0) {
      const seriesProgress = getAllSeriesProgress();
      const inProgress = seriesProgress.map(p => seriesList.find(s => s.id === p.seriesId)).filter((s): s is SeriesItem => !!s).slice(0, 10);
      if (inProgress.length > 0) rows.push({ id: 'series-progress', title: 'Seguir viendo', items: inProgress });
    }
    const catOrder = [...seriesByCat.keys()].sort();
    for (const cat of catOrder) {
      const items = seriesByCat.get(cat) ?? [];
      if (items.length > 0) rows.push({ id: `sr-${cat}`, title: cat, items });
    }
    if (rows.length === 0 && seriesList.length > 0) rows.push({ id: 'sr-all', title: 'Todas las series', items: seriesList });
    return rows;
  }, [activeTab, seriesList, searchQuery]);

  const channelRows = useMemo(() => {
    if (activeTab !== 'channels') return [];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const results = allChannels.filter(ch => ch.name.toLowerCase().includes(q));
      return [{ id: 'search', title: `Resultados: "${searchQuery}"`, items: results }];
    }
    const rows: Array<{ id: string; title: string; items: typeof allChannels }> = [];
    const catOrder = categoriesFromApi.length > 0 ? categoriesFromApi : [...channelsByCategory.keys()].filter(c => c !== 'Sin categoría');
    for (const cat of catOrder) {
      const items = channelsByCategory.get(cat);
      if (items && items.length > 0) rows.push({ id: `ch-${cat}`, title: cat, items });
    }
    const uncategorized = channelsByCategory.get('Sin categoría');
    if (uncategorized && uncategorized.length > 0) rows.push({ id: 'ch-sincat', title: 'Sin categoría', items: uncategorized });
    if (rows.length === 0 && allChannels.length > 0) rows.push({ id: 'ch-all', title: 'Todos los canales', items: allChannels });
    return rows;
  }, [activeTab, allChannels, categoriesFromApi, channelsByCategory, searchQuery]);

  const activeRows = useMemo(() => {
    if (activeTab === 'channels') return channelRows.map(r => ({ id: r.id, title: r.title, emoji: '📺', items: r.items as ContentItem[] }));
    if (activeTab === 'series') return seriesRows.map(r => ({ id: r.id, title: r.title, emoji: '🎬', items: r.items as unknown as ContentItem[] }));
    return contentRows;
  }, [activeTab, channelRows, seriesRows, contentRows]);

  useEffect(() => { setRowIndex(0); setColIndex(0); }, [activeTab, searchQuery]);
  useEffect(() => { if (zone === 'rows' && rowRefs.current[rowIndex]) rowRefs.current[rowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [rowIndex, zone]);
  useEffect(() => { return subscribeMiniPlayer(() => { const s = getMiniPlayerState(); if (!s?.isMinimized) setZone(prev => prev === 'miniplayer' ? 'rows' : prev); }); }, []);

  const playItem = useCallback((item: ContentItem) => {
    if (isExpired) { setShowExpiredOverlay(true); return; }
    if (isChannel(item)) {
      const channelList = allChannels.map(ch => ({ id: ch.id, streamUrl: ch.streamUrl ?? '', name: ch.name }));
      const idx = allChannels.findIndex(ch => ch.id === item.id);
      setMiniPlayerState({ url: item.streamUrl ?? '', title: item.name, type: 'channel', movieId: null, channelId: item.id, streamFormat: (item as any).streamFormat ?? null, isMinimized: false, channels: channelList, channelIndex: idx >= 0 ? idx : 0 });
      setLocation(`/player?channelId=${item.id}&title=${encodeURIComponent(item.name)}&type=channel`);
    } else if ((item as any)._isSeries) {
      setLocation(`/serie/${item.id}`);
    } else {
      setLocation(`/pelicula/${item.id}`);
    }
  }, [setLocation, isExpired, allChannels]);

  const playSeriesItem = useCallback((series: SeriesItem) => {
    if (isExpired) { setShowExpiredOverlay(true); return; }
    setLocation(`/serie/${series.id}`);
  }, [setLocation, isExpired]);

  const playHeroBannerItem = useCallback((item: HeroBannerItem) => {
    if (isExpired) { setShowExpiredOverlay(true); return; }
    if (item.type === 'series') setLocation(`/serie/${item.id}`);
    else setLocation(`/pelicula/${item.id}`);
  }, [setLocation, isExpired]);

  const openProfile = useCallback(() => setShowProfile(true), []);

  const handleSaveProfile = async (name: string, avatarId: number | null) => {
    await updateProfileMutation.mutateAsync({ data: { displayName: name.trim() || null, avatarId } });
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setShowProfile(false);
  };

  const showExpiryBanner = session?.type === 'user' && daysLeft !== null && daysLeft > 0 && daysLeft <= 3 && !expiryBannerDismissed;
  const dismissExpiryBanner = () => { try { localStorage.setItem('supertv_expiry_dismissed', new Date().toDateString()); } catch {} setExpiryBannerDismissed(true); };

  const refreshUserData = useCallback(() => { setFavorites(getFavorites()); setAllProgress(getAllProgress()); setWatchHistory(getHistory()); }, []);
  useEffect(() => { window.addEventListener('focus', refreshUserData); return () => window.removeEventListener('focus', refreshUserData); }, [refreshUserData]);


  const doToggleFav = useCallback((movieId: number) => { toggleFavorite(movieId); setFavorites(getFavorites()); }, []);
  const handleLogout = () => { clearTokens(); setLocation('/'); };
  const handleInstall = () => { if (canInstall) install(); else setShowHint(true); };
  const handleShortcut = () => setShowShortcutHint(true);

  const actionButtons = useMemo(() => [
    ...(session?.type === 'user' ? [{ key: 'profile', label: 'Mi perfil', action: openProfile, icon: UserCircle2 }] : []),
    ...(showInstallButton ? [{ key: 'install', label: 'Instalar', action: handleInstall, icon: Download }] : []),
    { key: 'shortcut', label: 'Acceso directo', action: handleShortcut, icon: Smartphone },
    { key: 'logout', label: 'Salir', action: handleLogout, icon: LogOut },
  ], [session, showInstallButton, openProfile, handleInstall, handleLogout]);

  const sidebarItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [];
    if (session?.type === 'user') items.push({ type: 'profile' });
    items.push({ type: 'search' });
    if (voiceSupported) items.push({ type: 'mic' });
    navItems.forEach((_, navIdx) => items.push({ type: 'nav', navIdx }));
    actionButtons.filter(b => b.key !== 'profile').forEach((b, i) => items.push({ type: 'action', actionKey: b.key, actionBtnIdx: i }));
    return items;
  }, [session, voiceSupported, navItems, actionButtons]);

  const isLoading = channelsLoading || moviesLoading || ((activeTab === 'series' || activeTab === 'home') && seriesLoading);
  const showHero = !searchQuery && heroBannerItems.length > 0 && activeTab !== 'channels';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showProfile || showHint || showShortcutHint) return;
      const isInputFocused = document.activeElement === searchRef.current;
      if (isInputFocused) {
        if (['Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { searchRef.current?.blur(); }
        else { return; }
        return;
      }

      if (zone === 'sidebar') {
        const curItem = sidebarItems[sidebarItemIndex];
        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault();
            const next = Math.min(sidebarItemIndex + 1, sidebarItems.length - 1);
            setSidebarItemIndex(next);
            const nextItem = sidebarItems[next];
            if (nextItem?.type === 'nav') { setActiveTab(navItems[nextItem.navIdx].key); setRowIndex(0); setColIndex(0); }
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            const prev = Math.max(sidebarItemIndex - 1, 0);
            setSidebarItemIndex(prev);
            const prevItem = sidebarItems[prev];
            if (prevItem?.type === 'nav') { setActiveTab(navItems[prevItem.navIdx].key); setRowIndex(0); setColIndex(0); }
            break;
          }
          case 'ArrowRight':
            e.preventDefault();
            setShowSidebar(false);
            if (showHero) { setZone('hero'); setHeroBtnIndex(0); }
            else { setZone('rows'); setRowIndex(0); setColIndex(0); }
            break;
          case 'Enter':
            e.preventDefault();
            if (!curItem) break;
            if (curItem.type === 'profile') { openProfile(); setShowSidebar(false); }
            else if (curItem.type === 'search') { openKeyboard(searchRef.current, { value: searchQuery, onChange: (v) => { setSearchQuery(v); setRowIndex(0); setColIndex(0); }, label: 'Buscar...' }); }
            else if (curItem.type === 'mic') { isListening ? stopListening() : startListening(); }
            else if (curItem.type === 'nav') { setActiveTab(navItems[curItem.navIdx].key); setRowIndex(0); setColIndex(0); setShowSidebar(false); setZone('rows'); }
            else if (curItem.type === 'action') { actionButtons.filter(b => b.key !== 'profile')[curItem.actionBtnIdx]?.action(); }
            break;
          case 'Escape': case 'Backspace':
            e.preventDefault();
            setShowSidebar(false);
            setZone('rows');
            break;
        }

      } else if (zone === 'hero') {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            if (heroBtnIndex > 0) setHeroBtnIndex(0);
            else { setZone('sidebar'); setShowSidebar(true); }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (heroBtnIndex < 1) setHeroBtnIndex(1);
            else { setZone('rows'); setRowIndex(0); setColIndex(0); }
            break;
          case 'ArrowDown':
            e.preventDefault();
            setZone('rows'); setRowIndex(0); setColIndex(0);
            break;
          case 'ArrowUp':
            e.preventDefault();
            setZone('sidebar'); setShowSidebar(true);
            break;
          case 'Enter': {
            e.preventDefault();
            const heroItem = hoveredHero ?? heroBannerItems[heroBannerIdx] ?? heroBannerItems[0];
            if (heroItem) {
              if (heroBtnIndex === 0) playHeroBannerItem(heroItem);
              else { if (heroItem.type === 'series') setLocation(`/serie/${heroItem.id}`); else setLocation(`/pelicula/${heroItem.id}`); }
            }
            break;
          }
          case 'Escape': case 'Backspace':
            e.preventDefault();
            setZone('sidebar'); setShowSidebar(true);
            break;
        }

      } else if (zone === 'miniplayer') {
        const mini = getMiniPlayerState();
        if (!mini?.isMinimized) { setZone('rows'); return; }
        switch (e.key) {
          case 'ArrowLeft': {
            e.preventDefault();
            if (mini.channels.length > 0) {
              const newIdx = (mini.channelIndex - 1 + mini.channels.length) % mini.channels.length;
              const ch = mini.channels[newIdx];
              const { url, streamFormat } = buildMiniProxyUrl(ch);
              updateMiniPlayerState({ url, title: ch.name, channelIndex: newIdx, streamFormat });
              window.dispatchEvent(new CustomEvent('supertv:mini-flash-osd'));
            }
            break;
          }
          case 'ArrowRight': {
            e.preventDefault();
            if (mini.channels.length > 0) {
              const newIdx = (mini.channelIndex + 1) % mini.channels.length;
              const ch = mini.channels[newIdx];
              const { url, streamFormat } = buildMiniProxyUrl(ch);
              updateMiniPlayerState({ url, title: ch.name, channelIndex: newIdx, streamFormat });
              window.dispatchEvent(new CustomEvent('supertv:mini-flash-osd'));
            }
            break;
          }
          case 'Enter': e.preventDefault(); updateMiniPlayerState({ isFocused: false }); window.dispatchEvent(new CustomEvent('supertv:mini-maximize')); setZone('rows'); break;
          case 'Backspace': case 'Delete': e.preventDefault(); updateMiniPlayerState({ isFocused: false }); window.dispatchEvent(new CustomEvent('supertv:mini-close')); setZone('rows'); break;
          case 'Escape': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); updateMiniPlayerState({ isFocused: false }); setZone('rows'); break;
        }

      } else {
        // rows zone
        const currentRow = activeRows[rowIndex];
        const currentLen = currentRow?.items?.length ?? 0;
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            setColIndex(p => Math.min(p + 1, currentLen - 1));
            break;
          case 'ArrowLeft':
            e.preventDefault();
            if (colIndex > 0) setColIndex(p => Math.max(p - 1, 0));
            else { setZone('sidebar'); setShowSidebar(true); }
            break;
          case 'ArrowDown': {
            e.preventDefault();
            if (activeTab === 'channels') {
              const cols = getChannelGridCols();
              const newCol = colIndex + cols;
              if (newCol < currentLen) {
                setColIndex(newCol);
              } else if (rowIndex < activeRows.length - 1) {
                setRowIndex(p => p + 1); setColIndex(0);
              } else {
                const _mini = getMiniPlayerState();
                if (_mini?.isMinimized) { updateMiniPlayerState({ isFocused: true }); setZone('miniplayer'); }
              }
            } else {
              if (rowIndex < activeRows.length - 1) { setRowIndex(p => p + 1); setColIndex(0); }
              else { const _mini = getMiniPlayerState(); if (_mini?.isMinimized) { updateMiniPlayerState({ isFocused: true }); setZone('miniplayer'); } }
            }
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            if (activeTab === 'channels') {
              const cols = getChannelGridCols();
              const newCol = colIndex - cols;
              if (newCol >= 0) {
                setColIndex(newCol);
              } else if (rowIndex > 0) {
                setRowIndex(p => p - 1); setColIndex(0);
              } else {
                if (showHero) { setZone('hero'); setHeroBtnIndex(0); }
              }
            } else {
              if (rowIndex > 0) { setRowIndex(p => p - 1); setColIndex(0); }
              else { if (showHero) { setZone('hero'); setHeroBtnIndex(0); } }
            }
            break;
          }
          case 'Enter': {
            e.preventDefault();
            if (activeTab === 'series') {
              const item = seriesRows[rowIndex]?.items[colIndex];
              if (item) playSeriesItem(item);
            } else {
              if (currentRow?.items[colIndex]) playItem(currentRow.items[colIndex]);
            }
            break;
          }
          case 'Escape': case 'Backspace': e.preventDefault(); setZone('sidebar'); setShowSidebar(true); break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zone, sidebarItemIndex, sidebarItems, rowIndex, colIndex, heroBtnIndex, heroBannerIdx, activeRows, seriesRows, activeTab, playItem, playSeriesItem, navItems, actionButtons, showProfile, showHint, showShortcutHint, voiceSupported, isListening, startListening, stopListening, showHero, hoveredHero, heroBannerItems, openKeyboard, openProfile, searchQuery]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#141414] text-white flex select-none">

      {/* ── EXPIRED OVERLAY ── */}
      {isExpired && showExpiredOverlay && (
        <div className="fixed inset-0 z-[200] bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 text-center px-6">
          <button onClick={() => setShowExpiredOverlay(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center"><Lock className="w-10 h-10 text-destructive" /></div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Acceso vencido</h2>
              <p className="text-white/50 max-w-xs">Tu código venció. Para renovarlo, contacta a tu proveedor.</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sm text-white/40 hover:text-white transition-colors underline underline-offset-4">Cerrar sesión</button>
        </div>
      )}

      {/* ── NARROW ICON RAIL (desktop, always visible) ── */}
      <div
        className="hidden md:flex fixed left-0 top-0 h-full z-50 w-16 bg-[#0a0a0a] border-r border-white/5 flex-col items-center py-4 gap-1"
        onMouseEnter={() => { setShowSidebar(true); setZone('sidebar'); }}
      >
        <div className="mb-3 flex items-center justify-center w-10 h-10">
          <img src={logo} alt="Super TV" className="h-7 w-auto object-contain" />
        </div>
        <div className="w-8 h-px bg-white/8 mb-1" />
        {navItems.map((item, i) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setRowIndex(0); setColIndex(0); setZone('rows'); }}
              title={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150
                ${isActive ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-orange-400' : ''}`} />
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => setShowSidebar(true)}
          title="Buscar"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/35 hover:text-white hover:bg-white/8 transition-all"
        >
          <Search className="w-5 h-5" />
        </button>
        {session?.type === 'user' && (
          <button
            onClick={() => openProfile()}
            title={session.displayName || 'Perfil'}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-white/35 hover:text-white hover:bg-white/8 transition-all"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden border border-white/15 flex items-center justify-center bg-white/8">
              {session.avatarUrl
                ? <img src={session.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                : <UserCircle2 className="w-4 h-4 text-white/40" />
              }
            </div>
          </button>
        )}
        <button
          onClick={handleLogout}
          title="Salir"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all mb-1"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* ── FULL SIDEBAR OVERLAY ── */}
      {showSidebar && <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={() => { setShowSidebar(false); setZone('rows'); }} />}
      {(() => {
        const si = sidebarItems[sidebarItemIndex];
        const isSbFocused = (type: SidebarItem['type'], extra?: number) =>
          zone === 'sidebar' && si?.type === type && (extra === undefined || (si.type === 'nav' && si.navIdx === extra) || (si.type === 'action' && si.actionBtnIdx === extra));
        return (
          <aside
            className={`fixed left-0 top-0 h-full z-[60] bg-[#0d0d0d] border-r border-white/8 flex flex-col transition-all duration-300 w-72 shadow-2xl
            ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}
            onMouseLeave={() => { setShowSidebar(false); setZone('rows'); }}
          >
            {/* Logo */}
            <div className="p-5 pb-4 flex items-center justify-between">
              <img src={logo} alt="Super TV" className="h-9 w-auto" />
              <button className="p-1.5 rounded-lg hover:bg-white/10 text-white/50" onClick={() => { setShowSidebar(false); setZone('rows'); }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User info */}
            {session?.type === 'user' && (
              <button
                onClick={() => { openProfile(); setShowSidebar(false); }}
                onMouseEnter={() => { const idx = sidebarItems.findIndex(s => s.type === 'profile'); if (idx >= 0) setSidebarItemIndex(idx); }}
                className={`mx-3 mb-3 flex items-center gap-3 p-3 rounded-xl hover:bg-white/8 transition-colors text-left ${isSbFocused('profile') ? 'ring-2 ring-primary bg-white/8' : ''}`}
              >
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/20 flex-shrink-0 bg-white/10 flex items-center justify-center">
                  {session.avatarUrl
                    ? <img src={session.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    : <UserCircle2 className="w-6 h-6 text-white/50" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{session.displayName || session.codeName || 'Usuario'}</p>
                  {session.expiresAt && (
                    <p className="text-[10px] text-white/40 truncate">Vence: {(() => { const d = new Date(session.expiresAt!); const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; })()}</p>
                  )}
                </div>
              </button>
            )}

            {/* Search bar */}
            <div className="px-3 pb-2">
              <button
                onClick={() => { const idx = sidebarItems.findIndex(s => s.type === 'search'); if (idx >= 0) setSidebarItemIndex(idx); openKeyboard(searchRef.current, { value: searchQuery, onChange: (v) => { setSearchQuery(v); setRowIndex(0); setColIndex(0); }, label: 'Buscar...' }); }}
                onMouseEnter={() => { const idx = sidebarItems.findIndex(s => s.type === 'search'); if (idx >= 0) setSidebarItemIndex(idx); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 bg-white/7 border ${isSbFocused('search') ? 'border-white/30 bg-white/12 ring-2 ring-primary/60' : 'border-white/10 hover:bg-white/10'} ${isListening ? 'border-red-500/50' : ''}`}
              >
                <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
                <span className={`flex-1 text-left truncate ${searchQuery ? 'text-white' : 'text-white/30'}`}>{searchQuery || (isListening ? 'Escuchando...' : 'Buscar...')}</span>
                {searchQuery && <button onClick={(ev) => { ev.stopPropagation(); setSearchQuery(''); }} className="text-white/30 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
              </button>
            </div>

            {/* Voice search button */}
            {voiceSupported && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => { isListening ? stopListening() : startListening(); }}
                  onMouseEnter={() => { const idx = sidebarItems.findIndex(s => s.type === 'mic'); if (idx >= 0) setSidebarItemIndex(idx); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                    ${isListening ? 'text-red-400 bg-red-500/15 border border-red-500/40' : 'text-white/45 hover:text-white hover:bg-white/7 border border-transparent'}
                    ${isSbFocused('mic') ? 'ring-2 ring-primary/60 bg-white/10 text-white' : ''}`}
                >
                  {isListening ? <MicOff className="w-4 h-4 flex-shrink-0" /> : <Mic className="w-4 h-4 flex-shrink-0" />}
                  {isListening ? 'Detener búsqueda por voz' : 'Buscar por voz'}
                </button>
                {voiceError && <p className="text-[10px] text-red-400 mt-1 px-1">{voiceError}</p>}
              </div>
            )}

            <div className="mx-3 mb-3 h-px bg-white/8" />

            {/* Nav items */}
            <nav className="px-3 space-y-1">
              {navItems.map((item, i) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                const isFocused = isSbFocused('nav', i);
                return (
                  <button
                    key={item.key}
                    onMouseEnter={() => { setActiveTab(item.key); const idx = sidebarItems.findIndex(s => s.type === 'nav' && s.navIdx === i); if (idx >= 0) setSidebarItemIndex(idx); setRowIndex(0); setColIndex(0); }}
                    onClick={() => { setActiveTab(item.key); setRowIndex(0); setColIndex(0); setZone('rows'); setShowSidebar(false); }}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
                      ${isActive ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white hover:bg-white/7'}
                      ${isFocused ? 'ring-2 ring-primary/60' : ''}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? 'text-orange-400' : ''}`} />
                    {item.label}
                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400" />}
                  </button>
                );
              })}
            </nav>

            <div className="mx-3 my-3 h-px bg-white/8" />

            {/* Actions */}
            <div className="px-3 pb-5 space-y-0.5">
              {actionButtons.filter(b => b.key !== 'profile').map((btn, bIdx) => {
                const Icon = btn.icon;
                const isLogout = btn.key === 'logout';
                const isFocused = isSbFocused('action', bIdx);
                return (
                  <button
                    key={btn.key}
                    onMouseEnter={() => { const idx = sidebarItems.findIndex(s => s.type === 'action' && s.actionBtnIdx === bIdx); if (idx >= 0) setSidebarItemIndex(idx); }}
                    onClick={btn.action}
                    className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                      ${isLogout ? 'text-white/35 hover:text-red-400 hover:bg-red-500/10' : 'text-white/45 hover:text-white hover:bg-white/7'}
                      ${isFocused ? (isLogout ? 'ring-2 ring-red-400/60 text-red-400 bg-red-500/10' : 'ring-2 ring-primary/60 text-white bg-white/10') : ''}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </aside>
        );
      })()}

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-h-screen flex flex-col pb-16 md:pb-0 overflow-x-hidden md:ml-16" ref={mainRef}>

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-[#0d0d0d] border-b border-white/5">
          <button onClick={() => { setShowSidebar(true); setZone('sidebar'); }} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <img src={logo} alt="Super TV" className="h-7 w-auto" />
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setRowIndex(0); setColIndex(0); }}
              placeholder="Buscar..."
              className="w-full bg-white/7 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
            />
          </div>
        </div>

        {/* Expiry warning */}
        {showExpiryBanner && (
          <div className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium ${daysLeft !== null && daysLeft <= 0 ? 'bg-red-600/20 text-red-300' : daysLeft === 1 ? 'bg-orange-500/15 text-orange-300' : 'bg-yellow-500/10 text-yellow-300'}`}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-xs">{daysLeft !== null && daysLeft <= 0 ? 'Tu código venció. Contacta a tu proveedor para activarlo.' : daysLeft === 1 ? 'Tu acceso vence hoy. Renueva con tu proveedor.' : `Tu acceso vence en ${daysLeft} días.`}</span>
            <button onClick={dismissExpiryBanner} className="flex-shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Hero Banner */}
        {showHero && (
          <HeroBanner
            items={heroBannerItems}
            overrideItem={hoveredHero}
            onPlay={playHeroBannerItem}
            onInfo={item => item.type === 'series' ? setLocation(`/serie/${item.id}`) : setLocation(`/pelicula/${item.id}`)}
            focusedBtnIndex={zone === 'hero' ? heroBtnIndex : null}
            currentIndex={heroBannerIdx}
            onCurrentChange={setHeroBannerIdx}
          />
        )}

        {/* Content area */}
        {isLoading ? (
          <div className="px-4 sm:px-6 py-6 space-y-8">
            {activeTab === 'channels' ? (
              <div className="space-y-6">
                {[1,2,3].map(i => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-5 w-32 rounded bg-white/5" />
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                      {Array.from({ length: 16 }).map((_, j) => <Skeleton key={j} className="aspect-square rounded-xl bg-white/5" />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                {[1,2,3].map(i => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-5 w-40 rounded bg-white/5" />
                    <div className="flex gap-3 overflow-hidden">
                      {Array.from({ length: 6 }).map((_, j) => <div key={j} className="flex-shrink-0 w-44 space-y-2"><Skeleton className="aspect-video rounded-xl bg-white/5" /><Skeleton className="h-3 w-3/4 rounded bg-white/5" /></div>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'channels' ? (
          <div className="px-4 sm:px-6 py-6 space-y-6">
            {channelRows.length === 0 ? (
              <div className="py-20 text-center text-white/30"><Tv className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-lg">Sin canales disponibles</p></div>
            ) : (
              channelRows.map((row, rIdx) => (
                <section key={row.id} ref={(el) => { rowRefs.current[rIdx] = el; }}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-sm sm:text-base font-semibold text-white/70">{row.title}</h2>
                    <span className="text-xs text-white/25">{row.items.length}</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 sm:gap-2.5">
                    {row.items.map((ch, cIdx) => (
                      <ChannelCard key={ch.id} ch={ch} onClick={() => playItem(ch as ContentItem)} focused={zone === 'rows' && rowIndex === rIdx && colIndex === cIdx} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        ) : activeTab === 'series' ? (
          <div className="px-4 sm:px-6 py-5 space-y-6">
            {seriesRows.length === 0 ? (
              <div className="py-20 text-center text-white/30"><Tv2 className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-lg">{searchQuery ? 'Sin resultados' : 'No hay series disponibles'}</p></div>
            ) : (
              seriesRows.map((row, rIdx) => (
                <section key={row.id} ref={(el) => { rowRefs.current[rIdx] = el; }}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-sm sm:text-base font-semibold text-white/70">{row.title}</h2>
                    <span className="text-xs text-white/25">{row.items.length}</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                    {row.items.map((s, cIdx) => (
                      <SeriesCard
                        key={s.id}
                        series={s}
                        onClick={() => playSeriesItem(s)}
                        focused={zone === 'rows' && rowIndex === rIdx && colIndex === cIdx}
                        onHover={() => setHoveredHero({ id: s.id, title: s.title, description: s.description, banner: s.banner, poster: s.poster, category: s.category, genre: s.genre, year: s.year, type: 'series' })}
                        onHoverEnd={() => setHoveredHero(null)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        ) : (
          // Home + Movies tab
          <div className="px-4 sm:px-6 py-5 space-y-6">
            {contentRows.length === 0 ? (
              <div className="py-20 text-center text-white/30">
                <p className="text-lg sm:text-xl">Sin resultados</p>
                {searchQuery && <p className="text-sm mt-1 text-white/20">Prueba con otro término</p>}
              </div>
            ) : (
              contentRows.map((row, rIdx) => {
                if (row.id === 'continue') {
                  return (
                    <section key="continue" ref={(el) => { rowRefs.current[rIdx] = el; }}>
                      <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-sm sm:text-base font-semibold text-white/70">Seguir viendo</h2>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                        {combinedContinueWatching.map((item, cIdx) => (
                          <ContinueWatchingCard
                            key={`${item.type}-${item.id}`}
                            item={item}
                            focused={zone === 'rows' && rowIndex === rIdx && colIndex === cIdx}
                            onClick={() => {
                              if (isExpired) { setShowExpiredOverlay(true); return; }
                              if (item.type === 'series') setLocation(`/serie/${item.id}`);
                              else setLocation(`/pelicula/${item.id}`);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  );
                }
                return (
                  <ContentRow
                    key={row.id}
                    sectionRef={(el) => { rowRefs.current[rIdx] = el; }}
                    title={row.title}
                    emoji={row.emoji}
                    items={row.items}
                    focusedIndex={colIndex}
                    isFocusedRow={zone === 'rows' && rowIndex === rIdx}
                    onItemClick={playItem}
                    onFavoriteToggle={doToggleFav}
                    progressMap={progressMap}
                    favSet={favSet}
                    isNewFn={row.showBadge ? isNew : undefined}
                    showProgress={row.showProgress}
                    portrait={true}
                    onHoverItem={(item) => setHoveredHero(item ? { ...item, type: 'movie' } : null)}
                  />
                );
              })
            )}
          </div>
        )}
      </main>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/98 border-t border-white/8 flex items-stretch">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setRowIndex(0); setColIndex(0); setZone('rows'); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-all ${isActive ? 'text-white' : 'text-white/35 hover:text-white/60'}`}
            >
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-orange-400' : ''}`} />
              <span className="text-[9px] font-medium">{item.label}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-orange-400" />}
            </button>
          );
        })}
        <button onClick={handleLogout} className="flex-1 flex flex-col items-center gap-1 py-2.5 text-white/25 hover:text-white/50 transition-colors">
          <LogOut className="w-5 h-5" />
          <span className="text-[9px] font-medium">Salir</span>
        </button>
      </nav>

      {/* ── MODALS ── */}
      {showProfile && <ProfileEditor session={session ?? null} avatars={avatars} onClose={() => setShowProfile(false)} onSave={handleSaveProfile} />}

      {showHint && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-4" onClick={() => setShowHint(false)}>
          <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {isIosSafari ? (
              <>
                <div className="flex items-center gap-3"><Share2 className="w-6 h-6 text-primary flex-shrink-0" /><h2 className="text-base font-bold text-white">Instalar en iPhone / iPad</h2></div>
                <ol className="space-y-2 text-sm text-white/60 list-none">
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">1.</span>Toca el botón <strong className="text-white mx-1">Compartir</strong><Share2 className="inline w-4 h-4 mx-0.5 flex-shrink-0" /> en Safari</li>
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">2.</span>Toca <strong className="text-white">"Agregar a pantalla de inicio"</strong></li>
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">3.</span>Toca <strong className="text-white">Agregar</strong></li>
                </ol>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3"><Download className="w-6 h-6 text-primary flex-shrink-0" /><h2 className="text-base font-bold text-white">Instalar la aplicación</h2></div>
                <p className="text-sm text-white/60">Para instalar, abre en <strong className="text-white">Chrome</strong> o <strong className="text-white">Edge</strong> y vuelve a tocar el botón de instalar.</p>
              </>
            )}
            <button onClick={() => setShowHint(false)} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">Entendido</button>
          </div>
        </div>
      )}

      {showShortcutHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowShortcutHint(false)}>
          <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white">Acceso directo al escritorio</h2>
            <p className="text-sm text-white/60">En tu navegador, busca la opción "Agregar a pantalla de inicio" o "Instalar aplicación" para crear un acceso directo.</p>
            <button onClick={() => setShowShortcutHint(false)} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}
