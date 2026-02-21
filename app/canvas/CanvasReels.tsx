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
  enableTouchSwipe?: boolean;
};

const HINT_STORAGE_KEY = "pixagora-reels-hint-dismissed";
const HINT_DELAY_MS = 1800;

export const CanvasReels = forwardRef<CanvasReelsHandle, CanvasReelsProps>(
  function CanvasReels(
    {
      count,
      renderItem,
      initialIndex = 0,
      onIndexChange,
      enableTouchSwipe = true,
    },
    ref,
  ) {
  const [activeIndex, setActiveIndex] = useState(() => {
    const safeIndex = Math.max(0, Math.min(count - 1, initialIndex));
    return Number.isFinite(safeIndex) ? safeIndex : 0;
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === "undefined") { return false; }
    try {
      return window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hintTimerDone, setHintTimerDone] = useState(false);
  const startYRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  const dragOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef(0);

  const hasMultiple = count > 1;
  const touchEnabled = enableTouchSwipe && hasMultiple;

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const getHeight = useCallback(() => {
    return heightRef.current || containerRef.current?.clientHeight || containerHeight || 1;
  }, [containerHeight]);

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
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {return;}
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

  useEffect(() => {
    if (!hasMultiple || hintDismissed) { return; }
    const timeoutId = window.setTimeout(() => {
      setHintTimerDone(true);
    }, HINT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [hasMultiple, hintDismissed]);

  const setOffset = (value: number) => {
    dragOffsetRef.current = value;
    setDragOffset(value);
  };

  const setDragging = (value: boolean) => {
    isDraggingRef.current = value;
    setIsDragging(value);
  };

  const handleStart = (clientY: number) => {
    startYRef.current = clientY;
    setOffset(0);
    setDragging(true);
  };

  const handleMove = (clientY: number) => {
    if (!isDraggingRef.current) {return;}
    const delta = clientY - startYRef.current;
    const height = getHeight();
    setOffset(clamp(delta, -height * 0.6, height * 0.6));
  };

  const handleEnd = useCallback(() => {
    if (!isDraggingRef.current) {return;}
    const height = getHeight();
    const threshold = Math.max(60, height * 0.12);
    if (Math.abs(dragOffsetRef.current) >= threshold) {
      const direction = dragOffsetRef.current < 0 ? 1 : -1;
      updateIndex(activeIndexRef.current + direction);
    }
    setOffset(0);
    setDragging(false);
  }, [getHeight, updateIndex]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      setOffset(0);
      setDragging(false);
      updateIndex(nextIndex);
      if (!hintDismissed && nextIndex !== 0) {
        setHintDismissed(true);
        try {
          window.localStorage.setItem(HINT_STORAGE_KEY, "1");
        } catch {
          // ignore storage access errors
        }
      }
    },
    [updateIndex, hintDismissed],
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
      if (!hasMultiple) {return;}
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {return;}
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
  const baseTranslate = -(activeIndex * height) + dragOffset;
  const clampedTranslate = clamp(baseTranslate, -height * (count - 1), 0);
  const translate = `translateY(${clampedTranslate}px)`;
  const reelLabel = useMemo(
    () => `Plátno ${activeIndex + 1}/${count}`,
    [activeIndex, count],
  );

  const handleLabelClick = () => {
    if (!hasMultiple) {return;}
    const nextIndex = activeIndexRef.current + 1;
    goToIndex(nextIndex > count - 1 ? 0 : nextIndex);
  };

  const touchHandlers = touchEnabled
    ? {
        onTouchStart: (event: React.TouchEvent<HTMLDivElement>) =>
          handleStart(event.touches[0]?.clientY ?? 0),
        onTouchMove: (event: React.TouchEvent<HTMLDivElement>) =>
          handleMove(event.touches[0]?.clientY ?? 0),
        onTouchEnd: handleEnd,
        onTouchCancel: handleEnd,
      }
    : {};

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none select-none"
      {...touchHandlers}
    >
      <button
        type="button"
        onClick={handleLabelClick}
        disabled={!hasMultiple}
        className="absolute left-4 top-4 z-10 rounded-full border bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:text-foreground disabled:opacity-60"
        aria-label="Přepnout plátno"
      >
        {reelLabel}
      </button>

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

      {hintTimerDone && hasMultiple && activeIndex === 0 && !hintDismissed && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-background/65 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-sm md:hidden">
          <div className="flex flex-col items-center leading-none text-muted-foreground/80">
            <ChevronUp
              className="h-4 w-4 reels-hint-arrow"
              style={{ animationDelay: "0ms" }}
            />
            <ChevronUp
              className="-mt-1 h-4 w-4 reels-hint-arrow"
              style={{ animationDelay: "200ms" }}
            />
          </div>
          <span className="text-muted-foreground/80">Potáhněte pro další plátno</span>
        </div>
      )}

      <div
        className={`flex h-full w-full flex-col ${isDragging ? "" : "transition-transform duration-300 ease-out"}`}
        style={{ transform: translate }}
      >
        {Array.from({ length: count }).map((_, index) => (
          <div key={`canvas-reel-${index}`} className="h-full w-full shrink-0">
            {renderItem(index)}
          </div>
        ))}
      </div>
    </div>
  );
  },
);
