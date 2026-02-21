import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  isDryRun,
  sendStartovacTokenEmail,
  signPixagoraPayload,
  timingSafeEqualHex,
} from "./webhook_utils";

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
    // TODO: Verify BTCpay webhook signature
    // TODO: Parse payload and find user
    // TODO: Call addCredits internal mutation

    const body = await request.json();
    console.log("BTCpay webhook received:", JSON.stringify(body));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
      internal.webhooks.processStartovacPayment,
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

export default http;
