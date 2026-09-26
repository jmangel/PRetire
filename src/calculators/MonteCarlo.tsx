import MonteCarloSimulation, { AssetClass, Inflation, Job, LifeEvent, MonteCarloResult } from "./MonteCarloSimulation";
import { ReadyLineData, computeReadyLine } from "./ReadyLine";

export type MonteCarloResponse = {
  results: MonteCarloResult[];
  deterministicResult: MonteCarloResult;
  /**
   * Undefined when there's no retirement year to find: already retired
   * (nothing stops at retirement, or the planned retirement is on or before
   * the first simulated year), or no year left to retire in before the end
   * year.
   */
  readyLine?: ReadyLineData;
};

const run = async (formData: FormData): Promise<MonteCarloResponse> => {
  const startingBalance = parseFloat(formData.get('startingBalance') as string) || 0;

  const monthlyExpenses = parseFloat(formData.get('monthlyExpenses') as string) || 0;

  const endYear = parseInt(formData.get('endYear') as string) || 2100;

  const jobs = parseJobs(formData);
  const lifeEvents = zipFormDataArrays(formData, [
    {
      formDataKey: 'life_events[][name]',
      resultsKey: 'name',
      isNum: false,
    },
    {
      formDataKey: 'life_events[][balanceChange]',
      resultsKey: 'balanceChange',
      isNum: true,
    },
    {
      formDataKey: 'life_events[][monthlyExpensesChange]',
      resultsKey: 'monthlyExpensesChange',
      isNum: true,
    },
    {
      formDataKey: 'life_events[][date]',
      resultsKey: 'date',
      isNum: false,
    },
  ]).map((lifeEvent) => new LifeEvent(lifeEvent));
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

  const deterministicResult = new MonteCarloSimulation(
    startingBalance,
    monthlyExpenses,
    jobs,
    lifeEvents,
    assetClasses,
    inflation,
    endYear,
  ).runDeterministic();

  const results = [...Array(10000)].map(() =>
    new MonteCarloSimulation(
      startingBalance,
      monthlyExpenses,
      jobs,
      lifeEvents,
      assetClasses,
      inflation,
      endYear,
    ).run()
  );

  const readyLine = computeReadyLine({
    startingBalance,
    monthlyExpenses,
    jobs,
    lifeEvents,
    assetClasses,
    inflation,
    endYear,
  });

  return {
    results,
    deterministicResult,
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
  yearlyRaisePercentage: 'number',
  startDate: 'string',
  endDate: 'string',
  atRetirement: 'string',
} as const satisfies Record<keyof JobInit, 'string' | 'number' | 'boolean'>;

export type JobField = keyof typeof JOB_FIELDS;

/** Job field names, in form order. */
export const JOB_FIELD_NAMES = Object.keys(JOB_FIELDS) as JobField[];

// adjustForInflation is read separately below, by row index.
type SubmittedJobField = Exclude<JobField, 'adjustForInflation'>;

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

  return zipFormDataArrays<Record<SubmittedJobField, FormDataEntryValue | number>>(
    formData,
    submittedFields.map((field) => ({
      formDataKey: `jobs[][${field}]`,
      resultsKey: field,
      isNum: JOB_FIELDS[field] === 'number',
    }))
  ).map((job, index) =>
    new Job({
      // Job parses its number fields itself, so already-parsed numbers pass
      // through unchanged.
      ...(job as Omit<JobInit, 'adjustForInflation'>),
      adjustForInflation: inflationAdjustedRows.has(String(index)) ? 'on' : '',
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
