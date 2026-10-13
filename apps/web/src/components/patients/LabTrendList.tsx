import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { LabTrend, LabTrendDirection } from '@docbrain/shared';
import { Badge } from '@/components/ui/badge';
import { formatClinicalDate, recordAnchor } from '@/lib/clinical-format';
import { cn } from '@/lib/utils';

const WIDTH = 140;
const HEIGHT = 40;
const PADDING = 4;

const DIRECTION_ICONS: Readonly<Record<LabTrendDirection, typeof ArrowRight>> = {
  RISING: ArrowUpRight,
  FALLING: ArrowDownRight,
  STABLE: ArrowRight,
};

/**
 * A small line of the series with the reference range shaded behind it. Drawn
 * as inline SVG rather than pulling in a chart library for one sparkline.
 */
const Sparkline = ({ trend }: { trend: LabTrend }) => {
  const values = trend.points.map(({ value }) => value);
  const bounds = [...values, trend.referenceLow, trend.referenceHigh].filter(
    (value): value is number => value !== null,
  );
  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
  const span = max - min || 1;

  const x = (index: number) =>
    values.length === 1
      ? WIDTH / 2
      : PADDING + (index / (values.length - 1)) * (WIDTH - 2 * PADDING);
  const y = (value: number) => HEIGHT - PADDING - ((value - min) / span) * (HEIGHT - 2 * PADDING);

  // An open-ended range ("< 100") shades to the edge of the chart
  const bandTop = trend.referenceHigh === null ? 0 : y(trend.referenceHigh);
  const bandBottom = trend.referenceLow === null ? HEIGHT : y(trend.referenceLow);
  const series = values
    .map((value) => `${value}${trend.unit ? ` ${trend.unit}` : ''}`)
    .join(', then ');

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`${trend.testName} over time: ${series}`}
      className="shrink-0"
    >
      <rect
        x={0}
        y={bandTop}
        width={WIDTH}
        height={Math.max(bandBottom - bandTop, 0)}
        className="fill-emerald-500/15"
      />
      <polyline
        points={values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
        fill="none"
        strokeWidth={2}
        className={cn(trend.isLatestOutOfRange ? 'stroke-destructive' : 'stroke-foreground')}
      />
      {values.map((value, index) => (
        <circle
          key={trend.points[index].id}
          cx={x(index)}
          cy={y(value)}
          r={2.5}
          className={cn(trend.isLatestOutOfRange ? 'fill-destructive' : 'fill-foreground')}
        />
      ))}
    </svg>
  );
};

const formatRange = ({ referenceLow, referenceHigh, unit }: LabTrend): string => {
  if (referenceLow !== null && referenceHigh !== null)
    return `${referenceLow}–${referenceHigh} ${unit}`;
  if (referenceHigh !== null) return `< ${referenceHigh} ${unit}`;
  if (referenceLow !== null) return `> ${referenceLow} ${unit}`;
  return 'no range';
};

const LabTrendRow = ({ trend }: { trend: LabTrend }) => {
  const DirectionIcon = DIRECTION_ICONS[trend.direction];
  const latest = trend.points[trend.points.length - 1];

  return (
    <li
      className={cn(
        'flex items-center gap-4 rounded-md border p-3',
        // Fade only what is both outside the lens and normal
        !trend.isRelevant && !trend.isLatestOutOfRange && 'opacity-70',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {trend.testName}
          {trend.isLatestOutOfRange && <Badge variant="destructive">out of range</Badge>}
        </p>
        <p className="text-sm">
          {trend.points.map(({ id, value }, index) => (
            <span key={id}>
              {index > 0 && <span className="text-muted-foreground"> → </span>}
              <a
                href={`#${recordAnchor('LAB_RESULT', id)}`}
                className={cn(
                  'rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  index === trend.points.length - 1 && 'font-semibold',
                )}
              >
                {value}
              </a>
            </span>
          ))}{' '}
          <span className="text-muted-foreground">{trend.unit}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Latest {formatClinicalDate(latest.collectedAt)} · Normal {formatRange(trend)}
        </p>
      </div>
      <Sparkline trend={trend} />
      <DirectionIcon
        className={cn(
          'h-5 w-5 shrink-0',
          trend.isLatestOutOfRange ? 'text-destructive' : 'text-muted-foreground',
        )}
        aria-label={trend.direction.toLowerCase()}
      />
    </li>
  );
};

export const LabTrendList = ({ trends }: { trends: readonly LabTrend[] }) => (
  <section aria-labelledby="labs-heading" className="space-y-2">
    <h2 id="labs-heading" className="text-sm font-semibold">
      Lab trends
    </h2>
    {trends.length === 0 ? (
      <p className="text-sm text-muted-foreground">No lab results on file.</p>
    ) : (
      <ul className="space-y-2">
        {trends.map((trend) => (
          <LabTrendRow key={trend.testCode} trend={trend} />
        ))}
      </ul>
    )}
  </section>
);
