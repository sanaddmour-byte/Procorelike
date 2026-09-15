"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { DirectCostStatus, DirectCostType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface DirectCost {
  id: string;
  costCodeId: string;
  type: DirectCostType;
  description: string;
  amount: string;
  incurredDate: string;
  status: DirectCostStatus;
}

function money(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DirectCostsPage() {
  const t = useTranslations("DirectCosts");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [directCosts, setDirectCosts] = useState<DirectCost[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [costCodeId, setCostCodeId] = useState("");
  const [type, setType] = useState<DirectCostType>("invoice");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredDate, setIncurredDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  function load(): void {
    apiJson<DirectCost[]>(`/direct-costs?projectId=${params.id}`)
      .then(setDirectCosts)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`)
      .then((codes) => {
        setCostCodes(codes);
        setCostCodeId((current) => current || codes[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function costCodeLabel(id: string): string {
    const cc = costCodes.find((c) => c.id === id);
    return cc ? `${cc.code} — ${cc.description}` : id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!costCodeId || !description.trim() || !incurredDate) return;
    setSaving(true);
    try {
      await apiJson("/direct-costs", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          costCodeId,
          type,
          description,
          amount: Number(amount || 0),
          incurredDate,
        }),
      });
      setDescription("");
      setAmount("");
      setIncurredDate("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(id: string, toStatus: "approved" | "rejected"): Promise<void> {
    setTransitioningId(id);
    try {
      await apiJson(`/direct-costs/${id}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioningId(null);
    }
  }

  function statusLabel(status: DirectCostStatus): string {
    return { pending: t("statusPending"), approved: t("statusApproved"), rejected: t("statusRejected") }[status];
  }

  function typeLabel(value: DirectCostType): string {
    return { invoice: t("typeInvoice"), expense: t("typeExpense"), payroll: t("typePayroll"), other: t("typeOther") }[value];
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("costCode")}
              <select required value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("type")}
              <select value={type} onChange={(e) => setType(e.target.value as DirectCostType)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="invoice">{t("typeInvoice")}</option>
                <option value="expense">{t("typeExpense")}</option>
                <option value="payroll">{t("typePayroll")}</option>
                <option value="other">{t("typeOther")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <input required value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("amount")}
              <input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("incurredDate")}
              <input required type="date" value={incurredDate} onChange={(e) => setIncurredDate(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!directCosts && !error && <p>{tc("loading")}</p>}
        {directCosts && directCosts.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <div className="flex flex-col gap-3">
          {directCosts?.map((dc) => (
            <div key={dc.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-bold text-navy-900">{costCodeLabel(dc.costCodeId)}</span>
                <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(dc.status)}</span>
              </div>
              <p className="text-sm text-navy-800">{dc.description}</p>
              <p className="mt-1 text-xs text-navy-600">
                {typeLabel(dc.type)} · {money(dc.amount)} · {dc.incurredDate.slice(0, 10)}
              </p>
              {dc.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void handleTransition(dc.id, "approved")}
                    disabled={transitioningId === dc.id}
                    className="rounded border-2 border-ink bg-navy-700 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t("approve")}
                  </button>
                  <button
                    onClick={() => void handleTransition(dc.id, "rejected")}
                    disabled={transitioningId === dc.id}
                    className="rounded border-2 border-ink px-2 py-0.5 text-xs font-semibold text-navy-800 disabled:opacity-50"
                  >
                    {t("reject")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
