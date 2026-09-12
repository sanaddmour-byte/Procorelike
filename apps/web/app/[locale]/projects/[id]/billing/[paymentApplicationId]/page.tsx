"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface CommitmentLineItem {
  id: string;
  description: string;
  scheduleOfValuesAmount: string;
}
interface CommitmentDetail {
  id: string;
  lineItems: CommitmentLineItem[];
}

interface PaymentApplicationLineDetail {
  sovLineId: string;
  description: string;
  scheduleOfValuesAmount: number;
  pctCompletePrevious: string;
  pctCompleteThisPeriod: string;
  completedToDate: number;
  amountThisPeriod: number;
  retentionThisPeriod: number;
  netThisPeriod: number;
}

interface PaymentApplicationDetail {
  id: string;
  commitmentId: string | null;
  status: "draft" | "submitted" | "certified" | "paid";
  lines: PaymentApplicationLineDetail[];
  totalNetThisPeriod: number;
}

function statusKey(status: PaymentApplicationDetail["status"]): string {
  return { draft: "statusDraft", submitted: "statusSubmitted", certified: "statusCertified", paid: "statusPaid" }[status];
}

export default function PaymentApplicationDetailPage() {
  const t = useTranslations("Billing");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; paymentApplicationId: string }>();

  const [application, setApplication] = useState<PaymentApplicationDetail | null>(null);
  const [commitmentLineItems, setCommitmentLineItems] = useState<CommitmentLineItem[]>([]);
  const [pctInputs, setPctInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    const app = await apiJson<PaymentApplicationDetail>(`/payment-applications/${params.paymentApplicationId}`);
    setApplication(app);
    setPctInputs((current) => {
      const next = { ...current };
      for (const line of app.lines) {
        if (!(line.sovLineId in next)) next[line.sovLineId] = line.pctCompleteThisPeriod;
      }
      return next;
    });
    if (app.commitmentId) {
      const commitment = await apiJson<CommitmentDetail>(`/commitments/${app.commitmentId}`);
      setCommitmentLineItems(commitment.lineItems);
      setPctInputs((current) => {
        const next = { ...current };
        for (const li of commitment.lineItems) {
          if (!(li.id in next)) next[li.id] = "0";
        }
        return next;
      });
    }
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load().catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.paymentApplicationId]);

  async function handleSaveLines(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const lines = commitmentLineItems.map((li) => ({ sovLineId: li.id, pctCompleteThisPeriod: Number(pctInputs[li.id] || 0) }));
      await apiJson(`/payment-applications/${params.paymentApplicationId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(toStatus: string): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await apiJson(`/payment-applications/${params.paymentApplicationId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!application && !error) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p>{tc("loading")}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/billing`} className="mb-4 inline-block text-sm text-maroon-700 underline">
          {t("back")}
        </Link>
        {error && <p className="mb-4 rounded-lg border-3 border-maroon-700 bg-maroon-100 p-2 text-sm text-maroon-800">{error}</p>}
        {application && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
              <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-1 text-sm font-semibold text-navy-800">{t(statusKey(application.status))}</span>
            </div>

            {!application.commitmentId && commitmentLineItems.length === 0 ? (
              <p className="text-navy-600">{t("primeApplication")}</p>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-bold text-navy-900">{t("lines")}</h2>
                <div className="mb-4 flex flex-col gap-2">
                  {commitmentLineItems.map((li) => {
                    const detail = application.lines.find((l) => l.sovLineId === li.id);
                    const editable = application.status === "draft";
                    return (
                      <div key={li.id} className="rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium">{li.description}</span>
                          <span className="text-sm text-navy-600">{Number(li.scheduleOfValuesAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex flex-wrap items-end gap-3 text-sm">
                          <div>
                            <div className="text-navy-600">{t("pctPrevious")}</div>
                            <div className="font-medium">{detail ? Number(detail.pctCompletePrevious) : 0}%</div>
                          </div>
                          <label className="flex flex-col gap-1">
                            {t("pctThisPeriod")}
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              disabled={!editable}
                              value={pctInputs[li.id] ?? "0"}
                              onChange={(e) => setPctInputs((s) => ({ ...s, [li.id]: e.target.value }))}
                              className="w-24 rounded-lg border-3 border-ink px-2 py-1"
                            />
                          </label>
                          {detail && (
                            <>
                              <div>
                                <div className="text-navy-600">{t("completedToDate")}</div>
                                <div className="font-medium">{detail.completedToDate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className="text-navy-600">{t("amountThisPeriod")}</div>
                                <div className="font-medium">{detail.amountThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className="text-navy-600">{t("retentionThisPeriod")}</div>
                                <div className="font-medium">{detail.retentionThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className="text-navy-600">{t("netThisPeriod")}</div>
                                <div className="font-bold text-navy-900">{detail.netThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {application.status === "draft" && (
                  <button onClick={() => void handleSaveLines()} disabled={saving} className="mb-6 rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                    {t("saveLines")}
                  </button>
                )}

                {application.lines.length > 0 && (
                  <div className="mb-6 rounded-xl border-3 border-ink bg-orange-50 shadow-brutal-sm p-4">
                    <div className="text-sm text-navy-700">{t("totalNetThisPeriod")}</div>
                    <div className="text-2xl font-extrabold text-navy-900">{application.totalNetThisPeriod.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              {application.status === "draft" && (
                <button onClick={() => void handleTransition("submitted")} disabled={saving} className="rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                  {t("submitApplication")}
                </button>
              )}
              {application.status === "submitted" && (
                <button onClick={() => void handleTransition("certified")} disabled={saving} className="rounded-lg border-3 border-ink bg-orange-500 brutal-interactive px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">
                  {t("certify")}
                </button>
              )}
              {application.status === "certified" && (
                <button onClick={() => void handleTransition("paid")} disabled={saving} className="rounded-lg border-3 border-ink bg-orange-500 brutal-interactive px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">
                  {t("markPaid")}
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
