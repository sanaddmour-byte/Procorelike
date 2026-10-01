import * as Crypto from "expo-crypto";
import { apiFetch } from "../api-client";
import { getDb } from "../db/database";

export interface QueuedRequest {
  id: string;
  projectId: string;
  method: string;
  path: string;
  body: string | null;
  label: string;
}

/**
 * Generic write queue for actions that go straight to the API (an RFI answer, a manpower change) but must not be lost
 * when the connection is. A `dedupeKey` keeps only the latest request of its kind, which is right for "replace the whole
 * list" writes such as manpower. Mirrors the web app's outbox `request` kind.
 */
export async function enqueueRequest(input: { projectId: string; method: "POST" | "PATCH" | "PUT"; path: string; body: unknown; label: string; dedupeKey?: string }): Promise<void> {
  const db = await getDb();
  if (input.dedupeKey) await db.runAsync("DELETE FROM request_queue WHERE dedupe_key = ?", [input.dedupeKey]);
  await db.runAsync(
    "INSERT INTO request_queue (id, project_id, dedupe_key, method, path, body, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [Crypto.randomUUID(), input.projectId, input.dedupeKey ?? null, input.method, input.path, JSON.stringify(input.body), input.label, new Date().toISOString()],
  );
}

export async function listQueuedRequests(projectId: string): Promise<QueuedRequest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; project_id: string; method: string; path: string; body: string | null; label: string }>(
    "SELECT * FROM request_queue WHERE project_id = ? ORDER BY created_at",
    [projectId],
  );
  return rows.map((r) => ({ id: r.id, projectId: r.project_id, method: r.method, path: r.path, body: r.body, label: r.label }));
}

export async function queuedRequestCount(projectId: string): Promise<number> {
  return (await listQueuedRequests(projectId)).length;
}

/**
 * Replays queued writes oldest-first. A network failure or a 5xx stops the run so order is kept and the rest is retried
 * next sync; a 4xx means the server will never accept it, so it is dropped instead of blocking everything behind it.
 */
export async function flushRequestQueue(projectId: string): Promise<{ sent: number; dropped: number }> {
  const db = await getDb();
  let sent = 0;
  let dropped = 0;
  for (const request of await listQueuedRequests(projectId)) {
    const res = await apiFetch(request.path, { method: request.method, body: request.body ?? undefined });
    if (res.status >= 500) break;
    await db.runAsync("DELETE FROM request_queue WHERE id = ?", [request.id]);
    if (res.ok) sent += 1;
    else dropped += 1;
  }
  return { sent, dropped };
}

/** True for a fetch that failed before reaching the server (no connection), as opposed to an HTTP error response. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
