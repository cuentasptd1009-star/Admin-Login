import { memo } from 'react';
import { Play, Heart, Film } from 'lucide-react';

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

interface WatchProgress {
  time: number;
  duration: number;
}

interface ContentCardProps {
  title: string;
  subtitle?: string;
  image?: string | null;
  isChannel?: boolean;
  isFocused?: boolean;
  progress?: WatchProgress | null;
  isFavorite?: boolean;
  badge?: string | null;
  portrait?: boolean;
  onClick: () => void;
  onFavoriteToggle?: (e: React.MouseEvent) => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}

export const ContentCard = memo(function ContentCard({
  title,
  subtitle,
  image,
  isChannel = false,
  isFocused = false,
  progress,
  isFavorite = false,
  badge,
  portrait = false,
  onClick,
  onFavoriteToggle,
  onHover,
  onHoverEnd,
  cardRef,
}: ContentCardProps) {
  const widthClass = portrait
    ? 'w-28 sm:w-32 md:w-36'
    : 'w-40 sm:w-44 md:w-48';

  return (
    <div
      ref={cardRef}
      className={`flex-shrink-0 ${widthClass} group cursor-pointer select-none transition-transform duration-200 ease-out ${
        isFocused ? 'scale-105 z-20' : 'hover:scale-[1.04] z-10'
      }`}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
    >
      <div
        className={`${portrait ? 'aspect-[2/3]' : 'aspect-video'} rounded-lg overflow-hidden relative shadow-md transition-[box-shadow,ring] duration-200 ${
          isFocused
            ? 'ring-2 ring-primary shadow-[0_0_24px_rgba(220,38,38,0.6)] ring-offset-1 ring-offset-background'
            : 'group-hover:shadow-[0_8px_40px_rgba(0,0,0,0.9)] group-hover:ring-1 group-hover:ring-white/20'
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform duration-300 ${
              isFocused ? 'scale-110' : 'scale-100 group-hover:scale-105'
            }`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : isChannel ? (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
            <img
              src={`${BASE_URL}/default-channel.png`}
              alt="Super TV"
              loading="lazy"
              className="w-20 h-20 object-contain"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
            <Film className="w-10 h-10 text-white/15" />
          </div>
        )}

        {portrait ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
            <div
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <div className={`p-2.5 rounded-full bg-black/50 border border-white/30 transition-transform duration-200 ${isFocused ? 'scale-125' : 'scale-100 group-hover:scale-110'}`}>
                <Play className="w-5 h-5 text-white fill-white" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-2 pb-2.5">
              <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2 drop-shadow-lg">
                {title}
              </p>
              {subtitle && (
                <p className="text-white/50 text-[9px] truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </>
        ) : (
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={`p-2.5 rounded-full bg-white/25 border border-white/30 transition-transform duration-200 ${
                  isFocused ? 'scale-125 bg-white/35' : 'scale-100 group-hover:scale-110'
                }`}
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white drop-shadow-lg" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 right-8">
              <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2 drop-shadow-lg">
                {title}
              </p>
            </div>
          </div>
        )}

        {badge && (
          <span className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide z-10 shadow-lg">
            {badge}
          </span>
        )}

        {!isChannel && onFavoriteToggle && (
          <button
            className={`absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/70 transition-[opacity,transform] duration-150 z-10 hover:bg-black/85 hover:scale-110 ${
              isFocused || isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={onFavoriteToggle}
          >
            <Heart
              className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-colors ${
                isFavorite ? 'fill-red-500 text-red-500' : 'text-white'
              }`}
            />
          </button>
        )}

        {progress && progress.duration > 0 && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, (progress.time / progress.duration) * 100)}%` }}
              />
            </div>
            {progress.time > 0 && (
              <span className="absolute bottom-1.5 left-1.5 bg-black/80 text-[9px] text-white px-1.5 py-0.5 rounded font-medium">
                {fmtSecs(progress.time)}
              </span>
            )}
          </>
        )}
      </div>

      {!portrait && (
        <div className="mt-1.5 px-0.5">
          <p
            className={`text-xs font-medium truncate leading-snug transition-colors duration-200 ${
              isFocused ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
            }`}
          >
            {title}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
});
