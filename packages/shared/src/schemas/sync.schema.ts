import { z } from "zod";

/** Entity types the mobile outbox can push/pull. Photos are create-only over sync — see docs/ROADMAP.md Phase 2 gate report. "inspection" was added in Phase 5: its full response set travels in `data.responses`, the same "replace-all sub-rows" pattern as a daily log's manpower array. "schedule_progress_update" (Phase 11c) is create-only like photos -- a field progress submission is never edited after the fact, only accepted or rejected by a planner (web-only, not itself synced). */
export const SYNC_ENTITY_TYPES = ["daily_log", "punch_item", "inspection", "schedule_progress_update"] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const syncPushRecordSchema = z
  .object({
    /** Client-generated UUID — becomes the server row's id too, so offline-created records need no id round-trip. */
    localId: z.string().uuid(),
    /** The server_revision this edit started from; null for a record created entirely offline. */
    baseRevision: z.number().int().nonnegative().nullable(),
    /** Snapshot of the record when the offline edit session started; null for a brand-new record. */
    base: z.record(z.string(), z.unknown()).nullable(),
    /** The field values to push now. */
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type SyncPushRecord = z.infer<typeof syncPushRecordSchema>;

export const syncPushSchema = z
  .object({
    projectId: z.string().uuid(),
    entityType: z.enum(SYNC_ENTITY_TYPES),
    records: z.array(syncPushRecordSchema).min(1).max(200),
  })
  .strict();
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export const syncPullQuerySchema = z
  .object({
    projectId: z.string().uuid(),
    entityType: z.enum(SYNC_ENTITY_TYPES),
    since: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
