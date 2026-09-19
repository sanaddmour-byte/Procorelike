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
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface ChecklistTemplate {
  id: string;
  title: string;
}

interface Inspection {
  id: string;
  templateId: string;
  status: "scheduled" | "in_progress" | "completed";
  scheduledAt: string | null;
}

function statusLabel(status: Inspection["status"], t: (key: string) => string): string {
  return { scheduled: t("statusScheduled"), in_progress: t("statusInProgress"), completed: t("statusCompleted") }[status];
}

const STATUS_TONE: Record<Inspection["status"], StatusTone> = {
  scheduled: "neutral",
  in_progress: "info",
  completed: "success",
};

export default function InspectionsPage() {
  const t = useTranslations("Inspections");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [creating, setCreating] = useState(false);
  const pdfViewer = usePdfViewer();

  function load(): void {
    apiJson<Inspection[]>(`/inspections?projectId=${params.id}`)
      .then(setInspections)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ChecklistTemplate[]>(`/checklist-templates?projectId=${params.id}`)
      .then((tpls) => {
        setTemplates(tpls);
        setTemplateId((current) => current || tpls[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function templateTitle(id: string): string {
    return templates.find((tpl) => tpl.id === id)?.title ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!templateId) return;
    setCreating(true);
    try {
      await apiJson("/inspections", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          templateId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      setScheduledAt("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const filteredInspections = useMemo(() => {
    if (!inspections) return null;
    const q = search.trim().toLowerCase();
    return inspections.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (q && !templateTitle(i.templateId).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inspections, search, statusFilter, templates]);

  const columns: DataTableColumn<Inspection>[] = [
    { key: "template", header: t("template"), render: (i) => templateTitle(i.templateId), sortValue: (i) => templateTitle(i.templateId) },
    {
      key: "status",
      header: t("status"),
      render: (i) => <StatusBadge tone={STATUS_TONE[i.status]} label={statusLabel(i.status, t)} />,
      sortValue: (i) => i.status,
      width: "150px",
    },
    { key: "scheduledAt", header: t("scheduledDateColumn"), render: (i) => (i.scheduledAt ? i.scheduledAt.slice(0, 10) : ""), sortValue: (i) => i.scheduledAt ?? "", width: "150px" },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <Link href={`/${locale}/projects/${params.id}/inspections/templates`} className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800">
                {t("manageTemplates")}
              </Link>
              <button
                onClick={() => void pdfViewer.openPdf(`/inspections/summary-report?projectId=${params.id}`, t("title"), "inspection-register.pdf")}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
              >
                {tc("exportAllPdf")}
              </button>
              <button
                onClick={() => void downloadFile(`/inspections/summary-report?projectId=${params.id}&format=csv`, "inspection-register.csv")}
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
            {templates.length === 0 ? (
              <p className="text-sm text-navy-600">{t("noTemplates")}</p>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  {t("template")}
                  <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("scheduledDate")}
                  <input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                  {t("create")}
                </button>
              </>
            )}
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
              options: (["scheduled", "in_progress", "completed"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
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

        <DataTable<Inspection>
          columns={columns}
          rows={filteredInspections}
          onRowClick={(inspection) => router.push(`/${locale}/projects/${params.id}/inspections/${inspection.id}`)}
          emptyTitle={inspections && inspections.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
