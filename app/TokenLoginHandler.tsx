"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TOKEN_PARAM = "token";

export function TokenLoginHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const token = searchParams.get(TOKEN_PARAM)?.trim() ?? "";
  const search = searchParams.toString();

  useEffect(() => {
    if (!token) {
      return;
    }
    try {
      localStorage.setItem("pixagora-token", token);
    } catch {}
    window.dispatchEvent(
      new CustomEvent("pixagora-login", { detail: { token } }),
    );

    const nextParams = new URLSearchParams(search);
    nextParams.delete(TOKEN_PARAM);
    const nextSearch = nextParams.toString();
    const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [token, search, pathname, router]);

  return null;
}
