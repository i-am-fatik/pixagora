import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const DEMO_USERS = [
  { email: "alice@pixagora.cz", token: "alice-token-12345" },
  { email: "bob@pixagora.cz", token: "bob-token-67890" },
];

const WHITE = "#FFFFFF";

export const seedDemo = mutation({
  args: {
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.object({
    users: v.array(
      v.object({
        email: v.string(),
        token: v.string(),
        credits: v.number(),
      })
    ),
    width: v.number(),
    height: v.number(),
    pixelsInitialized: v.number(),
  }),
  handler: async (ctx, args) => {
    const width = args.width ?? 10;
    const height = args.height ?? 10;

    const results: { email: string; token: string; credits: number }[] = [];
    let firstUserId: Id<"users"> | null = null;

    for (const { email, token } of DEMO_USERS) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { credits: 1000 });
        if (firstUserId === null) firstUserId = existing._id;
      } else {
        const id = await ctx.db.insert("users", {
          email,
          token,
          credits: 1000,
        });
        if (firstUserId === null) firstUserId = id;
      }

      results.push({ email, token, credits: 1000 });
    }

    if (firstUserId === null) {
      throw new Error("No user to own initial pixels");
    }

    const now = Date.now();
    let pixelsInitialized = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const existing = await ctx.db
          .query("pixels")
          .withIndex("by_xy", (q) => q.eq("x", x).eq("y", y))
          .unique();
        if (!existing) {
          await ctx.db.insert("pixels", {
            x,
            y,
            color: WHITE,
            price: 0,
            userId: firstUserId,
            updatedAt: now,
          });
          pixelsInitialized++;
        }
      }
    }

    return {
      users: results,
      width,
      height,
      pixelsInitialized,
    };
  },
});
