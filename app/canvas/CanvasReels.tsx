"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export type CanvasReelsHandle = {
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  getIndex: () => number;
};

type CanvasReelsProps = {
  count: number;
  renderItem: (index: number) => ReactNode;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
};

export const CanvasReels = forwardRef<CanvasReelsHandle, CanvasReelsProps>(
  function CanvasReels(
    {
      count,
      renderItem,
      initialIndex = 0,
      onIndexChange,
    },
    ref,
  ) {
  const [activeIndex, setActiveIndex] = useState(() => {
    const safeIndex = Math.max(0, Math.min(count - 1, initialIndex));
    return Number.isFinite(safeIndex) ? safeIndex : 0;
  });
  const [containerHeight, setContainerHeight] = useState(0);
  const activeIndexRef = useRef(activeIndex);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef(0);

  const hasMultiple = count > 1;

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const updateIndex = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(count - 1, nextIndex));
      setActiveIndex(clamped);
      onIndexChange?.(clamped);
    },
    [count, onIndexChange],
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        heightRef.current = entry.contentRect.height;
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Clamp activeIndex when count shrinks
  if (count > 0 && activeIndex > count - 1) {
    setActiveIndex(Math.max(0, count - 1));
  }

  const goToIndex = useCallback(
    (nextIndex: number) => {
      updateIndex(nextIndex);
    },
    [updateIndex],
  );

  useImperativeHandle(
    ref,
    () => ({
      next: () => goToIndex(activeIndexRef.current + 1),
      prev: () => goToIndex(activeIndexRef.current - 1),
      goTo: (index: number) => goToIndex(index),
      getIndex: () => activeIndexRef.current,
    }),
    [goToIndex],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hasMultiple) {
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (event.key === "ArrowUp") {
        goToIndex(activeIndexRef.current - 1);
      } else {
        goToIndex(activeIndexRef.current + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToIndex, hasMultiple]);

  const height = containerHeight || 1;
  const baseTranslate = -(activeIndex * height);
  const clampedTranslate = clamp(baseTranslate, -height * (count - 1), 0);
  const translate = `translateY(${clampedTranslate}px)`;
  const reelLabel = useMemo(
    () => `Plátno ${activeIndex + 1}/${count}`,
    [activeIndex, count],
  );

  const handleLabelClick = () => {
    if (!hasMultiple) {
      return;
    }
    const nextIndex = activeIndexRef.current + 1;
    goToIndex(nextIndex > count - 1 ? 0 : nextIndex);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none select-none cursor-pointer"
    >
      <button
        type="button"
        onClick={handleLabelClick}
        disabled={!hasMultiple}
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-black/10 bg-background/60 px-3 py-2 text-[11px] font-medium text-foreground shadow-sm transition hover:text-foreground disabled:cursor-not-allowed dark:border-white/10 dark:text-white dark:hover:text-white"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
        aria-label="Přepnout plátno"
      >
        <span>{reelLabel}</span>
        {hasMultiple && (
          <span className="flex flex-col leading-none text-muted-foreground/70">
            <ChevronUp className="h-3 w-3" />
            <ChevronDown className="-mt-1 h-3 w-3" />
          </span>
        )}
      </button>

      {hasMultiple && (
        <div className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 md:flex">
          <button
            type="button"
            aria-label="Předchozí plátno"
            onClick={() => goToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Další plátno"
            onClick={() => goToIndex(activeIndex + 1)}
            disabled={activeIndex >= count - 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        className="flex h-full w-full flex-col transition-transform duration-300 ease-out"
        style={{ transform: translate }}
      >
        {Array.from({ length: count }).map((_, index) => (
          <div key={`canvas-reel-${index}`} className="h-full w-full shrink-0">
            {Math.abs(index - activeIndex) <= 1 ? renderItem(index) : null}
          </div>
        ))}
      </div>
    </div>
  );
  },
);
