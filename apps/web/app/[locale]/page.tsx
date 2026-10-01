"use client";

import { loadStoredAuth } from "@/lib/auth-storage";
import { getLastProject } from "@/lib/last-project";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LocaleHome() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const auth = loadStoredAuth();
    const last = getLastProject();
    router.replace(auth ? (last ? `/${locale}/projects/${last}/my-work` : `/${locale}/projects`) : `/${locale}/login`);
  }, [router, locale]);

  return null;
}
