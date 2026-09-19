interface Series {
  label: string;
  color: string;
}

interface Props {
  data: { label: string; a: number; b: number }[];
  seriesA: Series;
  seriesB: Series;
  /** Formats an x-axis tick (e.g. a week-start ISO date) for display. */
  formatLabel: (label: string) => string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PADDING_LEFT = 28;
const PADDING_BOTTOM = 22;
const PADDING_TOP = 8;

/**
 * A hand-rolled inline-SVG grouped bar chart -- no charting library
 * dependency, matching the Gantt module's own hand-rolled canvas
 * timeline (docs/ROADMAP.md Phase 11b) rather than adding one for a
 * handful of chart types.
 */
export function TrendBarChart({ data, seriesA, seriesB, formatLabel }: Props) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const plotWidth = WIDTH - PADDING_LEFT - 8;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const groupWidth = plotWidth / data.length;
  const barWidth = Math.max(2, groupWidth / 2 - 3);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`${seriesA.label} vs ${seriesB.label} over time`}>
        {[0, 0.5, 1].map((f) => {
          const y = PADDING_TOP + plotHeight * (1 - f);
          return (
            <g key={f}>
              <line x1={PADDING_LEFT} x2={WIDTH - 4} y1={y} y2={y} stroke="#eef1f8" strokeWidth={1} />
              <text x={PADDING_LEFT - 4} y={y + 3} fontSize={9} textAnchor="end" fill="#6f88b8">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = PADDING_LEFT + i * groupWidth;
          const aHeight = (d.a / max) * plotHeight;
          const bHeight = (d.b / max) * plotHeight;
          const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
          return (
            <g key={d.label}>
              <rect x={x + 2} y={PADDING_TOP + plotHeight - aHeight} width={barWidth} height={aHeight} fill={seriesA.color} rx={1} />
              <rect x={x + barWidth + 4} y={PADDING_TOP + plotHeight - bHeight} width={barWidth} height={bHeight} fill={seriesB.color} rx={1} />
              {showLabel && (
                <text x={x + groupWidth / 2} y={HEIGHT - 6} fontSize={9} textAnchor="middle" fill="#6f88b8">
                  {formatLabel(d.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-navy-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: seriesA.color }} />
          {seriesA.label}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: seriesB.color }} />
          {seriesB.label}
        </span>
      </div>
    </div>
  );
}
