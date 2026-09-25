import MonteCarloSimulation, { AssetClass, Inflation, Job, LifeEvent, MonteCarloResult } from "./MonteCarloSimulation";

type MonteCarloResponse = {
  results: MonteCarloResult[];
  deterministicResult: MonteCarloResult;
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

  return {
    results,
    deterministicResult,
  };
};

export default run;

/**
 * Every field of an income source, in one place. The form's settings export
 * and import and parseJobs all read this list, so adding a field here is what
 * makes it saved, restored, and submitted. (Before, each of those had its own
 * copy, and missing one silently dropped the field.)
 */
export const JOB_FIELDS = [
  'name',
  'postTaxAnnualIncome',
  'adjustForInflation',
  'yearlyRaisePercentage',
  'startDate',
  'endDate',
  'atRetirement',
] as const;

/** Job fields submitted as numbers. */
export const JOB_NUMBER_FIELDS: ReadonlyArray<string> = ['postTaxAnnualIncome', 'yearlyRaisePercentage'];

export const parseJobs = (formData: FormData): Job[] => {
  // Checkboxes only appear in FormData when checked, so their values can't be
  // zipped by position like the other fields. Each toggle submits its row
  // index instead (see MonteCarloForm).
  const inflationAdjustedRows = new Set(
    formData.getAll('jobs[][adjustForInflation]').map(String)
  );

  return zipFormDataArrays<Record<string, any>>(
    formData,
    JOB_FIELDS
      .filter((field) => field !== 'adjustForInflation')
      .map((field) => ({
        formDataKey: `jobs[][${field}]`,
        resultsKey: field,
        isNum: JOB_NUMBER_FIELDS.includes(field),
      }))
  ).map((job: any, index) =>
    new Job({
      ...job,
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
