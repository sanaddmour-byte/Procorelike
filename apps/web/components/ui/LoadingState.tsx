/** Skeleton rows for a table/list mid-load -- communicates "content is coming, here's its shape" rather than a spinner or bare "Loading…" text. */
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-navy-100/70" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}
