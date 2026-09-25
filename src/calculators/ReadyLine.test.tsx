import MonteCarloSimulation, { AssetClass, Inflation, Job, LifeEvent } from './MonteCarloSimulation';
import {
  ReadyLineData,
  computeReadyLine,
  keepWorkingJobs,
  readyLineAt,
  readyYears,
  requiredBalancesByYear,
  summarizeReadyYears,
} from './ReadyLine';

const assets = (averageAnnualReturnPercentage: number, standardDeviationPercentage: number) => [
  new AssetClass({
    name: 'Portfolio',
    allocationPercentage: 100,
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
  }),
];
const inflation = (averageAnnualReturnPercentage: number, standardDeviationPercentage: number) =>
  new Inflation({ averageAnnualReturnPercentage, standardDeviationPercentage });
const job = (
  postTaxAnnualIncome: string,
  { startDate = '', endDate = '', atRetirement = 'stops', adjustForInflation = true } = {}
) =>
  new Job({
    name: '',
    postTaxAnnualIncome,
    adjustForInflation: adjustForInflation ? 'on' : '',
    yearlyRaisePercentage: '0',
    startDate,
    endDate,
    atRetirement,
  });

describe('requiredBalancesByYear', () => {
  test('with no returns or inflation, you need exactly the remaining expenses', () => {
    const required = requiredBalancesByYear({
      monthlyExpenses: -4000,
      jobs: [],
      lifeEvents: [],
      assetClasses: assets(0, 0),
      inflation: inflation(0, 0),
      startYear: 2030,
      endYear: 2040,
      sequences: 3,
    });

    // Retiring at the end of 2030 leaves 2031-2040: ten years of $48k.
    expect(readyLineAt({ requiredBalances: required } as ReadyLineData, 0.9)[0]).toBeCloseTo(480000, 6);
    expect(readyLineAt({ requiredBalances: required } as ReadyLineData, 0.9)[9]).toBeCloseTo(48000, 6);
  });

  test('matches the simulation exactly, including income and life events', () => {
    const socialSecurity = job('20000', { startDate: '2045-01-01', atRetirement: 'unaffected' });
    const lifeEvents = [
      new LifeEvent({ name: '', date: '2048-06-01', balanceChange: '-75000', monthlyExpensesChange: '0' }),
      new LifeEvent({ name: '', date: '2050-06-01', balanceChange: '0', monthlyExpensesChange: '1000' }),
    ];
    const assetClasses = assets(5, 0);
    const steadyInflation = inflation(3, 0);
    const retireAtEndOf = 2040;

    const required = requiredBalancesByYear({
      monthlyExpenses: -4000,
      jobs: [job('95000'), socialSecurity],
      lifeEvents,
      assetClasses,
      inflation: steadyInflation,
      startYear: 2030,
      endYear: 2070,
      sequences: 2,
    });
    const needed = required[retireAtEndOf - 2030][0];

    // Simulating retirement from exactly that balance should bottom out at $0.
    const retire = (balance: number) =>
      new MonteCarloSimulation(
        balance, -4000, [socialSecurity], lifeEvents, assetClasses,
        steadyInflation, 2070, retireAtEndOf + 1
      ).runDeterministic();
    const lowest = Math.min(...retire(needed).map(({ inflationAdjustedBalance }) => inflationAdjustedBalance));

    expect(lowest).toBeGreaterThanOrEqual(-1e-6);
    expect(lowest).toBeLessThan(1);
    expect(retire(needed - 100).some(({ balance }) => balance < 0)).toBe(true);
  });

  test('matches the simulation exactly for income not adjusted for inflation', () => {
    // A fixed pension: its real value shrinks as inflation builds up, so the
    // backward pass converts it using the inflation up to each year.
    const pension = job('18000', {
      startDate: '2045-01-01',
      atRetirement: 'unaffected',
      adjustForInflation: false,
    });
    const assetClasses = assets(5, 0);
    const steadyInflation = inflation(3, 0);
    const startYear = 2030;
    const retireAtEndOf = 2040;

    const required = requiredBalancesByYear({
      monthlyExpenses: -4000,
      jobs: [job('95000'), pension],
      lifeEvents: [],
      assetClasses,
      inflation: steadyInflation,
      startYear,
      endYear: 2070,
      sequences: 2,
    });
    const needed = required[retireAtEndOf - startYear][0];

    // Pick up at retirement with the inflation that has built up by then, so
    // the pension's fixed dollar amount is worth what it would be at that point.
    const multiplier = 1.03 ** (retireAtEndOf + 1 - startYear);
    const retire = (balance: number) => {
      const sim = new MonteCarloSimulation(
        balance * multiplier, -4000 * multiplier, [pension], [], assetClasses,
        steadyInflation, 2070, retireAtEndOf + 1
      );
      sim.cumulativeInflationMultiplier = multiplier;
      return sim.runDeterministic();
    };
    const lowest = Math.min(...retire(needed).map(({ inflationAdjustedBalance }) => inflationAdjustedBalance));

    expect(lowest).toBeGreaterThanOrEqual(-1e-6);
    expect(lowest).toBeLessThan(1);
    expect(retire(needed - 100).some(({ balance }) => balance < 0)).toBe(true);
  });

  test('matches brute-force simulation of retiring from the ready line', () => {
    const assetClasses = assets(9.9, 19.7028);
    const marketInflation = inflation(2.9, 1.1343);
    const socialSecurity = job('24000', { startDate: '2055-01-01', atRetirement: 'unaffected' });
    const data = {
      requiredBalances: requiredBalancesByYear({
        monthlyExpenses: -4000,
        jobs: [job('95000'), socialSecurity],
        lifeEvents: [],
        assetClasses,
        inflation: marketInflation,
        startYear: 2027,
        endYear: 2100,
        sequences: 5000,
      }),
    } as ReadyLineData;
    const retireAtEndOf = 2045;

    const successRateFrom = (balance: number, runs = 4000) => {
      let successes = 0;
      for (let i = 0; i < runs; i++) {
        const result = new MonteCarloSimulation(
          balance, -4000, [socialSecurity], [], assetClasses,
          marketInflation, 2100, retireAtEndOf + 1
        ).run();
        if (result.every(({ balance }) => balance >= 0)) successes++;
      }
      return successes / runs;
    };

    for (const confidence of [0.5, 0.9]) {
      const balance = readyLineAt(data, confidence)[retireAtEndOf - 2027];
      // Random, so allow for sampling noise in both the line and this check.
      expect(Math.abs(successRateFrom(balance) - confidence)).toBeLessThan(0.04);
    }
  });
});

describe('keepWorkingJobs', () => {
  test('only the income ending on the planned retirement date keeps going', () => {
    const jobs = [
      job('80000', { endDate: '2031-07-01' }), // job change
      job('95000', { startDate: '2031-07-01', endDate: '2044-07-01' }),
      job('30000', { startDate: '2055-01-01', endDate: '2044-07-01', atRetirement: 'unaffected' }),
    ];
    const working = keepWorkingJobs(jobs, 2027);

    expect(working[0].endDate).toEqual(new Date('2031-07-01'));
    expect(working[1].endDate).toBeUndefined();
    expect(working[1].startDate).toEqual(new Date('2031-07-01'));
    expect(working[1]).toBeInstanceOf(Job);
    expect(working[2].endDate).toEqual(new Date('2044-07-01'));
    expect(jobs[1].endDate).toEqual(new Date('2044-07-01')); // original untouched
  });

  test("doesn't bring back a job that ended before the first simulated year", () => {
    const jobs = [job('95000', { endDate: '2028-07-01' })];

    expect(keepWorkingJobs(jobs, 2030)[0].endDate).toEqual(new Date('2028-07-01'));
  });
});

describe('computeReadyLine', () => {
  test('keep-working futures earn past the planned retirement date', () => {
    const data = computeReadyLine({
      startingBalance: 0,
      monthlyExpenses: 0,
      jobs: [job('70000', { endDate: '2035-01-01' })],
      lifeEvents: [],
      assetClasses: assets(0, 0),
      inflation: inflation(0, 0),
      startYear: 2030,
      endYear: 2040,
      futures: 2,
      sequences: 2,
    })!;

    expect(data.plannedRetirement).toEqual(new Date('2035-01-01'));
    expect(data.workingDeterministicResult.at(-1)!.balance).toBeCloseTo(770000, 6);
    expect(data.workingResults).toHaveLength(2);
  });

  test('is undefined when the planned retirement is before the first simulated year', () => {
    // E.g. re-running a saved plan after retiring: the last job's end date is
    // now in the past, and that job must not be brought back.
    const inputs = {
      startingBalance: 1000000,
      monthlyExpenses: -4000,
      lifeEvents: [],
      assetClasses: assets(5, 10),
      inflation: inflation(3, 1),
      startYear: 2030,
      endYear: 2080,
      futures: 2,
      sequences: 2,
    };

    expect(computeReadyLine({ ...inputs, jobs: [job('95000', { endDate: '2028-07-01' })] })).toBeUndefined();
    // Retiring on the first day of the first simulated year counts too.
    expect(computeReadyLine({ ...inputs, jobs: [job('95000', { endDate: '2030-01-01' })] })).toBeUndefined();
    // Retiring during the first simulated year still gets a ready line.
    expect(computeReadyLine({ ...inputs, jobs: [job('95000', { endDate: '2030-07-01' })] })).toBeDefined();
  });

  test('is undefined when nothing stops at retirement', () => {
    expect(
      computeReadyLine({
        startingBalance: 1000000,
        monthlyExpenses: -4000,
        jobs: [job('30000', { atRetirement: 'unaffected' })],
        lifeEvents: [],
        assetClasses: assets(5, 10),
        inflation: inflation(3, 1),
        endYear: 2080,
        futures: 2,
        sequences: 2,
      })
    ).toBeUndefined();
  });
});

describe('readyYears and summarizeReadyYears', () => {
  const row = (year: number, balance: number) => ({
    year,
    balance,
    inflationAdjustedBalance: balance,
    inflation: 0,
    monthlyExpenses: 0,
    inflationAdjustedMonthlyExpenses: 0,
  });

  test('each future is ready the first year it reaches the line', () => {
    const data = {
      startYear: 2030,
      workingResults: [
        [row(2030, 50), row(2031, 150), row(2032, 90)], // crosses, then dips: still 2031
        [row(2030, 10), row(2031, 20), row(2032, 30)], // never crosses
        [row(2030, -1), row(2031, 500), row(2032, 500)], // ran out while working
      ],
    } as unknown as ReadyLineData;

    expect(readyYears(data, [100, 100, 100])).toEqual([2031, undefined, undefined]);
  });

  test('summarizes the spread of ready years', () => {
    const years = [2035, 2037, 2039, 2041, 2043, 2045, 2047, 2049, undefined];
    const summary = summarizeReadyYears(years);

    expect(summary.p25).toBe(2039);
    expect(summary.median).toBe(2043);
    expect(summary.p75).toBe(2047);
    expect(summary.p90).toBe(2049);
    expect(summary.neverReady).toBeCloseTo(1 / 9, 10);
  });

  test('a percentile that lands on never-ready futures is undefined', () => {
    const summary = summarizeReadyYears([2040, undefined, undefined]);

    expect(summary.p25).toBe(2040);
    expect(summary.median).toBeUndefined();
  });
});
