import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { computeCredits, computeTotalPaidCzk } from "./credits";

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

export const getPaymentSummary = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return null;
    }
    const totalPaidCzk = await computeTotalPaidCzk(ctx, user._id);
    return { totalPaidCzk, canOverwrite: totalPaidCzk >= 666 };
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
