import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Replay plátna",
  description: "Přehrání historie plátna PixAgora.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: "/canvas",
  },
};

export default function ReplayLayout({ children }: { children: ReactNode }) {
  return children;
}
