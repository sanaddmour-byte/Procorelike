"use client";

import { LOCALES, type Locale } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Language");

  function switchTo(nextLocale: Locale): void {
    const segments = pathname.split("/");
    segments[1] = nextLocale;
    router.push(segments.join("/"));
  }

  return (
    <div className="flex gap-2 text-sm">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-current={l === locale}
          className={`rounded px-2 py-1 ${
            l === locale ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          {l === "en" ? t("english") : t("arabic")}
        </button>
      ))}
    </div>
  );
}
