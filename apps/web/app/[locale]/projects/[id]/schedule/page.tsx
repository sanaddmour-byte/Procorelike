"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useServerTable } from "@/lib/use-server-table";
import type { ScheduleTaskStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ScheduleTask {
  id: string;
  name: string;
  status: ScheduleTaskStatus;
  percentComplete: number;
  startDate: string;
  endDate: string;
  assignedCompanyId: string | null;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

function statusLabel(status: ScheduleTaskStatus, t: (key: string) => string): string {
  return {
    not_started: t("statusNotStarted"),
    in_progress: t("statusInProgress"),
    complete: t("statusComplete"),
    delayed: t("statusDelayed"),
  }[status];
}

const STATUS_TONE: Record<ScheduleTaskStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "info",
  complete: "success",
  delayed: "danger",
};

export default function SchedulePage() {
  const t = useTranslations("Schedule");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignedCompanyId, setAssignedCompanyId] = useState("");
  const [creating, setCreating] = useState(false);
  // No defaultSort: this list's original order (manual sortOrder, then startDate) is preserved
  // server-side when no explicit sort is chosen, rather than defaulting to one column.
  const serverTable = useServerTable<ScheduleTask>({ basePath: "/schedule-tasks", projectId: params.id });

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string | null): string {
    if (!id) return t("unassigned");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/schedule-tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          name,
          description: description || undefined,
          startDate,
          endDate,
          assignedCompanyId: assignedCompanyId || undefined,
        }),
      });
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setAssignedCompanyId("");
      setShowForm(false);
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

  const columns: DataTableColumn<ScheduleTask>[] = [
    { key: "name", header: t("name"), render: (task) => task.name, sortValue: (task) => task.name },
    {
      key: "status",
      header: t("status"),
      render: (task) => <StatusBadge tone={STATUS_TONE[task.status]} label={statusLabel(task.status, t)} />,
      sortValue: (task) => task.status,
      width: "130px",
    },
    {
      key: "startDate",
      header: t("dates"),
      render: (task) => `${task.startDate.slice(0, 10)} – ${task.endDate.slice(0, 10)}`,
      sortValue: (task) => task.startDate,
      width: "220px",
    },
    { key: "company", header: t("assignedCompany"), render: (task) => companyName(task.assignedCompanyId), width: "160px" },
    {
      key: "percentComplete",
      header: t("percentComplete"),
      width: "140px",
      render: (task) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full border border-ink/30 bg-cream shadow-brutal-inset">
            <div className="h-full bg-gradient-to-r from-navy-500 to-navy-700" style={{ width: `${task.percentComplete}%` }} />
          </div>
          <span className="shrink-0 text-xs text-navy-600">{task.percentComplete}%</span>
        </div>
      ),
      sortValue: (task) => task.percentComplete,
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
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("name")}
              <input required value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={2}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("startDate")}
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("endDate")}
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("assignedCompany")}
              <select
                value={assignedCompanyId}
                onChange={(e) => setAssignedCompanyId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
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

        <SavedViewsBar
          projectId={params.id}
          module="schedule"
          currentState={{ search: serverTable.search, filters: serverTable.filters, sort: serverTable.sort }}
          onApply={(state) => serverTable.applyView(state)}
        />

        <FilterBar
          searchValue={serverTable.search}
          onSearchChange={serverTable.onSearchChange}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["not_started", "in_progress", "complete", "delayed"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
            },
          ]}
          activeFilters={serverTable.filters}
          onFilterChange={serverTable.onFilterChange}
          onClearAll={serverTable.clearAll}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<ScheduleTask>
          columns={columns}
          rows={serverTable.rows}
          error={serverTable.error ? tc("errorGeneric") : null}
          onRetry={serverTable.reload}
          onRowClick={(task) => router.push(`/${locale}/projects/${params.id}/schedule/${task.id}`)}
          emptyTitle={hasActiveQuery ? t("noResults") : t("empty")}
          serverSort={serverTable.sort}
          onServerSortChange={serverTable.onServerSortChange}
          pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
        />
      </main>
    </>
  );
}
