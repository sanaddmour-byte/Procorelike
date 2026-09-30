"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "./api-client";
import { idbAll, idbDel, idbSet } from "./idb";
import { createSnag, type NewSnag } from "./snag";

/**
 * Offline write queue (plan D2). A snag created without a connection is stored in IndexedDB together with its photos
 * and sent when the connection returns. Nothing is ever dropped silently: an entry the server rejects stays in the
 * queue as `failed` with the reason until the user retries or discards it.
 */
export interface OutboxEntry {
  id: string;
  kind: "snag";
  snag: NewSnag;
  photos: File[];
  createdAt: number;
  status: "pending" | "failed";
  reason?: string;
}

const EVENT = "siteops:outbox";
const notify = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
};

/** True when a thrown value means "no connection" rather than "the server said no". */
export function isOfflineError(err: unknown): boolean {
  return !(err instanceof ApiClientError) && (err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false));
}

export async function enqueueSnag(snag: NewSnag, photos: File[]): Promise<string> {
  const id = `snag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: OutboxEntry = { id, kind: "snag", snag, photos, createdAt: Date.now(), status: "pending" };
  await idbSet("outbox", id, entry);
  notify();
  return id;
}

export async function listOutbox(projectId?: string): Promise<OutboxEntry[]> {
  const all = (await idbAll<OutboxEntry>("outbox")).map((e) => e.value);
  return all.filter((e) => !projectId || e.snag.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function discardOutbox(id: string): Promise<void> {
  await idbDel("outbox", id);
  notify();
}

let flushing = false;

/** Sends queued entries oldest-first. Stops at the first connectivity failure so order is preserved. Returns how many were sent. */
export async function flushOutbox(): Promise<number> {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const entry of await listOutbox()) {
      if (entry.status === "failed") continue;
      try {
        const res = await createSnag(entry.snag, entry.photos);
        if (res.failedPhotos.length > 0) {
          // The record exists; keep only the photos that failed so a retry never creates a duplicate record.
          await idbDel("outbox", entry.id);
          await idbSet("outbox", entry.id, { ...entry, kind: "snag", status: "failed", reason: "photos", photos: res.failedPhotos, snag: { ...entry.snag, description: `${entry.snag.description} (${res.number})` } } satisfies OutboxEntry);
        } else {
          await idbDel("outbox", entry.id);
          sent += 1;
        }
      } catch (err) {
        if (isOfflineError(err)) break;
        const reason = err instanceof ApiClientError ? err.code : "unknown";
        await idbSet("outbox", entry.id, { ...entry, status: "failed", reason } satisfies OutboxEntry);
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return sent;
}

/** Re-queues a failed entry. */
export async function retryOutbox(id: string): Promise<void> {
  const entry = (await listOutbox()).find((e) => e.id === id);
  if (entry) await idbSet("outbox", id, { ...entry, status: "pending", reason: undefined } satisfies OutboxEntry);
  notify();
  void flushOutbox();
}

/** Live queue state for the sync indicator; also drives flushing on reconnect, on focus and every 30 s while items wait. */
export function useOutbox(): { entries: OutboxEntry[]; pending: number; failed: number; syncing: boolean } {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const refresh = useCallback(() => {
    void listOutbox().then(setEntries);
  }, []);
  const sync = useCallback(async () => {
    setSyncing(true);
    await flushOutbox();
    setSyncing(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    void sync();
    const onChange = (): void => refresh();
    const onOnline = (): void => void sync();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    const timer = setInterval(() => void sync(), 30_000);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      clearInterval(timer);
    };
  }, [refresh, sync]);

  return { entries, pending: entries.filter((e) => e.status === "pending").length, failed: entries.filter((e) => e.status === "failed").length, syncing };
}
