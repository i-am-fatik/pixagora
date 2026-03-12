import { NextResponse } from "next/server";

/**
 * Proxy for Convex snapshot PNG.
 * Fetches from the Convex HTTP endpoint server-side (127.0.0.1 works here),
 * follows the 302 redirect to storage, and streams the PNG bytes back.
 * This avoids CORS and ERR_BLOCKED_BY_CLIENT issues in the browser.
 */
export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json({ error: "No NEXT_PUBLIC_CONVEX_SITE_URL configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${siteUrl}/api/snapshot/default`, {
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      return new NextResponse(res.statusText, { status: res.status });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": blob.type || "image/png",
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("canvas-snapshot proxy error:", err);
    return NextResponse.json({ error: "Failed to fetch snapshot" }, { status: 502 });
  }
}
