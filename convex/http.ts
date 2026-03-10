import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  isDryRun,
  sendMagicLinkEmail,
  sendStartovacTokenEmail,
  signPixagoraPayload,
  timingSafeEqualHex,
} from "./webhook_utils";
import { servePng } from "./snapshots";

const http = httpRouter();

const SIGNATURE_HEADER = "X-Pixagora-Signature";
const TIMESTAMP_HEADER = "X-Pixagora-Timestamp";

type StartovacPayload = {
  source: string;
  trxId: string;
  email: string;
  amountCzk: number;
  reward: string;
  purchasedAt: string;
};

function validateStartovacPayload(payload: unknown):
  | {
      ok: true;
      value: StartovacPayload;
      purchasedAtMs: number;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload is not an object" };
  }
  const data = payload as Partial<StartovacPayload>;
  if (
    typeof data.source !== "string" ||
    typeof data.trxId !== "string" ||
    typeof data.email !== "string" ||
    typeof data.amountCzk !== "number" ||
    typeof data.reward !== "string" ||
    typeof data.purchasedAt !== "string"
  ) {
    return { ok: false, error: "Missing or invalid fields" };
  }
  if (data.source !== "startovac") {
    return { ok: false, error: "Unexpected source" };
  }
  const purchasedAtMs = Date.parse(data.purchasedAt);
  if (!Number.isFinite(purchasedAtMs)) {
    return { ok: false, error: "Invalid purchasedAt" };
  }
  if (!Number.isFinite(data.amountCzk) || data.amountCzk < 0) {
    return { ok: false, error: "Invalid amountCzk" };
  }
  return { ok: true, value: data as StartovacPayload, purchasedAtMs };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


http.route({
  path: "/webhooks/btcpay",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    console.log("BTCpay webhook received:", JSON.stringify(body));

    if (body.type !== "InvoiceSettled") {
      return jsonResponse({ ok: true, ignored: true });
    }

    const btcpayUrl = process.env.BTCPAY_URL;
    const btcpayApiKey = process.env.BTCPAY_API_KEY;
    const storeId = body.storeId;
    const invoiceId = body.invoiceId;

    if (!btcpayUrl || !btcpayApiKey) {
      console.error("Missing BTCPAY_URL or BTCPAY_API_KEY");
      return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
    }

    // Fetch invoice details from BTCpay Greenfield API
    const response = await fetch(
      `${btcpayUrl}/api/v1/stores/${storeId}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `token ${btcpayApiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error("Failed to fetch invoice from BTCpay", await response.text());
      return jsonResponse({ ok: false, error: "Failed to fetch invoice" }, 500);
    }

    const invoice = await response.json();
    console.log('invoice', invoice)
    const email = invoice.metadata?.form?.email || invoice.checkout?.buyerEmail;
    const reward = invoice.metadata?.form?.perk || "BTCpay Payment";
    const amountCzk = parseFloat(invoice.amount); // Assuming invoice is in CZK

    if (!email) {
      console.error("No email found in BTCpay invoice", invoiceId);
      return jsonResponse({ ok: false, error: "No email found" }, 400);
    }

    const result = await ctx.runMutation(internal.webhooks.processPayment, {
      source: "btcpay",
      trxId: invoiceId,
      email,
      amountCzk,
      reward,
      purchasedAt: body.timestamp * 1000,
    });

    if (result.status === "ok") {
      const recipient = await ctx.runQuery(
        internal.users.getEmailAndTokenById,
        { userId: result.userId },
      );
      if (recipient) {
        await sendStartovacTokenEmail({
          to: recipient.email,
          token: recipient.token,
          creditsDelta: result.creditsDelta,
          reward,
          amountCzk,
          trxId: invoiceId,
          purchasedAt: new Date(body.timestamp * 1000).toISOString(),
        });
      }
    }

    return jsonResponse({ ok: true, ...result });
  }),
});

http.route({
  path: "/api/webhooks/startovac-poller",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.PIXAGORA_WEBHOOK_SECRET;
    if (!secret) {
      console.error("Missing PIXAGORA_WEBHOOK_SECRET");
      return jsonResponse({ ok: false, error: "Missing secret" }, 500);
    }

    const timestamp = request.headers.get(TIMESTAMP_HEADER);
    const signature = request.headers.get(SIGNATURE_HEADER);
    if (!timestamp || !signature) {
      return jsonResponse(
        { ok: false, error: "Missing signature headers" },
        401,
      );
    }

    const rawBody = await request.text();
    const expectedSignature = await signPixagoraPayload(
      secret,
      timestamp,
      rawBody,
    );
    if (
      !timingSafeEqualHex(
        signature.toLowerCase(),
        expectedSignature.toLowerCase(),
      )
    ) {
      return jsonResponse({ ok: false, error: "Invalid signature" }, 401);
    }

    let parsed: StartovacPayload;
    try {
      parsed = JSON.parse(rawBody) as StartovacPayload;
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const validation = validateStartovacPayload(parsed);
    if (!validation.ok) {
      return jsonResponse({ ok: false, error: validation.error }, 400);
    }

    if (isDryRun()) {
      console.log("Startovac webhook (dry-run)", {
        source: validation.value.source,
        trxId: validation.value.trxId,
        email: validation.value.email,
        amountCzk: validation.value.amountCzk,
        reward: validation.value.reward,
        purchasedAt: validation.value.purchasedAt,
      });
      return jsonResponse({ ok: true, dryRun: true }, 200);
    }

    const result = await ctx.runMutation(
      internal.webhooks.processPayment,
      {
        source: validation.value.source,
        trxId: validation.value.trxId,
        email: validation.value.email,
        amountCzk: validation.value.amountCzk,
        reward: validation.value.reward,
        purchasedAt: validation.purchasedAtMs,
      },
    );

    let emailSent = false;
    let emailError: string | undefined;
    let emailId: string | undefined;
    if (result.status === "ok") {
      const recipient = await ctx.runQuery(
        internal.users.getEmailAndTokenById,
        { userId: result.userId },
      );
      if (!recipient) {
        emailError = "User not found for email";
      } else {
        const emailResult = await sendStartovacTokenEmail({
          to: recipient.email,
          token: recipient.token,
          creditsDelta: result.creditsDelta,
          reward: validation.value.reward,
          amountCzk: validation.value.amountCzk,
          trxId: validation.value.trxId,
          purchasedAt: validation.value.purchasedAt,
        });
        emailSent = emailResult.ok;
        emailId = emailResult.id;
        emailError = emailResult.ok ? undefined : emailResult.error;
      }
    }

    console.log("Startovac webhook processed", {
      source: validation.value.source,
      trxId: validation.value.trxId,
      status: result.status,
      userId: result.userId,
      creditsDelta: result.creditsDelta,
      emailSent,
      emailId,
      emailError,
    });

    return jsonResponse(
      {
        ok: true,
        ...result,
        emailSent,
        ...(emailId ? { emailId } : {}),
        ...(emailError ? { emailError } : {}),
      },
      200,
    );
  }),
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function canSendEmail(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.PIXAGORA_EMAIL_FROM);
}

function buildDevLoginUrl(token: string): string {
  const appUrl = process.env.PIXAGORA_APP_URL ?? "http://localhost:3000";
  const loginPath = process.env.PIXAGORA_LOGIN_PATH ?? "/canvas";
  const url = new URL(loginPath, appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

http.route({
  path: "/api/auth/magic-link",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!EMAIL_REGEX.test(email)) {
      return jsonResponse({ ok: false, error: "Neplatná emailová adresa" }, 400);
    }

    const user = await ctx.runMutation(
      internal.credits.findUserForLogin,
      { email },
    );
    if (!user.found) {
      return jsonResponse({ ok: false, error: "USER_NOT_FOUND" }, 404);
    }

    // DEV fallback: when Resend config is missing, return login link directly
    if (!canSendEmail()) {
      return jsonResponse({ ok: true, devLoginUrl: buildDevLoginUrl(user.token) });
    }

    if (user.rateLimited) {
      return jsonResponse({ ok: true });
    }

    const result = await sendMagicLinkEmail({
      to: user.email,
      token: user.token,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error ?? "Failed to send email" }, 500);
    }

    return jsonResponse({ ok: true });
  }),
});

http.route({
  pathPrefix: "/api/canvas/",
  method: "GET",
  handler: servePng,
});

export default http;
