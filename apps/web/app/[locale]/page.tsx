"use client";

import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LocaleHome() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const auth = loadStoredAuth();
    router.replace(auth ? `/${locale}/projects` : `/${locale}/login`);
  }, [router, locale]);

  return null;
}
