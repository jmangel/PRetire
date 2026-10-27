/*
 * The plan's inputs (income, life events, asset classes, inflation) and the
 * year-by-year helpers the simulation builds on. The simulation itself is in
 * Futures.tsx.
 */

export class Inflation {
  averageAnnualReturn: number;
  standardDeviation: number;

  constructor({
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
  }: {
    averageAnnualReturnPercentage: number;
    standardDeviationPercentage: number;
  }) {
    this.averageAnnualReturn = convertPercentageToDecimal(
      averageAnnualReturnPercentage
    );
    this.standardDeviation = convertPercentageToDecimal(
      standardDeviationPercentage
    );
  }
}

export class AssetClass extends Inflation {
  allocation: number;
  name: string;

  constructor({
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
    allocationPercentage,
    name,
  }: {
    averageAnnualReturnPercentage: number;
    standardDeviationPercentage: number;
    allocationPercentage: number;
    name: string;
  }) {
    super({ averageAnnualReturnPercentage, standardDeviationPercentage });

    this.allocation = convertPercentageToDecimal(allocationPercentage);
    this.name = name;
  }
}

/**
 * What kind of income this is.
 * - 'stops': work income (salary, wages). It ends when you retire, or on its
 *   own end date if that comes first (like a job change).
 * - 'unaffected': other income on its own schedule (Social Security at a
 *   chosen claiming age, a pension starting at 65, rental income).
 */
export type AtRetirement = 'stops' | 'unaffected';

export const parseAtRetirement = (value?: string): AtRetirement =>
  value === 'unaffected' ? 'unaffected' : 'stops';

export class Job {
  name: string;
  postTaxAnnualIncome: number;
  adjustForInflation: boolean;
  startDate?: Date;
  endDate?: Date;
  atRetirement: AtRetirement;

  constructor({
    name,
    postTaxAnnualIncome,
    adjustForInflation,
    startDate,
    endDate,
    atRetirement,
  }: {
    name: string;
    // A number when parsed from the form (see parseJobs), a string elsewhere.
    postTaxAnnualIncome: string | number;
    adjustForInflation: string;
    startDate: string;
    endDate: string;
    atRetirement?: string;
  }) {
    this.name = name;
    this.postTaxAnnualIncome = parseFloat(String(postTaxAnnualIncome));
    this.adjustForInflation = adjustForInflation === 'on';
    this.startDate = startDate.length > 0 ? new Date(startDate) : undefined;
    this.endDate = endDate.length > 0 ? new Date(endDate) : undefined;
    this.atRetirement = parseAtRetirement(atRetirement);
  }
}

/** Income sources that end when you retire, ignoring blank or $0 rows. */
export const incomeThatStopsAtRetirement = (jobs: Job[]) =>
  jobs.filter(
    (job) => job.atRetirement === 'stops' && (job.postTaxAnnualIncome || 0) !== 0
  );

/**
 * When work income runs out on its own end dates: the last end date among
 * income that stops at retirement. Earlier end dates (like a job change)
 * don't count, because another job is still paying after them. A future
 * that isn't ready by then retires anyway, as with mandatory retirement.
 *
 * Settings files saved before retirement was its own setting also used this
 * as the retirement date.
 *
 * Returns undefined when work income doesn't run out on its own: either
 * there is none (already retired), or some of it has no end date.
 */
export const workIncomeEndDate = (jobs: Job[]): Date | undefined => {
  const stopping = incomeThatStopsAtRetirement(jobs);
  if (stopping.length === 0) return undefined;
  if (stopping.some((job) => !job.endDate)) return undefined;

  return new Date(Math.max(...stopping.map((job) => job.endDate!.getTime())));
};

export class LifeEvent {
  name: string;
  balanceChange: number;
  monthlyExpensesChange: number;
  date?: Date;
  /**
   * Happens on the retirement date instead of its own date, which in "retire
   * when ready" plans differs from one simulated future to the next. The
   * year-by-year helpers below skip these; the futures simulation applies
   * them (see Futures.tsx).
   */
  atRetirement: boolean;

  constructor({
    name,
    balanceChange,
    monthlyExpensesChange,
    date,
    atRetirement = false,
  }: {
    name: string;
    balanceChange: string;
    monthlyExpensesChange: string;
    date: string;
    atRetirement?: boolean;
  }) {
    this.name = name;
    this.balanceChange = parseFloat(balanceChange);
    this.monthlyExpensesChange = parseFloat(monthlyExpensesChange);
    this.date = date.length > 0 ? new Date(date) : undefined;
    this.atRetirement = atRetirement;
  }
}

const convertPercentageToDecimal = (percent: number) => percent / 100;

/**
 * Fraction (0 to 1) of the given calendar year during which a date range is
 * active. The start date is inclusive and the end date is exclusive, so a job
 * ending on 2030-03-02 and another starting on 2030-03-02 split 2030 between
 * them instead of both paying a full year. Missing dates are open-ended.
 *
 * Dates from <input type="date"> are parsed as UTC midnight, so the year
 * boundaries are computed in UTC as well.
 */
export const fractionOfYearActive = (
  year: number,
  startDate?: Date,
  endDate?: Date
) => {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);

  const activeStart = Math.max(startDate ? startDate.getTime() : -Infinity, yearStart);
  const activeEnd = Math.min(endDate ? endDate.getTime() : Infinity, yearEnd);

  return Math.max(0, activeEnd - activeStart) / (yearEnd - yearStart);
};

const boxMuller = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const sampleRandomNormal = (mean: number, standardDeviation: number) => {
  return mean + standardDeviation * boxMuller();
};

export type MonteCarloResult = Array<{
  year: number;
  balance: number;
  inflationAdjustedBalance: number;
  inflation: number;
  monthlyExpenses: number;
  inflationAdjustedMonthlyExpenses: number;
}>;

const happensIn = (lifeEvent: LifeEvent, year: number) =>
  !lifeEvent.atRetirement && !!lifeEvent.date && lifeEvent.date.getUTCFullYear() === year;

/**
 * Income from these jobs in the given calendar year, prorated for jobs that
 * start or end partway through it. Income adjusted for inflation is
 * multiplied by the inflation built up before that year.
 */
export const jobsIncome = (jobs: Job[], year: number, inflationMultiplier = 1) =>
  jobs.reduce((acc, job) => {
    const fraction = fractionOfYearActive(year, job.startDate, job.endDate);
    // NaN (from an unparseable date) would otherwise poison every later year.
    if (!Number.isFinite(fraction) || fraction <= 0) return acc;

    let income = job.postTaxAnnualIncome * fraction;
    if (job.adjustForInflation) income *= inflationMultiplier;

    return acc + income;
  }, 0);

/**
 * The change to monthly expenses (in today's dollars) from life events dated
 * in this year. At-retirement events are applied by the futures simulation.
 */
export const lifeEventsMonthlyExpensesChange = (lifeEvents: LifeEvent[], year: number) =>
  lifeEvents.reduce((acc, lifeEvent) => (happensIn(lifeEvent, year) ? acc + lifeEvent.monthlyExpensesChange : acc), 0);

/** The change to the balance (in today's dollars) from life events dated in this year. */
export const lifeEventsBalanceChange = (lifeEvents: LifeEvent[], year: number) =>
  lifeEvents.reduce((acc, lifeEvent) => (happensIn(lifeEvent, year) ? acc + lifeEvent.balanceChange : acc), 0);

/**
 * One year's return on the whole portfolio: each asset class's return,
 * weighted by its allocation. Random unless deterministic, in which case
 * each class returns its average.
 */
export const weightedReturnRate = (assetClasses: AssetClass[], deterministic: boolean) =>
  assetClasses.reduce(
    (acc, assetClass) =>
      acc +
      assetClass.allocation *
        (deterministic
          ? assetClass.averageAnnualReturn
          : sampleRandomNormal(assetClass.averageAnnualReturn, assetClass.standardDeviation)),
    0
  );
