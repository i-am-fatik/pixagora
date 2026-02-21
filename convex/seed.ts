import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { computeCredits, findOrCreateUser } from "./credits";

const TABLES_TO_CLEAR = [
  "pixels",
  "transactions",
  "canvases",
  "payments",
  "users",
] as const;

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
    name: v.string(),
    width: v.number(),
    height: v.number(),
    pixelPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("canvases").collect();
    const order = existing.length;

    const canvasId = await ctx.db.insert("canvases", {
      name: args.name || `Pixagora #${order + 1}`,
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
