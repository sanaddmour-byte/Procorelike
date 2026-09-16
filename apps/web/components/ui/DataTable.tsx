"use client";

import { useMemo, useState, type ReactNode } from "react";
import { List, type RowComponentProps } from "react-window";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Enables click-to-sort on this column (client-side, ascending/descending toggle). Omit for a non-sortable column. */
  sortValue?: (row: T) => string | number;
  /** CSS grid track size, e.g. "1fr", "140px". Defaults to "1fr". */
  width?: string;
  align?: "start" | "end";
}

interface RowProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  onRowClick?: (row: T) => void;
  gridTemplate: string;
}

function DataTableRow<T>({ index, style, rows, columns, onRowClick, gridTemplate }: RowComponentProps<RowProps<T>>) {
  const row = rows[index];
  if (!row) return null;
  return (
    <div
      style={{ ...style, gridTemplateColumns: gridTemplate }}
      onClick={() => onRowClick?.(row)}
      role="row"
      className={`grid items-center gap-3 border-b border-navy-100 px-3 text-sm ${onRowClick ? "cursor-pointer hover:bg-orange-50" : ""} ${
        index % 2 === 1 ? "bg-cream/50" : "bg-white"
      }`}
    >
      {columns.map((col) => (
        <div key={col.key} role="cell" className={`truncate ${col.align === "end" ? "text-end" : ""}`}>
          {col.render(row)}
        </div>
      ))}
    </div>
  );
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  /** null = loading. */
  rows: T[] | null;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowHeight?: number;
  maxHeight?: number;
}

/**
 * The one reusable enterprise table: sticky compact header, click-to-sort,
 * hover + zebra rows, and windowed rendering via react-window (the same
 * library and pattern the Gantt task grid already uses) so a
 * thousand-plus-row register scrolls smoothly instead of hanging the
 * page the way a plain `.map()` over `<li>` cards did before. Column
 * resize, visibility toggles, and bulk row selection are deliberately
 * not in this first pass -- flagged as follow-up, not silently dropped.
 */
export function DataTable<T>({ columns, rows, error, onRetry, onRowClick, emptyTitle, emptyDescription, emptyAction, rowHeight = 40, maxHeight = 600 }: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const gridTemplate = columns.map((c) => c.width ?? "1fr").join(" ");

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    const col = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
    if (!col?.sortValue) return rows;
    const withValues = rows.map((row) => ({ row, value: col.sortValue!(row) }));
    withValues.sort((a, b) => {
      if (a.value < b.value) return sortDir === "asc" ? -1 : 1;
      if (a.value > b.value) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return withValues.map((w) => w.row);
  }, [rows, sortKey, sortDir, columns]);

  function handleSort(col: DataTableColumn<T>): void {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows) return <LoadingState rows={6} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  return (
    <div role="table" aria-rowcount={rows.length} className="overflow-hidden rounded-xl border-3 border-ink shadow-brutal-sm">
      <div role="row" className="grid items-center gap-3 border-b-3 border-ink bg-cream px-3 text-xs font-semibold text-navy-800" style={{ gridTemplateColumns: gridTemplate, height: 36 }}>
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            role="columnheader"
            aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : col.sortValue ? "none" : undefined}
            onClick={() => handleSort(col)}
            disabled={!col.sortValue}
            className={`truncate ${col.align === "end" ? "text-end" : "text-start"} ${col.sortValue ? "cursor-pointer hover:text-maroon-700" : "cursor-default"}`}
          >
            {col.header}
            {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
          </button>
        ))}
      </div>
      <List<RowProps<T>>
        rowComponent={DataTableRow}
        rowCount={sortedRows.length}
        rowHeight={rowHeight}
        rowProps={{ rows: sortedRows, columns, onRowClick, gridTemplate }}
        style={{ height: Math.min(maxHeight, sortedRows.length * rowHeight) }}
      />
    </div>
  );
}
