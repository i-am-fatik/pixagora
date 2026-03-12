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

// Combined query: single users+payments scan returns entries, rank, and stats.
export const getData = query({
  args: {
    limit: v.optional(v.number()),
    viewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, { limit, viewerId }) => {
    const users = await ctx.db.query("users").collect();

    // For users without totalPixelCount, compute from transactions (by_user index)
    const needsCompute = users.filter(
      (u) => !u.isAdmin && u.totalPixelCount === undefined,
    );
    const computedCounts = new Map<string, number>();
    for (const u of needsCompute) {
      const txs = await ctx.db
        .query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      let count = 0;
      for (const tx of txs) {count += tx.changes.length;}
      if (count > 0) {computedCounts.set(u._id as string, count);}
    }

    const entries = users
      .filter((u) => !u.isAdmin)
      .map((u) => {
        const count =
          u.totalPixelCount ?? computedCounts.get(u._id as string) ?? 0;
        if (count <= 0) {return null;}
        return {
          userId: u._id,
          count,
          displayName: displayNameForUser(u),
          displayColor: u.nicknameColor ?? pickColor(u._id),
          displayEmail: u.showEmail ? u.email : undefined,
        };
      })
      .filter(
        (e): e is NonNullable<typeof e> => e !== null,
      );

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    // User rank
    let rank: { rank: number; count: number; displayColor: string } | null =
      null;
    if (viewerId) {
      const index = entries.findIndex((e) => e.userId === viewerId);
      if (index !== -1) {
        rank = {
          rank: index + 1,
          count: entries[index]?.count ?? 0,
          displayColor: entries[index]?.displayColor ?? "#facc15",
        };
      }
    }

    // Stats
    let totalPx = 0;
    for (const u of users) {
      totalPx +=
        u.totalPixelCount ?? computedCounts.get(u._id as string) ?? 0;
    }
    const payments = await ctx.db.query("payments").collect();
    let totalCzk = 0;
    for (const payment of payments) {
      if (typeof payment.amountCzk === "number") {
        totalCzk += payment.amountCzk;
      }
    }

    const sliced =
      typeof limit === "number"
        ? entries.slice(0, Math.max(0, limit))
        : entries;

    return {
      entries: sliced,
      total: entries.length,
      rank,
      stats: { totalCzk, totalPx },
    };
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
