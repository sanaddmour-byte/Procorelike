"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import type { CorrespondenceDirection, CorrespondenceStatus, CorrespondenceType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

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

export default function CorrespondencePage() {
  const t = useTranslations("Correspondence");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<CorrespondenceItem[] | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void pdfViewer.openPdf(`/correspondence/summary-report?projectId=${params.id}`, t("title"), "correspondence-register.pdf")}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
            >
              {tc("exportAllPdf")}
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </button>
          </div>
        </div>

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
        {!items && !error && <p>{tc("loading")}</p>}
        {items && items.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {items?.map((item) => (
            <li key={item.id}>
              <Link
                href={`/${locale}/projects/${params.id}/correspondence/${item.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.correspondenceNumber} — {item.subject}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {statusLabel(item.status, t)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {typeLabel(item.type, t)} · {companyName(item.fromCompanyId)} → {companyName(item.toCompanyId)}
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
