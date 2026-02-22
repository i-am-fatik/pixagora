import { MutationCtx, QueryCtx, internalMutation } from "./_generated/server";
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
  const earned = payments.reduce((sum, p) => sum + p.creditsDelta, 0);

  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const spent = transactions.reduce((sum, t) => sum + (t.cost ?? 0), 0);

  return earned - spent;
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

const MAGIC_LINK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export const findOrCreateUserMutation = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await findOrCreateUser(ctx, email);
    const now = Date.now();
    if (
      user.magicLinkSentAt &&
      now - user.magicLinkSentAt < MAGIC_LINK_COOLDOWN_MS
    ) {
      return { userId: user._id, token: user.token, email: user.email, rateLimited: true };
    }
    await ctx.db.patch(user._id, { magicLinkSentAt: now });
    return { userId: user._id, token: user.token, email: user.email, rateLimited: false };
  },
});
