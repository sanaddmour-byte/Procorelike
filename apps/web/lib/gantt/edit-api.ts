import { apiFetch, apiJson } from "../api-client";
import type { ApiScheduleTask } from "./api";
import type { GanttDependency, ScheduleTaskConstraintType, ScheduleTaskDependencyType } from "./types";

/**
 * Client for Phase 11d / Tier B's feature-flagged native editing endpoints
 * (apps/api's cpm-schedule.routes.ts). Kept separate from api.ts, which is
 * only about mapping the read-only import/current-schedule response shape.
 */

export interface TaskEdit {
  taskId: string;
  name?: string;
  durationMinutes?: number;
  constraintType?: ScheduleTaskConstraintType | null;
  constraintDate?: string | null;
  percentComplete?: number;
}

export interface DependencyAdd {
  predecessorId: string;
  successorId: string;
  type: ScheduleTaskDependencyType;
  lagMinutes: number;
}

export interface ScheduleEditBatch {
  taskEdits?: TaskEdit[];
  dependencyAdds?: DependencyAdd[];
  dependencyRemoveIds?: string[];
}

export interface CpmTaskResult {
  id: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloatMinutes: number;
  freeFloatMinutes: number;
  isCritical: boolean;
  percentComplete: number;
}

export interface CpmResult {
  tasks: CpmTaskResult[];
  warnings: { code: string; taskId: string; message: string }[];
  cycle: { taskIds: string[] } | null;
}

export interface ScheduleEditResult {
  cpmResult: CpmResult;
  tasks: ApiScheduleTask[];
  dependencies: GanttDependency[];
}

export async function setNativeEditingEnabled(scheduleId: string, enabled: boolean): Promise<{ nativeEditingEnabled: boolean }> {
  return apiJson(`/schedules/${scheduleId}/native-editing`, { method: "PATCH", body: JSON.stringify({ enabled }) });
}

export async function previewScheduleEdits(versionId: string, batch: ScheduleEditBatch): Promise<CpmResult> {
  return apiJson(`/schedules/versions/${versionId}/preview`, { method: "POST", body: JSON.stringify(batch) });
}

export async function applyScheduleEdits(versionId: string, batch: ScheduleEditBatch): Promise<ScheduleEditResult> {
  return apiJson(`/schedules/versions/${versionId}/apply`, { method: "POST", body: JSON.stringify(batch) });
}

export async function recomputeVersion(versionId: string): Promise<ScheduleEditResult> {
  return apiJson(`/schedules/versions/${versionId}/recompute`, { method: "POST" });
}

/** Fetches the MS Project XML export and triggers a browser download -- there's no in-app viewer for it (unlike PDFs), it's meant for round-tripping into another scheduling tool. */
export async function downloadScheduleXml(versionId: string, fileName: string): Promise<void> {
  const res = await apiFetch(`/schedules/versions/${versionId}/export.xml`);
  if (!res.ok) throw new Error("export_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
