"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiFetch, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useServerTable } from "@/lib/use-server-table";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ProjectCompany {
  companyId: string;
  name: string;
  type: string;
}

interface Commitment {
  id: string;
  number: string;
  title: string;
  companyId: string;
  type: "subcontract" | "po";
  retentionPct: string;
}

export default function CommitmentsPage() {
  const t = useTranslations("Commitments");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState<"subcontract" | "po">("subcontract");
  const [retentionPct, setRetentionPct] = useState("0");
  const [creating, setCreating] = useState(false);
  const serverTable = useServerTable<Commitment>({ basePath: "/commitments", projectId: params.id, defaultSort: { key: "number", direction: "asc" } });

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((cos) => {
        setCompanies(cos);
        setCompanyId((current) => current || cos[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleExportIif(): Promise<void> {
    const res = await apiFetch(`/admin/projects/${params.id}/exports/commitments.iif`);
    if (!res.ok) {
      setError(tc("errorGeneric"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commitments-${params.id}.iif`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!companyId || !title.trim()) return;
    setCreating(true);
    try {
      await apiJson("/commitments", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, companyId, type, title: title.trim(), retentionPct: Number(retentionPct || 0) }),
      });
      setTitle("");
      setShowForm(false);
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

  const columns: DataTableColumn<Commitment>[] = [
    { key: "number", header: t("number"), render: (c) => c.number, sortValue: (c) => c.number, width: "110px" },
    { key: "title", header: t("titleField"), render: (c) => c.title, sortValue: (c) => c.title },
    { key: "company", header: t("company"), render: (c) => companyName(c.companyId), width: "200px" },
    {
      key: "type",
      header: t("type"),
      render: (c) => <StatusBadge tone="neutral" label={c.type === "po" ? t("typePo") : t("typeSubcontract")} />,
      sortValue: (c) => c.type,
      width: "150px",
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <button onClick={() => void handleExportIif()} className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800">
                {t("exportIif")}
              </button>
              <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
                {t("newButton")}
              </button>
            </>
          }
        />

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("titleField")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("company")}
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("type")}
              <select value={type} onChange={(e) => setType(e.target.value as "subcontract" | "po")} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="subcontract">{t("typeSubcontract")}</option>
                <option value="po">{t("typePo")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("retentionPct")}
              <input type="number" step="0.01" min="0" max="100" value={retentionPct} onChange={(e) => setRetentionPct(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}

        <SavedViewsBar
          projectId={params.id}
          module="commitments"
          currentState={{ search: serverTable.search, filters: serverTable.filters, sort: serverTable.sort }}
          onApply={(state) => serverTable.applyView(state)}
        />

        <FilterBar
          searchValue={serverTable.search}
          onSearchChange={serverTable.onSearchChange}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "type",
              label: t("type"),
              options: [
                { value: "subcontract", label: t("typeSubcontract") },
                { value: "po", label: t("typePo") },
              ],
            },
            {
              key: "companyId",
              label: t("company"),
              options: companies.map((c) => ({ value: c.companyId, label: c.name })),
            },
          ]}
          activeFilters={serverTable.filters}
          onFilterChange={serverTable.onFilterChange}
          onClearAll={serverTable.clearAll}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<Commitment>
          storageKey="commitments"
          columns={columns}
          rows={serverTable.rows}
          error={serverTable.error ? tc("errorGeneric") : null}
          onRetry={serverTable.reload}
          onRowClick={(c) => router.push(`/${locale}/projects/${params.id}/commitments/${c.id}`)}
          emptyTitle={hasActiveQuery ? t("noResults") : t("empty")}
          serverSort={serverTable.sort}
          onServerSortChange={serverTable.onServerSortChange}
          pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
        />
      </main>
    </>
  );
}
