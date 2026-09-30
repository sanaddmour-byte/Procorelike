"use client";

import { Header } from "@/components/Header";
import { errorMessage } from "@/lib/error-message";
import { ErrorState } from "@/components/ui/ErrorState";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  address: string | null;
}

export default function ProjectsPage() {
  const t = useTranslations("Projects");
  const tc = useTranslations("Common");
  const te = useTranslations("Errors");
  const router = useRouter();
  const locale = useLocale();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Project[]>("/projects")
      .then(setProjects)
      .catch((err) => setError(errorMessage(err, te)));
  }, [router, locale, tc]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-3 py-2 sm:px-4 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <Link href={`/${locale}/companies`} className="text-sm font-semibold text-navy-700 underline">
            {t("manageCompanyLogo")}
          </Link>
        </div>
        {error && <ErrorState message={error} retryLabel={tc("retry")} onRetry={() => window.location.reload()} />}
        {!projects && !error && <p>{tc("loading")}</p>}
        {projects && projects.length === 0 && <p>{t("empty")}</p>}
        <ul className="flex flex-col gap-4">
          {projects?.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal">
              <div className="h-2 bg-orange-500" aria-hidden="true" />
              <div className="p-4">
                <div className="text-lg font-bold text-navy-900">{p.name}</div>
                {p.address && <div className="text-sm text-navy-600">{p.address}</div>}
                <div className="mt-3 flex flex-wrap gap-gap-hit">
                  <Link
                    href={`/${locale}/projects/${p.id}/my-work`}
                    className="hit-task inline-flex items-center rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-5 font-bold text-white brutal-interactive"
                  >
                    {t("open")}
                  </Link>
                  <Link href={`/${locale}/projects/${p.id}/directory`} className="hit-task inline-flex items-center rounded-lg border-3 border-ink bg-white px-4 font-semibold text-navy-900">
                    {t("viewDirectory")}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
