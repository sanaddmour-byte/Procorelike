"use client";

import type { GanttRow } from "@/lib/gantt/types";
import { useTranslations } from "next-intl";

export interface ImpactRow {
  taskId: string;
  name: string;
  beforeFinish: string | null;
  afterFinish: string;
  beforeCritical: boolean;
  afterCritical: boolean;
}

interface Props {
  open: boolean;
  rows: ImpactRow[];
  cycleTaskNames: string[] | null;
  locale: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

/** Phase 11d's "impact preview before commit" requirement -- shown after a drag and before the edit is actually persisted, so a reschedule's ripple effect (and any new dependency cycle) is visible up front. */
export function ImpactPreviewModal({ open, rows, cycleTaskNames, locale, busy, onConfirm, onCancel }: Props) {
  const t = useTranslations("Gantt");
  const tc = useTranslations("Common");
  if (!open) return null;

  const blocked = cycleTaskNames !== null;
  const changed = rows.filter((r) => r.beforeFinish !== r.afterFinish || r.beforeCritical !== r.afterCritical);
  const shown = changed.slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onCancel}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-3 border-ink px-4 py-3">
          <h2 className="text-sm font-bold text-navy-900">{t("impactPreviewTitle")}</h2>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {blocked ? (
            <p className="text-sm text-maroon-700">{t("impactPreviewCycle", { tasks: cycleTaskNames!.join(", ") })}</p>
          ) : changed.length === 0 ? (
            <p className="text-sm text-navy-600">{t("impactPreviewNoChange")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink/20 text-start text-navy-600">
                  <th className="py-1 text-start font-semibold">{t("columnTask")}</th>
                  <th className="py-1 text-start font-semibold">{t("impactPreviewBefore")}</th>
                  <th className="py-1 text-start font-semibold">{t("impactPreviewAfter")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.taskId} className="border-b border-ink/10">
                    <td className="max-w-[160px] truncate py-1 pe-2" title={row.name}>
                      {row.name}
                    </td>
                    <td className={`py-1 pe-2 ${row.beforeCritical ? "text-maroon-700" : "text-navy-700"}`}>{formatDate(row.beforeFinish, locale)}</td>
                    <td className={`py-1 ${row.afterCritical ? "text-maroon-700" : "text-navy-700"}`}>{formatDate(row.afterFinish, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {changed.length > shown.length && (
            <p className="mt-2 text-xs text-navy-600">{t("impactPreviewMore", { count: changed.length - shown.length })}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t-3 border-ink px-4 py-3">
          <button type="button" onClick={onCancel} className="rounded-lg border-3 border-ink px-3 py-1.5 text-xs font-semibold text-navy-800">
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blocked || busy}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? tc("saving") : t("impactPreviewConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Builds the before/after rows the modal renders, from the rows currently on screen and the preview endpoint's CpmResult. */
export function buildImpactRows(rows: GanttRow[], previewTasks: { id: string; earlyFinish: string; isCritical: boolean }[]): ImpactRow[] {
  const previewById = new Map(previewTasks.map((t) => [t.id, t]));
  const result: ImpactRow[] = [];
  for (const row of rows) {
    const preview = previewById.get(row.id);
    if (!preview || !preview.earlyFinish) continue;
    result.push({
      taskId: row.id,
      name: row.name,
      beforeFinish: row.plannedFinish ?? row.earlyFinish,
      afterFinish: preview.earlyFinish,
      beforeCritical: row.isCritical,
      afterCritical: preview.isCritical,
    });
  }
  return result;
}
