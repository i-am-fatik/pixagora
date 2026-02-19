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
  }),

  pixels: defineTable({
    x: v.number(),
    y: v.number(),
    color: v.string(),
    price: v.number(),
    userId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_xy", ["x", "y"]),
});
