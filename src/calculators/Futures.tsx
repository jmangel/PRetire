import {
  AssetClass,
  Inflation,
  Job,
  LifeEvent,
  MonteCarloResult,
  jobsIncome,
  lifeEventsBalanceChange,
  lifeEventsMonthlyExpensesChange,
  sampleRandomNormal,
  weightedReturnRate,
} from './PlanInputs';

/*
 * Simulated futures that can be replayed.
 *
 * Each future's yearly investment return and inflation are drawn once and
 * kept. Simulating a future then takes no random draws, so a "retire when
 * ready" plan can re-run every future whenever the confidence changes, in a
 * few milliseconds, and fixed-date and retire-when-ready results are compared
 * on the same markets.
 *
 * Everything that depends only on the calendar (income, dated life events)
 * is worked out once per plan, in today's dollars or as fixed dollar
 * amounts, so a year of a future is a handful of additions.
 */

/** Drawn markets: entry f * years + t is future f's rate in year t. */
export type Markets = {
  futures: number;
  years: number;
  returns: Float64Array;
  inflation: Float64Array;
};

export const drawMarkets = (
  assetClasses: AssetClass[],
  inflation: Inflation,
  futures: number,
  years: number
): Markets => {
  const returns = new Float64Array(futures * years);
  const inflationRates = new Float64Array(futures * years);
  for (let i = 0; i < futures * years; i++) {
    returns[i] = weightedReturnRate(assetClasses, false);
    inflationRates[i] = sampleRandomNormal(inflation.averageAnnualReturn, inflation.standardDeviation);
  }
  return { futures, years, returns, inflation: inflationRates };
};

/** One future with average returns and inflation every year. */
export const averageMarkets = (
  assetClasses: AssetClass[],
  inflation: Inflation,
  years: number
): Markets => ({
  futures: 1,
  years,
  returns: new Float64Array(years).fill(weightedReturnRate(assetClasses, true)),
  inflation: new Float64Array(years).fill(inflation.averageAnnualReturn),
});

/**
 * A plan's cash flows by year (index t is year startYear + t). Income is split
 * into work income (stops at retirement) and other income, and each into the
 * part adjusted for inflation (in today's dollars) and the part that isn't
 * (fixed dollar amounts).
 */
export type Calendar = {
  startYear: number;
  endYear: number;
  startingBalance: number;
  monthlyExpenses: number;
  realWorkIncome: Float64Array;
  nominalWorkIncome: Float64Array;
  realOtherIncome: Float64Array;
  nominalOtherIncome: Float64Array;
  /** Dated life events, in today's dollars. */
  monthlyExpensesChange: Float64Array;
  balanceChange: Float64Array;
  /** Life events that happen at retirement, in today's dollars. */
  atRetirementMonthlyExpensesChange: number;
  atRetirementBalanceChange: number;
};

/** A copy of the job that ends by the given date at the latest. */
export const endingBy = (job: Job, date: Date): Job => {
  if (job.endDate && job.endDate.getTime() <= date.getTime()) return job;
  return Object.assign(Object.create(Job.prototype), job, { endDate: date });
};

export const buildCalendar = ({
  startingBalance,
  monthlyExpenses,
  jobs,
  lifeEvents,
  startYear,
  endYear,
  retirementDate,
}: {
  startingBalance: number;
  monthlyExpenses: number;
  jobs: Job[];
  lifeEvents: LifeEvent[];
  startYear: number;
  endYear: number;
  /** A fixed retirement date: work income ends by then. */
  retirementDate?: Date;
}): Calendar => {
  const years = Math.max(0, endYear - startYear + 1);
  const work = jobs
    .filter((job) => job.atRetirement === 'stops')
    .map((job) => (retirementDate ? endingBy(job, retirementDate) : job));
  const other = jobs.filter((job) => job.atRetirement !== 'stops');
  // Income is worked out with an inflation multiplier of 1: today's dollars
  // for income adjusted for inflation, fixed dollars for the rest.
  const byYear = (subset: Job[]) => {
    const values = new Float64Array(years);
    for (let t = 0; t < years; t++) values[t] = jobsIncome(subset, startYear + t);
    return values;
  };
  const monthlyExpensesChange = new Float64Array(years);
  const balanceChange = new Float64Array(years);
  for (let t = 0; t < years; t++) {
    monthlyExpensesChange[t] = lifeEventsMonthlyExpensesChange(lifeEvents, startYear + t);
    balanceChange[t] = lifeEventsBalanceChange(lifeEvents, startYear + t);
  }
  const atRetirement = lifeEvents.filter((event) => event.atRetirement);
  const sum = (values: number[]) =>
    values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);

  return {
    startYear,
    endYear,
    startingBalance,
    monthlyExpenses,
    realWorkIncome: byYear(work.filter((job) => job.adjustForInflation)),
    nominalWorkIncome: byYear(work.filter((job) => !job.adjustForInflation)),
    realOtherIncome: byYear(other.filter((job) => job.adjustForInflation)),
    nominalOtherIncome: byYear(other.filter((job) => !job.adjustForInflation)),
    monthlyExpensesChange,
    balanceChange,
    atRetirementMonthlyExpensesChange: sum(atRetirement.map((event) => event.monthlyExpensesChange)),
    atRetirementBalanceChange: sum(atRetirement.map((event) => event.balanceChange)),
  };
};

/**
 * When the futures retire.
 * - 'date': on a fixed date (work income already ends by it in the calendar),
 *   or never if there's no date.
 * - 'ready': at the end of the first year a future's balance, in today's
 *   dollars, reaches the ready line. line[k] is for retiring at the end of
 *   year startYear + k. A future that isn't ready when its work income runs
 *   out on its own end dates (workEnd) retires then anyway.
 */
export type Retirement =
  | { kind: 'date'; date?: Date }
  | { kind: 'ready'; line: number[]; workEnd?: Date };

export type FutureOutcome = {
  /** Ready at the end of this year. Undefined if never ready. */
  readyYear?: number;
  /** Retired because work income ran out before the future was ready. */
  forced: boolean;
  /** Never went below zero. */
  succeeded: boolean;
  /** Went below zero before retiring, so never ready. */
  ranOutWhileWorking: boolean;
};

export type SimulatedFutures = {
  outcomes: FutureOutcome[];
  /** Year-by-year balances, only when asked for (they're big). */
  results?: MonteCarloResult[];
};

const yearIndex = (calendar: Calendar, date: Date) =>
  date.getUTCFullYear() - calendar.startYear;

export const simulateFutures = (
  markets: Markets,
  calendar: Calendar,
  retirement: Retirement,
  { record = false } = {}
): SimulatedFutures => {
  const years = Math.min(markets.years, calendar.endYear - calendar.startYear + 1);
  const outcomes: FutureOutcome[] = [];
  const results: MonteCarloResult[] | undefined = record ? [] : undefined;
  const {
    realWorkIncome, nominalWorkIncome, realOtherIncome, nominalOtherIncome,
    monthlyExpensesChange, balanceChange,
    atRetirementMonthlyExpensesChange, atRetirementBalanceChange,
  } = calendar;

  const ready = retirement.kind === 'ready' ? retirement : undefined;
  const forcedIndex = ready?.workEnd ? yearIndex(calendar, ready.workEnd) : undefined;
  const fixedIndex =
    retirement.kind === 'date' && retirement.date ? yearIndex(calendar, retirement.date) : undefined;

  for (let f = 0; f < markets.futures; f++) {
    const offset = f * markets.years;
    let balance = calendar.startingBalance;
    let monthly = calendar.monthlyExpenses;
    let multiplier = 1;
    let succeeded = true;
    // The year at-retirement life events happen in, once it's known.
    let retirementIndex = fixedIndex;
    let stillWorking = true;
    let ranOutWhileWorking = false;
    let readyYear: number | undefined;
    let forced = false;
    const yearResults: MonteCarloResult | undefined = record ? [] : undefined;

    for (let t = 0; t < years; t++) {
      // Not ready by the time work income runs out: retire anyway.
      if (ready && retirementIndex === undefined && forcedIndex !== undefined && t >= forcedIndex) {
        retirementIndex = forcedIndex;
        forced = true;
      }

      balance += balance * markets.returns[offset + t];
      balance += monthly * 12;
      balance += realOtherIncome[t] * multiplier + nominalOtherIncome[t];
      if (stillWorking) balance += realWorkIncome[t] * multiplier + nominalWorkIncome[t];

      const inflationRate = markets.inflation[offset + t];
      multiplier *= 1 + inflationRate;
      monthly *= 1 + inflationRate;

      const retiresThisYear = t === retirementIndex;
      monthly += (monthlyExpensesChange[t] + (retiresThisYear ? atRetirementMonthlyExpensesChange : 0)) * multiplier;
      balance += (balanceChange[t] + (retiresThisYear ? atRetirementBalanceChange : 0)) * multiplier;

      if (balance < 0) succeeded = false;
      yearResults?.push({
        year: calendar.startYear + t,
        balance,
        inflationAdjustedBalance: balance / multiplier,
        inflation: inflationRate,
        monthlyExpenses: monthly,
        inflationAdjustedMonthlyExpenses: monthly / multiplier,
      });

      // Check at the end of the year whether this future is ready.
      if (ready && retirementIndex === undefined && !ranOutWhileWorking) {
        if (balance < 0) {
          ranOutWhileWorking = true;
        } else if (t < ready.line.length && balance / multiplier >= ready.line[t]) {
          readyYear = calendar.startYear + t;
          retirementIndex = t + 1;
          stillWorking = false;
        }
      }
    }

    outcomes.push({ readyYear, forced, succeeded, ranOutWhileWorking });
    if (results && yearResults) results.push(yearResults);
  }

  return { outcomes, results };
};
