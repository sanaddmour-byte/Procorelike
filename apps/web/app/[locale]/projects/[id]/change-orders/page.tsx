"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { BulkActionsBar } from "@/components/ui/BulkActionsBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { SavedViewsBar } from "@/components/ui/SavedViewsBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson, downloadFile } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useProjectCurrency } from "@/lib/use-project-currency";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useServerTable } from "@/lib/use-server-table";
import { formatMoney } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type ChangeReason =
  | "owner_change"
  | "design_development"
  | "allowance"
  | "value_engineering"
  | "unforeseen_condition"
  | "errors_omissions"
  | "rfi"
  | "other";

const CHANGE_REASONS: ChangeReason[] = [
  "owner_change",
  "design_development",
  "allowance",
  "value_engineering",
  "unforeseen_condition",
  "errors_omissions",
  "rfi",
  "other",
];

function reasonKey(reason: ChangeReason): string {
  return {
    owner_change: "reasonOwnerChange",
    design_development: "reasonDesignDevelopment",
    allowance: "reasonAllowance",
    value_engineering: "reasonValueEngineering",
    unforeseen_condition: "reasonUnforeseenCondition",
    errors_omissions: "reasonErrorsOmissions",
    rfi: "reasonRfi",
    other: "reasonOther",
  }[reason];
}

type ChangeEventStatus = "open" | "incorporated" | "void";

const CHANGE_EVENT_STATUS_TRANSITIONS: Record<ChangeEventStatus, readonly ChangeEventStatus[]> = {
  open: ["incorporated", "void"],
  incorporated: [],
  void: [],
};

function changeEventStatusKey(status: ChangeEventStatus): string {
  return { open: "eventStatusOpen", incorporated: "eventStatusIncorporated", void: "eventStatusVoid" }[status];
}

interface ChangeEvent {
  id: string;
  title: string;
  description: string | null;
  potentialCostImpact: string | null;
  status: ChangeEventStatus;
  reason: ChangeReason;
}

interface PotentialChangeOrder {
  id: string;
  changeEventId: string;
  costImpact: string | null;
  timeImpactDays: number | null;
  status: string;
}

interface ChangeEventDetail extends ChangeEvent {
  potentialChangeOrders: PotentialChangeOrder[];
}

interface ChangeOrder {
  id: string;
  number: string;
  title: string | null;
  targetType: "prime" | "commitment";
  targetId: string;
  costImpact: string;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "void";
  executed: boolean;
}

interface CostCode {
  id: string;
  code: string;
  description: string;
}
interface BudgetLineItem {
  id: string;
  costCodeId: string;
}
interface Commitment {
  id: string;
  number: string;
  title: string;
}

function statusKey(status: ChangeOrder["status"]): string {
  return { draft: "statusDraft", pending_approval: "statusPendingApproval", approved: "statusApproved", rejected: "statusRejected", void: "statusVoid" }[status];
}

const CHANGE_ORDER_STATUS_TONE: Record<ChangeOrder["status"], StatusTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  void: "neutral",
};

export default function ChangeOrdersPage() {
  const t = useTranslations("ChangeManagement");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const currency = useProjectCurrency(params.id);
  const money = (value: string | number): string => formatMoney(value, currency, locale);

  const [events, setEvents] = useState<ChangeEventDetail[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [budgetLineItems, setBudgetLineItems] = useState<BudgetLineItem[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const serverTable = useServerTable<ChangeOrder>({ basePath: "/change-orders", projectId: params.id, defaultSort: { key: "number", direction: "asc" } });

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventCostImpact, setEventCostImpact] = useState("");
  const [eventReason, setEventReason] = useState<ChangeReason>("other");

  const [pcoFormFor, setPcoFormFor] = useState<string | null>(null);
  const [pcoCostImpact, setPcoCostImpact] = useState("");
  const [pcoTimeImpact, setPcoTimeImpact] = useState("");

  const [showCoForm, setShowCoForm] = useState(false);
  const [coTitle, setCoTitle] = useState("");
  const [coReason, setCoReason] = useState<ChangeReason>("other");
  const [coTargetType, setCoTargetType] = useState<"prime" | "commitment">("prime");
  const [coTargetId, setCoTargetId] = useState("");
  const [coCostImpact, setCoCostImpact] = useState("");
  const [coTimeImpact, setCoTimeImpact] = useState("0");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkSubmit, setConfirmBulkSubmit] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const pdfViewer = usePdfViewer();

  async function loadEvents(): Promise<void> {
    const list = await apiJson<ChangeEvent[]>(`/change-events?projectId=${params.id}`);
    const details = await Promise.all(list.map((e) => apiJson<ChangeEventDetail>(`/change-events/${e.id}`)));
    setEvents(details);
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    loadEvents().catch(() => setError(tc("errorGeneric")));
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`).then(setCostCodes).catch(() => undefined);
    apiJson<BudgetLineItem[]>(`/budget-line-items?projectId=${params.id}`).then(setBudgetLineItems).catch(() => undefined);
    apiJson<Commitment[]>(`/commitments?projectId=${params.id}`).then(setCommitments).catch(() => undefined);
  }, [router, locale, params.id]);

  // Selection is scoped to the currently rendered page/view -- clear it whenever
  // the underlying result set changes so a stale id never lingers into a new view.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [serverTable.search, serverTable.filters, serverTable.sort, serverTable.page]);

  async function handleBulkSubmit(): Promise<void> {
    setConfirmBulkSubmit(false);
    setBulkSubmitting(true);
    try {
      const results = await apiJson<{ id: string; ok: boolean; error?: string }[]>("/change-orders/bulk-submit", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const failed = results.filter((r) => !r.ok).length;
      setError(failed > 0 ? tc("bulkPartialFailure", { failed, total: results.length }) : null);
      setSelectedIds(new Set());
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBulkSubmitting(false);
    }
  }

  function budgetLineItemLabel(li: BudgetLineItem): string {
    const cc = costCodes.find((c) => c.id === li.costCodeId);
    return cc ? `${cc.code} — ${cc.description}` : li.id;
  }

  async function handleCreateEvent(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setSaving(true);
    try {
      await apiJson("/change-events", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          title: eventTitle.trim(),
          description: eventDescription.trim() || undefined,
          potentialCostImpact: eventCostImpact ? Number(eventCostImpact) : undefined,
          reason: eventReason,
        }),
      });
      setEventTitle("");
      setEventDescription("");
      setEventCostImpact("");
      setEventReason("other");
      setShowEventForm(false);
      await loadEvents();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransitionEvent(changeEventId: string, toStatus: ChangeEventStatus): Promise<void> {
    setSaving(true);
    try {
      await apiJson(`/change-events/${changeEventId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await loadEvents();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPco(changeEventId: string): Promise<void> {
    setSaving(true);
    try {
      await apiJson(`/change-events/${changeEventId}/potential-change-orders`, {
        method: "POST",
        body: JSON.stringify({
          costImpact: pcoCostImpact ? Number(pcoCostImpact) : undefined,
          timeImpactDays: pcoTimeImpact ? Number(pcoTimeImpact) : undefined,
        }),
      });
      setPcoCostImpact("");
      setPcoTimeImpact("");
      setPcoFormFor(null);
      await loadEvents();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateChangeOrder(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!coTargetId || !coCostImpact) return;
    setSaving(true);
    try {
      await apiJson("/change-orders", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          title: coTitle.trim() || undefined,
          reason: coReason,
          targetType: coTargetType,
          targetId: coTargetId,
          costImpact: Number(coCostImpact),
          timeImpactDays: Number(coTimeImpact || 0),
        }),
      });
      setCoTitle("");
      setCoReason("other");
      setCoCostImpact("");
      setCoTimeImpact("0");
      setShowCoForm(false);
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  const targetOptions = coTargetType === "prime" ? budgetLineItems.map((li) => ({ id: li.id, label: budgetLineItemLabel(li) })) : commitments.map((c) => ({ id: c.id, label: `${c.number} — ${c.title}` }));

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);

  const changeOrderColumns: DataTableColumn<ChangeOrder>[] = [
    { key: "number", header: t("number"), render: (co) => co.number, sortValue: (co) => co.number, width: "110px" },
    { key: "title", header: t("coTitle"), render: (co) => co.title ?? "" },
    {
      key: "status",
      header: t("status"),
      render: (co) => <StatusBadge tone={CHANGE_ORDER_STATUS_TONE[co.status]} label={t(statusKey(co.status))} />,
      sortValue: (co) => co.status,
      width: "150px",
    },
    { key: "costImpact", header: t("costImpact"), align: "end", width: "140px", render: (co) => money(Number(co.costImpact)), sortValue: (co) => Number(co.costImpact) },
    {
      key: "executed",
      header: "",
      width: "110px",
      render: (co) => (co.executed ? <StatusBadge tone="neutral" label={t("executed")} /> : null),
    },
  ];

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {error && <p className="text-maroon-700">{error}</p>}

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy-900">{t("changeEvents")}</h2>
            <button onClick={() => setShowEventForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white">
              {t("newChangeEvent")}
            </button>
          </div>

          {showEventForm && (
            <form onSubmit={(e) => void handleCreateEvent(e)} className="mb-4 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <label className="flex flex-col gap-1 text-sm">
                {t("eventTitle")}
                <input required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("description")}
                <input value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("potentialCostImpact")}
                <input type="number" step="0.01" value={eventCostImpact} onChange={(e) => setEventCostImpact(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("reason")}
                <select value={eventReason} onChange={(e) => setEventReason(e.target.value as ChangeReason)} className="rounded-lg border-3 border-ink px-3 py-2">
                  {CHANGE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(reasonKey(r))}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                {t("create")}
              </button>
            </form>
          )}

          {!events && <p>{tc("loading")}</p>}
          {events && events.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
          <ul className="flex flex-col gap-3">
            {events?.map((ev) => (
              <li key={ev.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-navy-900">{ev.title}</span>
                  <span
                    className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                      ev.status === "void" ? "bg-maroon-100 text-maroon-800" : ev.status === "incorporated" ? "bg-orange-100 text-navy-800" : "bg-navy-100 text-navy-800"
                    }`}
                  >
                    {t(changeEventStatusKey(ev.status))}
                  </span>
                </div>
                {ev.description && <p className="mb-2 text-sm text-navy-600">{ev.description}</p>}
                <p className="mb-2 text-xs text-navy-600">{t("reason")}: {t(reasonKey(ev.reason))}</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {ev.potentialChangeOrders.map((pco) => (
                    <span key={pco.id} className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                      {pco.costImpact ? money(Number(pco.costImpact)) : "—"} / {pco.timeImpactDays ?? 0}d
                    </span>
                  ))}
                </div>
                {CHANGE_EVENT_STATUS_TRANSITIONS[ev.status].length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {CHANGE_EVENT_STATUS_TRANSITIONS[ev.status].map((next) => (
                      <button
                        key={next}
                        onClick={() => void handleTransitionEvent(ev.id, next)}
                        disabled={saving}
                        className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800 disabled:opacity-50"
                      >
                        {t("moveTo")}: {t(changeEventStatusKey(next))}
                      </button>
                    ))}
                  </div>
                )}
                {pcoFormFor === ev.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      {t("costImpact")}
                      <input type="number" step="0.01" value={pcoCostImpact} onChange={(e) => setPcoCostImpact(e.target.value)} className="rounded-lg border-3 border-ink px-2 py-1" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("timeImpactDays")}
                      <input type="number" value={pcoTimeImpact} onChange={(e) => setPcoTimeImpact(e.target.value)} className="rounded-lg border-3 border-ink px-2 py-1" />
                    </label>
                    <button onClick={() => void handleAddPco(ev.id)} disabled={saving} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-xs text-white disabled:opacity-50">
                      {t("create")}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setPcoFormFor(ev.id)} className="text-xs text-maroon-700 underline">
                    {t("addPco")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy-900">{t("changeOrders")}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void pdfViewer.openPdf(`/change-orders/summary-report?projectId=${params.id}`, t("changeOrders"), "change-order-register.pdf")}
                className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-sm font-semibold text-white"
              >
                {tc("exportAllPdf")}
              </button>
              <button
                onClick={() => void downloadFile(`/change-orders/summary-report?projectId=${params.id}&format=csv`, "change-order-register.csv")}
                className="rounded-lg border-3 border-ink bg-white brutal-interactive px-3 py-1.5 text-sm font-semibold text-navy-800"
              >
                {tc("exportAllCsv")}
              </button>
              <button onClick={() => setShowCoForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white">
                {t("newChangeOrder")}
              </button>
            </div>
          </div>

          {showCoForm && (
            <form onSubmit={(e) => void handleCreateChangeOrder(e)} className="mb-4 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <label className="flex flex-col gap-1 text-sm">
                {t("coTitle")}
                <input value={coTitle} onChange={(e) => setCoTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("reason")}
                <select value={coReason} onChange={(e) => setCoReason(e.target.value as ChangeReason)} className="rounded-lg border-3 border-ink px-3 py-2">
                  {CHANGE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(reasonKey(r))}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("targetType")}
                <select
                  value={coTargetType}
                  onChange={(e) => {
                    setCoTargetType(e.target.value as "prime" | "commitment");
                    setCoTargetId("");
                  }}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                >
                  <option value="prime">{t("targetTypePrime")}</option>
                  <option value="commitment">{t("targetTypeCommitment")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {coTargetType === "prime" ? t("targetBudgetLineItem") : t("targetCommitment")}
                <select required value={coTargetId} onChange={(e) => setCoTargetId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                  <option value="" disabled>
                    —
                  </option>
                  {targetOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("costImpact")}
                <input required type="number" step="0.01" value={coCostImpact} onChange={(e) => setCoCostImpact(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("timeImpactDays")}
                <input type="number" value={coTimeImpact} onChange={(e) => setCoTimeImpact(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
              </label>
              <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                {t("create")}
              </button>
            </form>
          )}

          <SavedViewsBar
            projectId={params.id}
            module="change_management"
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
                options: (["draft", "pending_approval", "approved", "rejected", "void"] as const).map((s) => ({ value: s, label: t(statusKey(s)) })),
              },
            ]}
            activeFilters={serverTable.filters}
            onFilterChange={serverTable.onFilterChange}
            onClearAll={serverTable.clearAll}
            clearAllLabel={tc("clearAll")}
          />

          <BulkActionsBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <button
              type="button"
              disabled={bulkSubmitting}
              onClick={() => setConfirmBulkSubmit(true)}
              className="rounded-lg border-2 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t("bulkSubmitAction")}
            </button>
          </BulkActionsBar>

          <DataTable<ChangeOrder>
            storageKey="change-orders"
            columns={changeOrderColumns}
            rows={serverTable.rows}
            error={serverTable.error ? tc("errorGeneric") : null}
            onRetry={serverTable.reload}
            onRowClick={(co) => router.push(`/${locale}/projects/${params.id}/change-orders/${co.id}`)}
            emptyTitle={hasActiveQuery ? t("noChangeOrderResults") : t("noChangeOrders")}
            serverSort={serverTable.sort}
            onServerSortChange={serverTable.onServerSortChange}
            pagination={{ page: serverTable.page, pageSize: serverTable.pageSize, total: serverTable.total, onPageChange: serverTable.onPageChange }}
            selection={{ selectedIds, getRowId: (co) => co.id, onSelectionChange: setSelectedIds }}
          />
        </section>
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
      <ConfirmDialog
        open={confirmBulkSubmit}
        title={t("bulkSubmitConfirmTitle")}
        message={t("bulkSubmitConfirmMessage", { count: selectedIds.size })}
        confirmLabel={t("bulkSubmitAction")}
        cancelLabel={tc("cancel")}
        onConfirm={() => void handleBulkSubmit()}
        onCancel={() => setConfirmBulkSubmit(false)}
      />
    </>
  );
}
