import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ReactNode } from "react";

export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
