import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const TABLES_TO_CLEAR = [
  "pixels",
  "transactions",
  "canvases",
  "payments",
  "users",
] as const;

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of TABLES_TO_CLEAR) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
      counts[table] = docs.length;
    }
    return counts;
  },
});

const DEFAULT_COLORS = [
  "#000000",
  "#7F7F7F",
  "#FFFFFF",
  "#FFD400",
  "#F7931A",
  "#00AEEF",
  "#EC008C",
  "#0057B8",
  "#00A651",
];

export const createCanvas = internalMutation({
  args: {
    name: v.string(),
    width: v.number(),
    height: v.number(),
    pixelPrice: v.number(),
    unlockThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("canvases").collect();
    const order = existing.length;

    const canvasId = await ctx.db.insert("canvases", {
      name: args.name,
      width: args.width,
      height: args.height,
      colors: DEFAULT_COLORS,
      pixelPrice: args.pixelPrice,
      unlockThreshold: args.unlockThreshold,
      order,
      createdAt: Date.now(),
    });

    return { canvasId, order };
  },
});
