import { useLocation, useRoute } from 'wouter';
import { useListMovies, getListMoviesQueryKey, useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { Play, ArrowLeft, Film, Tag, AlignLeft, Search, X, Lock, Heart } from 'lucide-react';
import { getProgress, toggleFavorite, getFavorites } from '@/lib/user-data';
import { clearTokens } from '@/lib/auth';
import { useEffect, useState, useMemo } from 'react';
import logo from '@assets/imagen_1777670460131.png';

function formatProgress(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MovieDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/pelicula/:id');
  const id = Number(params?.id);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const { data: session, isError: sessionError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const { data: movies, isLoading } = useListMovies(undefined, {
    query: { queryKey: getListMoviesQueryKey() },
  });

  useEffect(() => {
    if (sessionError) { clearTokens(); setLocation('/'); }
  }, [sessionError, setLocation]);

  const movie = movies?.find(m => m.id === id);

  useEffect(() => {
    if (movie?.category) setFilterCat(movie.category);
    else setFilterCat(null);
    setSearch('');
  }, [id, movie?.category]);

  const categories = useMemo(() => {
    if (!movies) return [];
    const cats = new Set(movies.map(m => m.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [movies]);

  const related = useMemo(() => {
    if (!movies) return [];
    const q = search.toLowerCase();
    return movies.filter(m => {
      if (m.id === id) return false;
      if (filterCat && m.category !== filterCat) return false;
      if (q && !m.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [movies, id, filterCat, search]);

  const daysLeft = (() => {
    if (!session?.expiresAt) return null;
    const diff = new Date(session.expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();
  const isExpired = session?.type === 'user' && daysLeft !== null && daysLeft <= 0;
  const [showExpiredOverlay, setShowExpiredOverlay] = useState(true);
  const [isFav, setIsFav] = useState(() => getFavorites().includes(id));
  const savedProgress = movie ? getProgress(id) : null;

  useEffect(() => {
    if (isExpired) setShowExpiredOverlay(true);
  }, [isExpired]);

  const handlePlay = (startFrom?: number) => {
    if (isExpired) { setShowExpiredOverlay(true); return; }
    if (!movie) return;
    const base = `/player?url=${encodeURIComponent(movie.filePath)}&title=${encodeURIComponent(movie.title)}&type=movie&movieId=${movie.id}&category=${encodeURIComponent(movie.category || '')}`;
    setLocation(startFrom !== undefined ? `${base}&startFrom=${startFrom}` : base);
  };

  const handleToggleFav = () => {
    const added = toggleFavorite(id);
    setIsFav(added);
  };

  const handleBack = () => setLocation('/home?tab=movies');

  const handleRelatedClick = (relId: number) => {
    setLocation(`/pelicula/${relId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <Film className="w-16 h-16 text-muted-foreground/30" />
        <p className="text-muted-foreground">Película no encontrada</p>
        <button onClick={handleBack} className="text-primary text-sm hover:underline">Volver al inicio</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-3">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Volver</span>
        </button>
        <img src={logo} alt="Super TV" className="h-7 sm:h-8 w-auto" />
        <div className="ml-auto text-right hidden md:block">
          <p className="text-sm font-medium leading-tight">{session?.codeName || ''}</p>
          {session?.expiresAt && (
            <p className="text-xs text-muted-foreground">Vence: {new Date(session.expiresAt).toLocaleDateString('es-ES')}</p>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:py-10 space-y-10">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <div className="w-44 sm:w-52 md:w-60 rounded-2xl overflow-hidden shadow-2xl border border-border bg-card aspect-[2/3] flex items-center justify-center">
              {movie.poster ? (
                <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <Film className="w-16 h-16 text-muted-foreground/30" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight">{movie.title}</h1>

            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              {movie.category && (
                <span className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20">
                  <Tag className="w-3 h-3" />
                  {movie.category}
                </span>
              )}
            </div>

            {movie.description && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground justify-center sm:justify-start">
                  <AlignLeft className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wide">Sinopsis</span>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{movie.description}</p>
              </div>
            )}

            <div className="mt-2 sm:mt-4 space-y-2">
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {savedProgress && savedProgress.time > 10 ? (
                  <>
                    <button
                      onClick={() => handlePlay(savedProgress.time)}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 active:scale-95"
                    >
                      {isExpired ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                      {isExpired ? 'Acceso vencido' : `Continuar (${formatProgress(savedProgress.time)})`}
                    </button>
                    <button
                      onClick={() => handlePlay(0)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary text-secondary-foreground rounded-xl font-semibold text-sm hover:bg-secondary/80 transition-all active:scale-95"
                    >
                      <Play className="w-4 h-4" />
                      Desde el inicio
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handlePlay()}
                    className="flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 active:scale-95 w-full sm:w-auto"
                  >
                    {isExpired ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                    {isExpired ? 'Acceso vencido' : 'Reproducir'}
                  </button>
                )}
                <button
                  onClick={handleToggleFav}
                  title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 border ${
                    isFav
                      ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
                      : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-red-400 text-red-400' : ''}`} />
                  {isFav ? 'En favoritos' : 'Favorito'}
                </button>
              </div>

              {savedProgress && savedProgress.duration > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (savedProgress.time / savedProgress.duration) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatProgress(savedProgress.time)} / {formatProgress(savedProgress.duration)}
                  </span>
                </div>
              )}
            </div>

            {isExpired && showExpiredOverlay && (
              <div className="mt-3 relative flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <Lock className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive flex-1">
                  Tu código venció. Contacta a tu proveedor para activarlo.
                </p>
                <button onClick={() => setShowExpiredOverlay(false)} className="text-destructive/60 hover:text-destructive transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {(movies?.length ?? 0) > 1 && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-lg font-semibold flex-1">
                {filterCat ? `Más en "${filterCat}"` : 'Más películas'}
              </h2>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilterCat(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${!filterCat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                >
                  Todas
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(cat === filterCat ? null : cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCat === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar película..."
                  className="pl-8 pr-8 py-1.5 text-sm bg-card border border-border rounded-lg w-full sm:w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {related.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No hay más películas{search ? ` con "${search}"` : ''} en esta categoría</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {related.map(mv => (
                  <div
                    key={mv.id}
                    onClick={() => handleRelatedClick(mv.id)}
                    className="group flex flex-col bg-card rounded-xl overflow-hidden cursor-pointer hover:scale-105 hover:ring-1 hover:ring-border transition-all duration-200"
                  >
                    <div className="aspect-video bg-muted relative flex items-center justify-center overflow-hidden">
                      {mv.poster ? (
                        <img src={mv.poster} alt={mv.title} className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Film className="w-8 h-8 text-muted-foreground/30" />
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-8 h-8 text-white drop-shadow" />
                      </div>
                      {mv.category && (
                        <span className="absolute top-1 right-1 bg-black/60 px-1.5 py-0.5 text-[9px] rounded text-white/80">{mv.category}</span>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <h3 className="font-medium text-xs truncate leading-tight">{mv.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
