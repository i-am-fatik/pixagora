import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TokenLoginHandler } from "./TokenLoginHandler";
import { Suspense } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixagora.urza.cz",
  ),
  title: {
    default: "PixAgora",
    template: "%s | PixAgora",
  },
  description:
    "Společné pixelové plátno do knihy. Kup pixely, kresli a tvoř s komunitou.",
  openGraph: {
    type: "website",
    siteName: "PixAgora",
    title: "PixAgora",
    description:
      "Společné pixelové plátno do knihy. Kup pixely, kresli a tvoř s komunitou.",
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
    title: "PixAgora",
    description:
      "Společné pixelové plátno do knihy. Kup pixely, kresli a tvoř s komunitou.",
    images: ["/api/og"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PixAgora",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` only affects the html tag,
    // and is needed by `ThemeProvider` which sets the theme
    // class attribute on it
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class">
          <Suspense>
            <TokenLoginHandler />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
