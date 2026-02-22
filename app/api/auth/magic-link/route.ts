import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export async function POST(req: NextRequest) {
  if (!CONVEX_SITE_URL) {
    return NextResponse.json(
      { ok: false, error: "Missing CONVEX_SITE_URL" },
      { status: 500 },
    );
  }

  const body = await req.json();
  let res: Response;
  try {
    res = await fetch(`${CONVEX_SITE_URL}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("Failed to reach Convex:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to reach backend" },
      { status: 502 },
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
