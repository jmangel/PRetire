import { AssetClass, Inflation, Job, LifeEvent, MonteCarloResult } from './PlanInputs';
import { averageMarkets, buildCalendar, drawMarkets, simulateFutures } from './Futures';

/**
 * For tests: one simulated future with no retirement, run the way the app
 * runs every future. With average set, it gets average returns and
 * inflation every year instead of random ones.
 */
export const simulateOne = (
  startingBalance: number,
  monthlyExpenses: number,
  jobs: Job[],
  lifeEvents: LifeEvent[],
  assetClasses: AssetClass[],
  inflation: Inflation,
  endYear: number,
  startYear: number = new Date().getFullYear() + 1,
  { average = false } = {}
): MonteCarloResult => {
  const years = Math.max(0, endYear - startYear + 1);
  const markets = average
    ? averageMarkets(assetClasses, inflation, years)
    : drawMarkets(assetClasses, inflation, 1, years);
  const calendar = buildCalendar({ startingBalance, monthlyExpenses, jobs, lifeEvents, startYear, endYear });
  return simulateFutures(markets, calendar, { kind: 'date' }, { record: true }).results![0];
};
