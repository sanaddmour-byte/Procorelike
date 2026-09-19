"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useProjectCurrency } from "@/lib/use-project-currency";
import { formatMoney, type DirectCostStatus, type DirectCostType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

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

const STATUS_TONE: Record<DirectCostStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export default function DirectCostsPage() {
  const t = useTranslations("DirectCosts");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const currency = useProjectCurrency(params.id);
  const money = (value: string): string => formatMoney(value, currency, locale);

  const [directCosts, setDirectCosts] = useState<DirectCost[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  const filteredDirectCosts = useMemo(() => {
    if (!directCosts) return null;
    const q = search.trim().toLowerCase();
    return directCosts.filter((dc) => {
      if (statusFilter && dc.status !== statusFilter) return false;
      if (q && !dc.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [directCosts, search, statusFilter]);

  const columns: DataTableColumn<DirectCost>[] = [
    { key: "costCode", header: t("costCode"), render: (dc) => costCodeLabel(dc.costCodeId), sortValue: (dc) => costCodeLabel(dc.costCodeId) },
    { key: "description", header: t("description"), render: (dc) => dc.description, sortValue: (dc) => dc.description },
    { key: "type", header: t("type"), render: (dc) => typeLabel(dc.type), sortValue: (dc) => dc.type, width: "120px" },
    { key: "amount", header: t("amount"), align: "end", width: "130px", render: (dc) => money(dc.amount), sortValue: (dc) => Number(dc.amount) },
    { key: "incurredDate", header: t("incurredDate"), render: (dc) => dc.incurredDate.slice(0, 10), sortValue: (dc) => dc.incurredDate, width: "130px" },
    {
      key: "status",
      header: t("status"),
      render: (dc) => <StatusBadge tone={STATUS_TONE[dc.status]} label={statusLabel(dc.status)} />,
      sortValue: (dc) => dc.status,
      width: "120px",
    },
    {
      key: "actions",
      header: t("actions"),
      width: "160px",
      render: (dc) =>
        dc.status === "pending" ? (
          <div className="flex gap-2">
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
        ) : null,
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </button>
          }
        />

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

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["pending", "approved", "rejected"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
            },
          ]}
          activeFilters={{ status: statusFilter }}
          onFilterChange={(_key, value) => setStatusFilter(value)}
          onClearAll={() => {
            setSearch("");
            setStatusFilter("");
          }}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<DirectCost> columns={columns} rows={filteredDirectCosts} emptyTitle={directCosts && directCosts.length > 0 ? t("noResults") : t("empty")} />
      </main>
    </>
  );
}
