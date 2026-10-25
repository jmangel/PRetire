import MonteCarloSimulation, { AssetClass, Inflation, Job, LifeEvent, sampleRandomNormal } from './MonteCarloSimulation';
import {
  ReadyLineData,
  computeReadyLine,
  readyFutures,
  readyLineAt,
  readyOutcomes,
  requiredBalancesByYear,
  summarizeReadyYears,
} from './ReadyLine';
import { averageMarkets, drawMarkets } from './Futures';

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

  test('stays close to its confidence for a fixed pension with random inflation', () => {
    // The one approximate case: a pension's real value depends on the
    // inflation each future has already had, but every future shares one
    // line. Retire from the line with a random inflation history and check
    // it still succeeds about as often as promised.
    const assetClasses = assets(9.9, 19.7028);
    const marketInflation = inflation(2.9, 3);
    const pension = job('24000', { startDate: '2045-01-01', atRetirement: 'unaffected', adjustForInflation: false });
    const startYear = 2027;
    const retireAtEndOf = 2040;
    const data = {
      requiredBalances: requiredBalancesByYear({
        monthlyExpenses: -4000,
        jobs: [job('95000'), pension],
        lifeEvents: [],
        assetClasses,
        inflation: marketInflation,
        startYear,
        endYear: 2090,
        sequences: 5000,
      }),
    } as ReadyLineData;

    const successRateFrom = (realBalance: number, runs = 4000) => {
      let successes = 0;
      for (let i = 0; i < runs; i++) {
        let multiplier = 1;
        for (let year = startYear; year <= retireAtEndOf; year++) {
          multiplier *= 1 + sampleRandomNormal(marketInflation.averageAnnualReturn, marketInflation.standardDeviation);
        }
        const sim = new MonteCarloSimulation(
          realBalance * multiplier, -4000 * multiplier, [pension], [], assetClasses,
          marketInflation, 2090, retireAtEndOf + 1
        );
        sim.cumulativeInflationMultiplier = multiplier;
        if (sim.run().every(({ balance }) => balance >= 0)) successes++;
      }
      return successes / runs;
    };

    // Measured while writing this: within about 1 point of the target.
    for (const confidence of [0.5, 0.9]) {
      const balance = readyLineAt(data, confidence)[retireAtEndOf - startYear];
      expect(Math.abs(successRateFrom(balance) - confidence)).toBeLessThan(0.04);
    }
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

describe('at-retirement life events', () => {
  test('the line covers them, happening the year after retiring', () => {
    // Health insurance until Medicare, say: a lump sum and higher expenses
    // that start whenever you retire.
    const atRetirement = new LifeEvent({
      name: '', date: '', balanceChange: '-20000', monthlyExpensesChange: '-800', atRetirement: true,
    });
    const assetClasses = assets(5, 0);
    const steadyInflation = inflation(3, 0);
    const startYear = 2030;
    const required = requiredBalancesByYear({
      monthlyExpenses: -4000,
      jobs: [job('95000')],
      lifeEvents: [atRetirement],
      assetClasses,
      inflation: steadyInflation,
      startYear,
      endYear: 2070,
      sequences: 2,
    });

    for (const retireAtEndOf of [2035, 2045]) {
      const needed = required[retireAtEndOf - startYear][0];
      // The same event, dated on the retirement date (January 1 of the next
      // year), simulated from that balance should bottom out at $0.
      const dated = new LifeEvent({
        name: '', date: `${retireAtEndOf + 1}-01-01`, balanceChange: '-20000', monthlyExpensesChange: '-800',
      });
      const multiplier = 1.03 ** (retireAtEndOf + 1 - startYear);
      const retire = (balance: number) => {
        const sim = new MonteCarloSimulation(
          balance * multiplier, -4000 * multiplier, [], [dated], assetClasses,
          steadyInflation, 2070, retireAtEndOf + 1
        );
        sim.cumulativeInflationMultiplier = multiplier;
        return sim.runDeterministic();
      };
      const lowest = Math.min(...retire(needed).map(({ inflationAdjustedBalance }) => inflationAdjustedBalance));

      expect(lowest).toBeGreaterThanOrEqual(-1e-6);
      expect(lowest).toBeLessThan(1);
    }
  });
});

describe('computeReadyLine', () => {
  const startYear = 2030;
  const base = {
    startingBalance: 1000000,
    monthlyExpenses: -4000,
    lifeEvents: [],
    assetClasses: assets(5, 10),
    inflation: inflation(3, 1),
    startYear,
    endYear: 2080,
    markets: drawMarkets(assets(5, 10), inflation(3, 1), 2, 51),
    averageMarkets: averageMarkets(assets(5, 10), inflation(3, 1), 51),
    sequences: 2,
  };

  test('is undefined when the plan has already retired by the first simulated year', () => {
    // E.g. re-running a saved plan after retiring.
    const jobs = [job('95000')];
    expect(computeReadyLine({ ...base, jobs, plannedRetirement: new Date('2028-07-01') })).toBeUndefined();
    // Retiring on the first day of the first simulated year counts too.
    expect(computeReadyLine({ ...base, jobs, plannedRetirement: new Date('2030-01-01') })).toBeUndefined();
    // Retiring during the first simulated year still gets a ready line.
    expect(computeReadyLine({ ...base, jobs, plannedRetirement: new Date('2030-07-01') })).toBeDefined();
    // Without a date, work income that has already ended means retired.
    expect(computeReadyLine({ ...base, jobs: [job('95000', { endDate: '2028-07-01' })] })).toBeUndefined();
  });

  test('is undefined when there is no year left to retire in', () => {
    const inputs = { ...base, jobs: [job('95000')] };

    expect(computeReadyLine({ ...inputs, endYear: 2030 })).toBeUndefined();
    expect(computeReadyLine({ ...inputs, endYear: 2029 })).toBeUndefined();

    // One year of room: the only choice is retiring at the end of 2030.
    const oneYear = computeReadyLine({ ...inputs, endYear: 2031 })!;
    expect(oneYear.requiredBalances).toHaveLength(1);
    expect(readyLineAt(oneYear, 0.9)).toHaveLength(1);
  });

  test('is undefined when there is no work income', () => {
    expect(computeReadyLine({ ...base, jobs: [job('30000', { atRetirement: 'unaffected' })] })).toBeUndefined();
  });

  test('keeps when work income runs out on its own, for forced retirement', () => {
    const data = computeReadyLine({ ...base, jobs: [job('95000', { endDate: '2045-07-01' })] })!;
    expect(data.workEnd).toEqual(new Date('2045-07-01'));
    expect(data.plannedRetirement).toBeUndefined();
  });
});

describe('retiring when ready', () => {
  const startYear = 2027;
  const endYear = 2100;
  const years = endYear - startYear + 1;
  const assetClasses = assets(9.9, 19.7028);
  const marketInflation = inflation(2.9, 1.1343);
  const data = computeReadyLine({
    startingBalance: 100000,
    monthlyExpenses: -4000,
    jobs: [job('95000'), job('24000', { startDate: '2055-01-01', atRetirement: 'unaffected' })],
    lifeEvents: [],
    assetClasses,
    inflation: marketInflation,
    startYear,
    endYear,
    markets: drawMarkets(assetClasses, marketInflation, 2000, years),
    averageMarkets: averageMarkets(assetClasses, marketInflation, years),
    sequences: 2000,
  })!;

  test('succeeds at least about as often as the confidence', () => {
    // Each future retires with at least the confidence's odds, and often a
    // good year carries it well past the line, so the overall rate lands at
    // or above the confidence.
    for (const confidence of [0.6, 0.9]) {
      const summary = summarizeReadyYears(readyOutcomes(data, readyLineAt(data, confidence)));
      expect(summary.successRate).toBeGreaterThan(confidence - 0.04);
      expect(summary.neverReady).toBe(0);
    }
  });

  test('a higher confidence means later ready years', () => {
    const at = (confidence: number) => summarizeReadyYears(readyOutcomes(data, readyLineAt(data, confidence)));
    expect(at(0.95).median!).toBeGreaterThan(at(0.6).median!);
  });

  test('the chart futures are the same futures', () => {
    const line = readyLineAt(data, 0.9);
    const { results, deterministicResult } = readyFutures(data, line);
    const outcomes = readyOutcomes(data, line);

    expect(results).toHaveLength(2000);
    expect(deterministicResult).toHaveLength(years);
    results.forEach((result, index) => {
      expect(result.every(({ balance }) => balance >= 0)).toBe(outcomes[index].succeeded);
    });
  });
});

describe('summarizeReadyYears', () => {
  const outcome = (readyYear?: number, forced = false, succeeded = true) => ({ readyYear, forced, succeeded });

  test('summarizes the spread of ready years', () => {
    const years = [2035, 2037, 2039, 2041, 2043, 2045, 2047, 2049, undefined];
    const summary = summarizeReadyYears(years.map((year) => outcome(year)));

    expect(summary.p25).toBe(2039);
    expect(summary.median).toBe(2043);
    expect(summary.p75).toBe(2047);
    expect(summary.p90).toBe(2049);
    expect(summary.neverReady).toBeCloseTo(1 / 9, 10);
  });

  test('a percentile that lands on never-ready futures is undefined', () => {
    const summary = summarizeReadyYears([outcome(2040), outcome(), outcome()]);

    expect(summary.p25).toBe(2040);
    expect(summary.median).toBeUndefined();
  });

  test('counts futures forced out and futures that succeed', () => {
    const summary = summarizeReadyYears([
      outcome(2040), outcome(undefined, true), outcome(undefined, true, false), outcome(2042, false, false),
    ]);

    expect(summary.forcedOut).toBe(0.5);
    expect(summary.neverReady).toBe(0.5);
    expect(summary.successRate).toBe(0.5);
  });
});

describe('summarizeReadyYears success rates by group', () => {
  test('splits the success rate between futures that reach the line and those forced out', () => {
    const summary = summarizeReadyYears([
      { readyYear: 2040, forced: false, succeeded: true, ranOutWhileWorking: false },
      { readyYear: 2041, forced: false, succeeded: false, ranOutWhileWorking: false },
      { forced: true, succeeded: true, ranOutWhileWorking: false },
      { forced: true, succeeded: false, ranOutWhileWorking: false },
      { forced: true, succeeded: false, ranOutWhileWorking: false },
      { forced: false, succeeded: false, ranOutWhileWorking: true },
    ]);

    expect(summary.readySuccessRate).toBe(0.5);
    expect(summary.forcedSuccessRate).toBeCloseTo(1 / 3, 10);
    expect(summary.ranOutWhileWorking).toBeCloseTo(1 / 6, 10);
    expect(summary.successRate).toBeCloseTo(2 / 6, 10);
  });

  test('a group with no futures has no rate', () => {
    expect(summarizeReadyYears([{ readyYear: 2040, succeeded: true }]).forcedSuccessRate).toBeUndefined();
  });
});
