"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { SignatureBadge } from "@/components/SignatureBadge";
import { SignaturePad } from "@/components/SignaturePad";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import {
  CORRESPONDENCE_STATUS_TRANSITIONS,
  type CorrespondenceDirection,
  type CorrespondenceStatus,
  type CorrespondenceType,
  type EsignatureVerification,
} from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface CorrespondenceDetail {
  id: string;
  projectId: string;
  correspondenceNumber: string;
  direction: CorrespondenceDirection;
  type: CorrespondenceType;
  subject: string;
  body: string;
  fromCompanyId: string;
  toCompanyId: string;
  status: CorrespondenceStatus;
  sentDate: string | null;
  responseRequiredBy: string | null;
  senderSignatureName: string | null;
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

export default function CorrespondenceDetailScreen() {
  const t = useTranslations("Correspondence");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; correspondenceId: string }>();

  const [item, setItem] = useState<CorrespondenceDetail | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signature, setSignature] = useState<EsignatureVerification | null>(null);
  const pdfViewer = usePdfViewer();

  const load = useCallback(async () => {
    try {
      const rows = await apiJson<CorrespondenceDetail[]>(`/correspondence?projectId=${params.id}`);
      const detail = rows.find((r) => r.id === params.correspondenceId) ?? null;
      setItem(detail);
      if (detail && detail.status !== "draft") {
        apiJson<EsignatureVerification>(`/correspondence/${params.correspondenceId}/signature`).then(setSignature).catch(() => undefined);
      }
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.id, params.correspondenceId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleTransition(toStatus: CorrespondenceStatus): Promise<void> {
    if (toStatus === "sent" && !signatureName.trim()) {
      setError(t("signatureRequired"));
      return;
    }
    setTransitioning(true);
    setError(null);
    try {
      await apiJson(`/correspondence/${params.correspondenceId}/transition`, {
        method: "POST",
        body: JSON.stringify(
          toStatus === "sent"
            ? { toStatus, senderSignatureName: signatureName.trim(), signatureImageBase64: signatureImage ?? undefined }
            : { toStatus },
        ),
      });
      setSignatureName("");
      setSignatureImage(null);
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  if (!item) {
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
          <Link href={`/${locale}/projects/${params.id}/correspondence`} className="inline-block text-sm text-navy-600 underline">
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={() =>
              void pdfViewer.openPdf(
                `/correspondence/${params.correspondenceId}/report`,
                `${item.correspondenceNumber} — ${item.subject}`,
                `${item.correspondenceNumber}.pdf`,
                { projectId: params.id, recordType: "correspondence", recordId: params.correspondenceId },
              )
            }
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-sm font-semibold text-white"
          >
            {tc("exportPdf")}
          </button>
        </div>

        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {item.correspondenceNumber} — {item.subject}
          </h1>
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(item.status, t)}</span>
        </div>
        <p className="mb-4 text-sm text-navy-600">
          {typeLabel(item.type, t)} · {companyName(item.fromCompanyId)} → {companyName(item.toCompanyId)}
          {item.responseRequiredBy && ` · ${t("responseRequiredBy")}: ${item.responseRequiredBy.slice(0, 10)}`}
          {item.senderSignatureName && ` · ${t("signedBy")}: ${item.senderSignatureName}`}
        </p>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <p className="whitespace-pre-wrap">{item.body}</p>
        </div>

        {signature && (
          <div className="mb-6">
            <SignatureBadge
              verification={signature}
              verifiedLabel={t("signatureVerified")}
              unverifiedLabel={t("signatureUnverified")}
              signedByLabel={t("signedBy")}
              hashLabel={t("signatureHash")}
            />
          </div>
        )}

        {CORRESPONDENCE_STATUS_TRANSITIONS[item.status].includes("sent") && (
          <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="mb-2 flex flex-col gap-1 text-sm">
              {t("signatureName")}
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder={t("signaturePlaceholder")}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <div className="mb-2 flex flex-col gap-1 text-sm">
              <span>{t("signatureDraw")}</span>
              <SignaturePad onChange={setSignatureImage} clearLabel={t("signatureClear")} />
            </div>
            <button
              onClick={() => void handleTransition("sent")}
              disabled={transitioning || !signatureName.trim()}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("signAndSend")}
            </button>
          </div>
        )}

        {CORRESPONDENCE_STATUS_TRANSITIONS[item.status].filter((s) => s !== "sent").length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm text-navy-600">{t("moveTo")}</p>
            <div className="flex flex-wrap gap-2">
              {CORRESPONDENCE_STATUS_TRANSITIONS[item.status]
                .filter((next) => next !== "sent")
                .map((next) => (
                <button
                  key={next}
                  onClick={() => void handleTransition(next)}
                  disabled={transitioning}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {statusLabel(next, t)}
                </button>
              ))}
            </div>
          </div>
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
