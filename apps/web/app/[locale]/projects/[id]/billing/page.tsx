"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

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

const STATUS_TONE: Record<PaymentApplication["status"], StatusTone> = {
  draft: "neutral",
  submitted: "warning",
  certified: "info",
  paid: "success",
};

export default function BillingPage() {
  const t = useTranslations("Billing");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [applications, setApplications] = useState<PaymentApplication[] | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  const filteredApplications = useMemo(() => {
    if (!applications) return null;
    const q = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (statusFilter && app.status !== statusFilter) return false;
      if (q && !commitmentLabel(app.commitmentId).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [applications, commitments, search, statusFilter]);

  const columns: DataTableColumn<PaymentApplication>[] = [
    { key: "commitment", header: t("commitment"), render: (app) => commitmentLabel(app.commitmentId), sortValue: (app) => commitmentLabel(app.commitmentId) },
    {
      key: "period",
      header: t("period"),
      render: (app) => `${app.periodStart.slice(0, 10)} — ${app.periodEnd.slice(0, 10)}`,
      sortValue: (app) => app.periodStart,
      width: "220px",
    },
    {
      key: "status",
      header: t("status"),
      render: (app) => <StatusBadge tone={STATUS_TONE[app.status]} label={t(statusKey(app.status))} />,
      sortValue: (app) => app.status,
      width: "120px",
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
              {t("newButton")}
            </button>
          }
        />

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

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["draft", "submitted", "certified", "paid"] as const).map((s) => ({ value: s, label: t(statusKey(s)) })),
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

        <DataTable<PaymentApplication>
          columns={columns}
          rows={filteredApplications}
          onRowClick={(app) => router.push(`/${locale}/projects/${params.id}/billing/${app.id}`)}
          emptyTitle={applications && applications.length > 0 ? t("noResults") : t("empty")}
        />
      </main>
    </>
  );
}
