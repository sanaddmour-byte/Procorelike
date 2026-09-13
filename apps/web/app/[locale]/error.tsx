"use client";

import { Header } from "@/components/Header";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Common");
  const locale = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("errorBoundaryTitle")}</h1>
        <p className="text-navy-700">{t("errorBoundaryBody")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-3 py-2 font-bold text-ink"
          >
            {t("retry")}
          </button>
          <Link
            href={`/${locale}/projects`}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 font-semibold text-white"
          >
            {t("backToProjects")}
          </Link>
        </div>
      </main>
    </>
  );
}
