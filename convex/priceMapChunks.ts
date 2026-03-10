import { query, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { rowsPerChunk, chunkCount, chunkIndexForRow, chunkRowRange } from "./priceMapLayout";

// ---------------------------------------------------------------------------
// Public query: client subscribes to all chunks for a canvas
// ---------------------------------------------------------------------------
export const getChunksForCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    return await ctx.db
      .query("priceMapChunks")
      .withIndex("by_canvas_chunk", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Helper: apply sparse price updates to affected chunks (inline in mutations)
// Called directly from pixels.ts commit, upsertPixelBatch, writeBatchNoRead
// ---------------------------------------------------------------------------
export async function applyPriceUpdates(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  canvasWidth: number,
  canvasHeight: number,
  pixels: { x: number; y: number; price: number }[],
): Promise<void> {
  if (pixels.length === 0) return;

  const rpc = rowsPerChunk(canvasWidth);

  // Group pixels by chunk index
  const byChunk = new Map<number, { x: number; y: number; price: number }[]>();
  for (const px of pixels) {
    const ci = chunkIndexForRow(px.y, canvasWidth);
    let list = byChunk.get(ci);
    if (!list) {
      list = [];
      byChunk.set(ci, list);
    }
    list.push(px);
  }

  const now = Date.now();

  for (const [ci, pxList] of byChunk) {
    // Load existing chunk
    const existing = await ctx.db
      .query("priceMapChunks")
      .withIndex("by_canvas_chunk", (q) =>
        q.eq("canvasId", canvasId).eq("chunkIndex", ci),
      )
      .unique();

    const { rowStart, rowEnd } = chunkRowRange(ci, canvasWidth, canvasHeight);
    const chunkPixels = (rowEnd - rowStart) * canvasWidth;

    let arr: Uint16Array;
    if (existing) {
      // Copy existing data (slice to avoid aliasing the DB buffer)
      arr = new Uint16Array(existing.data.slice(0));
    } else {
      // Lazy init: create zeroed chunk
      arr = new Uint16Array(chunkPixels);
    }

    // Patch prices
    for (const px of pxList) {
      const localY = px.y - rowStart;
      const idx = localY * canvasWidth + px.x;
      arr[idx] = Math.min(px.price, 65535);
    }

    if (existing) {
      await ctx.db.patch(existing._id, { data: arr.buffer as ArrayBuffer, updatedAt: now });
    } else {
      await ctx.db.insert("priceMapChunks", {
        canvasId,
        chunkIndex: ci,
        data: arr.buffer as ArrayBuffer,
        rowStart,
        rowEnd,
        canvasWidth,
        updatedAt: now,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Internal mutation: wrapper for applyPriceUpdates (called from actions)
// ---------------------------------------------------------------------------
export const patchChunks = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    canvasWidth: v.number(),
    canvasHeight: v.number(),
    pixels: v.array(v.object({ x: v.number(), y: v.number(), price: v.number() })),
  },
  handler: async (ctx, { canvasId, canvasWidth, canvasHeight, pixels }) => {
    await applyPriceUpdates(ctx, canvasId, canvasWidth, canvasHeight, pixels);
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: write a single chunk (used by snapshot.ts for full rebuild)
// Receives raw ArrayBuffer data for the chunk — avoids 8192-element array limit.
// ---------------------------------------------------------------------------
export const writeChunk = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    chunkIndex: v.number(),
    data: v.bytes(),
    rowStart: v.number(),
    rowEnd: v.number(),
    canvasWidth: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("priceMapChunks")
      .withIndex("by_canvas_chunk", (q) =>
        q.eq("canvasId", args.canvasId).eq("chunkIndex", args.chunkIndex),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data, updatedAt: now });
    } else {
      await ctx.db.insert("priceMapChunks", {
        canvasId: args.canvasId,
        chunkIndex: args.chunkIndex,
        data: args.data,
        rowStart: args.rowStart,
        rowEnd: args.rowEnd,
        canvasWidth: args.canvasWidth,
        updatedAt: now,
      });
    }
  },
});

