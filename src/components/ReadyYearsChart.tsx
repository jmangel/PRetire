import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReadyYearBar, ReadyYearSummary, notReadyBreakdown } from "../calculators/ReadyLine";
import {
  CHART_CONTAINER_WIDTH,
  CHART_RIGHT_AXIS_WIDTH,
  CHART_SIDE_MARGINS,
  CHART_Y_AXIS_WIDTH,
  plotWidth,
} from "./chartLayout";

/*
 * When the futures are ready to retire, one bar per year: the picture of the
 * "half of these futures are ready between..." summary, so it sits right
 * under it, above the balance chart. It shares the balance chart's years and
 * horizontal layout (chartLayout.ts), and spaces the years the same way (a
 * point scale, like a line chart), so a year lines up with the same year on
 * that chart.
 *
 * On a point scale a year is a point, not a band, so Recharts draws the
 * shaded years and the hover highlight with no width of their own. Both are
 * widened here by one year's spacing, worked out from the chart's width.
 *
 * A line over the bars gives the running total: the share ready by the end of
 * each year. It goes up to 100% while a bar is a few percent at most, so it
 * has its own scale on the right, drawn inside the shared right margin so the
 * plot keeps the balance chart's width. It levels off short of 100% when some
 * futures are never ready.
 */

// Blue and orange stay apart for every common kind of color blindness.
const LASTS_COLOR = '#2a78d6';
const RUNS_OUT_COLOR = '#d0620d';
// The card's background, drawn between bars and between stacked segments.
const GAP_COLOR = '#f8f9fa';
const MUTED = '#6c757d';
// Dark, so the running total reads apart from both bar colors.
const READY_BY_COLOR = '#212529';

const MARGIN = {
  top: 20,
  left: CHART_SIDE_MARGINS.left,
  right: CHART_SIDE_MARGINS.right - CHART_RIGHT_AXIS_WIDTH,
  bottom: 5,
};
const LEGEND_STYLE = { top: 0 };
const READY_BY_AXIS = 'readyBy';
const READY_BY_TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Share of all futures ready by the end of each year: the bars' running total. */
export const readyByYear = (bars: ReadyYearBar[]): Record<number, number> => {
  const byYear: Record<number, number> = {};
  let total = 0;
  bars.forEach(({ year, lasts, runsOut }) => {
    total += lasts + runsOut;
    byYear[year] = total;
  });
  return byYear;
};

/** Pixels between neighboring years, given the chart's full width. */
export const yearStep = (chartWidth: number, years: number) =>
  years > 1 ? plotWidth(chartWidth) / (years - 1) : plotWidth(chartWidth);

/** Share (0 to 1) as a percentage, with a decimal for small shares. */
export const formatShare = (share: number) => {
  const percentage = share * 100;
  if (percentage === 0) return '0%';
  if (percentage < 0.1) return '<0.1%';
  return `${percentage < 10 ? percentage.toFixed(1) : Math.round(percentage)}%`;
};

/** Plain-language note on the futures that aren't in any bar. */
export const notReadyNote = (
  summary: Parameters<typeof notReadyBreakdown>[0],
  endYear: number,
  workEndYear?: number
): string | undefined => {
  const { forced, ranOutWhileWorking, notReadyByEnd } = notReadyBreakdown(summary, workEndYear);
  const parts = [
    forced > 0 && `${formatShare(forced)} stop working in ${workEndYear} without being ready`,
    ranOutWhileWorking > 0 && `${formatShare(ranOutWhileWorking)} run out of money while still working`,
    notReadyByEnd > 0 && `${formatShare(notReadyByEnd)} aren't ready before ${endYear}`,
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return undefined;
  return `Not in any bar: ${parts.join('; ')}.`;
};

export const ReadyYearTooltip = ({ active, label, bars, readyBy }: {
  active?: boolean;
  label?: number | string;
  bars: Record<number, ReadyYearBar>;
  /** Running total by year; left out, the tooltip shows only the year's bar. */
  readyBy?: Record<number, number>;
}) => {
  const bar = label === undefined ? undefined : bars[Number(label)];
  if (!active || !bar) return null;
  const total = bar.lasts + bar.runsOut;
  const soFar = readyBy?.[bar.year];
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
      {soFar !== undefined && (
        <p className="mb-0">Ready by then: {formatShare(soFar)}</p>
      )}
    </div>
  );
};

// Up to one decimal, so ticks like 2.5% don't round to 3%.
export const percentTick = (value: number) => `${Number((value * 100).toFixed(1))}%`;

// Legend text stays in the body color; the square beside it shows the series.
const legendText = (value: string) => <span className="text-body">{value}</span>;

type RectProps = { x?: number; y?: number; width?: number; height?: number };

/**
 * The shaded years: Recharts gives a rectangle from the first year's point to
 * the last's, which has no width when they're the same year. Widen it by half
 * a year on each side so it covers those years' bars whole.
 */
const PaddedYears = ({ x = 0, y = 0, width = 0, height = 0, step }: RectProps & { step: number }) => (
  <rect
    className="ready-years-shading"
    x={x - step / 2}
    y={y}
    width={width + step}
    height={height}
    fill={MUTED}
    fillOpacity={0.12}
  />
);

/** The hover highlight behind a year: one year wide, centered on it. */
const YearCursor = ({ x = 0, y = 0, height = 0, step }: RectProps & { step: number }) => (
  <rect
    className="ready-years-cursor"
    x={x - step / 2}
    y={y}
    width={step}
    height={height}
    fill={MUTED}
    fillOpacity={0.15}
  />
);

/**
 * "Typically ready", above the plot beside the median's line. Centered on the
 * line, it ran into the y-axis labels when the typical year is one of the
 * first, so it starts at the line, or ends at it in the right part of the
 * chart so it can't run off that side.
 */
const TypicalLabel = ({ viewBox, chartWidth }: { viewBox?: { x?: number; y?: number }; chartWidth: number }) => {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const fromLeft = x < chartWidth * 0.7;
  return (
    <text x={fromLeft ? x + 4 : x - 4} y={y - 6} textAnchor={fromLeft ? 'start' : 'end'} fill={MUTED} fontSize={12}>
      Typically ready
    </text>
  );
};

type Props = {
  bars: ReadyYearBar[];
  summary: ReadyYearSummary;
  endYear: number;
  workEndYear?: number;
  /** Shared with the balance chart, so hovering a year highlights it on both. */
  syncId?: string;
};

type PlotProps = {
  bars: ReadyYearBar[];
  summary: ReadyYearSummary;
  syncId?: string;
  /** Set by ResponsiveContainer. */
  width?: number;
  height?: number;
};

/** The chart itself. ResponsiveContainer passes in its size. */
const ReadyYearsPlot = ({ bars, summary, syncId, width = 0, height = 0 }: PlotProps) => {
  const barsByYear = useMemo(() => {
    const byYear: Record<number, ReadyYearBar> = {};
    bars.forEach((bar) => { byYear[bar.year] = bar; });
    return byYear;
  }, [bars]);
  const readyBy = useMemo(() => readyByYear(bars), [bars]);
  const tooltip = useMemo(
    () => <ReadyYearTooltip bars={barsByYear} readyBy={readyBy} />,
    [barsByYear, readyBy]
  );
  // Empty years get no bar at all, rather than a zero-height one whose
  // outline shows as a speck on the axis.
  const plotted = useMemo(
    () => bars.map(({ year, lasts, runsOut }) => ({
      year,
      lasts: lasts > 0 ? lasts : null,
      runsOut: runsOut > 0 ? runsOut : null,
      readyBy: readyBy[year],
    })),
    [bars, readyBy]
  );
  const step = yearStep(width, bars.length);
  const { p25, median, p75 } = summary;
  const hasYear = (year?: number) => year !== undefined && year in barsByYear;

  return (
    <ComposedChart
      width={width}
      height={height}
      data={plotted}
      syncId={syncId}
      syncMethod="value"
      barCategoryGap={1}
      margin={MARGIN}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      {hasYear(p25) && hasYear(p75) && (
        <ReferenceArea
          x1={p25}
          x2={p75}
          ifOverflow="extendDomain"
          shape={(props: RectProps) => <PaddedYears {...props} step={step} />}
        />
      )}
      <XAxis dataKey="year" scale="point" />
      <YAxis tickFormatter={percentTick} width={CHART_Y_AXIS_WIDTH} allowDecimals />
      <YAxis
        yAxisId={READY_BY_AXIS}
        orientation="right"
        domain={[0, 1]}
        ticks={READY_BY_TICKS}
        tickFormatter={percentTick}
        width={CHART_RIGHT_AXIS_WIDTH}
      />
      <Tooltip content={tooltip} cursor={<YearCursor step={step} />} />
      {/* No fixed height: on a phone the legend wraps to two lines, and
          Recharts then moves the plot down to make room. Pinned to the top
          edge, it leaves the top margin free for "Typically ready". */}
      <Legend verticalAlign="top" align="right" wrapperStyle={LEGEND_STYLE} formatter={legendText} />
      <Bar
        dataKey="lasts"
        name="Money lasts"
        legendType="square"
        stackId="ready"
        fill={LASTS_COLOR}
        stroke={GAP_COLOR}
        strokeWidth={1}
        isAnimationActive={false}
      />
      <Bar
        dataKey="runsOut"
        name="Runs out later"
        legendType="square"
        stackId="ready"
        fill={RUNS_OUT_COLOR}
        stroke={GAP_COLOR}
        strokeWidth={1}
        isAnimationActive={false}
      />
      <Line
        yAxisId={READY_BY_AXIS}
        dataKey="readyBy"
        name="Ready by then"
        legendType="line"
        type="linear"
        stroke={READY_BY_COLOR}
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 3 }}
        isAnimationActive={false}
      />
      {hasYear(median) && (
        <ReferenceLine
          x={median}
          stroke={MUTED}
          strokeDasharray="4 4"
          label={<TypicalLabel chartWidth={width} />}
        />
      )}
    </ComposedChart>
  );
};

const ReadyYearsChart = ({ bars, summary, endYear, workEndYear, syncId }: Props) => {
  if (bars.length === 0) return null;
  const note = notReadyNote(summary, endYear, workEndYear);
  const { p25, p75 } = summary;
  const shaded = [p25, p75].every((year) => bars.some((bar) => bar.year === year));

  return (
    <div className="mb-3">
      <h5 className="mb-1">When these futures are ready to retire</h5>
      <p className="text-muted small mb-1">
        Each bar is the share of futures that first reach the ready line at the
        end of that year and retire then. The line adds them up: the share
        ready by the end of that year, on the right-hand scale.
        {shaded && ' The shaded years are where the middle half are ready.'}
      </p>
      <ResponsiveContainer width={CHART_CONTAINER_WIDTH} height={220} debounce={100}>
        <ReadyYearsPlot bars={bars} summary={summary} syncId={syncId} />
      </ResponsiveContainer>
      {note && <p className="text-muted small mb-0">{note}</p>}
    </div>
  );
};

export default ReadyYearsChart;
