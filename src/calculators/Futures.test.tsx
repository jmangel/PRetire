import MonteCarloSimulation, { AssetClass, Inflation, Job, LifeEvent, fractionOfYearActive } from './MonteCarloSimulation';
import { averageMarkets, buildCalendar, drawMarkets, endingBy, simulateFutures } from './Futures';

const assets = (averageAnnualReturnPercentage: number, standardDeviationPercentage: number) => [
  new AssetClass({
    name: 'Stocks',
    allocationPercentage: 70,
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
  }),
  new AssetClass({
    name: 'Bonds',
    allocationPercentage: 30,
    averageAnnualReturnPercentage: averageAnnualReturnPercentage / 2,
    standardDeviationPercentage: standardDeviationPercentage / 2,
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
const lifeEvent = (
  { date = '', balanceChange = '0', monthlyExpensesChange = '0', atRetirement = false }:
  { date?: string; balanceChange?: string; monthlyExpensesChange?: string; atRetirement?: boolean }
) => new LifeEvent({ name: '', date, balanceChange, monthlyExpensesChange, atRetirement });

// A small seeded generator, so the class and drawMarkets see the same draws.
const seedRandom = (seed: number) => {
  let state = seed;
  jest.spyOn(Math, 'random').mockImplementation(() => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state + 0.5) / 4294967296;
  });
};

afterEach(() => jest.restoreAllMocks());

const startYear = 2030;
const endYear = 2060;
const years = endYear - startYear + 1;

describe('simulateFutures', () => {
  test('matches MonteCarloSimulation.run year by year for the same draws', () => {
    const jobs = [
      job('80000', { endDate: '2036-07-01' }),
      job('20000', { startDate: '2034-03-01', endDate: '2050-01-01', adjustForInflation: false }),
      job('24000', { startDate: '2045-01-01', atRetirement: 'unaffected' }),
      job('12000', { startDate: '2040-01-01', atRetirement: 'unaffected', adjustForInflation: false }),
    ];
    const lifeEvents = [
      lifeEvent({ date: '2038-06-01', balanceChange: '-50000' }),
      lifeEvent({ date: '2041-06-01', monthlyExpensesChange: '1000' }),
    ];
    const assetClasses = assets(8, 15);
    const marketInflation = inflation(3, 1.5);

    seedRandom(42);
    const expected = new MonteCarloSimulation(
      250000, -4000, jobs, lifeEvents, assetClasses, marketInflation, endYear, startYear
    ).run();

    seedRandom(42);
    const markets = drawMarkets(assetClasses, marketInflation, 1, years);
    const calendar = buildCalendar({
      startingBalance: 250000, monthlyExpenses: -4000, jobs, lifeEvents, startYear, endYear,
    });
    const actual = simulateFutures(markets, calendar, { kind: 'date' }, { record: true }).results![0];

    expect(actual).toHaveLength(expected.length);
    actual.forEach((year, index) => {
      expect(year.year).toBe(expected[index].year);
      expect(year.inflation).toBe(expected[index].inflation);
      expect(year.balance).toBeCloseTo(expected[index].balance, 4);
      expect(year.monthlyExpenses).toBeCloseTo(expected[index].monthlyExpenses, 6);
    });
  });

  test('average markets match runDeterministic', () => {
    const jobs = [job('70000', { endDate: '2040-01-01' })];
    const expected = new MonteCarloSimulation(
      100000, -3000, jobs, [], assets(7, 15), inflation(2.5, 1), endYear, startYear
    ).runDeterministic();
    const calendar = buildCalendar({
      startingBalance: 100000, monthlyExpenses: -3000, jobs, lifeEvents: [], startYear, endYear,
    });
    const actual = simulateFutures(
      averageMarkets(assets(7, 15), inflation(2.5, 1), years), calendar, { kind: 'date' }, { record: true }
    ).results![0];

    actual.forEach((year, index) => expect(year.balance).toBeCloseTo(expected[index].balance, 4));
  });

  describe('with no returns or inflation', () => {
    const flat = averageMarkets(assets(0, 0), inflation(0, 0), years);
    const balances = (result: { year: number; balance: number }[]) =>
      Object.fromEntries(result.map(({ year, balance }) => [year, balance]));

    test('a fixed retirement date stops work income then, but not other income', () => {
      const calendar = buildCalendar({
        startingBalance: 0,
        monthlyExpenses: 0,
        jobs: [job('100000'), job('10000', { atRetirement: 'unaffected' })],
        lifeEvents: [lifeEvent({ atRetirement: true, balanceChange: '-5000' })],
        startYear,
        endYear,
        retirementDate: new Date('2035-07-02'),
      });
      const result = simulateFutures(flat, calendar, { kind: 'date', date: new Date('2035-07-02') }, { record: true })
        .results![0];
      const byYear = balances(result);

      expect(byYear[2034]).toBeCloseTo(5 * 110000, 6);
      // Part of a year of work, a full year of other income, and the
      // at-retirement event in the retirement year.
      const worked = fractionOfYearActive(2035, undefined, new Date('2035-07-02'));
      expect(byYear[2035]).toBeCloseTo(byYear[2034] + 100000 * worked + 10000 - 5000, 6);
      expect(byYear[2036]).toBeCloseTo(byYear[2035] + 10000, 6);
    });

    test('retiring when ready stops work income after the year the line is reached', () => {
      const calendar = buildCalendar({
        startingBalance: 0,
        monthlyExpenses: -1000,
        jobs: [job('62000'), job('6000', { atRetirement: 'unaffected' })],
        lifeEvents: [lifeEvent({ atRetirement: true, balanceChange: '-1000', monthlyExpensesChange: '-500' })],
        startYear,
        endYear,
      });
      // Saves $56k a year while working; ready once at $250k.
      const line = Array(years - 1).fill(250000);
      const { outcomes, results } = simulateFutures(flat, calendar, { kind: 'ready', line }, { record: true });
      const byYear = balances(results![0]);

      expect(outcomes[0].readyYear).toBe(2034); // 5 x $56k = $280k
      expect(outcomes[0].forced).toBe(false);
      // Retired: only other income from 2035, and the at-retirement event
      // happens in 2035 like one dated on the retirement date (January 1,
      // 2035): its balance change that year, its expense change from 2036.
      expect(byYear[2035]).toBeCloseTo(280000 - 12000 + 6000 - 1000, 6);
      expect(byYear[2036]).toBeCloseTo(byYear[2035] - 18000 + 6000, 6);
    });

    test("a future that isn't ready when work income ends retires then anyway", () => {
      const calendar = buildCalendar({
        startingBalance: 0,
        monthlyExpenses: -1000,
        jobs: [job('62000', { endDate: '2040-01-01' })],
        lifeEvents: [lifeEvent({ atRetirement: true, balanceChange: '-1000' })],
        startYear,
        endYear,
      });
      const line = Array(years - 1).fill(1e12); // never reached
      const { outcomes, results } = simulateFutures(
        flat, calendar, { kind: 'ready', line, workEnd: new Date('2040-01-01') }, { record: true }
      );
      const byYear = balances(results![0]);

      expect(outcomes[0]).toEqual({ readyYear: undefined, forced: true, succeeded: true, ranOutWhileWorking: false });
      expect(byYear[2040]).toBeCloseTo(byYear[2039] - 12000 - 1000, 6);
    });

    test('running out while still working means never ready, and not succeeding', () => {
      const calendar = buildCalendar({
        startingBalance: 10000,
        monthlyExpenses: -2000,
        jobs: [job('12000')],
        lifeEvents: [],
        startYear,
        endYear,
      });
      // The line is low late on, but the future has already run out.
      const line = Array(years - 1).fill(0).map((_, k) => (k < 5 ? 1e9 : -1));
      const { outcomes } = simulateFutures(flat, calendar, { kind: 'ready', line });

      expect(outcomes[0]).toEqual({ readyYear: undefined, forced: false, succeeded: false, ranOutWhileWorking: true });
    });
  });
});

describe('endingBy', () => {
  test('caps a later or missing end date, and keeps an earlier one', () => {
    const date = new Date('2040-01-01');
    expect(endingBy(job('1'), date).endDate).toEqual(date);
    expect(endingBy(job('1', { endDate: '2045-01-01' }), date).endDate).toEqual(date);
    expect(endingBy(job('1', { endDate: '2035-01-01' }), date).endDate).toEqual(new Date('2035-01-01'));
    expect(endingBy(job('1'), date)).toBeInstanceOf(Job);
  });
});
