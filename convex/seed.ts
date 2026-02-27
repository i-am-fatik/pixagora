import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { computeCredits, findOrCreateUser } from "./credits";
import { DEFAULT_COLORS } from "./canvases";

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

export const createCanvas = internalMutation({
  args: {
    name: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    pixelPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("canvases").collect();
    const order = existing.length;

    const canvasId = await ctx.db.insert("canvases", {
      name: args.name || `PixAgora #${order + 1}`,
      width: args.width || 110,
      height: args.height || 169,
      colors: DEFAULT_COLORS,
      pixelPrice: args.pixelPrice || 1,
      order,
      createdAt: Date.now(),
    });

    return { canvasId, order };
  },
});

export const giveawayPayment = internalMutation({
  args: {
    email: v.string(),
    credits: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email || "test@pixagora.cz";
    const credits = args.credits || 100;

    if (credits <= 0) {
      throw new Error("Credits must be positive");
    }

    const user = await findOrCreateUser(ctx, email);

    await ctx.db.insert("payments", {
      email: email,
      userId: user._id,
      creditsDelta: credits,
      createdAt: Date.now(),
      source: "giveaway",
      trxId: args.note,
    });

    const balance = await computeCredits(ctx, user._id);
    return { userId: user._id, email: user.email, token: user.token, balance };
  },
});
