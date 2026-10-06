import { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import MonteCarloGraph, {
  collectBalancesByYear,
  computeBaseTooltipData,
  computeYearExtents,
  CustomTooltip,
  mergeReadyLine,
  mergeTooltipReadyLine,
  ReadyLineSeries,
  toPercentilesEntry,
  visibleYValuesFor,
} from './MonteCarloGraph';
import { MonteCarloResult } from '../calculators/MonteCarloSimulation';

// ResponsiveContainer measures its parent, which is always 0x0 in jsdom, so
// give the chart a fixed size to make it render.
jest.mock('recharts', () => {
  const recharts = jest.requireActual('recharts');
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      jest.requireActual('react').cloneElement(children, { width: 800, height: 500 }),
  };
});

const data = [2030, 2031, 2032, 2033, 2034].map((year) => ({ year, median: year * 10 }));
const line = (overrides: Partial<ReadyLineSeries> = {}): ReadyLineSeries => ({
  values: [100, 101, 102, 103, 104],
  startYear: 2030,
  label: 'Ready line (90%)',
  ...overrides,
});

describe('mergeReadyLine', () => {
  test('passes the data through unchanged without a ready line', () => {
    expect(mergeReadyLine(data)).toBe(data);
  });

  test("attaches each year's value", () => {
    expect(mergeReadyLine(data, line()).map((entry) => entry.readyLine)).toEqual([100, 101, 102, 103, 104]);
  });

  test('stops the line at lastYear but keeps showing balances after it', () => {
    const merged = mergeReadyLine(data, line({ lastYear: 2031 }));

    expect(merged.map((entry) => entry.year)).toEqual([2030, 2031, 2032, 2033, 2034]);
    expect(merged.map((entry) => entry.readyLine)).toEqual([100, 101, undefined, undefined, undefined]);
    expect(merged[4].median).toBe(20340);
  });

  test('crops the chart to chartLastYear', () => {
    const merged = mergeReadyLine(data, line({ chartLastYear: 2032 }));

    expect(merged.map((entry) => entry.year)).toEqual([2030, 2031, 2032]);
    expect(merged.map((entry) => entry.readyLine)).toEqual([100, 101, 102]);
  });

  test('leaves out values that are not finite', () => {
    const merged = mergeReadyLine(data, line({ values: [100, Infinity, 102, NaN, 104] }));

    expect(merged.map((entry) => entry.readyLine)).toEqual([100, undefined, 102, undefined, 104]);
  });
});

// Two futures' balances per year, plus the average path.
const rawData = [
  { year: 2030, series1: 10, series2: 30, deterministic: 20 },
  { year: 2031, series1: 15, series2: 45, deterministic: 25 },
  { year: 2032, series1: 5, series2: 60, deterministic: 40 },
];
const percentileData = rawData.map(({ year, deterministic }) => ({
  year, deterministic, max: year + 2, p90: 0, p80: 0, p70: 0, p60: 0,
  median: year, p40: 0, p30: 0, p20: 0, p10: 0, min: year - 2,
}));

describe('computeBaseTooltipData', () => {
  test('computes percentiles from raw futures, leaving out the average path', () => {
    const data = computeBaseTooltipData({ series: rawData });

    expect(data[2031]).toMatchObject({ year: 2031, min: 15, max: 45, median: 45, deterministic: 25 });
  });

  test('uses the precomputed percentiles as they are', () => {
    expect(computeBaseTooltipData({ percentiles: percentileData })[2031]).toBe(percentileData[1]);
  });
});

describe('mergeTooltipReadyLine', () => {
  test("adds each shown year's ready-line value and drops years cropped from the chart", () => {
    const base = computeBaseTooltipData({ series: rawData });
    const chartData = mergeReadyLine(rawData, line({ values: [100, 101, 102], chartLastYear: 2031, lastYear: 2030 }));

    const data = mergeTooltipReadyLine(base, chartData);

    expect(Object.keys(data)).toEqual(['2030', '2031']);
    expect(data[2030]).toMatchObject({ readyLine: 100, max: 30 });
    expect(data[2031]).not.toHaveProperty('readyLine');
  });
});

describe('computeYearExtents and visibleYValuesFor', () => {
  test('fit all futures and the average path by default', () => {
    const extents = computeYearExtents(rawData, { excludeMinMax: false, onlyShowDeterministicLine: false });

    expect(extents[2032]).toEqual([5, 60]);
  });

  test('leave out min and max when excludeMinMax is on', () => {
    const extents = computeYearExtents(percentileData, { excludeMinMax: true, onlyShowDeterministicLine: false });

    expect(extents[2030]).toEqual([0, 2030]);
  });

  test('fit only the average path when that is all that is shown', () => {
    const extents = computeYearExtents(rawData, { excludeMinMax: false, onlyShowDeterministicLine: true });

    expect(extents).toEqual({ 2030: [20, 20], 2031: [25, 25], 2032: [40, 40] });
  });

  test('also fit the ready line, only for years still on the chart', () => {
    const extents = computeYearExtents(rawData, { excludeMinMax: false, onlyShowDeterministicLine: true });
    const chartData = mergeReadyLine(rawData, line({ values: [500, 600, 700], chartLastYear: 2031 }));

    expect(visibleYValuesFor(chartData, extents)).toEqual([20, 20, 500, 25, 25, 600]);
  });
});

describe('MonteCarloGraph', () => {
  const result = (balances: number[]): MonteCarloResult =>
    balances.map((balance, k) => ({
      year: 2030 + k,
      balance,
      inflationAdjustedBalance: balance,
      inflation: 0,
      monthlyExpenses: 0,
      inflationAdjustedMonthlyExpenses: 0,
    }));
  const renderGraph = (readyLine: ReadyLineSeries, plannedRetirementYear?: number) =>
    render(
      <MonteCarloGraph
        results={[result([100, 200, 300, 400]), result([150, 250, 350, 450])]}
        inflationAdjusted
        onlyShowPercentiles
        excludeMinMax={false}
        onlyShowDeterministicLine={false}
        readyLine={readyLine}
        plannedRetirementYear={plannedRetirementYear}
      />
    );
  // The chart's SVG parts have no roles or labels to query by, so these
  // tests find them by Recharts' class names and the ready line's color.
  const readyLineDots = (container: HTMLElement) =>
    // eslint-disable-next-line testing-library/no-node-access
    container.querySelectorAll('.recharts-line-dot[fill="#198754"]');

  test('draws a single visible ready-line point as a dot, with the retirement marker', () => {
    const { container } = renderGraph(line({ values: [120, 220, 320, 420], lastYear: 2030 }), 2030);

    expect(readyLineDots(container)).toHaveLength(1);
    expect(screen.getByText('Planned retirement')).toBeInTheDocument();
  });

  test('draws a plain line, without dots, when two or more points are visible', () => {
    const { container } = renderGraph(line({ values: [120, 220, 320, 420], lastYear: 2031 }), 2031);

    expect(readyLineDots(container)).toHaveLength(0);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.recharts-line-curve[stroke="#198754"]')).toBeInTheDocument();
  });

  test('leaves out the retirement marker when that year is not on the chart', () => {
    renderGraph(line(), 2050);

    expect(screen.queryByText('Planned retirement')).not.toBeInTheDocument();
  });
});

describe('CustomTooltip', () => {
  const tooltipData = computeBaseTooltipData({ series: rawData });

  test('notes that the ready line is not shown after the planned retirement year', () => {
    render(<CustomTooltip label="2032" tooltipData={tooltipData} readyLineLabel="Ready line (90%)" readyLineLastYear={2031} />);

    expect(screen.getByText('Ready line: not shown after planned retirement')).toBeInTheDocument();
  });

  test('shows the ready-line value, without the note, up to that year', () => {
    render(
      <CustomTooltip
        label="2031"
        tooltipData={{ ...tooltipData, 2031: { ...tooltipData[2031], readyLine: 1000 } }}
        readyLineLabel="Ready line (90%)"
        readyLineLastYear={2031}
      />
    );

    expect(screen.getByText('Ready line (90%): $1,000.00')).toBeInTheDocument();
    expect(screen.queryByText('Ready line: not shown after planned retirement')).not.toBeInTheDocument();
  });
});

describe('collectBalancesByYear', () => {
  const result = (years: number[], base: number): MonteCarloResult =>
    years.map((year) => ({
      year,
      balance: base + year,
      inflationAdjustedBalance: base + year + 0.5,
      inflation: 0,
      monthlyExpenses: 0,
      inflationAdjustedMonthlyExpenses: 0,
    }));

  test('gives one entry per year, in first-seen order, with every value', () => {
    const entries = collectBalancesByYear(
      // Futures covering different years, and an average path with a year
      // (2033) that no future has.
      [result([2030, 2031], 1000), result([2031, 2032], 2000)],
      result([2030, 2031, 2032, 2033], 3000),
      'balance'
    );

    expect(entries).toEqual([
      { year: 2030, series1: 3030, deterministic: 5030 },
      { year: 2031, series1: 3031, series2: 4031, deterministic: 5031 },
      { year: 2032, series2: 4032, deterministic: 5032 },
      { year: 2033, deterministic: 5033 },
    ]);
  });

  test('reads the requested balance and works without an average path', () => {
    expect(collectBalancesByYear([result([2030], 1000)], undefined, 'inflationAdjustedBalance')).toEqual([
      { year: 2030, series1: 3030.5 },
    ]);
  });
});

describe('toPercentilesEntry', () => {
  test('a year only the average path has keeps just its value', () => {
    expect(toPercentilesEntry({ year: 2033, deterministic: 5033 })).toEqual({ year: 2033, deterministic: 5033 });
  });

  test("summarizes the futures' balances and leaves the average path out of them", () => {
    const entry = toPercentilesEntry({ year: 2031, series1: 10, series2: 30, series3: 20, deterministic: 999 });

    expect(entry.min).toBe(10);
    expect(entry.median).toBe(20);
    expect(entry.max).toBe(30);
    expect(entry.deterministic).toBe(999);
  });
});
