import type { Metadata } from "next";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Plátno",
  description:
    "Kup pixely, kresli a tvoř s komunitou. PixAgora je společné pixelové plátno do knihy.",
  alternates: {
    canonical: "/canvas",
  },
  openGraph: {
    type: "website",
    title: "PixAgora – společné pixelové plátno do knihy",
    description:
      "Kup pixely, kresli a tvoř s komunitou. PixAgora je společné pixelové plátno do knihy.",
    url: "/canvas",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "PixAgora",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PixAgora – společné pixelové plátno do knihy",
    description:
      "Kup pixely, kresli a tvoř s komunitou. PixAgora je společné pixelové plátno do knihy.",
    images: ["/api/og"],
  },
};

export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
