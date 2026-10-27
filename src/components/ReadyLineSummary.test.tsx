import { fireEvent, render, screen } from '@testing-library/react';
import ReadyLineSummary, { formatPlannedDate, readyHeadline, readySentences, successSentences } from './ReadyLineSummary';

const summary = {
  p25: 2037, median: 2041, p75: 2045, p90: 2050,
  neverReady: 0, forcedOut: 0, ranOutWhileWorking: 0, successRate: 0.934, readySuccessRate: 0.934,
};

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

  test('says how many futures stop working when work income ends before they are ready', () => {
    expect(readySentences({ ...summary, p90: undefined, neverReady: 0.15, forcedOut: 0.15 }, 2100, 2045).text).toEqual([
      'Half of these futures are ready between 2037 and 2045.',
      "About 15% of these futures haven't reached the ready line when your work income ends in 2045, so they stop working then without being ready.",
    ]);
    expect(readySentences({ neverReady: 0.97, forcedOut: 0.97 }, 2100, 2040).text).toEqual([
      "Most of these futures haven't reached the ready line when your work income ends in 2040, so they stop working then without being ready.",
      'Try a lower success rate, lower expenses, or a later end date for your work income.',
    ]);
  });

  test('says how many futures run out of money while still working', () => {
    expect(
      readySentences({ ...summary, p90: undefined, neverReady: 0.12, ranOutWhileWorking: 0.12 }, 2100).text
    ).toEqual([
      'Half of these futures are ready between 2037 and 2045.',
      'About 12% of these futures run out of money while still working, so they never reach the ready line.',
    ]);
    expect(readySentences({ neverReady: 0.8, ranOutWhileWorking: 0.8 }, 2100).text[0]).toBe(
      'Most of these futures run out of money while still working, so they never reach the ready line.'
    );
  });
});

describe('successSentences', () => {
  test('one rate when every future reaches the line', () => {
    expect(successSentences(summary)).toEqual([
      'If you re-check every year and retire once your balance reaches the green ready line, the money lasts in 93% of these futures.',
    ]);
  });

  test('separates futures that reach the line from those forced out before they do', () => {
    expect(
      successSentences(
        { ...summary, neverReady: 0.38, forcedOut: 0.38, successRate: 0.83, readySuccessRate: 0.92, forcedSuccessRate: 0.68 },
        2048
      )
    ).toEqual([
      'Of the futures that reach the green ready line and retire then, the money lasts in 92%.',
      'Of those that stop working in 2048 without being ready, it lasts in 68%.',
      'Overall, the money lasts in 83% of these futures.',
    ]);
  });

  test('when almost none reach the line, gives just the rate for those forced out', () => {
    expect(
      successSentences(
        { ...summary, neverReady: 0.998, forcedOut: 0.998, successRate: 0.05, readySuccessRate: 1, forcedSuccessRate: 0.05 },
        2040
      )
    ).toEqual(['Of the futures that stop working in 2040 without being ready, the money lasts in 5%.']);
  });

  test('keeps the overall rate when some futures are in neither group', () => {
    // 3% reach the line, 60% are forced out, and the rest run out of money
    // while still working.
    expect(
      successSentences(
        { ...summary, neverReady: 0.97, forcedOut: 0.6, ranOutWhileWorking: 0.37, successRate: 0.05, forcedSuccessRate: 0.08 },
        2040
      )
    ).toEqual([
      'Of the futures that reach the green ready line and retire then, the money lasts in 93%.',
      'Of those that stop working in 2040 without being ready, it lasts in 8%.',
      'Overall, the money lasts in 5% of these futures.',
    ]);
  });
});

describe('readyHeadline', () => {
  test('leads with the typical ready year', () => {
    expect(readyHeadline(summary, 2100)).toBe("You'd typically be ready to retire by the end of 2041");
  });

  test('says when most futures are never ready, and why', () => {
    expect(readyHeadline({ ...summary, median: undefined, neverReady: 0.6 }, 2100)).toBe(
      "Most futures aren't ready to retire before 2100"
    );
    expect(readyHeadline({ ...summary, median: undefined, neverReady: 0.6, forcedOut: 0.6 }, 2100, 2045)).toBe(
      "Most futures haven't reached the ready line when your work income ends in 2045"
    );
    expect(readyHeadline({ ...summary, median: undefined, neverReady: 0.6, ranOutWhileWorking: 0.6 }, 2100)).toBe(
      'Most futures run out of money while still working'
    );
  });
});

describe('ReadyLineSummary', () => {
  test('retiring when ready, shows the range and how often the money lasts', () => {
    render(<ReadyLineSummary mode="ready" summary={summary} endYear={2100} confidence={90} setConfidence={jest.fn()} />);

    expect(screen.getByText(/Half of these futures are ready between 2037 and 2045/)).toBeInTheDocument();
    expect(screen.getByText(/the money lasts in 93% of these futures/)).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText(/Desired success rate: 90%/), { target: { value: '80' } });
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
