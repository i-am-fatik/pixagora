import { query } from "./_generated/server";
import { v } from "convex/values";
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
  return nick && nick.length > 0 ? nick : "Anonym";
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const transactions = await ctx.db.query("transactions").collect();
    const counts = new Map<Id<"users">, number>();
    for (const tx of transactions) {
      const current = counts.get(tx.userId) ?? 0;
      counts.set(tx.userId, current + tx.changes.length);
    }

    const entries = [];
    for (const [userId, count] of counts.entries()) {
      const user = await ctx.db.get(userId);
      if (!user) {
        continue;
      }
      entries.push({
        userId,
        count,
        displayName: displayNameForUser(user),
        displayColor: user.nicknameColor ?? pickColor(user._id),
        displayEmail: user.showEmail ? user.email : undefined,
      });
    }

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    const sliced =
      typeof limit === "number" ? entries.slice(0, Math.max(0, limit)) : entries;
    return { entries: sliced, total: entries.length };
  },
});

export const getRank = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const transactions = await ctx.db.query("transactions").collect();
    const counts = new Map<Id<"users">, number>();
    for (const tx of transactions) {
      const current = counts.get(tx.userId) ?? 0;
      counts.set(tx.userId, current + tx.changes.length);
    }

    const entries = [];
    for (const [entryUserId, count] of counts.entries()) {
      const user = await ctx.db.get(entryUserId);
      if (!user) {
        continue;
      }
      entries.push({
        userId: entryUserId,
        count,
        displayName: displayNameForUser(user),
        displayColor: user.nicknameColor ?? pickColor(user._id),
        displayEmail: user.showEmail ? user.email : undefined,
      });
    }

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
