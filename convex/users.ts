import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { computeCredits } from "./credits";

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return null;
    }
    const credits = await computeCredits(ctx, user._id);
    return { _id: user._id, email: user.email, credits };
  },
});

export const addCredits = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    amountCzk: v.number(),
  },
  handler: async (ctx, { userId, credits, amountCzk }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.insert("payments", {
      userId,
      amountCzk,
      creditsDelta: credits,
      createdAt: Date.now(),
    });
  },
});

export const getEmailAndTokenById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return { email: user.email, token: user.token };
  },
});
