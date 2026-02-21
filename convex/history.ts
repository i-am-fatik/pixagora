import { query } from "./_generated/server";
import { v } from "convex/values";

export const getTransactions = query({
  args: {
    canvasId: v.id("canvases"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { canvasId, limit }) => {
    const q = ctx.db
      .query("transactions")
      .withIndex("by_canvas_time", (q) => q.eq("canvasId", canvasId))
      .order("desc");

    if (limit) {
      return await q.take(limit);
    }
    return await q.collect();
  },
});

export const getTransactionsByUser = query({
  args: {
    userId: v.id("users"),
    canvasId: v.optional(v.id("canvases")),
  },
  handler: async (ctx, { userId, canvasId }) => {
    if (canvasId) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_user_canvas", (q) =>
          q.eq("userId", userId).eq("canvasId", canvasId)
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getCanvasStateAt = query({
  args: {
    canvasId: v.id("canvases"),
    timestamp: v.number(),
  },
  handler: async (ctx, { canvasId, timestamp }) => {
    const canvas = await ctx.db.get(canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_canvas_time", (q) =>
        q.eq("canvasId", canvasId).lte("timestamp", timestamp)
      )
      .order("asc")
      .collect();

    const pixelState = new Map<string, { x: number; y: number; color: string }>();

    for (const tx of txs) {
      for (const change of tx.changes) {
        const key = `${change.x},${change.y}`;
        pixelState.set(key, {
          x: change.x,
          y: change.y,
          color: change.color,
        });
      }
    }

    return {
      canvas: { width: canvas.width, height: canvas.height },
      pixels: Array.from(pixelState.values()),
      transactionCount: txs.length,
    };
  },
});
