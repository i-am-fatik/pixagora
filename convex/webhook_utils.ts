export type EmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export async function signPixagoraPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is not available");
  }
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const message = encoder.encode(`${timestamp}.${rawBody}`);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, message);
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isDryRun(): boolean {
  const value = process.env.PIXAGORA_WEBHOOK_DRY_RUN;
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });
}

export function buildStartovacEmailHtml(params: {
  brandName: string;
  productName: string;
  logoUrl?: string;
  logoAlt: string;
  loginUrl: string;
  creditsDelta: number;
  reward: string;
  amountCzk: number;
  trxId: string;
  purchasedAt: string;
}): string {
  const {
    brandName,
    productName,
    logoUrl,
    logoAlt,
    loginUrl,
    creditsDelta,
    reward,
    amountCzk,
    trxId,
    purchasedAt,
  } = params;

  const safeBrandName = escapeHtml(brandName);
  const safeProductName = escapeHtml(productName);
  const safeLogoAlt = escapeHtml(logoAlt);
  const safeReward = escapeHtml(reward);
  const safeTrxId = escapeHtml(trxId);
  const safePurchasedAt = escapeHtml(purchasedAt);
  const safeLoginUrl = escapeHtml(loginUrl);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${safeLogoAlt}" width="140" height="40" style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;" />`
    : `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; letter-spacing: 0.5px; color: #1f3447;">${safeBrandName}</div>`;

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeProductName} – potvrzení platby</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f1e7;color:#1f2a33;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f6f1e7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(31,52,71,0.12);">
            <tr>
              <td style="padding:24px 32px;border-bottom:3px solid #c58b3d;background:linear-gradient(135deg,#ffffff 0%,#fdf8f0 60%,#f6efe0 100%);">
                <div style="display:flex;align-items:center;gap:16px;">
                  ${logoHtml}
                </div>
                <div style="margin-top:8px;font-family: 'Georgia', 'Times New Roman', serif;font-size:20px;color:#1f3447;">
                  ${safeProductName}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;font-family: 'Helvetica Neue', Arial, sans-serif;font-size:16px;line-height:1.6;color:#1f2a33;">
                <p style="margin:0 0 16px 0;">Ahoj,</p>
                <p style="margin:0 0 16px 0;">děkujeme za podporu projektu ${safeProductName}. Připsali jsme ti <strong>${creditsDelta} kreditů</strong>.</p>
                <div style="background:#f8f3ea;border:1px solid #e7dcc7;border-radius:10px;padding:16px 18px;margin:20px 0;text-align:center;">
                  <a href="${safeLoginUrl}" style="display:inline-block;background:#c58b3d;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px;">Otevřít Pixagoru</a>
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 12px 0;">
                  <tr>
                    <td style="padding:6px 0;color:#7a6a52;">Odměna</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2a33;">${safeReward}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#7a6a52;">Částka</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2a33;">${amountCzk} Kč</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#7a6a52;">Transakce</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2a33;">${safeTrxId}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#7a6a52;">Datum</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2a33;">${safePurchasedAt}</td>
                  </tr>
                </table>
                <p style="margin:18px 0 8px 0;color:#4b5a66;">Odkaz je určený pouze tobě. Pokud tlačítko nefunguje, použij tento odkaz:</p>
                <p style="margin:0;color:#1f3447;word-break:break-all;"><a href="${safeLoginUrl}" style="color:#1f3447;">${safeLoginUrl}</a></p>
                <p style="margin:16px 0 0 0;color:#4b5a66;">Pokud sis nic neobjednal/a, odpověz na tento email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#1f3447;color:#f6f1e7;font-family: 'Helvetica Neue', Arial, sans-serif;font-size:12px;letter-spacing:0.04em;">
                ${safeBrandName} · ${safeProductName}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildStartovacEmailText(params: {
  productName: string;
  loginUrl: string;
  creditsDelta: number;
  reward: string;
  amountCzk: number;
  trxId: string;
  purchasedAt: string;
}): string {
  const {
    productName,
    loginUrl,
    creditsDelta,
    reward,
    amountCzk,
    trxId,
    purchasedAt,
  } = params;

  return [
    `Díky za podporu projektu ${productName}.`,
    `Připsali jsme ${creditsDelta} kreditů.`,
    "",
    `Přihlašovací odkaz: ${loginUrl}`,
    "",
    `Odměna: ${reward}`,
    `Částka: ${amountCzk} Kč`,
    `Transakce: ${trxId}`,
    `Datum: ${purchasedAt}`,
    "",
    "Odkaz je určený pouze tobě. Pokud sis nic neobjednal/a, odpověz na tento email.",
  ].join("\n");
}

export async function sendStartovacTokenEmail(params: {
  to: string;
  token: string;
  creditsDelta: number;
  reward: string;
  amountCzk: number;
  trxId: string;
  purchasedAt: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PIXAGORA_EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Missing RESEND_API_KEY or PIXAGORA_EMAIL_FROM" };
  }

  const brandName =
    process.env.PIXAGORA_EMAIL_BRAND_NAME ?? "Svobodný přístav";
  const productName = process.env.PIXAGORA_EMAIL_PRODUCT_NAME ?? "Pixagora";
  const logoUrl = process.env.PIXAGORA_EMAIL_LOGO_URL;
  const logoAlt = process.env.PIXAGORA_EMAIL_LOGO_ALT ?? brandName;
  const appUrl = process.env.PIXAGORA_APP_URL;
  const loginPath = process.env.PIXAGORA_LOGIN_PATH ?? "/canvas";
  if (!appUrl) {
    return { ok: false, error: "Missing PIXAGORA_APP_URL" };
  }
  let loginUrl: string;
  try {
    const url = new URL(loginPath, appUrl);
    url.searchParams.set("token", params.token);
    loginUrl = url.toString();
  } catch (error) {
    return {
      ok: false,
      error: `Invalid PIXAGORA_APP_URL or PIXAGORA_LOGIN_PATH: ${String(error)}`,
    };
  }
  const replyTo = process.env.PIXAGORA_EMAIL_REPLY_TO;

  const subject = `${productName} – potvrzení platby a token`;
  const html = buildStartovacEmailHtml({
    brandName,
    productName,
    logoUrl,
    logoAlt,
    loginUrl,
    creditsDelta: params.creditsDelta,
    reward: params.reward,
    amountCzk: params.amountCzk,
    trxId: params.trxId,
    purchasedAt: params.purchasedAt,
  });
  const text = buildStartovacEmailText({
    productName,
    loginUrl,
    creditsDelta: params.creditsDelta,
    reward: params.reward,
    amountCzk: params.amountCzk,
    trxId: params.trxId,
    purchasedAt: params.purchasedAt,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `Resend error ${response.status}: ${errorText}` };
  }

  const data = (await response.json()) as { id?: string };
  return { ok: true, id: data.id };
}

export function buildMagicLinkEmailHtml(params: {
  brandName: string;
  productName: string;
  logoUrl?: string;
  logoAlt: string;
  loginUrl: string;
}): string {
  const { brandName, productName, logoUrl, logoAlt, loginUrl } = params;

  const safeBrandName = escapeHtml(brandName);
  const safeProductName = escapeHtml(productName);
  const safeLogoAlt = escapeHtml(logoAlt);
  const safeLoginUrl = escapeHtml(loginUrl);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${safeLogoAlt}" width="140" height="40" style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;" />`
    : `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; letter-spacing: 0.5px; color: #1f3447;">${safeBrandName}</div>`;

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeProductName} – přihlášení</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f1e7;color:#1f2a33;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f6f1e7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(31,52,71,0.12);">
            <tr>
              <td style="padding:24px 32px;border-bottom:3px solid #c58b3d;background:linear-gradient(135deg,#ffffff 0%,#fdf8f0 60%,#f6efe0 100%);">
                <div style="display:flex;align-items:center;gap:16px;">
                  ${logoHtml}
                </div>
                <div style="margin-top:8px;font-family: 'Georgia', 'Times New Roman', serif;font-size:20px;color:#1f3447;">
                  ${safeProductName}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;font-family: 'Helvetica Neue', Arial, sans-serif;font-size:16px;line-height:1.6;color:#1f2a33;">
                <p style="margin:0 0 16px 0;">Ahoj,</p>
                <p style="margin:0 0 16px 0;">klikni na tlačítko níže a přihlas se do ${safeProductName}.</p>
                <div style="background:#f8f3ea;border:1px solid #e7dcc7;border-radius:10px;padding:16px 18px;margin:20px 0;text-align:center;">
                  <a href="${safeLoginUrl}" style="display:inline-block;background:#c58b3d;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px;">Otevřít Pixagoru</a>
                </div>
                <p style="margin:18px 0 8px 0;color:#4b5a66;">Odkaz je určený pouze tobě. Pokud tlačítko nefunguje, použij tento odkaz:</p>
                <p style="margin:0;color:#1f3447;word-break:break-all;"><a href="${safeLoginUrl}" style="color:#1f3447;">${safeLoginUrl}</a></p>
                <p style="margin:16px 0 0 0;color:#4b5a66;">Pokud sis nepožádal/a o přihlášení, tento email můžeš ignorovat.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#1f3447;color:#f6f1e7;font-family: 'Helvetica Neue', Arial, sans-serif;font-size:12px;letter-spacing:0.04em;">
                ${safeBrandName} · ${safeProductName}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildMagicLinkEmailText(params: {
  productName: string;
  loginUrl: string;
}): string {
  const { productName, loginUrl } = params;

  return [
    `Přihlášení do ${productName}`,
    "",
    `Přihlašovací odkaz: ${loginUrl}`,
    "",
    "Odkaz je určený pouze tobě. Pokud sis nepožádal/a o přihlášení, tento email můžeš ignorovat.",
  ].join("\n");
}

export async function sendMagicLinkEmail(params: {
  to: string;
  token: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PIXAGORA_EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Missing RESEND_API_KEY or PIXAGORA_EMAIL_FROM" };
  }

  const brandName =
    process.env.PIXAGORA_EMAIL_BRAND_NAME ?? "Svobodný přístav";
  const productName = process.env.PIXAGORA_EMAIL_PRODUCT_NAME ?? "Pixagora";
  const logoUrl = process.env.PIXAGORA_EMAIL_LOGO_URL;
  const logoAlt = process.env.PIXAGORA_EMAIL_LOGO_ALT ?? brandName;
  const appUrl = process.env.PIXAGORA_APP_URL;
  const loginPath = process.env.PIXAGORA_LOGIN_PATH ?? "/canvas";
  if (!appUrl) {
    return { ok: false, error: "Missing PIXAGORA_APP_URL" };
  }
  let loginUrl: string;
  try {
    const url = new URL(loginPath, appUrl);
    url.searchParams.set("token", params.token);
    loginUrl = url.toString();
  } catch (error) {
    return {
      ok: false,
      error: `Invalid PIXAGORA_APP_URL or PIXAGORA_LOGIN_PATH: ${String(error)}`,
    };
  }
  const replyTo = process.env.PIXAGORA_EMAIL_REPLY_TO;

  const subject = `${productName} – přihlášení`;
  const html = buildMagicLinkEmailHtml({
    brandName,
    productName,
    logoUrl,
    logoAlt,
    loginUrl,
  });
  const text = buildMagicLinkEmailText({
    productName,
    loginUrl,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `Resend error ${response.status}: ${errorText}` };
  }

  const data = (await response.json()) as { id?: string };
  return { ok: true, id: data.id };
}
