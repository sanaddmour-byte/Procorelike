"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { PersonnelPicker } from "@/components/PersonnelPicker";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface SpecSection {
  id: string;
  csiCode: string;
  title: string;
}

type SubmittalType =
  | "shop_drawings"
  | "product_data"
  | "samples"
  | "design_data"
  | "test_reports"
  | "certificates"
  | "manufacturer_instructions"
  | "manufacturer_field_reports"
  | "operation_maintenance_data"
  | "other";

const SUBMITTAL_TYPES: SubmittalType[] = [
  "shop_drawings",
  "product_data",
  "samples",
  "design_data",
  "test_reports",
  "certificates",
  "manufacturer_instructions",
  "manufacturer_field_reports",
  "operation_maintenance_data",
  "other",
];

interface Submittal {
  id: string;
  number: string;
  title: string;
  status: "draft" | "in_review" | "approved" | "approved_as_noted" | "revise_resubmit" | "rejected" | "closed";
  ballInCourtUserId: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  isPrivate: boolean;
}

interface Member {
  userId: string;
  name: string;
  companyId: string;
  companyName: string;
}

function submittalTypeLabel(type: SubmittalType, t: (key: string) => string): string {
  return {
    shop_drawings: t("typeShopDrawings"),
    product_data: t("typeProductData"),
    samples: t("typeSamples"),
    design_data: t("typeDesignData"),
    test_reports: t("typeTestReports"),
    certificates: t("typeCertificates"),
    manufacturer_instructions: t("typeManufacturerInstructions"),
    manufacturer_field_reports: t("typeManufacturerFieldReports"),
    operation_maintenance_data: t("typeOperationMaintenanceData"),
    other: t("typeOther"),
  }[type];
}

function statusLabel(status: Submittal["status"], t: (key: string) => string): string {
  return {
    draft: t("statusDraft"),
    in_review: t("statusInReview"),
    approved: t("statusApproved"),
    approved_as_noted: t("statusApprovedAsNoted"),
    revise_resubmit: t("statusReviseResubmit"),
    rejected: t("statusRejected"),
    closed: t("statusClosed"),
  }[status];
}

const STATUS_TONE: Record<Submittal["status"], StatusTone> = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  approved_as_noted: "success",
  revise_resubmit: "danger",
  rejected: "danger",
  closed: "neutral",
};

export default function SubmittalsPage() {
  const t = useTranslations("Submittals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [submittals, setSubmittals] = useState<Submittal[] | null>(null);
  const [specSections, setSpecSections] = useState<SpecSection[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [specSectionId, setSpecSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [submittalType, setSubmittalType] = useState<SubmittalType>("shop_drawings");
  const [responsibleContractorCompanyId, setResponsibleContractorCompanyId] = useState("");
  const [location, setLocation] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [ballInCourtUserId, setBallInCourtUserId] = useState("");
  const [distributionUserIds, setDistributionUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const pdfViewer = usePdfViewer();

  function load(): void {
    apiJson<Submittal[]>(`/submittals?projectId=${params.id}`)
      .then(setSubmittals)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<SpecSection[]>(`/submittals/spec-sections?projectId=${params.id}`)
      .then((sections) => {
        setSpecSections(sections);
        setSpecSectionId((current) => current || sections[0]?.id || "");
      })
      .catch(() => undefined);
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  const companies = members.reduce<{ id: string; name: string }[]>((acc, m) => {
    if (!acc.some((c) => c.id === m.companyId)) acc.push({ id: m.companyId, name: m.companyName });
    return acc;
  }, []);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!specSectionId) return;
    setCreating(true);
    try {
      await apiJson("/submittals", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          specSectionId,
          title,
          submittalType,
          responsibleContractorCompanyId: responsibleContractorCompanyId || undefined,
          location: location || undefined,
          receivedFrom: receivedFrom || undefined,
          dueDate: dueDate || undefined,
          isPrivate,
          ballInCourtUserId: ballInCourtUserId || undefined,
          distributionUserIds,
        }),
      });
      setTitle("");
      setSubmittalType("shop_drawings");
      setResponsibleContractorCompanyId("");
      setLocation("");
      setReceivedFrom("");
      setDueDate("");
      setIsPrivate(false);
      setBallInCourtUserId("");
      setDistributionUserIds([]);
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const filteredSubmittals = useMemo(() => {
    if (!submittals) return null;
    const q = search.trim().toLowerCase();
    return submittals.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (q && !s.number.toLowerCase().includes(q) && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [submittals, search, statusFilter]);

  const columns: DataTableColumn<Submittal>[] = [
    { key: "number", header: t("number"), render: (s) => s.number, sortValue: (s) => s.number, width: "110px" },
    { key: "title", header: t("submittalTitle"), render: (s) => s.title, sortValue: (s) => s.title },
    {
      key: "status",
      header: t("status"),
      render: (s) => <StatusBadge tone={STATUS_TONE[s.status]} label={statusLabel(s.status, t)} />,
      sortValue: (s) => s.status,
      width: "150px",
    },
    { key: "ballInCourt", header: t("ballInCourt"), render: (s) => memberName(s.ballInCourtUserId), width: "160px" },
    {
      key: "flags",
      header: t("flags"),
      render: (s) => (
        <div className="flex gap-1">
          {s.isPrivate && <StatusBadge tone="neutral" label={t("private")} />}
          {s.isOverdue && <StatusBadge tone="danger" label={t("overdue")} />}
        </div>
      ),
      width: "160px",
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <button
                onClick={() => void pdfViewer.openPdf(`/submittals/summary-report?projectId=${params.id}`, t("title"), "submittal-register.pdf")}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
              >
                {tc("exportAllPdf")}
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
              {t("specSection")}
              <select
                required
                value={specSectionId}
                onChange={(e) => setSpecSectionId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                {specSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.csiCode} — {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("submittalTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("submittalType")}
              <select value={submittalType} onChange={(e) => setSubmittalType(e.target.value as SubmittalType)} className="rounded-lg border-3 border-ink px-3 py-2">
                {SUBMITTAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {submittalTypeLabel(type, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("responsibleContractor")}
              <select
                value={responsibleContractorCompanyId}
                onChange={(e) => setResponsibleContractorCompanyId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("location")}
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("receivedFrom")}
              <input value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              {t("private")}
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
            <PersonnelPicker label={t("distribution")} members={members} selectedUserIds={distributionUserIds} onChange={setDistributionUserIds} />
            <button type="submit" disabled={creating || !specSectionId} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
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
              options: (["draft", "in_review", "approved", "approved_as_noted", "revise_resubmit", "rejected", "closed"] as const).map((s) => ({
                value: s,
                label: statusLabel(s, t),
              })),
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

        <DataTable<Submittal>
          columns={columns}
          rows={filteredSubmittals}
          onRowClick={(s) => router.push(`/${locale}/projects/${params.id}/submittals/${s.id}`)}
          emptyTitle={submittals && submittals.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
