"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { PUNCH_ITEM_STATUS_TRANSITIONS, type FieldConflict } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link, { type LinkProps } from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PunchStatus = "open" | "ready_for_review" | "approved" | "closed";

interface PunchItemDetail {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: PunchStatus;
  needsReview: boolean;
  conflictData: FieldConflict[] | null;
  history: { id: string; fromStatus: PunchStatus | null; toStatus: PunchStatus; note: string | null; changedAt: string }[];
}

export default function PunchItemDetailPage() {
  const t = useTranslations("PunchList");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const params = useParams<{ id: string; itemId: string }>();

  const [item, setItem] = useState<PunchItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load(): void {
    apiJson<PunchItemDetail>(`/punch-items/${params.itemId}`)
      .then(setItem)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(load, [params.itemId, tc]);

  function statusLabel(status: PunchStatus): string {
    return {
      open: t("statusOpen"),
      ready_for_review: t("statusReadyForReview"),
      approved: t("statusApproved"),
      closed: t("statusClosed"),
    }[status];
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
      setError(err instanceof ApiClientError ? err.code : "unknown_error");
    } finally {
      setBusy(false);
    }
  }

  const backHref = `/${locale}/projects/${params.id}/punch-list` as LinkProps["href"];

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <Link href={backHref} className="text-sm text-slate-600 underline">
          {t("back")}
        </Link>
        {!item && !error && <p className="mt-4">{tc("loading")}</p>}
        {error && <p className="mt-4 text-red-600">{error}</p>}
        {item && (
          <>
            <h1 className="mb-1 mt-2 text-2xl font-semibold">{item.number}</h1>
            <p className="mb-4 text-slate-700">{item.description}</p>

            {item.needsReview && item.conflictData && (
              <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="mb-2 font-medium text-amber-800">{t("conflictBanner")}</p>
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

            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-slate-500">{t("status")}:</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-sm">{statusLabel(item.status)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {PUNCH_ITEM_STATUS_TRANSITIONS[item.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={busy}
                  onClick={() => void transition(next)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                >
                  {t("moveTo")}: {statusLabel(next)}
                </button>
              ))}
            </div>

            <section className="mt-6">
              <ul className="flex flex-col gap-2 text-sm text-slate-600">
                {item.history.map((h) => (
                  <li key={h.id}>
                    {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ""}
                    {statusLabel(h.toStatus)}
                    {h.note ? ` — ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}
