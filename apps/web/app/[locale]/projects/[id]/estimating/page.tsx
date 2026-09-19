"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import type { EstimateStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface Estimate {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  convertedToBudgetAt: string | null;
}

const STATUS_TONE: Record<EstimateStatus, StatusTone> = {
  draft: "neutral",
  final: "success",
};

export default function EstimatingPage() {
  const t = useTranslations("Estimating");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  const filteredEstimates = useMemo(() => {
    if (!estimates) return null;
    const q = search.trim().toLowerCase();
    return estimates.filter((est) => {
      if (statusFilter && est.status !== statusFilter) return false;
      if (q && !est.number.toLowerCase().includes(q) && !est.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [estimates, search, statusFilter]);

  const columns: DataTableColumn<Estimate>[] = [
    { key: "number", header: t("number"), render: (est) => est.number, sortValue: (est) => est.number, width: "110px" },
    { key: "title", header: t("estimateTitle"), render: (est) => est.title, sortValue: (est) => est.title },
    {
      key: "status",
      header: t("status"),
      render: (est) => <StatusBadge tone={STATUS_TONE[est.status]} label={statusLabel(est.status)} />,
      sortValue: (est) => est.status,
      width: "120px",
    },
    {
      key: "convertedToBudget",
      header: t("convertedToBudget"),
      render: (est) => (est.convertedToBudgetAt ? t("convertedToBudget") : "—"),
      width: "160px",
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </button>
          }
        />

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

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["draft", "final"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
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

        <DataTable<Estimate>
          columns={columns}
          rows={filteredEstimates}
          onRowClick={(est) => router.push(`/${locale}/projects/${params.id}/estimating/${est.id}`)}
          emptyTitle={estimates && estimates.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
    </>
  );
}
