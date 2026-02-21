import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const REWARD_CREDITS: Record<string, number> = {
  Podporovatel: 50,
  // TODO: Doplnit kompletní mapping reward -> credits.
};

const FALLBACK_CZK_PER_CREDIT = 30;

function generateToken(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("WebCrypto is not available");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function normalizeEmail(email: string): string {
  return email
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function creditsForReward(reward: string, amountCzk: number): number {
  const mapped = REWARD_CREDITS[reward];
  if (typeof mapped === "number") return mapped;
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

    const email = normalizeEmail(args.email);
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      const token = generateToken();
      const userId = await ctx.db.insert("users", {
        email,
        token,
        credits: 0,
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("User insert failed");
    }

    const creditsDelta = creditsForReward(args.reward, args.amountCzk);

    await ctx.db.patch(user._id, {
      credits: user.credits + creditsDelta,
    });

    await ctx.db.insert("payments", {
      userId: user._id,
      creditsDelta,
      createdAt: Date.now(),
      source: args.source,
      trxId: args.trxId,
      email,
      amountCzk: args.amountCzk,
      reward: args.reward,
      purchasedAt: args.purchasedAt,
    });

    return { status: "ok" as const, userId: user._id, creditsDelta };
  },
});
