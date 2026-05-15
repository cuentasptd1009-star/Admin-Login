import { useRef, useEffect, memo } from 'react';
import { ContentCard } from './ContentCard';
import type { WatchProgress } from '@/lib/user-data';

export interface ChannelItem {
  id: number;
  name: string;
  streamUrl: string;
  logo?: string | null;
  category?: string | null;
}

export interface MovieItem {
  id: number;
  title: string;
  poster?: string | null;
  category?: string | null;
  createdAt: string;
  filePath?: string | null;
}

export type ContentItem = ChannelItem | MovieItem;

export function isChannel(item: ContentItem): item is ChannelItem {
  return 'streamUrl' in item;
}

interface ContentRowProps {
  title: string;
  emoji?: string;
  items: ContentItem[];
  focusedIndex: number;
  isFocusedRow: boolean;
  onItemClick: (item: ContentItem) => void;
  onFavoriteToggle?: (id: number) => void;
  progressMap?: Map<number, WatchProgress>;
  favSet?: Set<number>;
  isNewFn?: (item: ContentItem) => boolean;
  showProgress?: boolean;
  sectionRef?: (el: HTMLElement | null) => void;
}

export const ContentRow = memo(function ContentRow({
  title,
  emoji,
  items,
  focusedIndex,
  isFocusedRow,
  onItemClick,
  onFavoriteToggle,
  progressMap,
  favSet,
  isNewFn,
  showProgress = false,
  sectionRef,
}: ContentRowProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (isFocusedRow && focusedIndex >= 0 && cardRefs.current[focusedIndex]) {
      cardRefs.current[focusedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [focusedIndex, isFocusedRow]);

  if (items.length === 0) return null;

  return (
    <section ref={sectionRef} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2
          className={`text-sm sm:text-base font-bold tracking-wide transition-colors duration-200 ${
            isFocusedRow ? 'text-foreground' : 'text-foreground/70'
          }`}
        >
          {emoji && <span className="mr-1.5">{emoji}</span>}
          {title}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground/50">{items.length}</span>
        </h2>
        {isFocusedRow && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
        )}
      </div>

      <div
        className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-3 scroll-smooth"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingLeft: '4px',
          paddingRight: '4px',
        }}
      >
        {items.map((item, idx) => {
          const ch = isChannel(item);
          const itemTitle = ch ? item.name : item.title;
          const image = ch ? item.logo : item.poster;
          const prog =
            !ch && progressMap && showProgress ? progressMap.get(item.id) : undefined;
          const fav = !ch && favSet ? favSet.has(item.id) : false;
          const badge = !ch && isNewFn && isNewFn(item) ? 'NUEVO' : null;

          return (
            <ContentCard
              key={`${ch ? 'c' : 'm'}-${item.id}`}
              cardRef={(el) => {
                cardRefs.current[idx] = el;
              }}
              title={itemTitle}
              subtitle={item.category ?? undefined}
              image={image}
              isChannel={ch}
              isFocused={isFocusedRow && focusedIndex === idx}
              progress={prog ?? null}
              isFavorite={fav}
              badge={badge}
              onClick={() => onItemClick(item)}
              onFavoriteToggle={
                !ch && onFavoriteToggle
                  ? (e) => {
                      e.stopPropagation();
                      onFavoriteToggle(item.id);
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
});
