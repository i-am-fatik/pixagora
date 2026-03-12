/**
 * Rewrite a Convex-generated URL (storage, upload) so its origin matches
 * NEXT_PUBLIC_CONVEX_URL. This is needed when the client accesses the app
 * via a non-localhost address (e.g. Tailscale IP) but Convex returns URLs
 * with http://127.0.0.1:3210.
 */
export function fixConvexUrl(url: string): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {return url;}
  try {
    const u = new URL(url);
    const base = new URL(convexUrl);
    u.protocol = base.protocol;
    u.host = base.host;
    return u.toString();
  } catch {
    return url;
  }
}
