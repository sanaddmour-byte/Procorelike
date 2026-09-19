"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson, downloadFile } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import type { CorrespondenceDirection, CorrespondenceStatus, CorrespondenceType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface CorrespondenceItem {
  id: string;
  correspondenceNumber: string;
  direction: CorrespondenceDirection;
  type: CorrespondenceType;
  subject: string;
  fromCompanyId: string;
  toCompanyId: string;
  status: CorrespondenceStatus;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

function statusLabel(status: CorrespondenceStatus, t: (key: string) => string): string {
  return { draft: t("statusDraft"), sent: t("statusSent"), acknowledged: t("statusAcknowledged"), closed: t("statusClosed") }[status];
}

function typeLabel(type: CorrespondenceType, t: (key: string) => string): string {
  return { letter: t("typeLetter"), notice: t("typeNotice"), transmittal: t("typeTransmittal"), memo: t("typeMemo") }[type];
}

const STATUS_TONE: Record<CorrespondenceStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  acknowledged: "success",
  closed: "neutral",
};

export default function CorrespondencePage() {
  const t = useTranslations("Correspondence");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<CorrespondenceItem[] | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<CorrespondenceDirection>("outgoing");
  const [type, setType] = useState<CorrespondenceType>("letter");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromCompanyId, setFromCompanyId] = useState("");
  const [toCompanyId, setToCompanyId] = useState("");
  const [responseRequiredBy, setResponseRequiredBy] = useState("");
  const [creating, setCreating] = useState(false);
  const pdfViewer = usePdfViewer();

  function load(): void {
    apiJson<CorrespondenceItem[]>(`/correspondence?projectId=${params.id}`)
      .then(setItems)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((cos) => {
        setCompanies(cos);
        setFromCompanyId((current) => current || cos[0]?.companyId || "");
        setToCompanyId((current) => current || cos[1]?.companyId || cos[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/correspondence", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          direction,
          type,
          subject,
          body,
          fromCompanyId,
          toCompanyId,
          responseRequiredBy: responseRequiredBy || undefined,
        }),
      });
      setSubject("");
      setBody("");
      setResponseRequiredBy("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (q && !item.correspondenceNumber.toLowerCase().includes(q) && !item.subject.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, statusFilter]);

  const columns: DataTableColumn<CorrespondenceItem>[] = [
    { key: "number", header: t("number"), render: (item) => item.correspondenceNumber, sortValue: (item) => item.correspondenceNumber, width: "110px" },
    { key: "subject", header: t("subject"), render: (item) => item.subject, sortValue: (item) => item.subject },
    { key: "type", header: t("type"), render: (item) => typeLabel(item.type, t), sortValue: (item) => item.type, width: "130px" },
    {
      key: "status",
      header: t("status"),
      render: (item) => <StatusBadge tone={STATUS_TONE[item.status]} label={statusLabel(item.status, t)} />,
      sortValue: (item) => item.status,
      width: "140px",
    },
    { key: "fromTo", header: t("fromTo"), render: (item) => `${companyName(item.fromCompanyId)} → ${companyName(item.toCompanyId)}`, width: "260px" },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <button
                onClick={() => void pdfViewer.openPdf(`/correspondence/summary-report?projectId=${params.id}`, t("title"), "correspondence-register.pdf")}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
              >
                {tc("exportAllPdf")}
              </button>
              <button
                onClick={() => void downloadFile(`/correspondence/summary-report?projectId=${params.id}&format=csv`, "correspondence-register.csv")}
                className="rounded-lg border-3 border-ink bg-white brutal-interactive px-3 py-2 text-sm font-semibold text-navy-800"
              >
                {tc("exportAllCsv")}
              </button>
              <button
                onClick={() => setShowForm((s) => !s)}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
              >
                {t("newButton")}
              </button>
            </>
          }
        />

        {showForm && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("direction")}
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as CorrespondenceDirection)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                >
                  <option value="outgoing">{t("directionOutgoing")}</option>
                  <option value="incoming">{t("directionIncoming")}</option>
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("type")}
                <select value={type} onChange={(e) => setType(e.target.value as CorrespondenceType)} className="rounded-lg border-3 border-ink px-3 py-2">
                  <option value="letter">{t("typeLetter")}</option>
                  <option value="notice">{t("typeNotice")}</option>
                  <option value="transmittal">{t("typeTransmittal")}</option>
                  <option value="memo">{t("typeMemo")}</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("subject")}
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("body")}
              <textarea required value={body} onChange={(e) => setBody(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" rows={4} />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("fromCompany")}
                <select value={fromCompanyId} onChange={(e) => setFromCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                  {companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("toCompany")}
                <select value={toCompanyId} onChange={(e) => setToCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                  {companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("responseRequiredBy")}
              <input
                type="date"
                value={responseRequiredBy}
                onChange={(e) => setResponseRequiredBy(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
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

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["draft", "sent", "acknowledged", "closed"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
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

        <DataTable<CorrespondenceItem>
          columns={columns}
          rows={filteredItems}
          onRowClick={(item) => router.push(`/${locale}/projects/${params.id}/correspondence/${item.id}`)}
          emptyTitle={items && items.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
