"use client";

import { useState } from "react";

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
};

export function Canvas({
  pixels,
  width,
  height,
  selectedColor,
  onPixelClick,
}: CanvasProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

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
            width: 60,
            height: 60,
            backgroundColor: isHovered
              ? selectedColor
              : color ?? "#e5e5e5",
            opacity: isHovered && !color ? 0.7 : 1,
            cursor: "pointer",
            border: "2px solid #d4d4d4",
            borderRadius: 4,
            transition: "background-color 0.1s",
          }}
        />
      );
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${width}, 60px)`,
        gap: 2,
        margin: "0 auto",
      }}
    >
      {cells}
    </div>
  );
}
