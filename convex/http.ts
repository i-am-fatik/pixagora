import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

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

export default http;
