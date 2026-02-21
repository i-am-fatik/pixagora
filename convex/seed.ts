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

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

const DEMO_USERS = [
  { email: "alice@pixagora.cz" },
  { email: "bob@pixagora.cz" },
];

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

export const seedDemo = internalMutation({
  args: {
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    canvasName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const width = args.width ?? 110;
    const height = args.height ?? 169;
    const canvasName = args.canvasName ?? "Pixagora #1";

    const userResults = [];
    for (const { email } of DEMO_USERS) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { credits: 1000 });
        userResults.push({ email, token: existing.token, credits: 1000 });
      } else {
        const token = generateToken();
        await ctx.db.insert("users", { email, token, credits: 1000 });
        userResults.push({ email, token, credits: 1000 });
      }
    }

    const existingCanvases = await ctx.db.query("canvases").collect();
    let canvasId;
    if (existingCanvases.length === 0) {
      canvasId = await ctx.db.insert("canvases", {
        name: canvasName,
        width,
        height,
        colors: DEFAULT_COLORS,
        pixelPrice: 1,
        unlockThreshold: 0.8,
        order: 0,
        createdAt: Date.now(),
      });
    } else {
      canvasId = existingCanvases[0]._id;
    }

    return { users: userResults, canvasId, width, height };
  },
});
