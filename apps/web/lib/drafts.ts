"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idbDel, idbGet, idbSet } from "./idb";

/**
 * A form's working state, persisted to IndexedDB on every change (debounced) and restored on mount (plan B7).
 * A call, a lock screen or an OS kill mid-form no longer loses the text or the attached photos: reopening the same
 * form restores them exactly. `restored` is true when a saved draft was applied so the UI can say so.
 */
export function useDraft<T extends object>(key: string, initial: T): { value: T; setValue: (patch: Partial<T>) => void; replace: (next: T) => void; clear: () => void; ready: boolean; restored: boolean } {
  const [value, setValueState] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const cleared = useRef(false);

  useEffect(() => {
    let alive = true;
    idbGet<T>("drafts", key).then((saved) => {
      if (!alive) return;
      if (saved) {
        setValueState({ ...initial, ...saved });
        setRestored(true);
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
    // `initial` is only read once on mount by design.
  }, [key]);

  const persist = useCallback(
    (next: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!cleared.current) void idbSet("drafts", key, next);
      }, 250);
    },
    [key],
  );

  // Flush on page hide so a kill right after typing still keeps the last keystrokes.
  useEffect(() => {
    const flush = (): void => {
      if (!cleared.current) void idbSet("drafts", key, latest.current);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key]);

  const setValue = useCallback(
    (patch: Partial<T>) => {
      cleared.current = false;
      setValueState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    (next: T) => {
      cleared.current = false;
      setValueState(next);
      persist(next);
    },
    [persist],
  );

  const clear = useCallback(() => {
    cleared.current = true;
    if (timer.current) clearTimeout(timer.current);
    void idbDel("drafts", key);
  }, [key]);

  return { value, setValue, replace, clear, ready, restored };
}
