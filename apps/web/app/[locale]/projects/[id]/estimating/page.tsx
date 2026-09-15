"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { EstimateStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Estimate {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  convertedToBudgetAt: string | null;
}

export default function EstimatingPage() {
  const t = useTranslations("Estimating");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Estimate[]>(`/estimates?projectId=${params.id}`)
      .then(setEstimates)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id]);

  function statusLabel(status: EstimateStatus): string {
    return { draft: t("statusDraft"), final: t("statusFinal") }[status];
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await apiJson("/estimates", { method: "POST", body: JSON.stringify({ projectId: params.id, title: title.trim() }) });
      setTitle("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("estimateTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!estimates && !error && <p>{tc("loading")}</p>}
        {estimates && estimates.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {estimates?.map((e) => (
            <li key={e.id}>
              <Link
                href={`/${locale}/projects/${params.id}/estimating/${e.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {e.number} — {e.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(e.status)}</span>
                </div>
                {e.convertedToBudgetAt && <p className="mt-1 text-sm text-navy-600">{t("convertedToBudget")}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
