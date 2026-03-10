import { query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const CHAT_COLORS = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CHAT_COLORS.length;
  return CHAT_COLORS[index] ?? CHAT_COLORS[0];
}

function displayNameForUser(user: { nickname?: string }) {
  const nick = user.nickname?.trim();

  if (nick?.toLowerCase() === "urza") {
    return "Anonym";
  }

  return nick && nick.length > 0 ? nick : "Anonym";
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const users = await ctx.db.query("users").collect();
    const entries = users
      .filter((u) => !u.isAdmin && (u.totalPixelCount ?? 0) > 0)
      .map((u) => ({
        userId: u._id,
        count: u.totalPixelCount ?? 0,
        displayName: displayNameForUser(u),
        displayColor: u.nicknameColor ?? pickColor(u._id),
        displayEmail: u.showEmail ? u.email : undefined,
      }));

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    const sliced =
      typeof limit === "number"
        ? entries.slice(0, Math.max(0, limit))
        : entries;
    return { entries: sliced, total: entries.length };
  },
});

export const getRank = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const users = await ctx.db.query("users").collect();
    const entries = users
      .filter((u) => !u.isAdmin && (u.totalPixelCount ?? 0) > 0)
      .map((u) => ({
        userId: u._id,
        count: u.totalPixelCount ?? 0,
        displayName: displayNameForUser(u),
        displayColor: u.nicknameColor ?? pickColor(u._id),
      }));

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    const index = entries.findIndex((entry) => entry.userId === userId);
    if (index === -1) {
      return null;
    }
    return {
      rank: index + 1,
      count: entries[index]?.count ?? 0,
      displayColor: entries[index]?.displayColor ?? "#facc15",
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db.query("payments").collect();
    let totalCzk = 0;
    for (const payment of payments) {
      if (typeof payment.amountCzk === "number") {
        totalCzk += payment.amountCzk;
      }
    }

    const users = await ctx.db.query("users").collect();
    let totalPx = 0;
    for (const u of users) {
      totalPx += u.totalPixelCount ?? 0;
    }

    return { totalCzk, totalPx };
  },
});

// ---------------------------------------------------------------------------
// Migration: backfill totalPixelCount and totalSpent per user.
// Processes one user at a time to stay under byte limits.
//   npx convex run leaderboard:migrateUserStats
// ---------------------------------------------------------------------------
// Read one page of a user's transactions — stays under byte limit
export const _aggregateTxPage = internalQuery({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, cursor }) => {
    const result = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate({ numItems: 20, cursor });
    let spent = 0;
    let pixels = 0;
    for (const tx of result.page) {
      spent += tx.cost ?? 0;
      pixels += tx.changes.length;
    }
    return {
      spent,
      pixels,
      isDone: result.isDone,
      cursor: result.continueCursor,
    };
  },
});

export const _patchUserStats = internalMutation({
  args: {
    userId: v.id("users"),
    totalPixelCount: v.number(),
    totalSpent: v.number(),
  },
  handler: async (ctx, { userId, totalPixelCount, totalSpent }) => {
    await ctx.db.patch(userId, { totalPixelCount, totalSpent });
  },
});

export const _listUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => u._id);
  },
});

export const migrateUserStats = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds: Id<"users">[] = await ctx.runQuery(
      internal.leaderboard._listUserIds,
    );
    let migrated = 0;
    for (const userId of userIds) {
      let totalSpent = 0;
      let totalPixelCount = 0;
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const page: { spent: number; pixels: number; isDone: boolean; cursor: string } = await ctx.runQuery(
          internal.leaderboard._aggregateTxPage,
          { userId, cursor },
        );
        totalSpent += page.spent;
        totalPixelCount += page.pixels;
        isDone = page.isDone;
        cursor = page.cursor;
      }
      await ctx.runMutation(internal.leaderboard._patchUserStats, {
        userId,
        totalPixelCount,
        totalSpent,
      });
      migrated++;
    }
    return { migrated };
  },
});
