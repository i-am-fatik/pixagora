import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { nextPixelPrice } from "./pricing";

const MAX_BATCH_SIZE = 500;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const getByCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    return await ctx.db
      .query("pixels")
      .withIndex("by_canvas_xy", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

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
  if (fillRatio < canvas.unlockThreshold) {
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
    name: `Pixagora #${nextNumber}`,
    width: canvas.width,
    height: canvas.height,
    colors: canvas.colors,
    pixelPrice: canvas.pixelPrice,
    unlockThreshold: canvas.unlockThreshold,
    order: nextOrder,
    createdAt: Date.now(),
  });
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
  },
  handler: async (ctx, { token, canvasId, pixels }) => {
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

    const changes: {
      x: number;
      y: number;
      color: string;
      previousColor?: string;
    }[] = [];

    let totalCost = 0;
    const pixelDetails: {
      x: number;
      y: number;
      color: string;
      price: number;
      existingId?: Id<"pixels">;
      previousColor?: string;
    }[] = [];

    const dedupedPixels = [
      ...new Map(pixels.map((px) => [`${px.x},${px.y}`, px])).values(),
    ];

    for (const px of dedupedPixels) {
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

      const price = nextPixelPrice(canvas.pixelPrice, existing?.price);
      totalCost += price;
      pixelDetails.push({
        ...px,
        price,
        existingId: existing?._id,
        previousColor: existing?.color,
      });
    }

    if (pixelDetails.length === 0) {
      return { totalCost: 0, remaining: user.credits };
    }

    if (user.credits < totalCost) {
      throw new Error("Not enough credits");
    }

    await ctx.db.patch(user._id, {
      credits: user.credits - totalCost,
    });

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
        previousColor: px.previousColor,
      });
    }

    await ctx.db.insert("transactions", {
      canvasId,
      userId: user._id,
      timestamp: now,
      changes,
    });

    await maybeCreateNextCanvas(ctx, canvas);

    return { totalCost, remaining: user.credits - totalCost };
  },
});
