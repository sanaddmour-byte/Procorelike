"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Set false to keep an identifying column always visible, excluded from the "Columns" show/hide menu. Defaults to true; only takes effect when the table's `storageKey` prop is set. */
  hideable?: boolean;
}

interface RowSelectionHandlers<T> {
  isSelected: (row: T) => boolean;
  toggle: (row: T) => void;
}

interface RowProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  onRowClick?: (row: T) => void;
  gridTemplate: string;
  selection?: RowSelectionHandlers<T>;
}

function DataTableRow<T>({ index, style, rows, columns, onRowClick, gridTemplate, selection }: RowComponentProps<RowProps<T>>) {
  const tc = useTranslations("Common");
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
      {selection && (
        <div role="cell" className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selection.isSelected(row)} onChange={() => selection.toggle(row)} aria-label={tc("selectRow")} className="h-4 w-4" />
        </div>
      )}
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

export interface DataTableSelection<T> {
  selectedIds: Set<string>;
  getRowId: (row: T) => string;
  onSelectionChange: (ids: Set<string>) => void;
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
  /**
   * Enables a "Columns" show/hide toggle above the header row, persisted
   * per browser under this key (localStorage, not synced -- the same
   * per-browser-only pattern GlobalSearch's recent-searches use). Give
   * each table on a distinct page its own key. Omit to keep every column
   * always visible with no toggle UI, the original behavior every
   * existing caller already relies on.
   */
  storageKey?: string;
  /**
   * Enables a checkbox column: one per row plus a header "select all
   * (currently rendered rows)" checkbox. `getRowId` must return a stable
   * id per row (usually the row's own `id`); `selectedIds` is owned by
   * the caller, not this component, so it can be read back into a bulk-
   * actions bar rendered alongside the table. Selection is scoped to
   * whatever rows are currently rendered (one page in server mode) --
   * "select all" never reaches into rows outside the current page/view.
   * Omit to keep every row exactly as before, no checkbox column at all.
   */
  selection?: DataTableSelection<T>;
}

function loadHiddenColumns(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`siteops.dataTableHiddenColumns.${storageKey}`);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenColumns(storageKey: string, hidden: Set<string>): void {
  try {
    window.localStorage.setItem(`siteops.dataTableHiddenColumns.${storageKey}`, JSON.stringify([...hidden]));
  } catch {
    // per-browser convenience only -- a failed write just means the choice isn't remembered
  }
}

/**
 * The one reusable enterprise table: sticky compact header, click-to-sort,
 * hover + zebra rows, and windowed rendering via react-window (the same
 * library and pattern the Gantt task grid already uses) so a
 * thousand-plus-row register scrolls smoothly instead of hanging the
 * page the way a plain `.map()` over `<li>` cards did before. Column
 * resize and bulk row selection are deliberately not in this pass --
 * flagged as follow-up, not silently dropped; column visibility (Phase
 * 27) is.
 *
 * Server-driven sort/pagination (Phase 21) are additive: a caller that
 * passes neither `serverSort`/`onServerSortChange` nor `pagination` gets
 * the exact original client-side behavior, unchanged. Column visibility
 * (Phase 27) and row selection (Phase 28) are the same shape: omitting
 * `storageKey`/`selection` renders exactly as before, no toggle UI and
 * no checkbox column at all.
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
  storageKey,
  selection,
}: Props<T>) {
  const tc = useTranslations("Common");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storageKey) setHiddenColumns(loadHiddenColumns(storageKey));
  }, [storageKey]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.hideable === false || !hiddenColumns.has(c.key)), [columns, hiddenColumns]);

  function toggleColumn(key: string): void {
    if (!storageKey) return;
    const col = columns.find((c) => c.key === key);
    if (!col || col.hideable === false) return;
    const isHidden = hiddenColumns.has(key);
    if (!isHidden && visibleColumns.length <= 1) return; // never hide the last visible column
    const next = new Set(hiddenColumns);
    if (isHidden) next.delete(key);
    else next.add(key);
    setHiddenColumns(next);
    saveHiddenColumns(storageKey, next);
  }

  const gridTemplate = [selection ? "36px" : null, ...visibleColumns.map((c) => c.width ?? "1fr")].filter((track): track is string => track !== null).join(" ");
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

  const selectedOnPageCount = useMemo(() => {
    if (!selection) return 0;
    return sortedRows.reduce((n, row) => (selection.selectedIds.has(selection.getRowId(row)) ? n + 1 : n), 0);
  }, [selection, sortedRows]);
  const allOnPageSelected = Boolean(selection) && sortedRows.length > 0 && selectedOnPageCount === sortedRows.length;
  const someOnPageSelected = Boolean(selection) && selectedOnPageCount > 0 && !allOnPageSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPageSelected;
  }, [someOnPageSelected]);

  function toggleSelectAllOnPage(): void {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (allOnPageSelected) {
      for (const row of sortedRows) next.delete(selection.getRowId(row));
    } else {
      for (const row of sortedRows) next.add(selection.getRowId(row));
    }
    selection.onSelectionChange(next);
  }

  function toggleRowSelected(row: T): void {
    if (!selection) return;
    const id = selection.getRowId(row);
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onSelectionChange(next);
  }

  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows) return <LoadingState rows={6} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  const minWidth = minTableWidth(visibleColumns as DataTableColumn<unknown>[]) + (selection ? 48 : 0);
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : null;

  return (
    <div className="overflow-hidden rounded-xl border-3 border-ink shadow-brutal-sm">
      {storageKey && (
        <div className="relative flex items-center justify-end border-b-3 border-ink bg-cream px-3 py-1.5">
          <button
            type="button"
            onClick={() => setColumnsMenuOpen((o) => !o)}
            aria-expanded={columnsMenuOpen}
            aria-haspopup="true"
            aria-label={tc("columnsMenuLabel")}
            className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-semibold text-navy-800 hover:bg-navy-50"
          >
            {tc("columns")} ▾
          </button>
          {columnsMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColumnsMenuOpen(false)} />
              <div role="menu" aria-label={tc("columnsMenuLabel")} className="absolute end-3 top-full z-20 mt-1 w-56 rounded-lg border-3 border-ink bg-white p-2 shadow-brutal-sm">
                {columns.map((col) => {
                  const hidden = hiddenColumns.has(col.key);
                  const locked = col.hideable === false;
                  return (
                    <label key={col.key} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${locked ? "opacity-50" : "cursor-pointer hover:bg-navy-50"}`}>
                      <input type="checkbox" checked={!hidden} disabled={locked} onChange={() => toggleColumn(col.key)} className="h-4 w-4" />
                      {col.header}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      <div role="table" aria-rowcount={(pagination?.total ?? rows.length) + 1} className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div role="row" className="grid items-center gap-3 border-b-3 border-ink bg-cream px-3 text-xs font-semibold text-navy-800" style={{ gridTemplateColumns: gridTemplate, height: 36 }}>
            {selection && (
              <div role="columnheader" className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  aria-label={tc("selectAllRows")}
                  className="h-4 w-4"
                />
              </div>
            )}
            {visibleColumns.map((col) => (
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
            rowProps={{
              rows: sortedRows,
              columns: visibleColumns,
              onRowClick,
              gridTemplate,
              selection: selection ? { isSelected: (row: T) => selection.selectedIds.has(selection.getRowId(row)), toggle: toggleRowSelected } : undefined,
            }}
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
