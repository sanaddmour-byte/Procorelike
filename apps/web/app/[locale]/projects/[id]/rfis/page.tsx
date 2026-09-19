"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { PersonnelPicker } from "@/components/PersonnelPicker";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson, downloadFile } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useServerTable } from "@/lib/use-server-table";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";

interface Rfi {
  id: string;
  number: string;
  subject: string;
  status: "draft" | "open" | "answered" | "closed";
  ballInCourtUserId: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  isPrivate: boolean;
}

interface Member {
  userId: string;
  name: string;
}

function statusLabel(status: Rfi["status"], t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), answered: t("statusAnswered"), closed: t("statusClosed") }[status];
}

export default function RfisPage() {
  const t = useTranslations("Rfis");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [ballInCourtUserId, setBallInCourtUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [costImpact, setCostImpact] = useState<"yes" | "no" | "na">("na");
  const [scheduleImpact, setScheduleImpact] = useState<"yes" | "no" | "na">("na");
  const [isPrivate, setIsPrivate] = useState(false);
  const [distributionUserIds, setDistributionUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const pdfViewer = usePdfViewer();
  const serverTable = useServerTable<Rfi>({ basePath: "/rfis", projectId: params.id, defaultSort: { key: "number", direction: "asc" } });

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

  const columns: DataTableColumn<Rfi>[] = [
    { key: "number", header: t("number"), render: (rfi) => rfi.number, sortValue: (rfi) => rfi.number, width: "110px" },
    { key: "subject", header: t("subject"), render: (rfi) => rfi.subject, sortValue: (rfi) => rfi.subject },
    {
      key: "status",
      header: t("status"),
      render: (rfi) => <StatusBadge status={rfi.status} label={statusLabel(rfi.status, t)} />,
      sortValue: (rfi) => rfi.status,
      width: "130px",
    },
    { key: "ballInCourt", header: t("ballInCourt"), render: (rfi) => memberName(rfi.ballInCourtUserId), width: "160px" },
    {
      key: "flags",
      header: t("flags"),
      render: (rfi) => (
        <div className="flex gap-1">
          {rfi.isPrivate && <StatusBadge tone="neutral" label={t("private")} />}
          {rfi.isOverdue && <StatusBadge tone="danger" label={t("overdue")} />}
        </div>
      ),
      width: "160px",
    },
  ];

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/rfis", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          subject,
          question,
          ballInCourtUserId: ballInCourtUserId || undefined,
          dueDate: dueDate || undefined,
          reference: reference || undefined,
          costImpact,
          scheduleImpact,
          isPrivate,
          distributionUserIds,
        }),
      });
      setSubject("");
      setQuestion("");
      setBallInCourtUserId("");
      setDueDate("");
      setReference("");
      setCostImpact("na");
      setScheduleImpact("na");
      setIsPrivate(false);
      setDistributionUserIds([]);
      setShowForm(false);
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <button
                onClick={() => void pdfViewer.openPdf(`/rfis/summary-report?projectId=${params.id}`, t("title"), "rfi-register.pdf")}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
              >
                {tc("exportAllPdf")}
              </button>
              <button
                onClick={() => void downloadFile(`/rfis/summary-report?projectId=${params.id}&format=csv`, "rfi-register.csv")}
                className="rounded-lg border-3 border-ink bg-white brutal-interactive px-3 py-2 text-sm font-semibold text-navy-800"
              >
                {tc("exportAllCsv")}
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
              {t("subject")}
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("question")}
              <textarea
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("ballInCourt")}
              <select
                value={ballInCourtUserId}
                onChange={(e) => setBallInCourtUserId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("reference")}
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                {t("costImpact")}
                <select value={costImpact} onChange={(e) => setCostImpact(e.target.value as typeof costImpact)} className="rounded-lg border-3 border-ink px-3 py-2">
                  <option value="na">{t("impactNa")}</option>
                  <option value="yes">{t("impactYes")}</option>
                  <option value="no">{t("impactNo")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("scheduleImpact")}
                <select value={scheduleImpact} onChange={(e) => setScheduleImpact(e.target.value as typeof scheduleImpact)} className="rounded-lg border-3 border-ink px-3 py-2">
                  <option value="na">{t("impactNa")}</option>
                  <option value="yes">{t("impactYes")}</option>
                  <option value="no">{t("impactNo")}</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              {t("private")}
            </label>
            <PersonnelPicker label={t("distribution")} members={members} selectedUserIds={distributionUserIds} onChange={setDistributionUserIds} />
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}

        <SavedViewsBar
          projectId={params.id}
          module="rfis"
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
              options: (["draft", "open", "answered", "closed"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
            },
            {
              key: "assigneeUserId",
              label: t("ballInCourt"),
              options: members.map((m) => ({ value: m.userId, label: m.name })),
            },
          ]}
          activeFilters={serverTable.filters}
          onFilterChange={serverTable.onFilterChange}
          onClearAll={serverTable.clearAll}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<Rfi>
          columns={columns}
          rows={serverTable.rows}
          error={serverTable.error ? tc("errorGeneric") : null}
          onRetry={serverTable.reload}
          onRowClick={(rfi) => router.push(`/${locale}/projects/${params.id}/rfis/${rfi.id}`)}
          emptyTitle={hasActiveQuery ? t("noResults") : t("empty")}
          serverSort={serverTable.sort}
          onServerSortChange={serverTable.onServerSortChange}
          pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
        />
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
