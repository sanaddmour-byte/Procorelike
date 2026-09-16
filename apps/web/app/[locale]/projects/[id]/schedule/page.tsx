"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { ScheduleTaskStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ScheduleTask {
  id: string;
  name: string;
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

export default function SchedulePage() {
  const t = useTranslations("Schedule");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [tasks, setTasks] = useState<ScheduleTask[] | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignedCompanyId, setAssignedCompanyId] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<ScheduleTask[]>(`/schedule-tasks?projectId=${params.id}`)
      .then(setTasks)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string | null): string {
    if (!id) return t("unassigned");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/schedule-tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          name,
          description: description || undefined,
          startDate,
          endDate,
          assignedCompanyId: assignedCompanyId || undefined,
        }),
      });
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setAssignedCompanyId("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("name")}
              <input required value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={2}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("startDate")}
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("endDate")}
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t("assignedCompany")}
              <select
                value={assignedCompanyId}
                onChange={(e) => setAssignedCompanyId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
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
        {!tasks && !error && <p>{tc("loading")}</p>}
        {tasks && tasks.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {tasks?.map((task) => (
            <li key={task.id}>
              <Link
                href={`/${locale}/projects/${params.id}/schedule/${task.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{task.name}</span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {statusLabel(task.status, t)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {task.startDate.slice(0, 10)} – {task.endDate.slice(0, 10)} · {companyName(task.assignedCompanyId)}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-ink/30 bg-cream shadow-brutal-inset">
                  <div className="h-full bg-gradient-to-r from-navy-500 to-navy-700" style={{ width: `${task.percentComplete}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
