import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
console.log("Convex site URL:", CONVEX_SITE_URL);

function buildConvexHttpUrl(path: string): string | null {
  if (!CONVEX_SITE_URL) {
    return null;
  }
  const trimmed = CONVEX_SITE_URL.replace(/\/$/, "");
  const isLocal =
    trimmed.startsWith("http://127.0.0.1") ||
    trimmed.startsWith("http://localhost") ||
    trimmed.startsWith("https://127.0.0.1") ||
    trimmed.startsWith("https://localhost");
  const base = trimmed.endsWith("/http")
    ? trimmed
    : isLocal
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
    return NextResponse.json(data, { status: res.status });
  } catch {
    console.error("Convex returned non-JSON:", res.status, text.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: "Unexpected server response" },
      { status: 502 },
    );
  }
}
