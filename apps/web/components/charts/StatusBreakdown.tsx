interface Props {
  byStatus: Record<string, number>;
}

/** A horizontal bar-per-status breakdown -- status values are shown raw (not localized), same convention WorkflowRulesSection already uses for status strings. */
export function StatusBreakdown({ byStatus }: Props) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));

  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([status, count]) => (
        <li key={status} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate capitalize text-navy-700">{status.replace(/_/g, " ")}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-navy-50">
            <span className="block h-full rounded-full bg-maroon-500" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="w-6 shrink-0 text-end font-semibold text-navy-800">{count}</span>
        </li>
      ))}
    </ul>
  );
}
