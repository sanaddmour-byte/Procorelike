export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

/** Same buckets My Work uses, computed on the client for grouping a list by urgency. */
export function dueBucketOf(iso: string | null | undefined, now: Date = new Date()): DueBucket {
  if (!iso) return "none";
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (t < start) return "overdue";
  if (t < start + day) return "today";
  if (t < start + 7 * day) return "week";
  return "later";
}

export const DUE_BUCKET_ORDER: Record<DueBucket, string> = { overdue: "0", today: "1", week: "2", later: "3", none: "4" };
