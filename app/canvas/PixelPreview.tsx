"use client";

import { memo, useEffect, useMemo, useRef } from "react";

type PixelPreviewProps = {
  pixels: { x: number; y: number; color: string }[];
  maxSize?: number;
};

type GridLayout = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  cell: number;
  scale: number;
};

function computeLayout(
  pixels: { x: number; y: number; color: string }[],
  maxSize: number,
): GridLayout | null {
  if (pixels.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of pixels) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX + 1 + 2;
  const height = maxY - minY + 1 + 2;
  const maxDim = Math.max(width, height);
  const cell = Math.max(1, Math.floor(maxSize / maxDim));
  const totalPx = maxDim * cell;
  const scale = totalPx > maxSize ? maxSize / totalPx : 1;

  return { minX, minY, width, height, cell, scale };
}

function drawPreview(
  canvas: HTMLCanvasElement,
  pixels: { x: number; y: number; color: string }[],
  layout: GridLayout,
): void {
  const { minX, minY, width, height, cell, scale } = layout;

  const canvasW = Math.round(width * cell * scale);
  const canvasH = Math.round(height * cell * scale);

  if (canvas.width !== canvasW || canvas.height !== canvasH) {
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const step = cell * scale;
  ctx.imageSmoothingEnabled = false;

  for (const p of pixels) {
    const x = (p.x - minX + 1) * step;
    const y = (p.y - minY + 1) * step;
    ctx.fillStyle = p.color;
    ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(step),
      Math.round(step),
    );
  }
}

export const PixelPreview = memo(function PixelPreview({
  pixels,
  maxSize = 140,
}: PixelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const layout = useMemo(
    () => computeLayout(pixels, maxSize),
    [pixels, maxSize],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    drawPreview(canvas, pixels, layout);
  }, [pixels, layout]);

  if (!layout) return null;

  const displayW = Math.round(layout.width * layout.cell * layout.scale);
  const displayH = Math.round(layout.height * layout.cell * layout.scale);

  return (
    <canvas
      ref={canvasRef}
      width={displayW}
      height={displayH}
      style={{
        display: "block",
        width: displayW,
        height: displayH,
        borderRadius: "0.5rem",
        imageRendering: "pixelated",
      }}
    />
  );
});
