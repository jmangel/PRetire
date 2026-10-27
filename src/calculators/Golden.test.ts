import fs from 'fs';
import path from 'path';
import { JOB_FIELD_NAMES, MonteCarloResponse, parsePlanInputs, simulatePlan } from './MonteCarlo';
import { MonteCarloSettings, migrateSettings } from './Settings';
import { readyLineAt, readyOutcomes, summarizeReadyYears } from './ReadyLine';
import { MonteCarloResult } from './PlanInputs';

/*
 * Golden tests: whole saved plans, run the way the app runs them, with the
 * results pinned. They catch any change to results, which the unit tests,
 * built around small hand-checked cases, can miss.
 *
 * Each file in golden/scenarios is a settings file as the form exports it
 * (older ones as earlier versions exported them). It's migrated, read the
 * way the form submits it, and simulated with seeded random numbers on a
 * fixed date, so results are the same on every run. golden/expected holds the
 * results.
 *
 * A change that is meant to change results regenerates them:
 *
 *   UPDATE_GOLDEN=1 CI=true npm test -- Golden
 *
 * and the diff in golden/expected is the change to review.
 */

const GOLDEN_DIR = path.join(__dirname, 'golden');
const SCENARIOS_DIR = path.join(GOLDEN_DIR, 'scenarios');
const EXPECTED_DIR = path.join(GOLDEN_DIR, 'expected');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// The simulation starts the year after today, so this fixes it at 2027.
const TODAY = new Date('2026-06-15T12:00:00Z');
const SEED = 20260615;
// The ready line at these confidences, and at the plan's own.
const CONFIDENCES = [50, 75, 99];
const SAMPLE_EVERY_YEARS = 5;
// Fewer than the app runs, to keep these quick. The results are seeded, so
// they still pin the simulation exactly.
const FUTURES = 2000;
const SEQUENCES = 1000;

/** mulberry32: a small seeded generator with values in [0, 1). */
const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * The form data the form submits for these settings. Switches submit their
 * row index, and the retirement date is disabled (so left out) unless the
 * plan retires on a date. See MonteCarloForm.
 */
const formDataFor = (settings: MonteCarloSettings) => {
  const formData = new FormData();
  formData.append('startingBalance', settings.startingBalance);
  formData.append('monthlyExpenses', settings.monthlyExpenses);
  formData.append('endYear', settings.endYear);
  const retirement = settings.retirement!;
  formData.append('retirement[mode]', retirement.mode);
  if (retirement.mode === 'date') formData.append('retirement[date]', retirement.date);
  formData.append('retirement[confidence]', retirement.confidence);

  settings.jobs.forEach((job, index) => {
    JOB_FIELD_NAMES.forEach((field) => {
      if (field === 'adjustForInflation') {
        if (job.adjustForInflation) formData.append('jobs[][adjustForInflation]', String(index));
      } else {
        formData.append(`jobs[][${field}]`, String(job[field] ?? ''));
      }
    });
  });
  settings.life_events.forEach((event, index) => {
    formData.append('life_events[][name]', event.name);
    formData.append('life_events[][date]', event.date);
    if (event.atRetirement) formData.append('life_events[][atRetirement]', String(index));
    formData.append('life_events[][balanceChange]', event.balanceChange);
    formData.append('life_events[][monthlyExpensesChange]', event.monthlyExpensesChange);
  });
  formData.append('inflation[averageAnnualReturnPercentage]', settings.inflation.averageAnnualReturnPercentage);
  formData.append('inflation[standardDeviationPercentage]', settings.inflation.standardDeviationPercentage);
  settings.asset_classes.forEach((assetClass) => {
    formData.append('asset_classes[][name]', assetClass.name);
    formData.append('asset_classes[][allocationPercentage]', assetClass.allocationPercentage);
    formData.append('asset_classes[][averageAnnualReturnPercentage]', assetClass.averageAnnualReturnPercentage);
    formData.append('asset_classes[][standardDeviationPercentage]', assetClass.standardDeviationPercentage);
  });
  return formData;
};

const cents = (value: number) => Math.round(value * 100) / 100;

/** Every few years from the first, and always the last. */
const sampledIndexes = (length: number) =>
  Array.from({ length }, (_, index) => index).filter(
    (index) => index % SAMPLE_EVERY_YEARS === 0 || index === length - 1
  );

const percentile = (sorted: number[], p: number) => sorted[Math.floor(p * (sorted.length - 1))];

const summarizeFutures = (results: MonteCarloResult[]) => {
  const years = results[0]?.length ?? 0;
  return {
    successRate: results.filter((future) => future.every(({ balance }) => balance >= 0)).length / results.length,
    // Balances in today's dollars across the futures.
    balancePercentiles: Object.fromEntries(
      sampledIndexes(years).map((t) => {
        const sorted = results.map((future) => future[t].inflationAdjustedBalance).sort((a, b) => a - b);
        return [results[0][t].year, { p10: cents(percentile(sorted, 0.1)), p50: cents(percentile(sorted, 0.5)), p90: cents(percentile(sorted, 0.9)) }];
      })
    ),
  };
};

const summarizeDeterministic = (result: MonteCarloResult) =>
  Object.fromEntries(
    sampledIndexes(result.length).map((t) => [
      result[t].year,
      { balance: cents(result[t].inflationAdjustedBalance), monthlyExpenses: cents(result[t].inflationAdjustedMonthlyExpenses) },
    ])
  );

const summarize = (response: MonteCarloResponse) => {
  const { readyLine } = response;
  return {
    mode: response.mode,
    confidence: response.confidence,
    futures: summarizeFutures(response.results),
    deterministic: summarizeDeterministic(response.deterministicResult),
    readyLine: readyLine
      ? {
          startYear: readyLine.startYear,
          endYear: readyLine.endYear,
          workEnd: readyLine.workEnd?.toISOString() ?? null,
          plannedRetirement: readyLine.plannedRetirement?.toISOString() ?? null,
          byConfidence: Object.fromEntries(
            Array.from(new Set([...CONFIDENCES, response.confidence]))
              .sort((a, b) => a - b)
              .map((confidence) => {
                const line = readyLineAt(readyLine, confidence / 100);
                const summary = summarizeReadyYears(readyOutcomes(readyLine, line));
                return [
                  confidence,
                  {
                    line: Object.fromEntries(
                      sampledIndexes(line.length).map((k) => [readyLine.startYear + k, cents(line[k])])
                    ),
                    // JSON has no undefined, so missing values are null.
                    summary: Object.fromEntries(
                      Object.entries(summary).map(([key, value]) => [key, value ?? null])
                    ),
                  },
                ];
              })
          ),
        }
      : null,
  };
};

/**
 * Whether two summaries match, allowing for floating-point noise (like
 * adding the same amounts in another order). Returns the paths that differ.
 */
const differences = (actual: unknown, expected: unknown, at = ''): string[] => {
  if (typeof actual === 'number' && typeof expected === 'number') {
    const tolerance = Math.max(0.011, Math.abs(expected) * 1e-9);
    return Math.abs(actual - expected) <= tolerance ? [] : [`${at}: ${actual} (expected ${expected})`];
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const keys = Array.from(new Set([...Object.keys(actual), ...Object.keys(expected)]));
    return keys.flatMap((key) =>
      differences((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${at}.${key}`)
    );
  }
  return actual === expected ? [] : [`${at}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`];
};

const scenarioNames = fs
  .readdirSync(SCENARIOS_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

describe('golden plans', () => {
  const realRandom = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(TODAY);
    // Swapped in directly: a jest mock would record each of the millions of
    // calls a plan makes, which takes several times as long as the plan.
    Math.random = seededRandom(SEED);
  });

  afterEach(() => {
    Math.random = realRandom;
    jest.useRealTimers();
  });

  test('there are scenarios to run', () => {
    expect(scenarioNames.length).toBeGreaterThan(0);
  });

  test.each(scenarioNames)('%s', (name) => {
    const settings: MonteCarloSettings = JSON.parse(
      fs.readFileSync(path.join(SCENARIOS_DIR, `${name}.json`), 'utf8')
    );
    const plan = parsePlanInputs(formDataFor(migrateSettings(settings)));
    const actual = summarize(simulatePlan({ ...plan, futures: FUTURES, sequences: SEQUENCES }));
    const expectedPath = path.join(EXPECTED_DIR, `${name}.json`);

    if (UPDATE) {
      fs.mkdirSync(EXPECTED_DIR, { recursive: true });
      fs.writeFileSync(expectedPath, JSON.stringify(actual, null, 2) + '\n');
      return;
    }

    if (!fs.existsSync(expectedPath)) {
      throw new Error(`No expected results for ${name}. Run with UPDATE_GOLDEN=1 to create them.`);
    }
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    expect(differences(JSON.parse(JSON.stringify(actual)), expected)).toEqual([]);
  });
});
