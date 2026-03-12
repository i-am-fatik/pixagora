"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Compact pixel data: Uint32Array indexed by y * width + x
// Each entry: 0 = empty, non-zero = 0xFF000000 | (R << 16) | (G << 8) | B
// Memory: ~1 MB for 500×500 vs 40-80 MB for the old Map<"x,y", "#rrggbb">
// Build time: ~5 ms vs 50-200 ms (no string allocation)
// ---------------------------------------------------------------------------
export type SnapshotPixelData = {
  pixels: Uint32Array;
  width: number;
  height: number;
};

/** Convert a packed ARGB value back to "#rrggbb" hex string (on-demand, not bulk). */
export function packedToHex(packed: number): string {
  const r = (packed >> 16) & 0xff;
  const g = (packed >> 8) & 0xff;
  const b = packed & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type CachedSnapshot = {
  pixelData: SnapshotPixelData;
  bitmap: ImageBitmap;
  createdAt: number;
  url: string;
};

// Per-canvas snapshot cache — survives canvas switches, bounded by MAX_CACHED
const MAX_CACHED = 6;
const snapshotCache = new Map<string, CachedSnapshot>();

function evictOldest() {
  if (snapshotCache.size <= MAX_CACHED) {return;}
  const firstKey = snapshotCache.keys().next().value;
  if (firstKey !== undefined) {
    const entry = snapshotCache.get(firstKey);
    entry?.bitmap.close();
    snapshotCache.delete(firstKey);
  }
}

/**
 * Loads the canvas snapshot PNG and decodes it into a compact Uint32Array.
 * Caches decoded snapshots per canvas so switching back is instant.
 *
 * Price map is now handled separately by usePriceMap hook (reactive chunks).
 */
export function useSnapshotLoader(canvasId: Id<"canvases"> | undefined) {
  const [snapshotPixelData, setSnapshotPixelData] = useState<SnapshotPixelData | null>(
    null,
  );
  const [snapshotBitmap, setSnapshotBitmap] = useState<ImageBitmap | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [snapshotCreatedAt, setSnapshotCreatedAt] = useState<number | null>(null);
  const loadedCanvasRef = useRef<string | null>(null);
  const decodedUrlRef = useRef<string | null>(null);

  const snapshotData = useQuery(
    api.snapshots.getLatestSnapshot,
    canvasId ? { canvasId } : "skip",
  );

  const decodeSnapshotPng = useCallback(
    async (url: string, canvasIdStr: string, createdAt: number) => {
      setSnapshotLoading(true);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Snapshot fetch failed: ${response.status}`);
        }
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const w = bitmap.width;
        const h = bitmap.height;

        const offscreen = new OffscreenCanvas(w, h);
        const ctx = offscreen.getContext("2d");
        if (!ctx) {throw new Error("Failed to get 2d context");}

        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // Build compact Uint32Array — ~5ms for 500×500 (vs 50-200ms for hex string Map)
        const len = w * h;
        const pixels = new Uint32Array(len);
        for (let i = 0; i < len; i++) {
          const idx = i * 4;
          if (data[idx + 3] < 128) continue; // transparent → leave as 0
          pixels[i] = 0xff000000 | (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
        }
        const pixelData: SnapshotPixelData = { pixels, width: w, height: h };

        if (loadedCanvasRef.current === canvasIdStr) {
          decodedUrlRef.current = url;
          setSnapshotPixelData(pixelData);
          setSnapshotBitmap(bitmap);
          setSnapshotCreatedAt(createdAt);
          setSnapshotReady(true);
        }

        // Update cache
        const old = snapshotCache.get(canvasIdStr);
        if (old && old.bitmap !== bitmap) {
          old.bitmap.close();
        }
        snapshotCache.set(canvasIdStr, { pixelData, bitmap, createdAt, url });
        evictOldest();
      } catch (err) {
        console.warn("Snapshot decode failed, falling back to paginated load:", err);
        if (loadedCanvasRef.current === canvasIdStr) {
          decodedUrlRef.current = url;
          setSnapshotCreatedAt(null);
          setSnapshotReady(true);
        }
      } finally {
        setSnapshotLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canvasId) {
      setSnapshotPixelData(null);
      setSnapshotBitmap(null);
      setSnapshotReady(false);
      setSnapshotCreatedAt(null);
      loadedCanvasRef.current = null;
      decodedUrlRef.current = null;
      return;
    }

    const canvasIdStr = canvasId as string;

    if (loadedCanvasRef.current !== canvasIdStr) {
      loadedCanvasRef.current = canvasIdStr;
      decodedUrlRef.current = null;

      // Check cache — restore instantly if available
      const cached = snapshotCache.get(canvasIdStr);
      if (cached) {
        decodedUrlRef.current = cached.url;
        setSnapshotPixelData(cached.pixelData);
        setSnapshotBitmap(cached.bitmap);
        setSnapshotCreatedAt(cached.createdAt);
        setSnapshotReady(true);
      } else {
        setSnapshotPixelData(null);
        setSnapshotBitmap(null);
        setSnapshotReady(false);
        setSnapshotCreatedAt(null);
      }
    }

    if (snapshotData === undefined) {
      return;
    }

    if (snapshotData === null) {
      setSnapshotReady(true);
      setSnapshotCreatedAt(null);
      return;
    }

    // Full re-decode if PNG URL changed
    const isNewSnapshot = snapshotData.url !== decodedUrlRef.current;
    if (snapshotData.url && isNewSnapshot && !snapshotLoading) {
      decodeSnapshotPng(snapshotData.url, canvasIdStr, snapshotData.createdAt);
    }
  }, [canvasId, snapshotData, snapshotLoading, decodeSnapshotPng]);

  return {
    /** Compact pixel data: Uint32Array indexed by y * width + x */
    snapshotPixelData,
    /** Raw decoded ImageBitmap for fast Canvas rendering (avoids hex string re-parsing) */
    snapshotBitmap,
    snapshotReady,
    snapshotLoading,
    /** Timestamp of the snapshot — use for delta loading (pixels after this) */
    snapshotCreatedAt,
  };
}
