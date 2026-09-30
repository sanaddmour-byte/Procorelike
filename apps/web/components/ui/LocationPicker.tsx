"use client";

import { Modal } from "@/components/ui/Modal";
import { apiJson } from "@/lib/api-client";
import { cachedJson } from "@/lib/cached-json";
import { idbGet, idbSet } from "@/lib/idb";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

export interface LocationOption {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
}

/** Locations for a project, cached in IndexedDB so the picker still works offline (plan E1/D2). */
export function useLocations(projectId: string): { locations: LocationOption[]; add: (name: string, parentId: string | null) => Promise<LocationOption | null> } {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  useEffect(() => {
    let alive = true;
    const cacheKey = `locations:${projectId}`;
    idbGet<LocationOption[]>("cache", cacheKey).then((c) => alive && c && setLocations((cur) => (cur.length ? cur : c)));
    cachedJson<LocationOption[]>(`/projects/${projectId}/locations`)
      .then((rows) => {
        if (!alive) return;
        setLocations(rows);
        void idbSet("cache", cacheKey, rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function add(name: string, parentId: string | null): Promise<LocationOption | null> {
    try {
      const row = await apiJson<LocationOption>(`/projects/${projectId}/locations`, { method: "POST", body: JSON.stringify({ name, parentId }) });
      const parent = parentId ? locations.find((l) => l.id === parentId) : undefined;
      const created = { ...row, path: parent ? `${parent.path} › ${row.name}` : row.name };
      const next = [...locations, created].sort((a, b) => a.path.localeCompare(b.path));
      setLocations(next);
      void idbSet("cache", `locations:${projectId}`, next);
      return created;
    } catch {
      return null;
    }
  }
  return { locations, add };
}

interface Props {
  projectId: string;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}

/**
 * Location control (plan E1). One 56 px button shows the current location path; tapping opens a bottom sheet with a
 * search box over the full paths ("Tower A › Level 2 › Zone B") and 56 px rows. A location that doesn't exist yet can be
 * added on the spot -- under the currently selected one, or as a new top-level location -- so a snag never waits on
 * an administrator.
 */
export function LocationPicker({ projectId, value, onChange }: Props) {
  const t = useTranslations("Field");
  const { locations, add } = useLocations(projectId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = locations.find((l) => l.id === value);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (needle ? locations.filter((l) => l.path.toLowerCase().includes(needle)) : locations).slice(0, 200);
  }, [locations, q]);

  function pick(id: string | undefined): void {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  async function addNew(parentId: string | null): Promise<void> {
    const created = await add(q.trim(), parentId);
    if (created) pick(created.id);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{t("locationLabel")}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hit-task flex items-center justify-between gap-2 rounded-lg border-3 border-ink bg-white px-3 text-start font-semibold text-navy-900"
      >
        <span className="truncate">{current ? current.path : t("locationSelect")}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("locationLabel")} sheet>
        <input
          type="search"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("locationSearch")}
          className="mb-2 w-full rounded-lg border-3 border-ink px-3"
        />
        <ul className="flex flex-col">
          <li>
            <button type="button" onClick={() => pick(undefined)} className="hit-task w-full border-b border-navy-100 px-2 text-start text-navy-700">
              {t("locationNone")}
            </button>
          </li>
          {matches.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => pick(l.id)}
                aria-current={l.id === value}
                className={`hit-task w-full border-b border-navy-100 px-2 text-start ${l.id === value ? "bg-orange-100 font-bold" : ""}`}
              >
                {l.path}
              </button>
            </li>
          ))}
          {q.trim() && !locations.some((l) => l.name.toLowerCase() === q.trim().toLowerCase()) && (
            <>
              {current && (
                <li>
                  <button type="button" onClick={() => void addNew(current.id)} className="hit-task w-full px-2 text-start font-bold text-maroon-700">
                    + {t("locationAddChild", { name: q.trim(), parent: current.name })}
                  </button>
                </li>
              )}
              <li>
                <button type="button" onClick={() => void addNew(null)} className="hit-task w-full px-2 text-start font-bold text-maroon-700">
                  + {t("locationAddRoot", { name: q.trim() })}
                </button>
              </li>
            </>
          )}
        </ul>
      </Modal>
    </div>
  );
}
