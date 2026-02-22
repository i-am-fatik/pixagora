"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendMagicLinkEmail } from "./webhook_utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const requestMagicLink = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      throw new Error("Neplatná emailová adresa");
    }
    const user = await ctx.runMutation(
      internal.credits.findOrCreateUserMutation,
      { email: trimmedEmail },
    );
    if (user.rateLimited) {
      // Silently succeed to avoid enumeration / spam
      return { ok: true };
    }
    const result = await sendMagicLinkEmail({
      to: user.email,
      token: user.token,
    });
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to send email");
    }
    return { ok: true };
  },
});
