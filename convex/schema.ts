import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    token: v.string(),
    magicLinkSentAt: v.optional(v.number()),
    nickname: v.optional(v.string()),
    nicknameLower: v.optional(v.string()),
    nicknameColor: v.optional(v.string()),
    showEmail: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    lastChatMessageAt: v.optional(v.number()),
    chatWindowStart: v.optional(v.number()),
    chatWindowCount: v.optional(v.number()),
    lastChatMessageText: v.optional(v.string()),
    totalPixelCount: v.optional(v.number()),
    totalSpent: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"])
    .index("by_nickname_lower", ["nicknameLower"]),

  payments: defineTable({
    userId: v.id("users"),
    creditsDelta: v.number(),
    createdAt: v.number(),
    source: v.optional(v.string()),
    trxId: v.optional(v.string()),
    email: v.optional(v.string()),
    amountCzk: v.optional(v.number()),
    reward: v.optional(v.string()),
    purchasedAt: v.optional(v.number()),
  })
    .index("by_source_trxId", ["source", "trxId"])
    .index("by_user", ["userId"]),

  canvases: defineTable({
    name: v.string(),
    width: v.number(),
    height: v.number(),
    colors: v.array(v.string()),
    pixelPrice: v.number(),
    unlockThreshold: v.optional(v.number()),
    enforceColors: v.optional(v.boolean()),
    locked: v.optional(v.boolean()),
    order: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_order", ["order"]),

  transactions: defineTable({
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    timestamp: v.number(),
    cost: v.number(),
    changes: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
        price: v.number(),
        previousColor: v.optional(v.string()),
      })
    ),
    previewStorageId: v.optional(v.id("_storage")),
  })
    .index("by_canvas", ["canvasId"])
    .index("by_canvas_time", ["canvasId", "timestamp"])
    .index("by_user", ["userId"])
    .index("by_user_canvas", ["userId", "canvasId"]),

  pixels: defineTable({
    canvasId: v.id("canvases"),
    x: v.number(),
    y: v.number(),
    color: v.string(),
    price: v.number(),
    userId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_canvas_xy", ["canvasId", "x", "y"])
    .index("by_canvas_yx", ["canvasId", "y", "x"])
    .index("by_canvas_updatedAt", ["canvasId", "updatedAt"]),

  canvasSnapshots: defineTable({
    canvasId: v.id("canvases"),
    storageId: v.id("_storage"),
    priceMapStorageId: v.optional(v.id("_storage")),
    pixelCount: v.number(),
    createdAt: v.number(),
    priceMapUpdatedAt: v.optional(v.number()),
  })
    .index("by_canvas", ["canvasId"]),

  priceMapChunks: defineTable({
    canvasId: v.id("canvases"),
    chunkIndex: v.number(),
    data: v.bytes(),
    rowStart: v.number(),
    rowEnd: v.number(),
    canvasWidth: v.number(),
    updatedAt: v.number(),
  })
    .index("by_canvas_chunk", ["canvasId", "chunkIndex"]),

  pendingCommits: defineTable({
    userId: v.id("users"),
    canvasId: v.id("canvases"),
    status: v.union(
      v.literal("pending"),
      v.literal("validated"),
      v.literal("failed"),
    ),
    totalCost: v.number(),
    priceHash: v.string(),
    atRiskCount: v.number(),
    pixelOpsStorageId: v.id("_storage"),
    pixelCount: v.number(),
    basePrice: v.number(),
    isAdmin: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.number(),
    previewStorageId: v.optional(v.id("_storage")),
    actorName: v.string(),
    actorEmail: v.optional(v.string()),
    transactionId: v.optional(v.id("transactions")),
  })
    .index("by_user", ["userId"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),

  chatMessages: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("user"), v.literal("reward"), v.literal("commit")),
    text: v.string(),
    createdAt: v.number(),
    authorName: v.string(),
    authorColor: v.string(),
    authorEmail: v.optional(v.string()),
    commitId: v.optional(v.id("transactions")),
    commitCanvasId: v.optional(v.id("canvases")),
    commitPixelCount: v.optional(v.number()),
    commitActorName: v.optional(v.string()),
    commitActorEmail: v.optional(v.string()),
    rewardSource: v.optional(v.string()),
    rewardAmountCzk: v.optional(v.number()),
    rewardCreditsDelta: v.optional(v.number()),
    rewardName: v.optional(v.string()),
    rewardDisplayName: v.optional(v.string()),
    rewardDisplayEmail: v.optional(v.string()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_user_createdAt", ["userId", "createdAt"]),
});
