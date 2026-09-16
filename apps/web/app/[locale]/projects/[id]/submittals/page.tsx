"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { PersonnelPicker } from "@/components/PersonnelPicker";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

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

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void pdfViewer.openPdf(`/submittals/summary-report?projectId=${params.id}`, t("title"), "submittal-register.pdf")}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
            >
              {tc("exportAllPdf")}
            </button>
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
              {t("newButton")}
            </button>
          </div>
        </div>

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
        {!submittals && !error && <p>{tc("loading")}</p>}
        {submittals && submittals.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {submittals?.map((s) => (
            <li key={s.id}>
              <Link
                href={`/${locale}/projects/${params.id}/submittals/${s.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {s.number} — {s.title}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    {s.isPrivate && <span className="rounded bg-navy-800 px-2 py-0.5 text-xs text-white">{t("private")}</span>}
                    {s.isOverdue && <span className="rounded bg-maroon-100 px-2 py-0.5 text-xs text-maroon-800">{t("overdue")}</span>}
                    <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(s.status, t)}</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {t("ballInCourt")}: {memberName(s.ballInCourtUserId)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
