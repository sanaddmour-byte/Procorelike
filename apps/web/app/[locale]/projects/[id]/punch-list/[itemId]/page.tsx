"use client";

import { AttachmentList } from "@/components/AttachmentList";
import { RecordNav } from "@/components/RecordNav";
import { ErrorState } from "@/components/ui/ErrorState";
import { LocationPicker } from "@/components/ui/LocationPicker";
import { loadStoredAuth } from "@/lib/auth-storage";
import { errorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { RecordHistory } from "@/components/ui/RecordHistory";
import { apiJson } from "@/lib/api-client";
import { PUNCH_ITEM_STATUS_TRANSITIONS, type FieldConflict } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link, { type LinkProps } from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PunchStatus = "open" | "ready_for_review" | "not_accepted" | "in_dispute" | "approved" | "closed";

interface Member {
  userId: string;
  name: string;
  companyId?: string;
}

interface PunchItemDetail {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: PunchStatus;
  finalApproverUserId: string | null;
  assigneeUserId: string | null;
  locationId: string | null;
  tradeId: string | null;
  dueDate: string | null;
  needsReview: boolean;
  conflictData: FieldConflict[] | null;
  history: { id: string; fromStatus: PunchStatus | null; toStatus: PunchStatus; note: string | null; changedAt: string }[];
  distribution: { id: string; userId: string | null; companyId: string | null }[];
}

/** Shortest chain of valid transitions from `from` to "closed" (breadth-first over the shared workflow table). */
function pathToClosed(from: PunchStatus): PunchStatus[] {
  const prev = new Map<PunchStatus, PunchStatus | null>([[from, null]]);
  const queue: PunchStatus[] = [from];
  while (queue.length) {
    const cur = queue.shift() as PunchStatus;
    if (cur === "closed") break;
    for (const n of PUNCH_ITEM_STATUS_TRANSITIONS[cur] as readonly PunchStatus[]) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        queue.push(n);
      }
    }
  }
  const out: PunchStatus[] = [];
  for (let c: PunchStatus | null | undefined = prev.has("closed") ? "closed" : null; c && c !== from; c = prev.get(c)) out.unshift(c);
  return out;
}

export default function PunchItemDetailPage() {
  const t = useTranslations("PunchList");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const te = useTranslations("Errors");
  const [me, setMe] = useState<string | undefined>(undefined);
  useEffect(() => setMe(loadStoredAuth()?.user.id), []);
  const locale = useLocale();
  const params = useParams<{ id: string; itemId: string }>();

  const [item, setItem] = useState<PunchItemDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load(): void {
    apiJson<PunchItemDetail>(`/punch-items/${params.itemId}`)
      .then(setItem)
      .catch((err) => setError(errorMessage(err, te)));
  }

  useEffect(load, [params.itemId, tc]);
  useEffect(() => {
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [params.id]);

  function memberName(userId: string | null): string {
    return members.find((m) => m.userId === userId)?.name ?? (userId ?? "");
  }

  function statusLabel(status: PunchStatus): string {
    return {
      open: t("statusOpen"),
      ready_for_review: t("statusReadyForReview"),
      not_accepted: t("statusNotAccepted"),
      in_dispute: t("statusInDispute"),
      approved: t("statusApproved"),
      closed: t("statusClosed"),
    }[status];
  }

  async function handleSetFinalApprover(finalApproverUserId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/punch-items/${params.itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ finalApproverUserId: finalApproverUserId || undefined }),
      });
      load();
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  async function transition(toStatus: PunchStatus): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/punch-items/${params.itemId}/transition`, {
        method: "POST",
        body: JSON.stringify({ toStatus }),
      });
      load();
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/punch-items/${params.itemId}`, { method: "PATCH", body: JSON.stringify(body) });
      load();
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  /** Walks the workflow toward "closed" in one action (plan E3); stops, and says where, if the server refuses a step (e.g. only the final approver may approve). */
  async function closeOut(): Promise<void> {
    if (!item) return;
    setBusy(true);
    setError(null);
    let status = item.status;
    try {
      for (const next of pathToClosed(status)) {
        await apiJson(`/punch-items/${params.itemId}/transition`, { method: "POST", body: JSON.stringify({ toStatus: next }) });
        status = next;
      }
      if ("vibrate" in navigator) navigator.vibrate?.(30);
    } catch {
      setError(tf("stoppedAt", { status: statusLabel(status) }));
    } finally {
      setBusy(false);
      load();
    }
  }

  const backHref = `/${locale}/projects/${params.id}/punch-list` as LinkProps["href"];

  return (
    <>
      <main className="mx-auto max-w-lg px-4 py-6 pb-32 md:pb-8">
        <RecordNav basePath="/punch-items" currentId={params.itemId} projectId={params.id} segment="punch-list" />
        <Link href={backHref} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        {!item && !error && <p className="mt-4">{tc("loading")}</p>}
        {error && <ErrorState message={error} retryLabel={tc("retry")} onRetry={() => window.location.reload()} />}
        {item && (
          <>
            <h1 className="mb-1 mt-2 text-2xl font-extrabold tracking-tight text-navy-900">{item.number}</h1>
            <p className="mb-4 text-navy-800">{item.description}</p>

            {item.needsReview && item.conflictData && (
              <div className="mb-4 rounded-lg border-3 border-orange-600 bg-orange-50 p-3 text-sm shadow-brutal-sm">
                <p className="mb-2 font-medium text-orange-900">{t("conflictBanner")}</p>
                {item.conflictData.map((c) => (
                  <div key={c.field} className="mb-1 grid grid-cols-2 gap-2 text-xs">
                    <span>
                      <strong>{c.field}</strong> ({tc("appName")}): {String(c.server)}
                    </span>
                    <span>
                      <strong>{c.field}</strong> (device): {String(c.client)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border-3 border-ink bg-orange-100 px-3 py-1 text-sm font-bold">{statusLabel(item.status)}</span>
              {item.dueDate && (
                <span className="text-sm text-navy-700">
                  {tf("due")}: <bdi dir="ltr">{formatDate(item.dueDate)}</bdi>
                </span>
              )}
            </div>

            <section className="mb-4 flex flex-col gap-3 rounded-xl border-3 border-ink bg-white/70 p-3">
              <LocationPicker projectId={params.id} value={item.locationId ?? undefined} onChange={(locationId) => void patch({ locationId })} />
              <div className="flex flex-col gap-1 text-sm">
                <span>{tf("assignee")}</span>
                <div className="flex gap-gap-hit">
                  {me && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={item.assigneeUserId === me}
                      onClick={() => void patch({ assigneeUserId: me, assigneeCompanyId: members.find((m) => m.userId === me)?.companyId })}
                      className={`hit-task rounded-lg border-3 border-ink px-5 font-bold ${item.assigneeUserId === me ? "bg-navy-900 text-white" : "bg-white text-navy-900"}`}
                    >
                      {tf("assignMe")}
                    </button>
                  )}
                  <select
                    aria-label={tf("assignee")}
                    value={item.assigneeUserId ?? ""}
                    disabled={busy}
                    onChange={(e) => void patch({ assigneeUserId: e.target.value || undefined, assigneeCompanyId: members.find((m) => m.userId === e.target.value)?.companyId })}
                    className="hit-task min-w-0 flex-1 rounded-lg border-3 border-ink px-3 text-base disabled:opacity-50"
                  >
                    <option value="">{tf("unassigned")}</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                {t("finalApprover")}
                <select
                  value={item.finalApproverUserId ?? ""}
                  disabled={busy}
                  onChange={(e) => void handleSetFinalApprover(e.target.value)}
                  className="hit-task rounded-lg border-3 border-ink px-3 text-base disabled:opacity-50"
                >
                  <option value="">{t("unassigned")}</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="mb-4">
              <AttachmentList
                projectId={params.id}
                ownerType="punch_item"
                ownerId={params.itemId}
                heading={t("photos")}
                emptyLabel={t("noPhotos")}
                uploadLabel={`📷 ${tf("takePhoto")}`}
                uploadingLabel={t("uploadingPhoto")}
                errorLabel={tc("errorGeneric")}
                accept="image/*"
                capture
                imageMode
              />
            </section>

            <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,0px)] z-30 flex flex-wrap gap-gap-hit border-t border-ink bg-cream px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
              {item.status !== "closed" && (
                <button type="button" disabled={busy} onClick={() => void closeOut()} className="hit-task min-w-task flex-1 rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-4 font-bold text-white brutal-interactive disabled:opacity-50 md:flex-none">
                  {tf("closeOut")}
                </button>
              )}
              {(PUNCH_ITEM_STATUS_TRANSITIONS[item.status] as readonly PunchStatus[])
                .filter((n) => n !== "closed")
                .map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={busy}
                    onClick={() => void transition(next)}
                    className="hit-task flex-1 rounded-lg border-3 border-ink bg-white px-3 font-bold text-navy-900 brutal-interactive disabled:opacity-50 md:flex-none"
                  >
                    {statusLabel(next)}
                  </button>
                ))}
            </div>

            <section className="mt-6">
              <h3 className="mb-1.5 text-sm font-semibold text-navy-800">{t("distribution")}</h3>
              {item.distribution.filter((d) => d.userId).length === 0 ? (
                <p className="mb-4 text-sm text-navy-600">{t("noDistribution")}</p>
              ) : (
                <ul className="mb-4 flex flex-wrap gap-2">
                  {item.distribution
                    .filter((d) => d.userId)
                    .map((d) => (
                      <li key={d.id} className="rounded-lg border-3 border-ink bg-white px-2.5 py-1.5 text-sm text-navy-800">
                        {memberName(d.userId)}
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="mt-6">
              <ul className="flex flex-col gap-2 text-sm text-navy-700">
                {item.history.map((h) => (
                  <li key={h.id}>
                    {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ""}
                    {statusLabel(h.toStatus)}
                    {h.note ? ` — ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            </section>

            <RecordHistory projectId={params.id} entityType="punch_item" entityId={item.id} />
          </>
        )}
      </main>
    </>
  );
}
