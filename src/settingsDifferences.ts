import type { MonteCarloSettings } from './calculators/Settings';

const dollars = (text: string) => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : text.trim() || 'blank';
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A row someone filled in, as opposed to the blank row the form always shows.
const isFilledIn = (row: Record<string, unknown>) =>
  Object.entries(row).some(([key, value]) => typeof value === 'string' && key !== 'atRetirement' && value.trim() !== '' && value.trim() !== '0');

/** Compare two lists of rows: by how many there are, then by what's in them. */
const compareRows = (
  label: string,
  [one, many]: [string, string],
  a: Array<Record<string, unknown>>,
  b: Array<Record<string, unknown>>
): string | null => {
  const filledA = a.filter(isFilledIn);
  const filledB = b.filter(isFilledIn);
  if (filledA.length !== filledB.length) {
    return `${label}: ${plural(filledA.length, one, many)} vs ${plural(filledB.length, one, many)}`;
  }
  return JSON.stringify(filledA) === JSON.stringify(filledB) ? null : `${label}: same number, different details`;
};

/**
 * The settings that differ between two scenarios, in words, for telling
 * apart scenarios that have the same tags. The app can say what differs,
 * not what to call the difference, so it's up to the user to tag it.
 */
export const describeDifferences = (a: MonteCarloSettings, b: MonteCarloSettings): string[] => {
  const differences: string[] = [];
  const compare = (label: string, x: string, y: string, format: (text: string) => string = (t) => t) => {
    if (x.trim() !== y.trim()) differences.push(`${label}: ${format(x)} vs ${format(y)}`);
  };
  compare('Starting balance', a.startingBalance, b.startingBalance, dollars);
  compare('Monthly expenses', a.monthlyExpenses, b.monthlyExpenses, dollars);
  compare('Ending year', a.endYear, b.endYear);
  // Files from before retirement was its own setting have none; they're
  // brought up to date when loaded, so compare only when both have it.
  if (a.retirement && b.retirement) {
    const when = (s: MonteCarloSettings) =>
      s.retirement!.mode === 'date' ? `on ${s.retirement!.date || 'a date not set yet'}` : 'as soon as ready';
    compare('Retire', when(a), when(b));
    compare('Desired success rate', a.retirement.confidence, b.retirement.confidence, (t) => `${t}%`);
  }
  [
    compareRows('Income', ['income source', 'income sources'], a.jobs, b.jobs),
    compareRows('Life events', ['life event', 'life events'], a.life_events, b.life_events),
    compareRows('Asset allocation', ['asset class', 'asset classes'], a.asset_classes, b.asset_classes),
  ].forEach((difference) => difference && differences.push(difference));
  const inflation = (s: MonteCarloSettings) =>
    `${s.inflation.averageAnnualReturnPercentage}% ± ${s.inflation.standardDeviationPercentage}%`;
  compare('Inflation', inflation(a), inflation(b));
  return differences;
};
