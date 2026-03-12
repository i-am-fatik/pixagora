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
};

function computeLayout(
  pixels: { x: number; y: number; color: string }[],
  maxSize: number,
): GridLayout | null {
  if (pixels.length === 0) {return null;}

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of pixels) {
    if (p.x < minX) {minX = p.x;}
    if (p.y < minY) {minY = p.y;}
    if (p.x > maxX) {maxX = p.x;}
    if (p.y > maxY) {maxY = p.y;}
  }

  const width = maxX - minX + 1 + 2;
  const height = maxY - minY + 1 + 2;
  const maxDim = Math.max(width, height);
  // At least 1 canvas pixel per cell — CSS handles downscaling
  const cell = Math.max(1, Math.floor(maxSize / maxDim));

  return { minX, minY, width, height, cell };
}

function drawPreview(
  canvas: HTMLCanvasElement,
  pixels: { x: number; y: number; color: string }[],
  layout: GridLayout,
): void {
  const { minX, minY, width, height, cell } = layout;

  const canvasW = width * cell;
  const canvasH = height * cell;

  if (canvas.width !== canvasW || canvas.height !== canvasH) {
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {return;}

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.imageSmoothingEnabled = false;

  for (const p of pixels) {
    const x = (p.x - minX + 1) * cell;
    const y = (p.y - minY + 1) * cell;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, cell, cell);
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
    if (!canvas || !layout) {return;}
    drawPreview(canvas, pixels, layout);
  }, [pixels, layout]);

  if (!layout) {return null;}

  // Canvas resolution (integer pixels, no fractional rendering)
  const canvasW = layout.width * layout.cell;
  const canvasH = layout.height * layout.cell;
  // CSS display size: fit into maxSize
  const maxDim = Math.max(canvasW, canvasH);
  const displayRatio = maxDim > maxSize ? maxSize / maxDim : 1;
  const displayW = Math.round(canvasW * displayRatio);
  const displayH = Math.round(canvasH * displayRatio);

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
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
