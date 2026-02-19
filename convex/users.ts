import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) return null;
    return { _id: user._id, email: user.email, credits: user.credits };
  },
});

export const addCredits = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    amountSats: v.number(),
  },
  handler: async (ctx, { userId, credits, amountSats }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(userId, {
      credits: user.credits + credits,
    });

    await ctx.db.insert("payments", {
      userId,
      amountSats,
      creditsDelta: credits,
      createdAt: Date.now(),
    });
  },
});
