import { query } from "./_generated/server";
import { v } from "convex/values";

export const getPreview = query({
  args: { commitId: v.id("transactions") },
  handler: async (ctx, { commitId }) => {
    const tx = await ctx.db.get(commitId);
    if (!tx) {
      return null;
    }
    const changes = tx.changes.map((change) => ({
      x: change.x,
      y: change.y,
      color: change.color,
    }));
    return { changes };
  },
});
