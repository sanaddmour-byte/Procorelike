"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { SCHEDULE_TASK_STATUS_TRANSITIONS, type ScheduleTaskStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ScheduleTaskDetail {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: ScheduleTaskStatus;
  percentComplete: number;
  startDate: string;
  endDate: string;
  assignedCompanyId: string | null;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

function statusLabel(status: ScheduleTaskStatus, t: (key: string) => string): string {
  return {
    not_started: t("statusNotStarted"),
    in_progress: t("statusInProgress"),
    complete: t("statusComplete"),
    delayed: t("statusDelayed"),
  }[status];
}

export default function ScheduleTaskDetailScreen() {
  const t = useTranslations("Schedule");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; taskId: string }>();

  const [task, setTask] = useState<ScheduleTaskDetail | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [percentComplete, setPercentComplete] = useState(0);
  const [savingPercent, setSavingPercent] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiJson<ScheduleTaskDetail[]>(`/schedule-tasks?projectId=${params.id}`);
      const detail = rows.find((r) => r.id === params.taskId) ?? null;
      setTask(detail);
      if (detail) setPercentComplete(detail.percentComplete);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.id, params.taskId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function companyName(id: string | null): string {
    if (!id) return t("unassigned");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleSavePercent(): Promise<void> {
    setSavingPercent(true);
    try {
      await apiJson(`/schedule-tasks/${params.taskId}`, { method: "PATCH", body: JSON.stringify({ percentComplete }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSavingPercent(false);
    }
  }

  async function handleTransition(toStatus: ScheduleTaskStatus): Promise<void> {
    setTransitioning(true);
    try {
      await apiJson(`/schedule-tasks/${params.taskId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  if (!task) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/schedule`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>

        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-navy-900">{task.name}</h1>
        <p className="mb-4 text-sm text-navy-600">
          {statusLabel(task.status, t)} · {task.startDate.slice(0, 10)} – {task.endDate.slice(0, 10)} · {companyName(task.assignedCompanyId)}
        </p>
        {error && <p className="text-maroon-700">{error}</p>}

        {task.description && (
          <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <p className="whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <label className="flex flex-col gap-2 text-sm">
            {t("percentComplete")}
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={percentComplete}
                onChange={(e) => setPercentComplete(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-right font-medium">{percentComplete}%</span>
            </div>
          </label>
          <button
            onClick={() => void handleSavePercent()}
            disabled={savingPercent || percentComplete === task.percentComplete}
            className="mt-3 rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>

        {SCHEDULE_TASK_STATUS_TRANSITIONS[task.status].length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm text-navy-600">{t("moveTo")}</p>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_TASK_STATUS_TRANSITIONS[task.status].map((next) => (
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
      </main>
    </>
  );
}
