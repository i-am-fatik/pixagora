import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Each edit increases the price of that pixel by 1.
 * First paint: 1 credit, second edit: 2, third: 3, etc.
 */
export function getPriceForEdit(currentPrice: number | undefined): number {
  return (currentPrice ?? 0) + 1;
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pixels").collect();
  },
});

/**
 * Returns the credit cost for each cell on next edit (1 for new, current+1 for existing).
 */
export const getPricesForCells = query({
  args: {
    cells: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  returns: v.array(v.number()),
  handler: async (ctx, { cells }) => {
    const prices: number[] = [];
    for (const { x, y } of cells) {
      const existing = await ctx.db
        .query("pixels")
        .withIndex("by_xy", (q) => q.eq("x", x).eq("y", y))
        .unique();
      prices.push(getPriceForEdit(existing?.price));
    }
    return prices;
  },
});

export const paint = mutation({
  args: {
    token: v.string(),
    x: v.number(),
    y: v.number(),
    color: v.string(),
  },
  handler: async (ctx, { token, x, y, color }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) throw new Error("Invalid token");

    // Find or create pixel to determine price (each edit costs +1)
    const existing = await ctx.db
      .query("pixels")
      .withIndex("by_xy", (q) => q.eq("x", x).eq("y", y))
      .unique();

    const price = getPriceForEdit(existing?.price);

    if (user.credits < price) {
      throw new Error("Not enough credits");
    }

    // Deduct credit
    await ctx.db.patch(user._id, {
      credits: user.credits - price,
    });

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        color,
        price,
        userId: user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("pixels", {
        x,
        y,
        color,
        price,
        userId: user._id,
        updatedAt: now,
      });
    }

    return { remaining: user.credits - price };
  },
});

export const commit = mutation({
  args: {
    token: v.string(),
    pixels: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
      })
    ),
  },
  handler: async (ctx, { token, pixels }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) throw new Error("Invalid token");

    let totalCost = 0;
    const pixelDetails: {
      x: number;
      y: number;
      color: string;
      price: number;
      existingId?: string;
    }[] = [];

    for (const px of pixels) {
      const existing = await ctx.db
        .query("pixels")
        .withIndex("by_xy", (q) => q.eq("x", px.x).eq("y", px.y))
        .unique();

      const price = getPriceForEdit(existing?.price);
      totalCost += price;
      pixelDetails.push({
        ...px,
        price,
        existingId: existing?._id,
      });
    }

    if (user.credits < totalCost) {
      throw new Error(
        `Not enough credits. Need ${totalCost}, have ${user.credits}`
      );
    }

    await ctx.db.patch(user._id, {
      credits: user.credits - totalCost,
    });

    const now = Date.now();
    for (const px of pixelDetails) {
      if (px.existingId) {
        await ctx.db.patch(px.existingId as any, {
          color: px.color,
          price: px.price,
          userId: user._id,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("pixels", {
          x: px.x,
          y: px.y,
          color: px.color,
          price: px.price,
          userId: user._id,
          updatedAt: now,
        });
      }
    }

    return { totalCost, remaining: user.credits - totalCost };
  },
});
