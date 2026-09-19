export interface WeeklyBucket {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this week, UTC. */
  weekStart: string;
  count: number;
}

export interface MonthlyTotal {
  /** "YYYY-MM", UTC. */
  month: string;
  total: number;
}

function startOfIsoWeekUtc(d: Date): Date {
  const dayIndex = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayIndex));
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Buckets timestamps into `weeks` consecutive Mon-Sun weeks (UTC) ending
 * with the week containing `now`, oldest first. Every week in range
 * appears even with zero matches -- a trend chart should show a quiet
 * week as a real zero, not silently skip it.
 */
export function bucketByWeek(timestamps: readonly Date[], weeks: number, now: Date = new Date()): WeeklyBucket[] {
  const currentWeekStart = startOfIsoWeekUtc(now);
  const buckets: WeeklyBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    buckets.push({ weekStart: weekStart.toISOString().slice(0, 10), count: 0 });
  }
  const indexByWeekStart = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const ts of timestamps) {
    const key = startOfIsoWeekUtc(ts).toISOString().slice(0, 10);
    const idx = indexByWeekStart.get(key);
    if (idx !== undefined) {
      const bucket = buckets[idx];
      if (bucket) bucket.count++;
    }
  }
  return buckets;
}

/**
 * Sums `amount` per calendar month (UTC) over the last `months` months
 * ending with the month containing `now`, oldest first -- every month in
 * range appears, with total 0 if nothing landed in it.
 */
export function bucketSumByMonth(entries: readonly { date: Date; amount: number }[], months: number, now: Date = new Date()): MonthlyTotal[] {
  const currentMonthStart = startOfMonthUtc(now);
  const buckets: MonthlyTotal[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - i, 1));
    buckets.push({ month: monthStart.toISOString().slice(0, 7), total: 0 });
  }
  const indexByMonth = new Map(buckets.map((b, i) => [b.month, i]));
  for (const entry of entries) {
    const key = startOfMonthUtc(entry.date).toISOString().slice(0, 7);
    const idx = indexByMonth.get(key);
    if (idx !== undefined) {
      const bucket = buckets[idx];
      if (bucket) bucket.total += entry.amount;
    }
  }
  return buckets;
}

/** Mean of a set of millisecond durations, expressed in days -- null for an empty set rather than NaN, since "no data yet" and "zero days" mean different things to a chart. */
export function averageDurationDays(durationsMs: readonly number[]): number | null {
  if (durationsMs.length === 0) return null;
  const avgMs = durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length;
  return avgMs / (1000 * 60 * 60 * 24);
}
