/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   The chart's SVG lines have no roles or labels to query by, so these tests
   find them by Recharts' class names and the ready line's color. */
import { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MonteCarloResultsCard, { keepWorkingChartLastYear, SLIDER_SETTLE_MS } from './MonteCarloResultsCard';
import MonteCarloSimulation, { AssetClass, Inflation, Job } from '../calculators/MonteCarloSimulation';
import { computeReadyLine } from '../calculators/ReadyLine';

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
const inputs = {
  startingBalance: 200000,
  monthlyExpenses: -3000,
  jobs: [
    new Job({
      name: '',
      postTaxAnnualIncome: '70000',
      adjustForInflation: 'on',
      yearlyRaisePercentage: '0',
      startDate: '',
      endDate: `${startYear + 12}-07-01`,
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
  endYear: startYear + 40,
};

const response = () => {
  const simulate = () =>
    new MonteCarloSimulation(
      inputs.startingBalance, inputs.monthlyExpenses, inputs.jobs, inputs.lifeEvents,
      inputs.assetClasses, inputs.inflation, inputs.endYear
    );
  return {
    results: [...Array(20)].map(() => simulate().run()),
    deterministicResult: simulate().runDeterministic(),
    readyLine: computeReadyLine({ ...inputs, futures: 20, sequences: 200 }),
  };
};

const renderCard = () =>
  render(<MonteCarloResultsCard fetcher={{ data: response(), state: 'idle' } as any} />);
const readyLinePath = (container: HTMLElement) =>
  container.querySelector('.recharts-line-curve[stroke="#198754"]')?.getAttribute('d');
const otherLineColors = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.recharts-line-curve'))
    .map((line) => line.getAttribute('stroke'))
    .filter((stroke) => stroke !== '#198754');
const moveSlider = (value: number) =>
  fireEvent.change(screen.getByLabelText(/Confidence you won't run out/), { target: { value: String(value) } });

describe('keepWorkingChartLastYear', () => {
  test('shows five years past when 9 in 10 are ready', () => {
    expect(keepWorkingChartLastYear(2100, 2050, 2045)).toBe(2055);
  });

  test('uses the planned retirement when it is later than that', () => {
    expect(keepWorkingChartLastYear(2100, 2040, 2046)).toBe(2051);
  });

  test('shows everything when more than 1 in 10 are never ready', () => {
    expect(keepWorkingChartLastYear(2100, undefined, 2046)).toBe(2100);
  });

  test('never goes past the end year', () => {
    expect(keepWorkingChartLastYear(2052, 2050, 2045)).toBe(2052);
  });
});

describe('confidence slider', () => {
  afterEach(() => jest.useRealTimers());

  test('in the default percentiles view, the chart follows the slider live', () => {
    const { container } = renderCard();
    const before = readyLinePath(container);

    moveSlider(70);

    expect(readyLinePath(container)).not.toBe(before);
  });

  test('with every future drawn, the chart waits until the slider is still', () => {
    jest.useFakeTimers();
    const { container } = renderCard();
    fireEvent.click(screen.getByLabelText('Only show percentiles?'));
    act(() => {
      jest.advanceTimersByTime(SLIDER_SETTLE_MS);
    });
    const before = readyLinePath(container);
    expect(screen.getByText(/the chart updates once you stop moving the slider/)).toBeInTheDocument();

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

    // Still for long enough: now it redraws, once.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(readyLinePath(container)).not.toBe(before);
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
