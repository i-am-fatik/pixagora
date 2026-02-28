"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { PixelPreview } from "./PixelPreview";

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
  highlightedPixels?: Set<string>;
  movePreviewPixels?: Pixel[] | null;
  movePreviewActive?: boolean;
  isFreeModePainting?: boolean;
  onFreePaint?: (x: number, y: number) => void;
  onStrokeStart?: () => void;
  onStrokeEnd?: () => void;
};

function drawGrid(
  ctx: CanvasRenderingContext2D,
  pixelMap: Map<string, string>,
  gridW: number,
  gridH: number,
  cellSize: number,
  gap: number,
  hovered: { x: number; y: number } | null,
  hoverPointer: { x: number; y: number } | null,
  selectedColor: string,
  translate: { x: number; y: number },
  scale: number,
  viewportW: number,
  viewportH: number,
  highlightedPixels?: Set<string>,
  moveOverlay?: { map: Map<string, string>; invalid: boolean } | null,
  showHoverIndicator = true,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportW, viewportH);
  ctx.translate(translate.x, translate.y);
  ctx.scale(scale, scale);

  const step = cellSize + gap;
  const hoverFill = cellSize * scale >= 18;
  const invScale = 1 / scale;
  const visLeft = -translate.x * invScale;
  const visTop = -translate.y * invScale;
  const visRight = visLeft + viewportW * invScale;
  const visBottom = visTop + viewportH * invScale;

  const startX = Math.max(0, Math.floor(visLeft / step));
  const endX = Math.min(gridW, Math.ceil(visRight / step));
  const startY = Math.max(0, Math.floor(visTop / step));
  const endY = Math.min(gridH, Math.ceil(visBottom / step));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const px = x * step;
      const py = y * step;
      const key = `${x},${y}`;
      const color = pixelMap.get(key);
      const isHovered = hovered?.x === x && hovered?.y === y;
      const overlayColor = moveOverlay?.map.get(key);

      ctx.globalAlpha = 1;
      ctx.fillStyle = color ?? "#ffffff";
      ctx.fillRect(px, py, cellSize, cellSize);

      if (overlayColor) {
        ctx.globalAlpha = moveOverlay?.invalid ? 0.6 : 0.8;
        ctx.fillStyle = moveOverlay?.invalid ? "#ef4444" : overlayColor;
        ctx.fillRect(px, py, cellSize, cellSize);
      } else if (isHovered && hoverFill) {
        ctx.globalAlpha = color ? 1 : 0.7;
        ctx.fillStyle = selectedColor;
        ctx.fillRect(px, py, cellSize, cellSize);
      } else if (isHovered) {
        const outlineWidth = Math.max(1 / scale, 0.75);
        const inset = outlineWidth / 2;
        ctx.lineWidth = outlineWidth;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeRect(
          px + inset,
          py + inset,
          cellSize - outlineWidth,
          cellSize - outlineWidth,
        );
        ctx.lineWidth = outlineWidth * 0.6;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeRect(
          px + inset,
          py + inset,
          cellSize - outlineWidth,
          cellSize - outlineWidth,
        );
      }
    }
  }

  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  const x0 = startX * step;
  const x1 = endX * step;
  const y0 = startY * step;
  const y1 = endY * step;
  for (let y = startY; y <= endY; y++) {
    const py = y * step;
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
  }
  for (let x = startX; x <= endX; x++) {
    const px = x * step;
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
  }
  ctx.stroke();

  if (highlightedPixels && highlightedPixels.size > 0) {
    ctx.globalAlpha = 1;
    const borderWidth = Math.max(2 / scale, 1);
    const inset = borderWidth / 2;
    const pulseAlpha = 0.15 + 0.15 * Math.sin((Date.now() / 750) * Math.PI);
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = `${x},${y}`;
        if (!highlightedPixels.has(key)) {
          continue;
        }
        const px = x * step;
        const py = y * step;
        const bx = px + inset;
        const by = py + inset;
        const size = cellSize - borderWidth;
        ctx.globalAlpha = 1;
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(bx, by, size, size);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = borderWidth * 0.6;
        ctx.strokeRect(bx, by, size, size);

        ctx.globalAlpha = pulseAlpha;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  if (showHoverIndicator && hovered && hoverPointer && !hoverFill) {
    const radius = 6;
    const offset = 14;
    let cx = hoverPointer.x + offset;
    let cy = hoverPointer.y + offset;
    if (cx + radius + 2 > viewportW) {
      cx = hoverPointer.x - offset;
    }
    if (cy + radius + 2 > viewportH) {
      cy = hoverPointer.y - offset;
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = selectedColor;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();
    ctx.restore();
  }
}

function hitTest(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  translate: { x: number; y: number },
  scale: number,
  cellSize: number,
  gap: number,
  gridW: number,
  gridH: number,
  cellInsetFraction?: number,
): { x: number; y: number } | null {
  const localX = (clientX - containerRect.left - translate.x) / scale;
  const localY = (clientY - containerRect.top - translate.y) / scale;
  const step = cellSize + gap;
  const gx = Math.floor(localX / step);
  const gy = Math.floor(localY / step);
  if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) {
    return null;
  }
  const inCellX = localX - gx * step;
  const inCellY = localY - gy * step;
  if (inCellX > cellSize || inCellY > cellSize) {
    return null;
  }
  if (cellInsetFraction != null && cellInsetFraction > 0) {
    const margin = cellSize * cellInsetFraction;
    if (
      inCellX < margin ||
      inCellX > cellSize - margin ||
      inCellY < margin ||
      inCellY > cellSize - margin
    ) {
      return null;
    }
  }
  return { x: gx, y: gy };
}

/** Bresenham line from (x0,y0) to (x1,y1), excluding the start point. */
function lineCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0;
  let cy = y0;
  for (;;) {
    if (cx === x1 && cy === y1) {
      cells.push({ x: cx, y: cy });
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
    cells.push({ x: cx, y: cy });
  }
  return cells;
}

export function Canvas({
  pixels,
  width,
  height,
  selectedColor,
  onPixelClick,
  onEdgeSwipe,
  highlightedPixels,
  movePreviewPixels,
  movePreviewActive = false,
  isFreeModePainting = false,
  onFreePaint,
  onStrokeStart,
  onStrokeEnd,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredCellRef = useRef<{ x: number; y: number } | null>(null);
  const hoverPointerRef = useRef<{ x: number; y: number } | null>(null);
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
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [previewCell, setPreviewCell] = useState<{ x: number; y: number } | null>(
    null,
  );
  const previewRafRef = useRef<number | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const clickOriginRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const needsDrawRef = useRef(false);
  const isPaintStrokeRef = useRef(false);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const didPaintStrokeRef = useRef(false);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const MIN_ZOOM = 0.8;
  const MAX_ZOOM = 12;
  const ZOOM_STEP = 1.5;
  /** Fraction of cell size (0..0.5) by which pointer must be inside the cell to count for free paint. Reduces accidental diagonal paints. */
  const FREE_PAINT_CELL_INSET = 0.1;
  const [fitScale] = useState(1);
  const PREVIEW_MAX = 120;
  const PREVIEW_MARGIN = 12;
  const previewPixels = useMemo(() => {
    if (!movePreviewPixels || movePreviewPixels.length === 0) {
      return [];
    }
    if (!movePreviewActive || !previewCell) {
      return movePreviewPixels;
    }
    return movePreviewPixels.map((px) => {
      const absX = previewCell.x + px.x;
      const absY = previewCell.y + px.y;
      const outOfBounds = absX < 0 || absY < 0 || absX >= width || absY >= height;
      return outOfBounds ? { ...px, color: "#ef4444" } : px;
    });
  }, [height, movePreviewActive, movePreviewPixels, previewCell, width]);
  const moveOverlay = useMemo(() => {
    if (
      !movePreviewActive ||
      !previewCell ||
      !movePreviewPixels?.length ||
      (isCoarsePointer && !isPreviewDragging)
    ) {
      return null;
    }
    let hasOutOfBounds = false;
    const map = new Map<string, string>();
    for (const px of movePreviewPixels) {
      const absX = previewCell.x + px.x;
      const absY = previewCell.y + px.y;
      if (absX < 0 || absY < 0 || absX >= width || absY >= height) {
        hasOutOfBounds = true;
        continue;
      }
      map.set(`${absX},${absY}`, px.color);
    }
    if (map.size === 0) {
      return null;
    }
    return { map, invalid: hasOutOfBounds };
  }, [
    height,
    isCoarsePointer,
    isPreviewDragging,
    movePreviewActive,
    movePreviewPixels,
    previewCell,
    width,
  ]);
  const getDockPosition = useCallback(() => {
    const dockTop = Math.max(
      PREVIEW_MARGIN,
      Math.min(72, containerSize.height - PREVIEW_MAX - PREVIEW_MARGIN),
    );
    const dockLeft = Math.max(
      PREVIEW_MARGIN,
      containerSize.width - PREVIEW_MAX - PREVIEW_MARGIN,
    );
    return { left: dockLeft, top: dockTop };
  }, [containerSize.height, containerSize.width]);

  const previewStyle = useMemo(() => {
    if (isCoarsePointer) {
      const dock = getDockPosition();
      if (!isPreviewDragging || !previewPos) {
        return dock;
      }
      const maxX = Math.max(
        PREVIEW_MARGIN,
        containerSize.width - PREVIEW_MAX - PREVIEW_MARGIN,
      );
      const maxY = Math.max(
        PREVIEW_MARGIN,
        containerSize.height - PREVIEW_MAX - PREVIEW_MARGIN,
      );
      return {
        left: clamp(previewPos.x, PREVIEW_MARGIN, maxX),
        top: clamp(previewPos.y, PREVIEW_MARGIN, maxY),
      };
    }
    if (!previewPos) {
      return null;
    }
    const padding = 12;
    let left = previewPos.x + padding;
    let top = previewPos.y + padding;
    const maxX = containerSize.width - PREVIEW_MAX - 4;
    const maxY = containerSize.height - PREVIEW_MAX - 4;
    if (left > maxX) {
      left = previewPos.x - padding - PREVIEW_MAX;
    }
    if (top > maxY) {
      top = previewPos.y - padding - PREVIEW_MAX;
    }
    left = Math.max(4, Math.min(left, maxX));
    top = Math.max(4, Math.min(top, maxY));
    return { left, top };
  }, [
    containerSize.height,
    containerSize.width,
    getDockPosition,
    isCoarsePointer,
    isPreviewDragging,
    previewPos,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const CELL_GAP = 0;

  const baseCellSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) {
      return 24;
    }
    const totalGapX = CELL_GAP * Math.max(0, width - 1);
    const totalGapY = CELL_GAP * Math.max(0, height - 1);
    const availableWidth = Math.max(0, containerSize.width - totalGapX);
    const availableHeight = Math.max(0, containerSize.height - totalGapY);
    return (
      Math.min(availableWidth / width, availableHeight / height) * fitScale
    );
  }, [containerSize, fitScale, height, width]);

  const baseSize = useMemo(
    () => ({
      width: baseCellSize * width + CELL_GAP * Math.max(0, width - 1),
      height: baseCellSize * height + CELL_GAP * Math.max(0, height - 1),
    }),
    [baseCellSize, height, width],
  );

  const pixelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pixels) {
      map.set(`${p.x},${p.y}`, p.color);
    }
    return map;
  }, [pixels]);

  const clampTranslate = useCallback(
    (x: number, y: number, nextScale: number) => {
      if (!containerSize.width || !containerSize.height) {
        return { x, y };
      }
      const contentWidth = baseSize.width * nextScale;
      const contentHeight = baseSize.height * nextScale;
      const allowSlack = nextScale < 1;
      const edgePad = allowSlack ? (isCoarsePointer ? 48 : 32) : 0;

      let minX = containerSize.width - contentWidth;
      let maxX = 0;
      if (contentWidth <= containerSize.width) {
        if (allowSlack) {
          minX = -edgePad;
          maxX = containerSize.width - contentWidth + edgePad;
        } else {
          minX = maxX = (containerSize.width - contentWidth) / 2;
        }
      } else if (allowSlack) {
        minX -= edgePad;
        maxX = edgePad;
      }

      let minY = containerSize.height - contentHeight;
      let maxY = 0;
      if (contentHeight <= containerSize.height) {
        if (allowSlack) {
          minY = -edgePad;
          maxY = containerSize.height - contentHeight + edgePad;
        } else {
          minY = maxY = (containerSize.height - contentHeight) / 2;
        }
      } else if (allowSlack) {
        minY -= edgePad;
        maxY = edgePad;
      }

      return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
      };
    },
    [
      baseSize.height,
      baseSize.width,
      containerSize.height,
      containerSize.width,
      isCoarsePointer,
    ],
  );

  const getBounds = useCallback(
    (nextScale: number) => {
      const contentWidth = baseSize.width * nextScale;
      const contentHeight = baseSize.height * nextScale;
      const allowSlack = nextScale < 1;
      const edgePad = allowSlack ? (isCoarsePointer ? 48 : 32) : 0;

      let minX = containerSize.width - contentWidth;
      let maxX = 0;
      if (contentWidth <= containerSize.width) {
        if (allowSlack) {
          minX = -edgePad;
          maxX = containerSize.width - contentWidth + edgePad;
        } else {
          minX = maxX = (containerSize.width - contentWidth) / 2;
        }
      } else if (allowSlack) {
        minX -= edgePad;
        maxX = edgePad;
      }

      let minY = containerSize.height - contentHeight;
      let maxY = 0;
      if (contentHeight <= containerSize.height) {
        if (allowSlack) {
          minY = -edgePad;
          maxY = containerSize.height - contentHeight + edgePad;
        } else {
          minY = maxY = (containerSize.height - contentHeight) / 2;
        }
      } else if (allowSlack) {
        minY -= edgePad;
        maxY = edgePad;
      }

      return { minX, maxX, minY, maxY };
    },
    [
      baseSize.height,
      baseSize.width,
      containerSize.height,
      containerSize.width,
      isCoarsePointer,
    ],
  );

  const setTranslateSafe = useCallback(
    (next: { x: number; y: number }) => {
      const clamped = clampTranslate(next.x, next.y, scaleRef.current);
      translateRef.current = clamped;
      setTranslate(clamped);
    },
    [clampTranslate],
  );

  const clampScale = useCallback(
    (value: number) => clamp(value, MIN_ZOOM, MAX_ZOOM),
    [],
  );

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
    [clampScale, clampTranslate],
  );

  const resetView = useCallback(() => {
    if (!containerSize.width || !containerSize.height) {
      return;
    }
    const contentWidth = baseSize.width * 1;
    const contentHeight = baseSize.height * 1;
    const centerX = (containerSize.width - contentWidth) / 2;
    const centerY = (containerSize.height - contentHeight) / 2;
    const clamped = clampTranslate(centerX, centerY, 1);
    setScale(1);
    translateRef.current = clamped;
    setTranslate(clamped);
  }, [
    baseSize.height,
    baseSize.width,
    clampTranslate,
    containerSize.height,
    containerSize.width,
  ]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
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

  const drawRef = useRef({
    pixelMap,
    width,
    height,
    baseCellSize,
    selectedColor,
    highlightedPixels,
    moveOverlay,
    showHoverIndicator: !movePreviewActive,
  });

  useEffect(() => {
    drawRef.current = {
      pixelMap,
      width,
      height,
      baseCellSize,
      selectedColor,
      highlightedPixels,
      moveOverlay,
      showHoverIndicator: !movePreviewActive,
    };
  }, [
    pixelMap,
    width,
    height,
    baseCellSize,
    selectedColor,
    highlightedPixels,
    moveOverlay,
    movePreviewActive,
  ]);

  const scheduleRedraw = useCallback(() => {
    if (needsDrawRef.current) {
      return;
    }
    needsDrawRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      needsDrawRef.current = false;
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const d = drawRef.current;
      const dpr = window.devicePixelRatio || 1;
      drawGrid(
        ctx,
        d.pixelMap,
        d.width,
        d.height,
        d.baseCellSize,
        CELL_GAP,
        hoveredCellRef.current,
        hoverPointerRef.current,
        d.selectedColor,
        translateRef.current,
        scaleRef.current,
        canvas.width / dpr,
        canvas.height / dpr,
        d.highlightedPixels,
        d.moveOverlay,
        d.showHoverIndicator,
      );
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerSize.width || !containerSize.height) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(containerSize.width * dpr));
    const h = Math.max(1, Math.round(containerSize.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scheduleRedraw();
  }, [containerSize.width, containerSize.height, scheduleRedraw]);

  useEffect(() => {
    scheduleRedraw();
  }, [
    pixelMap,
    width,
    height,
    baseCellSize,
    selectedColor,
    translate,
    scale,
    highlightedPixels,
    moveOverlay,
    scheduleRedraw,
  ]);

  useEffect(() => {
    if (
      (!highlightedPixels || highlightedPixels.size === 0) &&
      (!moveOverlay || moveOverlay.map.size === 0)
    ) {
      return;
    }
    let animId = 0;
    const loop = () => {
      scheduleRedraw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [highlightedPixels, moveOverlay, scheduleRedraw]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      needsDrawRef.current = false;
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current);
      }
    };
  }, []);

  // Reset preview state when move preview props change (React "setState during render" pattern)
  const [prevMovePreview, setPrevMovePreview] = useState({
    active: movePreviewActive,
    pixels: movePreviewPixels,
  });
  if (
    prevMovePreview.active !== movePreviewActive ||
    prevMovePreview.pixels !== movePreviewPixels
  ) {
    setPrevMovePreview({ active: movePreviewActive, pixels: movePreviewPixels });
    if (!movePreviewActive || !movePreviewPixels || movePreviewPixels.length === 0) {
      setPreviewPos(null);
      setPreviewCell(null);
      setIsPreviewDragging(false);
    }
  }
  // Ref cleanup in effect (no setState, so no cascading render)
  useEffect(() => {
    if (!movePreviewActive || !movePreviewPixels || movePreviewPixels.length === 0) {
      dragOffsetRef.current = null;
      dragPointerIdRef.current = null;
    }
  }, [movePreviewActive, movePreviewPixels]);

  useEffect(() => {
    if (!containerSize.width || !containerSize.height) {
      return;
    }
    const clamped = clampTranslate(
      translateRef.current.x,
      translateRef.current.y,
      scaleRef.current,
    );
    translateRef.current = clamped;
    setTranslate(clamped);
  }, [baseSize.height, baseSize.width, clampTranslate, containerSize]);

  useEffect(() => {
    return () => {
      if (edgeSwipeTimeoutRef.current) {
        window.clearTimeout(edgeSwipeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const isTrackpadPinch = event.ctrlKey === true;

      if (isTrackpadPinch) {
        const rect = container.getBoundingClientRect();
        const focusX = event.clientX - rect.left;
        const focusY = event.clientY - rect.top;
        const zoomFactor = Math.exp(-event.deltaY * 0.004);
        zoomTo(scaleRef.current * zoomFactor, focusX, focusY);
      } else {
        setTranslateSafe({
          x: translateRef.current.x - event.deltaX,
          y: translateRef.current.y - event.deltaY,
        });
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomTo, setTranslateSafe]);

  const updatePreviewCell = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const cell = hitTest(
        clientX,
        clientY,
        rect,
        translateRef.current,
        scaleRef.current,
        baseCellSize,
        CELL_GAP,
        width,
        height,
      );
      setPreviewCell((prev) => {
        if (!cell) {
          return prev ? null : prev;
        }
        if (prev && prev.x === cell.x && prev.y === cell.y) {
          return prev;
        }
        return cell;
      });
    },
    [baseCellSize, height, width],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, pointer);

    clickOriginRef.current = { x: event.clientX, y: event.clientY };

    if (movePreviewActive && !isCoarsePointer) {
      updatePreviewCell(event.clientX, event.clientY);
    }

    event.stopPropagation();

    if (pointers.size === 2) {
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

    if (isFreeModePainting) {
      isPaintStrokeRef.current = true;
      didPaintStrokeRef.current = true;
      lastPaintedCellRef.current = null;
      onStrokeStart?.();
      hoveredCellRef.current = null;
      scheduleRedraw();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cell = hitTest(
          event.clientX,
          event.clientY,
          rect,
          translateRef.current,
          scaleRef.current,
          baseCellSize,
          CELL_GAP,
          width,
          height,
        );
        if (cell) {
          (onFreePaint ?? onPixelClick)(cell.x, cell.y);
          lastPaintedCellRef.current = cell;
        }
      }
      setIsInteracting(true);
      return;
    }

    panRef.current = {
      startX: pointer.x,
      startY: pointer.y,
      startTranslate: { ...translateRef.current },
    };
    edgeSwipeTriggeredRef.current = false;
    setIsInteracting(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;

    if (event.pointerType !== "touch" || (movePreviewActive && !isCoarsePointer)) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cell = hitTest(
          event.clientX,
          event.clientY,
          rect,
          translateRef.current,
          scaleRef.current,
          baseCellSize,
          CELL_GAP,
          width,
          height,
        );
        if (movePreviewActive) {
          updatePreviewCell(event.clientX, event.clientY);
        }
        hoverPointerRef.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        if (
          movePreviewActive &&
          movePreviewPixels &&
          movePreviewPixels.length > 0 &&
          !isCoarsePointer
        ) {
          const nextPos = hoverPointerRef.current;
          if (!previewRafRef.current) {
            previewRafRef.current = requestAnimationFrame(() => {
              previewRafRef.current = null;
              setPreviewPos(nextPos);
            });
          }
        }
        const prev = hoveredCellRef.current;
        const hideHoverDuringStroke =
          isFreeModePainting && isPaintStrokeRef.current;
        const nextHover = hideHoverDuringStroke ? null : cell;
        if (nextHover?.x !== prev?.x || nextHover?.y !== prev?.y) {
          hoveredCellRef.current = nextHover;
          scheduleRedraw();
        } else {
          scheduleRedraw();
        }
      }
    }

    if (!pointers.has(event.pointerId)) {
      return;
    }
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

    if (isFreeModePainting && isPaintStrokeRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cell = hitTest(
          event.clientX,
          event.clientY,
          rect,
          translateRef.current,
          scaleRef.current,
          baseCellSize,
          CELL_GAP,
          width,
          height,
          FREE_PAINT_CELL_INSET,
        );
        const last = lastPaintedCellRef.current;
        if (cell && (last?.x !== cell.x || last?.y !== cell.y)) {
          if (last) {
            const gap = lineCells(last.x, last.y, cell.x, cell.y);
            for (const g of gap) {
              (onFreePaint ?? onPixelClick)(g.x, g.y);
            }
          } else {
            (onFreePaint ?? onPixelClick)(cell.x, cell.y);
          }
          lastPaintedCellRef.current = cell;
        }
      }
      return;
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
    const hadPaintStroke = didPaintStrokeRef.current;
    if (pointers.size === 0) {
      panRef.current = null;
      setIsInteracting(false);
      edgeSwipeTriggeredRef.current = false;
      isPaintStrokeRef.current = false;
      lastPaintedCellRef.current = null;
      didPaintStrokeRef.current = false;
      if (hadPaintStroke) {
        onStrokeEnd?.();
      }
    }

    if (movePreviewActive && !isCoarsePointer) {
      updatePreviewCell(event.clientX, event.clientY);
    }

    const origin = clickOriginRef.current;
    if (
      !hadPaintStroke &&
      origin &&
      !edgeSwipeTriggeredRef.current &&
      !pinchRef.current
    ) {
      if (movePreviewActive && isCoarsePointer) {
        clickOriginRef.current = null;
        return;
      }
      const dist = Math.hypot(
        event.clientX - origin.x,
        event.clientY - origin.y,
      );
      const clickThreshold = event.pointerType === "touch" ? 12 : 4;
      if (dist < clickThreshold) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cell = hitTest(
            event.clientX,
            event.clientY,
            rect,
            translateRef.current,
            scaleRef.current,
            baseCellSize,
            CELL_GAP,
            width,
            height,
          );
          if (cell) {
            onPixelClick(cell.x, cell.y);
          }
        }
      }
    }
    clickOriginRef.current = null;

    if (event.pointerType === "touch") {
      const rect = containerRef.current?.getBoundingClientRect();
      const tapX = event.clientX - (rect?.left ?? 0);
      const tapY = event.clientY - (rect?.top ?? 0);
      const now = Date.now();
      const prev = lastTapRef.current;
      const dist = Math.hypot(prev.x - tapX, prev.y - tapY);
      if (now - prev.time < 300 && dist < 24) {
        if (scaleRef.current > MIN_ZOOM + 0.01) {
          resetView();
        } else {
          zoomTo(scaleRef.current * ZOOM_STEP, tapX, tapY);
        }
        lastTapRef.current = { time: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { time: now, x: tapX, y: tapY };
      }
    }
  };

  const handleMouseLeave = () => {
    if (hoveredCellRef.current) {
      hoveredCellRef.current = null;
      hoverPointerRef.current = null;
      if (!isCoarsePointer) {
        setPreviewPos(null);
      }
      setPreviewCell(null);
      scheduleRedraw();
    }
  };

  const handlePreviewPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isCoarsePointer || !movePreviewActive) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    dragPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPreviewDragging(true);
    const dock = getDockPosition();
    if (!previewPos) {
      setPreviewPos({ x: dock.left, y: dock.top });
    }
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    updatePreviewCell(event.clientX, event.clientY);
  };

  const handlePreviewPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isCoarsePointer) {
      return;
    }
    if (dragPointerIdRef.current !== event.pointerId || !isPreviewDragging) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect || !dragOffsetRef.current) {
      return;
    }
    const maxX = Math.max(
      PREVIEW_MARGIN,
      containerSize.width - PREVIEW_MAX - PREVIEW_MARGIN,
    );
    const maxY = Math.max(
      PREVIEW_MARGIN,
      containerSize.height - PREVIEW_MAX - PREVIEW_MARGIN,
    );
    const nextLeft =
      event.clientX - containerRect.left - dragOffsetRef.current.x;
    const nextTop = event.clientY - containerRect.top - dragOffsetRef.current.y;
    setPreviewPos({
      x: clamp(nextLeft, PREVIEW_MARGIN, maxX),
      y: clamp(nextTop, PREVIEW_MARGIN, maxY),
    });
    updatePreviewCell(event.clientX, event.clientY);
  };

  const handlePreviewPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isCoarsePointer) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    if (dragPointerIdRef.current !== event.pointerId) {
      return;
    }
    dragPointerIdRef.current = null;
    dragOffsetRef.current = null;
    setIsPreviewDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cell = hitTest(
        event.clientX,
        event.clientY,
        rect,
        translateRef.current,
        scaleRef.current,
        baseCellSize,
        CELL_GAP,
        width,
        height,
      );
      if (cell) {
        setPreviewCell(cell);
        onPixelClick(cell.x, cell.y);
      }
    }
    setPreviewPos(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseLeave={handleMouseLeave}
      className={`relative h-full w-full overflow-hidden select-none touch-none ${
        isFreeModePainting
          ? "cursor-crosshair"
          : movePreviewActive
            ? isInteracting
              ? "cursor-grabbing"
              : "cursor-crosshair"
            : isInteracting
              ? "cursor-grabbing"
              : "cursor-pointer"
      } ${edgeSwipeFeedback === "next" ? "edge-swipe-next" : ""} ${edgeSwipeFeedback === "prev" ? "edge-swipe-prev" : ""}`}
    >
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-black/10 bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm dark:border-white/10"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
      >
        <span className="rounded-full  text-[11px] font-medium text-foreground">
          {Number.isFinite(scale)
            ? `${Math.abs(scale - 1) < 0.01 ? "1" : scale.toFixed(scale < 2 ? 2 : 1)}x`
            : "1x"}
        </span>
        <button
          type="button"
          aria-label="Oddálit"
          onClick={() => zoomBy(-1)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Resetovat zoom"
          onClick={resetView}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Přiblížit"
          onClick={() => zoomBy(1)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      {isCoarsePointer &&
        movePreviewActive &&
        movePreviewPixels &&
        movePreviewPixels.length > 0 &&
        previewStyle && (
          <div
            className={`absolute ${
              isCoarsePointer ? "pointer-events-auto" : "pointer-events-none"
            } ${isPreviewDragging ? "opacity-0" : "opacity-100"}`}
            style={previewStyle}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
          >
            <div className="rounded-2xl bg-background/90 p-2 shadow-lg backdrop-blur">
              <PixelPreview pixels={previewPixels} maxSize={PREVIEW_MAX} />
            </div>
          </div>
        )}
    </div>
  );
}
