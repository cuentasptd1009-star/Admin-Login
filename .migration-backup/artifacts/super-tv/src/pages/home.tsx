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
import { useQueryClient } from '@tanstack/react-query';
import { clearTokens, getToken } from '@/lib/auth';
import { setMiniPlayerState, updateMiniPlayerState, getMiniPlayerState, subscribeMiniPlayer } from '@/lib/mini-player-state';
import { useTvKeyboard } from '@/hooks/use-tv-keyboard';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, LogOut, Search, Tv, Film, Tv2, X, Download, Share2, UserCircle2, AlertTriangle, Lock, Mic, MicOff, Home as HomeIcon, Smartphone } from 'lucide-react';
import { getFavorites, getAllProgress, getHistory, toggleFavorite, getAllSeriesProgress } from '@/lib/user-data';
import { useVoiceSearch } from '@/hooks/use-voice-search';
import logo from '@assets/imagen_1777670460131.png';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { ContentRow, isChannel } from '@/components/ContentRow';
import type { ContentItem } from '@/components/ContentRow';
import { ProfileEditor } from '@/components/ProfileEditor';
import { HeroBanner, type HeroBannerItem } from '@/components/HeroBanner';
import { fetchSeries, type SeriesItem } from '@/lib/api';

type TabKey = 'channels' | 'movies' | 'series';
type NavZone = 'tabs' | 'search' | 'mic' | 'actions' | 'rows' | 'miniplayer';

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

function SeriesCard({ series, onClick, focused }: { series: SeriesItem; onClick: () => void; focused?: boolean }) {
  return (
    <div
      onClick={onClick}
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
          <span className="px-1.5 py-0.5 bg-primary/90 text-primary-foreground text-[9px] font-bold rounded uppercase tracking-wider">Serie</span>
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
      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl cursor-pointer border transition-all duration-200 ${focused ? 'border-primary ring-2 ring-primary bg-primary/5 scale-105 shadow-[0_0_12px_rgba(220,38,38,0.4)] z-10' : 'border-border bg-card hover:border-primary/50 hover:bg-card/80 hover:scale-[1.03]'}`}
    >
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
        {ch.logo ? (
          <img src={ch.logo} alt={ch.name} className="w-full h-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted-foreground/40"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg></div>`; }} />
        ) : (
          <Tv className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/40" />
        )}
      </div>
      <p className="text-[10px] sm:text-xs text-center leading-tight w-full truncate px-0.5">{ch.name}</p>
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
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(() => {
    try { return localStorage.getItem('supertv_expiry_dismissed') === new Date().toDateString(); } catch { return false; }
  });

  const initialTab = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('tab');
      if (t === 'movies') return 'movies';
      if (t === 'series') return 'series';
      return 'channels';
    } catch { return 'channels'; }
  })() as TabKey;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [zone, setZone] = useState<NavZone>('rows');
  const [tabIndex, setTabIndex] = useState(() => initialTab === 'movies' ? 1 : initialTab === 'series' ? 2 : 0);
  const [rowIndex, setRowIndex] = useState(0);
  const [colIndex, setColIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { key: 'channels' as TabKey, label: 'Canales', icon: Tv },
    { key: 'movies' as TabKey, label: 'Películas', icon: Film },
    { key: 'series' as TabKey, label: 'Series', icon: Tv2 },
  ];

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
    if (activeTab !== 'series' || seriesList.length > 0) return;
    setSeriesLoading(true);
    fetchSeries().then(s => { setSeriesList(s); setSeriesLoading(false); }).catch(() => setSeriesLoading(false));
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
    if (activeTab === 'movies') {
      const anyMovies = movies as any[];
      const featured = anyMovies.filter(m => m.featured).slice(0, 5);
      const source = featured.length >= 2 ? featured : anyMovies.slice(0, 5);
      return source.map(m => ({ id: m.id, title: m.title, description: m.description, banner: m.banner, poster: m.poster, category: m.category, genre: m.genre, year: m.year, type: 'movie' as const }));
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
  }, [searchQuery, activeTab, allChannels, movies, moviesByCategory, continueWatching, recentMovies, recommendations, favoriteMovies]);

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
    ...(showInstallButton ? [{ key: 'install', label: 'Instalar APK Android', action: handleInstall, icon: Download }] : []),
    { key: 'shortcut', label: 'Acceso directo', action: handleShortcut, icon: Smartphone },
    { key: 'logout', label: 'Salir', action: handleLogout, icon: LogOut },
  ], [session, showInstallButton, openProfile, handleInstall, handleLogout]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showProfile || showHint || showShortcutHint) return;
      const isInputFocused = document.activeElement === searchRef.current;
      if (isInputFocused) {
        if (['Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { searchRef.current?.blur(); } else { return; }
      }
      if (zone === 'tabs') {
        switch (e.key) {
          case 'ArrowRight': e.preventDefault(); if (tabIndex < tabs.length - 1) setTabIndex(p => p + 1); else setZone('search'); break;
          case 'ArrowLeft': e.preventDefault(); setTabIndex(p => Math.max(p - 1, 0)); break;
          case 'Enter': e.preventDefault(); setActiveTab(tabs[tabIndex].key); setRowIndex(0); setColIndex(0); break;
          case 'ArrowDown': e.preventDefault(); setZone('rows'); setRowIndex(0); setColIndex(0); break;
        }
      } else if (zone === 'search') {
        switch (e.key) {
          case 'ArrowLeft': e.preventDefault(); setZone('tabs'); break;
          case 'ArrowRight': e.preventDefault(); if (voiceSupported) setZone('mic'); else { setActionIndex(0); setZone('actions'); } break;
          case 'Enter': e.preventDefault(); openKeyboard(searchRef.current, { value: searchQuery, onChange: (v) => { setSearchQuery(v); setRowIndex(0); setColIndex(0); }, label: 'Buscar...' }); break;
          case 'ArrowDown': e.preventDefault(); setZone('rows'); setRowIndex(0); setColIndex(0); break;
          case 'Escape': case 'Backspace': e.preventDefault(); setZone('tabs'); break;
        }
      } else if (zone === 'mic') {
        switch (e.key) {
          case 'ArrowLeft': e.preventDefault(); setZone('search'); break;
          case 'ArrowRight': e.preventDefault(); setActionIndex(0); setZone('actions'); break;
          case 'ArrowDown': e.preventDefault(); setZone('rows'); setRowIndex(0); setColIndex(0); break;
          case 'ArrowUp': e.preventDefault(); setZone('tabs'); break;
          case 'Enter': e.preventDefault(); if (isListening) stopListening(); else startListening(); break;
          case 'Escape': case 'Backspace': e.preventDefault(); setZone('search'); break;
        }
      } else if (zone === 'actions') {
        switch (e.key) {
          case 'ArrowLeft': e.preventDefault(); if (actionIndex > 0) setActionIndex(p => p - 1); else if (voiceSupported) setZone('mic'); else setZone('search'); break;
          case 'ArrowRight': e.preventDefault(); if (actionIndex < actionButtons.length - 1) setActionIndex(p => p + 1); break;
          case 'Enter': e.preventDefault(); actionButtons[actionIndex]?.action(); break;
          case 'ArrowDown': {
            e.preventDefault();
            const _mini = getMiniPlayerState();
            if (_mini?.isMinimized) { updateMiniPlayerState({ isFocused: true }); setZone('miniplayer'); } else { setZone('rows'); setRowIndex(0); setColIndex(0); }
            break;
          }
          case 'Escape': case 'Backspace': e.preventDefault(); setZone('search'); break;
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
        const currentRow = activeRows[rowIndex];
        const currentLen = currentRow?.items?.length ?? 0;
        switch (e.key) {
          case 'ArrowRight': e.preventDefault(); setColIndex(p => Math.min(p + 1, currentLen - 1)); break;
          case 'ArrowLeft': e.preventDefault(); setColIndex(p => Math.max(p - 1, 0)); break;
          case 'ArrowDown': e.preventDefault(); if (rowIndex < activeRows.length - 1) { setRowIndex(p => p + 1); setColIndex(0); } else { const _mini = getMiniPlayerState(); if (_mini?.isMinimized) { updateMiniPlayerState({ isFocused: true }); setZone('miniplayer'); } } break;
          case 'ArrowUp': e.preventDefault(); if (rowIndex > 0) { setRowIndex(p => p - 1); setColIndex(0); } else setZone('tabs'); break;
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
          case 'Escape': case 'Backspace': e.preventDefault(); setZone('tabs'); break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zone, tabIndex, rowIndex, colIndex, actionIndex, activeRows, seriesRows, activeTab, playItem, playSeriesItem, tabs, actionButtons, showProfile, showHint, voiceSupported, isListening, startListening, stopListening]);

  const isLoading = channelsLoading || moviesLoading || (activeTab === 'series' && seriesLoading);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col select-none">
      {isExpired && showExpiredOverlay && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center gap-6 text-center px-6">
          <button onClick={() => setShowExpiredOverlay(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center"><Lock className="w-10 h-10 text-destructive" /></div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Acceso vencido</h2>
              <p className="text-muted-foreground max-w-xs">Tu código venció. Para renovarlo, contacta a tu proveedor.</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">Cerrar sesión</button>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-3 sm:px-4 py-2 sm:py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-2 sm:gap-4">
          <img src={logo} alt="Super TV" className="h-7 sm:h-9 w-auto flex-shrink-0" />
          <div className="flex items-center gap-0.5 sm:gap-1">
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const focused = zone === 'tabs' && tabIndex === i;
              return (
                <button key={tab.key} onClick={() => { setActiveTab(tab.key); setTabIndex(i); setRowIndex(0); setColIndex(0); setZone('rows'); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'} ${focused ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 max-w-xs flex flex-col gap-1">
            <div className={`relative ${zone === 'search' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-md' : ''}`}>
              {isListening ? <span className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /></span> : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground z-10" />}
              <Input ref={searchRef} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setRowIndex(0); setColIndex(0); }} onFocus={() => setZone('search')} placeholder={isListening ? 'Escuchando...' : 'Buscar...'} className={`pl-8 sm:pl-9 h-8 sm:h-9 bg-card border-border text-xs sm:text-sm ${voiceSupported ? 'pr-14 sm:pr-16' : 'pr-7 sm:pr-8'} ${isListening ? 'border-red-500/60 ring-1 ring-red-500/40' : ''}`} />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
                {searchQuery && !isListening && <button onClick={() => setSearchQuery('')} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>}
                {voiceSupported && <button onClick={() => isListening ? stopListening() : startListening()} className={`p-1.5 rounded-md transition-all ${zone === 'mic' ? 'ring-2 ring-primary bg-primary/10 text-primary scale-110' : isListening ? 'text-red-400 hover:text-red-300' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{isListening ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}</button>}
              </div>
            </div>
            {voiceError && <p className="text-[10px] text-red-400 px-1">{voiceError}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="text-right hidden md:block mr-1">
              <p className="text-sm font-medium leading-tight">{session?.displayName || session?.codeName || 'Usuario'}</p>
              {session?.expiresAt && <p className="text-xs text-muted-foreground">Vence: {(() => { const d = new Date(session.expiresAt!); const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']; return `${String(d.getDate()).padStart(2,'0')} de ${months[d.getMonth()]} ${d.getFullYear()}`; })()}</p>}
            </div>
            {session?.type === 'user' && (
              <button onClick={openProfile} className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 transition-all flex-shrink-0 ${zone === 'actions' && actionIndex === 0 && actionButtons[0]?.key === 'profile' ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border hover:border-primary'}`}>
                {session?.avatarUrl ? <img src={session.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <UserCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />}
              </button>
            )}
            {actionButtons.filter(b => b.key !== 'profile').map((btn) => {
              const Icon = btn.icon;
              const globalIdx = actionButtons.findIndex(b => b.key === btn.key);
              const focused = zone === 'actions' && actionIndex === globalIdx;
              const isLogout = btn.key === 'logout';
              return (
                <button key={btn.key} onClick={btn.action} title={btn.label} className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${isLogout ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10' : 'text-primary hover:bg-primary/10 border border-primary/30'} ${focused ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {showExpiryBanner && (
        <div className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-b ${daysLeft !== null && daysLeft <= 0 ? 'bg-destructive/15 border-destructive/40 text-destructive' : daysLeft === 1 ? 'bg-orange-500/15 border-orange-500/40 text-orange-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'}`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-xs sm:text-sm">{daysLeft !== null && daysLeft <= 0 ? 'Tu código venció. Contacta a tu proveedor para activarlo.' : daysLeft === 1 ? 'Tu acceso vence hoy. Contacta a tu proveedor para renovarlo.' : `Tu acceso vence en ${daysLeft} días. Contacta a tu proveedor para renovarlo.`}</span>
          <button onClick={dismissExpiryBanner} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
        </div>
      )}

      <main ref={mainRef} className="flex-1 overflow-y-auto">
        {combinedContinueWatching.length > 0 && !searchQuery && (
          <div className="px-3 sm:px-4 pt-4 pb-1 max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-primary rounded-full flex-shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">Continuar viendo</h2>
              <span className="ml-1 text-[11px] font-normal text-muted-foreground/50">{combinedContinueWatching.length}</span>
            </div>
            <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-3 scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingLeft: '2px', paddingRight: '2px' }}>
              {combinedContinueWatching.map((item) => (
                <ContinueWatchingCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  onClick={() => {
                    if (isExpired) { setShowExpiredOverlay(true); return; }
                    if (item.type === 'series') setLocation(`/serie/${item.id}`);
                    else setLocation(`/pelicula/${item.id}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="px-3 sm:px-4 py-4 sm:py-5 space-y-8 max-w-screen-2xl mx-auto">
            {activeTab === 'channels' ? (
              <div className="space-y-6">
                {[1,2,3].map(i => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-5 w-32 rounded bg-card" />
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                      {Array.from({ length: 16 }).map((_, j) => <Skeleton key={j} className="aspect-square rounded-xl bg-card" />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                <Skeleton className="w-full rounded-xl bg-card" style={{ aspectRatio: '16/7', maxHeight: '520px' }} />
                {[1,2,3].map(i => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-5 w-40 rounded bg-card" />
                    <div className="flex gap-3 overflow-hidden">
                      {Array.from({ length: 6 }).map((_, j) => <div key={j} className="flex-shrink-0 w-36 sm:w-40 space-y-2"><Skeleton className="aspect-video rounded-lg bg-card" /><Skeleton className="h-3 w-3/4 rounded bg-card" /></div>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'channels' ? (
          <div className="px-3 sm:px-4 py-4 sm:py-5 pb-16 space-y-6 max-w-screen-2xl mx-auto">
            {channelRows.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground"><Tv className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-lg">Sin canales</p></div>
            ) : (
              channelRows.map((row, rIdx) => (
                <section key={row.id} ref={(el) => { rowRefs.current[rIdx] = el; }}>
                  <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-0.5">{row.title} <span className="text-muted-foreground/50 font-normal">({row.items.length})</span></h2>
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
          <div className="pb-16">
            {!searchQuery && heroBannerItems.length > 0 && (
              <HeroBanner items={heroBannerItems} onPlay={playHeroBannerItem} onInfo={(item) => setLocation(`/serie/${item.id}`)} />
            )}
            <div className="px-3 sm:px-4 py-4 sm:py-5 space-y-6 max-w-screen-2xl mx-auto">
              {seriesRows.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground"><Tv2 className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-lg">{searchQuery ? 'Sin resultados' : 'No hay series disponibles'}</p></div>
              ) : (
                seriesRows.map((row, rIdx) => (
                  <section key={row.id} ref={(el) => { rowRefs.current[rIdx] = el; }}>
                    <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <span>{row.title}</span>
                      <span className="text-xs text-muted-foreground/60 font-normal">({row.items.length})</span>
                    </h2>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {row.items.map((s, cIdx) => (
                        <SeriesCard key={s.id} series={s} onClick={() => playSeriesItem(s)} focused={zone === 'rows' && rowIndex === rIdx && colIndex === cIdx} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="pb-16">
            {!searchQuery && heroBannerItems.length > 0 && (
              <HeroBanner items={heroBannerItems} onPlay={playHeroBannerItem} onInfo={(item) => setLocation(`/pelicula/${item.id}`)} />
            )}
            <div className="px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-6 max-w-screen-2xl mx-auto">
              {contentRows.length === 0 ? (
                <div className="py-20 sm:py-32 text-center text-muted-foreground"><p className="text-lg sm:text-xl">Sin resultados</p>{searchQuery && <p className="text-sm mt-1">Prueba con otro término</p>}</div>
              ) : (
                contentRows.map((row, rIdx) => (
                  <ContentRow key={row.id} sectionRef={(el) => { rowRefs.current[rIdx] = el; }} title={row.title} emoji={row.emoji} items={row.items} focusedIndex={colIndex} isFocusedRow={zone === 'rows' && rowIndex === rIdx} onItemClick={playItem} onFavoriteToggle={doToggleFav} progressMap={progressMap} favSet={favSet} isNewFn={row.showBadge ? isNew : undefined} showProgress={row.showProgress} />
                ))
              )}
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] text-muted-foreground/40 pointer-events-none whitespace-nowrap">
        Flechas para navegar · Enter para reproducir · Esc para subir
      </div>

      {showProfile && <ProfileEditor session={session ?? null} avatars={avatars} onClose={() => setShowProfile(false)} onSave={handleSaveProfile} />}

      {showHint && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setShowHint(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {isIosSafari ? (
              <>
                <div className="flex items-center gap-3"><Share2 className="w-6 h-6 text-primary flex-shrink-0" /><h2 className="text-base font-bold">Instalar en iPhone / iPad</h2></div>
                <ol className="space-y-2 text-sm text-muted-foreground list-none">
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">1.</span>Toca el botón <strong className="text-foreground mx-1">Compartir</strong><Share2 className="inline w-4 h-4 mx-0.5 flex-shrink-0" /> en la barra de Safari</li>
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">2.</span>Toca <strong className="text-foreground">"Agregar a pantalla de inicio"</strong></li>
                  <li className="flex items-start gap-2"><span className="text-primary font-bold">3.</span>Toca <strong className="text-foreground">Agregar</strong> para confirmar</li>
                </ol>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3"><Download className="w-6 h-6 text-primary flex-shrink-0" /><h2 className="text-base font-bold">Instalar la aplicación</h2></div>
                <p className="text-sm text-muted-foreground">Para instalar, abre en <strong className="text-foreground">Chrome</strong> o <strong className="text-foreground">Edge</strong> y vuelve a tocar el botón de instalar.</p>
              </>
            )}
            <button onClick={() => setShowHint(false)} className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}
