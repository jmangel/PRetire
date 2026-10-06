import { fireEvent, render, screen } from '@testing-library/react';
import ReadyLineSummary, { formatPlannedDate, readySentences } from './ReadyLineSummary';

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
});

describe('ReadyLineSummary', () => {
  test('shows the plan date and typical year, and reports slider changes', () => {
    const setConfidence = jest.fn();
    render(
      <ReadyLineSummary
        summary={{ p25: 2037, median: 2041, p75: 2045, p90: 2050, neverReady: 0 }}
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
        summary={{ p25: 2037, median: 2041, p75: 2045, p90: 2050, neverReady: 0 }}
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
