"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Jimp } from "jimp";
import { Id } from "./_generated/dataModel";
import { chunkCount, chunkRowRange } from "./priceMapLayout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type PixelRow = { x: number; y: number; color: string; price: number };

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("TimeoutError") || msg.includes("timed out");
      if (!isTimeout || attempt === retries) {throw err;}
      console.warn(`[${label}] Attempt ${attempt}/${retries} timed out, retrying...`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error("Unreachable");
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ---------------------------------------------------------------------------
// Fetch only pixels changed since a given timestamp (incremental)
// ---------------------------------------------------------------------------
async function fetchDeltaPixels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  canvasId: Id<"canvases">,
  since: number,
): Promise<PixelRow[]> {
  const allPixels: PixelRow[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: {
      page: PixelRow[];
      isDone: boolean;
      continueCursor: string;
    } = await withRetry("fetchDelta", () =>
      ctx.runQuery(internal.pixels.getPixelsDeltaForSnapshot, {
        canvasId,
        since,
        paginationOpts: { numItems: 500, cursor },
      }),
    );
    for (const px of result.page) {
      allPixels.push({ x: px.x, y: px.y, color: px.color, price: px.price });
    }
    isDone = result.isDone;
    cursor = result.continueCursor;
  }
  return allPixels;
}

// ---------------------------------------------------------------------------
// Fetch ALL pixels (full rebuild fallback, 500/page to avoid timeouts)
// ---------------------------------------------------------------------------
async function fetchAllPixels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  canvasId: Id<"canvases">,
): Promise<PixelRow[]> {
  const allPixels: PixelRow[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: {
      page: PixelRow[];
      isDone: boolean;
      continueCursor: string;
    } = await withRetry("fetchPixels", () =>
      ctx.runQuery(internal.pixels.getPixelsForSnapshot, {
        canvasId,
        paginationOpts: { numItems: 500, cursor },
      }),
    );
    for (const px of result.page) {
      allPixels.push({ x: px.x, y: px.y, color: px.color, price: px.price });
    }
    isDone = result.isDone;
    cursor = result.continueCursor;
  }
  return allPixels;
}

// ---------------------------------------------------------------------------
// Write price map chunks to DB (replaces gzipped file storage)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writePriceMapChunks(ctx: any, canvasId: Id<"canvases">, W: number, H: number, priceMap: Uint16Array): Promise<void> {
  // writeChunk uses upsert semantics — no need to delete first.
  // This avoids a non-atomic window where concurrent commits see empty chunks.
  const numChunks = chunkCount(W, H);
  for (let ci = 0; ci < numChunks; ci++) {
    const { rowStart, rowEnd } = chunkRowRange(ci, W, H);
    const slice = priceMap.slice(rowStart * W, rowEnd * W);
    await ctx.runMutation(internal.priceMapChunks.writeChunk, {
      canvasId,
      chunkIndex: ci,
      data: slice.buffer as ArrayBuffer,
      rowStart,
      rowEnd,
      canvasWidth: W,
    });
  }
}

// ---------------------------------------------------------------------------
// Action: generate snapshot PNG — incremental when possible, full rebuild fallback
// ---------------------------------------------------------------------------
export const generate = internalAction({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }): Promise<{ storageId: Id<"_storage">; pixelCount: number }> => {
    const canvas = await ctx.runQuery(api.canvases.getById, { id: canvasId });
    if (!canvas) {throw new Error("Canvas not found");}

    const W = canvas.width;
    const H = canvas.height;

    // --- Try incremental update from existing snapshot ---
    const existingSnap: { storageId: Id<"_storage">; pixelCount: number; createdAt: number } | null =
      await ctx.runQuery(internal.snapshots.getSnapshotMeta, { canvasId });

    if (existingSnap) {
      try {
        const existingBlobUrl: string | null = await ctx.runQuery(internal.pixels.getStorageBlobUrl, { storageId: existingSnap.storageId });
        if (existingBlobUrl) {
          const delta = await fetchDeltaPixels(ctx, canvasId, existingSnap.createdAt);

          if (delta.length === 0) {
            console.log(`[snapshot] No changes since last snapshot, skipping`);
            return { storageId: existingSnap.storageId, pixelCount: existingSnap.pixelCount };
          }

          console.log(`[snapshot] Incremental update: ${delta.length} changed pixels`);

          // Load existing PNG and overlay delta
          const res = await fetch(existingBlobUrl);
          if (!res.ok) {throw new Error(`Failed to fetch snapshot blob: ${res.status}`);}
          const existingBuffer = Buffer.from(await res.arrayBuffer());
          const img = await Jimp.read(existingBuffer);

          // Load existing price map from chunks (or create fresh)
          const priceMap = new Uint16Array(W * H);
          try {
            const chunks = await ctx.runQuery(api.priceMapChunks.getChunksForCanvas, { canvasId });
            for (const chunk of chunks) {
              const src = new Uint16Array(chunk.data);
              priceMap.set(src, chunk.rowStart * W);
            }
          } catch {
            // No chunks yet — start from zeros
          }

          for (const px of delta) {
            const [r, g, b] = parseHex(px.color);
            const idx = (px.y * W + px.x) * 4;
            img.bitmap.data[idx] = r;
            img.bitmap.data[idx + 1] = g;
            img.bitmap.data[idx + 2] = b;
            img.bitmap.data[idx + 3] = 255;
            priceMap[px.y * W + px.x] = Math.min(px.price, 65535);
          }

          const pngBuffer = await img.getBuffer("image/png");
          const pngBytes = new Uint8Array(pngBuffer);
          const blob = new Blob([pngBytes], { type: "image/png" });
          const storageId = await ctx.storage.store(blob);

          // Write price map chunks to DB
          await writePriceMapChunks(ctx, canvasId, W, H, priceMap);

          // Count non-transparent pixels
          let pixelCount = 0;
          for (let i = 3; i < img.bitmap.data.length; i += 4) {
            if (img.bitmap.data[i] > 0) {pixelCount++;}
          }

          await ctx.runMutation(internal.snapshots.saveSnapshot, {
            canvasId,
            storageId,
            pixelCount,
          });

          return { storageId, pixelCount };
        }
      } catch (err) {
        console.warn("[snapshot] Incremental update failed, falling back to full rebuild:", err);
      }
    }

    // --- Full rebuild (no existing snapshot or incremental failed) ---
    console.log(`[snapshot] Full rebuild for canvas ${canvasId}`);
    const pixels = await fetchAllPixels(ctx, canvasId);

    const data = new Uint8Array(W * H * 4);
    const priceMap = new Uint16Array(W * H);
    for (const px of pixels) {
      const [r, g, b] = parseHex(px.color);
      const idx = (px.y * W + px.x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
      priceMap[px.y * W + px.x] = Math.min(px.price, 65535);
    }

    const img = Jimp.fromBitmap({ width: W, height: H, data });
    const pngBuffer = await img.getBuffer("image/png");
    const pngBytes = new Uint8Array(pngBuffer);

    const blob = new Blob([pngBytes], { type: "image/png" });
    const storageId = await ctx.storage.store(blob);

    // Write price map chunks to DB
    await writePriceMapChunks(ctx, canvasId, W, H, priceMap);

    await ctx.runMutation(internal.snapshots.saveSnapshot, {
      canvasId,
      storageId,
      pixelCount: pixels.length,
    });

    return { storageId, pixelCount: pixels.length };
  },
});
