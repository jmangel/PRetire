import { AssetClass, Inflation, Job, LifeEvent, fractionOfYearActive, workIncomeEndDate } from './PlanInputs';
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

const startYear = 2030;
const endYear = 2060;
const years = endYear - startYear + 1;

describe('simulateFutures', () => {
  test('random futures draw from the given markets, and average ones use the averages', () => {
    const calendar = buildCalendar({
      startingBalance: 100000, monthlyExpenses: 0, jobs: [], lifeEvents: [], startYear, endYear,
    });
    const steady = simulateFutures(
      averageMarkets(assets(8, 15), inflation(3, 1.5), years), calendar, { kind: 'date' }, { record: true }
    ).results![0];
    // 70% at 8% and 30% at 4%: 6.8% a year.
    expect(steady[0].balance).toBeCloseTo(106800, 6);
    expect(steady[0].inflation).toBeCloseTo(0.03, 10);

    const random = drawMarkets(assets(8, 15), inflation(3, 1.5), 500, years);
    const meanReturn = random.returns.reduce((acc, value) => acc + value, 0) / random.returns.length;
    expect(meanReturn).toBeCloseTo(0.068, 2);
  });

  test('income adjusted for inflation grows with it, fixed income does not', () => {
    const calendar = buildCalendar({
      startingBalance: 0,
      monthlyExpenses: 0,
      jobs: [
        job('10000'),
        job('1000', { adjustForInflation: false, atRetirement: 'unaffected' }),
      ],
      lifeEvents: [lifeEvent({ date: '2031-06-01', balanceChange: '-100' })],
      startYear,
      endYear,
    });
    const result = simulateFutures(
      averageMarkets(assets(0, 0), inflation(10, 0), years), calendar, { kind: 'date' }, { record: true }
    ).results![0];

    expect(result[0].balance).toBeCloseTo(11000, 6);
    // Year two: adjusted income has had a year of inflation, the life event
    // is in today's dollars so it's inflated twice by the end of the year.
    expect(result[1].balance).toBeCloseTo(11000 + 11000 + 1000 - 100 * 1.21, 6);
    expect(result[1].inflationAdjustedBalance).toBeCloseTo(result[1].balance / 1.21, 6);
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

    test('retiring when ready keeps a dated job to its end date and an open-ended one until ready', () => {
      const jobs = [job('20000', { endDate: '2032-01-01' }), job('30000')];
      const calendar = buildCalendar({
        startingBalance: 0, monthlyExpenses: 0, jobs, lifeEvents: [], startYear, endYear,
      });
      // One job has no end date, so there's no forced retirement.
      const workEnd = workIncomeEndDate(jobs);
      expect(workEnd).toBeUndefined();
      const line = Array(years - 1).fill(250000);
      const { outcomes, results } = simulateFutures(flat, calendar, { kind: 'ready', line, workEnd }, { record: true });
      const byYear = balances(results![0]);

      // Both jobs through 2031, then only the open-ended one until ready.
      expect(byYear[2031]).toBeCloseTo(2 * 50000, 6);
      expect(byYear[2032]).toBeCloseTo(byYear[2031] + 30000, 6);
      expect(outcomes[0].readyYear).toBe(2036); // 100k + 5 x $30k = $250k
      expect(outcomes[0].forced).toBe(false);
      expect(byYear[2037]).toBeCloseTo(byYear[2036], 6);
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

    test('running out before work income ends counts as running out, not as being forced out', () => {
      const calendar = buildCalendar({
        startingBalance: 10000,
        monthlyExpenses: -2000,
        jobs: [job('12000', { endDate: '2040-01-01' })],
        lifeEvents: [lifeEvent({ atRetirement: true, balanceChange: '-1000' })],
        startYear,
        endYear,
      });
      const line = Array(years - 1).fill(1e12);
      const { outcomes, results } = simulateFutures(
        flat, calendar, { kind: 'ready', line, workEnd: new Date('2040-01-01') }, { record: true }
      );
      const byYear = balances(results![0]);

      expect(outcomes[0]).toEqual({ readyYear: undefined, forced: false, succeeded: false, ranOutWhileWorking: true });
      // It still stops working in 2040, so the at-retirement event happens.
      expect(byYear[2040]).toBeCloseTo(byYear[2039] - 24000 - 1000, 6);
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
