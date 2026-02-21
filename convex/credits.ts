import { internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function generateToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

export async function computeCredits(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return payments.reduce((sum, p) => sum + p.creditsDelta, 0);
}

export async function findOrCreateUser(
  ctx: MutationCtx,
  rawEmail: string,
) {
  const email = normalizeEmail(rawEmail);
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("users", {
    email,
    token: generateToken(),
  });
  const user = await ctx.db.get(id);
  if (!user) {
    throw new Error("User insert failed");
  }
  return user;
}

export const giveaway = internalMutation({
  args: {
    email: v.string(),
    credits: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.credits <= 0) {
      throw new Error("Credits must be positive");
    }

    const user = await findOrCreateUser(ctx, args.email);

    await ctx.db.insert("payments", {
      userId: user._id,
      amountSats: 0,
      creditsDelta: args.credits,
      createdAt: Date.now(),
      source: "giveaway",
      trxId: args.note,
    });

    const balance = await computeCredits(ctx, user._id);
    return { userId: user._id, balance };
  },
});
