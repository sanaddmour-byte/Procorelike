"use client";

import { apiJson } from "@/lib/api-client";
import { ManpowerEditor } from "@/components/ManpowerEditor";
import { ErrorState } from "@/components/ui/ErrorState";
import { errorMessage } from "@/lib/error-message";
import { useLocale, useTranslations } from "next-intl";
import Link, { type LinkProps } from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface ManpowerRow {
  id: string;
  companyId: string;
  tradeId: string;
  headcount: number;
  hours: string;
}

interface DailyLogDetail {
  id: string;
  logDate: string;
  notes: string | null;
  lockedAt: string | null;
  createdBy: string;
  manpower: ManpowerRow[];
}

export default function DailyLogDetailPage() {
  const t = useTranslations("DailyLog");
  const te = useTranslations("Errors");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const params = useParams<{ id: string; logId: string }>();

  const [log, setLog] = useState<DailyLogDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<DailyLogDetail>(`/daily-logs/${params.logId}`)
      .then((data) => {
        setLog(data);
        setNotes(data.notes ?? "");
      })
      .catch((err) => setError(errorMessage(err, te)));
  }, [params.logId, tc]);

  async function saveNotes(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiJson<DailyLogDetail>(`/daily-logs/${params.logId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      setLog((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock(locked: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiJson<DailyLogDetail>(`/daily-logs/${params.logId}`, {
        method: "PATCH",
        body: JSON.stringify({ locked }),
      });
      setLog((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  const backHref = `/${locale}/projects/${params.id}/daily-log` as LinkProps["href"];

  return (
    <>
      <main className="mx-auto max-w-lg px-0 py-2 sm:px-4 sm:py-8">
        <Link href={backHref} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        {!log && !error && <p className="mt-4">{tc("loading")}</p>}
        {error && <ErrorState message={error} retryLabel={tc("retry")} onRetry={() => window.location.reload()} />}
        {log && (
          <>
            <div className="mb-4 mt-2 flex items-center justify-between">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{formatDate(log.logDate)}</h1>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  log.lockedAt ? "bg-navy-900 text-white" : "bg-orange-100 text-navy-800"
                }`}
              >
                {log.lockedAt ? t("locked") : t("open")}
              </span>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              {t("notes")}
              <textarea
                rows={6}
                value={notes}
                disabled={!!log.lockedAt}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2 disabled:bg-orange-50"
              />
            </label>

            <div className="mt-3 flex gap-2">
              {!log.lockedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveNotes()}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {t("save")}
                </button>
              )}
              {!log.lockedAt ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleLock(true)}
                  className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800"
                >
                  {t("lockButton")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleLock(false)}
                  className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800"
                >
                  {t("reopenButton")}
                </button>
              )}
            </div>

            <ManpowerEditor projectId={params.id} logId={params.logId} rows={log.manpower} locked={!!log.lockedAt} onChange={(manpower) => setLog((prev) => (prev ? { ...prev, manpower } : prev))} />
          </>
        )}
      </main>
    </>
  );
}
