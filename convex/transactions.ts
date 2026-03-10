import { query } from "./_generated/server";
import { v } from "convex/values";

export const getPreview = query({
  args: { commitId: v.id("transactions") },
  handler: async (ctx, { commitId }) => {
    const tx = await ctx.db.get(commitId);
    if (!tx) {
      return null;
    }

    // Large commits store a preview PNG — return its URL
    if (tx.previewStorageId) {
      const previewUrl = await ctx.storage.getUrl(tx.previewStorageId);
      if (previewUrl) {
        return { previewUrl, changes: [] };
      }
    }

    // Fallback: return pixel changes directly (small commits / legacy)
    const changes = tx.changes.map((change) => ({
      x: change.x,
      y: change.y,
      color: change.color,
    }));
    return { changes };
  },
});
