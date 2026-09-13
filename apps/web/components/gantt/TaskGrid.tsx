"use client";

import { GRID_WIDTH, HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/gantt/constants";
import type { GanttRow } from "@/lib/gantt/types";
import { useTranslations } from "next-intl";
import { List, useListRef, type RowComponentProps } from "react-window";
import { forwardRef, useEffect, useImperativeHandle } from "react";

export { ROW_HEIGHT };

interface RowProps {
  rows: GanttRow[];
  onToggleCollapse: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  locale: string;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function TaskGridRow({ index, style, rows, onToggleCollapse, selectedId, onSelect, locale }: RowComponentProps<RowProps>) {
  const row = rows[index];
  if (!row) return null;
  const isSelected = row.id === selectedId;

  return (
    <div
      style={style}
      onClick={() => onSelect(row.id)}
      className={`flex items-center gap-2 border-b border-ink/10 px-2 text-xs cursor-pointer ${
        isSelected ? "bg-orange-100" : row.isCritical ? "bg-maroon-50" : "bg-white"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingInlineStart: row.depth * 14 }}>
        {row.hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(row.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ink/30 bg-white text-[10px] leading-none"
            aria-label={row.isCollapsed ? "Expand" : "Collapse"}
          >
            {row.isCollapsed ? "+" : "−"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={`truncate ${row.taskType === "summary" || row.taskType === "wbs" ? "font-semibold" : ""}`} title={row.name}>
          {row.taskType === "milestone" ? "◆ " : ""}
          {row.name}
        </span>
      </div>
      <span className="w-16 shrink-0 whitespace-nowrap text-navy-600">{formatDate(row.plannedStart, locale)}</span>
      <span className="w-16 shrink-0 whitespace-nowrap text-navy-600">{formatDate(row.plannedFinish, locale)}</span>
      <span className="w-10 shrink-0 text-end text-navy-600">{row.percentComplete}%</span>
    </div>
  );
}

export interface TaskGridHandle {
  scrollTop: number;
  element: HTMLDivElement | null;
}

interface TaskGridProps extends RowProps {
  height: number;
  onScroll?: (scrollTop: number) => void;
}

export const TaskGrid = forwardRef<TaskGridHandle, TaskGridProps>(function TaskGrid(
  { rows, height, onScroll, ...rowProps },
  ref,
) {
  const t = useTranslations("Gantt");
  const listRef = useListRef(null);

  useImperativeHandle(ref, () => ({
    get scrollTop() {
      return listRef.current?.element?.scrollTop ?? 0;
    },
    get element() {
      return listRef.current?.element ?? null;
    },
  }));

  useEffect(() => {
    const el = listRef.current?.element;
    if (!el || !onScroll) return;
    const handler = () => onScroll(el.scrollTop);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [onScroll]);

  return (
    <div className="border-e-3 border-ink" style={{ width: GRID_WIDTH }}>
      <div
        className="flex items-center gap-2 border-b-3 border-ink bg-cream px-2 text-[11px] font-semibold text-navy-800"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="flex-1">{t("columnTask")}</span>
        <span className="w-16 shrink-0">{t("columnStart")}</span>
        <span className="w-16 shrink-0">{t("columnFinish")}</span>
        <span className="w-10 shrink-0 text-end">{t("columnPercent")}</span>
      </div>
      <List<RowProps>
        listRef={listRef}
        rowComponent={TaskGridRow}
        rowCount={rows.length}
        rowHeight={ROW_HEIGHT}
        rowProps={{ rows, ...rowProps }}
        style={{ height }}
      />
    </div>
  );
});
