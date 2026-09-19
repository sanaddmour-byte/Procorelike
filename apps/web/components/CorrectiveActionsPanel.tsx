"use client";

import { apiJson } from "@/lib/api-client";
import type { CorrectiveActionStatus } from "@siteops/shared";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

interface CorrectiveAction {
  id: string;
  description: string;
  assignedToUserId: string;
  dueDate: string;
  status: CorrectiveActionStatus;
  completedAt: string | null;
  verifiedAt: string | null;
  actionPlanId: string | null;
}

interface Member {
  userId: string;
  name: string;
}

interface ActionPlanTemplate {
  id: string;
  name: string;
}

interface ActionPlanTemplateItem {
  id: string;
  description: string;
  defaultDueDays: number | null;
}

interface ActionPlanTemplateDetail extends ActionPlanTemplate {
  items: ActionPlanTemplateItem[];
}

interface PlanItemDraft {
  description: string;
  assignedToUserId: string;
  dueDate: string;
}

function todayPlusDays(days: number | null): string {
  const date = new Date();
  date.setDate(date.getDate() + (days ?? 0));
  return date.toISOString().slice(0, 10);
}

const NEXT_STATUS: Record<CorrectiveActionStatus, CorrectiveActionStatus[]> = {
  open: ["in_progress", "completed"],
  in_progress: ["completed", "open"],
  completed: ["verified", "open"],
  verified: [],
};

/** Procore's Corrective Actions: a trackable, assignable, due-dated action item spawned from a safety incident, observation, or failed inspection -- reused across all three source screens. */
export function CorrectiveActionsPanel({
  projectId,
  sourceType,
  sourceId,
  members,
}: {
  projectId: string;
  sourceType: "safety_incident" | "safety_observation" | "inspection";
  sourceId: string;
  members: Member[];
}) {
  const t = useTranslations("CorrectiveActions");
  const tc = useTranslations("Common");

  const [actions, setActions] = useState<CorrectiveAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  // Guards against an in-flight load() (e.g. the initial mount fetch)
  // resolving *after* a later one (e.g. the refetch right after creating an
  // action) and overwriting fresher state with stale data.
  const loadRequestId = useRef(0);

  const [templates, setTemplates] = useState<ActionPlanTemplate[]>([]);
  const [showApplyPlan, setShowApplyPlan] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planItems, setPlanItems] = useState<PlanItemDraft[]>([]);
  const [applyingPlan, setApplyingPlan] = useState(false);

  function load(): void {
    const requestId = ++loadRequestId.current;
    apiJson<CorrectiveAction[]>(`/corrective-actions?projectId=${projectId}&sourceType=${sourceType}&sourceId=${sourceId}`)
      .then((rows) => {
        if (requestId === loadRequestId.current) setActions(rows);
      })
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    load();
  }, [projectId, sourceType, sourceId]);

  useEffect(() => {
    apiJson<ActionPlanTemplate[]>(`/action-plan-templates?projectId=${projectId}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [projectId]);

  function handleSelectTemplate(templateId: string): void {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setPlanItems([]);
      setPlanName("");
      return;
    }
    apiJson<ActionPlanTemplateDetail>(`/action-plan-templates/${templateId}?projectId=${projectId}`)
      .then((detail) => {
        setPlanName(detail.name);
        setPlanItems(detail.items.map((item) => ({ description: item.description, assignedToUserId: "", dueDate: todayPlusDays(item.defaultDueDays) })));
      })
      .catch(() => setError(tc("errorGeneric")));
  }

  function updatePlanItem(index: number, patch: Partial<PlanItemDraft>): void {
    setPlanItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleApplyPlan(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (planItems.some((item) => !item.assignedToUserId || !item.dueDate)) return;
    setApplyingPlan(true);
    try {
      await apiJson("/action-plans", {
        method: "POST",
        body: JSON.stringify({ projectId, templateId: selectedTemplateId, name: planName, sourceType, sourceId, items: planItems }),
      });
      setShowApplyPlan(false);
      setSelectedTemplateId("");
      setPlanName("");
      setPlanItems([]);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setApplyingPlan(false);
    }
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/corrective-actions", {
        method: "POST",
        body: JSON.stringify({ projectId, sourceType, sourceId, description, assignedToUserId, dueDate }),
      });
      setDescription("");
      setAssignedToUserId("");
      setDueDate("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  async function handleTransition(id: string, toStatus: CorrectiveActionStatus): Promise<void> {
    setTransitioningId(id);
    try {
      await apiJson(`/corrective-actions/${id}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioningId(null);
    }
  }

  function memberName(userId: string): string {
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  function statusLabel(status: CorrectiveActionStatus): string {
    return { open: t("statusOpen"), in_progress: t("statusInProgress"), completed: t("statusCompleted"), verified: t("statusVerified") }[status];
  }

  return (
    <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy-900">{t("title")}</h2>
        <div className="flex gap-2">
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowApplyPlan((s) => !s)}
              className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-semibold text-navy-800"
            >
              {t("applyPlan")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-semibold text-navy-800"
          >
            {t("newAction")}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-maroon-700">{error}</p>}

      {showApplyPlan && (
        <form onSubmit={(e) => void handleApplyPlan(e)} className="mb-3 flex flex-col gap-2 rounded-lg border-2 border-orange-200 bg-white p-3">
          <select
            required
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
          >
            <option value="">{t("selectTemplate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          {selectedTemplateId && (
            <>
              <input
                required
                placeholder={t("planNamePlaceholder")}
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
              />
              <ol className="flex list-decimal flex-col gap-2 ps-4">
                {planItems.map((item, i) => (
                  <li key={i} className="text-sm">
                    <p className="mb-1">{item.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <select
                        required
                        value={item.assignedToUserId}
                        onChange={(e) => updatePlanItem(i, { assignedToUserId: e.target.value })}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-xs"
                      >
                        <option value="">{t("assignTo")}</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        required
                        value={item.dueDate}
                        onChange={(e) => updatePlanItem(i, { dueDate: e.target.value })}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-xs"
                      />
                    </div>
                  </li>
                ))}
              </ol>
              <button
                type="submit"
                disabled={applyingPlan}
                className="self-start rounded-lg border-2 border-ink bg-navy-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {applyingPlan ? tc("saving") : t("applyPlan")}
              </button>
            </>
          )}
        </form>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="mb-3 flex flex-col gap-2 rounded-lg border-2 border-orange-200 bg-white p-3">
          <textarea
            required
            placeholder={t("descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
            rows={2}
          />
          <select
            required
            value={assignedToUserId}
            onChange={(e) => setAssignedToUserId(e.target.value)}
            className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
          >
            <option value="">{t("assignTo")}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-lg border-2 border-ink bg-navy-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {creating ? tc("saving") : t("create")}
          </button>
        </form>
      )}

      {!actions && <p className="text-sm">{tc("loading")}</p>}
      {actions && actions.length === 0 && <p className="text-sm text-navy-600">{t("empty")}</p>}
      <ul className="flex flex-col gap-2">
        {actions?.map((a) => (
          <li key={a.id} className="rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{a.description}</span>
              <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(a.status)}</span>
            </div>
            <p className="mt-1 text-xs text-navy-600">
              {t("assignedTo")}: {memberName(a.assignedToUserId)} · {t("due")}: {a.dueDate.slice(0, 10)}
              {a.actionPlanId && <span className="ms-2 rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">{t("fromPlan")}</span>}
            </p>
            {NEXT_STATUS[a.status].length > 0 && (
              <div className="mt-2 flex gap-2">
                {NEXT_STATUS[a.status].map((next) => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => void handleTransition(a.id, next)}
                    disabled={transitioningId === a.id}
                    className="rounded border-2 border-ink bg-navy-700 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {statusLabel(next)}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
