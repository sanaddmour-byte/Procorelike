"use client";

import { Header } from "@/components/Header";
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
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, tc]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
        {error && <p className="text-red-600">{error}</p>}
        {!projects && !error && <p>{tc("loading")}</p>}
        {projects && projects.length === 0 && <p>{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {projects?.map((p) => (
            <li key={p.id} className="rounded border border-slate-200 p-4">
              <div className="font-medium">{p.name}</div>
              {p.address && <div className="text-sm text-slate-500">{p.address}</div>}
              <Link
                href={`/${locale}/projects/${p.id}/directory`}
                className="mt-2 inline-block text-sm text-slate-900 underline"
              >
                {t("viewDirectory")}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
