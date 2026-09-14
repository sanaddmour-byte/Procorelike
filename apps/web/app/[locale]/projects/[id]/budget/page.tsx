"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface BudgetLineItem {
  id: string;
  costCodeId: string;
  originalAmount: string;
  modificationsAmount: string;
  approvedChangesAmount: string;
  forecastToComplete: string;
  projectedAmount: string;
  committedCosts: string;
  pendingCostChanges: string;
  currency: string;
}

function money(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BudgetPage() {
  const t = useTranslations("Budget");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [lineItems, setLineItems] = useState<BudgetLineItem[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [costCodeId, setCostCodeId] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [forecastToComplete, setForecastToComplete] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState("");
  const [editForecast, setEditForecast] = useState("");
  const [showModForm, setShowModForm] = useState(false);
  const [modFromId, setModFromId] = useState("");
  const [modToId, setModToId] = useState("");
  const [modAmount, setModAmount] = useState("");
  const [modReason, setModReason] = useState("");

  function load(): void {
    apiJson<BudgetLineItem[]>(`/budget-line-items?projectId=${params.id}`)
      .then(setLineItems)
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
    if (!costCodeId) return;
    setSaving(true);
    try {
      await apiJson("/budget-line-items", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          costCodeId,
          originalAmount: Number(originalAmount || 0),
          forecastToComplete: Number(forecastToComplete || 0),
        }),
      });
      setOriginalAmount("");
      setForecastToComplete("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(li: BudgetLineItem): void {
    setEditingId(li.id);
    setEditOriginal(li.originalAmount);
    setEditForecast(li.forecastToComplete);
  }

  async function handleSaveEdit(id: string): Promise<void> {
    setSaving(true);
    try {
      await apiJson(`/budget-line-items/${id}?projectId=${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ originalAmount: Number(editOriginal || 0), forecastToComplete: Number(editForecast || 0) }),
      });
      setEditingId(null);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateModification(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!modFromId || !modToId || modFromId === modToId) return;
    setSaving(true);
    try {
      await apiJson("/budget-line-items/modifications", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          fromLineItemId: modFromId,
          toLineItemId: modToId,
          amount: Number(modAmount || 0),
          reason: modReason || undefined,
        }),
      });
      setModFromId("");
      setModToId("");
      setModAmount("");
      setModReason("");
      setShowModForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowModForm((s) => !s)}
              className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800"
            >
              {t("newModification")}
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </button>
          </div>
        </div>

        {showModForm && (
          <form onSubmit={(e) => void handleCreateModification(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("modificationFrom")}
              <select required value={modFromId} onChange={(e) => setModFromId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="" disabled>
                  —
                </option>
                {lineItems?.map((li) => (
                  <option key={li.id} value={li.id}>
                    {costCodeLabel(li.costCodeId)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("modificationTo")}
              <select required value={modToId} onChange={(e) => setModToId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="" disabled>
                  —
                </option>
                {lineItems?.map((li) => (
                  <option key={li.id} value={li.id}>
                    {costCodeLabel(li.costCodeId)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("modificationAmount")}
              <input required type="number" step="0.01" min="0.01" value={modAmount} onChange={(e) => setModAmount(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("modificationReason")}
              <input value={modReason} onChange={(e) => setModReason(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={saving || modFromId === modToId} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

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
              {t("originalAmount")}
              <input type="number" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("forecastToComplete")}
              <input type="number" step="0.01" value={forecastToComplete} onChange={(e) => setForecastToComplete(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!lineItems && !error && <p>{tc("loading")}</p>}
        {lineItems && lineItems.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <div className="flex flex-col gap-3">
          {lineItems?.map((li) => {
            const revised = Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount);
            const variance = revised - Number(li.projectedAmount);
            const editing = editingId === li.id;
            return (
              <div key={li.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-navy-900">{costCodeLabel(li.costCodeId)}</span>
                  {!editing && (
                    <button onClick={() => startEdit(li)} className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800">
                      {t("edit")}
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-sm">
                      {t("originalAmount")}
                      <input type="number" step="0.01" value={editOriginal} onChange={(e) => setEditOriginal(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("forecastToComplete")}
                      <input type="number" step="0.01" value={editForecast} onChange={(e) => setEditForecast(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void handleSaveEdit(li.id)} disabled={saving} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white disabled:opacity-50">
                        {t("save")}
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm text-navy-800">
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-navy-600">{t("originalAmount")}</div>
                      <div className="font-medium">{money(li.originalAmount)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("modifications")}</div>
                      <div className="font-medium">{money(li.modificationsAmount)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("approvedChanges")}</div>
                      <div className="font-medium">{money(li.approvedChangesAmount)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("revisedBudget")}</div>
                      <div className="font-medium">{revised.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("pendingCostChanges")}</div>
                      <div className="font-medium">{money(li.pendingCostChanges)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("committedCosts")}</div>
                      <div className="font-medium">{money(li.committedCosts)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("forecastToComplete")}</div>
                      <div className="font-medium">{money(li.forecastToComplete)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("projectedAmount")}</div>
                      <div className="font-medium">{money(li.projectedAmount)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("variance")}</div>
                      <div className={`font-bold ${variance < 0 ? "text-maroon-700" : "text-navy-900"}`}>
                        {variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
