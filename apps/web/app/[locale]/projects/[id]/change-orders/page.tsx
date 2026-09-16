"use client";

import { PdfViewerModal } from "@/components/PdfViewerModal";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
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

export default function ChangeOrdersPage() {
  const t = useTranslations("ChangeManagement");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [events, setEvents] = useState<ChangeEventDetail[] | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [budgetLineItems, setBudgetLineItems] = useState<BudgetLineItem[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [error, setError] = useState<string | null>(null);

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
  const pdfViewer = usePdfViewer();

  async function loadEvents(): Promise<void> {
    const list = await apiJson<ChangeEvent[]>(`/change-events?projectId=${params.id}`);
    const details = await Promise.all(list.map((e) => apiJson<ChangeEventDetail>(`/change-events/${e.id}`)));
    setEvents(details);
  }

  function loadChangeOrders(): void {
    apiJson<ChangeOrder[]>(`/change-orders?projectId=${params.id}`).then(setChangeOrders).catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    loadEvents().catch(() => setError(tc("errorGeneric")));
    loadChangeOrders();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`).then(setCostCodes).catch(() => undefined);
    apiJson<BudgetLineItem[]>(`/budget-line-items?projectId=${params.id}`).then(setBudgetLineItems).catch(() => undefined);
    apiJson<Commitment[]>(`/commitments?projectId=${params.id}`).then(setCommitments).catch(() => undefined);
  }, [router, locale, params.id]);

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
      loadChangeOrders();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  const targetOptions = coTargetType === "prime" ? budgetLineItems.map((li) => ({ id: li.id, label: budgetLineItemLabel(li) })) : commitments.map((c) => ({ id: c.id, label: `${c.number} — ${c.title}` }));

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
                      {pco.costImpact ? Number(pco.costImpact).toLocaleString() : "—"} / {pco.timeImpactDays ?? 0}d
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

          {!changeOrders && <p>{tc("loading")}</p>}
          {changeOrders && changeOrders.length === 0 && <p className="text-navy-600">{t("noChangeOrders")}</p>}
          <ul className="flex flex-col gap-3">
            {changeOrders?.map((co) => (
              <li key={co.id}>
                <Link href={`/${locale}/projects/${params.id}/change-orders/${co.id}`} className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-navy-900">
                      {co.number}
                      {co.title ? ` — ${co.title}` : ""}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      {co.executed && <span className="whitespace-nowrap rounded bg-navy-800 px-2 py-0.5 text-xs text-white">{t("executed")}</span>}
                      <span
                        className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                          co.status === "approved"
                            ? "bg-orange-100 text-navy-800"
                            : co.status === "rejected" || co.status === "void"
                              ? "bg-maroon-100 text-maroon-800"
                              : "bg-navy-100 text-navy-800"
                        }`}
                      >
                        {t(statusKey(co.status))}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-navy-600">{Number(co.costImpact).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
