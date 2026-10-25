import { AssetClass, Inflation, Job, LifeEvent, MonteCarloResult } from "./MonteCarloSimulation";
import { averageMarkets, buildCalendar, drawMarkets, simulateFutures } from "./Futures";
import { ReadyLineData, computeReadyLine, readyFutures, readyLineAt } from "./ReadyLine";

/**
 * When the plan retires.
 * - 'ready': each simulated future retires once its balance reaches the ready
 *   line at the chosen confidence (the default).
 * - 'date': every future retires on a fixed date.
 */
export type RetirementMode = 'ready' | 'date';

export const parseRetirementMode = (value?: unknown): RetirementMode =>
  value === 'date' ? 'date' : 'ready';

export const DEFAULT_CONFIDENCE = 90;
export const MIN_CONFIDENCE = 50;
export const MAX_CONFIDENCE = 99;

/** A confidence percentage from the form, kept within the slider's range. */
export const parseConfidence = (value?: unknown): number => {
  const parsed = Math.round(parseFloat(String(value)));
  if (!Number.isFinite(parsed)) return DEFAULT_CONFIDENCE;
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, parsed));
};

export type MonteCarloResponse = {
  mode: RetirementMode;
  /** The confidence (a percentage) the plan was run with. */
  confidence: number;
  /**
   * The simulated futures: retiring on the fixed date, or, in 'ready' mode,
   * retiring when ready at `confidence`.
   */
  results: MonteCarloResult[];
  deterministicResult: MonteCarloResult;
  /**
   * Undefined when there's no retirement year to find: already retired (no
   * work income, or the retirement date is on or before the first simulated
   * year), or no year left to retire in before the end year.
   */
  readyLine?: ReadyLineData;
};

const FUTURES = 10000;

const run = async (formData: FormData): Promise<MonteCarloResponse> => {
  const startingBalance = parseFloat(formData.get('startingBalance') as string) || 0;

  const monthlyExpenses = parseFloat(formData.get('monthlyExpenses') as string) || 0;

  const endYear = parseInt(formData.get('endYear') as string) || 2100;
  const startYear = new Date().getFullYear() + 1;

  const confidence = parseConfidence(formData.get('retirement[confidence]') ?? DEFAULT_CONFIDENCE);
  const retirementDateValue = String(formData.get('retirement[date]') ?? '');
  const plannedRetirement =
    parseRetirementMode(formData.get('retirement[mode]')) === 'date' && retirementDateValue.length > 0
      ? new Date(retirementDateValue)
      : undefined;
  // The form needs a date to run a fixed-date plan. Without one, retire when
  // ready rather than letting work income run to the end year.
  const mode: RetirementMode = plannedRetirement ? 'date' : 'ready';

  const jobs = parseJobs(formData);
  const lifeEvents = parseLifeEvents(formData);
  const assetClasses = zipFormDataArrays(formData, [
    {
      formDataKey: 'asset_classes[][name]',
      resultsKey: 'name',
      isNum: false,
    },
    {
      formDataKey: 'asset_classes[][averageAnnualReturnPercentage]',
      resultsKey: 'averageAnnualReturnPercentage',
      isNum: true,
    },
    {
      formDataKey: 'asset_classes[][standardDeviationPercentage]',
      resultsKey: 'standardDeviationPercentage',
      isNum: true,
    },
    {
      formDataKey: 'asset_classes[][allocationPercentage]',
      resultsKey: 'allocationPercentage',
      isNum: true,
    },
  ]).map((assetClass) => new AssetClass(assetClass));
  const inflation = new Inflation(zipFormDataArrays(formData, [
    {
      formDataKey: 'inflation[averageAnnualReturnPercentage]',
      resultsKey: 'averageAnnualReturnPercentage',
      isNum: true
    },
    {
      formDataKey: 'inflation[standardDeviationPercentage]',
      resultsKey: 'standardDeviationPercentage',
      isNum: true
    },
  ])[0]);

  return simulatePlan({
    startingBalance, monthlyExpenses, jobs, lifeEvents, assetClasses, inflation,
    startYear, endYear, mode, confidence, plannedRetirement,
  });
};

type PlanInputs = {
  startingBalance: number;
  monthlyExpenses: number;
  jobs: Job[];
  lifeEvents: LifeEvent[];
  assetClasses: AssetClass[];
  inflation: Inflation;
  startYear: number;
  endYear: number;
  mode: RetirementMode;
  /** A percentage. */
  confidence: number;
  /** The fixed retirement date, in 'date' mode. */
  plannedRetirement?: Date;
  futures?: number;
  /** Random sequences for the ready line. */
  sequences?: number;
};

export const simulatePlan = ({
  startingBalance, monthlyExpenses, jobs, lifeEvents, assetClasses, inflation,
  startYear, endYear, mode, confidence, plannedRetirement, futures = FUTURES, sequences,
}: PlanInputs): MonteCarloResponse => {
  const years = Math.max(0, endYear - startYear + 1);
  const markets = drawMarkets(assetClasses, inflation, futures, years);
  const average = averageMarkets(assetClasses, inflation, years);

  const readyLine = computeReadyLine({
    startingBalance,
    monthlyExpenses,
    jobs,
    lifeEvents,
    assetClasses,
    inflation,
    endYear,
    startYear,
    markets,
    averageMarkets: average,
    plannedRetirement,
    sequences,
  });

  if (mode === 'ready' && readyLine) {
    return {
      mode,
      confidence,
      ...readyFutures(readyLine, readyLineAt(readyLine, confidence / 100)),
      readyLine,
    };
  }

  // A fixed date, or nothing left to retire from.
  const calendar = buildCalendar({
    startingBalance, monthlyExpenses, jobs, lifeEvents, startYear, endYear,
    retirementDate: plannedRetirement,
  });
  const retirement = { kind: 'date', date: plannedRetirement } as const;

  return {
    mode,
    confidence,
    results: simulateFutures(markets, calendar, retirement, { record: true }).results!,
    deterministicResult: simulateFutures(average, calendar, retirement, { record: true }).results![0],
    readyLine,
  };
};

export default run;

type JobInit = ConstructorParameters<typeof Job>[0];

/**
 * Every field of an income source, in one place, with how each is stored:
 * 'number' fields are parsed as numbers on submit, 'boolean' fields are
 * switches, and 'string' fields are kept as text. The form's settings export
 * and import and parseJobs all read this list, so adding a field here is what
 * makes it saved, restored, and submitted. (Before, each of those had its own
 * copy, and missing one silently dropped the field.) `satisfies` keeps the
 * list in step with the fields Job accepts.
 */
export const JOB_FIELDS = {
  name: 'string',
  postTaxAnnualIncome: 'number',
  adjustForInflation: 'boolean',
  startDate: 'string',
  endDate: 'string',
  atRetirement: 'string',
} as const satisfies Record<keyof JobInit, 'string' | 'number' | 'boolean'>;

export type JobField = keyof typeof JOB_FIELDS;

/** Job field names, in form order. */
export const JOB_FIELD_NAMES = Object.keys(JOB_FIELDS) as JobField[];

// adjustForInflation is read separately below, by row index.
type SubmittedJobField = Exclude<JobField, 'adjustForInflation'>;

// One zipped form row: 'number' fields arrive parsed, the rest as text.
type SubmittedJobRow = {
  [K in SubmittedJobField]: typeof JOB_FIELDS[K] extends 'number' ? number : string;
};

export const parseJobs = (formData: FormData): Job[] => {
  // Checkboxes only appear in FormData when checked, so their values can't be
  // zipped by position like the other fields. Each toggle submits its row
  // index instead (see MonteCarloForm).
  const inflationAdjustedRows = new Set(
    formData.getAll('jobs[][adjustForInflation]').map(String)
  );

  const submittedFields = JOB_FIELD_NAMES.filter(
    (field): field is SubmittedJobField => field !== 'adjustForInflation'
  );

  return zipFormDataArrays<SubmittedJobRow>(
    formData,
    submittedFields.map((field) => ({
      formDataKey: `jobs[][${field}]`,
      resultsKey: field,
      isNum: JOB_FIELDS[field] === 'number',
    }))
  ).map((job, index) =>
    new Job({
      ...job,
      adjustForInflation: inflationAdjustedRows.has(String(index)) ? 'on' : '',
    })
  );
};

export const parseLifeEvents = (formData: FormData): LifeEvent[] => {
  // Like the jobs' inflation switches, each "At retirement" switch submits
  // its row index, since unchecked boxes are left out of the form data.
  const atRetirementRows = new Set(formData.getAll('life_events[][atRetirement]').map(String));

  return zipFormDataArrays<{ name: string; balanceChange: string; monthlyExpensesChange: string; date: string }>(formData, [
    { formDataKey: 'life_events[][name]', resultsKey: 'name', isNum: false },
    { formDataKey: 'life_events[][balanceChange]', resultsKey: 'balanceChange', isNum: true },
    { formDataKey: 'life_events[][monthlyExpensesChange]', resultsKey: 'monthlyExpensesChange', isNum: true },
    { formDataKey: 'life_events[][date]', resultsKey: 'date', isNum: false },
  ]).map((lifeEvent, index) =>
    new LifeEvent({
      ...lifeEvent,
      balanceChange: String(lifeEvent.balanceChange),
      monthlyExpensesChange: String(lifeEvent.monthlyExpensesChange),
      atRetirement: atRetirementRows.has(String(index)),
    })
  );
};

const zipFormDataArrays = <T extends {}>(
  formData: FormData,
  keys: Array<{ isNum: boolean, formDataKey: string, resultsKey: keyof T }>
):T[] => {
  const resultsArray: T[] = [];

  keys.forEach(({ isNum, resultsKey, formDataKey }) => {
    formData.getAll(formDataKey).forEach((value, index) => {
      if (!resultsArray[index]) {
        resultsArray[index] = {} as T;
      }
      resultsArray[index][resultsKey as keyof T] = (isNum ? parseFloat(value as string) || 0 : value) as T[keyof T];
    });
  })

  return resultsArray;
};
