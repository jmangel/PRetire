import MonteCarloSimulation from "./MonteCarloSimulation";
import { AssetClass, Inflation, Job, LifeEvent } from "./MonteCarloSimulation";

const run = async (formData: FormData) => {
  const startingBalanceString = formData.get('startingBalance');
  const startingBalance = startingBalanceString ? parseFloat(startingBalanceString as string) : 0;

  const monthlyExpensesString = formData.get('monthlyExpenses');
  const monthlyExpenses = monthlyExpensesString ? parseFloat(monthlyExpensesString as string) : 0;

  const jobs = zipFormDataArrays(formData, {
    name: 'jobs[][name]',
    postTaxAnnualIncome: 'jobs[][postTaxAnnualIncome]',
    adjustForInflation: 'jobs[][adjustForInflation]',
    yearlyRaisePercentage: 'jobs[][yearlyRaisePercentage]',
    startDate: 'jobs[][startDate]',
    endDate: 'jobs[][endDate]',
  }).map((job) => new Job(job));
  const lifeEvents = zipFormDataArrays(formData, {
    name: 'life_events[][name]',
    balanceChange: 'life_events[][balanceChange]',
    monthlyExpensesChange: 'life_events[][monthlyExpensesChange]',
    date: 'life_events[][date]',
  }).map((lifeEvent) => new LifeEvent(lifeEvent));
  const assetClasses = zipFormDataArrays(formData, {
    name: 'asset_classes[][name]',
    averageAnnualReturnPercentage: 'asset_classes[][averageAnnualReturnPercentage]',
    standardDeviationPercentage: 'asset_classes[][standardDeviationPercentage]',
    allocationPercentage: 'asset_classes[][allocationPercentage]',
  }).map((assetClass) => new AssetClass(assetClass));
  const inflation = new Inflation(zipFormDataArrays(formData, {
    averageAnnualReturnPercentage: 'inflation[averageAnnualReturnPercentage]',
    standardDeviationPercentage: 'inflation[standardDeviationPercentage]',
  })[0]);

  const results = [...Array(1000)].map((i) =>
    new MonteCarloSimulation(
      startingBalance,
      monthlyExpenses,
      jobs,
      lifeEvents,
      assetClasses,
      inflation,
      2100,
    ).run()
  );

  return results;
};

export default run;

const zipFormDataArrays = <T extends Record<string, string>>(
  formData: FormData,
  keys: T
): { [K in keyof T]: string }[] => {
  const resultsArray: { [K in keyof T]: string }[] = [];

  Object.entries(keys).forEach(([resultsKey, formDataKey]) => {
    formData.getAll(formDataKey).forEach((value, index) => {
      if (!resultsArray[index]) {
        resultsArray[index] = {} as { [K in keyof T]: string };
      }
      resultsArray[index][resultsKey as keyof T] = value as string;
    });
  })

  return resultsArray;
};