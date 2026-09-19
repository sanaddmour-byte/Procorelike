"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface ScheduleTaskLite {
  id: string;
  name: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  percentComplete: number;
}

interface LookaheadViewGroup {
  companyId: string | null;
  taskIds: string[];
}

interface LookaheadView {
  weekStart: string;
  horizonWeeks: number;
  taskIds: string[];
  groupedByCompany: LookaheadViewGroup[];
}

interface LookaheadPlan {
  id: string;
  weekStart: string;
  horizonWeeks: number;
  publishedAt: string | null;
}

interface Commitment {
  id: string;
  lookaheadPlanId: string;
  taskId: string;
  promisedFinish: string;
  committedByCompanyId: string;
  status: "promised" | "confirmed" | "declined";
  actualFinish: string | null;
  reasonCode: string | null;
}

interface CompanyPpc {
  companyId: string;
  met: number;
  missed: number;
  pending: number;
  ppcPercent: number | null;
}

type ConstraintCategory = "design" | "material" | "permit" | "access" | "labour" | "prerequisite" | "other";

interface ScheduleConstraint {
  id: string;
  taskId: string;
  category: ConstraintCategory;
  description: string;
  needByDate: string;
  status: "open" | "cleared";
}

interface DelayRegisterEntry {
  taskId: string;
  taskName: string;
  totalHoursImpact: number;
  entryCount: number;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

const CONSTRAINT_CATEGORIES: ConstraintCategory[] = ["design", "material", "permit", "access", "labour", "prerequisite", "other"];

const CONSTRAINT_STATUS_TONE: Record<ScheduleConstraint["status"], StatusTone> = {
  open: "warning",
  cleared: "success",
};

const COMMITMENT_STATUS_TONE: Record<Commitment["status"], StatusTone> = {
  promised: "neutral",
  confirmed: "success",
  declined: "danger",
};

export default function LookaheadPage() {
  const t = useTranslations("Lookahead");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [horizonWeeks, setHorizonWeeks] = useState(3);
  const [view, setView] = useState<LookaheadView | null>(null);
  const [tasksById, setTasksById] = useState<Map<string, ScheduleTaskLite>>(new Map());
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [plans, setPlans] = useState<LookaheadPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [ppc, setPpc] = useState<CompanyPpc[]>([]);
  const [constraints, setConstraints] = useState<ScheduleConstraint[]>([]);
  const [delays, setDelays] = useState<DelayRegisterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [constraintTaskId, setConstraintTaskId] = useState("");
  const [constraintCategory, setConstraintCategory] = useState<ConstraintCategory>("material");
  const [constraintDescription, setConstraintDescription] = useState("");
  const [constraintNeedBy, setConstraintNeedBy] = useState("");

  const [commitmentTaskId, setCommitmentTaskId] = useState("");
  const [commitmentCompanyId, setCommitmentCompanyId] = useState("");
  const [commitmentPromisedFinish, setCommitmentPromisedFinish] = useState("");

  const [progressTaskId, setProgressTaskId] = useState("");
  const [progressPercent, setProgressPercent] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [progressSubmitted, setProgressSubmitted] = useState(false);

  function companyName(id: string | null): string {
    if (!id) return t("unassignedCompany");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  function taskName(id: string): string {
    return tasksById.get(id)?.name ?? id;
  }

  function loadView(): void {
    setLoading(true);
    setError(null);
    apiJson<LookaheadView>(`/lookahead/view?projectId=${params.id}&weekStart=${weekStart}&horizonWeeks=${horizonWeeks}`)
      .then(setView)
      .catch(() => setError(tc("errorGeneric")))
      .finally(() => setLoading(false));
  }

  function loadConstraints(): void {
    apiJson<ScheduleConstraint[]>(`/schedule-constraints?projectId=${params.id}`).then(setConstraints).catch(() => undefined);
  }

  function loadDelays(): void {
    apiJson<DelayRegisterEntry[]>(`/lookahead/delays?projectId=${params.id}`).then(setDelays).catch(() => undefined);
  }

  function loadPlans(): void {
    apiJson<LookaheadPlan[]>(`/lookahead/plans?projectId=${params.id}`).then((rows) => {
      setPlans(rows);
      if (!selectedPlanId && rows.length > 0) setSelectedPlanId(rows[rows.length - 1]!.id);
    });
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<{ tasks: ScheduleTaskLite[] }>(`/schedules/current?projectId=${params.id}`)
      .then((res) => setTasksById(new Map(res.tasks.map((task) => [task.id, task]))))
      .catch(() => undefined);
    apiJson<ProjectCompany[]>(`/lookahead/companies?projectId=${params.id}`).then(setCompanies).catch(() => undefined);
    loadPlans();
    loadConstraints();
    loadDelays();
  }, [router, locale, params.id]);

  useEffect(() => {
    loadView();
  }, [weekStart, horizonWeeks, params.id]);

  useEffect(() => {
    if (!selectedPlanId) {
      setCommitments([]);
      setPpc([]);
      return;
    }
    apiJson<Commitment[]>(`/lookahead/plans/${selectedPlanId}/commitments`).then(setCommitments).catch(() => undefined);
    apiJson<CompanyPpc[]>(`/lookahead/plans/${selectedPlanId}/ppc`).then(setPpc).catch(() => undefined);
  }, [selectedPlanId]);

  const viewTaskIds = useMemo(() => view?.taskIds ?? [], [view]);

  async function handlePublishPlan(): Promise<void> {
    try {
      const plan = await apiJson<LookaheadPlan>("/lookahead/plans", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, weekStart, horizonWeeks }),
      });
      setPlans((prev) => [...prev, plan]);
      setSelectedPlanId(plan.id);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleCreateConstraint(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await apiJson("/schedule-constraints", {
        method: "POST",
        body: JSON.stringify({ taskId: constraintTaskId, category: constraintCategory, description: constraintDescription, needByDate: constraintNeedBy }),
      });
      setConstraintTaskId("");
      setConstraintDescription("");
      setConstraintNeedBy("");
      loadConstraints();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleClearConstraint(id: string): Promise<void> {
    try {
      await apiJson(`/schedule-constraints/${id}/clear`, { method: "POST" });
      loadConstraints();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleCreateCommitment(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedPlanId) return;
    try {
      const commitment = await apiJson<Commitment>("/lookahead/commitments", {
        method: "POST",
        body: JSON.stringify({
          lookaheadPlanId: selectedPlanId,
          taskId: commitmentTaskId,
          promisedFinish: commitmentPromisedFinish,
          committedByCompanyId: commitmentCompanyId,
        }),
      });
      setCommitments((prev) => [...prev, commitment]);
      setCommitmentTaskId("");
      setCommitmentPromisedFinish("");
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleCommitmentAction(id: string, action: "confirm" | "decline"): Promise<void> {
    try {
      const updated = await apiJson<Commitment>(`/lookahead/commitments/${id}/${action}`, { method: "POST" });
      setCommitments((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setError(t("notYourCompany"));
      } else {
        setError(tc("errorGeneric"));
      }
    }
  }

  async function handleSubmitProgress(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await apiJson("/schedule-progress-updates", {
        method: "POST",
        body: JSON.stringify({
          taskId: progressTaskId,
          proposedPercentComplete: progressPercent ? Number(progressPercent) : undefined,
          note: progressNote || undefined,
        }),
      });
      setProgressTaskId("");
      setProgressPercent("");
      setProgressNote("");
      setProgressSubmitted(true);
      setTimeout(() => setProgressSubmitted(false), 4000);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader title={t("title")} />

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm">
          <label className="flex flex-col gap-1 text-sm">
            {t("weekStart")}
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("horizonWeeks")}
            <select
              value={horizonWeeks}
              onChange={(e) => setHorizonWeeks(Number(e.target.value))}
              className="rounded-lg border-3 border-ink px-3 py-2"
            >
              <option value={3}>{t("horizon3")}</option>
              <option value={6}>{t("horizon6")}</option>
            </select>
          </label>
          <button
            onClick={() => void handlePublishPlan()}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("publishPlan")}
          </button>
        </div>

        {error && <p className="mb-4 text-maroon-700">{error}</p>}
        {loading && <p>{tc("loading")}</p>}

        {view && (
          <section className="mb-6 rounded-xl border-3 border-ink bg-white shadow-brutal-sm">
            <h2 className="border-b-3 border-ink bg-cream px-4 py-2 font-bold text-navy-900">{t("windowTasks")}</h2>
            {view.groupedByCompany.length === 0 ? (
              <p className="p-4 text-navy-600">{t("noTasksInWindow")}</p>
            ) : (
              view.groupedByCompany.map((group) => (
                <div key={group.companyId ?? "none"} className="border-b border-ink/10 px-4 py-3 last:border-b-0">
                  <p className="mb-2 text-sm font-semibold text-navy-800">{companyName(group.companyId)}</p>
                  <ul className="flex flex-col gap-1">
                    {group.taskIds.map((id) => {
                      const task = tasksById.get(id);
                      return (
                        <li key={id} className="flex items-center justify-between text-sm text-navy-700">
                          <span>{task?.name ?? id}</span>
                          <span className="text-navy-500">{task?.percentComplete ?? 0}%</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        )}

        <section className="mb-6 rounded-xl border-3 border-ink bg-white shadow-brutal-sm">
          <h2 className="border-b-3 border-ink bg-cream px-4 py-2 font-bold text-navy-900">{t("constraintsTitle")}</h2>
          <form onSubmit={(e) => void handleCreateConstraint(e)} className="flex flex-wrap gap-2 border-b border-ink/10 p-4">
            <select value={constraintTaskId} onChange={(e) => setConstraintTaskId(e.target.value)} required className="rounded-lg border-3 border-ink px-2 py-1 text-sm">
              <option value="">{t("selectTask")}</option>
              {viewTaskIds.map((id) => (
                <option key={id} value={id}>
                  {taskName(id)}
                </option>
              ))}
            </select>
            <select
              value={constraintCategory}
              onChange={(e) => setConstraintCategory(e.target.value as ConstraintCategory)}
              className="rounded-lg border-3 border-ink px-2 py-1 text-sm"
            >
              {CONSTRAINT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`category_${cat}`)}
                </option>
              ))}
            </select>
            <input
              value={constraintDescription}
              onChange={(e) => setConstraintDescription(e.target.value)}
              placeholder={t("description")}
              required
              className="min-w-[12rem] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={constraintNeedBy}
              onChange={(e) => setConstraintNeedBy(e.target.value)}
              required
              className="rounded-lg border-3 border-ink px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-lg border-3 border-ink bg-white px-3 py-1 text-sm text-navy-800 brutal-interactive">
              {t("addConstraint")}
            </button>
          </form>
          {constraints.length === 0 ? (
            <p className="p-4 text-navy-600">{t("noConstraints")}</p>
          ) : (
            <ul className="flex flex-col">
              {constraints.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-2 text-sm last:border-b-0">
                  <div>
                    <span className="font-medium">{taskName(c.taskId)}</span>
                    <span className="mx-2 text-navy-500">·</span>
                    <span className="text-navy-600">{t(`category_${c.category}`)}</span>
                    <span className="mx-2 text-navy-500">·</span>
                    <span>{c.description}</span>
                    <span className="ml-2 text-xs text-navy-500">{t("needBy")} {c.needByDate.slice(0, 10)}</span>
                  </div>
                  {c.status === "open" ? (
                    <button onClick={() => void handleClearConstraint(c.id)} className="whitespace-nowrap rounded bg-orange-100 px-2 py-1 text-xs text-navy-800">
                      {t("clear")}
                    </button>
                  ) : (
                    <StatusBadge tone={CONSTRAINT_STATUS_TONE[c.status]} label={t("cleared")} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6 rounded-xl border-3 border-ink bg-white shadow-brutal-sm">
          <h2 className="border-b-3 border-ink bg-cream px-4 py-2 font-bold text-navy-900">{t("commitmentsTitle")}</h2>
          <div className="border-b border-ink/10 p-4">
            <select value={selectedPlanId ?? ""} onChange={(e) => setSelectedPlanId(e.target.value || null)} className="rounded-lg border-3 border-ink px-2 py-1 text-sm">
              <option value="">{t("selectPlan")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.weekStart.slice(0, 10)} · {plan.horizonWeeks}w
                </option>
              ))}
            </select>
          </div>
          {selectedPlanId && (
            <>
              <form onSubmit={(e) => void handleCreateCommitment(e)} className="flex flex-wrap gap-2 border-b border-ink/10 p-4">
                <select value={commitmentTaskId} onChange={(e) => setCommitmentTaskId(e.target.value)} required className="rounded-lg border-3 border-ink px-2 py-1 text-sm">
                  <option value="">{t("selectTask")}</option>
                  {viewTaskIds.map((id) => (
                    <option key={id} value={id}>
                      {taskName(id)}
                    </option>
                  ))}
                </select>
                <select
                  value={commitmentCompanyId}
                  onChange={(e) => setCommitmentCompanyId(e.target.value)}
                  required
                  className="rounded-lg border-3 border-ink px-2 py-1 text-sm"
                >
                  <option value="">{t("selectCompany")}</option>
                  {companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={commitmentPromisedFinish}
                  onChange={(e) => setCommitmentPromisedFinish(e.target.value)}
                  required
                  className="rounded-lg border-3 border-ink px-2 py-1 text-sm"
                />
                <button type="submit" className="rounded-lg border-3 border-ink bg-white px-3 py-1 text-sm text-navy-800 brutal-interactive">
                  {t("addCommitment")}
                </button>
              </form>
              {commitments.length === 0 ? (
                <p className="p-4 text-navy-600">{t("noCommitments")}</p>
              ) : (
                <ul className="flex flex-col border-b border-ink/10">
                  {commitments.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-2 text-sm last:border-b-0">
                      <div>
                        <span className="font-medium">{taskName(c.taskId)}</span>
                        <span className="mx-2 text-navy-500">·</span>
                        <span>{companyName(c.committedByCompanyId)}</span>
                        <span className="mx-2 text-navy-500">·</span>
                        <span className="text-navy-600">{t("promisedFinish")} {c.promisedFinish.slice(0, 10)}</span>
                        {c.actualFinish && <span className="ml-2 text-navy-600">→ {c.actualFinish.slice(0, 10)}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={COMMITMENT_STATUS_TONE[c.status]} label={t(`commitmentStatus_${c.status}`)} />
                        {c.status === "promised" && (
                          <>
                            <button onClick={() => void handleCommitmentAction(c.id, "confirm")} className="rounded bg-navy-100 px-2 py-1 text-xs text-navy-800">
                              {t("confirm")}
                            </button>
                            <button onClick={() => void handleCommitmentAction(c.id, "decline")} className="rounded bg-maroon-100 px-2 py-1 text-xs text-maroon-800">
                              {t("decline")}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy-800">{t("ppcTitle")}</h3>
                {ppc.length === 0 ? (
                  <p className="text-sm text-navy-600">{t("noPpcData")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-start text-navy-600">
                        <th className="pb-1 text-start">{t("company")}</th>
                        <th className="pb-1 text-end">{t("ppcMet")}</th>
                        <th className="pb-1 text-end">{t("ppcMissed")}</th>
                        <th className="pb-1 text-end">{t("ppcPercent")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ppc.map((row) => (
                        <tr key={row.companyId} className="border-t border-ink/10">
                          <td className="py-1">{companyName(row.companyId)}</td>
                          <td className="py-1 text-end">{row.met}</td>
                          <td className="py-1 text-end">{row.missed}</td>
                          <td className="py-1 text-end font-semibold">{row.ppcPercent ?? "—"}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </section>

        <section className="mb-6 rounded-xl border-3 border-ink bg-white shadow-brutal-sm">
          <h2 className="border-b-3 border-ink bg-cream px-4 py-2 font-bold text-navy-900">{t("submitProgressTitle")}</h2>
          <form onSubmit={(e) => void handleSubmitProgress(e)} className="flex flex-wrap items-end gap-2 p-4">
            <select value={progressTaskId} onChange={(e) => setProgressTaskId(e.target.value)} required className="rounded-lg border-3 border-ink px-2 py-1 text-sm">
              <option value="">{t("selectTask")}</option>
              {viewTaskIds.map((id) => (
                <option key={id} value={id}>
                  {taskName(id)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={progressPercent}
              onChange={(e) => setProgressPercent(e.target.value)}
              placeholder={t("percentComplete")}
              className="w-24 rounded-lg border-3 border-ink px-2 py-1 text-sm"
            />
            <input
              value={progressNote}
              onChange={(e) => setProgressNote(e.target.value)}
              placeholder={t("note")}
              className="min-w-[12rem] flex-1 rounded-lg border-3 border-ink px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1 text-sm text-white">
              {t("submit")}
            </button>
          </form>
          {progressSubmitted && <p className="px-4 pb-3 text-sm text-navy-600">{t("submittedPendingReview")}</p>}
        </section>

        <section className="rounded-xl border-3 border-ink bg-white shadow-brutal-sm">
          <h2 className="border-b-3 border-ink bg-cream px-4 py-2 font-bold text-navy-900">{t("delayRegisterTitle")}</h2>
          {delays.length === 0 ? (
            <p className="p-4 text-navy-600">{t("noDelays")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-navy-600">
                  <th className="px-4 pb-1 pt-3 text-start">{t("task")}</th>
                  <th className="px-4 pb-1 pt-3 text-end">{t("hoursImpact")}</th>
                  <th className="px-4 pb-1 pt-3 text-end">{t("entries")}</th>
                </tr>
              </thead>
              <tbody>
                {delays.map((d) => (
                  <tr key={d.taskId} className="border-t border-ink/10">
                    <td className="px-4 py-2">{d.taskName}</td>
                    <td className="px-4 py-2 text-end">{d.totalHoursImpact}</td>
                    <td className="px-4 py-2 text-end">{d.entryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
