import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { findOrCreateUser } from "./credits";

const REWARD_CREDITS: Record<string, number> = {
  Podporovatel: 50,
  // TODO: Doplnit kompletní mapping reward -> credits.
};

const FALLBACK_CZK_PER_CREDIT = 30;

function creditsForReward(reward: string, amountCzk: number): number {
  const mapped = REWARD_CREDITS[reward];
  if (typeof mapped === "number") {
    return mapped;
  }
  return Math.floor(amountCzk / FALLBACK_CZK_PER_CREDIT);
}

export const processPayment = internalMutation({
  args: {
    source: v.string(),
    trxId: v.string(),
    email: v.string(),
    amountCzk: v.number(),
    reward: v.string(),
    purchasedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_source_trxId", (q) =>
        q.eq("source", args.source).eq("trxId", args.trxId),
      )
      .unique();
    if (existing) {
      return {
        status: "duplicate" as const,
        userId: existing.userId,
        creditsDelta: existing.creditsDelta,
      };
    }

    const user = await findOrCreateUser(ctx, args.email);
    const creditsDelta = creditsForReward(args.reward, args.amountCzk);

    await ctx.db.insert("payments", {
      userId: user._id,
      creditsDelta,
      createdAt: Date.now(),
      source: args.source,
      trxId: args.trxId,
      email: user.email,
      amountCzk: args.amountCzk,
      reward: args.reward,
      purchasedAt: args.purchasedAt,
    });

    return { status: "ok" as const, userId: user._id, creditsDelta };
  },
});
