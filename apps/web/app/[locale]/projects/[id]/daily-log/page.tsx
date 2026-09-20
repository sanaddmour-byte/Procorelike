"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface DailyLog {
  id: string;
  logDate: string;
  notes: string | null;
  lockedAt: string | null;
}

export default function DailyLogListPage() {
  const t = useTranslations("DailyLog");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<DailyLog[]>(`/daily-logs?projectId=${params.id}`)
      .then((data) => setLogs(data.sort((a, b) => (a.logDate < b.logDate ? 1 : -1))))
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  const filteredLogs = useMemo(() => {
    if (!logs) return null;
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => log.logDate.toLowerCase().includes(q) || (log.notes ?? "").toLowerCase().includes(q));
  }, [logs, search]);

  const columns: DataTableColumn<DailyLog>[] = [
    { key: "date", header: t("date"), render: (log) => log.logDate, sortValue: (log) => log.logDate, width: "140px" },
    { key: "notes", header: t("notes"), render: (log) => log.notes ?? "" },
    {
      key: "status",
      header: t("status"),
      render: (log) => <StatusBadge tone={log.lockedAt ? "neutral" : "info"} label={log.lockedAt ? t("locked") : t("open")} />,
      width: "110px",
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <Link
              href={`/${locale}/projects/${params.id}/daily-log/new`}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </Link>
          }
        />
        {error && <p className="text-maroon-700">{error}</p>}

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          activeFilters={{}}
          onFilterChange={() => undefined}
          onClearAll={() => setSearch("")}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<DailyLog>
          storageKey="daily-log"
          columns={columns}
          rows={filteredLogs}
          onRowClick={(log) => router.push(`/${locale}/projects/${params.id}/daily-log/${log.id}`)}
          emptyTitle={logs && logs.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
    </>
  );
}
