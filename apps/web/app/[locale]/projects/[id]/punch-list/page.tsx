"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface PunchItem {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "ready_for_review" | "not_accepted" | "in_dispute" | "approved" | "closed";
  needsReview: boolean;
}

interface SavedView {
  id: string;
  name: string;
  filters: { status?: string };
}

const STATUS_TONE: Record<PunchItem["status"], StatusTone> = {
  open: "info",
  ready_for_review: "warning",
  not_accepted: "danger",
  in_dispute: "danger",
  approved: "success",
  closed: "neutral",
};

export default function PunchListPage() {
  const t = useTranslations("PunchList");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<PunchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
      not_accepted: t("statusNotAccepted"),
      in_dispute: t("statusInDispute"),
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

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (q && !item.number.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, statusFilter]);

  const columns: DataTableColumn<PunchItem>[] = [
    { key: "number", header: t("number"), render: (item) => item.number, sortValue: (item) => item.number, width: "110px" },
    { key: "description", header: t("description"), render: (item) => item.description, sortValue: (item) => item.description },
    {
      key: "status",
      header: t("status"),
      render: (item) => <StatusBadge tone={STATUS_TONE[item.status]} label={statusLabel(item.status)} />,
      sortValue: (item) => item.status,
      width: "160px",
    },
    {
      key: "needsReview",
      header: "",
      width: "180px",
      render: (item) => (item.needsReview ? <StatusBadge tone="warning" label={t("needsReview")} /> : null),
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <Link
              href={`/${locale}/projects/${params.id}/punch-list/new`}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </Link>
          }
        />

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("saveViewAs")}
            <input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" placeholder={t("viewNamePlaceholder")} />
          </label>
          <button onClick={() => void handleSaveView()} disabled={savingView || !newViewName.trim()} className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">
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

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["open", "ready_for_review", "not_accepted", "in_dispute", "approved", "closed"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
            },
          ]}
          activeFilters={{ status: statusFilter }}
          onFilterChange={(_key, value) => setStatusFilter(value)}
          onClearAll={() => {
            setSearch("");
            setStatusFilter("");
          }}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<PunchItem>
          columns={columns}
          rows={filteredItems}
          onRowClick={(item) => router.push(`/${locale}/projects/${params.id}/punch-list/${item.id}`)}
          emptyTitle={items && items.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
    </>
  );
}
