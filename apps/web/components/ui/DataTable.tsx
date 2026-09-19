"use client";

import { useTranslations } from "next-intl";
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
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(row);
              }
            }
          : undefined
      }
      role="row"
      tabIndex={onRowClick ? 0 : undefined}
      className={`grid items-center gap-3 border-b border-navy-100 px-3 text-sm ${
        onRowClick ? "cursor-pointer hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-maroon-700" : ""
      } ${index % 2 === 1 ? "bg-cream/50" : "bg-white"}`}
    >
      {columns.map((col) => (
        <div key={col.key} role="cell" className={`truncate ${col.align === "end" ? "text-end" : ""}`}>
          {col.render(row)}
        </div>
      ))}
    </div>
  );
}

const MIN_FLEX_COLUMN_WIDTH = 160;

function minTableWidth(columns: DataTableColumn<unknown>[]): number {
  const columnWidths = columns.reduce((sum, c) => sum + (c.width?.endsWith("px") ? parseFloat(c.width) : MIN_FLEX_COLUMN_WIDTH), 0);
  const gaps = (columns.length - 1) * 12;
  const padding = 24;
  return columnWidths + gaps + padding;
}

export interface DataTableServerSort {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  /** null = loading. In server mode (`pagination` set), this is just the current page's rows, not the full result set. */
  rows: T[] | null;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowHeight?: number;
  maxHeight?: number;
  /**
   * Opts a column's sort into server-driven mode: clicking a header calls
   * `onServerSortChange(key)` instead of sorting `rows` locally, and the
   * sort arrow reflects `serverSort` rather than internal state. Omit
   * both (the default) to keep the original client-side sort-the-full-
   * array behavior every existing caller already relies on.
   */
  serverSort?: DataTableServerSort | null;
  onServerSortChange?: (key: string) => void;
  /**
   * Opts into a paged footer instead of assuming `rows` is the complete,
   * already-sorted result set to virtualize as one long list. `rows` must
   * already be just the requested page. See lib/use-server-table.ts for
   * the hook that drives this alongside `serverSort`/`onServerSortChange`.
   */
  pagination?: DataTablePagination;
}

/**
 * The one reusable enterprise table: sticky compact header, click-to-sort,
 * hover + zebra rows, and windowed rendering via react-window (the same
 * library and pattern the Gantt task grid already uses) so a
 * thousand-plus-row register scrolls smoothly instead of hanging the
 * page the way a plain `.map()` over `<li>` cards did before. Column
 * resize, visibility toggles, and bulk row selection are deliberately
 * not in this first pass -- flagged as follow-up, not silently dropped.
 *
 * Server-driven sort/pagination (Phase 21) are additive: a caller that
 * passes neither `serverSort`/`onServerSortChange` nor `pagination` gets
 * the exact original client-side behavior, unchanged.
 */
export function DataTable<T>({
  columns,
  rows,
  error,
  onRetry,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  rowHeight = 40,
  maxHeight = 600,
  serverSort,
  onServerSortChange,
  pagination,
}: Props<T>) {
  const tc = useTranslations("Common");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const gridTemplate = columns.map((c) => c.width ?? "1fr").join(" ");
  const activeSortKey = onServerSortChange ? (serverSort?.key ?? null) : sortKey;
  const activeSortDir = onServerSortChange ? (serverSort?.direction ?? "asc") : sortDir;

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    if (onServerSortChange) return rows; // already sorted server-side
    const col = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
    if (!col?.sortValue) return rows;
    const withValues = rows.map((row) => ({ row, value: col.sortValue!(row) }));
    withValues.sort((a, b) => {
      if (a.value < b.value) return sortDir === "asc" ? -1 : 1;
      if (a.value > b.value) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return withValues.map((w) => w.row);
  }, [rows, sortKey, sortDir, columns, onServerSortChange]);

  function handleSort(col: DataTableColumn<T>): void {
    if (!col.sortValue) return;
    if (onServerSortChange) {
      onServerSortChange(col.key);
      return;
    }
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

  const minWidth = minTableWidth(columns as DataTableColumn<unknown>[]);
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : null;

  return (
    <div className="overflow-hidden rounded-xl border-3 border-ink shadow-brutal-sm">
      <div role="table" aria-rowcount={(pagination?.total ?? rows.length) + 1} className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div role="row" className="grid items-center gap-3 border-b-3 border-ink bg-cream px-3 text-xs font-semibold text-navy-800" style={{ gridTemplateColumns: gridTemplate, height: 36 }}>
            {columns.map((col) => (
              <button
                key={col.key}
                type="button"
                role="columnheader"
                aria-sort={activeSortKey === col.key ? (activeSortDir === "asc" ? "ascending" : "descending") : col.sortValue ? "none" : undefined}
                onClick={() => handleSort(col)}
                disabled={!col.sortValue}
                className={`truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-maroon-700 ${col.align === "end" ? "text-end" : "text-start"} ${col.sortValue ? "cursor-pointer hover:text-maroon-700" : "cursor-default"}`}
              >
                {col.header}
                {activeSortKey === col.key && (activeSortDir === "asc" ? " ▲" : " ▼")}
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
      </div>
      {pagination && pageCount !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-3 border-ink bg-cream px-3 py-2">
          <button
            type="button"
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            aria-label={tc("previousPage")}
            className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
          >
            &#8249;
          </button>
          <span className="whitespace-nowrap text-xs font-semibold text-navy-700">{tc("pageIndicator", { current: pagination.page, total: pageCount })}</span>
          <button
            type="button"
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= pageCount}
            aria-label={tc("nextPage")}
            className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
          >
            &#8250;
          </button>
        </div>
      )}
    </div>
  );
}
