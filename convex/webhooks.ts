import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { findOrCreateUser } from "./credits";

const STARTOVAC_REWARDS: Record<
  string,
  { basePrice: number; credits: number }
> = {
  maly_kreslir: { basePrice: 69, credits: 11 },
  velky_kreslir: { basePrice: 666, credits: 169 },
};

const FALLBACK_CZK_PER_CREDIT = 30;

function rewardSourceLabel(source: string): string {
  if (source === "btcpay") {
    return "BTCPay";
  }
  return "Startovač";
}

function normalizeRewardKey(reward: string): string {
  return reward
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function creditsForReward(
  source: string,
  reward: string,
  amountCzk: number,
): number | null {
  if (source === "startovac") {
    const config = STARTOVAC_REWARDS[normalizeRewardKey(reward)];
    if (!config) {
      return null;
    }
    if (amountCzk > config.basePrice) {
      return Math.floor(amountCzk / (config.basePrice / config.credits));
    }
    return config.credits;
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

    const creditsDelta = creditsForReward(
      args.source,
      args.reward,
      args.amountCzk,
    );
    if (creditsDelta === null) {
      console.warn("skipping payment:", {
        source: args.source,
        trxId: args.trxId,
        email: args.email,
        amountCzk: args.amountCzk,
        reward: args.reward,
        purchasedAt: args.purchasedAt,
      });
      return { status: "skipped" as const };
    }

    const user = await findOrCreateUser(ctx, args.email);

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

    if (args.source === "startovac" || args.source === "btcpay") {
      const displayName = user.nickname?.trim() || "Anonym";
      const displayEmail = user.showEmail ? user.email : undefined;
      const amountLabel = Math.round(args.amountCzk);
      const text = `${displayName} podpořil(a) projekt ${amountLabel} Kč přes ${rewardSourceLabel(args.source)} a získal(a) ${creditsDelta} kreditů.`;
      await ctx.db.insert("chatMessages", {
        userId: user._id,
        kind: "reward",
        text,
        createdAt: Date.now(),
        authorName: "PixAgora bot",
        authorColor: "#ffffff",
        rewardSource: args.source,
        rewardAmountCzk: args.amountCzk,
        rewardCreditsDelta: creditsDelta,
        rewardName: args.reward,
        rewardDisplayName: displayName,
        rewardDisplayEmail: displayEmail,
      });
    }

    return { status: "ok" as const, userId: user._id, creditsDelta };
  },
});
