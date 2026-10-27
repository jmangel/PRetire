import { describeDifferences } from './settingsDifferences';
import type { MonteCarloSettings } from './calculators/Settings';

const base: MonteCarloSettings = {
  startingBalance: '1000000',
  monthlyExpenses: '-4000',
  endYear: '2100',
  jobs: [{ name: 'Job', postTaxAnnualIncome: '60000', adjustForInflation: true, startDate: '', endDate: '2040-01-01', atRetirement: 'stops' }],
  life_events: [{ name: '', date: '', balanceChange: '0', monthlyExpensesChange: '0' }],
  inflation: { averageAnnualReturnPercentage: '2.5', standardDeviationPercentage: '1' },
  asset_classes: [{ name: 'Stocks', allocationPercentage: '100', averageAnnualReturnPercentage: '9.9', standardDeviationPercentage: '19.7' }],
};

describe('describeDifferences', () => {
  test('nothing differs', () => {
    expect(describeDifferences(base, { ...base })).toEqual([]);
  });

  test('money and years in words', () => {
    expect(describeDifferences({ ...base, startingBalance: '1400000', endYear: '2090' }, base)).toEqual([
      'Starting balance: $1,400,000 vs $1,000,000',
      'Ending year: 2090 vs 2100',
    ]);
  });

  test('rows by count, then by content, ignoring the blank row the form always has', () => {
    const twoJobs = { ...base, jobs: [...base.jobs, { ...base.jobs[0], name: 'Spouse' }] };
    expect(describeDifferences(twoJobs, base)).toEqual(['Income: 2 income sources vs 1 income source']);

    const raise = { ...base, jobs: [{ ...base.jobs[0], postTaxAnnualIncome: '70000' }] };
    expect(describeDifferences(raise, base)).toEqual(['Income: same number, different details']);

    const house = { ...base, life_events: [{ name: 'Buy house', date: '2030-01-01', balanceChange: '-200000', monthlyExpensesChange: '0' }] };
    expect(describeDifferences(house, base)).toEqual(['Life events: 1 life event vs 0 life events']);
  });

  test('when you retire and the desired success rate', () => {
    const ready = { ...base, retirement: { mode: 'ready' as const, confidence: '90', date: '' } };
    const onDate = { ...base, retirement: { mode: 'date' as const, confidence: '85', date: '2045-01-01' } };
    expect(describeDifferences(onDate, ready)).toEqual([
      'Retire: on 2045-01-01 vs as soon as ready',
      'Desired success rate: 85% vs 90%',
    ]);
    expect(describeDifferences(ready, { ...ready })).toEqual([]);
    // A settings file without the retirement setting isn't compared on it.
    expect(describeDifferences(base, ready)).toEqual([]);
  });

  test('inflation and allocation', () => {
    const changed = {
      ...base,
      inflation: { averageAnnualReturnPercentage: '3', standardDeviationPercentage: '1' },
      asset_classes: [{ ...base.asset_classes[0], allocationPercentage: '60' }],
    };
    expect(describeDifferences(changed, base)).toEqual([
      'Asset allocation: same number, different details',
      'Inflation: 3% ± 1% vs 2.5% ± 1%',
    ]);
  });
});
