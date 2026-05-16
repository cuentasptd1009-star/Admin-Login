import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, ArrowLeft, Maximize2, Minimize2, SkipBack, SkipForward, Heart, ChevronRight } from 'lucide-react';
import { loadYouTubeApi } from '@/lib/youtube-api';
import { saveProgress, saveEpisodeProgress } from '@/lib/user-data';
import logo from '@assets/imagen_1777670460131.png';

interface Props {
  videoId: string;
  title: string;
  onBack: () => void;
  isFav?: boolean;
  onFavToggle?: () => void;
  movieId?: number;
  startFrom?: number;
  // Episode-specific (for series)
  episodeId?: number;
  seriesId?: number;
  seasonId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  // Next episode
  nextEpisodeId?: number;
  nextEpisodeTitle?: string;
  nextEpisodeNumber?: number;
  nextSeasonNumber?: number;
  seriesTitle?: string;
  onNextEpisode?: () => void;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function YouTubePlayerPage({ videoId, title, onBack, isFav, onFavToggle, movieId, startFrom, episodeId, seriesId, seasonId, seasonNumber, episodeNumber, nextEpisodeId, nextEpisodeTitle, nextEpisodeNumber, nextSeasonNumber, seriesTitle, onNextEpisode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ctrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSaveRef = useRef(0);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ytEnded, setYtEnded] = useState(false);
  const [endBtnIndex, setEndBtnIndex] = useState(0);
  const [ctrlVisible, setCtrlVisible] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showNextEp, setShowNextEp] = useState(false);

  const isFullscreen = isNativeFullscreen || isCssFullscreen;

  const flashControls = useCallback(() => {
    setCtrlVisible(true);
    if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
    ctrlTimerRef.current = setTimeout(() => setCtrlVisible(false), 3500);
  }, []);

  // Poll current time while playing + save progress every ~5s
  useEffect(() => {
    if (isPlaying) {
      pollRef.current = setInterval(() => {
        const yt = ytPlayerRef.current;
        if (!yt) return;
        const t = yt.getCurrentTime?.() ?? 0;
        const d = yt.getDuration?.() ?? 0;
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        // Show next episode button 10 seconds before the end
        if (nextEpisodeId && d > 30 && d - t <= 10 && t > 0) {
          setShowNextEp(true);
        }
        // Save progress every 5 seconds
        if (t > 10 && t - lastSaveRef.current >= 5) {
          lastSaveRef.current = t;
          if (episodeId && seriesId && seasonId) {
            saveEpisodeProgress(seriesId, seasonId, seasonNumber ?? 1, episodeId, episodeNumber ?? 1, t, d, title);
          } else if (movieId) {
            saveProgress(movieId, t, d);
          }
        }
      }, 500);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isPlaying, movieId, episodeId, seriesId, seasonId, seasonNumber, episodeNumber, title]);

  useEffect(() => {
    let destroyed = false;

    loadYouTubeApi(() => {
      if (destroyed || !playerDivRef.current) return;
      ytPlayerRef.current = new (window as any).YT.Player(playerDivRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          showinfo: 0,
          playsinline: 1,
          fs: 0,
        },
        events: {
          onReady: (e: any) => {
            if (!destroyed) {
              const d = e.target.getDuration?.() ?? 0;
              if (d > 0) setDuration(d);
              setHasStarted(true);
              e.target.playVideo();
              if (startFrom && startFrom > 10) {
                e.target.seekTo(startFrom, true);
              }
            }
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            if (e.data === 1) {
              setIsPlaying(true);
              setHasStarted(true);
              setYtEnded(false);
              const d = ytPlayerRef.current?.getDuration?.() ?? 0;
              if (d > 0) setDuration(d);
            }
            if (e.data === 2) setIsPlaying(false);
            if (e.data === 0) {
              setIsPlaying(false);
              setYtEnded(true);
              if (nextEpisodeId) setShowNextEp(true);
              // Clear saved progress when video finishes
              if (episodeId) {
                try { localStorage.removeItem(`supertv_eprog_${episodeId}`); } catch {}
              } else if (movieId) {
                try { localStorage.removeItem(`supertv_prog_${movieId}`); } catch {}
              }
            }
          },
        },
      });
    });

    // Auto enter native fullscreen on mount (fall back to CSS which is already default)
    const el = containerRef.current as any;
    if (el?.requestFullscreen) {
      el.requestFullscreen().then(() => {
        setIsCssFullscreen(false);
      }).catch(() => {
        setIsCssFullscreen(true);
      });
    } else if (el?.webkitRequestFullscreen) {
      try { el.webkitRequestFullscreen(); setIsCssFullscreen(false); } catch { setIsCssFullscreen(true); }
    }

    flashControls();

    return () => {
      destroyed = true;
      try { ytPlayerRef.current?.destroy(); } catch {}
      ytPlayerRef.current = null;
      if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track native browser fullscreen state
  useEffect(() => {
    const handler = () => setIsNativeFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const yt = ytPlayerRef.current;
    if (!yt) return;
    if (isPlaying) { yt.pauseVideo(); } else { yt.playVideo(); setHasStarted(true); }
    flashControls();
  }, [isPlaying, flashControls]);

  const skip = useCallback((secs: number) => {
    const yt = ytPlayerRef.current;
    if (!yt) return;
    const dur = yt.getDuration?.() ?? duration;
    const cur = yt.getCurrentTime?.() ?? currentTime;
    const newTime = Math.max(0, Math.min(dur, cur + secs));
    yt.seekTo(newTime, true);
    setCurrentTime(newTime);
    flashControls();
  }, [currentTime, duration, flashControls]);

  const handleSeekClick = useCallback((clientX: number, rect: DOMRect) => {
    const yt = ytPlayerRef.current;
    if (!yt || duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    yt.seekTo(newTime, true);
    setCurrentTime(newTime);
    flashControls();
  }, [duration, flashControls]);

  // iOS-safe fullscreen: try native API, fall back to CSS
  const doToggleFullscreen = useCallback(() => {
    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      return;
    }
    if (isNativeFullscreen) {
      try { document.exitFullscreen?.(); } catch {}
      try { (document as any).webkitExitFullscreen?.(); } catch {}
      return;
    }
    const el = containerRef.current as any;
    if (!el) { setIsCssFullscreen(true); return; }
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setIsCssFullscreen(true));
    } else if (el.webkitRequestFullscreen) {
      try { el.webkitRequestFullscreen(); } catch { setIsCssFullscreen(true); }
    } else {
      setIsCssFullscreen(true);
    }
  }, [isCssFullscreen, isNativeFullscreen]);

  const toggleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    doToggleFullscreen();
  }, [doToggleFullscreen]);

  const startPlayback = useCallback(() => {
    ytPlayerRef.current?.playVideo();
    setHasStarted(true);
    flashControls();
  }, [flashControls]);

  // Keyboard navigation - TV remote friendly
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (ytEnded) { setEndBtnIndex(0); } else { skip(-10); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (ytEnded) { setEndBtnIndex(1); } else { skip(10); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!ytEnded) skip(30);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!ytEnded) skip(-30);
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (showNextEp && !ytEnded && onNextEpisode) {
            onNextEpisode();
          } else if (ytEnded) {
            if (showNextEp && onNextEpisode) {
              onNextEpisode();
            } else if (endBtnIndex === 0) {
              ytPlayerRef.current?.seekTo(0, true);
              ytPlayerRef.current?.playVideo();
              setHasStarted(true);
              setYtEnded(false);
            } else {
              onBack();
            }
          } else if (!hasStarted) {
            startPlayback();
          } else {
            togglePlay();
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          doToggleFullscreen();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          if (isNativeFullscreen) {
            try { document.exitFullscreen?.(); } catch {}
          } else if (isCssFullscreen) {
            setIsCssFullscreen(false);
            onBack();
          } else {
            onBack();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytEnded, endBtnIndex, hasStarted, showNextEp, skip, togglePlay, startPlayback, doToggleFullscreen, isNativeFullscreen, isCssFullscreen, onBack, onNextEpisode]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const ctrlBtn = 'w-11 h-11 rounded-xl bg-black/50 backdrop-blur border border-white/15 text-white flex items-center justify-center active:scale-95 transition-all';

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden ${isCssFullscreen ? 'fixed inset-0 z-[9999]' : 'h-screen'}`}
      onMouseMove={() => { if (hasStarted) flashControls(); }}
      onTouchStart={() => { if (hasStarted) flashControls(); }}
    >
      {/* YouTube iframe mounts here */}
      <div
        ref={playerDivRef}
        className="absolute inset-0 w-full h-full [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
      />

      {/* Click catcher to block YouTube UI when playing */}
      {hasStarted && (
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={e => { e.stopPropagation(); flashControls(); togglePlay(); }}
        />
      )}

      {/* PRE-PLAY OVERLAY */}
      {!hasStarted && (
        <div
          className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center gap-6 cursor-pointer"
          onClick={startPlayback}
        >
          <img
            src={logo}
            alt="Super TV"
            className="w-52 sm:w-64 h-auto drop-shadow-2xl"
          />
          <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-2xl">
            <Play className="w-9 h-9 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Super TV watermark */}
      <div className="absolute bottom-16 right-3 z-[15] pointer-events-none">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-sm shadow-xl border border-white/10">
          <div className="w-6 h-[18px] rounded-[3px] bg-red-600 flex items-center justify-center flex-shrink-0">
            <Play className="w-3 h-3 text-white fill-white ml-[1px]" />
          </div>
          <span className="text-white text-[12px] font-extrabold tracking-widest leading-none uppercase">Super TV</span>
        </div>
      </div>

      {/* Cover strip at the very bottom to block "Watch on YouTube" link */}
      <div className="absolute bottom-0 inset-x-0 h-14 z-[14] bg-black pointer-events-none" />

      {/* Center paused icon */}
      {hasStarted && !isPlaying && !ytEnded && (
        <div className="absolute inset-0 z-[22] flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
            <Play className="w-9 h-9 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* CUSTOM CONTROLS */}
      <div
        className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-300 ${ctrlVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top gradient + back button + fav */}
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
        <div className={`absolute top-0 inset-x-0 flex items-center gap-3 px-4 pt-4 ${ctrlVisible ? 'pointer-events-auto' : ''}`}>
          <button
            onClick={e => { e.stopPropagation(); onBack(); }}
            className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium truncate max-w-[160px] sm:max-w-sm">{title}</span>
          </button>
          {onFavToggle !== undefined && (
            <button
              onClick={e => { e.stopPropagation(); onFavToggle(); }}
              className={`ml-auto w-10 h-10 rounded-xl bg-black/50 backdrop-blur border border-white/15 flex items-center justify-center active:scale-95 transition-all ${isFav ? 'text-red-400 !border-red-400/40 !bg-red-500/20' : 'text-white'}`}
            >
              <Heart className={`w-5 h-5 ${isFav ? 'fill-red-400' : ''}`} />
            </button>
          )}
        </div>

        {/* Bottom gradient + seek bar + buttons */}
        <div
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent px-4 pt-10 space-y-2 ${ctrlVisible ? 'pointer-events-auto' : ''}`}
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Seek bar + time */}
          <div className="space-y-1.5">
            <div
              className="w-full h-3 flex items-center cursor-pointer group"
              onClick={e => {
                e.stopPropagation();
                handleSeekClick(e.clientX, e.currentTarget.getBoundingClientRect());
              }}
              onTouchEnd={e => {
                e.stopPropagation();
                const touch = e.changedTouches[0];
                handleSeekClick(touch.clientX, e.currentTarget.getBoundingClientRect());
              }}
            >
              <div className="w-full h-1.5 group-hover:h-2.5 bg-white/25 rounded-full relative transition-all duration-150">
                <div
                  className="h-full bg-red-500 rounded-full relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-white/60 select-none">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback row */}
          <div className="flex items-center justify-between pb-1">
            <button
              onClick={e => { e.stopPropagation(); skip(-10); }}
              className={ctrlBtn}
              title="-10s"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={e => { e.stopPropagation(); togglePlay(); }}
              className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all hover:bg-red-500"
            >
              {isPlaying
                ? <Pause className="w-7 h-7 fill-white" />
                : <Play className="w-7 h-7 fill-white ml-0.5" />}
            </button>

            <button
              onClick={e => { e.stopPropagation(); skip(10); }}
              className={ctrlBtn}
              title="+10s"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={toggleFullscreen}
              className={ctrlBtn}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Next episode overlay — appears 10s before end */}
      {showNextEp && onNextEpisode && nextEpisodeId && (
        <div
          className="absolute bottom-28 right-4 z-40 bg-black/90 backdrop-blur border border-white/25 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl ring-1 ring-white/15"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-sm text-white leading-snug">
            <div className="text-white/50 text-[11px] mb-0.5">Siguiente capítulo</div>
            <div className="font-semibold truncate max-w-[180px]">{nextEpisodeTitle || `Capítulo ${nextEpisodeNumber}`}</div>
            {(nextSeasonNumber || nextEpisodeNumber) && (
              <div className="text-white/40 text-[10px] mt-0.5">
                {nextSeasonNumber ? `T${nextSeasonNumber}` : ''}{nextEpisodeNumber ? `E${nextEpisodeNumber}` : ''}
              </div>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onNextEpisode(); }}
            className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-500 active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
          >
            Siguiente <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* End-screen overlay */}
      {ytEnded && (
        <div
          className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center gap-5"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-white/80 text-lg font-semibold">Capítulo terminado</p>
          <div className="flex gap-3 flex-wrap justify-center">
            {onNextEpisode && nextEpisodeId && (
              <button
                onClick={e => { e.stopPropagation(); onNextEpisode(); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 active:scale-95 transition-all ring-2 ring-red-400/60"
              >
                Siguiente capítulo <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={e => {
                e.stopPropagation();
                ytPlayerRef.current?.seekTo(0, true);
                ytPlayerRef.current?.playVideo();
                setHasStarted(true);
                setYtEnded(false);
                setShowNextEp(false);
              }}
              className={`px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${endBtnIndex === 0 ? 'bg-white/30 border-white text-white ring-2 ring-white scale-105' : 'bg-white/15 border-white/20 text-white hover:bg-white/25'}`}
            >
              Volver a ver
            </button>
            <button
              onClick={e => { e.stopPropagation(); onBack(); }}
              className={`px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all ${endBtnIndex === 1 ? 'bg-white/25 ring-2 ring-white scale-105' : 'bg-white/10 hover:bg-white/20'}`}
            >
              Cerrar
            </button>
          </div>
          <p className="text-white/30 text-xs">← → para navegar · Enter para seleccionar</p>
        </div>
      )}
    </div>
  );
}
