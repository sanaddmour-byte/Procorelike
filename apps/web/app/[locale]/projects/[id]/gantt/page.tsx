"use client";

import { ScheduleImportForm } from "@/components/gantt/ScheduleImportForm";
import { TaskGrid, type TaskGridHandle } from "@/components/gantt/TaskGrid";
import { Timeline, type TimelineHandle } from "@/components/gantt/Timeline";
import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { toGanttTask, type ApiScheduleTask } from "@/lib/gantt/api";
import { EMPTY_GANTT_FILTERS, applyGanttFilters, type GanttFilters } from "@/lib/gantt/filter";
import { dateToX, timelineEnd, timelineOrigin, type ZoomLevel } from "@/lib/gantt/timescale";
import { flattenWbsTree } from "@/lib/gantt/tree";
import type { GanttDependency } from "@/lib/gantt/types";
import { useViewportHeight } from "@/lib/gantt/useViewportHeight";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface CurrentScheduleResponse {
  schedule: { id: string; sourceTool: string };
  version: { id: string; versionNo: number; dataDate: string };
  tasks: ApiScheduleTask[];
  dependencies: GanttDependency[];
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
          </div>
        )}

        {loading && <p>{tc("loading")}</p>}
        {error && <p className="text-maroon-700">{error}</p>}

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
                />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
