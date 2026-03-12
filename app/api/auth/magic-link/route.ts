import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
console.log("Convex site URL:", CONVEX_SITE_URL);

function buildConvexHttpUrl(path: string): string | null {
  if (!CONVEX_SITE_URL) {
    return null;
  }
  const trimmed = CONVEX_SITE_URL.replace(/\/$/, "");
  // Skip /http suffix for direct access (localhost, private IPs, or explicit port).
  // Cloud Convex deployments use /http prefix on the shared domain;
  // local/self-hosted deployments have a dedicated site-proxy port.
  const url = new URL(trimmed);
  const isDirect =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname.startsWith("10.") ||
    url.hostname.startsWith("100.") ||
    url.hostname.startsWith("192.168.") ||
    url.port !== "";
  const base = trimmed.endsWith("/http")
    ? trimmed
    : isDirect
      ? trimmed
      : `${trimmed}/http`;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function POST(req: NextRequest) {
  console.log("Received magic link request");

  if (!CONVEX_SITE_URL) {
    return NextResponse.json(
      { ok: false, error: "Missing CONVEX_SITE_URL" },
      { status: 500 },
    );
  }
  const convexUrl = buildConvexHttpUrl("/api/auth/magic-link");
  if (!convexUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing CONVEX_SITE_URL" },
      { status: 500 },
    );
  }

  const body = await req.json().catch((err) => {
    console.error("Failed to parse request body:", err);
    return NextResponse.json(
      { ok: false, error: "Invalid body " },
      { status: 400 },
    );
  });
  let res: Response;
  try {
    res = await fetch(convexUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(
      "Failed to reach Convex:",
      err,
      "CONVEX_SITE_URL:",
      CONVEX_SITE_URL,
    );
    return NextResponse.json(
      { ok: false, error: "Failed to reach backend" },
      { status: 503 },
    );
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    // Rewrite devLoginUrl origin to match the caller's origin
    // so the link works on whatever host the user is accessing.
    if (data.devLoginUrl) {
      const callerOrigin =
        req.headers.get("origin") ||
        (req.headers.get("host")
          ? `${req.nextUrl.protocol}//${req.headers.get("host")}`
          : null);
      if (callerOrigin) {
        try {
          const devUrl = new URL(data.devLoginUrl);
          const base = new URL(callerOrigin);
          devUrl.protocol = base.protocol;
          devUrl.host = base.host;
          data.devLoginUrl = devUrl.toString();
        } catch { /* keep original */ }
      }
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    console.error("Convex returned non-JSON:", res.status, text.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: "Unexpected server response" },
      { status: 502 },
    );
  }
}
