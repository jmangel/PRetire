import MonteCarloSimulation, {
  AssetClass,
  Inflation,
  Job,
  LifeEvent,
  MonteCarloResult,
  incomeThatStopsAtRetirement,
  plannedRetirementDate,
  sampleRandomNormal,
} from './MonteCarloSimulation';

/*
 * The ready line answers: "If I retired at the end of year Y with this much
 * money (in today's dollars), what are the odds I never run out?" For each
 * year it gives the balance needed to hit a target confidence, like 90%.
 *
 * A one-time Monte Carlo run fixes the retirement date in advance. In real
 * life you re-check every year and retire once it's safe, which in good
 * markets happens well before the planned date. The ready line lets the app
 * show that: each simulated future is "ready" the first year its balance
 * reaches the line.
 *
 * Why this is cheap: in this model, the odds of retiring successfully from a
 * given year depend only on that year and the balance in today's dollars, not
 * on how you got there. So instead of re-simulating from every year of every
 * future, we find one required balance per year.
 *
 * And that requires no nested simulations either. For one random sequence of
 * returns and inflation, walking backward from the end year gives the minimum
 * balance needed to never go below zero, for every possible retirement year,
 * in a single pass. Do that for a few thousand sequences, sort each year's
 * required balances, and the 90% ready line is each year's 90th percentile.
 * Changing the confidence afterward is a lookup, not a re-run.
 *
 * Assumptions and limits:
 * - After retirement, only income marked "Keeps its own dates" is received.
 * - Income that isn't adjusted for inflation is converted to today's dollars
 *   using each sequence's own inflation from the start of the simulation. This
 *   is exact for inflation-adjusted income and a close approximation otherwise.
 * - Years with a return of -100% or worse (practically impossible with normal
 *   inputs) are treated as survivable only with a zero balance.
 */

export type ReadyLineData = {
  /** First simulated year. Index k in the arrays below is year startYear + k. */
  startYear: number;
  endYear: number;
  /**
   * requiredBalances[k] holds, sorted ascending, the minimum balance in
   * today's dollars needed at the end of year startYear + k to retire then and
   * never run out through endYear, one entry per random sequence. Covers
   * retirement at the end of startYear through endYear - 1.
   */
  requiredBalances: Float64Array[];
  /** Futures where work income keeps going past the planned retirement date. */
  workingResults: MonteCarloResult[];
  workingDeterministicResult: MonteCarloResult;
  plannedRetirement?: Date;
};

type ReadyLineInputs = {
  startingBalance: number;
  monthlyExpenses: number;
  jobs: Job[];
  lifeEvents: LifeEvent[];
  assetClasses: AssetClass[];
  inflation: Inflation;
  endYear: number;
  startYear?: number;
  /** Number of keep-working futures to simulate. */
  futures?: number;
  /** Number of random sequences used to find the required balances. */
  sequences?: number;
};

/**
 * Whether the planned retirement date is before the first simulated year, so
 * the user has effectively already retired as far as the simulation is
 * concerned. This happens when someone re-runs a saved plan after retiring
 * (their last job's end date is now in the past), or when retirement is later
 * this year (the simulation starts next year).
 */
export const retiresBeforeStart = (jobs: Job[], startYear: number) => {
  const planned = plannedRetirementDate(jobs);
  return !!planned && planned.getTime() <= Date.UTC(startYear, 0, 1);
};

/**
 * The income sources for futures that keep working until they're ready:
 * work income that ends on the planned retirement date keeps going instead.
 * Other end dates (like a job change) stay as entered. A plan that retires
 * before the first simulated year is left alone, so an already-ended job
 * isn't brought back.
 */
export const keepWorkingJobs = (
  jobs: Job[],
  startYear: number = new Date().getFullYear() + 1
): Job[] => {
  const planned = plannedRetirementDate(jobs);
  if (!planned || retiresBeforeStart(jobs, startYear)) return jobs;

  return jobs.map((job) => {
    const endsAtRetirement =
      job.atRetirement === 'stops' &&
      job.endDate?.getTime() === planned.getTime();
    if (!endsAtRetirement) return job;

    return Object.assign(Object.create(Job.prototype), job, { endDate: undefined });
  });
};

/**
 * Minimum balances (today's dollars) needed to retire at the end of each year.
 * See ReadyLineData.requiredBalances.
 */
export const requiredBalancesByYear = ({
  monthlyExpenses,
  jobs,
  lifeEvents,
  assetClasses,
  inflation,
  endYear,
  startYear = new Date().getFullYear() + 1,
  sequences = 5000,
}: Omit<ReadyLineInputs, 'startingBalance' | 'futures'>): Float64Array[] => {
  const numYears = endYear - startYear + 1;
  if (numYears < 2) return [];

  // Cash flows after retirement, per year. These depend only on the calendar,
  // which is what lets one backward pass cover every retirement year.
  const retiredJobs = jobs.filter((job) => job.atRetirement !== 'stops');
  const helper = new MonteCarloSimulation(
    0, 0, retiredJobs.filter((job) => job.adjustForInflation), lifeEvents,
    assetClasses, inflation, endYear, startYear
  );
  const nominalHelper = new MonteCarloSimulation(
    0, 0, retiredJobs.filter((job) => !job.adjustForInflation), [],
    assetClasses, inflation, endYear, startYear
  );

  const realExpenses = new Float64Array(numYears);
  const realIncome = new Float64Array(numYears);
  const nominalIncome = new Float64Array(numYears);
  const realBalanceChange = new Float64Array(numYears);
  let monthly = monthlyExpenses;
  for (let t = 0; t < numYears; t++) {
    const year = startYear + t;
    // Matches the simulation: a year's expenses are charged before that
    // year's life events change them.
    realExpenses[t] = monthly * 12;
    monthly += helper.lifeEventsMonthlyExpensesChange(year);
    realIncome[t] = helper.jobsIncome(year, 1);
    nominalIncome[t] = nominalHelper.jobsIncome(year, 1);
    realBalanceChange[t] = helper.lifeEventsBalanceChange(year);
  }

  const required = Array.from({ length: numYears - 1 }, () => new Float64Array(sequences));
  const returns = new Float64Array(numYears);
  const inflationRates = new Float64Array(numYears);
  const multiplierBefore = new Float64Array(numYears);

  for (let s = 0; s < sequences; s++) {
    for (let t = 0; t < numYears; t++) {
      returns[t] = helper.totalWeightedInvestmentReturnRate(false);
      inflationRates[t] = sampleRandomNormal(
        inflation.averageAnnualReturn,
        inflation.standardDeviation
      );
    }

    // Cumulative inflation before each year, for income not adjusted for it.
    let multiplier = 1;
    for (let t = 0; t < numYears; t++) {
      multiplierBefore[t] = multiplier;
      multiplier *= 1 + inflationRates[t];
    }

    // need = minimum balance at the start of year t to stay >= 0 at the end
    // of every year from t through endYear. In today's dollars, a year does:
    //   end = (start * (1 + r) + expenses + income) / (1 + i) + balanceChange
    let need = 0;
    for (let t = numYears - 1; t >= 1; t--) {
      const target = Math.max(0, need);
      const income = realIncome[t] + nominalIncome[t] / multiplierBefore[t];
      const beforeGrowth =
        (target - realBalanceChange[t]) * (1 + inflationRates[t]) -
        realExpenses[t] -
        income;
      const growth = 1 + returns[t];

      if (growth > 0) need = beforeGrowth / growth;
      else need = beforeGrowth <= 0 ? 0 : Infinity;

      // Start of year t is the end of year t - 1: retiring then needs this.
      required[t - 1][s] = Math.max(0, need);
    }
  }

  required.forEach((balances) => balances.sort());
  return required;
};

/**
 * Run everything the ready line needs. Returns undefined when there's no
 * retirement year to find: already retired (nothing stops at retirement, or
 * the planned retirement is on or before the first simulated year), or no
 * year left to retire in before the end year.
 */
export const computeReadyLine = (inputs: ReadyLineInputs): ReadyLineData | undefined => {
  const {
    startingBalance,
    monthlyExpenses,
    jobs,
    lifeEvents,
    assetClasses,
    inflation,
    endYear,
    startYear = new Date().getFullYear() + 1,
    futures = 5000,
  } = inputs;

  // Already retired, either because nothing stops at retirement or because
  // the planned retirement is before the first simulated year: there's no
  // retirement year to find.
  if (incomeThatStopsAtRetirement(jobs).length === 0) return undefined;
  if (retiresBeforeStart(jobs, startYear)) return undefined;
  // Retiring at the end of the end year leaves nothing to simulate, so the
  // last possible retirement is the end of the year before it.
  if (endYear <= startYear) return undefined;

  const workingJobs = keepWorkingJobs(jobs, startYear);
  const simulate = () =>
    new MonteCarloSimulation(
      startingBalance, monthlyExpenses, workingJobs, lifeEvents,
      assetClasses, inflation, endYear, startYear
    );

  return {
    startYear,
    endYear,
    requiredBalances: requiredBalancesByYear({ ...inputs, startYear }),
    workingResults: [...Array(futures)].map(() => simulate().run()),
    workingDeterministicResult: simulate().runDeterministic(),
    plannedRetirement: plannedRetirementDate(jobs),
  };
};

/**
 * The ready line at a confidence level (0 to 1): for each year, the balance in
 * today's dollars at which retiring at the end of that year succeeds with at
 * least that probability. Index k is year startYear + k.
 */
export const readyLineAt = (data: ReadyLineData, confidence: number): number[] =>
  data.requiredBalances.map((balances) => {
    const index = Math.min(
      balances.length - 1,
      Math.max(0, Math.ceil(confidence * balances.length) - 1)
    );
    return balances[index];
  });

/**
 * For each keep-working future, the first year its balance reaches the line,
 * meaning it would retire at the end of that year. Undefined if it never does
 * before endYear.
 */
export const readyYears = (
  data: ReadyLineData,
  line: number[]
): Array<number | undefined> =>
  data.workingResults.map((result) => {
    for (let k = 0; k < line.length && k < result.length; k++) {
      const { year, balance, inflationAdjustedBalance } = result[k];
      if (balance < 0) return undefined; // ran out while still working
      if (inflationAdjustedBalance >= line[k]) return year;
    }
    return undefined;
  });

export type ReadyYearSummary = {
  /** Undefined means that share of futures isn't ready before the end year. */
  p25?: number;
  median?: number;
  p75?: number;
  p90?: number;
  /** Share of futures (0 to 1) that are never ready before the end year. */
  neverReady: number;
};

export const summarizeReadyYears = (years: Array<number | undefined>): ReadyYearSummary => {
  const sorted = years
    .map((year) => (year === undefined ? Infinity : year))
    .sort((a, b) => a - b);
  const at = (p: number) => {
    if (sorted.length === 0) return undefined;
    const value = sorted[Math.floor(p * (sorted.length - 1))];
    return Number.isFinite(value) ? value : undefined;
  };

  return {
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    neverReady:
      sorted.length === 0
        ? 0
        : sorted.filter((year) => !Number.isFinite(year)).length / sorted.length,
  };
};
