import { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import ReadyYearsChart, { ReadyYearTooltip, formatShare, notReadyNote, percentTick } from './ReadyYearsChart';
import { ReadyYearSummary } from '../calculators/ReadyLine';

// ResponsiveContainer measures its parent, which is always 0x0 in jsdom, so
// give the chart a fixed size to make it render.
jest.mock('recharts', () => {
  const recharts = jest.requireActual('recharts');
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      jest.requireActual('react').cloneElement(children, { width: 800, height: 220 }),
  };
});

const summary = (overrides: Partial<ReadyYearSummary> = {}): ReadyYearSummary => ({
  p25: 2031,
  median: 2032,
  p75: 2033,
  p90: 2034,
  neverReady: 0,
  forcedOut: 0,
  ranOutWhileWorking: 0,
  successRate: 0.9,
  ...overrides,
});

describe('formatShare', () => {
  test.each([
    [0, '0%'],
    [0.0004, '<0.1%'],
    [0.012, '1.2%'],
    [0.25, '25%'],
  ])('%s is %s', (share, text) => {
    expect(formatShare(share)).toBe(text);
  });
});

describe('percentTick', () => {
  test("keeps a half percent instead of rounding it", () => {
    expect(percentTick(0.025)).toBe('2.5%');
    expect(percentTick(0.05)).toBe('5%');
  });
});

describe('notReadyNote', () => {
  test('says nothing when every future is ready', () => {
    expect(notReadyNote(summary(), 2080, 2050)).toBeUndefined();
  });

  test('names each group that is in no bar', () => {
    expect(
      notReadyNote(summary({ neverReady: 0.1, forcedOut: 0.05, ranOutWhileWorking: 0.02 }), 2080, 2050)
    ).toBe(
      "Not in any bar: 5.0% stop working in 2050 without being ready; 2.0% run out of money while still working; 3.0% aren't ready before 2080."
    );
  });

  test('without a work end date, nobody is forced out', () => {
    expect(notReadyNote(summary({ neverReady: 0.04, forcedOut: 0.04 }), 2080)).toBe(
      "Not in any bar: 4.0% aren't ready before 2080."
    );
  });
});

describe('ReadyYearTooltip', () => {
  const bars = { 2031: { year: 2031, lasts: 0.06, runsOut: 0.01 }, 2032: { year: 2032, lasts: 0, runsOut: 0 } };

  test('shows the year and both parts', () => {
    render(<ReadyYearTooltip active label={2031} bars={bars} />);
    expect(screen.getByText('Ready at the end of 2031')).toBeInTheDocument();
    expect(screen.getByText('7.0% of futures')).toBeInTheDocument();
    expect(screen.getByText('Money lasts: 6.0%')).toBeInTheDocument();
    expect(screen.getByText('Runs out later: 1.0%')).toBeInTheDocument();
  });

  test('says when no future is ready that year', () => {
    render(<ReadyYearTooltip active label={2032} bars={bars} />);
    expect(screen.getByText('No futures')).toBeInTheDocument();
  });
});

describe('ReadyYearsChart', () => {
  const bars = [2030, 2031, 2032, 2033, 2034].map((year) => ({ year, lasts: 0.15, runsOut: 0.05 }));

  test('draws the bars with a legend', () => {
    const { container } = render(<ReadyYearsChart bars={bars} summary={summary()} endYear={2080} />);
    expect(screen.getByText('Money lasts')).toBeInTheDocument();
    expect(screen.getByText('Runs out later')).toBeInTheDocument();
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
  });

  test('explains the futures that are in no bar', () => {
    render(<ReadyYearsChart bars={bars} summary={summary({ neverReady: 0.2, forcedOut: 0.2 })} endYear={2080} workEndYear={2050} />);
    expect(screen.getByText('Not in any bar: 20% stop working in 2050 without being ready.')).toBeInTheDocument();
  });
});
