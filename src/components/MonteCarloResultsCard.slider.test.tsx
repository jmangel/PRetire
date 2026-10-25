/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   The chart's SVG lines have no roles or labels to query by, so these tests
   find them by Recharts' class names and the ready line's color. */
import { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MonteCarloResultsCard, { SLIDER_SETTLE_MS } from './MonteCarloResultsCard';
import { ReadyLineSeries } from './MonteCarloGraph';
import { AssetClass, Inflation, Job, MonteCarloResult } from '../calculators/MonteCarloSimulation';
import { readyLineAt } from '../calculators/ReadyLine';
import { RetirementMode, simulatePlan } from '../calculators/MonteCarlo';

// The real chart, wrapped so tests can read the ready line it was given. Its
// "Ready line (N%)" label only reaches the page in the hover tooltip. (A
// plain function rather than jest.fn, which the test setup resets.)
const mockGraphProps: Array<{ readyLine?: ReadyLineSeries; results: MonteCarloResult[] }> = [];
jest.mock('./MonteCarloGraph', () => {
  const actual = jest.requireActual('./MonteCarloGraph');
  return {
    ...actual,
    __esModule: true,
    default: (props: any) => {
      mockGraphProps.push(props);
      return actual.default(props);
    },
  };
});

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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = ResizeObserverStub;

const startYear = new Date().getFullYear() + 1;
const response = (mode: RetirementMode = 'date') =>
  simulatePlan({
    startingBalance: 200000,
    monthlyExpenses: -3000,
    jobs: [
      new Job({
        name: '',
        postTaxAnnualIncome: '70000',
        adjustForInflation: 'on',
        startDate: '',
        endDate: '',
        atRetirement: 'stops',
      }),
    ],
    lifeEvents: [],
    assetClasses: [
      new AssetClass({
        name: 'Stocks',
        allocationPercentage: 100,
        averageAnnualReturnPercentage: 7,
        standardDeviationPercentage: 15,
      }),
    ],
    inflation: new Inflation({ averageAnnualReturnPercentage: 2.5, standardDeviationPercentage: 1 }),
    startYear,
    endYear: startYear + 40,
    mode,
    confidence: 90,
    plannedRetirement: mode === 'date' ? new Date(`${startYear + 12}-07-01`) : undefined,
    futures: 20,
    sequences: 200,
  });

const renderCard = (mode: RetirementMode = 'date') => {
  const data = response(mode);
  return { data, ...render(<MonteCarloResultsCard fetcher={{ data, state: 'idle' } as any} />) };
};
// The ready line the chart was last drawn with.
const chartReadyLine = (): ReadyLineSeries => {
  const readyLine = mockGraphProps[mockGraphProps.length - 1]?.readyLine;
  if (!readyLine) throw new Error('The chart has no ready line');
  return readyLine;
};
// The chart's label names the confidence its line is drawn at.
const expectLabelMatchesLine = (data: ReturnType<typeof response>, confidence: number) => {
  const { label, values } = chartReadyLine();
  expect(label).toBe(`Ready line (${confidence}%)`);
  expect(values).toEqual(readyLineAt(data.readyLine!, confidence / 100));
};
const readyLinePath = (container: HTMLElement) =>
  container.querySelector('.recharts-line-curve[stroke="#198754"]')?.getAttribute('d');
const otherLineColors = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.recharts-line-curve'))
    .map((line) => line.getAttribute('stroke'))
    .filter((stroke) => stroke !== '#198754');
const moveSlider = (value: number) =>
  fireEvent.change(screen.getByLabelText(/Confidence you won't run out/), { target: { value: String(value) } });

describe('confidence slider', () => {
  afterEach(() => jest.useRealTimers());

  test('in the default percentiles view, the chart follows the slider live', () => {
    const { container, data } = renderCard();
    const before = readyLinePath(container);
    expectLabelMatchesLine(data, 90);

    moveSlider(70);

    expect(readyLinePath(container)).not.toBe(before);
    expectLabelMatchesLine(data, 70);
  });

  test('with every future drawn, the chart waits until the slider is still', () => {
    jest.useFakeTimers();
    const { container, data } = renderCard();
    fireEvent.click(screen.getByLabelText('Only show percentiles?'));
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS);
    });
    const before = readyLinePath(container);
    expect(screen.getByText(/chart updates once you stop moving the slider/i)).toBeInTheDocument();

    // Several quick steps, like arrow-key presses: the summary follows each
    // one, but the chart doesn't redraw yet.
    moveSlider(80);
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS - 50);
    });
    moveSlider(70);
    expect(screen.getByText("Confidence you won't run out: 70%")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS - 1);
    });
    expect(readyLinePath(container)).toBe(before);
    // The chart's label still names the line it shows, not the slider.
    expectLabelMatchesLine(data, 90);

    // Still for long enough: now it redraws, once.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(readyLinePath(container)).not.toBe(before);
    expectLabelMatchesLine(data, 70);
  });

  test('retiring when ready, the futures wait until the slider is still, even in the percentiles view', () => {
    jest.useFakeTimers();
    const { data } = renderCard('ready');
    const chartResults = () => mockGraphProps[mockGraphProps.length - 1].results;
    expect(chartResults()).toBe(data.results);
    expect(screen.getByText(/chart updates once you stop moving the slider/i)).toBeInTheDocument();

    moveSlider(50);
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS - 1);
    });
    expect(chartResults()).toBe(data.results);
    expectLabelMatchesLine(data, 90);

    // Once still, every future is replayed at the new confidence: a lower
    // line means retiring sooner, so fewer years of work income.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(chartResults()).not.toBe(data.results);
    expectLabelMatchesLine(data, 50);
    const finalBalances = (results: MonteCarloResult[]) =>
      results.reduce((sum, result) => sum + result[result.length - 1].inflationAdjustedBalance, 0);
    expect(finalBalances(chartResults())).toBeLessThan(finalBalances(data.results));
  });

  test('switching views while the slider is settling keeps the label and line together', () => {
    jest.useFakeTimers();
    const { data } = renderCard();

    // Percentiles view follows the slider live.
    moveSlider(70);
    expectLabelMatchesLine(data, 70);

    // Switching to every future before the slider settles shows the last
    // settled value until the wait ends.
    fireEvent.click(screen.getByLabelText('Only show percentiles?'));
    expectLabelMatchesLine(data, 90);
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS);
    });
    expectLabelMatchesLine(data, 70);

    // Switching back mid-wait jumps straight to the live value.
    moveSlider(60);
    expectLabelMatchesLine(data, 70);
    fireEvent.click(screen.getByLabelText('Only show percentiles?'));
    expectLabelMatchesLine(data, 60);
  });

  test("moving the slider doesn't recolor the other lines", () => {
    const { container } = renderCard();
    const before = otherLineColors(container);
    expect(before.length).toBeGreaterThan(5);

    moveSlider(80);
    moveSlider(70);

    expect(otherLineColors(container)).toEqual(before);
  });
});

describe('chart scale', () => {
  const lineCount = (container: HTMLElement) => container.querySelectorAll('.recharts-line-curve').length;
  const topYTick = (container: HTMLElement) => {
    const ticks = Array.from(container.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value'));
    return Number(ticks[ticks.length - 1].textContent!.replace(/[$,]/g, ''));
  };

  test('leaves min and max out by default, so they do not set the y-axis', () => {
    // One runaway future, like the ones that reach billions by the end year.
    const data = response();
    data.results[0] = data.results[0].map((year) => ({
      ...year,
      balance: year.balance * 100,
      inflationAdjustedBalance: year.inflationAdjustedBalance * 100,
    }));
    const { container } = render(<MonteCarloResultsCard fetcher={{ data, state: 'idle' } as any} />);
    const minMaxSwitch = screen.getByLabelText('Exclude min/max from graph?');
    expect(minMaxSwitch).toBeChecked();
    const linesWithout = lineCount(container);
    const topWithout = topYTick(container);

    fireEvent.click(minMaxSwitch);

    expect(lineCount(container)).toBe(linesWithout + 2);
    expect(topYTick(container)).toBeGreaterThan(topWithout);
  });
});
