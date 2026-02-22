import { useMemo } from "react";

function hexLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  if (raw.length < 6) {
    return 0.5;
  }
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

type PixelPreviewProps = {
  pixels: { x: number; y: number; color: string }[];
  maxSize?: number;
};

export function PixelPreview({ pixels, maxSize = 140 }: PixelPreviewProps) {
  const grid = useMemo(() => {
    if (!pixels.length) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let lumSum = 0;
    for (const p of pixels) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      lumSum += hexLuminance(p.color);
    }
    const avgLum = lumSum / pixels.length;
    const width = maxX - minX + 1 + 2;
    const height = maxY - minY + 1 + 2;
    const cell = Math.max(1, Math.floor(maxSize / Math.max(width, height)));
    return { minX, minY, width, height, cell, avgLum };
  }, [pixels, maxSize]);

  if (!grid) {
    return null;
  }

  const bg = grid.avgLum > 0.6 ? "#1a1a1a" : grid.avgLum > 0.35 ? "#9a9a9a" : "#e5e5e5";

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{
        width: grid.width * grid.cell,
        height: grid.height * grid.cell,
        backgroundColor: bg,
      }}
    >
      {pixels.map((p) => {
        const left = (p.x - grid.minX + 1) * grid.cell;
        const top = (p.y - grid.minY + 1) * grid.cell;
        return (
          <span
            key={`${p.x}-${p.y}-${p.color}`}
            className="absolute"
            style={{
              left,
              top,
              width: grid.cell,
              height: grid.cell,
              backgroundColor: p.color,
            }}
          />
        );
      })}
    </div>
  );
}
