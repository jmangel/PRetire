import { Job, plannedRetirementDate } from './MonteCarloSimulation';

describe('plannedRetirementDate', () => {
  const job = (
    postTaxAnnualIncome: string,
    endDate: string,
    atRetirement?: string
  ) =>
    new Job({
      name: '',
      postTaxAnnualIncome,
      adjustForInflation: 'on',
      yearlyRaisePercentage: '0',
      startDate: '',
      endDate,
      atRetirement,
    });

  test('is when the last income that stops at retirement ends', () => {
    const jobs = [
      job('80000', '2031-07-01'), // job change, not retirement
      job('95000', '2044-07-01'),
      job('30000', '', 'unaffected'), // e.g. Social Security, no end date
    ];

    expect(plannedRetirementDate(jobs)).toEqual(new Date('2044-07-01'));
  });

  test('defaults to "stops" when the option is missing (older settings files)', () => {
    expect(job('1', '').atRetirement).toBe('stops');
    expect(job('1', '', 'something-else').atRetirement).toBe('stops');
  });

  test('ignores blank and $0 income rows', () => {
    const jobs = [job('95000', '2044-07-01'), job('0', ''), job('', '')];

    expect(plannedRetirementDate(jobs)).toEqual(new Date('2044-07-01'));
  });

  test('is undefined when some work income has no end date', () => {
    expect(plannedRetirementDate([job('95000', '2044-07-01'), job('40000', '')])).toBeUndefined();
  });

  test('is undefined when no income stops at retirement', () => {
    expect(plannedRetirementDate([job('30000', '', 'unaffected')])).toBeUndefined();
    expect(plannedRetirementDate([])).toBeUndefined();
  });
});
