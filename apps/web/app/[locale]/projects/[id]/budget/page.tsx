"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiFetch, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { formatMoney } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";

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
  directCosts: string;
  currency: string;
}

export default function BudgetPage() {
  const t = useTranslations("Budget");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const money = (value: string, currency: string): string => formatMoney(value, currency, locale);

  const [lineItems, setLineItems] = useState<BudgetLineItem[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [costCodeId, setCostCodeId] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [forecastToComplete, setForecastToComplete] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetLineItem | null>(null);
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
    setEditingItem(li);
    setEditOriginal(li.originalAmount);
    setEditForecast(li.forecastToComplete);
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingItem) return;
    setSaving(true);
    try {
      await apiJson(`/budget-line-items/${editingItem.id}?projectId=${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ originalAmount: Number(editOriginal || 0), forecastToComplete: Number(editForecast || 0) }),
      });
      setEditingItem(null);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleExportCsv(): Promise<void> {
    const res = await apiFetch(`/admin/projects/${params.id}/exports/budget.csv`);
    if (!res.ok) {
      setError(tc("errorGeneric"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-${params.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const columns: DataTableColumn<BudgetLineItem>[] = [
    { key: "costCode", header: t("costCode"), render: (li) => costCodeLabel(li.costCodeId), sortValue: (li) => costCodeLabel(li.costCodeId) },
    {
      key: "revised",
      header: t("revisedBudget"),
      align: "end",
      width: "130px",
      render: (li) => money((Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount)).toString(), li.currency),
      sortValue: (li) => Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount),
    },
    { key: "committed", header: t("committedCosts"), align: "end", width: "130px", render: (li) => money(li.committedCosts, li.currency), sortValue: (li) => Number(li.committedCosts) },
    { key: "projected", header: t("projectedAmount"), align: "end", width: "130px", render: (li) => money(li.projectedAmount, li.currency), sortValue: (li) => Number(li.projectedAmount) },
    {
      key: "variance",
      header: t("variance"),
      align: "end",
      width: "120px",
      render: (li) => {
        const revised = Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount);
        const variance = revised - Number(li.projectedAmount);
        return <span className={variance < 0 ? "font-bold text-maroon-700" : "font-bold text-navy-900"}>{money(variance.toString(), li.currency)}</span>;
      },
      sortValue: (li) => Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount) - Number(li.projectedAmount),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "90px",
      render: (li) => (
        <button onClick={() => startEdit(li)} className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800">
          {t("edit")}
        </button>
      ),
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <>
              <button onClick={() => void handleExportCsv()} className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800">
                {t("exportCsv")}
              </button>
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
            </>
          }
        />

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

        <DataTable<BudgetLineItem> storageKey="budget" columns={columns} rows={lineItems} emptyTitle={t("empty")} />
      </main>

      <Modal open={editingItem !== null} onClose={() => setEditingItem(null)} title={editingItem ? costCodeLabel(editingItem.costCodeId) : ""}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <div className="text-navy-600">{t("modifications")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.modificationsAmount, editingItem.currency) : ""}</div>
            </div>
            <div>
              <div className="text-navy-600">{t("approvedChanges")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.approvedChangesAmount, editingItem.currency) : ""}</div>
            </div>
            <div>
              <div className="text-navy-600">{t("pendingCostChanges")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.pendingCostChanges, editingItem.currency) : ""}</div>
            </div>
            <div>
              <div className="text-navy-600">{t("committedCosts")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.committedCosts, editingItem.currency) : ""}</div>
            </div>
            <div>
              <div className="text-navy-600">{t("directCosts")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.directCosts, editingItem.currency) : ""}</div>
            </div>
            <div>
              <div className="text-navy-600">{t("projectedAmount")}</div>
              <div className="font-medium">{editingItem ? money(editingItem.projectedAmount, editingItem.currency) : ""}</div>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t("originalAmount")}
            <input type="number" step="0.01" value={editOriginal} onChange={(e) => setEditOriginal(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("forecastToComplete")}
            <input type="number" step="0.01" value={editForecast} onChange={(e) => setEditForecast(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void handleSaveEdit()} disabled={saving} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white disabled:opacity-50">
              {t("save")}
            </button>
            <button onClick={() => setEditingItem(null)} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm text-navy-800">
              {t("cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
