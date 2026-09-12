"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PunchItem {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "ready_for_review" | "approved" | "closed";
  needsReview: boolean;
}

interface SavedView {
  id: string;
  name: string;
  filters: { status?: string };
}

export default function PunchListPage() {
  const t = useTranslations("PunchList");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<PunchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  function loadSavedViews(): void {
    apiJson<SavedView[]>(`/saved-views?projectId=${params.id}&module=punch_list`)
      .then(setSavedViews)
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<PunchItem[]>(`/punch-items?projectId=${params.id}`)
      .then(setItems)
      .catch(() => setError(tc("errorGeneric")));
    loadSavedViews();
  }, [router, locale, params.id, tc]);

  function statusLabel(status: PunchItem["status"]): string {
    return {
      open: t("statusOpen"),
      ready_for_review: t("statusReadyForReview"),
      approved: t("statusApproved"),
      closed: t("statusClosed"),
    }[status];
  }

  async function handleSaveView(): Promise<void> {
    if (!newViewName.trim()) return;
    setSavingView(true);
    try {
      await apiJson("/saved-views", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, module: "punch_list", name: newViewName.trim(), filters: { status: statusFilter } }),
      });
      setNewViewName("");
      loadSavedViews();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSavingView(false);
    }
  }

  const filteredItems = items?.filter((item) => !statusFilter || item.status === statusFilter) ?? null;

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <Link
            href={`/${locale}/projects/${params.id}/punch-list/new`}
            className="rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("filterByStatus")}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
              <option value="">{t("filterAll")}</option>
              <option value="open">{t("statusOpen")}</option>
              <option value="ready_for_review">{t("statusReadyForReview")}</option>
              <option value="approved">{t("statusApproved")}</option>
              <option value="closed">{t("statusClosed")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("saveViewAs")}
            <input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" placeholder={t("viewNamePlaceholder")} />
          </label>
          <button onClick={() => void handleSaveView()} disabled={savingView || !newViewName.trim()} className="rounded-lg border-3 border-ink bg-orange-500 brutal-interactive px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">
            {t("saveView")}
          </button>
          {savedViews.map((view) => (
            <button
              key={view.id}
              onClick={() => setStatusFilter(view.filters.status ?? "")}
              className="rounded-full border-3 border-ink bg-navy-100 px-3 py-1 text-xs font-semibold text-navy-800"
            >
              {view.name}
            </button>
          ))}
        </div>

        {error && <p className="text-maroon-700">{error}</p>}
        {!filteredItems && !error && <p>{tc("loading")}</p>}
        {filteredItems && filteredItems.length === 0 && <p>{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {filteredItems?.map((item) => (
            <li key={item.id}>
              <Link
                href={`/${locale}/projects/${params.id}/punch-list/${item.id}`}
                className="block rounded-xl border-3 border-ink bg-white p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.number} — {item.description}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {statusLabel(item.status)}
                  </span>
                </div>
                {item.needsReview && (
                  <p className="mt-1 text-xs font-medium text-orange-800">{t("needsReview")}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
