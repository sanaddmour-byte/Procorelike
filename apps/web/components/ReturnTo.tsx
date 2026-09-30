"use client";

import { loadStoredAuth } from "@/lib/auth-storage";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const KEY = "siteops.returnTo";

/** Remembers the page a signed-out visitor asked for so login can send them back to it (plan C4: a shared link must survive the login wall). */
export function ReturnTo() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (!loadStoredAuth() && !pathname.endsWith("/login")) window.sessionStorage.setItem(KEY, `${pathname}${window.location.search}`);
    } catch {
      // convenience only
    }
  }, [pathname]);
  return null;
}

/** Takes (and clears) the remembered page, only if it is an in-app path for this locale. */
export function takeReturnTo(locale: string): string | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return v && v.startsWith(`/${locale}/`) && !v.includes("//") && !v.endsWith("/login") ? v : null;
  } catch {
    return null;
  }
}
