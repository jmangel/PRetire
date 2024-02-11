import MonteCarloSimulation from "./MonteCarloSimulation";
import { AssetClass, Inflation, Job, LifeEvent } from "./MonteCarloSimulation";

const run = async (formData: FormData) => {
  const startingBalance = parseFloat(formData.get('startingBalance') as string) || 0;

  const monthlyExpenses = parseFloat(formData.get('monthlyExpenses') as string) || 0;

  const endYear = parseInt(formData.get('endYear') as string) || 2100;

  const jobs = zipFormDataArrays(formData, [
    {
      formDataKey: 'jobs[][name]',
      resultsKey: 'name',
      isNum: false,
    },
    {
      formDataKey: 'jobs[][postTaxAnnualIncome]',
      resultsKey: 'postTaxAnnualIncome',
      isNum: true,
    },
    {
      formDataKey: 'jobs[][adjustForInflation]',
      resultsKey: 'adjustForInflation',
      isNum: false,
    },
    {
      formDataKey: 'jobs[][yearlyRaisePercentage]',
      resultsKey: 'yearlyRaisePercentage',
      isNum: true,
    },
    {
      formDataKey: 'jobs[][startDate]',
      resultsKey: 'startDate',
      isNum: false,
    },
    {
      formDataKey: 'jobs[][endDate]',
      resultsKey: 'endDate',
      isNum: false,
    },
  ]).map((job) => new Job(job));
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

  const results = [...Array(1000)].map((i) =>
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

  return results;
};

export default run;

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