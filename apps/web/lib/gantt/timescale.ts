export type ZoomLevel = "day" | "week" | "month" | "quarter" | "year";

const PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 32,
  week: 12,
  month: 4,
  quarter: 1.6,
  year: 0.5,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The canvas's own coordinate origin -- day 0 of the timeline, so every date maps to a small, stable pixel offset regardless of the calendar year. */
export function timelineOrigin(tasks: { plannedStart: string | null; earlyStart: string | null }[]): Date {
  const dates = tasks
    .map((t) => t.plannedStart ?? t.earlyStart)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  if (dates.length === 0) return new Date();
  return new Date(Math.min(...dates) - 7 * MS_PER_DAY); // a week of leading margin
}

export function dateToX(date: Date, origin: Date, zoom: ZoomLevel): number {
  const days = (date.getTime() - origin.getTime()) / MS_PER_DAY;
  return days * PIXELS_PER_DAY[zoom];
}

export function xToDate(x: number, origin: Date, zoom: ZoomLevel): Date {
  const days = x / PIXELS_PER_DAY[zoom];
  return new Date(origin.getTime() + days * MS_PER_DAY);
}

export function pixelsPerDay(zoom: ZoomLevel): number {
  return PIXELS_PER_DAY[zoom];
}

export interface DateRange {
  start: Date;
  finish: Date;
}

/** A task's displayable date span -- planned dates, falling back to early dates when a schedule has no planned (baseline) pass yet. Returns null for a task with neither (e.g. an unscheduled placeholder row). */
export function taskDateRange(task: {
  plannedStart: string | null;
  plannedFinish: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
}): DateRange | null {
  const startStr = task.plannedStart ?? task.earlyStart;
  const finishStr = task.plannedFinish ?? task.earlyFinish;
  if (!startStr || !finishStr) return null;
  return { start: new Date(startStr), finish: new Date(finishStr) };
}

/** The latest finish date across all tasks, plus a week of trailing margin -- the far edge of the scrollable timeline range (see timelineOrigin() for the near edge). */
export function timelineEnd(tasks: { plannedFinish: string | null; earlyFinish: string | null }[]): Date {
  const dates = tasks
    .map((t) => t.plannedFinish ?? t.earlyFinish)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  if (dates.length === 0) return new Date(Date.now() + 30 * MS_PER_DAY);
  return new Date(Math.max(...dates) + 7 * MS_PER_DAY);
}

export interface TimescaleTick {
  x: number;
  label: string;
  isMajor: boolean;
}

/** Header ticks for the visible window [startX, endX], one per the zoom level's natural unit (day/week/month/quarter/year). */
export function generateTicks(origin: Date, zoom: ZoomLevel, startX: number, endX: number, locale: string): TimescaleTick[] {
  const ticks: TimescaleTick[] = [];
  const startDate = xToDate(startX - pixelsPerDay(zoom) * 32, origin, zoom); // a bit of overscan
  const endDate = xToDate(endX + pixelsPerDay(zoom) * 32, origin, zoom);

  if (zoom === "day") {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    while (d.getTime() <= endDate.getTime()) {
      ticks.push({ x: dateToX(d, origin, zoom), label: d.toLocaleDateString(locale, { day: "numeric", month: "short" }), isMajor: d.getUTCDay() === 0 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (zoom === "week") {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
    while (d.getTime() <= endDate.getTime()) {
      ticks.push({ x: dateToX(d, origin, zoom), label: d.toLocaleDateString(locale, { day: "numeric", month: "short" }), isMajor: d.getUTCDate() <= 7 });
      d.setUTCDate(d.getUTCDate() + 7);
    }
  } else if (zoom === "month") {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    while (d.getTime() <= endDate.getTime()) {
      ticks.push({ x: dateToX(d, origin, zoom), label: d.toLocaleDateString(locale, { month: "short", year: "numeric" }), isMajor: d.getUTCMonth() === 0 });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else if (zoom === "quarter") {
    const startQuarterMonth = Math.floor(startDate.getUTCMonth() / 3) * 3;
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startQuarterMonth, 1));
    while (d.getTime() <= endDate.getTime()) {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      ticks.push({ x: dateToX(d, origin, zoom), label: `Q${q} ${d.getUTCFullYear()}`, isMajor: q === 1 });
      d.setUTCMonth(d.getUTCMonth() + 3);
    }
  } else {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), 0, 1));
    while (d.getTime() <= endDate.getTime()) {
      ticks.push({ x: dateToX(d, origin, zoom), label: String(d.getUTCFullYear()), isMajor: true });
      d.setUTCFullYear(d.getUTCFullYear() + 1);
    }
  }
  return ticks;
}
