import { query, internalQuery, internalMutation } from "./_generated/server";
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
    return { _id: user._id, email: user.email, credits, isAdmin: !!user.isAdmin };
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
    return {
      totalPaidCzk,
      canOverwrite: totalPaidCzk >= 669,
      email: user.email,
    };
  },
});

export const setAdmin = internalMutation({
  args: { email: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, { email, isAdmin }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }
    await ctx.db.patch(user._id, { isAdmin });
  },
});

export const getCreditLeaderboard = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const results = await Promise.all(
      allUsers.map(async (user) => {
        const credits = await computeCredits(ctx, user._id);
        return {
          userId: user._id,
          email: user.email,
          nickname: user.nickname ?? null,
          credits,
        };
      }),
    );

    return results
      .filter((r) => r.credits > 0)
      .sort((a, b) => b.credits - a.credits);
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
