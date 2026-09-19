interface Props {
  data: { month: string; total: number }[];
  formatValue: (n: number) => string;
}

const WIDTH = 640;
const HEIGHT = 180;
const PADDING_LEFT = 8;
const PADDING_BOTTOM = 32;
const PADDING_TOP = 14;

/** A single-series inline-SVG bar chart for the change-order cost-impact-by-month trend. */
export function MonthlyBarChart({ data, formatValue }: Props) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const plotWidth = WIDTH - PADDING_LEFT - 8;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const barSlot = plotWidth / data.length;
  const barWidth = Math.max(4, barSlot - 12);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Approved change order cost impact by month">
      {data.map((d, i) => {
        const x = PADDING_LEFT + i * barSlot + (barSlot - barWidth) / 2;
        const h = (d.total / max) * plotHeight;
        return (
          <g key={d.month}>
            <rect x={x} y={PADDING_TOP + plotHeight - h} width={barWidth} height={Math.max(h, 0)} fill="#8a2332" rx={2} />
            {d.total > 0 && (
              <text x={x + barWidth / 2} y={PADDING_TOP + plotHeight - h - 4} fontSize={9} textAnchor="middle" fill="#5c1620">
                {formatValue(d.total)}
              </text>
            )}
            <text x={x + barWidth / 2} y={HEIGHT - 12} fontSize={9} textAnchor="middle" fill="#6f88b8">
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
