// A short summary of a scenario's last run, saved with the scenario so the
// library (and later the compare grid) can show results without re-running.

import { MonteCarloResponse, RESULTS_VERSION, RetirementMode, simulationStartYear } from './calculators/MonteCarlo';
import { readyLineAt, readyOutcomes, summarizeReadyYears } from './calculators/ReadyLine';
import { MonteCarloSettings, migrateSettings } from './calculators/Settings';

export type ResultSummary = {
  /** The scenario's retirement setting: when ready, or on a fixed date. */
  mode: RetirementMode;
  /** Share of futures (0 to 1) where the money lasts. */
  successRate: number;
  /**
   * When ready: the median future's ready year. Missing means the median
   * future is never ready before the end year, unless alreadyRetired.
   */
  medianReadyYear?: number;
  /**
   * When ready: true when there's no retirement year to find, because there's
   * no work income or it has already ended. (With no years left to simulate,
   * it's unset: never ready.)
   */
  alreadyRetired?: boolean;
  /** On a fixed date: that date's year. */
  plannedRetirementYear?: number;
  /** The desired success rate (a percentage) the summary used. */
  confidence: number;
  /** The settings and calculation the run used; see settingsFingerprint. */
  fingerprint: string;
};

/** JSON with object keys sorted at every level, so key order never matters. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const utf8Bytes = (text: string): number[] => {
  const bytes: number[] = [];
  for (const char of Array.from(text)) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
};

/**
 * 64-bit FNV-1a of the text's UTF-8 bytes, in hex. It only has to tell
 * settings apart, not be secure. Computed in 16-bit pieces, since numbers
 * here are doubles.
 */
export const fnv1a64 = (text: string): string => {
  // The offset basis 0xcbf29ce484222325, lowest 16 bits first.
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  utf8Bytes(text).forEach((byte) => {
    h0 ^= byte;
    // Multiply by the prime 0x100000001b3, which is 2^40 + 0x1b3.
    const t0 = h0 * 0x1b3;
    let t1 = h1 * 0x1b3;
    let t2 = h2 * 0x1b3 + (h0 << 8);
    let t3 = h3 * 0x1b3 + (h1 << 8);
    t1 += t0 >>> 16;
    t2 += t1 >>> 16;
    t3 += t2 >>> 16;
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  });
  return [h3, h2, h1, h0].map((word) => word.toString(16).padStart(4, '0')).join('');
};

/**
 * Identifies a plan's settings and the calculation that runs them: the
 * calculation's version, the first simulated year (results change when it
 * does, every January), and a hash of the settings. Files from before a
 * format change are brought up to date first, so they match a new file with
 * the same plan.
 */
export const settingsFingerprint = (settings: MonteCarloSettings, startYear = simulationStartYear()): string =>
  `${RESULTS_VERSION}:${startYear}:${fnv1a64(canonicalJson(migrateSettings(settings)))}`;

/** Whether a summary still describes these settings, run by today's calculation in this year. */
export const isSummaryCurrent = (summary: ResultSummary, settings: MonteCarloSettings, startYear = simulationStartYear()) =>
  summary.fingerprint === settingsFingerprint(settings, startYear);

/**
 * Whether a run of `ran` gives the results `settings` would. Only the desired
 * success rate may differ: the page replays the same futures at any rate.
 */
export const sameRun = (ran: MonteCarloSettings, settings: MonteCarloSettings) => {
  const withoutRate = (s: MonteCarloSettings) => {
    const migrated = migrateSettings(s);
    return migrated.retirement ? { ...migrated, retirement: { ...migrated.retirement, confidence: '' } } : migrated;
  };
  return canonicalJson(withoutRate(ran)) === canonicalJson(withoutRate(settings));
};

const confidenceOf = (settings: MonteCarloSettings, fallback: number) => {
  const parsed = Math.round(parseFloat(String(migrateSettings(settings).retirement?.confidence)));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The summary of a run for these settings, at their own desired success rate,
 * as the results card shows it.
 */
export const summarizeRun = (response: MonteCarloResponse, settings: MonteCarloSettings): ResultSummary => {
  // The year the run started in, not now: a run can finish after New Year.
  const fingerprint = settingsFingerprint(settings, response.startYear);
  const confidence = confidenceOf(settings, response.confidence);
  if (response.mode === 'ready' && response.readyLine) {
    const ready = summarizeReadyYears(
      readyOutcomes(response.readyLine, readyLineAt(response.readyLine, confidence / 100))
    );
    return {
      mode: 'ready',
      successRate: ready.successRate,
      ...(ready.median !== undefined ? { medianReadyYear: ready.median } : {}),
      confidence,
      fingerprint,
    };
  }
  const successes = response.results.filter((result) => result.every(({ balance }) => balance >= 0)).length;
  const successRate = response.results.length === 0 ? 0 : successes / response.results.length;
  if (response.mode === 'ready') {
    // No ready line with years left to retire in means there's no work
    // income left. With none left (the end year is next year at the
    // latest), no future is ready before the end year.
    const yearsLeft = response.endYear > response.startYear;
    return { mode: 'ready', successRate, ...(yearsLeft ? { alreadyRetired: true } : {}), confidence, fingerprint };
  }
  const date = migrateSettings(settings).retirement?.date;
  const year = date ? new Date(date).getUTCFullYear() : NaN;
  return {
    mode: 'date',
    successRate,
    ...(Number.isFinite(year) ? { plannedRetirementYear: year } : {}),
    confidence,
    fingerprint,
  };
};

/** A summary as stored, or undefined if `value` isn't a usable one. */
export const cleanSummary = (value: unknown): ResultSummary | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const isYear = (year: unknown) => year === undefined || (typeof year === 'number' && Number.isInteger(year));
  if (
    (v.mode !== 'ready' && v.mode !== 'date') ||
    typeof v.successRate !== 'number' || !(v.successRate >= 0 && v.successRate <= 1) ||
    typeof v.confidence !== 'number' ||
    typeof v.fingerprint !== 'string' ||
    !isYear(v.medianReadyYear) || !isYear(v.plannedRetirementYear) ||
    (v.alreadyRetired !== undefined && v.alreadyRetired !== true)
  ) {
    return undefined;
  }
  return {
    mode: v.mode,
    successRate: v.successRate,
    ...(v.medianReadyYear !== undefined ? { medianReadyYear: v.medianReadyYear as number } : {}),
    ...(v.alreadyRetired ? { alreadyRetired: true } : {}),
    ...(v.plannedRetirementYear !== undefined ? { plannedRetirementYear: v.plannedRetirementYear as number } : {}),
    confidence: v.confidence,
    fingerprint: v.fingerprint,
  };
};

/** A success rate as a whole percentage that never rounds to 100% or 0% unless it is. */
const percent = (rate: number) => {
  const rounded = Math.round(rate * 100);
  if (rounded === 100 && rate < 1) return 99;
  if (rounded === 0 && rate > 0) return 1;
  return rounded;
};

/** e.g. "89% · ready 2040", "89% · never ready", "89% · retire 2045". */
export const describeSummary = (summary: ResultSummary): string => {
  const rate = `${percent(summary.successRate)}%`;
  if (summary.mode === 'date') {
    return summary.plannedRetirementYear !== undefined ? `${rate} · retire ${summary.plannedRetirementYear}` : rate;
  }
  if (summary.alreadyRetired) return `${rate} · already retired`;
  return summary.medianReadyYear !== undefined ? `${rate} · ready ${summary.medianReadyYear}` : `${rate} · never ready`;
};
