import { action } from "./_generated/server";
import { v } from "convex/values";

export const createInvoice = action({
  args: {
    email: v.string(),
    redirectUrl: v.optional(v.string()),
    amount: v.number(),
  },
  handler: async (ctx, { email, redirectUrl, amount }) => {
    const btcpayUrl = process.env.BTCPAY_URL;
    const btcpayApiKey = process.env.BTCPAY_API_KEY;
    const storeId = process.env.BTCPAY_STORE;

    if (!btcpayUrl || !btcpayApiKey || !storeId) {
      throw new Error("BTCPay Server not configured");
    }

    const response = await fetch(
      `${btcpayUrl}/api/v1/stores/${storeId}/invoices`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${btcpayApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: "CZK",
          metadata: {
            form: {
              email: email,
              perk: "PixAgora app",
            },
          },
          checkout: {
            buyerEmail: email,
            redirectURL: redirectUrl,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("BTCPay invoice creation failed", errorText);
      throw new Error("Failed to create BTCPay invoice");
    }

    const invoice = await response.json();
    return { invoiceId: invoice.id, checkoutLink: invoice.checkoutLink };
  },
});
