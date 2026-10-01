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

  // The view (search / filters / sort / page) lives in the URL so Back from a record returns to the same list, and a
  // list link can be shared (plan C3). `ready` is set once the URL has been read, so the first load uses it.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("q")) setSearch(q.get("q")!);
    const f: Record<string, string> = {};
    q.forEach((v, k) => {
      if (k.startsWith("f_") && v) f[k.slice(2)] = v;
    });
    if (Object.keys(f).length) setFiltersState(f);
    if (q.get("sort")) setSort({ key: q.get("sort")!, direction: q.get("dir") === "desc" ? "desc" : "asc" });
    if (Number(q.get("page")) > 1) setPage(Number(q.get("page")));
    setReady(true);
  }, []);

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
          // Remember the list order so a record can offer Previous / Next (plan B5) without another request.
          try {
            const ids = (body as unknown as { id?: string }[]).map((r) => r.id).filter(Boolean);
            if (ids.length) window.sessionStorage.setItem(`siteops.siblings:${basePath}`, JSON.stringify(ids));
          } catch {
            // convenience only
          }
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

  // Debounce search keystrokes only. The first load and discrete filter/sort/page changes fire immediately:
  // waiting out the search debounce there delayed every list's first paint by SEARCH_DEBOUNCE_MS (measured).
  const lastSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    // Mirror the view into the URL without adding a history entry.
    const q = new URLSearchParams();
    if (search) q.set("q", search);
    for (const [k, v] of Object.entries(filters)) if (v) q.set(`f_${k}`, v);
    if (sort && (sort.key !== defaultSort?.key || sort.direction !== defaultSort?.direction)) {
      q.set("sort", sort.key);
      q.set("dir", sort.direction);
    }
    if (page > 1) q.set("page", String(page));
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const searchChanged = lastSearchRef.current !== null && lastSearchRef.current !== search;
    lastSearchRef.current = search;
    if (searchChanged) debounceRef.current = setTimeout(() => load({ search, filters, sort, page }), SEARCH_DEBOUNCE_MS);
    else load({ search, filters, sort, page });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `load` intentionally omitted: it's stable for a given basePath/projectId/pageSize, and this project's ESLint config has no react-hooks plugin to flag it either way.
  }, [ready, search, filters, sort, page]);

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
