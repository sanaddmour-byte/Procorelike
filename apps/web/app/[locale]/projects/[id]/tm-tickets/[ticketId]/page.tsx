"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { TM_TICKET_STATUS_TRANSITIONS, type TmTicketStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface LaborEntry {
  id: string;
  workerName: string;
  trade: string | null;
  hours: string;
  rate: string;
}
interface EquipmentEntry {
  id: string;
  description: string;
  hours: string;
  rate: string;
}
interface MaterialEntry {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

interface TmTicketDetail {
  id: string;
  projectId: string;
  ticketNumber: string;
  companyId: string;
  workDate: string;
  description: string;
  status: TmTicketStatus;
  rejectionReason: string | null;
  laborEntries: LaborEntry[];
  equipmentEntries: EquipmentEntry[];
  materialEntries: MaterialEntry[];
  totalAmount: number;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

function statusLabel(status: TmTicketStatus, t: (key: string) => string): string {
  return {
    draft: t("statusDraft"),
    submitted: t("statusSubmitted"),
    approved: t("statusApproved"),
    rejected: t("statusRejected"),
  }[status];
}

export default function TmTicketDetailScreen() {
  const t = useTranslations("TmTickets");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; ticketId: string }>();

  const [ticket, setTicket] = useState<TmTicketDetail | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<TmTicketDetail>(`/tm-tickets/${params.ticketId}`);
      setTicket(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.ticketId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleTransition(toStatus: TmTicketStatus): Promise<void> {
    setTransitioning(true);
    try {
      await apiJson(`/tm-tickets/${params.ticketId}/transition`, {
        method: "POST",
        body: JSON.stringify(toStatus === "rejected" ? { toStatus, rejectionReason } : { toStatus }),
      });
      setRejectionReason("");
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  if (!ticket) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  const otherTransitions = TM_TICKET_STATUS_TRANSITIONS[ticket.status].filter((s) => s !== "rejected");
  const canReject = TM_TICKET_STATUS_TRANSITIONS[ticket.status].includes("rejected");

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/tm-tickets`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>

        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {ticket.ticketNumber} — {companyName(ticket.companyId)}
          </h1>
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(ticket.status, t)}</span>
        </div>
        <p className="mb-4 text-sm text-navy-600">{ticket.workDate.slice(0, 10)}</p>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>

        {ticket.rejectionReason && (
          <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <h2 className="mb-2 text-sm font-medium text-navy-800">{t("rejectionReason")}</h2>
            <p className="whitespace-pre-wrap text-sm">{ticket.rejectionReason}</p>
          </div>
        )}

        {ticket.laborEntries.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-navy-800">{t("laborEntries")}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {ticket.laborEntries.map((l) => (
                <li key={l.id} className="rounded-lg border-3 border-ink bg-white p-2">
                  {l.workerName} {l.trade && `(${l.trade})`} — {Number(l.hours)}h × {Number(l.rate)} = {(Number(l.hours) * Number(l.rate)).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ticket.equipmentEntries.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-navy-800">{t("equipmentEntries")}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {ticket.equipmentEntries.map((e) => (
                <li key={e.id} className="rounded-lg border-3 border-ink bg-white p-2">
                  {e.description} — {Number(e.hours)}h × {Number(e.rate)} = {(Number(e.hours) * Number(e.rate)).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ticket.materialEntries.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-navy-800">{t("materialEntries")}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {ticket.materialEntries.map((m) => (
                <li key={m.id} className="rounded-lg border-3 border-ink bg-white p-2">
                  {m.description} — {Number(m.quantity)} {m.unit} × {Number(m.unitCost)} = {(Number(m.quantity) * Number(m.unitCost)).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-6 text-lg font-semibold text-navy-900">
          {t("totalAmount")}: {ticket.totalAmount.toFixed(2)}
        </p>

        {otherTransitions.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm text-navy-600">{t("moveTo")}</p>
            <div className="flex flex-wrap gap-2">
              {otherTransitions.map((next) => (
                <button
                  key={next}
                  onClick={() => void handleTransition(next)}
                  disabled={transitioning}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {statusLabel(next, t)}
                </button>
              ))}
            </div>
          </div>
        )}

        {canReject && (
          <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <p className="mb-2 text-sm text-navy-600">{t("rejectionReasonRequired")}</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t("rejectionReasonPlaceholder")}
              className="mb-3 w-full rounded-lg border-3 border-ink px-3 py-2 text-sm"
              rows={3}
            />
            <button
              onClick={() => void handleTransition("rejected")}
              disabled={transitioning || !rejectionReason.trim()}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("rejectWithReason")}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
