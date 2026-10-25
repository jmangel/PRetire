import MonteCarloSimulation, {
  AssetClass,
  Inflation,
  Job,
  LifeEvent,
  MonteCarloResult,
  incomeThatStopsAtRetirement,
  sampleRandomNormal,
  workIncomeEndDate,
} from './MonteCarloSimulation';
import {
  Calendar,
  Markets,
  buildCalendar,
  simulateFutures,
} from './Futures';

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
 * Life events that happen at retirement break that last shortcut, since their
 * year depends on the retirement year. Plans with them run the backward walk
 * once per retirement year instead, which is still well under a second.
 *
 * Assumptions and limits:
 * - After retirement, only other income (not work income) is received.
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
  /** The simulated futures' markets, replayed for each confidence. */
  markets: Markets;
  averageMarkets: Markets;
  /** The plan's cash flows with no fixed retirement date. */
  calendar: Calendar;
  /** When work income runs out on its own end dates, if it does. */
  workEnd?: Date;
  /** The fixed retirement date, for plans that retire on one. */
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
  markets: Markets;
  averageMarkets: Markets;
  /** The fixed retirement date, for plans that retire on one. */
  plannedRetirement?: Date;
  /** Number of random sequences used to find the required balances. */
  sequences?: number;
};

const startOfYear = (year: number) => Date.UTC(year, 0, 1);

/**
 * Whether the plan has already retired as far as the simulation is concerned:
 * the retirement date (or, without one, the date work income runs out) is on
 * or before the first simulated day. This happens when someone re-runs a
 * saved plan after retiring, or when retirement is later this year (the
 * simulation starts next year).
 */
export const retiresBeforeStart = (
  jobs: Job[],
  startYear: number,
  plannedRetirement?: Date
) => {
  const retirement = plannedRetirement ?? workIncomeEndDate(jobs);
  return !!retirement && retirement.getTime() <= startOfYear(startYear);
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
}: Omit<ReadyLineInputs, 'startingBalance' | 'markets' | 'averageMarkets' | 'plannedRetirement'>): Float64Array[] => {
  const numYears = endYear - startYear + 1;
  if (numYears < 2) return [];

  // Cash flows after retirement, per year. Apart from at-retirement life
  // events, these depend only on the calendar, which is what lets one
  // backward pass cover every retirement year.
  const calendar = buildCalendar({
    startingBalance: 0, monthlyExpenses, jobs, lifeEvents, startYear, endYear,
  });
  const helper = new MonteCarloSimulation(0, 0, [], [], assetClasses, inflation, endYear, startYear);

  const realExpenses = new Float64Array(numYears);
  let monthly = monthlyExpenses;
  for (let t = 0; t < numYears; t++) {
    // Matches the simulation: a year's expenses are charged before that
    // year's life events change them.
    realExpenses[t] = monthly * 12;
    monthly += calendar.monthlyExpensesChange[t];
  }
  const realIncome = calendar.realOtherIncome;
  const nominalIncome = calendar.nominalOtherIncome;
  const realBalanceChange = calendar.balanceChange;
  const atRetirementExpenses = calendar.atRetirementMonthlyExpensesChange * 12;
  const atRetirementBalanceChange = calendar.atRetirementBalanceChange;
  const hasAtRetirementEvents = atRetirementExpenses !== 0 || atRetirementBalanceChange !== 0;

  const required = Array.from({ length: numYears - 1 }, () => new Float64Array(sequences));
  const returns = new Float64Array(numYears);
  const inflationRates = new Float64Array(numYears);
  const multiplierBefore = new Float64Array(numYears);

  // need = minimum balance at the start of year t to stay >= 0 at the end
  // of every year from t through endYear. In today's dollars, a year does:
  //   end = (start * (1 + r) + expenses + income) / (1 + i) + balanceChange
  // Retiring at the end of year k (retiredAfter), at-retirement life events
  // happen in year k + 1, like a life event dated on the retirement date:
  // its balance change that year, its expense change from the year after.
  // With retiredAfter undefined, one pass fills every retirement year.
  const backwardPass = (s: number, retiredAfter?: number) => {
    let need = 0;
    for (let t = numYears - 1; t >= 1; t--) {
      const target = Math.max(0, need);
      const income = realIncome[t] + nominalIncome[t] / multiplierBefore[t];
      const expenses =
        realExpenses[t] +
        (retiredAfter !== undefined && t >= retiredAfter + 2 ? atRetirementExpenses : 0);
      const balanceChange =
        realBalanceChange[t] +
        (retiredAfter !== undefined && t === retiredAfter + 1 ? atRetirementBalanceChange : 0);
      const beforeGrowth =
        (target - balanceChange) * (1 + inflationRates[t]) - expenses - income;
      const growth = 1 + returns[t];

      if (growth > 0) need = beforeGrowth / growth;
      else need = beforeGrowth <= 0 ? 0 : Infinity;

      // Start of year t is the end of year t - 1: retiring then needs this.
      if (retiredAfter === undefined) {
        required[t - 1][s] = Math.max(0, need);
      } else if (t - 1 === retiredAfter) {
        required[t - 1][s] = Math.max(0, need);
        return;
      }
    }
  };

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

    if (hasAtRetirementEvents) {
      for (let k = 0; k < numYears - 1; k++) backwardPass(s, k);
    } else {
      backwardPass(s);
    }
  }

  required.forEach((balances) => balances.sort());
  return required;
};

/**
 * Everything the ready line needs. Returns undefined when there's no
 * retirement year to find: already retired (no work income, or the
 * retirement date is on or before the first simulated year), or no year left
 * to retire in before the end year.
 */
export const computeReadyLine = (inputs: ReadyLineInputs): ReadyLineData | undefined => {
  const {
    startingBalance,
    monthlyExpenses,
    jobs,
    lifeEvents,
    endYear,
    startYear = new Date().getFullYear() + 1,
    markets,
    averageMarkets,
    plannedRetirement,
  } = inputs;

  if (incomeThatStopsAtRetirement(jobs).length === 0) return undefined;
  if (retiresBeforeStart(jobs, startYear, plannedRetirement)) return undefined;
  // Retiring at the end of the end year leaves nothing to simulate, so the
  // last possible retirement is the end of the year before it.
  if (endYear <= startYear) return undefined;

  return {
    startYear,
    endYear,
    requiredBalances: requiredBalancesByYear({ ...inputs, startYear }),
    markets,
    averageMarkets,
    calendar: buildCalendar({
      startingBalance, monthlyExpenses, jobs, lifeEvents, startYear, endYear,
    }),
    workEnd: workIncomeEndDate(jobs),
    plannedRetirement,
  };
};

/**
 * The ready line at a confidence level (0 to 1): for each year, the balance in
 * today's dollars at which retiring at the end of that year succeeds with at
 * least that probability. Index k is year startYear + k.
 */
export const readyLineAt = (data: Pick<ReadyLineData, 'requiredBalances'>, confidence: number): number[] =>
  data.requiredBalances.map((balances) => {
    const index = Math.min(
      balances.length - 1,
      Math.max(0, Math.ceil(confidence * balances.length) - 1)
    );
    return balances[index];
  });

const retireWhenReady = (data: ReadyLineData, line: number[]) =>
  ({ kind: 'ready', line, workEnd: data.workEnd } as const);

/**
 * How each future does if it retires once it reaches the line: the year it's
 * ready, whether work income ran out first, and whether the money lasts.
 * Cheap enough to re-run on every slider step.
 */
export const readyOutcomes = (data: ReadyLineData, line: number[]) =>
  simulateFutures(data.markets, data.calendar, retireWhenReady(data, line)).outcomes;

/** Year-by-year balances of the futures that retire when ready, for the chart. */
export const readyFutures = (
  data: ReadyLineData,
  line: number[]
): { results: MonteCarloResult[]; deterministicResult: MonteCarloResult } => ({
  results: simulateFutures(data.markets, data.calendar, retireWhenReady(data, line), { record: true }).results!,
  deterministicResult: simulateFutures(
    data.averageMarkets, data.calendar, retireWhenReady(data, line), { record: true }
  ).results![0],
});

export type ReadyYearSummary = {
  /** Undefined means that share of futures isn't ready before the end year. */
  p25?: number;
  median?: number;
  p75?: number;
  p90?: number;
  /** Share of futures (0 to 1) that are never ready. */
  neverReady: number;
  /**
   * Share of futures (0 to 1) whose work income ran out on its own end dates
   * before they were ready, so they stopped working then anyway. Part of
   * neverReady.
   */
  forcedOut: number;
  /**
   * Share of futures (0 to 1) that ran out of money while still working, so
   * never reached the line. Part of neverReady.
   */
  ranOutWhileWorking: number;
  /** Share of all futures (0 to 1) where the money lasts. */
  successRate: number;
  /** Of the futures that reached the line and retired, the share where the money lasts. */
  readySuccessRate?: number;
  /** Of the futures forced out before they were ready, the share where the money lasts. */
  forcedSuccessRate?: number;
};

type Outcome = { readyYear?: number; forced?: boolean; succeeded?: boolean; ranOutWhileWorking?: boolean };

export const summarizeReadyYears = (outcomes: Outcome[]): ReadyYearSummary => {
  const sorted = outcomes
    .map(({ readyYear }) => (readyYear === undefined ? Infinity : readyYear))
    .sort((a, b) => a - b);
  const at = (p: number) => {
    if (sorted.length === 0) return undefined;
    const value = sorted[Math.floor(p * (sorted.length - 1))];
    return Number.isFinite(value) ? value : undefined;
  };
  const share = (count: number) => (outcomes.length === 0 ? 0 : count / outcomes.length);
  const successRateOf = (group: Outcome[]) =>
    group.length === 0 ? undefined : group.filter(({ succeeded }) => succeeded).length / group.length;
  const forced = outcomes.filter((outcome) => outcome.forced);

  return {
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    neverReady: share(sorted.filter((year) => !Number.isFinite(year)).length),
    forcedOut: share(forced.length),
    ranOutWhileWorking: share(outcomes.filter((outcome) => outcome.ranOutWhileWorking).length),
    successRate: share(outcomes.filter(({ succeeded }) => succeeded).length),
    readySuccessRate: successRateOf(outcomes.filter(({ readyYear }) => readyYear !== undefined)),
    forcedSuccessRate: successRateOf(forced),
  };
};
