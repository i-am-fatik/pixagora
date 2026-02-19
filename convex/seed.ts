import { mutation } from "./_generated/server";
import { v } from "convex/values";

const DEMO_USERS = [
  { email: "alice@pixagora.cz", token: "alice-token-12345" },
  { email: "bob@pixagora.cz", token: "bob-token-67890" },
];

export const seedDemo = mutation({
  args: {
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const width = args.width ?? 10;
    const height = args.height ?? 10;

    const results = [];

    for (const { email, token } of DEMO_USERS) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { credits: 1000 });
      } else {
        await ctx.db.insert("users", { email, token, credits: 1000 });
      }

      results.push({ email, token, credits: 1000 });
    }

    return { users: results, width, height };
  },
});
