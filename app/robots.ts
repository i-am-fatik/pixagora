import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixagora.urza.cz";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/canvas/replay", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
