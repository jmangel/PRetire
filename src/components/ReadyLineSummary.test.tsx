import { fireEvent, render, screen } from '@testing-library/react';
import ReadyLineSummary, { formatPlannedDate, readyHeadline, readySentences } from './ReadyLineSummary';

const summary = { p25: 2037, median: 2041, p75: 2045, p90: 2050, neverReady: 0, forcedOut: 0, successRate: 0.934 };

describe('readySentences', () => {
  test('describes the typical year, the middle half, and 9 in 10', () => {
    expect(readySentences({ p25: 2037, median: 2041, p75: 2045, p90: 2050, neverReady: 0 }, 2100)).toEqual({
      typical: 2041,
      text: ['Half of these futures are ready between 2037 and 2045.', '9 in 10 are ready by 2050.'],
    });
  });

  test('says how many futures are never ready', () => {
    expect(readySentences({ p25: 2050, median: 2060, p75: 2080, neverReady: 0.15 }, 2100).text).toContain(
      "About 15% of these futures aren't ready before 2100."
    );
    expect(readySentences({ p25: 2050, median: 2070, neverReady: 0.4 }, 2100).text).toContain(
      "About 40% of these futures aren't ready before 2100."
    );
  });

  test('suggests changes when most futures are never ready', () => {
    const { typical, text } = readySentences({ p25: 2090, neverReady: 0.6 }, 2100);

    expect(typical).toBeUndefined();
    expect(text[0]).toBe("Most of these futures don't reach the ready line before 2100.");
  });

  test('says how many futures retire when work income ends before they are ready', () => {
    expect(readySentences({ ...summary, p90: undefined, neverReady: 0.15, forcedOut: 0.15 }, 2100, 2045).text).toEqual([
      'Half of these futures are ready between 2037 and 2045.',
      "About 15% of these futures aren't ready by 2045, when your work income ends, so they retire then anyway.",
    ]);
    expect(readySentences({ ...summary, neverReady: 0.04, forcedOut: 0.04 }, 2100, 2045).text).toContain(
      "About 4% of these futures aren't ready by 2045, when your work income ends, so they retire then anyway."
    );
    expect(readySentences({ neverReady: 0.7, forcedOut: 0.7 }, 2100, 2045).text[0]).toBe(
      "Most of these futures aren't ready by 2045, when your work income ends, so they retire then anyway."
    );
  });
});

describe('readyHeadline', () => {
  test('leads with the typical ready year', () => {
    expect(readyHeadline(summary, 2100)).toBe("You'd typically be ready to retire by the end of 2041");
  });

  test('says when most futures are never ready', () => {
    expect(readyHeadline({ ...summary, median: undefined, neverReady: 0.6 }, 2100)).toBe(
      "Most futures aren't ready to retire before 2100"
    );
    expect(readyHeadline({ ...summary, median: undefined, neverReady: 0.6, forcedOut: 0.6 }, 2100, 2045)).toBe(
      "Most futures aren't ready before your work income ends in 2045"
    );
  });
});

describe('ReadyLineSummary', () => {
  test('retiring when ready, shows the range and how often the money lasts', () => {
    render(<ReadyLineSummary mode="ready" summary={summary} endYear={2100} confidence={90} setConfidence={jest.fn()} />);

    expect(screen.getByText(/Half of these futures are ready between 2037 and 2045/)).toBeInTheDocument();
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.queryByText('When you could retire')).not.toBeInTheDocument();
  });

  test('shows the plan date and typical year, and reports slider changes', () => {
    const setConfidence = jest.fn();
    render(
      <ReadyLineSummary
        mode="date"
        summary={summary}
        endYear={2100}
        plannedRetirement={new Date('2044-07-01')}
        confidence={90}
        setConfidence={setConfidence}
      />
    );

    expect(screen.getByText(/assumes you retire on July 1, 2044/)).toBeInTheDocument();
    expect(screen.getByText('2041')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Confidence you won't run out: 90%/), { target: { value: '80' } });
    expect(setConfidence).toHaveBeenCalledWith(80);
  });

  test('leaves out the plan-date sentence when there is no planned retirement', () => {
    render(
      <ReadyLineSummary
        mode="date"
        summary={summary}
        endYear={2100}
        confidence={90}
        setConfidence={jest.fn()}
      />
    );

    expect(screen.queryByText(/assumes you retire on/)).not.toBeInTheDocument();
    expect(screen.getByText('2041')).toBeInTheDocument();
  });

  test('formats dates without shifting a day in US time zones', () => {
    expect(formatPlannedDate(new Date('2044-07-01'))).toBe('July 1, 2044');
  });
});
