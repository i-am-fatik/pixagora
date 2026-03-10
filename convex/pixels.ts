import { query, mutation, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { nextPixelPrice } from "./pricing";
import { computeCredits, computeTotalPaidCzk } from "./credits";
import { applyPriceUpdates } from "./priceMapChunks";

const MAX_BATCH_SIZE = 1000;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// Generate upload URL for client-side blob upload (used by commitFromBlob)
// ---------------------------------------------------------------------------
export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const getByCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const all = await ctx.db
      .query("pixels")
      .withIndex("by_canvas_xy", (q) => q.eq("canvasId", canvasId))
      .collect();
    if (all.length <= 8000) {
      return { chunks: [all] };
    }
    const chunks = [];
    for (let i = 0; i < all.length; i += 8000) {
      chunks.push(all.slice(i, i + 8000));
    }
    return { chunks };
  },
});

export const getByCanvasPaginated = query({
  args: { canvasId: v.id("canvases"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { canvasId, paginationOpts }) => {
    const safeOpts = {
      ...paginationOpts,
      numItems: Math.min(paginationOpts.numItems, 2000),
    };
    const result = await ctx.db
      .query("pixels")
      .withIndex("by_canvas_yx", (q) => q.eq("canvasId", canvasId))
      .paginate(safeOpts);
    // Hard-truncate: Convex can inflate page size on reactive re-execution
    if (result.page.length > 4000) {
      return { ...result, page: result.page.slice(0, 4000), isDone: false };
    }
    return result;
  },
});

// Internal paginated query for snapshot generation — no reactive overhead, minimal fields
export const getPixelsForSnapshot = internalQuery({
  args: { canvasId: v.id("canvases"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { canvasId, paginationOpts }) => {
    const result = await ctx.db
      .query("pixels")
      .withIndex("by_canvas_yx", (q) => q.eq("canvasId", canvasId))
      .paginate(paginationOpts);
    return {
      page: result.page.map((p) => ({ x: p.x, y: p.y, color: p.color, price: p.price })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Internal paginated delta query for snapshot generation
export const getPixelsDeltaForSnapshot = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    since: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { canvasId, since, paginationOpts }) => {
    const result = await ctx.db
      .query("pixels")
      .withIndex("by_canvas_updatedAt", (q) =>
        q.eq("canvasId", canvasId).gt("updatedAt", since),
      )
      .paginate(paginationOpts);
    return {
      page: result.page.map((p) => ({ x: p.x, y: p.y, color: p.color, price: p.price })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Delta query: bounded, non-paginated. Returns up to 2000 recent pixel changes.
// Client skips this subscription during large commits to prevent reactive storms.
export const getPixelsDelta = query({
  args: {
    canvasId: v.id("canvases"),
    after: v.number(),
  },
  handler: async (ctx, { canvasId, after }) => {
    return await ctx.db
      .query("pixels")
      .withIndex("by_canvas_updatedAt", (q) =>
        q.eq("canvasId", canvasId).gt("updatedAt", after),
      )
      .take(2000);
  },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function maybeCreateNextCanvas(
  ctx: MutationCtx,
  canvas: Doc<"canvases">,
) {
  const totalCells = canvas.width * canvas.height;
  if (totalCells <= 0) {
    return;
  }

  const pixelCount = (
    await ctx.db
      .query("pixels")
      .withIndex("by_canvas_xy", (q) => q.eq("canvasId", canvas._id))
      .collect()
  ).length;

  const fillRatio = pixelCount / totalCells;
  if (fillRatio < (canvas.unlockThreshold ?? 0.8)) {
    return;
  }

  const nextOrder = canvas.order + 1;
  const existing = await ctx.db
    .query("canvases")
    .withIndex("by_order", (q) => q.eq("order", nextOrder))
    .unique();
  if (existing) {
    return;
  }

  const nextNumber = nextOrder + 1;
  await ctx.db.insert("canvases", {
    name: `PixAgora #${nextNumber}`,
    width: canvas.width,
    height: canvas.height,
    colors: canvas.colors,
    pixelPrice: canvas.pixelPrice,
    unlockThreshold: canvas.unlockThreshold,
    order: nextOrder,
    createdAt: Date.now(),
  });
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function nearestColor(color: string, palette: string[]): string {
  const [r, g, b] = parseHex(color);
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const [pr, pg, pb] = parseHex(c);
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function validateCoordinate(value: number, label: string, max: number) {
  if (!Number.isInteger(value) || value < 0 || value >= max) {
    throw new Error(`${label} out of bounds`);
  }
}

export const commit = mutation({
  args: {
    token: v.string(),
    canvasId: v.id("canvases"),
    pixels: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
      })
    ),
    expectedCost: v.optional(v.number()),
  },
  handler: async (ctx, { token, canvasId, pixels, expectedCost }) => {
    if (pixels.length === 0) {
      throw new Error("No pixels to commit");
    }
    if (pixels.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch too large (max ${MAX_BATCH_SIZE})`);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      throw new Error("Invalid token");
    }

    const canvas = await ctx.db.get(canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const isAdmin = user.isAdmin === true;

    if (!isAdmin && canvas.locked) {
      return { error: "CANVAS_LOCKED" as const };
    }

    const changes: {
      x: number;
      y: number;
      color: string;
      price: number;
      previousColor?: string;
    }[] = [];

    let totalCost = 0;
    const pixelDetails: {
      x: number;
      y: number;
      color: string;
      price: number;
      existingId?: Id<"pixels">;
      existingUserId?: Id<"users">;
      previousColor?: string;
    }[] = [];

    const allowedColors = new Set(canvas.colors.map((c) => c.toLowerCase()));

    const dedupedPixels = [
      ...new Map(pixels.map((px) => [`${px.x},${px.y}`, px])).values(),
    ];

    const filteredPixels = canvas.enforceColors
      ? dedupedPixels.map((px) => {
          if (allowedColors.has(px.color.toLowerCase())) {
            return px;
          }
          return { ...px, color: nearestColor(px.color, canvas.colors) };
        })
      : dedupedPixels;

    if (filteredPixels.length === 0) {
      return { committed: 0 };
    }

    for (const px of filteredPixels) {
      validateCoordinate(px.x, "x", canvas.width);
      validateCoordinate(px.y, "y", canvas.height);

      if (!HEX_COLOR_RE.test(px.color)) {
        throw new Error("Invalid color format");
      }

      const existing = await ctx.db
        .query("pixels")
        .withIndex("by_canvas_xy", (q) =>
          q.eq("canvasId", canvasId).eq("x", px.x).eq("y", px.y)
        )
        .unique();

      if (existing?.color.toLowerCase() === px.color.toLowerCase()) {
        continue;
      }

      const price = isAdmin ? 0 : nextPixelPrice(canvas.pixelPrice, existing?.price);
      totalCost += price;
      pixelDetails.push({
        ...px,
        price,
        existingId: existing?._id,
        existingUserId: existing?.userId,
        previousColor: existing?.color,
      });
    }

    if (pixelDetails.length === 0) {
      if (isAdmin) {
        return { totalCost: 0, remaining: 0 };
      }
      const balance = await computeCredits(ctx, user._id);
      return { totalCost: 0, remaining: balance };
    }

    if (!isAdmin) {
      const totalPaidCzk = await computeTotalPaidCzk(ctx, user._id);

      if (totalPaidCzk < 69) {
        return {
          error: "MIN_PAYMENT_REQUIRED" as const,
          requiredCzk: 69,
          totalPaidCzk,
        };
      }

      const needsOverwriteAccess = pixelDetails.some(
        (px) => px.existingUserId && px.existingUserId !== user._id,
      );
      if (needsOverwriteAccess) {
        if (totalPaidCzk < 666) {
          return {
            error: "OVERWRITE_LOCKED" as const,
            requiredCzk: 666,
            totalPaidCzk,
          };
        }
      }

      if (expectedCost !== undefined && totalCost !== expectedCost) {
        return { error: "PRICE_CHANGED" as const, expectedCost, totalCost };
      }

      const balance = await computeCredits(ctx, user._id);
      if (balance < totalCost) {
        return { error: "NOT_ENOUGH_CREDITS" as const, totalCost, balance };
      }
    }

    const now = Date.now();

    for (const px of pixelDetails) {
      if (px.existingId) {
        await ctx.db.patch(px.existingId!, {
          color: px.color,
          price: px.price,
          userId: user._id,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("pixels", {
          canvasId,
          x: px.x,
          y: px.y,
          color: px.color,
          price: px.price,
          userId: user._id,
          updatedAt: now,
        });
      }

      changes.push({
        x: px.x,
        y: px.y,
        color: px.color,
        price: px.price,
        previousColor: px.previousColor,
      });
    }

    // Inline price map chunk update
    if (changes.length > 0) {
      await applyPriceUpdates(
        ctx, canvasId, canvas.width, canvas.height,
        changes.map((c) => ({ x: c.x, y: c.y, price: c.price })),
      );
    }

    // Update cached user stats
    await ctx.db.patch(user._id, {
      totalPixelCount: (user.totalPixelCount ?? 0) + changes.length,
      totalSpent: (user.totalSpent ?? 0) + totalCost,
    });

    if (isAdmin) {
      await ctx.scheduler.runAfter(0, internal.snapshot.generate, { canvasId });
      return { totalCost: 0, remaining: 0 };
    }

    const balance = await computeCredits(ctx, user._id);

    const transactionId = await ctx.db.insert("transactions", {
      canvasId,
      userId: user._id,
      timestamp: now,
      cost: totalCost,
      changes,
    });

    const commitActorName = user.nickname?.trim() || "Anonymous";
    const commitActorEmail = user.showEmail ? user.email : undefined;
    const commitPixelCount = changes.length;
    await ctx.db.insert("chatMessages", {
      userId: user._id,
      kind: "commit",
      text: `${commitActorName} zakreslil(a) ${commitPixelCount} px.`,
      createdAt: now,
      authorName: "PixAgora bot",
      authorColor: "#ffffff",
      commitId: transactionId,
      commitCanvasId: canvasId,
      commitPixelCount,
      commitActorName,
      commitActorEmail,
    });

    // auto-creating new canvases OFF
    // await maybeCreateNextCanvas(ctx, canvas);

    // Schedule snapshot regeneration (async, doesn't block response)
    await ctx.scheduler.runAfter(0, internal.snapshot.generate, { canvasId });

    return { totalCost, remaining: balance - totalCost };
  },
});

// ---------------------------------------------------------------------------
// Internal: pre-validate user + canvas for large parallel commits
// ---------------------------------------------------------------------------
export const preValidateCommit = internalQuery({
  args: { token: v.string(), canvasId: v.id("canvases") },
  handler: async (ctx, { token, canvasId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return { error: "INVALID_TOKEN" as const };
    }

    const canvas = await ctx.db.get(canvasId);
    if (!canvas) {
      return { error: "CANVAS_NOT_FOUND" as const };
    }

    const isAdmin = user.isAdmin === true;
    if (!isAdmin && canvas.locked) {
      return { error: "CANVAS_LOCKED" as const };
    }

    let totalPaidCzk = 0;
    let credits = 0;
    if (!isAdmin) {
      totalPaidCzk = await computeTotalPaidCzk(ctx, user._id);
      if (totalPaidCzk < 69) {
        return {
          error: "MIN_PAYMENT_REQUIRED" as const,
          requiredCzk: 69,
          totalPaidCzk,
        };
      }
      credits = await computeCredits(ctx, user._id);
    }

    return {
      error: null,
      userId: user._id,
      isAdmin,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      basePrice: canvas.pixelPrice,
      enforceColors: canvas.enforceColors ?? false,
      palette: canvas.colors,
      totalPaidCzk,
      credits,
      nickname: user.nickname?.trim() || "Anonymous",
      showEmail: user.showEmail ?? false,
      email: user.email,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal query: point-lookup existing pixels at specific coordinates.
// Much faster than scanning the entire canvas — cost scales with stamp size,
// not canvas size. Each .first() scans ≤1 document in the index.
// ---------------------------------------------------------------------------
export const lookupExistingPixels = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    coords: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, { canvasId, coords }) => {
    const results: {
      _id: Id<"pixels">;
      x: number;
      y: number;
      color: string;
      price: number;
      userId: Id<"users">;
    }[] = [];
    for (const { x, y } of coords) {
      const pixel = await ctx.db
        .query("pixels")
        .withIndex("by_canvas_xy", (q) =>
          q.eq("canvasId", canvasId).eq("x", x).eq("y", y),
        )
        .first();
      if (pixel) {
        results.push({
          _id: pixel._id,
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          price: pixel.price,
          userId: pixel.userId,
        });
      }
    }
    return results;
  },
});

// ---------------------------------------------------------------------------
// Internal query: bounding-box range scan for existing pixels.
// Uses by_canvas_yx index — one range scan instead of N individual lookups.
// Much faster for large stamps (e.g., 50K pixels = 1 paginated scan vs 50K .first() calls).
// ---------------------------------------------------------------------------
export const lookupExistingPixelsBounded = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    minX: v.number(),
    maxX: v.number(),
    minY: v.number(),
    maxY: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { canvasId, minX, maxX, minY, maxY, paginationOpts }) => {
    const result = await ctx.db
      .query("pixels")
      .withIndex("by_canvas_yx", (q) =>
        q.eq("canvasId", canvasId).gte("y", minY).lte("y", maxY),
      )
      .paginate(paginationOpts);

    // Filter to x range in code (index only covers canvasId + y range)
    const filtered = result.page
      .filter((p) => p.x >= minX && p.x <= maxX)
      .map((p) => ({
        _id: p._id,
        x: p.x,
        y: p.y,
        color: p.color,
        price: p.price,
        userId: p.userId,
      }));

    return {
      pixels: filtered,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: combined lookup + write ("upsert").
// Each pixel: index lookup → skip if same color → insert or update.
// Eliminates the need for a separate lookup phase in commitFromBlob.
// ---------------------------------------------------------------------------
export const upsertPixelBatch = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    now: v.number(),
    basePrice: v.number(),
    isAdmin: v.boolean(),
    canvasWidth: v.number(),
    canvasHeight: v.number(),
    pixels: v.array(v.object({ x: v.number(), y: v.number(), color: v.string() })),
  },
  handler: async (ctx, args) => {
    let batchCost = 0;
    let changed = 0;
    const priceUpdates: { x: number; y: number; price: number }[] = [];
    for (const px of args.pixels) {
      const existing = await ctx.db
        .query("pixels")
        .withIndex("by_canvas_xy", (q) =>
          q.eq("canvasId", args.canvasId).eq("x", px.x).eq("y", px.y),
        )
        .unique();
      if (existing && existing.color.toLowerCase() === px.color.toLowerCase()) continue;
      const price = args.isAdmin ? 0 : nextPixelPrice(args.basePrice, existing?.price);
      batchCost += price;
      if (existing) {
        await ctx.db.patch(existing._id, {
          color: px.color,
          price,
          userId: args.userId,
          updatedAt: args.now,
        });
      } else {
        await ctx.db.insert("pixels", {
          canvasId: args.canvasId,
          x: px.x,
          y: px.y,
          color: px.color,
          price,
          userId: args.userId,
          updatedAt: args.now,
        });
      }
      priceUpdates.push({ x: px.x, y: px.y, price });
      changed++;
    }
    // Price map updates are applied by the calling action after all parallel
    // batches complete, to avoid OCC contention on priceMapChunks documents.
    return { batchCost, changed, priceUpdates };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: single-record finalize for large commits.
// Stores changes: [] (preview PNG is the visual reference), single mutation.
// ---------------------------------------------------------------------------
export const saveLargeCommitRecord = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    totalCost: v.number(),
    totalPixelCount: v.number(),
    actorName: v.string(),
    actorEmail: v.optional(v.string()),
    previewStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Verify credits BEFORE committing (totalCost was computed from upsert batches)
    const currentBalance = await computeCredits(ctx, args.userId);
    if (args.totalCost > 0 && currentBalance < args.totalCost) {
      return { error: "NOT_ENOUGH_CREDITS" as const, remaining: currentBalance };
    }

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      canvasId: args.canvasId,
      userId: args.userId,
      timestamp: now,
      cost: args.totalCost,
      changes: [],
      ...(args.previewStorageId ? { previewStorageId: args.previewStorageId } : {}),
    });

    const user = await ctx.db.get(args.userId);
    if (user) {
      await ctx.db.patch(args.userId, {
        totalPixelCount: (user.totalPixelCount ?? 0) + args.totalPixelCount,
        totalSpent: (user.totalSpent ?? 0) + args.totalCost,
      });
    }

    await ctx.db.insert("chatMessages", {
      userId: args.userId,
      kind: "commit",
      text: `${args.actorName} zakreslil(a) ${args.totalPixelCount} px.`,
      createdAt: now,
      authorName: "PixAgora bot",
      authorColor: "#ffffff",
      commitId: transactionId,
      commitCanvasId: args.canvasId,
      commitPixelCount: args.totalPixelCount,
      commitActorName: args.actorName,
      commitActorEmail: args.actorEmail,
    });

    const balance = await computeCredits(ctx, args.userId);
    return { error: null as null, remaining: balance };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: write batch with price verification.
// Re-reads each pixel to compute the actual price atomically within the
// mutation, preventing races where another user changed the pixel between
// the action's lookup and this write.
// ---------------------------------------------------------------------------
export const writeBatchNoRead = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    now: v.number(),
    basePrice: v.number(),
    isAdmin: v.boolean(),
    canvasWidth: v.number(),
    canvasHeight: v.number(),
    inserts: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
        price: v.number(),
      }),
    ),
    updates: v.array(
      v.object({
        id: v.id("pixels"),
        x: v.number(),
        y: v.number(),
        color: v.string(),
        price: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let costDelta = 0;
    const priceUpdates: { x: number; y: number; price: number }[] = [];

    for (const ins of args.inserts) {
      const existing = await ctx.db
        .query("pixels")
        .withIndex("by_canvas_xy", (q) =>
          q.eq("canvasId", args.canvasId).eq("x", ins.x).eq("y", ins.y),
        )
        .unique();
      if (existing) {
        const realPrice = args.isAdmin ? 0 : nextPixelPrice(args.basePrice, existing.price);
        costDelta += realPrice - ins.price;
        await ctx.db.patch(existing._id, {
          color: ins.color,
          price: realPrice,
          userId: args.userId,
          updatedAt: args.now,
        });
        priceUpdates.push({ x: ins.x, y: ins.y, price: realPrice });
      } else {
        await ctx.db.insert("pixels", {
          canvasId: args.canvasId,
          x: ins.x,
          y: ins.y,
          color: ins.color,
          price: ins.price,
          userId: args.userId,
          updatedAt: args.now,
        });
        priceUpdates.push({ x: ins.x, y: ins.y, price: ins.price });
      }
    }
    for (const upd of args.updates) {
      const current = await ctx.db.get(upd.id);
      if (current) {
        const realPrice = args.isAdmin ? 0 : nextPixelPrice(args.basePrice, current.price);
        costDelta += realPrice - upd.price;
        await ctx.db.patch(upd.id, {
          color: upd.color,
          price: realPrice,
          userId: args.userId,
          updatedAt: args.now,
        });
        priceUpdates.push({ x: upd.x, y: upd.y, price: realPrice });
      }
    }

    // Price map updates are applied by the calling action after all parallel
    // batches complete, to avoid OCC contention on priceMapChunks documents.
    return { costDelta, priceUpdates };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: finalize a large commit — create transaction + chat msg
// ---------------------------------------------------------------------------
export const finalizeCommit = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    changes: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
        price: v.number(),
        previousColor: v.optional(v.string()),
      }),
    ),
    totalCost: v.number(),
    actorName: v.string(),
    actorEmail: v.optional(v.string()),
    // For chunked finalization (large commits)
    isFirstChunk: v.optional(v.boolean()),
    totalPixelCount: v.optional(v.number()),
    previewStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isFirst = args.isFirstChunk !== false; // true by default
    const displayCount = args.totalPixelCount ?? args.changes.length;

    const chunkCost = isFirst ? args.totalCost : 0;

    const transactionId = await ctx.db.insert("transactions", {
      canvasId: args.canvasId,
      userId: args.userId,
      timestamp: now,
      cost: chunkCost,
      changes: args.changes,
      ...(isFirst && args.previewStorageId
        ? { previewStorageId: args.previewStorageId }
        : {}),
    });

    // Update cached user stats
    const user = await ctx.db.get(args.userId);
    if (user) {
      await ctx.db.patch(args.userId, {
        totalPixelCount: (user.totalPixelCount ?? 0) + args.changes.length,
        totalSpent: (user.totalSpent ?? 0) + chunkCost,
      });
    }

    if (isFirst) {
      await ctx.db.insert("chatMessages", {
        userId: args.userId,
        kind: "commit",
        text: `${args.actorName} zakreslil(a) ${displayCount} px.`,
        createdAt: now,
        authorName: "PixAgora bot",
        authorColor: "#ffffff",
        commitId: transactionId,
        commitCanvasId: args.canvasId,
        commitPixelCount: displayCount,
        commitActorName: args.actorName,
        commitActorEmail: args.actorEmail,
      });
    }

    // Schedule snapshot only for single-chunk commits (small commit path).
    // For chunked commits from commitFromBlob, the action schedules it once at the end.
    if (args.isFirstChunk === undefined) {
      await ctx.scheduler.runAfter(0, internal.snapshot.generate, {
        canvasId: args.canvasId,
      });
    }

    const balance = await computeCredits(ctx, args.userId);
    return { remaining: balance };
  },
});

// Helper mutation: schedule snapshot generation (called from actions)
export const scheduleSnapshot = internalMutation({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    await ctx.scheduler.runAfter(0, internal.snapshot.generate, { canvasId });
  },
});
