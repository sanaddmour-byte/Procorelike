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
          className={`rounded-md border-2 px-2 py-1 font-semibold ${
            l === locale ? "border-white bg-orange-500 text-ink" : "border-white/40 bg-navy-800 text-white hover:border-white"
          }`}
        >
          {l === "en" ? t("english") : t("arabic")}
        </button>
      ))}
    </div>
  );
}
