import { query, mutation, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { nextPixelPrice } from "./pricing";
import { computeCredits, computeTotalPaidCzk } from "./credits";

const MAX_BATCH_SIZE = 1000;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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
    return await ctx.db
      .query("pixels")
      .withIndex("by_canvas_xy", (q) => q.eq("canvasId", canvasId))
      .paginate(paginationOpts);
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

    if (isAdmin) {
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

    return { totalCost, remaining: balance - totalCost };
  },
});
