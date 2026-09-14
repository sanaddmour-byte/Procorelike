/**
 * Calendar-aware working-time date arithmetic for the CPM engine
 * (docs/SCHEDULING.md A4) -- pure functions, no I/O, no `Date.now()`,
 * deterministic regardless of the host machine's timezone (every date is
 * read/written via the UTC getters/setters so a test run in Amman and a
 * test run in UTC produce the same result).
 *
 * Working-day model: every working day is a single contiguous shift
 * starting at `DAY_START_HOUR` (08:00) and running for that calendar's
 * `hoursPerDay` (or an exception's `workingMinutes` override). The schema
 * has no shift-start-hour column, so this is a deliberate, documented
 * simplification rather than modelling arbitrary shift windows -- every
 * calendar in this app starts its working day at the same hour.
 */

export const DAY_START_HOUR = 8;

export interface CalendarException {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  isWorking: boolean;
  workingMinutes?: number;
}

export interface CalendarInput {
  hoursPerDay: number;
  /** Bitmask, bit 0 = Sunday ... bit 6 = Saturday. */
  workingDays: number;
  exceptions: CalendarException[];
}

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayStart(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, DAY_START_HOUR, 0, 0, 0));
}

function nextDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return toDateKey(next);
}

function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return toDateKey(prev);
}

/** Working minutes available on the given calendar date (0 if non-working). */
export function dayWorkingMinutes(calendar: CalendarInput, dateKey: string): number {
  const exception = calendar.exceptions.find((e) => e.date === dateKey);
  if (exception) {
    if (!exception.isWorking) return 0;
    return exception.workingMinutes ?? Math.round(calendar.hoursPerDay * 60);
  }
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const isWorking = ((calendar.workingDays >> dow) & 1) === 1;
  return isWorking ? Math.round(calendar.hoursPerDay * 60) : 0;
}

export function isWorkingDay(calendar: CalendarInput, date: Date): boolean {
  return dayWorkingMinutes(calendar, toDateKey(date)) > 0;
}

/** The [start, end) working window for a given calendar date, or null if it's a non-working day. */
function workingWindow(calendar: CalendarInput, dateKey: string): { start: Date; end: Date } | null {
  const minutes = dayWorkingMinutes(calendar, dateKey);
  if (minutes === 0) return null;
  const start = dayStart(dateKey);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

/** The next working day's window start at or after the given date key (searching forward, including same day). */
function nextWorkingWindowFrom(calendar: CalendarInput, dateKey: string): { dateKey: string; window: { start: Date; end: Date } } {
  let cursor = dateKey;
  // A schedule with every day non-working would loop forever; guard defensively.
  for (let i = 0; i < 3660; i++) {
    const window = workingWindow(calendar, cursor);
    if (window) return { dateKey: cursor, window };
    cursor = nextDateKey(cursor);
  }
  throw new Error("No working day found within 10 years -- calendar has no working days at all");
}

/** The previous working day's window end at or before the given date key (searching backward, including same day). */
function previousWorkingWindowFrom(calendar: CalendarInput, dateKey: string): { dateKey: string; window: { start: Date; end: Date } } {
  let cursor = dateKey;
  for (let i = 0; i < 3660; i++) {
    const window = workingWindow(calendar, cursor);
    if (window) return { dateKey: cursor, window };
    cursor = previousDateKey(cursor);
  }
  throw new Error("No working day found within 10 years -- calendar has no working days at all");
}

/** Snaps an instant forward to the next working instant (on or after `date`). Used to normalize a raw predecessor-driven date onto real working time before adding duration. */
export function snapForwardToWorkingInstant(calendar: CalendarInput, date: Date): Date {
  const dateKey = toDateKey(date);
  const window = workingWindow(calendar, dateKey);
  if (window) {
    if (date.getTime() < window.start.getTime()) return window.start;
    if (date.getTime() < window.end.getTime()) return date;
    // At or after today's window end -- move to the next working day.
    return nextWorkingWindowFrom(calendar, nextDateKey(dateKey)).window.start;
  }
  return nextWorkingWindowFrom(calendar, nextDateKey(dateKey)).window.start;
}

/** Snaps an instant backward to the previous working instant (on or before `date`). The mirror of snapForwardToWorkingInstant, used by the backward pass. */
export function snapBackwardToWorkingInstant(calendar: CalendarInput, date: Date): Date {
  const dateKey = toDateKey(date);
  const window = workingWindow(calendar, dateKey);
  if (window) {
    if (date.getTime() > window.end.getTime()) return window.end;
    if (date.getTime() > window.start.getTime()) return date;
    return previousWorkingWindowFrom(calendar, previousDateKey(dateKey)).window.end;
  }
  return previousWorkingWindowFrom(calendar, previousDateKey(dateKey)).window.end;
}

/**
 * Adds `minutes` of working time to `start`, skipping non-working days and
 * non-working hours. Negative minutes delegate to the backward equivalent.
 * This is forward-pass arithmetic: "3 days duration starting Thursday"
 * correctly skips Friday/Saturday on a Sun-Thu calendar instead of landing
 * mid-weekend.
 */
export function workingTimeAdd(calendar: CalendarInput, start: Date, minutes: number): Date {
  if (minutes === 0) return snapForwardToWorkingInstant(calendar, start);
  if (minutes < 0) return workingTimeSubtract(calendar, start, -minutes);

  let cursor = snapForwardToWorkingInstant(calendar, start);
  let remaining = minutes;
  for (let i = 0; i < 36600; i++) {
    const dateKey = toDateKey(cursor);
    const window = workingWindow(calendar, dateKey)!;
    const availableToday = (window.end.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= availableToday) {
      return new Date(cursor.getTime() + remaining * 60_000);
    }
    remaining -= availableToday;
    cursor = nextWorkingWindowFrom(calendar, nextDateKey(dateKey)).window.start;
  }
  throw new Error("workingTimeAdd exceeded iteration guard -- calendar likely has no working days");
}

/** The backward-pass mirror of workingTimeAdd: subtracts working time from `finish`, used to derive a start from a finish (e.g. lateStart from lateFinish). */
export function workingTimeSubtract(calendar: CalendarInput, finish: Date, minutes: number): Date {
  if (minutes === 0) return snapBackwardToWorkingInstant(calendar, finish);
  if (minutes < 0) return workingTimeAdd(calendar, finish, -minutes);

  let cursor = snapBackwardToWorkingInstant(calendar, finish);
  let remaining = minutes;
  for (let i = 0; i < 36600; i++) {
    const dateKey = toDateKey(cursor);
    const window = workingWindow(calendar, dateKey)!;
    const availableToday = (cursor.getTime() - window.start.getTime()) / 60_000;
    if (remaining <= availableToday) {
      return new Date(cursor.getTime() - remaining * 60_000);
    }
    remaining -= availableToday;
    cursor = previousWorkingWindowFrom(calendar, previousDateKey(dateKey)).window.end;
  }
  throw new Error("workingTimeSubtract exceeded iteration guard -- calendar likely has no working days");
}

/**
 * Working minutes between two instants on the given calendar (can be
 * negative if `end` precedes `start`). This is what "float" actually
 * means -- the calendar-time gap between early and late dates would
 * overstate float across a weekend/holiday, so every float value in the
 * CPM engine is computed via this function, never a raw millisecond diff.
 */
export function workingTimeBetween(calendar: CalendarInput, start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return -workingTimeBetween(calendar, end, start);
  if (end.getTime() === start.getTime()) return 0;

  let cursor = start;
  let total = 0;
  for (let i = 0; i < 36600; i++) {
    const dateKey = toDateKey(cursor);
    const window = workingWindow(calendar, dateKey);
    if (window) {
      const segmentEnd = end.getTime() < window.end.getTime() ? end : window.end;
      if (segmentEnd.getTime() > cursor.getTime()) {
        total += (segmentEnd.getTime() - cursor.getTime()) / 60_000;
      }
      if (end.getTime() <= window.end.getTime()) return total;
      cursor = nextWorkingWindowFrom(calendar, nextDateKey(dateKey)).window.start;
    } else {
      cursor = nextWorkingWindowFrom(calendar, nextDateKey(dateKey)).window.start;
    }
    if (cursor.getTime() >= end.getTime()) return total;
  }
  throw new Error("workingTimeBetween exceeded iteration guard -- calendar likely has no working days");
}
