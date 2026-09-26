import {
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  ReferenceLine,
} from "recharts";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useMemo } from "react";
import { dollarFormatter } from "./MonteCarloForm";

type Percentiles = {
  max: number,
  p90: number,
  p80: number,
  p70: number,
  p60: number,
  median: number,
  p40: number,
  p30: number,
  p20: number,
  p10: number,
  min: number,
};

type PercentilesChartData = Percentiles & { year: number; deterministic?: number; readyLine?: number };

/** A ready line to draw on the chart: values[k] is for year startYear + k. */
export type ReadyLineSeries = {
  values: number[];
  startYear: number;
  /** Last year to draw, if the line should stop early (e.g. at retirement). */
  lastYear?: number;
  /** Last year to show on the chart at all, to zoom in on when futures are ready. */
  chartLastYear?: number;
  label: string;
};

// Keys in the chart data that aren't simulated balances.
const NON_BALANCE_KEYS = ['year', 'deterministic', 'readyLine'];

/**
 * Add the ready line to the chart data: crop to chartLastYear if set, and
 * attach each year's ready-line value up to lastYear. Values that aren't
 * finite (possible with extreme volatility inputs) are left out so they
 * can't break the y-axis. Balances are never cut off by lastYear.
 */
export const mergeReadyLine = <T extends { year: number }>(
  data: T[],
  readyLine?: ReadyLineSeries
): Array<T & { readyLine?: number }> => {
  if (!readyLine) return data;

  const { chartLastYear, lastYear, startYear, values } = readyLine;
  const visible = chartLastYear === undefined
    ? data
    : data.filter((entry) => entry.year <= chartLastYear);

  return visible.map((entry) => {
    const value = values[entry.year - startYear];
    const show =
      value !== undefined &&
      Number.isFinite(value) &&
      (lastYear === undefined || entry.year <= lastYear);
    return show ? { ...entry, readyLine: value } : entry;
  });
};

type TooltipData = Record<string, PercentilesChartData | Percentiles>;

/** One year's percentiles from every simulated balance in that year's entry. */
const percentilesOf = (series: Record<string, number>): Percentiles | undefined => {
  const yearBalances = Object.entries(series)
    .filter(([key]) => !NON_BALANCE_KEYS.includes(key))
    .map(([, value]) => value)
    .sort((a, b) => a - b);
  if (yearBalances.length === 0) return undefined;

  return {
    max: yearBalances[yearBalances.length - 1],
    p90: yearBalances[Math.floor(yearBalances.length * .9)],
    p80: yearBalances[Math.floor(yearBalances.length * .8)],
    p70: yearBalances[Math.floor(yearBalances.length * .7)],
    p60: yearBalances[Math.floor(yearBalances.length * .6)],
    median: yearBalances[Math.floor(yearBalances.length * .5)],
    p40: yearBalances[Math.floor(yearBalances.length * .4)],
    p30: yearBalances[Math.floor(yearBalances.length * .3)],
    p20: yearBalances[Math.floor(yearBalances.length * .2)],
    p10: yearBalances[Math.floor(yearBalances.length * .1)],
    min: yearBalances[0],
  };
};

/**
 * Tooltip data for each year, without the ready line. It doesn't depend on
 * the confidence slider, so it's computed once per set of results.
 */
export const computeBaseTooltipData = (
  balanceChartData: Array<Record<string, number>>,
  onlyShowPercentiles: boolean
): Record<number, PercentilesChartData> => {
  const data: Record<number, PercentilesChartData> = {};

  if (onlyShowPercentiles) {
    // Each entry already holds that year's percentiles.
    (balanceChartData as PercentilesChartData[]).forEach((entry) => {
      data[entry.year] = entry;
    });
    return data;
  }

  balanceChartData.forEach(({ year, ...series }) => {
    const percentiles = percentilesOf(series);
    if (!percentiles) return;
    data[year] = {
      year,
      ...percentiles,
      ...(series.deterministic !== undefined ? { deterministic: series.deterministic } : {}),
    };
  });
  return data;
};

/** Add each visible year's ready-line value to the base tooltip data. */
export const mergeTooltipReadyLine = (
  baseTooltipData: Record<number, PercentilesChartData>,
  chartData: Array<{ year: number; readyLine?: number }>
): TooltipData => {
  const data: TooltipData = {};
  chartData.forEach((entry) => {
    const base = baseTooltipData[entry.year];
    if (!base) return;
    data[entry.year] = entry.readyLine === undefined ? base : { ...base, readyLine: entry.readyLine };
  });
  return data;
};

/**
 * Each year's lowest and highest plotted value, for the y-axis. Doesn't
 * depend on the confidence slider, so it's computed once per set of results.
 */
export const computeYearExtents = (
  balanceChartData: Array<Record<string, number>>,
  options: { excludeMinMax: boolean; onlyShowDeterministicLine: boolean }
): Record<number, [number, number]> => {
  const { excludeMinMax, onlyShowDeterministicLine } = options;
  const extents: Record<number, [number, number]> = {};
  balanceChartData.forEach((entry) => {
    let values: number[];
    if (onlyShowDeterministicLine) {
      values = entry.deterministic !== undefined ? [entry.deterministic] : [];
    } else {
      values = Object.entries(entry)
        .filter(([key]) =>
          !NON_BALANCE_KEYS.includes(key) &&
          (!excludeMinMax || (key !== 'min' && key !== 'max'))
        )
        .map(([, value]) => value)
        .concat(entry.deterministic !== undefined ? entry.deterministic : []);
    }
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length > 0) extents[entry.year] = [getMin(finite), getMax(finite)];
  });
  return extents;
};

/** The y values the axis must fit: each visible year's extents plus its ready-line value. */
export const visibleYValuesFor = (
  chartData: Array<{ year: number; readyLine?: number }>,
  yearExtents: Record<number, [number, number]>
): number[] =>
  chartData.flatMap((entry) => [
    ...(yearExtents[entry.year] ?? []),
    ...(entry.readyLine !== undefined ? [entry.readyLine] : []),
  ]);

export const CustomTooltip = (props: {
  label?: string,
  tooltipData: TooltipData,
  readyLineLabel?: string,
  readyLineLastYear?: number,
}) => {
  const { tooltipData, label, readyLineLabel, readyLineLastYear } = props;

  const tooltipYearData = label ? (tooltipData[label] as PercentilesChartData) : null;
  if (!tooltipYearData) return null;

  const pastReadyLine =
    readyLineLabel !== undefined &&
    readyLineLastYear !== undefined &&
    Number(label) > readyLineLastYear;

  return (
    <div className="bg-light">
      <p><strong>Year: {label}</strong></p>
      {tooltipYearData.readyLine !== undefined && (
        <p>{readyLineLabel}: {dollarFormatter(tooltipYearData.readyLine)}</p>
      )}
      {pastReadyLine && (
        <p className="text-muted">Ready line: not shown after planned retirement</p>
      )}
      {tooltipYearData.deterministic !== undefined && (
        <p>Average path: {dollarFormatter(tooltipYearData.deterministic)}</p>
      )}
      <p>Max: {dollarFormatter(tooltipYearData.max)}</p>
      <p>90% Percentile: {dollarFormatter(tooltipYearData.p90)}</p>
      <p>80% Percentile: {dollarFormatter(tooltipYearData.p80)}</p>
      <p>70% Percentile: {dollarFormatter(tooltipYearData.p70)}</p>
      <p>60% Percentile: {dollarFormatter(tooltipYearData.p60)}</p>
      <p>Median: {dollarFormatter(tooltipYearData.median)}</p>
      <p>40% Percentile: {dollarFormatter(tooltipYearData.p40)}</p>
      <p>30% Percentile: {dollarFormatter(tooltipYearData.p30)}</p>
      <p>20% Percentile: {dollarFormatter(tooltipYearData.p20)}</p>
      <p>10% Percentile: {dollarFormatter(tooltipYearData.p10)}</p>
      <p>Min: {dollarFormatter(tooltipYearData.min)}</p>
    </div>
  );
};

const MonteCarloGraph = (props: { results: MonteCarloResult[], deterministicResult?: MonteCarloResult, inflationAdjusted: boolean, onlyShowPercentiles: boolean, excludeMinMax: boolean, onlyShowDeterministicLine: boolean, readyLine?: ReadyLineSeries, plannedRetirementYear?: number }) => {
  const { results, deterministicResult, inflationAdjusted, onlyShowPercentiles, excludeMinMax, onlyShowDeterministicLine, readyLine, plannedRetirementYear } = props;

  const balanceChartData = useMemo(() => {
    const dataKey = inflationAdjusted ? 'inflationAdjustedBalance' : 'balance';
    // One entry per year, looked up by year instead of scanning the list for
    // every future's every year. A Map keeps the years in first-seen order.
    const entriesByYear = new Map<number, Record<string, number>>();
    const entryFor = (year: number) => {
      let entry = entriesByYear.get(year);
      if (!entry) {
        entry = { year };
        entriesByYear.set(year, entry);
      }
      return entry;
    };

    results.forEach((result, index) => {
      result.forEach((yearBalance) => {
        entryFor(yearBalance.year)[`series${index + 1}`] = yearBalance[dataKey];
      });
    });

    deterministicResult?.forEach((yearBalance) => {
      entryFor(yearBalance.year).deterministic = yearBalance[dataKey];
    });

    let data = Array.from(entriesByYear.values());

    if (onlyShowPercentiles) {
      data = data.map((entry) => {
        const { year, ...yearSeries } = entry;
        const deterministicValue = (entry as any).deterministic;

        const newEntry = {
          year: entry.year,
        } as PercentilesChartData;

        const yearBalances = Object.entries(yearSeries)
          .filter(([key]) => key !== 'deterministic')
          .map(([, value]) => value)
          .sort((a, b) => a - b);
        if (yearBalances.length > 0) {
          newEntry.max = yearBalances[yearBalances.length - 1];
          newEntry.p90 = yearBalances[Math.floor(yearBalances.length * .9)];
          newEntry.p80 = yearBalances[Math.floor(yearBalances.length * .8)];
          newEntry.p70 = yearBalances[Math.floor(yearBalances.length * .7)];
          newEntry.p60 = yearBalances[Math.floor(yearBalances.length * .6)];
          newEntry.median = yearBalances[Math.floor(yearBalances.length * .5)];
          newEntry.p40 = yearBalances[Math.floor(yearBalances.length * .4)];
          newEntry.p30 = yearBalances[Math.floor(yearBalances.length * .3)];
          newEntry.p20 = yearBalances[Math.floor(yearBalances.length * .2)];
          newEntry.p10 = yearBalances[Math.floor(yearBalances.length * .1)];
          newEntry.min = yearBalances[0];
        }

        if (deterministicValue !== undefined) {
          newEntry.deterministic = deterministicValue;
        }

        return newEntry;
      }) as PercentilesChartData[]
    }

    return data;
  }, [results, deterministicResult, inflationAdjusted, onlyShowPercentiles]);

  // Everything expensive is computed from balanceChartData, which doesn't
  // depend on the ready line, so dragging the confidence slider only does
  // cheap per-year work below.
  const chartData = useMemo(
    () => mergeReadyLine(balanceChartData as PercentilesChartData[], readyLine),
    [balanceChartData, readyLine]
  );

  const baseTooltipData = useMemo(
    () => computeBaseTooltipData(balanceChartData, onlyShowPercentiles),
    [balanceChartData, onlyShowPercentiles]
  );

  const tooltipData = useMemo(
    () => mergeTooltipReadyLine(baseTooltipData, chartData),
    [baseTooltipData, chartData]
  );

  const { year: _, readyLine: __, ...yearsSeries } = chartData.length > 0 ? chartData[0] : { year: null, readyLine: undefined };
  const readyLinePoints = chartData.filter((entry) => entry.readyLine !== undefined).length;

  // Pick each line's random color once per set of results, so re-renders
  // (like dragging the confidence slider) don't change every line's color.
  const seriesColors = useMemo(() => {
    const colors: Record<string, string> = {};
    Object.keys(balanceChartData[0] ?? {}).forEach((key) => {
      colors[key] = key === 'deterministic' ? '#0d6efd' : generateContrastingHexCode();
    });
    return colors;
  }, [balanceChartData]);

  const tooltip = useMemo(
    () => (
      <CustomTooltip
        tooltipData={tooltipData}
        readyLineLabel={readyLine?.label}
        readyLineLastYear={readyLine?.lastYear}
      />
    ),
    [tooltipData, readyLine?.label, readyLine?.lastYear]
  );

  // The y-axis only needs the lowest and highest visible values, so find each
  // year's once per set of results rather than scanning every line on each
  // slider move.
  const yearExtents = useMemo(
    () => computeYearExtents(balanceChartData, { excludeMinMax, onlyShowDeterministicLine }),
    [balanceChartData, excludeMinMax, onlyShowDeterministicLine]
  );

  const visibleYValues = useMemo(
    () => visibleYValuesFor(chartData, yearExtents),
    [chartData, yearExtents]
  );

  const showPlannedRetirement =
    plannedRetirementYear !== undefined &&
    chartData.some((entry) => entry.year === plannedRetirementYear);

  const [customYTicks, customDomain] = useNiceRechartsTicks(
    visibleYValues,
    5,
    {
      requiredPaddingRate: 0,
      allowableTickIntervalsPerOrderOfMagnitude: [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9],
    }
  );

  return (
    <ResponsiveContainer width="95%" height={550} debounce={100}>
      <LineChart
        key={`${inflationAdjusted ? 'inflationAdjusted' : 'notInflationAdjusted'}${results.length > 0 ? results[0].at(-1)?.balance : null}`}
        data={chartData}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis
          ticks={customYTicks} domain={customDomain}
          tickFormatter={dollarFormatter}
          width={140}
          allowDataOverflow={true}
        />
        <Tooltip content={tooltip} />
        {Object.entries(yearsSeries)
          .filter(([key]) => {
            if (onlyShowDeterministicLine) return key === 'deterministic';
            return !excludeMinMax || (key !== 'max' && key !== 'min');
          })
          .map(([key, _], index) => (
            <Line
              type="monotone"
              dataKey={key}
              stroke={seriesColors[key]}
              strokeDasharray={key === 'deterministic' ? '6 4' : undefined}
              strokeWidth={key === 'deterministic' ? 2 : 1}
              key={index}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        {showPlannedRetirement && (
          <ReferenceLine
            x={plannedRetirementYear}
            stroke="#6c757d"
            strokeDasharray="4 4"
            label={{ value: 'Planned retirement', position: 'insideTopLeft', fill: '#6c757d' }}
          />
        )}
        {readyLinePoints > 0 && (
          <Line
            type="monotone"
            dataKey="readyLine"
            name={readyLine?.label}
            stroke="#198754"
            strokeWidth={3}
            key="readyLine"
            isAnimationActive={false}
            // A line needs two points; with only one visible (retiring next
            // year), draw a dot so it doesn't silently disappear.
            dot={readyLinePoints === 1 ? { r: 5, fill: '#198754', stroke: '#198754' } : false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

const roundDownToNearest = (num: number, interval: number) => Math.floor(num / interval) * interval;

type Domain = [number, number] | undefined;
type Ticks = number[] | undefined;

const useNiceRechartsTicks = (
  values: number[],
  numTicks: number,
  {
    requiredPaddingRate = 0.1,
    allowableTickIntervalsPerOrderOfMagnitude = [1, 2.5, 5],
    requireWholeNumberTicks = true,
  } = {},
): [Ticks, Domain] => {
  numTicks = Math.max(2, numTicks);

  const [ticks, domain] = useMemo(() => {
    let minValue = getMin(values);
    if (isNaN(minValue)) minValue = 0;
    minValue = Math.max(minValue, 0);
    let maxValue = getMax(values);
    if (isNaN(maxValue)) maxValue = 1000;

    const rawStepSize = Math.max(1, (maxValue - minValue) / (numTicks - 1));

    const rawOrderOfMagnitude = 10 ** Math.floor(Math.log10(rawStepSize));

    for (
      let orderOfMagnitude = rawOrderOfMagnitude;
      orderOfMagnitude <= rawOrderOfMagnitude * 10000;
      orderOfMagnitude *= 10
    ) {
      for (const interval of allowableTickIntervalsPerOrderOfMagnitude) {
        const stepSize = interval * orderOfMagnitude;

        if (requireWholeNumberTicks && stepSize % 1 !== 0) continue;

        const range = stepSize * (numTicks - 1);
        const requiredPadding = requiredPaddingRate * range;

        let minTick = roundDownToNearest(minValue - requiredPadding, stepSize);
        if (minValue >= 0 && minTick < 0) minTick = 0;

        const maxTick = minTick + range;

        if (maxTick >= maxValue + requiredPadding) {
          const ticks = Array.from({ length: numTicks }, (_, i) => minTick + stepSize * i);
          const domain = [ticks[0], ticks[ticks.length - 1]] as Domain;

          return [ticks, domain];
        }
      }
    }

    return [undefined, undefined];
  }, [values, numTicks, requiredPaddingRate, allowableTickIntervalsPerOrderOfMagnitude, requireWholeNumberTicks])

  return [ticks, domain];
};

const generateContrastingHexCode = () => {
  let maxCompositeValue = 500;
  let rgb = [1,1,1];

  do {
    rgb = rgb.map(() => Math.floor(Math.random() * 256))
  } while (rgb.reduce((acc, val) => acc + val, 0) > maxCompositeValue);

  return '#' + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

const getMax = (arr: number[]) => {
  // Apparently Math.max hits a call stack size exceeded error when the array gets too big
  let len = arr.length;
  let max = -Infinity;

  while (len--) {
      max = arr[len] > max ? arr[len] : max;
  }
  return max;
}

const getMin = (arr: number[]) => {
  // Apparently Math.min hits a call stack size exceeded error when the array gets too big
  let len = arr.length;
  let min = Infinity;

  while (len--) {
      min = arr[len] < min ? arr[len] : min;
  }
  return min;
}

export default MonteCarloGraph;