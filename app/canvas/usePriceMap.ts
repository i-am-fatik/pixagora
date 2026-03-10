"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Subscribes to price map chunks for a canvas and assembles them into
 * a flat Uint16Array. Reactive: updates automatically when any chunk changes.
 *
 * Returns null when chunks haven't been initialized yet (old canvas fallback).
 * Price lookup: priceMap[y * canvasWidth + x] — 0 means unpainted pixel.
 */
export function usePriceMap(
  canvasId: Id<"canvases"> | undefined,
  canvasWidth: number,
  canvasHeight: number,
): Uint16Array | null {
  const chunks = useQuery(
    api.priceMapChunks.getChunksForCanvas,
    canvasId ? { canvasId } : "skip",
  );

  return useMemo(() => {
    if (!chunks || chunks.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      return null;
    }

    const totalPixels = canvasWidth * canvasHeight;
    const priceMap = new Uint16Array(totalPixels);

    for (const chunk of chunks) {
      const src = new Uint16Array(chunk.data);
      const destOffset = chunk.rowStart * canvasWidth;
      priceMap.set(src, destOffset);
    }

    return priceMap;
  }, [chunks, canvasWidth, canvasHeight]);
}
