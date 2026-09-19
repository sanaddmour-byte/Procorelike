"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import type { BidPackageStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface BidPackage {
  id: string;
  number: string;
  title: string;
  costCodeId: string | null;
  status: BidPackageStatus;
  dueDate: string | null;
}

function statusLabel(status: BidPackageStatus, t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), closed: t("statusClosed"), awarded: t("statusAwarded"), canceled: t("statusCanceled") }[status];
}

const STATUS_TONE: Record<BidPackageStatus, StatusTone> = {
  draft: "neutral",
  open: "info",
  closed: "warning",
  awarded: "success",
  canceled: "danger",
};

export default function BiddingPage() {
  const t = useTranslations("Bidding");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [packages, setPackages] = useState<BidPackage[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [costCodeId, setCostCodeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<BidPackage[]>(`/bid-packages?projectId=${params.id}`)
      .then(setPackages)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`).then(setCostCodes).catch(() => undefined);
  }, [router, locale, params.id]);

  function costCodeLabel(id: string | null): string {
    if (!id) return "—";
    const cc = costCodes.find((c) => c.id === id);
    return cc ? `${cc.code} — ${cc.description}` : id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await apiJson("/bid-packages", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, title: title.trim(), costCodeId: costCodeId || undefined, dueDate: dueDate || undefined }),
      });
      setTitle("");
      setCostCodeId("");
      setDueDate("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const filteredPackages = useMemo(() => {
    if (!packages) return null;
    const q = search.trim().toLowerCase();
    return packages.filter((bp) => {
      if (statusFilter && bp.status !== statusFilter) return false;
      if (q && !bp.number.toLowerCase().includes(q) && !bp.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [packages, search, statusFilter]);

  const columns: DataTableColumn<BidPackage>[] = [
    { key: "number", header: t("number"), render: (bp) => bp.number, sortValue: (bp) => bp.number, width: "110px" },
    { key: "title", header: t("packageTitle"), render: (bp) => bp.title, sortValue: (bp) => bp.title },
    { key: "costCode", header: t("costCode"), render: (bp) => costCodeLabel(bp.costCodeId), sortValue: (bp) => costCodeLabel(bp.costCodeId) },
    {
      key: "dueDate",
      header: t("dueDate"),
      render: (bp) => (bp.dueDate ? bp.dueDate.slice(0, 10) : "—"),
      sortValue: (bp) => bp.dueDate ?? "",
      width: "130px",
    },
    {
      key: "status",
      header: t("status"),
      render: (bp) => <StatusBadge tone={STATUS_TONE[bp.status]} label={statusLabel(bp.status, t)} />,
      sortValue: (bp) => bp.status,
      width: "120px",
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
              {t("packageTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("costCode")}
              <select value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="">—</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
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
              options: (["draft", "open", "closed", "awarded", "canceled"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
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

        <DataTable<BidPackage>
          columns={columns}
          rows={filteredPackages}
          onRowClick={(bp) => router.push(`/${locale}/projects/${params.id}/bidding/${bp.id}`)}
          emptyTitle={packages && packages.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
    </>
  );
}
