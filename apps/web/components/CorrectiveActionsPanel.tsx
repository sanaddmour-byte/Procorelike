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
}

interface Member {
  userId: string;
  name: string;
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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">{t("title")}</h2>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-semibold text-navy-800"
        >
          {t("newAction")}
        </button>
      </div>
      {error && <p className="text-sm text-maroon-700">{error}</p>}

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
