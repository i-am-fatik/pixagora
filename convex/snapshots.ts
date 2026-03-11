import { internalMutation, internalQuery, query, httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Query: get latest snapshot URL for a canvas
// ---------------------------------------------------------------------------
export const getLatestSnapshot = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const snapshot = await ctx.db
      .query("canvasSnapshots")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .order("desc")
      .first();
    if (!snapshot) {return null;}
    const url = await ctx.storage.getUrl(snapshot.storageId);
    return {
      url,
      pixelCount: snapshot.pixelCount,
      createdAt: snapshot.createdAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal query: get snapshot metadata for incremental updates
// ---------------------------------------------------------------------------
export const getSnapshotMeta = internalQuery({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const snapshot = await ctx.db
      .query("canvasSnapshots")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .order("desc")
      .first();
    if (!snapshot) {return null;}
    return {
      _id: snapshot._id,
      storageId: snapshot.storageId,
      pixelCount: snapshot.pixelCount,
      createdAt: snapshot.createdAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: save snapshot metadata + clean up old ones
// ---------------------------------------------------------------------------
export const saveSnapshot = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    storageId: v.id("_storage"),
    pixelCount: v.number(),
  },
  handler: async (ctx, { canvasId, storageId, pixelCount }) => {
    // Delete previous snapshots for this canvas
    const old = await ctx.db
      .query("canvasSnapshots")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    for (const snap of old) {
      await ctx.storage.delete(snap.storageId);
      if (snap.priceMapStorageId) {
        try { await ctx.storage.delete(snap.priceMapStorageId); } catch {}
      }
      await ctx.db.delete(snap._id);
    }

    const now = Date.now();
    await ctx.db.insert("canvasSnapshots", {
      canvasId,
      storageId,
      pixelCount,
      createdAt: now,
    });
  },
});


// ---------------------------------------------------------------------------
// HTTP handler: serve stored snapshot PNG for a canvas
// GET /api/canvas/<canvasId>/snapshot.png
// Redirects to the stored file URL, or returns 404 if no snapshot exists.
// ---------------------------------------------------------------------------
export const servePng = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // Expected: ["api", "canvas", "<canvasId>", "snapshot.png"]
  const canvasIdRaw = segments[2];
  if (!canvasIdRaw) {
    return new Response("Missing canvas ID", { status: 400 });
  }

  const canvasId = canvasIdRaw as Id<"canvases">;
  const canvas = await ctx.runQuery(api.canvases.getById, { id: canvasId });
  if (!canvas) {
    return new Response("Canvas not found", { status: 404 });
  }

  const snapshot = await ctx.runQuery(api.snapshots.getLatestSnapshot, {
    canvasId,
  });
  if (!snapshot?.url) {
    return new Response("No snapshot available", { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: snapshot.url,
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
    },
  });
});
