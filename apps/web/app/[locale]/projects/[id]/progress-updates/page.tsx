"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ProgressUpdate {
  id: string;
  taskId: string;
  proposedPercentComplete: number | null;
  proposedActualStart: string | null;
  proposedActualFinish: string | null;
  note: string | null;
  status: "pending" | "accepted" | "rejected";
}

interface ScheduleTaskLite {
  id: string;
  name: string;
}

export default function ProgressUpdatesPage() {
  const t = useTranslations("ProgressUpdates");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [updates, setUpdates] = useState<ProgressUpdate[] | null>(null);
  const [tasksById, setTasksById] = useState<Map<string, ScheduleTaskLite>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  function load(): void {
    apiJson<ProgressUpdate[]>(`/schedule-progress-updates?projectId=${params.id}`)
      .then(setUpdates)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<{ tasks: ScheduleTaskLite[] }>(`/schedules/current?projectId=${params.id}`)
      .then((res) => setTasksById(new Map(res.tasks.map((task) => [task.id, task]))))
      .catch(() => undefined);
  }, [router, locale, params.id]);

  async function handleAccept(id: string): Promise<void> {
    try {
      await apiJson(`/schedule-progress-updates/${id}/accept`, { method: "POST" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleReject(id: string): Promise<void> {
    try {
      await apiJson(`/schedule-progress-updates/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason }),
      });
      setRejectingId(null);
      setRejectionReason("");
      load();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="mb-4 text-sm text-navy-600">{t("subtitle")}</p>

        {error && <p className="mb-4 text-maroon-700">{error}</p>}
        {!updates && !error && <p>{tc("loading")}</p>}
        {updates && updates.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {updates?.map((u) => (
            <li key={u.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-navy-900">{tasksById.get(u.taskId)?.name ?? u.taskId}</span>
              </div>
              {u.proposedPercentComplete !== null && (
                <p className="text-sm text-navy-700">
                  {t("proposedPercent")}: <strong>{u.proposedPercentComplete}%</strong>
                </p>
              )}
              {u.proposedActualStart && (
                <p className="text-sm text-navy-700">
                  {t("proposedActualStart")}: {u.proposedActualStart.slice(0, 10)}
                </p>
              )}
              {u.proposedActualFinish && (
                <p className="text-sm text-navy-700">
                  {t("proposedActualFinish")}: {u.proposedActualFinish.slice(0, 10)}
                </p>
              )}
              {u.note && <p className="mt-1 text-sm italic text-navy-600">&ldquo;{u.note}&rdquo;</p>}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void handleAccept(u.id)}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white"
                >
                  {t("accept")}
                </button>
                {rejectingId === u.id ? (
                  <>
                    <input
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder={t("rejectionReason")}
                      className="min-w-[10rem] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
                    />
                    <button onClick={() => void handleReject(u.id)} className="rounded-lg border-3 border-ink bg-white px-3 py-1.5 text-sm text-navy-800">
                      {t("confirmReject")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setRejectingId(u.id)}
                    className="rounded-lg border-3 border-ink bg-white px-3 py-1.5 text-sm text-navy-800 brutal-interactive"
                  >
                    {t("reject")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
