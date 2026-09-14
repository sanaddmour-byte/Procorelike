"use client";

import { ImpactPreviewModal, buildImpactRows, type ImpactRow } from "@/components/gantt/ImpactPreviewModal";
import { ScheduleImportForm } from "@/components/gantt/ScheduleImportForm";
import { TaskGrid, type TaskGridHandle } from "@/components/gantt/TaskGrid";
import { Timeline, type TimelineHandle } from "@/components/gantt/Timeline";
import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { toGanttTask, type ApiScheduleTask } from "@/lib/gantt/api";
import {
  applyScheduleEdits,
  downloadScheduleXml,
  previewScheduleEdits,
  setNativeEditingEnabled,
  type ScheduleEditBatch,
} from "@/lib/gantt/edit-api";
import { EMPTY_GANTT_FILTERS, applyGanttFilters, type GanttFilters } from "@/lib/gantt/filter";
import { dateToX, timelineEnd, timelineOrigin, type ZoomLevel } from "@/lib/gantt/timescale";
import { flattenWbsTree } from "@/lib/gantt/tree";
import type { GanttDependency, GanttDragEdit } from "@/lib/gantt/types";
import { useViewportHeight } from "@/lib/gantt/useViewportHeight";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface CurrentScheduleResponse {
  schedule: { id: string; sourceTool: string; nativeEditingEnabled: boolean };
  version: { id: string; versionNo: number; dataDate: string };
  tasks: ApiScheduleTask[];
  dependencies: GanttDependency[];
}

interface PendingEdit {
  batch: ScheduleEditBatch;
  impactRows: ImpactRow[];
  cycleTaskNames: string[] | null;
  /** What an undo of this edit (once applied) needs to send back -- captured before the edit, since a link's own inverse (the new dependency's id) is only known after apply. */
  inverse: { taskEdits?: ScheduleEditBatch["taskEdits"] } | { linkPredecessorId: string; linkSuccessorId: string; linkType: "FS" };
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter", "year"];
const ZOOM_LABEL_KEYS: Record<ZoomLevel, "zoomDay" | "zoomWeek" | "zoomMonth" | "zoomQuarter" | "zoomYear"> = {
  day: "zoomDay",
  week: "zoomWeek",
  month: "zoomMonth",
  quarter: "zoomQuarter",
  year: "zoomYear",
};

export default function GanttPage() {
  const t = useTranslations("Gantt");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [data, setData] = useState<CurrentScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [scrollTop, setScrollTop] = useState(0);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [filters, setFilters] = useState<GanttFilters>(EMPTY_GANTT_FILTERS);
  const gridRef = useRef<TaskGridHandle>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const height = useViewportHeight(280);

  // Phase 11d: feature-flagged native CPM editing.
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [applying, setApplying] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [undoStack, setUndoStack] = useState<ScheduleEditBatch[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  function load(): void {
    setLoading(true);
    apiJson<CurrentScheduleResponse>(`/schedules/current?projectId=${params.id}`)
      .then((res) => {
        setData(res);
        setShowImportForm(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 404) {
          setData(null);
          return;
        }
        setError(tc("errorGeneric"));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, params.id]);

  const allTasks = useMemo(() => (data ? data.tasks.map(toGanttTask) : []), [data]);
  const filteredTasks = useMemo(() => applyGanttFilters(allTasks, filters), [allTasks, filters]);
  const rows = useMemo(() => flattenWbsTree(filteredTasks, collapsedIds), [filteredTasks, collapsedIds]);

  // The timeline's date range always reflects the full schedule, not the filtered subset -- filtering hides rows, it shouldn't rescale the axis.
  const origin = useMemo(() => timelineOrigin(allTasks), [allTasks]);
  const totalWidth = useMemo(() => dateToX(timelineEnd(allTasks), origin, zoom), [allTasks, origin, zoom]);

  function toggleCollapse(id: string): void {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportPng(): void {
    const dataUrl = timelineRef.current?.exportPng();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `gantt-v${data?.version.versionNo ?? 1}.png`;
    link.click();
  }

  function handleExportXml(): void {
    if (!data) return;
    downloadScheduleXml(data.version.id, `schedule-v${data.version.versionNo}.xml`).catch(() => setEditError(tc("errorGeneric")));
  }

  async function handleToggleEditing(): Promise<void> {
    if (!data) return;
    setToggling(true);
    setEditError(null);
    try {
      const result = await setNativeEditingEnabled(data.schedule.id, !data.schedule.nativeEditingEnabled);
      setData((prev) => (prev ? { ...prev, schedule: { ...prev.schedule, nativeEditingEnabled: result.nativeEditingEnabled } } : prev));
    } catch {
      setEditError(tc("errorGeneric"));
    } finally {
      setToggling(false);
    }
  }

  async function handleDragEdit(edit: GanttDragEdit): Promise<void> {
    if (!data) return;
    setEditError(null);

    let batch: ScheduleEditBatch;
    let inverse: PendingEdit["inverse"];

    if (edit.kind === "link") {
      batch = { dependencyAdds: [{ predecessorId: edit.predecessorId, successorId: edit.successorId, type: "FS", lagMinutes: 0 }] };
      inverse = { linkPredecessorId: edit.predecessorId, linkSuccessorId: edit.successorId, linkType: "FS" };
    } else {
      const original = allTasks.find((t) => t.id === edit.taskId);
      if (!original) return;
      if (edit.kind === "move") {
        batch = { taskEdits: [{ taskId: edit.taskId, constraintType: "mso", constraintDate: edit.newStartDate.toISOString() }] };
        inverse = {
          taskEdits: [{ taskId: edit.taskId, constraintType: original.constraintType, constraintDate: original.constraintDate }],
        };
      } else {
        batch = { taskEdits: [{ taskId: edit.taskId, durationMinutes: edit.newDurationMinutes }] };
        inverse = { taskEdits: [{ taskId: edit.taskId, durationMinutes: original.durationMinutes ?? 0 }] };
      }
    }

    try {
      const preview = await previewScheduleEdits(data.version.id, batch);
      const cycleTaskNames = preview.cycle
        ? preview.cycle.taskIds.map((id) => allTasks.find((t) => t.id === id)?.name ?? id)
        : null;
      setPendingEdit({ batch, impactRows: buildImpactRows(rows, preview.tasks), cycleTaskNames, inverse });
    } catch {
      setEditError(tc("errorGeneric"));
    }
  }

  async function handleConfirmEdit(): Promise<void> {
    if (!data || !pendingEdit) return;
    setApplying(true);
    setEditError(null);
    try {
      const result = await applyScheduleEdits(data.version.id, pendingEdit.batch);
      setData((prev) => (prev ? { ...prev, tasks: result.tasks, dependencies: result.dependencies } : prev));

      const inverse = pendingEdit.inverse;
      let inverseBatch: ScheduleEditBatch;
      if ("linkPredecessorId" in inverse) {
        const created = result.dependencies.find(
          (d) => d.predecessorId === inverse.linkPredecessorId && d.successorId === inverse.linkSuccessorId && d.type === inverse.linkType,
        );
        inverseBatch = created ? { dependencyRemoveIds: [created.id] } : {};
      } else {
        inverseBatch = { taskEdits: inverse.taskEdits };
      }
      setUndoStack((prev) => [...prev, inverseBatch]);
      setPendingEdit(null);
    } catch {
      setEditError(t("editFailed"));
    } finally {
      setApplying(false);
    }
  }

  function handleCancelEdit(): void {
    setPendingEdit(null);
  }

  async function handleUndo(): Promise<void> {
    if (!data || undoStack.length === 0) return;
    const batch = undoStack[undoStack.length - 1]!;
    setEditError(null);
    try {
      const result = await applyScheduleEdits(data.version.id, batch);
      setData((prev) => (prev ? { ...prev, tasks: result.tasks, dependencies: result.dependencies } : prev));
      setUndoStack((prev) => prev.slice(0, -1));
    } catch {
      setEditError(t("editFailed"));
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-[1600px] px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          {data && !showImportForm && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-navy-600">
                {t("versionLabel")} {data.version.versionNo} · {data.version.dataDate.slice(0, 10)}
              </span>
              <div className="flex overflow-hidden rounded-lg border-3 border-ink">
                {ZOOM_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => setZoom(level)}
                    className={`px-2 py-2 text-xs font-semibold ${
                      zoom === level ? "bg-navy-700 text-white" : "bg-white text-navy-800"
                    }`}
                  >
                    {t(ZOOM_LABEL_KEYS[level])}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExportPng}
                className="rounded-lg border-3 border-ink bg-white px-3 py-2 text-sm text-navy-800 brutal-interactive"
              >
                {t("exportPng")}
              </button>
              <button
                onClick={() => setShowImportForm(true)}
                className="rounded-lg border-3 border-ink bg-white px-3 py-2 text-sm text-navy-800 brutal-interactive"
              >
                {t("reimport")}
              </button>
              <button
                onClick={handleExportXml}
                className="rounded-lg border-3 border-ink bg-white px-3 py-2 text-sm text-navy-800 brutal-interactive"
              >
                {t("exportXml")}
              </button>
              <button
                onClick={handleToggleEditing}
                disabled={toggling}
                className={`rounded-lg border-3 border-ink px-3 py-2 text-sm brutal-interactive disabled:opacity-50 ${
                  data.schedule.nativeEditingEnabled ? "bg-navy-700 text-white" : "bg-white text-navy-800"
                }`}
              >
                {data.schedule.nativeEditingEnabled ? t("disableEditing") : t("enableEditing")}
              </button>
              {data.schedule.nativeEditingEnabled && (
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="rounded-lg border-3 border-ink bg-white px-3 py-2 text-sm text-navy-800 brutal-interactive disabled:opacity-40"
                >
                  {t("undo")}
                </button>
              )}
            </div>
          )}
        </div>

        {data && !showImportForm && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder={t("filterSearch")}
              className="rounded-lg border-3 border-ink px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-navy-800">
              <input
                type="checkbox"
                checked={filters.criticalOnly}
                onChange={(e) => setFilters((f) => ({ ...f, criticalOnly: e.target.checked }))}
              />
              {t("filterCriticalOnly")}
            </label>
            <select
              value={filters.companyId ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value || null }))}
              className="rounded-lg border-3 border-ink px-3 py-2 text-sm"
            >
              <option value="">{t("filterAllCompanies")}</option>
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
            {data.schedule.nativeEditingEnabled && <span className="text-xs text-navy-600">{t("editingHint")}</span>}
          </div>
        )}

        {loading && <p>{tc("loading")}</p>}
        {error && <p className="text-maroon-700">{error}</p>}
        {editError && <p className="mb-3 text-sm text-maroon-700">{editError}</p>}

        {!loading && !error && (!data || showImportForm) && <ScheduleImportForm projectId={params.id} onImported={load} />}

        {!loading && !error && data && !showImportForm && (
          <>
            {rows.length === 0 ? (
              <p className="text-navy-600">{allTasks.length === 0 ? t("empty") : t("emptyFiltered")}</p>
            ) : (
              <div className="flex min-w-0 overflow-hidden rounded-xl border-3 border-ink shadow-brutal-sm">
                <TaskGrid
                  ref={gridRef}
                  rows={rows}
                  height={height}
                  onToggleCollapse={toggleCollapse}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  locale={locale}
                  onScroll={setScrollTop}
                />
                <Timeline
                  ref={timelineRef}
                  rows={rows}
                  dependencies={data.dependencies}
                  origin={origin}
                  totalWidth={totalWidth}
                  listHeight={height}
                  scrollTop={scrollTop}
                  zoom={zoom}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  locale={locale}
                  gridColumnLabel={t("columnTask")}
                  editingEnabled={data.schedule.nativeEditingEnabled}
                  onDragEdit={handleDragEdit}
                />
              </div>
            )}
          </>
        )}
      </main>

      <ImpactPreviewModal
        open={pendingEdit !== null}
        rows={pendingEdit?.impactRows ?? []}
        cycleTaskNames={pendingEdit?.cycleTaskNames ?? null}
        locale={locale}
        busy={applying}
        onConfirm={handleConfirmEdit}
        onCancel={handleCancelEdit}
      />
    </>
  );
}
