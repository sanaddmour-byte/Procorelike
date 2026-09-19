"use client";

import { apiJson } from "@/lib/api-client";
import type { ServerSortState } from "@/lib/use-server-table";
import type { Module } from "@siteops/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface StoredViewState {
  search?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  [filterKey: string]: string | undefined;
}

interface SavedViewRow {
  id: string;
  name: string;
  filters: StoredViewState;
}

export interface TableViewState {
  search: string;
  filters: Record<string, string>;
  sort: ServerSortState | null;
}

interface Props {
  projectId: string;
  module: Module;
  currentState: TableViewState;
  onApply: (state: TableViewState) => void;
}

function toStoredState(state: TableViewState): StoredViewState {
  const stored: StoredViewState = { ...state.filters };
  if (state.search) stored.search = state.search;
  if (state.sort) {
    stored.sortKey = state.sort.key;
    stored.sortDirection = state.sort.direction;
  }
  return stored;
}

function fromStoredState(stored: StoredViewState): TableViewState {
  const { search, sortKey, sortDirection, ...filters } = stored;
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    search: search ?? "",
    filters: cleanFilters,
    sort: sortKey ? { key: sortKey, direction: sortDirection ?? "asc" } : null,
  };
}

/**
 * A reusable "Saved Views" bar for any server-driven list page -- e.g.
 * "My Open RFIs", "Overdue RFIs" -- built once (Phase 21) and generalized
 * from Punch List's earlier bespoke inline implementation (which only
 * ever stored a single status filter). Backed by the existing generic
 * `/saved-views` API (projectId + module + name + an opaque `filters`
 * JSON blob), which needed no schema change to carry search/sort
 * alongside a module's own filters -- see this file's `StoredViewState`
 * for the flattened shape stored there.
 */
export function SavedViewsBar({ projectId, module, currentState, onApply }: Props) {
  const t = useTranslations("SavedViews");
  const tc = useTranslations("Common");
  const [views, setViews] = useState<SavedViewRow[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  function loadViews(): void {
    apiJson<SavedViewRow[]>(`/saved-views?projectId=${projectId}&module=${module}`)
      .then(setViews)
      .catch(() => undefined);
  }

  useEffect(() => {
    loadViews();
  }, [projectId, module]);

  async function handleSave(): Promise<void> {
    if (!newName.trim()) return;
    setSaving(true);
    setError(false);
    try {
      await apiJson("/saved-views", {
        method: "POST",
        body: JSON.stringify({ projectId, module, name: newName.trim(), filters: toStoredState(currentState) }),
      });
      setNewName("");
      loadViews();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(false);
    try {
      await apiJson(`/saved-views/${id}?projectId=${projectId}`, { method: "DELETE" });
      loadViews();
    } catch {
      setError(true);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3">
      {views.map((view) => (
        <span key={view.id} className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-navy-100 ps-3 pe-1 py-1 text-xs font-semibold text-navy-800">
          <button type="button" onClick={() => onApply(fromStoredState(view.filters))}>
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(view.id)}
            aria-label={t("deleteView", { name: view.name })}
            className="rounded-full px-1 text-navy-500 hover:bg-navy-200 hover:text-navy-800"
          >
            ✕
          </button>
        </span>
      ))}
      <div className="ms-auto flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("viewNamePlaceholder")}
          className="min-w-[140px] rounded-lg border-2 border-ink px-2 py-1 text-xs"
          aria-label={t("viewNamePlaceholder")}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !newName.trim()}
          className="whitespace-nowrap rounded-lg border-2 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-2.5 py-1 text-xs font-bold text-ink disabled:opacity-50"
        >
          {t("saveView")}
        </button>
      </div>
      {error && <p className="w-full text-xs text-maroon-700">{tc("errorGeneric")}</p>}
    </div>
  );
}
