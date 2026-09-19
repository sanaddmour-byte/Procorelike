"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useServerTable } from "@/lib/use-server-table";
import type { TmTicketStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface TmTicket {
  id: string;
  ticketNumber: string;
  companyId: string;
  workDate: string;
  description: string;
  status: TmTicketStatus;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

interface LaborEntry {
  workerName: string;
  trade: string;
  hours: string;
  rate: string;
}
interface EquipmentEntry {
  description: string;
  hours: string;
  rate: string;
}
interface MaterialEntry {
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

function statusLabel(status: TmTicketStatus, t: (key: string) => string): string {
  return {
    draft: t("statusDraft"),
    submitted: t("statusSubmitted"),
    approved: t("statusApproved"),
    rejected: t("statusRejected"),
  }[status];
}

const STATUS_TONE: Record<TmTicketStatus, StatusTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

export default function TmTicketsPage() {
  const t = useTranslations("TmTickets");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [description, setDescription] = useState("");
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [equipmentEntries, setEquipmentEntries] = useState<EquipmentEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<MaterialEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const serverTable = useServerTable<TmTicket>({ basePath: "/tm-tickets", projectId: params.id, defaultSort: { key: "ticketNumber", direction: "asc" } });

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((cos) => {
        setCompanies(cos);
        setCompanyId((current) => current || cos[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  function resetForm(): void {
    setWorkDate("");
    setDescription("");
    setLaborEntries([]);
    setEquipmentEntries([]);
    setMaterialEntries([]);
    setShowForm(false);
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/tm-tickets", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          companyId,
          workDate,
          description,
          laborEntries: laborEntries
            .filter((l) => l.workerName && l.hours && l.rate)
            .map((l) => ({ workerName: l.workerName, trade: l.trade || undefined, hours: Number(l.hours), rate: Number(l.rate) })),
          equipmentEntries: equipmentEntries
            .filter((eq) => eq.description && eq.hours && eq.rate)
            .map((eq) => ({ description: eq.description, hours: Number(eq.hours), rate: Number(eq.rate) })),
          materialEntries: materialEntries
            .filter((m) => m.description && m.quantity && m.unit && m.unitCost)
            .map((m) => ({ description: m.description, quantity: Number(m.quantity), unit: m.unit, unitCost: Number(m.unitCost) })),
        }),
      });
      resetForm();
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

  const columns: DataTableColumn<TmTicket>[] = [
    { key: "ticketNumber", header: t("number"), render: (ticket) => ticket.ticketNumber, sortValue: (ticket) => ticket.ticketNumber, width: "110px" },
    { key: "company", header: t("company"), render: (ticket) => companyName(ticket.companyId), width: "180px" },
    { key: "workDate", header: t("workDate"), render: (ticket) => ticket.workDate.slice(0, 10), sortValue: (ticket) => ticket.workDate, width: "130px" },
    { key: "description", header: t("description"), render: (ticket) => ticket.description, sortValue: (ticket) => ticket.description },
    {
      key: "status",
      header: t("status"),
      render: (ticket) => <StatusBadge tone={STATUS_TONE[ticket.status]} label={statusLabel(ticket.status, t)} />,
      sortValue: (ticket) => ticket.status,
      width: "130px",
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
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("company")}
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("workDate")}
              <input
                type="date"
                required
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-navy-800">{t("laborEntries")}</p>
              {laborEntries.map((l, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    placeholder={t("workerName")}
                    value={l.workerName}
                    onChange={(e) => setLaborEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, workerName: e.target.value } : r)))}
                    className="min-w-[140px] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("trade")}
                    value={l.trade}
                    onChange={(e) => setLaborEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, trade: e.target.value } : r)))}
                    className="w-28 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("hours")}
                    type="number"
                    step="0.25"
                    value={l.hours}
                    onChange={(e) => setLaborEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, hours: e.target.value } : r)))}
                    className="w-20 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("rate")}
                    type="number"
                    step="0.01"
                    value={l.rate}
                    onChange={(e) => setLaborEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, rate: e.target.value } : r)))}
                    className="w-24 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLaborEntries((rows) => [...rows, { workerName: "", trade: "", hours: "", rate: "" }])}
                className="self-start rounded-lg border-3 border-ink bg-white px-2 py-1 text-xs text-navy-800 brutal-interactive"
              >
                + {t("addLabor")}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-navy-800">{t("equipmentEntries")}</p>
              {equipmentEntries.map((eqRow, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    placeholder={t("equipmentDescription")}
                    value={eqRow.description}
                    onChange={(e) =>
                      setEquipmentEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, description: e.target.value } : r)))
                    }
                    className="min-w-[160px] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("hours")}
                    type="number"
                    step="0.25"
                    value={eqRow.hours}
                    onChange={(e) => setEquipmentEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, hours: e.target.value } : r)))}
                    className="w-20 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("rate")}
                    type="number"
                    step="0.01"
                    value={eqRow.rate}
                    onChange={(e) => setEquipmentEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, rate: e.target.value } : r)))}
                    className="w-24 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEquipmentEntries((rows) => [...rows, { description: "", hours: "", rate: "" }])}
                className="self-start rounded-lg border-3 border-ink bg-white px-2 py-1 text-xs text-navy-800 brutal-interactive"
              >
                + {t("addEquipment")}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-navy-800">{t("materialEntries")}</p>
              {materialEntries.map((m, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    placeholder={t("materialDescription")}
                    value={m.description}
                    onChange={(e) => setMaterialEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, description: e.target.value } : r)))}
                    className="min-w-[160px] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("quantity")}
                    type="number"
                    step="0.01"
                    value={m.quantity}
                    onChange={(e) => setMaterialEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, quantity: e.target.value } : r)))}
                    className="w-20 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("unit")}
                    value={m.unit}
                    onChange={(e) => setMaterialEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, unit: e.target.value } : r)))}
                    className="w-20 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                  <input
                    placeholder={t("unitCost")}
                    type="number"
                    step="0.01"
                    value={m.unitCost}
                    onChange={(e) => setMaterialEntries((rows) => rows.map((r, ri) => (ri === i ? { ...r, unitCost: e.target.value } : r)))}
                    className="w-24 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setMaterialEntries((rows) => [...rows, { description: "", quantity: "", unit: "", unitCost: "" }])}
                className="self-start rounded-lg border-3 border-ink bg-white px-2 py-1 text-xs text-navy-800 brutal-interactive"
              >
                + {t("addMaterial")}
              </button>
            </div>

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

        <SavedViewsBar
          projectId={params.id}
          module="tm_tickets"
          currentState={{ search: serverTable.search, filters: serverTable.filters, sort: serverTable.sort }}
          onApply={(state) => serverTable.applyView(state)}
        />

        <FilterBar
          searchValue={serverTable.search}
          onSearchChange={serverTable.onSearchChange}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["draft", "submitted", "approved", "rejected"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
            },
          ]}
          activeFilters={serverTable.filters}
          onFilterChange={serverTable.onFilterChange}
          onClearAll={serverTable.clearAll}
          clearAllLabel={tc("clearAll")}
        />

        <DataTable<TmTicket>
          columns={columns}
          rows={serverTable.rows}
          error={serverTable.error ? tc("errorGeneric") : null}
          onRetry={serverTable.reload}
          onRowClick={(ticket) => router.push(`/${locale}/projects/${params.id}/tm-tickets/${ticket.id}`)}
          emptyTitle={hasActiveQuery ? t("noResults") : t("empty")}
          serverSort={serverTable.sort}
          onServerSortChange={serverTable.onServerSortChange}
          pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
        />
      </main>
    </>
  );
}
