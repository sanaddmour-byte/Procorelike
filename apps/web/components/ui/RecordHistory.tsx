"use client";

import { apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  createdAt: string;
}

interface Props {
  projectId: string;
  entityType: "rfi" | "punch_item";
  entityId: string;
}

function actionLabel(action: string, t: (key: string) => string): string {
  if (action === "create") return t("action_create");
  if (action === "delete") return t("action_delete");
  return t("action_update");
}

/** A per-record change history, expandable rather than always visible — most records are read a lot more often than their history is checked. */
export function RecordHistory({ projectId, entityType, entityId }: Props) {
  const t = useTranslations("RecordHistory");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    if (!expanded || entries !== null) return;
    apiJson<AuditLogEntry[]>(`/projects/${projectId}/history?entityType=${entityType}&entityId=${entityId}`)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [expanded, entries, projectId, entityType, entityId]);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="rounded-lg border-3 border-ink bg-white px-3 py-1.5 text-xs font-semibold text-navy-800"
      >
        {t("toggle")}
      </button>
      {expanded && (
        <div className="mt-2 rounded-xl border-3 border-ink bg-cream p-3">
          {!entries && <p className="text-xs text-navy-600">…</p>}
          {entries && entries.length === 0 && <p className="text-xs text-navy-600">{t("empty")}</p>}
          {entries && entries.length > 0 && (
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => (
                <li key={entry.id} className="text-xs text-navy-700">
                  {new Date(entry.createdAt).toLocaleString(locale)} — {actionLabel(entry.action, t)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
