"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendMagicLinkEmail } from "./webhook_utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// DEV fallback, when Resend config is missing, return login link directly in response
function canSendEmail(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.PIXAGORA_EMAIL_FROM);
}

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

    // Dev fallback: skip email, return login link directly
    if (!canSendEmail()) {
      const appUrl = process.env.PIXAGORA_APP_URL ?? "http://localhost:3000";
      const loginPath = process.env.PIXAGORA_LOGIN_PATH ?? "/canvas";
      const url = new URL(loginPath, appUrl);
      url.searchParams.set("token", user.token);
      return { ok: true, devLoginUrl: url.toString() };
    }

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
