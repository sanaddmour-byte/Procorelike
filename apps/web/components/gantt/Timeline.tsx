"use client";

import { GRID_WIDTH, HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/gantt/constants";
import { dateToX, generateTicks, taskDateRange, type ZoomLevel } from "@/lib/gantt/timescale";
import type { GanttDependency, GanttRow } from "@/lib/gantt/types";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent } from "react";

/** Mirrors apps/web/tailwind.config.ts -- canvas drawing can't reach Tailwind classes, so the palette is duplicated here on purpose. */
const COLOR = {
  gridLine: "#e7ddc9",
  gridLineMajor: "#d8c9a8",
  headerBg: "#fbf4e8",
  headerBorder: "#171310",
  headerText: "#0d182d",
  bar: "#1f3564",
  barProgress: "#13213f",
  barCritical: "#8a2332",
  barCriticalProgress: "#5c1620",
  summaryBar: "#0d182d",
  milestone: "#c46672",
  milestoneCritical: "#5c1620",
  dependency: "#6f88b8",
  selected: "#ea580c",
};

export interface TimelineHandle {
  /** A PNG snapshot of the currently visible view (rows + date window) -- not the full schedule, see docs/SCHEDULING.md's Phase 11b scope notes. Returns null before the pane has measured itself. */
  exportPng: () => string | null;
}

interface TimelineProps {
  rows: GanttRow[];
  dependencies: GanttDependency[];
  origin: Date;
  totalWidth: number;
  listHeight: number;
  scrollTop: number;
  zoom: ZoomLevel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  locale: string;
  gridColumnLabel: string;
}

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  { rows, dependencies, origin, totalWidth, listHeight, scrollTop, zoom, selectedId, onSelect, locale, gridColumnLabel },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const totalHeight = HEADER_HEIGHT + listHeight;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    setViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.id, index));
    return map;
  }, [rows]);

  // Resizing the canvas backing store clears it and is comparatively expensive, so it only
  // happens when the pane's actual pixel dimensions change -- not on every scroll frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = totalHeight * dpr;
  }, [viewportWidth, totalHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, viewportWidth, totalHeight);

    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
    const endIndex = Math.min(rows.length, Math.ceil((scrollTop + listHeight) / ROW_HEIGHT) + 2);

    const ticks = generateTicks(origin, zoom, scrollLeft, scrollLeft + viewportWidth, locale);

    // Vertical grid lines (behind the bars), full body height.
    for (const tick of ticks) {
      const x = tick.x - scrollLeft;
      ctx.strokeStyle = tick.isMajor ? COLOR.gridLineMajor : COLOR.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, HEADER_HEIGHT);
      ctx.lineTo(x + 0.5, totalHeight);
      ctx.stroke();
    }

    // Row stripes + bars.
    for (let i = startIndex; i < endIndex; i++) {
      const row = rows[i];
      if (!row) continue;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT - scrollTop;

      ctx.fillStyle = row.id === selectedId ? "#ffedd5" : i % 2 === 0 ? "#ffffff" : "#fbf4e8";
      ctx.fillRect(0, y, viewportWidth, ROW_HEIGHT);

      const range = taskDateRange(row);
      if (!range) continue;
      const x1 = dateToX(range.start, origin, zoom) - scrollLeft;
      const x2 = dateToX(range.finish, origin, zoom) - scrollLeft;

      if (row.taskType === "milestone") {
        const cx = x1;
        const cy = y + ROW_HEIGHT / 2;
        const half = 6;
        ctx.fillStyle = row.isCritical ? COLOR.milestoneCritical : COLOR.milestone;
        ctx.beginPath();
        ctx.moveTo(cx, cy - half);
        ctx.lineTo(cx + half, cy);
        ctx.lineTo(cx, cy + half);
        ctx.lineTo(cx - half, cy);
        ctx.closePath();
        ctx.fill();
      } else if (row.taskType === "summary" || row.taskType === "wbs") {
        const barY = y + ROW_HEIGHT / 2 - 3;
        const width = Math.max(x2 - x1, 2);
        ctx.fillStyle = COLOR.summaryBar;
        ctx.fillRect(x1, barY, width, 6);
        ctx.beginPath();
        ctx.moveTo(x1, barY + 6);
        ctx.lineTo(x1 - 5, barY + 12);
        ctx.lineTo(x1 + 5, barY + 12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x1 + width, barY + 6);
        ctx.lineTo(x1 + width - 5, barY + 12);
        ctx.lineTo(x1 + width + 5, barY + 12);
        ctx.closePath();
        ctx.fill();
      } else {
        const barY = y + 6;
        const barHeight = ROW_HEIGHT - 12;
        const width = Math.max(x2 - x1, 2);
        ctx.fillStyle = row.isCritical ? COLOR.barCritical : COLOR.bar;
        ctx.fillRect(x1, barY, width, barHeight);
        const progressWidth = (width * row.percentComplete) / 100;
        if (progressWidth > 0) {
          ctx.fillStyle = row.isCritical ? COLOR.barCriticalProgress : COLOR.barProgress;
          ctx.fillRect(x1, barY, progressWidth, barHeight);
        }
        if (row.id === selectedId) {
          ctx.strokeStyle = COLOR.selected;
          ctx.lineWidth = 2;
          ctx.strokeRect(x1, barY, width, barHeight);
        }
      }
    }

    // Dependency arrows -- only between predecessor/successor rows both currently rendered, to keep this bounded by viewport size rather than total dependency count.
    ctx.strokeStyle = COLOR.dependency;
    ctx.fillStyle = COLOR.dependency;
    ctx.lineWidth = 1.5;
    for (const dep of dependencies) {
      const predIndex = rowIndexById.get(dep.predecessorId);
      const succIndex = rowIndexById.get(dep.successorId);
      if (predIndex === undefined || succIndex === undefined) continue;
      if (predIndex < startIndex - 1 && succIndex < startIndex - 1) continue;
      if (predIndex > endIndex + 1 && succIndex > endIndex + 1) continue;
      const predRow = rows[predIndex];
      const succRow = rows[succIndex];
      if (!predRow || !succRow) continue;
      const predRange = taskDateRange(predRow);
      const succRange = taskDateRange(succRow);
      if (!predRange || !succRange) continue;

      const fromX = dateToX(predRange.finish, origin, zoom) - scrollLeft;
      const fromY = HEADER_HEIGHT + predIndex * ROW_HEIGHT - scrollTop + ROW_HEIGHT / 2;
      const toX = dateToX(succRange.start, origin, zoom) - scrollLeft;
      const toY = HEADER_HEIGHT + succIndex * ROW_HEIGHT - scrollTop + ROW_HEIGHT / 2;
      const midX = fromX + Math.max((toX - fromX) / 2, 10);

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(midX, fromY);
      ctx.lineTo(midX, toY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 5, toY - 4);
      ctx.lineTo(toX - 5, toY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Header band, drawn last so it always sits above the body content.
    ctx.fillStyle = COLOR.headerBg;
    ctx.fillRect(0, 0, viewportWidth, HEADER_HEIGHT);
    ctx.strokeStyle = COLOR.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT - 0.5);
    ctx.lineTo(viewportWidth, HEADER_HEIGHT - 0.5);
    ctx.stroke();
    ctx.fillStyle = COLOR.headerText;
    ctx.font = "600 11px var(--font-poppins), sans-serif";
    ctx.textBaseline = "middle";
    for (const tick of ticks) {
      const x = tick.x - scrollLeft;
      if (x < -60 || x > viewportWidth + 60) continue;
      ctx.fillText(tick.label, x + 4, HEADER_HEIGHT / 2);
    }
  }, [rows, dependencies, origin, zoom, scrollTop, scrollLeft, viewportWidth, listHeight, totalHeight, locale, selectedId, rowIndexById]);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: (): string | null => {
        const canvas = canvasRef.current;
        if (!canvas || viewportWidth === 0) return null;
        const dpr = window.devicePixelRatio || 1;
        const width = GRID_WIDTH + viewportWidth;

        const out = document.createElement("canvas");
        out.width = width * dpr;
        out.height = totalHeight * dpr;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = "#fbf4e8";
        ctx.fillRect(0, 0, width, totalHeight);

        const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
        const endIndex = Math.min(rows.length, Math.ceil((scrollTop + listHeight) / ROW_HEIGHT));

        ctx.textBaseline = "middle";
        for (let i = startIndex; i < endIndex; i++) {
          const row = rows[i];
          if (!row) continue;
          const y = HEADER_HEIGHT + i * ROW_HEIGHT - scrollTop;
          ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#fbf4e8";
          ctx.fillRect(0, y, GRID_WIDTH, ROW_HEIGHT);

          const indent = 8 + row.depth * 14;
          const isGroup = row.taskType === "summary" || row.taskType === "wbs";
          ctx.fillStyle = COLOR.headerText;
          ctx.font = `${isGroup ? "600 " : ""}11px var(--font-poppins), sans-serif`;
          const name = row.taskType === "milestone" ? `◆ ${row.name}` : row.name;
          ctx.fillText(name, indent, y + ROW_HEIGHT / 2, GRID_WIDTH - indent - 90);

          ctx.font = "11px var(--font-poppins), sans-serif";
          const dateLabel = row.plannedStart ? new Date(row.plannedStart).toLocaleDateString(locale, { day: "2-digit", month: "short" }) : "";
          ctx.fillText(dateLabel, GRID_WIDTH - 86, y + ROW_HEIGHT / 2);
          ctx.fillText(`${row.percentComplete}%`, GRID_WIDTH - 34, y + ROW_HEIGHT / 2);
        }

        ctx.fillStyle = COLOR.headerBg;
        ctx.fillRect(0, 0, GRID_WIDTH, HEADER_HEIGHT);
        ctx.fillStyle = COLOR.headerText;
        ctx.font = "600 11px var(--font-poppins), sans-serif";
        ctx.fillText(gridColumnLabel, 8, HEADER_HEIGHT / 2);
        ctx.strokeStyle = COLOR.headerBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(GRID_WIDTH - 0.5, 0);
        ctx.lineTo(GRID_WIDTH - 0.5, totalHeight);
        ctx.stroke();

        // Reuses the timeline's already-rendered live frame rather than recomputing bars/ticks/dependencies from scratch.
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, GRID_WIDTH, 0, viewportWidth, totalHeight);

        return out.toDataURL("image/png");
      },
    }),
    [rows, listHeight, scrollTop, viewportWidth, totalHeight, locale, gridColumnLabel],
  );

  function handleScroll(): void {
    setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
  }

  function handleClick(e: MouseEvent<HTMLCanvasElement>): void {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    if (y < HEADER_HEIGHT) return;
    const index = Math.floor((y - HEADER_HEIGHT + scrollTop) / ROW_HEIGHT);
    const row = rows[index];
    if (row) onSelect(row.id);
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-x-auto overflow-y-hidden"
      style={{ height: totalHeight }}
    >
      <div style={{ width: Math.max(totalWidth, viewportWidth), height: totalHeight, position: "relative" }}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          style={{ position: "sticky", insetInlineStart: 0, top: 0, width: viewportWidth, height: totalHeight, display: "block" }}
        />
      </div>
    </div>
  );
});
