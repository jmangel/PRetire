/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   The chart's SVG bars and shading have no roles or labels to query by, so
   these tests find them by class name. */
import { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import ReadyYearsChart, { ReadyYearTooltip, formatShare, notReadyNote, percentTick, yearStep } from './ReadyYearsChart';
import { ReadyYearSummary } from '../calculators/ReadyLine';

// ResponsiveContainer measures its parent, which is always 0x0 in jsdom, so
// give the chart a fixed size to make it render.
const CHART_WIDTH = 800;
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
  notReadyByEnd: 0,
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
      notReadyNote(
        summary({ neverReady: 0.1, forcedOut: 0.05, ranOutWhileWorking: 0.02, notReadyByEnd: 0.03 }),
        2080,
        2050
      )
    ).toBe(
      "Not in any bar: 5.0% stop working in 2050 without being ready; 2.0% run out of money while still working; 3.0% aren't ready before 2080."
    );
  });

  test('without a work end date, nobody is forced out', () => {
    expect(notReadyNote(summary({ neverReady: 0.04, forcedOut: 0.04, notReadyByEnd: 0.04 }), 2080)).toBe(
      "Not in any bar: 4.0% aren't ready before 2080."
    );
  });

  test("float residue doesn't add a group that isn't there", () => {
    // 1 forced and 31 out of money, of 10,000 futures: subtracting the shares
    // leaves about 4e-19, not 0.
    const residue = { neverReady: 32 / 10000, forcedOut: 1 / 10000, ranOutWhileWorking: 31 / 10000 };
    expect(residue.neverReady - residue.forcedOut - residue.ranOutWhileWorking).toBeGreaterThan(0);

    const note = notReadyNote(residue, 2080, 2050);
    expect(note).not.toMatch(/aren't ready before/);
    expect(notReadyNote(summary({ ...residue, notReadyByEnd: 0 }), 2080, 2050)).toBe(note);
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
  const years = [2030, 2031, 2032, 2033, 2034];
  const bars = years.map((year) => ({ year, lasts: 0.15, runsOut: 0.05 }));
  const step = yearStep(CHART_WIDTH, years.length);
  const shading = (container: HTMLElement) => container.querySelector('.ready-years-shading');

  test('draws the bars with a legend', () => {
    const { container } = render(<ReadyYearsChart bars={bars} summary={summary()} endYear={2080} />);
    expect(screen.getByText('Money lasts')).toBeInTheDocument();
    expect(screen.getByText('Runs out later')).toBeInTheDocument();
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
  });

  test('a year with no futures gets no bar', () => {
    const withGap = bars.map((bar) => (bar.year === 2032 ? { ...bar, lasts: 0, runsOut: 0 } : bar));
    const count = (data: typeof bars) => {
      const { container, unmount } = render(<ReadyYearsChart bars={data} summary={summary()} endYear={2080} />);
      const drawn = Array.from(container.querySelectorAll('.recharts-bar-rectangle path')).length;
      unmount();
      return drawn;
    };
    // Two segments a year: one empty year is two fewer.
    expect(count(withGap)).toBe(count(bars) - 2);
  });

  test("shades the middle half's years whole, half a year past each end", () => {
    const { container } = render(<ReadyYearsChart bars={bars} summary={summary()} endYear={2080} />);
    // 2031 through 2033 is two steps between points, plus half a step each side.
    expect(Number(shading(container)?.getAttribute('width'))).toBeCloseTo(3 * step);
    expect(screen.getByText(/The shaded years are where the middle half are ready/)).toBeInTheDocument();
  });

  test('shades a single year when the middle half are all ready in it', () => {
    const { container } = render(
      <ReadyYearsChart bars={bars} summary={summary({ p25: 2032, median: 2032, p75: 2032 })} endYear={2080} />
    );
    expect(Number(shading(container)?.getAttribute('width'))).toBeCloseTo(step);
    expect(screen.getByText(/The shaded years are where the middle half are ready/)).toBeInTheDocument();
  });

  test('without the middle half in range, nothing is shaded or promised', () => {
    const { container } = render(
      <ReadyYearsChart
        bars={bars}
        summary={summary({ p25: 2031, median: undefined, p75: undefined, p90: undefined })}
        endYear={2080}
      />
    );
    expect(shading(container)).toBeNull();
    expect(screen.queryByText(/shaded years/)).not.toBeInTheDocument();
    expect(screen.queryByText('Typically ready')).not.toBeInTheDocument();
  });

  test('draws nothing without any years', () => {
    const { container } = render(<ReadyYearsChart bars={[]} summary={summary()} endYear={2080} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('explains the futures that are in no bar', () => {
    render(
      <ReadyYearsChart
        bars={bars}
        summary={summary({ neverReady: 0.2, forcedOut: 0.2 })}
        endYear={2080}
        workEndYear={2050}
      />
    );
    expect(screen.getByText('Not in any bar: 20% stop working in 2050 without being ready.')).toBeInTheDocument();
  });
});
