"use client";

import { Header } from "@/components/Header";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ApprovalEntry {
  userId: string;
  companyId: string;
  role: string;
  approvedAt: string;
}

interface ChangeOrder {
  id: string;
  number: string;
  targetType: "prime" | "commitment";
  targetId: string;
  costImpact: string;
  timeImpactDays: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "void";
  approvalChain: ApprovalEntry[];
}

function statusKey(status: ChangeOrder["status"]): string {
  return { draft: "statusDraft", pending_approval: "statusPendingApproval", approved: "statusApproved", rejected: "statusRejected", void: "statusVoid" }[status];
}

export default function ChangeOrderDetailPage() {
  const t = useTranslations("ChangeManagement");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; changeOrderId: string }>();

  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pdfViewer = usePdfViewer();

  function load(): void {
    apiJson<ChangeOrder>(`/change-orders/${params.changeOrderId}`)
      .then((c) => {
        setCo(c);
        setError(null);
      })
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.changeOrderId]);

  async function handleAction(action: "submit" | "approve" | "reject"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/change-orders/${params.changeOrderId}/${action}`, { method: "POST" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (!co && !error) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p>{tc("loading")}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/${locale}/projects/${params.id}/change-orders`} className="inline-block text-sm text-maroon-700 underline">
            {t("back")}
          </Link>
          <button
            type="button"
            onClick={() => void pdfViewer.openPdf(`/change-orders/${params.changeOrderId}/report`, co?.number ?? "", `${co?.number ?? "change-order"}.pdf`)}
            disabled={!co}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {tc("exportPdf")}
          </button>
        </div>
        {error && <p className="mb-4 rounded-lg border-3 border-maroon-700 bg-gradient-to-b from-maroon-50 to-maroon-100 p-2 text-sm text-maroon-800">{error}</p>}
        {co && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{co.number}</h1>
              <span
                className={`whitespace-nowrap rounded px-2 py-1 text-sm font-semibold ${
                  co.status === "approved" ? "bg-orange-100 text-navy-800" : co.status === "rejected" || co.status === "void" ? "bg-maroon-100 text-maroon-800" : "bg-navy-100 text-navy-800"
                }`}
              >
                {t(statusKey(co.status))}
              </span>
            </div>

            <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-navy-600">{t("targetType")}</div>
                  <div className="font-medium">{co.targetType === "prime" ? t("targetTypePrime") : t("targetTypeCommitment")}</div>
                </div>
                <div>
                  <div className="text-navy-600">{t("costImpact")}</div>
                  <div className="font-bold text-navy-900">{Number(co.costImpact).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-navy-600">{t("timeImpactDays")}</div>
                  <div className="font-medium">{co.timeImpactDays}</div>
                </div>
              </div>
            </div>

            <h2 className="mb-2 text-lg font-bold text-navy-900">{t("approvalChain")}</h2>
            {co.approvalChain.length === 0 ? (
              <p className="mb-4 text-navy-600">{t("noApprovalsYet")}</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-2">
                {co.approvalChain.map((a, i) => (
                  <li key={i} className="rounded-lg border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3 text-sm">
                    {a.role} — {new Date(a.approvedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              {co.status === "draft" && (
                <button onClick={() => void handleAction("submit")} disabled={busy} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                  {t("submit")}
                </button>
              )}
              {co.status === "pending_approval" && (
                <>
                  <button onClick={() => void handleAction("approve")} disabled={busy} className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">
                    {t("approve")}
                  </button>
                  <button onClick={() => void handleAction("reject")} disabled={busy} className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-maroon-700 disabled:opacity-50">
                    {t("reject")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
