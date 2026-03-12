"use client";

import { useEffect, useReducer, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { fixConvexUrl } from "./fixConvexUrl";

declare global {
  interface Window {
    __SNAPSHOT_PRELOAD_URL__?: string;
  }
}

// ---------------------------------------------------------------------------
// Compact pixel data: Uint32Array indexed by y * width + x
// Each entry: 0 = empty, non-zero = 0xFF000000 | (R << 16) | (G << 8) | B
// ---------------------------------------------------------------------------
export type SnapshotPixelData = {
  pixels: Uint32Array;
  width: number;
  height: number;
};

export function packedToHex(packed: number): string {
  const r = (packed >> 16) & 0xff;
  const g = (packed >> 8) & 0xff;
  const b = packed & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Module-level snapshot cache (survives React re-renders, used for canvas swipe)
// ---------------------------------------------------------------------------
type CachedSnapshot = {
  pixelData: SnapshotPixelData;
  bitmap: ImageBitmap;
  createdAt: number;
  url: string;
};

const MAX_CACHED = 6;
const snapshotCache = new Map<string, CachedSnapshot>();

function evictOldest() {
  if (snapshotCache.size <= MAX_CACHED) return;
  const firstKey = snapshotCache.keys().next().value;
  if (firstKey !== undefined) {
    const entry = snapshotCache.get(firstKey);
    entry?.bitmap.close();
    snapshotCache.delete(firstKey);
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
type Phase = "idle" | "loading" | "bitmap_ready" | "complete" | "error";

type SnapshotState = {
  phase: Phase;
  bitmap: ImageBitmap | null;
  pixelData: SnapshotPixelData | null;
  createdAt: number | null;
  hasNoSnapshot: boolean;
  decodedUrl: string | null;
};

type SnapshotAction =
  | { type: "fetch_start" }
  | { type: "re_fetch_start" }
  | { type: "bitmap_decoded"; bitmap: ImageBitmap; url: string }
  | { type: "pixel_data_ready"; pixelData: SnapshotPixelData }
  | { type: "ws_enrich"; createdAt: number }
  | { type: "ws_no_snapshot" }
  | { type: "load_from_cache"; cached: CachedSnapshot }
  | { type: "fetch_error" }
  | { type: "reset" };

const INITIAL_STATE: SnapshotState = {
  phase: "idle",
  bitmap: null,
  pixelData: null,
  createdAt: null,
  hasNoSnapshot: false,
  decodedUrl: null,
};

function snapshotReducer(state: SnapshotState, action: SnapshotAction): SnapshotState {
  switch (action.type) {
    case "fetch_start":
      return { ...INITIAL_STATE, phase: "loading" };
    case "re_fetch_start":
      return { ...state, phase: "loading" };
    case "bitmap_decoded":
      return { ...state, phase: "bitmap_ready", bitmap: action.bitmap, decodedUrl: action.url };
    case "pixel_data_ready":
      return { ...state, phase: "complete", pixelData: action.pixelData };
    case "ws_enrich":
      return { ...state, createdAt: action.createdAt };
    case "ws_no_snapshot":
      return { ...state, phase: "complete", hasNoSnapshot: true };
    case "load_from_cache": {
      const c = action.cached;
      return {
        phase: "complete",
        bitmap: c.bitmap,
        pixelData: c.pixelData,
        createdAt: c.createdAt,
        hasNoSnapshot: false,
        decodedUrl: c.url,
      };
    }
    case "fetch_error":
      return { ...state, phase: "error" };
    case "reset":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSnapshotLoader(canvasId: Id<"canvases"> | undefined) {
  const [state, dispatch] = useReducer(snapshotReducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasIdRef = useRef<string | null>(null);
  const eagerStartedRef = useRef(false);
  const wsProcessedForRef = useRef<string | null>(null);

  const snapshotData = useQuery(
    api.snapshots.getLatestSnapshot,
    canvasId ? { canvasId } : "skip",
  );

  // ── Shared decode pipeline ──
  function fetchAndDecode(
    url: string,
    knownCreatedAt: number | null,
    targetCanvasId: string | null,
    isRefetch: boolean,
  ) {
    dispatch(isRefetch ? { type: "re_fetch_start" } : { type: "fetch_start" });

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Snapshot fetch failed: ${response.status}`);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        dispatch({ type: "bitmap_decoded", bitmap, url });
        if (knownCreatedAt !== null) {
          dispatch({ type: "ws_enrich", createdAt: knownCreatedAt });
        }

        // Phase 2: deferred Uint32Array (off critical path)
        await new Promise<void>((r) => setTimeout(r, 0));

        const w = bitmap.width;
        const h = bitmap.height;
        const offscreen = new OffscreenCanvas(w, h);
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2d context");
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const len = w * h;
        const pixels = new Uint32Array(len);
        for (let i = 0; i < len; i++) {
          const idx = i * 4;
          if (data[idx + 3] < 128) continue;
          pixels[i] = 0xff000000 | (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
        }
        const pixelData: SnapshotPixelData = { pixels, width: w, height: h };
        dispatch({ type: "pixel_data_ready", pixelData });

        // Cache (skip for eager path where canvasId is unknown)
        if (targetCanvasId) {
          const currentCreatedAt = stateRef.current.createdAt ?? knownCreatedAt ?? 0;
          const old = snapshotCache.get(targetCanvasId);
          if (old && old.bitmap !== bitmap) old.bitmap.close();
          snapshotCache.set(targetCanvasId, { pixelData, bitmap, createdAt: currentCreatedAt, url });
          evictOldest();
        }
      } catch (err) {
        console.warn("Snapshot decode failed:", err);
        dispatch({ type: "fetch_error" });
      }
    })();
  }

  // ── Eager fetch: single HTTP request on mount, no WS needed ──
  useEffect(() => {
    if (eagerStartedRef.current) return;
    const preloadUrl = typeof window !== "undefined" ? window.__SNAPSHOT_PRELOAD_URL__ : undefined;
    if (!preloadUrl) return;
    eagerStartedRef.current = true;
    delete window.__SNAPSHOT_PRELOAD_URL__;
    fetchAndDecode(preloadUrl, null, null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WS enrichment: createdAt, canvas switches, snapshot changes ──
  useEffect(() => {
    if (!canvasId) return;
    const canvasIdStr = canvasId as string;

    // Canvas switch: check cache
    if (canvasIdRef.current !== canvasIdStr) {
      canvasIdRef.current = canvasIdStr;
      wsProcessedForRef.current = null;
      const cached = snapshotCache.get(canvasIdStr);
      if (cached) {
        dispatch({ type: "load_from_cache", cached });
        return;
      }
    }

    if (snapshotData === undefined) return;
    if (wsProcessedForRef.current === canvasIdStr) return;

    if (snapshotData === null) {
      wsProcessedForRef.current = canvasIdStr;
      dispatch({ type: "ws_no_snapshot" });
      return;
    }

    const current = stateRef.current;
    const wsUrl = snapshotData.url ?? null;

    // Eager decode already loaded a bitmap — just enrich with createdAt
    if (current.bitmap && current.phase !== "idle" && current.phase !== "loading") {
      wsProcessedForRef.current = canvasIdStr;
      if (snapshotData.createdAt) {
        dispatch({ type: "ws_enrich", createdAt: snapshotData.createdAt });
      }
      // Write eager-loaded bitmap to cache under the now-known canvasId
      if (current.pixelData && current.bitmap) {
        const old = snapshotCache.get(canvasIdStr);
        if (old && old.bitmap !== current.bitmap) old.bitmap.close();
        snapshotCache.set(canvasIdStr, {
          pixelData: current.pixelData,
          bitmap: current.bitmap,
          createdAt: snapshotData.createdAt ?? 0,
          url: wsUrl ?? current.decodedUrl ?? "",
        });
        evictOldest();
      }
      return;
    }

    // No bitmap yet — fetch from WS URL
    if (wsUrl && current.phase !== "loading") {
      wsProcessedForRef.current = canvasIdStr;
      fetchAndDecode(
        fixConvexUrl(wsUrl),
        snapshotData.createdAt ?? null,
        canvasIdStr,
        current.phase !== "idle",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, snapshotData]);

  const snapshotReady =
    state.phase === "bitmap_ready" ||
    state.phase === "complete" ||
    state.phase === "error" ||
    state.hasNoSnapshot;

  return {
    snapshotPixelData: state.pixelData,
    snapshotBitmap: state.bitmap,
    snapshotReady,
    snapshotLoading: state.phase === "loading",
    snapshotCreatedAt: state.createdAt,
  };
}
