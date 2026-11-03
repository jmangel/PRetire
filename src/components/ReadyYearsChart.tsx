import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReadyYearBar, ReadyYearSummary } from "../calculators/ReadyLine";

/*
 * When the futures are ready to retire, one bar per year: the picture of the
 * "half of these futures are ready between..." summary, so it sits right
 * under it, above the balance chart. It shares the balance chart's years,
 * margins and y-axis width, and spaces the years the same way (a point scale,
 * like a line chart), so a year lines up with the same year on that chart.
 */

// Blue and orange stay apart for every common kind of color blindness.
const LASTS_COLOR = '#2a78d6';
const RUNS_OUT_COLOR = '#d0620d';
// The card's background, drawn between bars and between stacked segments.
const GAP_COLOR = '#f8f9fa';
const MUTED = '#6c757d';

/** Share (0 to 1) as a percentage, with a decimal for small shares. */
export const formatShare = (share: number) => {
  const percentage = share * 100;
  if (percentage === 0) return '0%';
  if (percentage < 0.1) return '<0.1%';
  return `${percentage < 10 ? percentage.toFixed(1) : Math.round(percentage)}%`;
};

/** Plain-language note on the futures that aren't in any bar. */
export const notReadyNote = (
  summary: Pick<ReadyYearSummary, 'neverReady' | 'forcedOut' | 'ranOutWhileWorking'>,
  endYear: number,
  workEndYear?: number
): string | undefined => {
  const { neverReady, forcedOut, ranOutWhileWorking } = summary;
  const forced = workEndYear !== undefined ? forcedOut : 0;
  const notReadyByEnd = Math.max(0, neverReady - forced - ranOutWhileWorking);
  const parts = [
    forced > 0 && `${formatShare(forced)} stop working in ${workEndYear} without being ready`,
    ranOutWhileWorking > 0 && `${formatShare(ranOutWhileWorking)} run out of money while still working`,
    notReadyByEnd > 0 && `${formatShare(notReadyByEnd)} aren't ready before ${endYear}`,
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return undefined;
  return `Not in any bar: ${parts.join('; ')}.`;
};

export const ReadyYearTooltip = ({ active, label, bars }: {
  active?: boolean;
  label?: number | string;
  bars: Record<number, ReadyYearBar>;
}) => {
  const bar = label === undefined ? undefined : bars[Number(label)];
  if (!active || !bar) return null;
  const total = bar.lasts + bar.runsOut;
  return (
    <div className="bg-white border rounded px-2 py-1 small">
      <p className="mb-0 fw-bold">Ready at the end of {bar.year}</p>
      {total === 0 ? (
        <p className="mb-0">No futures</p>
      ) : (
        <>
          <p className="mb-0">{formatShare(total)} of futures</p>
          <p className="mb-0">Money lasts: {formatShare(bar.lasts)}</p>
          <p className="mb-0">Runs out later: {formatShare(bar.runsOut)}</p>
        </>
      )}
    </div>
  );
};

// Up to one decimal, so ticks like 2.5% don't round to 3%.
export const percentTick = (value: number) => `${Number((value * 100).toFixed(1))}%`;

// Legend text stays in the body color; the square beside it shows the series.
const legendText = (value: string) => <span className="text-body">{value}</span>;

type Props = {
  bars: ReadyYearBar[];
  summary: ReadyYearSummary;
  endYear: number;
  workEndYear?: number;
  /** Shared with the balance chart, so hovering a year highlights it on both. */
  syncId?: string;
};

const ReadyYearsChart = ({ bars, summary, endYear, workEndYear, syncId }: Props) => {
  const barsByYear = useMemo(() => {
    const byYear: Record<number, ReadyYearBar> = {};
    bars.forEach((bar) => { byYear[bar.year] = bar; });
    return byYear;
  }, [bars]);
  const tooltip = useMemo(() => <ReadyYearTooltip bars={barsByYear} />, [barsByYear]);
  // Empty years get no bar at all, rather than a zero-height one whose
  // outline shows as a speck on the axis.
  const plotted = useMemo(
    () => bars.map(({ year, lasts, runsOut }) => ({
      year,
      lasts: lasts > 0 ? lasts : null,
      runsOut: runsOut > 0 ? runsOut : null,
    })),
    [bars]
  );
  const note = notReadyNote(summary, endYear, workEndYear);
  const { p25, median, p75 } = summary;
  const hasYear = (year?: number) => year !== undefined && year in barsByYear;

  if (bars.length === 0) return null;

  return (
    <div className="mb-3">
      <h5 className="mb-1">When these futures are ready to retire</h5>
      <p className="text-muted small mb-1">
        Each bar is the share of futures that first reach the ready line at the
        end of that year and retire then.
        {hasYear(p25) && hasYear(p75) && ' The shaded years are where the middle half are ready.'}
      </p>
      <ResponsiveContainer width="95%" height={220} debounce={100}>
        <BarChart
          data={plotted}
          syncId={syncId}
          syncMethod="value"
          barCategoryGap={1}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          {hasYear(p25) && hasYear(p75) && (
            <ReferenceArea x1={p25} x2={p75} fill={MUTED} fillOpacity={0.12} ifOverflow="extendDomain" />
          )}
          <XAxis dataKey="year" scale="point" />
          <YAxis tickFormatter={percentTick} width={70} allowDecimals />
          <Tooltip content={tooltip} cursor={{ fill: MUTED, fillOpacity: 0.15 }} />
          <Legend verticalAlign="top" align="right" height={24} iconType="square" formatter={legendText} />
          <Bar
            dataKey="lasts"
            name="Money lasts"
            stackId="ready"
            fill={LASTS_COLOR}
            stroke={GAP_COLOR}
            strokeWidth={1}
            isAnimationActive={false}
          />
          <Bar
            dataKey="runsOut"
            name="Runs out later"
            stackId="ready"
            fill={RUNS_OUT_COLOR}
            stroke={GAP_COLOR}
            strokeWidth={1}
            isAnimationActive={false}
          />
          {hasYear(median) && (
            <ReferenceLine
              x={median}
              stroke={MUTED}
              strokeDasharray="4 4"
              label={{ value: 'Typically ready', position: 'top', fill: MUTED, fontSize: 12 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      {note && <p className="text-muted small mb-0">{note}</p>}
    </div>
  );
};

export default ReadyYearsChart;
