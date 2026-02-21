import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    token: v.string(),
    credits: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  payments: defineTable({
    userId: v.id("users"),
    amountSats: v.number(),
    creditsDelta: v.number(),
    createdAt: v.number(),
    source: v.optional(v.string()),
    trxId: v.optional(v.string()),
    email: v.optional(v.string()),
    amountCzk: v.optional(v.number()),
    reward: v.optional(v.string()),
    purchasedAt: v.optional(v.number()),
  }).index("by_source_trxId", ["source", "trxId"]),

  canvases: defineTable({
    name: v.string(),
    width: v.number(),
    height: v.number(),
    colors: v.array(v.string()),
    pixelPrice: v.number(),
    unlockThreshold: v.number(),
    order: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_order", ["order"]),

  transactions: defineTable({
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    timestamp: v.number(),
    changes: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
        color: v.string(),
        previousColor: v.optional(v.string()),
      })
    ),
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
  }).index("by_canvas_xy", ["canvasId", "x", "y"]),
});
