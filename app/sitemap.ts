import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixagora.urza.cz";
  const now = new Date();
  return [
    {
      url: `${baseUrl}/canvas`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
