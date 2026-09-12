/**
 * The 3-way per-field merge behind offline sync (docs/ARCHITECTURE.md §6):
 * `base` is the record as the client last saw it (its offline edit
 * baseline), `client` is the field values it wants to push now, `server`
 * is the record's current state. A field the client didn't actually touch
 * is left alone; a field only one side changed is applied (last-write-wins
 * *per field*, not per record); a field both sides changed to the *same*
 * value converges silently; a field both sides changed to *different*
 * values is a genuine conflict — never silently resolved, always
 * surfaced so the caller can flag the record `needs_review` and keep both
 * values for a resolution screen.
 */

export interface FieldConflict {
  field: string;
  base: unknown;
  server: unknown;
  client: unknown;
}

export interface MergeResult {
  /** Fields safe to write to the server row as-is. */
  merged: Record<string, unknown>;
  /** Fields where client and server diverged from the same base — not applied. */
  conflicts: FieldConflict[];
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as string | Date).getTime() === new Date(b as string | Date).getTime();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * `base` is null for a record the client created entirely offline (nothing
 * to diff against — every field it's sending is "new").
 */
export function mergeFields(
  base: Record<string, unknown> | null,
  client: Record<string, unknown>,
  server: Record<string, unknown>,
): MergeResult {
  const merged: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];

  for (const field of Object.keys(client)) {
    const clientValue = client[field];
    const baseValue = base ? base[field] : undefined;
    const serverValue = server[field];

    const clientChanged = base ? !valuesEqual(clientValue, baseValue) : true;
    if (!clientChanged) continue;

    const serverChanged = base ? !valuesEqual(serverValue, baseValue) : false;
    if (!serverChanged) {
      merged[field] = clientValue;
      continue;
    }

    if (valuesEqual(clientValue, serverValue)) {
      merged[field] = clientValue;
      continue;
    }

    conflicts.push({ field, base: baseValue, server: serverValue, client: clientValue });
  }

  return { merged, conflicts };
}
