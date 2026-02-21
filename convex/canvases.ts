import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const MAX_CANVAS_DIMENSION = 1000;

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("canvases")
      .withIndex("by_order")
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("canvases") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = internalMutation({
  args: {
    name: v.string(),
    width: v.number(),
    height: v.number(),
    colors: v.array(v.string()),
    pixelPrice: v.number(),
    unlockThreshold: v.optional(v.number()),
    order: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.width) || args.width < 1 || args.width > MAX_CANVAS_DIMENSION) {
      throw new Error(`width must be an integer between 1 and ${MAX_CANVAS_DIMENSION}`);
    }
    if (!Number.isInteger(args.height) || args.height < 1 || args.height > MAX_CANVAS_DIMENSION) {
      throw new Error(`height must be an integer between 1 and ${MAX_CANVAS_DIMENSION}`);
    }
    if (args.pixelPrice <= 0) {
      throw new Error("pixelPrice must be positive");
    }
    const threshold = args.unlockThreshold;
    if (threshold !== undefined && (threshold <= 0 || threshold > 1)) {
      throw new Error("unlockThreshold must be between 0 (exclusive) and 1 (inclusive)");
    }

    let order = args.order;
    if (order === undefined) {
      const all = await ctx.db
        .query("canvases")
        .withIndex("by_order")
        .collect();
      order = all.length > 0 ? all[all.length - 1].order + 1 : 0;
    }

    const id = await ctx.db.insert("canvases", {
      name: args.name,
      width: args.width,
      height: args.height,
      colors: args.colors,
      pixelPrice: args.pixelPrice,
      unlockThreshold: threshold,
      order,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    return id;
  },
});

export const DEFAULT_COLORS = [
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

const GRAYSCALE_COLORS = [
  "#000000",
  "#1C1C1C",
  "#383838",
  "#555555",
  "#717171",
  "#8E8E8E",
  "#AAAAAA",
  "#C6C6C6",
  "#E3E3E3",
  "#FFFFFF",
];

export const setColors = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    colors: v.optional(v.array(v.string())),
    grayscale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const canvas = await ctx.db.get(args.canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const colors = args.grayscale ? GRAYSCALE_COLORS : args.colors;
    if (!colors) {
      throw new Error("Provide colors array or grayscale: true");
    }

    await ctx.db.patch(args.canvasId, { colors });
    return { canvasId: args.canvasId, colors };
  },
});

export const setEnforceColors = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    enforceColors: v.boolean(),
    grayscale: v.boolean(),
  },
  handler: async (ctx, args) => {
    const canvas = await ctx.db.get(args.canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const patch: { enforceColors: boolean; colors: string[] } = {
      enforceColors: args.enforceColors,
      colors: args.grayscale ? GRAYSCALE_COLORS : DEFAULT_COLORS,
    };

    await ctx.db.patch(args.canvasId, patch);
    return { canvasId: args.canvasId, enforceColors: args.enforceColors, colors: patch.colors };
  },
});
