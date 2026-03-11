"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type SnapshotPixelMap = Map<string, string>; // "x,y" → "#rrggbb"

type CachedSnapshot = {
  pixels: SnapshotPixelMap;
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
 * Loads the canvas snapshot PNG and decodes it into a pixel map.
 * Caches decoded snapshots per canvas so switching back is instant.
 *
 * Price map is now handled separately by usePriceMap hook (reactive chunks).
 */
export function useSnapshotLoader(canvasId: Id<"canvases"> | undefined) {
  const [snapshotPixels, setSnapshotPixels] = useState<SnapshotPixelMap | null>(
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

        const pixels: SnapshotPixelMap = new Map();
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a < 128) {continue;}
            const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
            pixels.set(`${x},${y}`, hex);
          }
        }

        if (loadedCanvasRef.current === canvasIdStr) {
          decodedUrlRef.current = url;
          setSnapshotPixels(pixels);
          setSnapshotBitmap(bitmap);
          setSnapshotCreatedAt(createdAt);
          setSnapshotReady(true);
        }

        // Update cache
        const old = snapshotCache.get(canvasIdStr);
        if (old && old.bitmap !== bitmap) {
          old.bitmap.close();
        }
        snapshotCache.set(canvasIdStr, { pixels, bitmap, createdAt, url });
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
      setSnapshotPixels(null);
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
        setSnapshotPixels(cached.pixels);
        setSnapshotBitmap(cached.bitmap);
        setSnapshotCreatedAt(cached.createdAt);
        setSnapshotReady(true);
      } else {
        setSnapshotPixels(null);
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
    snapshotPixels,
    /** Raw decoded ImageBitmap for fast Canvas rendering (avoids hex string re-parsing) */
    snapshotBitmap,
    snapshotReady,
    snapshotLoading,
    /** Timestamp of the snapshot — use for delta loading (pixels after this) */
    snapshotCreatedAt,
  };
}
