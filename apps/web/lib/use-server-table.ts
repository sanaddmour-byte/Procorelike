"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiClientError } from "./api-client";

const SEARCH_DEBOUNCE_MS = 300;

export interface ServerSortState {
  key: string;
  direction: "asc" | "desc";
}

export interface UseServerTableOptions {
  /** e.g. "/rfis" -- `projectId` and every filter/sort/page param this hook owns are appended as a querystring. */
  basePath: string;
  projectId: string;
  pageSize?: number;
  /** The column a fresh table (or a "clear all") starts sorted by. Omit for no default sort (server decides). */
  defaultSort?: ServerSortState;
}

/**
 * The reusable half of every module's data-fetching glue for a server-
 * driven DataTable (Phase 21's pattern, proven first on the RFIs list
 * page): debounced search, arbitrary caller-defined filters, sort, and
 * page state, all folded into one querystring against `basePath`, read
 * back as `{rows, total}` via the response body plus the `X-Total-Count`
 * header every migrated list endpoint sets (see rfi.service.ts's
 * `listRfis` and docs/DATA_MODEL.md's list-query-contract section).
 *
 * This is a small local hook, not TanStack Query -- CLAUDE.md's stack
 * table names TanStack Query but nothing in `apps/web` actually depends
 * on it yet (verified during Phase 21's audit), and adopting it now to
 * solve one hook's worth of fetch/debounce logic would touch every one
 * of the ~100 existing pages' dependency footprint for no problem it
 * uniquely solves. If a real caching/dedup need shows up once more
 * modules migrate to this pattern, that's the point to revisit the
 * question -- not before.
 */
export function useServerTable<T>({ basePath, projectId, pageSize = 50, defaultSort }: UseServerTableOptions) {
  const [search, setSearch] = useState("");
  const [filters, setFiltersState] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<ServerSortState | null>(defaultSort ?? null);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (opts: { search: string; filters: Record<string, string>; sort: ServerSortState | null; page: number }) => {
      const requestId = ++requestIdRef.current;
      const params = new URLSearchParams({ projectId, page: String(opts.page), pageSize: String(pageSize) });
      if (opts.search.trim()) params.set("search", opts.search.trim());
      if (opts.sort) {
        params.set("sort", opts.sort.key);
        params.set("direction", opts.sort.direction);
      }
      for (const [key, value] of Object.entries(opts.filters)) {
        if (value) params.set(key, value);
      }

      apiFetch(`${basePath}?${params.toString()}`)
        .then(async (res) => {
          if (requestId !== requestIdRef.current) return; // a newer request already landed
          if (!res.ok) throw new ApiClientError(res.status, "list_failed");
          const body = (await res.json()) as T[];
          setRows(body);
          setTotal(Number(res.headers.get("X-Total-Count") ?? body.length));
          setError(false);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setError(true);
        });
    },
    [basePath, projectId, pageSize],
  );

  // Debounce search only -- filter/sort/page changes trigger a refetch immediately, since
  // those are discrete clicks rather than a stream of keystrokes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ search, filters, sort, page }), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `load` intentionally omitted: it's stable for a given basePath/projectId/pageSize, and this project's ESLint config has no react-hooks plugin to flag it either way.
  }, [search, filters, sort, page]);

  function handleSearchChange(value: string): void {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(key: string, value: string): void {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleServerSortChange(key: string): void {
    setSort((prev) => (prev?.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
    setPage(1);
  }

  function clearAll(): void {
    setSearch("");
    setFiltersState({});
    setSort(defaultSort ?? null);
    setPage(1);
  }

  /** Applies a saved view's stored state wholesale (see SavedViewsBar) -- one state replacement rather than one setter call per field, so the view switches atomically. */
  function applyView(view: { search?: string; filters?: Record<string, string>; sort?: ServerSortState | null }): void {
    setSearch(view.search ?? "");
    setFiltersState(view.filters ?? {});
    setSort(view.sort ?? defaultSort ?? null);
    setPage(1);
  }

  return {
    rows,
    total,
    error,
    search,
    filters,
    sort,
    page,
    pageSize,
    onSearchChange: handleSearchChange,
    onFilterChange: handleFilterChange,
    onServerSortChange: handleServerSortChange,
    onPageChange: setPage,
    clearAll,
    applyView,
    reload: () => load({ search, filters, sort, page }),
  };
}
