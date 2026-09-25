import { mergeReadyLine, ReadyLineSeries } from './MonteCarloGraph';

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
  });

  test('leaves out values that are not finite', () => {
    const merged = mergeReadyLine(data, line({ values: [100, Infinity, 102, NaN, 104] }));

    expect(merged.map((entry) => entry.readyLine)).toEqual([100, undefined, 102, undefined, 104]);
  });
});
