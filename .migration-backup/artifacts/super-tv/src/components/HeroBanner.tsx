import { useState, useEffect } from 'react';
import { Play, Info, Star } from 'lucide-react';

export interface HeroBannerItem {
  id: number;
  title: string;
  description?: string | null;
  banner?: string | null;
  poster?: string | null;
  category?: string | null;
  genre?: string | null;
  year?: number | null;
  type: 'movie' | 'series';
}

interface HeroBannerProps {
  items: HeroBannerItem[];
  onPlay: (item: HeroBannerItem) => void;
  onInfo: (item: HeroBannerItem) => void;
}

export function HeroBanner({ items, onPlay, onInfo }: HeroBannerProps) {
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent(p => (p + 1) % items.length);
      setLoaded(false);
    }, 8000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (!items.length) return null;

  const item = items[current];
  const bgImage = item.banner || item.poster;

  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/7', minHeight: '240px', maxHeight: '520px' }}>
      {bgImage && (
        <img
          key={bgImage}
          src={bgImage}
          alt={item.title}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
      {!bgImage && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-8 md:p-12 max-w-2xl">
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {item.type === 'series' && (
              <span className="px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded uppercase tracking-widest">Serie</span>
            )}
            {item.genre && (
              <span className="text-white/60 text-xs">{item.genre}</span>
            )}
            {item.year && (
              <span className="text-white/60 text-xs">{item.year}</span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-white leading-tight drop-shadow-lg line-clamp-2">
            {item.title}
          </h1>

          {item.description && (
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-lg drop-shadow">
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1 sm:pt-2">
            <button
              onClick={() => onPlay(item)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-white text-black rounded-lg font-bold text-sm sm:text-base hover:bg-white/90 transition-all active:scale-95 shadow-lg"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-black" />
              <span className="hidden xs:inline">Reproducir</span>
              <span className="xs:hidden">Play</span>
            </button>
            <button
              onClick={() => onInfo(item)}
              className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-lg font-semibold text-sm hover:bg-white/30 transition-all active:scale-95 border border-white/20"
            >
              <Info className="w-4 h-4" />
              <span className="hidden sm:inline">Más info</span>
            </button>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrent(i); setLoaded(false); }}
              className={`h-1 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
