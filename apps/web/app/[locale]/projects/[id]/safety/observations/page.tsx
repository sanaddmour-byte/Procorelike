"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { SafetyObservationCategory, SafetyObservationStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface SafetyObservation {
  id: string;
  observedAt: string;
  category: SafetyObservationCategory;
  status: SafetyObservationStatus;
  description: string;
}

function categoryLabel(category: SafetyObservationCategory, t: (key: string) => string): string {
  return {
    unsafe_condition: t("categoryUnsafeCondition"),
    unsafe_act: t("categoryUnsafeAct"),
    near_miss: t("categoryNearMiss"),
    good_catch: t("categoryGoodCatch"),
  }[category];
}

function statusLabel(status: SafetyObservationStatus, t: (key: string) => string): string {
  return { open: t("statusOpen"), resolved: t("statusResolved") }[status];
}

export default function SafetyObservationsPage() {
  const t = useTranslations("Safety");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [observations, setObservations] = useState<SafetyObservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [observedAt, setObservedAt] = useState("");
  const [category, setCategory] = useState<SafetyObservationCategory>("unsafe_condition");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load(): void {
    apiJson<SafetyObservation[]>(`/safety-observations?projectId=${params.id}`)
      .then(setObservations)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/safety-observations", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          observedAt: new Date(observedAt).toISOString(),
          category,
          description,
        }),
      });
      setObservedAt("");
      setCategory("unsafe_condition");
      setDescription("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string): Promise<void> {
    setTogglingId(id);
    try {
      await apiJson(`/safety-observations/${id}/toggle-resolved`, { method: "POST" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <Link
            href={`/${locale}/projects/${params.id}/safety`}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-white to-cream brutal-interactive px-3 py-2 text-sm text-navy-800"
          >
            {t("incidentsTab")}
          </Link>
        </div>

        <div className="mb-4 flex gap-2 border-b-3 border-ink">
          <span className="border-b-4 border-maroon-600 px-3 py-2 text-sm font-semibold text-maroon-700">{t("observationsTab")}</span>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newObservation")}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("observedAt")}
              <input
                type="datetime-local"
                required
                value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SafetyObservationCategory)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="unsafe_condition">{t("categoryUnsafeCondition")}</option>
                <option value="unsafe_act">{t("categoryUnsafeAct")}</option>
                <option value="near_miss">{t("categoryNearMiss")}</option>
                <option value="good_catch">{t("categoryGoodCatch")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!observations && !error && <p>{tc("loading")}</p>}
        {observations && observations.length === 0 && <p className="text-navy-600">{t("emptyObservations")}</p>}
        <ul className="flex flex-col gap-3">
          {observations?.map((obs) => (
            <li
              key={obs.id}
              className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{categoryLabel(obs.category, t)}</span>
                <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                  {statusLabel(obs.status, t)}
                </span>
              </div>
              <p className="mt-1 text-sm text-navy-700">{obs.description}</p>
              <p className="mt-1 text-xs text-navy-600">{obs.observedAt.slice(0, 16).replace("T", " ")}</p>
              <button
                onClick={() => void handleToggle(obs.id)}
                disabled={togglingId === obs.id}
                className="mt-3 rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {obs.status === "open" ? t("resolve") : t("reopen")}
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
