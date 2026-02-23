import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

const MAX_MESSAGE_LENGTH = 280;
const MIN_INTERVAL_MS = 2500;
const WINDOW_MS = 15_000;
const WINDOW_MAX = 4;
const DUPLICATE_WINDOW_MS = 20_000;
const NICKNAME_MAX = 32;
const RESERVED_NICKNAMES = new Set([
  "pixagora",
  "pixagora bot",
  "pixagorabot",
  "admin",
  "moderator",
  "support",
  "system",
]);

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

function rewardSourceLabel(source?: string): string {
  return source === "btcpay" ? "BTCPay" : "Startovač";
}

function normalizeMessage(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CHAT_COLORS.length;
  return CHAT_COLORS[index] ?? CHAT_COLORS[0];
}

function normalizeNicknameForReserved(nickname: string): string {
  return nickname
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isReservedNickname(nickname: string): boolean {
  const normalized = normalizeNicknameForReserved(nickname);
  return RESERVED_NICKNAMES.has(normalized);
}

function normalizeNickname(nickname: string): string {
  return nickname.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function displayNameForUser(user: { nickname?: string }) {
  const nick = user.nickname?.trim();
  return nick && nick.length > 0 ? nick : "Anonymous";
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return ctx.db
      .query("chatMessages")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const getUnreadCount = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const items = await ctx.db
      .query("chatMessages")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", since))
      .take(100);
    const count = Math.min(items.length, 99);
    return { count, hasMore: items.length >= 100 };
  },
});

export const getProfile = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return null;
    }
    const effectiveColor = user.nicknameColor ?? pickColor(user._id);
    return {
      nickname: user.nickname ?? "",
      nicknameColor: user.nicknameColor ?? null,
      effectiveColor,
      email: user.email,
      showEmail: user.showEmail ?? false,
    };
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    nickname: v.optional(v.string()),
    nicknameColor: v.optional(v.string()),
    showEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, nickname, nicknameColor, showEmail }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return { ok: false, error: "UNAUTHORIZED" as const };
    }

    let nextNickname: string | undefined;
    const hasNickname = !!user.nickname && user.nickname.trim().length > 0;
    let nextNicknameLower: string | undefined;
    if (nickname !== undefined) {
      const trimmed = normalizeNickname(nickname);
      if (trimmed.length === 0) {
        nextNickname = undefined;
      } else if (trimmed.length > NICKNAME_MAX) {
        return { ok: false, error: "NICK_TOO_LONG" as const };
      } else if (isReservedNickname(trimmed)) {
        return { ok: false, error: "NICK_RESERVED" as const };
      } else if (hasNickname && trimmed !== user.nickname) {
        return { ok: false, error: "NICK_LOCKED" as const };
      } else {
        nextNickname = trimmed;
        nextNicknameLower = trimmed.toLowerCase();
      }
    }

    let nextColor: string | undefined;
    if (nicknameColor !== undefined) {
      const normalized = nicknameColor.toLowerCase();
      if (!CHAT_COLORS.includes(normalized)) {
        return { ok: false, error: "INVALID_COLOR" as const };
      }
      nextColor = normalized;
    }

    const nextShowEmail = showEmail ?? user.showEmail ?? false;
    const shouldUpdateNickname = !hasNickname && nextNickname;
    if (shouldUpdateNickname && nextNicknameLower) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_nickname_lower", (q) =>
          q.eq("nicknameLower", nextNicknameLower),
        )
        .unique();
      if (existing && existing._id !== user._id) {
        return { ok: false, error: "NICK_TAKEN" as const };
      }
    }
    await ctx.db.patch(user._id, {
      ...(shouldUpdateNickname ? { nickname: nextNickname } : {}),
      ...(shouldUpdateNickname ? { nicknameLower: nextNicknameLower } : {}),
      ...(nextColor !== undefined ? { nicknameColor: nextColor } : {}),
      ...(showEmail !== undefined ? { showEmail: nextShowEmail } : {}),
    });

    if (shouldUpdateNickname || showEmail !== undefined) {
      const displayName = displayNameForUser({
        nickname: shouldUpdateNickname ? nextNickname : user.nickname,
      });
      const displayEmail = nextShowEmail ? user.email : undefined;
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_user_createdAt", (q) => q.eq("userId", user._id))
        .collect();
      for (const message of messages) {
        if (message.kind === "reward") {
          await ctx.db.patch(message._id, {
            rewardDisplayName: displayName,
            rewardDisplayEmail: displayEmail,
            text: `${displayName} podpořil(a) projekt ${Math.round(
              message.rewardAmountCzk ?? 0,
            )} Kč přes ${rewardSourceLabel(message.rewardSource)} a získal(a) ${
              message.rewardCreditsDelta ?? 0
            } kreditů.`,
          });
        }
      }
    }

    return { ok: true };
  },
});

export const send = mutation({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, { token, text }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!user) {
      return { ok: false, error: "UNAUTHORIZED" as const };
    }

    const normalized = normalizeMessage(text);
    if (!normalized) {
      return { ok: false, error: "EMPTY" as const };
    }
    if (normalized.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: "TOO_LONG" as const };
    }

    const now = Date.now();
    const lastAt = user.lastChatMessageAt ?? 0;
    if (now - lastAt < MIN_INTERVAL_MS) {
      return { ok: false, error: "RATE_LIMIT" as const };
    }

    if (
      user.lastChatMessageText &&
      user.lastChatMessageText === normalized &&
      now - lastAt < DUPLICATE_WINDOW_MS
    ) {
      return { ok: false, error: "DUPLICATE" as const };
    }

    let windowStart = user.chatWindowStart ?? now;
    let windowCount = user.chatWindowCount ?? 0;
    if (now - windowStart > WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount >= WINDOW_MAX) {
      return { ok: false, error: "RATE_LIMIT" as const };
    }
    windowCount += 1;

    const displayName = displayNameForUser(user);

    const displayEmail = user.showEmail ? user.email : undefined;
    const authorColor = user.nicknameColor ?? pickColor(user._id);

    await ctx.db.insert("chatMessages", {
      userId: user._id,
      kind: "user",
      text: normalized,
      createdAt: now,
      authorName: displayName,
      authorColor,
      authorEmail: displayEmail,
    });

    await ctx.db.patch(user._id, {
      lastChatMessageAt: now,
      chatWindowStart: windowStart,
      chatWindowCount: windowCount,
      lastChatMessageText: normalized,
      ...(user.nicknameColor ? {} : { nicknameColor: authorColor }),
    });

    return { ok: true };
  },
});
