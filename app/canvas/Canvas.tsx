"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

type Pixel = {
  x: number;
  y: number;
  color: string;
};

type CanvasProps = {
  pixels: Pixel[];
  width: number;
  height: number;
  selectedColor: string;
  onPixelClick: (x: number, y: number) => void;
  onEdgeSwipe?: (direction: "next" | "prev") => void;
};

export function Canvas({
  pixels,
  width,
  height,
  selectedColor,
  onPixelClick,
  onEdgeSwipe,
}: CanvasProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const translateRef = useRef({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startTranslate: { x: number; y: number };
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startTranslate: { x: number; y: number };
  } | null>(null);
  const swipeRef = useRef<{ startY: number } | null>(null);
  const allowSwipeRef = useRef(false);
  const edgeSwipeTriggeredRef = useRef(false);
  const edgeSwipeTimeoutRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });
  const [edgeSwipeFeedback, setEdgeSwipeFeedback] = useState<
    "next" | "prev" | null
  >(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;
  const ZOOM_STEP = 1.5;

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const CELL_GAP = 2;

  const baseCellSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) return 24;
    const totalGapX = CELL_GAP * Math.max(0, width - 1);
    const totalGapY = CELL_GAP * Math.max(0, height - 1);
    const availableWidth = Math.max(0, containerSize.width - totalGapX);
    const availableHeight = Math.max(0, containerSize.height - totalGapY);
    return Math.min(availableWidth / width, availableHeight / height);
  }, [containerSize, height, width]);

  const baseSize = useMemo(
    () => ({
      width: baseCellSize * width + CELL_GAP * Math.max(0, width - 1),
      height: baseCellSize * height + CELL_GAP * Math.max(0, height - 1),
    }),
    [baseCellSize, height, width],
  );

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const clampTranslate = useCallback(
    (x: number, y: number, nextScale: number) => {
      if (!containerSize.width || !containerSize.height) {
        return { x, y };
      }
      const contentWidth = baseSize.width * nextScale;
      const contentHeight = baseSize.height * nextScale;

      let minX = containerSize.width - contentWidth;
      let maxX = 0;
      if (contentWidth <= containerSize.width) {
        minX = maxX = (containerSize.width - contentWidth) / 2;
      }

      let minY = containerSize.height - contentHeight;
      let maxY = 0;
      if (contentHeight <= containerSize.height) {
        minY = maxY = (containerSize.height - contentHeight) / 2;
      }

      return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
      };
    },
    [baseSize.height, baseSize.width, containerSize.height, containerSize.width],
  );

  const getBounds = useCallback(
    (nextScale: number) => {
      const contentWidth = baseSize.width * nextScale;
      const contentHeight = baseSize.height * nextScale;

      let minX = containerSize.width - contentWidth;
      let maxX = 0;
      if (contentWidth <= containerSize.width) {
        minX = maxX = (containerSize.width - contentWidth) / 2;
      }

      let minY = containerSize.height - contentHeight;
      let maxY = 0;
      if (contentHeight <= containerSize.height) {
        minY = maxY = (containerSize.height - contentHeight) / 2;
      }

      return { minX, maxX, minY, maxY };
    },
    [baseSize.height, baseSize.width, containerSize.height, containerSize.width],
  );

  const setTranslateSafe = useCallback(
    (next: { x: number; y: number }) => {
      const clamped = clampTranslate(next.x, next.y, scaleRef.current);
      translateRef.current = clamped;
      setTranslate(clamped);
    },
    [clampTranslate],
  );

  const clampScale = (value: number) => clamp(value, MIN_ZOOM, MAX_ZOOM);

  const zoomTo = useCallback(
    (nextScale: number, focusX: number, focusY: number) => {
      const clampedScale = clampScale(nextScale);
      const currentScale = scaleRef.current;
      const { x, y } = translateRef.current;
      const worldX = (focusX - x) / currentScale;
      const worldY = (focusY - y) / currentScale;
      const nextX = focusX - worldX * clampedScale;
      const nextY = focusY - worldY * clampedScale;
      const clampedTranslate = clampTranslate(nextX, nextY, clampedScale);
      setScale(clampedScale);
      translateRef.current = clampedTranslate;
      setTranslate(clampedTranslate);
    },
    [clampTranslate],
  );

  const resetView = useCallback(() => {
    if (!containerSize.width || !containerSize.height) return;
    const clamped = clampTranslate(0, 0, MIN_ZOOM);
    setScale(MIN_ZOOM);
    translateRef.current = clamped;
    setTranslate(clamped);
  }, [clampTranslate, containerSize.height, containerSize.width]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const focusX = rect.width / 2;
      const focusY = rect.height / 2;
      const nextScale =
        direction > 0
          ? Math.min(MAX_ZOOM, scaleRef.current * ZOOM_STEP)
          : Math.max(MIN_ZOOM, scaleRef.current / ZOOM_STEP);
      zoomTo(nextScale, focusX, focusY);
    },
    [zoomTo],
  );

  const triggerEdgeSwipe = useCallback(
    (direction: "next" | "prev") => {
      setEdgeSwipeFeedback(direction);
      if (edgeSwipeTimeoutRef.current) {
        window.clearTimeout(edgeSwipeTimeoutRef.current);
      }
      edgeSwipeTimeoutRef.current = window.setTimeout(() => {
        setEdgeSwipeFeedback(null);
      }, 220);
      onEdgeSwipe?.(direction);
    },
    [onEdgeSwipe],
  );

  useEffect(() => {
    if (!containerSize.width || !containerSize.height) return;
    const clamped = clampTranslate(
      translateRef.current.x,
      translateRef.current.y,
      scaleRef.current,
    );
    translateRef.current = clamped;
    setTranslate(clamped);
  }, [baseSize.height, baseSize.width, clampTranslate, containerSize]);

  useEffect(() => {
    resetView();
  }, [resetView]);

  useEffect(() => {
    return () => {
      if (edgeSwipeTimeoutRef.current) {
        window.clearTimeout(edgeSwipeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const focusX = event.clientX - rect.left;
      const focusY = event.clientY - rect.top;
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      zoomTo(scaleRef.current * zoomFactor, focusX, focusY);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomTo]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== undefined && event.button !== 0) return;
    const pointer = { x: event.clientX, y: event.clientY };
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, pointer);

    const allowSwipe =
      event.pointerType === "touch" &&
      scaleRef.current <= 1.001 &&
      pointers.size === 1;
    allowSwipeRef.current = allowSwipe;

    if (!allowSwipe) {
      event.stopPropagation();
    } else if (onEdgeSwipe) {
      swipeRef.current = { startY: pointer.y };
      edgeSwipeTriggeredRef.current = false;
      setIsInteracting(true);
    }

    if (pointers.size === 2) {
      allowSwipeRef.current = false;
      event.stopPropagation();
      const points = Array.from(pointers.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      pinchRef.current = {
        startDistance: Math.hypot(dx, dy),
        startScale: scaleRef.current,
        startTranslate: { ...translateRef.current },
      };
      panRef.current = null;
      setIsInteracting(true);
      return;
    }

    if (event.pointerType !== "touch" || scaleRef.current > 1.001) {
      panRef.current = {
        startX: pointer.x,
        startY: pointer.y,
        startTranslate: { ...translateRef.current },
      };
      edgeSwipeTriggeredRef.current = false;
      setIsInteracting(true);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && pinchRef.current) {
      event.stopPropagation();
      const points = Array.from(pointers.values());
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      const distance = Math.hypot(dx, dy);
      const rect = containerRef.current?.getBoundingClientRect();
      const centerX = (points[0].x + points[1].x) / 2 - (rect?.left ?? 0);
      const centerY = (points[0].y + points[1].y) / 2 - (rect?.top ?? 0);

      const start = pinchRef.current;
      const nextScale = clampScale(
        start.startScale * (distance / start.startDistance),
      );
      const worldX = (centerX - start.startTranslate.x) / start.startScale;
      const worldY = (centerY - start.startTranslate.y) / start.startScale;
      const nextX = centerX - worldX * nextScale;
      const nextY = centerY - worldY * nextScale;
      const clamped = clampTranslate(nextX, nextY, nextScale);
      setScale(nextScale);
      translateRef.current = clamped;
      setTranslate(clamped);
      return;
    }

    if (
      allowSwipeRef.current &&
      swipeRef.current &&
      onEdgeSwipe &&
      event.pointerType === "touch"
    ) {
      const dy = event.clientY - swipeRef.current.startY;
      const threshold = Math.max(60, containerSize.height * 0.12);
      if (!edgeSwipeTriggeredRef.current && Math.abs(dy) >= threshold) {
        edgeSwipeTriggeredRef.current = true;
        swipeRef.current = null;
        allowSwipeRef.current = false;
        setIsInteracting(false);
        triggerEdgeSwipe(dy < 0 ? "next" : "prev");
        return;
      }
    }

    if (panRef.current) {
      event.stopPropagation();
      const dx = event.clientX - panRef.current.startX;
      const dy = event.clientY - panRef.current.startY;
      if (
        onEdgeSwipe &&
        event.pointerType === "touch" &&
        !edgeSwipeTriggeredRef.current
      ) {
        const bounds = getBounds(scaleRef.current);
        const atTop = Math.abs(translateRef.current.y - bounds.maxY) < 0.5;
        const atBottom = Math.abs(translateRef.current.y - bounds.minY) < 0.5;
        const edgeThreshold = 48;
        if (atTop && dy > edgeThreshold) {
          edgeSwipeTriggeredRef.current = true;
          panRef.current = null;
          setIsInteracting(false);
          triggerEdgeSwipe("prev");
          return;
        }
        if (atBottom && dy < -edgeThreshold) {
          edgeSwipeTriggeredRef.current = true;
          panRef.current = null;
          setIsInteracting(false);
          triggerEdgeSwipe("next");
          return;
        }
      }
      const next = {
        x: panRef.current.startTranslate.x + dx,
        y: panRef.current.startTranslate.y + dy,
      };
      setTranslateSafe(next);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    if (pointers.has(event.pointerId)) {
      pointers.delete(event.pointerId);
    }
    if (pointers.size < 2) {
      pinchRef.current = null;
    }
    if (pointers.size === 0) {
      panRef.current = null;
      setIsInteracting(false);
      edgeSwipeTriggeredRef.current = false;
      swipeRef.current = null;
      allowSwipeRef.current = false;
    }

    if (event.pointerType === "touch") {
      const rect = containerRef.current?.getBoundingClientRect();
      const tapX = event.clientX - (rect?.left ?? 0);
      const tapY = event.clientY - (rect?.top ?? 0);
      const now = Date.now();
      const prev = lastTapRef.current;
      const dist = Math.hypot(prev.x - tapX, prev.y - tapY);
      if (now - prev.time < 300 && dist < 24) {
        zoomTo(scaleRef.current * ZOOM_STEP, tapX, tapY);
        lastTapRef.current = { time: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { time: now, x: tapX, y: tapY };
      }
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const focusX = event.clientX - (rect?.left ?? 0);
    const focusY = event.clientY - (rect?.top ?? 0);
    zoomTo(scaleRef.current * ZOOM_STEP, focusX, focusY);
  };

  // Build lookup map for pixel colors
  const pixelMap = new Map<string, string>();
  for (const p of pixels) {
    pixelMap.set(`${p.x},${p.y}`, p.color);
  }

  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const color = pixelMap.get(key);
      const isHovered = hoveredCell === key;

      cells.push(
        <div
          key={key}
          onClick={() => onPixelClick(x, y)}
          onMouseEnter={() => setHoveredCell(key)}
          onMouseLeave={() => setHoveredCell(null)}
          style={{
            width: baseCellSize,
            height: baseCellSize,
            backgroundColor: isHovered
              ? selectedColor
              : color ?? "#e5e5e5",
            opacity: isHovered && !color ? 0.7 : 1,
            cursor: "pointer",
            border: "2px solid #d4d4d4",
            borderRadius: 4,
            transition: "background-color 0.1s",
            boxSizing: "border-box",
          }}
        />
      );
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      className={`relative h-full w-full overflow-hidden select-none touch-none ${isInteracting ? "cursor-grabbing" : "cursor-grab"} ${edgeSwipeFeedback === "next" ? "edge-swipe-next" : ""} ${edgeSwipeFeedback === "prev" ? "edge-swipe-prev" : ""}`}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border bg-background/90 px-2 py-1 text-muted-foreground shadow-sm">
        <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
          {Number.isFinite(scale)
            ? `${Math.abs(scale - 1) < 0.01 ? "1" : scale.toFixed(scale < 2 ? 2 : 1)}x`
            : "1x"}
        </span>
        <button
          type="button"
          aria-label="Oddálit"
          onClick={() => zoomBy(-1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Resetovat zoom"
          onClick={resetView}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Přiblížit"
          onClick={() => zoomBy(1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: baseSize.width,
          height: baseSize.height,
          display: "grid",
          gridTemplateColumns: `repeat(${width}, ${baseCellSize}px)`,
          gap: CELL_GAP,
        }}
      >
        {cells}
      </div>
    </div>
  );
}
