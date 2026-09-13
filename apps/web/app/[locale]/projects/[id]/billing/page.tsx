"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Commitment {
  id: string;
  number: string;
  title: string;
}

interface PaymentApplication {
  id: string;
  commitmentId: string | null;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "submitted" | "certified" | "paid";
}

function statusKey(status: PaymentApplication["status"]): string {
  return { draft: "statusDraft", submitted: "statusSubmitted", certified: "statusCertified", paid: "statusPaid" }[status];
}

export default function BillingPage() {
  const t = useTranslations("Billing");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [applications, setApplications] = useState<PaymentApplication[] | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [commitmentId, setCommitmentId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [retentionPct, setRetentionPct] = useState("10");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<PaymentApplication[]>(`/payment-applications?projectId=${params.id}`)
      .then(setApplications)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<Commitment[]>(`/commitments?projectId=${params.id}`)
      .then(setCommitments)
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function commitmentLabel(id: string | null): string {
    if (!id) return t("primeApplication");
    const c = commitments.find((cm) => cm.id === id);
    return c ? `${c.number} — ${c.title}` : id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!periodStart || !periodEnd) return;
    setCreating(true);
    try {
      await apiJson("/payment-applications", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          commitmentId: commitmentId || undefined,
          periodStart,
          periodEnd,
          retentionPct: Number(retentionPct || 0),
        }),
      });
      setPeriodStart("");
      setPeriodEnd("");
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
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("commitment")}
              <select value={commitmentId} onChange={(e) => setCommitmentId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="">—</option>
                {commitments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} — {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("periodStart")}
              <input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("periodEnd")}
              <input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("retentionPct")}
              <input type="number" step="0.01" min="0" max="100" value={retentionPct} onChange={(e) => setRetentionPct(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!applications && !error && <p>{tc("loading")}</p>}
        {applications && applications.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {applications?.map((app) => (
            <li key={app.id}>
              <Link href={`/${locale}/projects/${params.id}/billing/${app.id}`} className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-navy-900">{commitmentLabel(app.commitmentId)}</span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{t(statusKey(app.status))}</span>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {app.periodStart.slice(0, 10)} — {app.periodEnd.slice(0, 10)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
