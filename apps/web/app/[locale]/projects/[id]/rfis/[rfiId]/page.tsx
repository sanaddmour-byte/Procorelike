"use client";

import { AttachmentList } from "@/components/AttachmentList";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { RecordLinks, type RecordLinkTargetConfig } from "@/components/RecordLinks";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { RFI_STATUS_TRANSITIONS, type RfiStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Drawing {
  id: string;
  sheetNumber: string;
  title: string;
}

interface SpecSection {
  id: string;
  csiCode: string;
  title: string;
}

interface RfiResponse {
  id: string;
  responseText: string;
  isOfficial: boolean;
  respondedBy: string;
  createdAt: string;
}

type RfiImpact = "yes" | "no" | "na";

interface RfiDetail {
  id: string;
  projectId: string;
  number: string;
  subject: string;
  question: string;
  status: RfiStatus;
  ballInCourtUserId: string | null;
  dueDate: string | null;
  costImpact: RfiImpact;
  scheduleImpact: RfiImpact;
  isPrivate: boolean;
  reference: string | null;
  isOverdue: boolean;
  responses: RfiResponse[];
  distribution: { id: string; userId: string | null; companyId: string | null }[];
}

interface Member {
  userId: string;
  name: string;
}

interface LinkedComment {
  id: string;
  recordType: "rfi" | "submittal" | "change_order" | "correspondence" | "inspection";
  recordId: string;
  commentText: string;
  pageNumber: number;
}

function recordHref(locale: string, projectId: string, recordType: LinkedComment["recordType"], recordId: string): string {
  const segment = { rfi: "rfis", submittal: "submittals", change_order: "change-orders", correspondence: "correspondence", inspection: "inspections" }[
    recordType
  ];
  return `/${locale}/projects/${projectId}/${segment}/${recordId}`;
}

function statusLabel(status: RfiStatus, t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), answered: t("statusAnswered"), closed: t("statusClosed") }[status];
}

function impactOptionLabel(impact: RfiImpact, t: (key: string) => string): string {
  return { na: t("impactNa"), yes: t("impactYes"), no: t("impactNo") }[impact];
}

function transitionLabel(from: RfiStatus, to: RfiStatus, t: (key: string) => string): string {
  if (to === "closed") return t("close");
  if (to === "open" && from === "answered") return t("reopen");
  if (to === "open") return t("submit");
  return statusLabel(to, t);
}

export default function RfiDetailScreen() {
  const t = useTranslations("Rfis");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; rfiId: string }>();

  const [rfi, setRfi] = useState<RfiDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [specSections, setSpecSections] = useState<SpecSection[]>([]);
  const [linkedComments, setLinkedComments] = useState<LinkedComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const pdfViewer = usePdfViewer();

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<RfiDetail>(`/rfis/${params.rfiId}`);
      setRfi(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.rfiId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
    apiJson<Drawing[]>(`/drawings?projectId=${params.id}`).then(setDrawings).catch(() => undefined);
    apiJson<SpecSection[]>(`/submittals/spec-sections?projectId=${params.id}`).then(setSpecSections).catch(() => undefined);
    apiJson<LinkedComment[]>(`/pdf-comments/linked-to-rfi?projectId=${params.id}&rfiId=${params.rfiId}`)
      .then(setLinkedComments)
      .catch(() => undefined);
  }, [router, locale, load, params.id, params.rfiId]);

  const recordLinkTargets: RecordLinkTargetConfig[] = [
    {
      targetType: "drawing",
      label: t("linkedDrawings"),
      addLabel: t("addDrawing"),
      emptyLabel: t("noDrawingsLinked"),
      selectPlaceholder: t("selectDrawing"),
      options: drawings.map((d) => ({ id: d.id, label: `${d.sheetNumber} — ${d.title}` })),
      hrefFor: (id) => `/${locale}/projects/${params.id}/drawings/${id}`,
    },
    {
      targetType: "specification_section",
      label: t("linkedSpecSection"),
      addLabel: t("addSpecSection"),
      emptyLabel: t("noSpecSectionLinked"),
      selectPlaceholder: t("selectSpecSection"),
      options: specSections.map((s) => ({ id: s.id, label: `${s.csiCode} — ${s.title}` })),
      hrefFor: (id) => `/${locale}/projects/${params.id}/specifications/${id}`,
    },
  ];

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  async function handleAddResponse(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmittingResponse(true);
    try {
      await apiJson(`/rfis/${params.rfiId}/responses`, {
        method: "POST",
        body: JSON.stringify({ responseText, isOfficial }),
      });
      setResponseText("");
      setIsOfficial(false);
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSubmittingResponse(false);
    }
  }

  async function handleTransition(toStatus: RfiStatus): Promise<void> {
    setTransitioning(true);
    try {
      await apiJson(`/rfis/${params.rfiId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  async function handleReassign(userId: string): Promise<void> {
    setReassigning(true);
    try {
      await apiJson(`/rfis/${params.rfiId}`, { method: "PATCH", body: JSON.stringify({ ballInCourtUserId: userId || undefined }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setReassigning(false);
    }
  }

  async function handleUpdateImpact(field: "costImpact" | "scheduleImpact", value: RfiImpact): Promise<void> {
    try {
      await apiJson(`/rfis/${params.rfiId}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  if (!rfi) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={`/${locale}/projects/${params.id}/rfis`} className="inline-block text-sm text-navy-600 underline">
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={() =>
              void pdfViewer.openPdf(`/rfis/${params.rfiId}/report`, `${rfi.number} — ${rfi.subject}`, `${rfi.number}.pdf`, {
                projectId: params.id,
                recordType: "rfi",
                recordId: params.rfiId,
              })
            }
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-sm font-semibold text-white"
          >
            {tc("exportPdf")}
          </button>
        </div>

        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {rfi.number} — {rfi.subject}
          </h1>
          {rfi.isPrivate && <span className="rounded bg-navy-800 px-2 py-0.5 text-xs text-white">{t("private")}</span>}
          {rfi.isOverdue && <span className="rounded bg-maroon-100 px-2 py-0.5 text-xs text-maroon-800">{t("overdue")}</span>}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-navy-600">
          <span>{statusLabel(rfi.status, t)}</span>
          <span>·</span>
          <span>{t("ballInCourt")}:</span>
          <select
            value={rfi.ballInCourtUserId ?? ""}
            disabled={reassigning}
            onChange={(e) => void handleReassign(e.target.value)}
            className="rounded-lg border-3 border-ink px-2 py-1 text-sm text-navy-800 disabled:opacity-50"
          >
            <option value="" disabled>
              {t("unassigned")}
            </option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          {rfi.dueDate && (
            <>
              <span>·</span>
              <span>
                {t("dueDate")}: {rfi.dueDate.slice(0, 10)}
              </span>
            </>
          )}
          {rfi.reference && (
            <>
              <span>·</span>
              <span>
                {t("reference")}: {rfi.reference}
              </span>
            </>
          )}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-navy-600">
          <span className="flex items-center gap-1.5">
            {t("costImpact")}:
            <select
              value={rfi.costImpact}
              onChange={(e) => void handleUpdateImpact("costImpact", e.target.value as RfiImpact)}
              className="rounded-lg border-3 border-ink px-2 py-1 text-sm text-navy-800"
            >
              <option value="na">{impactOptionLabel("na", t)}</option>
              <option value="yes">{impactOptionLabel("yes", t)}</option>
              <option value="no">{impactOptionLabel("no", t)}</option>
            </select>
          </span>
          <span className="flex items-center gap-1.5">
            {t("scheduleImpact")}:
            <select
              value={rfi.scheduleImpact}
              onChange={(e) => void handleUpdateImpact("scheduleImpact", e.target.value as RfiImpact)}
              className="rounded-lg border-3 border-ink px-2 py-1 text-sm text-navy-800"
            >
              <option value="na">{impactOptionLabel("na", t)}</option>
              <option value="yes">{impactOptionLabel("yes", t)}</option>
              <option value="no">{impactOptionLabel("no", t)}</option>
            </select>
          </span>
        </div>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <p className="whitespace-pre-wrap">{rfi.question}</p>
        </div>

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <AttachmentList
            projectId={params.id}
            ownerType="rfi"
            ownerId={params.rfiId}
            heading={t("files")}
            emptyLabel={t("noFiles")}
            uploadLabel={t("uploadFile")}
            uploadingLabel={t("uploading")}
            errorLabel={tc("errorGeneric")}
          />
        </div>

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <RecordLinks projectId={params.id} recordType="rfi" recordId={params.rfiId} targets={recordLinkTargets} removeLabel={t("removeLink")} />
        </div>

        <div className="mb-6">
          <h3 className="mb-1.5 text-sm font-semibold text-navy-800">{t("distribution")}</h3>
          {rfi.distribution.filter((d) => d.userId).length === 0 ? (
            <p className="text-sm text-navy-600">{t("noDistribution")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {rfi.distribution
                .filter((d) => d.userId)
                .map((d) => (
                  <li key={d.id} className="rounded-lg border-3 border-ink bg-white px-2.5 py-1.5 text-sm text-navy-800">
                    {memberName(d.userId)}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {linkedComments.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-1.5 text-sm font-semibold text-navy-800">{t("linkedComments")}</h3>
            <ul className="flex flex-col gap-2">
              {linkedComments.map((c) => (
                <li key={c.id} className="rounded-lg border-3 border-ink bg-white p-2.5 text-sm">
                  <p className="whitespace-pre-wrap">{c.commentText}</p>
                  <Link href={recordHref(locale, params.id, c.recordType, c.recordId)} className="mt-1 inline-block text-xs text-navy-600 underline">
                    {t("viewInContext")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {RFI_STATUS_TRANSITIONS[rfi.status].length > 0 && (
          <div className="mb-6 flex gap-2">
            {RFI_STATUS_TRANSITIONS[rfi.status].map((next) => (
              <button
                key={next}
                onClick={() => void handleTransition(next)}
                disabled={transitioning}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {transitionLabel(rfi.status, next, t)}
              </button>
            ))}
          </div>
        )}

        <h2 className="mb-2 text-lg font-medium">{t("responses")}</h2>
        {rfi.responses.length === 0 && <p className="mb-4 text-navy-600">{t("noResponses")}</p>}
        <ul className="mb-4 flex flex-col gap-2">
          {rfi.responses.map((r) => (
            <li key={r.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-navy-600">{memberName(r.respondedBy)}</span>
                {r.isOfficial && <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-white">{t("official")}</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm">{r.responseText}</p>
            </li>
          ))}
        </ul>

        {rfi.status !== "closed" && (
          <form onSubmit={(e) => void handleAddResponse(e)} className="flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("responseText")}
              <textarea
                required
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
              {t("markOfficial")}
            </label>
            <button
              type="submit"
              disabled={submittingResponse}
              className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("addResponse")}
            </button>
          </form>
        )}
      </main>
      <PdfViewerModal
        open={pdfViewer.open}
        data={pdfViewer.data}
        error={pdfViewer.error}
        title={pdfViewer.title}
        fileName={pdfViewer.fileName}
        onClose={pdfViewer.close}
        commentContext={pdfViewer.commentContext}
      />
    </>
  );
}
