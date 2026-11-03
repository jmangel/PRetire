import { RESULTS_VERSION, RetirementMode, simulatePlan } from './calculators/MonteCarlo';
import { AssetClass, Inflation, Job } from './calculators/PlanInputs';
import { readyLineAt, readyOutcomes, summarizeReadyYears } from './calculators/ReadyLine';
import { MonteCarloSettings } from './calculators/Settings';
import {
  canonicalJson,
  cleanSummary,
  describeSummary,
  fnv1a64,
  isSummaryCurrent,
  sameRun,
  settingsFingerprint,
  summarizeRun,
} from './resultSummary';

const settings = (overrides: Partial<MonteCarloSettings> = {}): MonteCarloSettings => ({
  startingBalance: '200000',
  monthlyExpenses: '-3000',
  endYear: '2070',
  retirement: { mode: 'ready', confidence: '90', date: '' },
  jobs: [],
  life_events: [],
  inflation: { averageAnnualReturnPercentage: '2.5', standardDeviationPercentage: '1' },
  asset_classes: [],
  ...overrides,
});

describe('fnv1a64', () => {
  test('matches the published FNV-1a 64-bit values', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  test('hashes text as UTF-8', () => {
    expect(fnv1a64('é')).not.toBe(fnv1a64('e'));
    expect(fnv1a64('Zürich 🏠')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('canonicalJson', () => {
  test('sorts keys at every level, keeps array order, and leaves out undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}');
    expect(canonicalJson({ a: { c: 1, d: 2 }, b: 1 })).toBe(canonicalJson({ b: 1, a: { d: 2, c: 1 } }));
  });
});

describe('settingsFingerprint', () => {
  test('is the calculation version plus a hash of the settings', () => {
    expect(settingsFingerprint(settings())).toMatch(new RegExp(`^${RESULTS_VERSION}:[0-9a-f]{16}$`));
  });

  test("doesn't depend on key order, but does on every value", () => {
    const reversed = (value: object) => Object.fromEntries(Object.entries(value).reverse());
    const original = settings();
    const reordered = { ...reversed(original), retirement: reversed(original.retirement!) } as MonteCarloSettings;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(original)[0]);
    expect(settingsFingerprint(reordered)).toBe(settingsFingerprint(settings()));
    expect(settingsFingerprint(settings({ startingBalance: '200001' }))).not.toBe(settingsFingerprint(settings()));
    expect(settingsFingerprint(settings({ retirement: { mode: 'ready', confidence: '85', date: '' } })))
      .not.toBe(settingsFingerprint(settings()));
  });

  test('a file from before retirement was a setting matches the same plan saved today', () => {
    const old = settings({ retirement: undefined });
    expect(settingsFingerprint(old)).toBe(settingsFingerprint(settings()));
  });

  test('a summary is current only for the settings it was made from', () => {
    const summary = { mode: 'ready' as const, successRate: 0.9, confidence: 90, fingerprint: settingsFingerprint(settings()) };
    expect(isSummaryCurrent(summary, settings())).toBe(true);
    expect(isSummaryCurrent(summary, settings({ endYear: '2071' }))).toBe(false);
    expect(isSummaryCurrent({ ...summary, fingerprint: `0:${summary.fingerprint.split(':')[1]}` }, settings())).toBe(false);
  });
});

describe('sameRun', () => {
  test('only the desired success rate may differ', () => {
    expect(sameRun(settings(), settings({ retirement: { mode: 'ready', confidence: '75', date: '' } }))).toBe(true);
    expect(sameRun(settings(), settings({ retirement: { mode: 'date', confidence: '90', date: '2040-01-01' } }))).toBe(false);
    expect(sameRun(settings(), settings({ monthlyExpenses: '-3001' }))).toBe(false);
    expect(sameRun(settings({ retirement: undefined }), settings())).toBe(true);
  });
});

describe('summarizeRun', () => {
  const startYear = new Date().getFullYear() + 1;
  const response = (mode: RetirementMode, { income = true } = {}) =>
    simulatePlan({
      startingBalance: 200000,
      monthlyExpenses: -3000,
      jobs: income
        ? [new Job({ name: '', postTaxAnnualIncome: '70000', adjustForInflation: 'on', startDate: '', endDate: '', atRetirement: 'stops' })]
        : [],
      lifeEvents: [],
      assetClasses: [new AssetClass({ name: 'Stocks', allocationPercentage: 100, averageAnnualReturnPercentage: 7, standardDeviationPercentage: 15 })],
      inflation: new Inflation({ averageAnnualReturnPercentage: 2.5, standardDeviationPercentage: 1 }),
      startYear,
      endYear: startYear + 40,
      mode,
      confidence: 90,
      plannedRetirement: mode === 'date' ? new Date(`${startYear + 12}-07-01`) : undefined,
      futures: 20,
      sequences: 200,
    });

  test('retiring when ready: the success rate and median ready year at the settings\' own rate', () => {
    const run = response('ready');
    const at75 = settings({ retirement: { mode: 'ready', confidence: '75', date: '' } });
    const expected = summarizeReadyYears(readyOutcomes(run.readyLine!, readyLineAt(run.readyLine!, 0.75)));
    expect(summarizeRun(run, at75)).toEqual({
      mode: 'ready',
      successRate: expected.successRate,
      ...(expected.median !== undefined ? { medianReadyYear: expected.median } : {}),
      confidence: 75,
      fingerprint: settingsFingerprint(at75),
    });
  });

  test('on a fixed date: the share of futures that never go below zero, and the year', () => {
    const run = response('date');
    const dated = settings({ retirement: { mode: 'date', confidence: '90', date: `${startYear + 12}-07-01` } });
    const successes = run.results.filter((result) => result.every(({ balance }) => balance >= 0)).length;
    expect(summarizeRun(run, dated)).toEqual({
      mode: 'date',
      successRate: successes / run.results.length,
      plannedRetirementYear: startYear + 12,
      confidence: 90,
      fingerprint: settingsFingerprint(dated),
    });
  });

  test('with no work income, there is no ready year to find', () => {
    const summary = summarizeRun(response('ready', { income: false }), settings());
    expect(summary).toMatchObject({ mode: 'ready', alreadyRetired: true });
    expect(summary.medianReadyYear).toBeUndefined();
  });
});

describe('cleanSummary', () => {
  const good = { mode: 'ready', successRate: 0.9, medianReadyYear: 2040, confidence: 90, fingerprint: '1:abc' };

  test('keeps a usable summary and drops what it is not', () => {
    expect(cleanSummary({ ...good, extra: 'x' })).toEqual(good);
    expect(cleanSummary({ ...good, mode: 'soon' })).toBeUndefined();
    expect(cleanSummary({ ...good, successRate: 1.5 })).toBeUndefined();
    expect(cleanSummary({ ...good, medianReadyYear: '2040' })).toBeUndefined();
    expect(cleanSummary({ ...good, fingerprint: 1 })).toBeUndefined();
    expect(cleanSummary('89%')).toBeUndefined();
  });
});

describe('describeSummary', () => {
  const base = { confidence: 90, fingerprint: '1:abc' };
  test('says the success rate, then when', () => {
    expect(describeSummary({ ...base, mode: 'ready', successRate: 0.894, medianReadyYear: 2040 })).toBe('89% · ready 2040');
    expect(describeSummary({ ...base, mode: 'ready', successRate: 0.4 })).toBe('40% · never ready');
    expect(describeSummary({ ...base, mode: 'ready', successRate: 0.5, alreadyRetired: true })).toBe('50% · already retired');
    expect(describeSummary({ ...base, mode: 'date', successRate: 0.8, plannedRetirementYear: 2045 })).toBe('80% · retire 2045');
  });

  test('never rounds to 100% or 0% unless it is', () => {
    expect(describeSummary({ ...base, mode: 'date', successRate: 0.998 })).toBe('99%');
    expect(describeSummary({ ...base, mode: 'date', successRate: 0.002 })).toBe('1%');
    expect(describeSummary({ ...base, mode: 'date', successRate: 1 })).toBe('100%');
  });
});
