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
  const res = await fetch(`${CONVEX_SITE_URL}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
