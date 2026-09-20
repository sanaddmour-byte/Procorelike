"use client";

import { BulkActionsBar } from "@/components/ui/BulkActionsBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useServerTable } from "@/lib/use-server-table";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PunchItem {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "ready_for_review" | "not_accepted" | "in_dispute" | "approved" | "closed";
  needsReview: boolean;
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

  const serverTable = useServerTable<PunchItem>({ basePath: "/punch-items", projectId: params.id, defaultSort: { key: "number", direction: "asc" } });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkSendForReview, setConfirmBulkSendForReview] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
  }, [router, locale]);

  // Selection is scoped to the currently rendered page/view -- clear it whenever
  // the underlying result set changes so a stale id never lingers into a new view.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [serverTable.search, serverTable.filters, serverTable.sort, serverTable.page]);

  async function handleBulkSendForReview(): Promise<void> {
    setConfirmBulkSendForReview(false);
    setBulkSending(true);
    try {
      const results = await apiJson<{ id: string; ok: boolean; error?: string }[]>("/punch-items/bulk-transition", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds], toStatus: "ready_for_review" }),
      });
      const failed = results.filter((r) => !r.ok).length;
      setError(failed > 0 ? tc("bulkPartialFailure", { failed, total: results.length }) : null);
      setSelectedIds(new Set());
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBulkSending(false);
    }
  }

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

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

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

        {error && <p className="text-maroon-700">{error}</p>}

        <SavedViewsBar
          projectId={params.id}
          module="punch_list"
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
              options: (["open", "ready_for_review", "not_accepted", "in_dispute", "approved", "closed"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
            },
          ]}
          activeFilters={serverTable.filters}
          onFilterChange={serverTable.onFilterChange}
          onClearAll={serverTable.clearAll}
          clearAllLabel={tc("clearAll")}
        />

        <BulkActionsBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <button
            type="button"
            disabled={bulkSending}
            onClick={() => setConfirmBulkSendForReview(true)}
            className="rounded-lg border-2 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t("bulkSendForReviewAction")}
          </button>
        </BulkActionsBar>

        <DataTable<PunchItem>
          storageKey="punch-list"
          columns={columns}
          rows={serverTable.rows}
          error={serverTable.error ? tc("errorGeneric") : null}
          onRetry={serverTable.reload}
          onRowClick={(item) => router.push(`/${locale}/projects/${params.id}/punch-list/${item.id}`)}
          emptyTitle={hasActiveQuery ? t("noResults") : t("empty")}
          serverSort={serverTable.sort}
          onServerSortChange={serverTable.onServerSortChange}
          pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
          selection={{ selectedIds, getRowId: (item) => item.id, onSelectionChange: setSelectedIds }}
        />
      </main>
      <ConfirmDialog
        open={confirmBulkSendForReview}
        title={t("bulkSendForReviewConfirmTitle")}
        message={t("bulkSendForReviewConfirmMessage", { count: selectedIds.size })}
        confirmLabel={t("bulkSendForReviewAction")}
        cancelLabel={tc("cancel")}
        onConfirm={() => void handleBulkSendForReview()}
        onCancel={() => setConfirmBulkSendForReview(false)}
      />
    </>
  );
}
