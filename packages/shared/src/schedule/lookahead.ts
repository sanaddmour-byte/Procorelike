/**
 * Look-ahead window filtering and PPC (Last Planner) computation --
 * Addendum A6, Phase 11c. Pure functions: no I/O, no database access, so
 * the "which tasks fall in this window" and "what's this company's PPC"
 * logic is unit-testable without a real schedule.
 */

export interface LookaheadTask {
  id: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
}

export interface LookaheadWindow {
  /** ISO date (YYYY-MM-DD), the window's first day. */
  weekStart: string;
  horizonWeeks: number;
}

/**
 * Tasks whose planned (falling back to early) date range overlaps the
 * [weekStart, weekStart + horizonWeeks*7) window -- not just tasks that
 * *start* in the window, so a task already underway that finishes inside
 * it still shows up on a foreman's near-term list.
 */
export function filterLookaheadWindow<T extends LookaheadTask>(tasks: T[], window: LookaheadWindow): T[] {
  const windowStart = new Date(`${window.weekStart}T00:00:00.000Z`).getTime();
  const windowEnd = windowStart + window.horizonWeeks * 7 * 24 * 60 * 60 * 1000;

  return tasks.filter((task) => {
    const startStr = task.plannedStart ?? task.earlyStart;
    const finishStr = task.plannedFinish ?? task.earlyFinish;
    if (!startStr || !finishStr) return false;
    const start = new Date(startStr).getTime();
    const finish = new Date(finishStr).getTime();
    return start < windowEnd && finish >= windowStart;
  });
}

export interface PpcCommitment {
  committedByCompanyId: string;
  promisedFinish: string;
  actualFinish: string | null;
}

export interface CompanyPpc {
  companyId: string;
  met: number;
  missed: number;
  /** Commitments not yet due (promisedFinish is still in the future as of `asOfDate`) -- not scored either way. */
  pending: number;
  /** null when there are no due (met + missed) commitments yet to score. */
  ppcPercent: number | null;
}

/**
 * Percent Plan Complete per company, Last Planner style: of the
 * commitments *due* as of `asOfDate` (promisedFinish has passed), what
 * fraction were completed on or before the promised date? A commitment
 * whose promised date hasn't arrived yet is "pending" and excluded from
 * the ratio -- it hasn't had the chance to be met or missed.
 */
export function computePpc(commitments: PpcCommitment[], asOfDate: string): CompanyPpc[] {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  const byCompany = new Map<string, CompanyPpc>();

  for (const c of commitments) {
    let entry = byCompany.get(c.committedByCompanyId);
    if (!entry) {
      entry = { companyId: c.committedByCompanyId, met: 0, missed: 0, pending: 0, ppcPercent: null };
      byCompany.set(c.committedByCompanyId, entry);
    }

    const promisedTime = new Date(`${c.promisedFinish}T00:00:00.000Z`).getTime();
    const isDue = promisedTime <= asOf;
    if (!isDue) {
      entry.pending++;
      continue;
    }
    const metOnTime = c.actualFinish !== null && new Date(`${c.actualFinish}T00:00:00.000Z`).getTime() <= promisedTime;
    if (metOnTime) entry.met++;
    else entry.missed++;
  }

  for (const entry of byCompany.values()) {
    const total = entry.met + entry.missed;
    entry.ppcPercent = total > 0 ? Math.round((entry.met / total) * 100) : null;
  }

  return [...byCompany.values()];
}
