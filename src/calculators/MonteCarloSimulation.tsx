export class Inflation {
  averageAnnualReturn: number;
  standardDeviation: number;

  constructor({
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
  }: {
    averageAnnualReturnPercentage: number;
    standardDeviationPercentage: number;
  }) {
    this.averageAnnualReturn = convertPercentageToDecimal(
      averageAnnualReturnPercentage
    );
    this.standardDeviation = convertPercentageToDecimal(
      standardDeviationPercentage
    );
  }
}

export class AssetClass extends Inflation {
  allocation: number;
  name: string;

  constructor({
    averageAnnualReturnPercentage,
    standardDeviationPercentage,
    allocationPercentage,
    name,
  }: {
    averageAnnualReturnPercentage: number;
    standardDeviationPercentage: number;
    allocationPercentage: number;
    name: string;
  }) {
    super({ averageAnnualReturnPercentage, standardDeviationPercentage });

    this.allocation = convertPercentageToDecimal(allocationPercentage);
    this.name = name;
  }
}

export class Job {
  name: string;
  postTaxAnnualIncome: number;
  adjustForInflation: boolean;
  yearlyRaisePercentage: number;
  startDate?: Date;
  endDate?: Date;

  constructor({
    name,
    postTaxAnnualIncome,
    adjustForInflation,
    yearlyRaisePercentage,
    startDate,
    endDate,
  }: {
    name: string;
    postTaxAnnualIncome: string;
    adjustForInflation: string;
    yearlyRaisePercentage: string;
    startDate: string;
    endDate: string;
  }) {
    this.name = name;
    this.postTaxAnnualIncome = parseFloat(postTaxAnnualIncome);
    this.adjustForInflation = adjustForInflation === 'on';
    this.yearlyRaisePercentage = parseFloat(yearlyRaisePercentage);
    this.startDate = startDate.length > 0 ? new Date(startDate) : undefined;
    this.endDate = endDate.length > 0 ? new Date(endDate) : undefined;
  }
}

export class LifeEvent {
  name: string;
  balanceChange: number;
  monthlyExpensesChange: number;
  date?: Date;

  constructor({
    name,
    balanceChange,
    monthlyExpensesChange,
    date,
  }: {
    name: string;
    balanceChange: string;
    monthlyExpensesChange: string;
    date: string;
  }) {
    this.name = name;
    this.balanceChange = parseFloat(balanceChange);
    this.monthlyExpensesChange = parseFloat(monthlyExpensesChange);
    this.date = date.length > 0 ? new Date(date) : undefined;
  }
}

const convertPercentageToDecimal = (percent: number) => percent / 100;

const boxMuller = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const sampleRandomNormal = (mean: number, standardDeviation: number) => {
  return mean + standardDeviation * boxMuller();
};

export type MonteCarloResult = Array<{
  year: number;
  balance: number;
  inflationAdjustedBalance: number;
  inflation: number;
  monthlyExpenses: number;
  inflationAdjustedMonthlyExpenses: number;
}>;

class MonteCarloSimulation {
  runningBalance: number;
  runningMonthlyExpenses: number;
  jobs: Job[];
  lifeEvents: LifeEvent[];
  assetClasses: AssetClass[];
  inflation: Inflation;
  cumulativeInflationMultiplier: number;
  endYear: number;

  constructor(
    startingBalance: number,
    monthlyExpenses: number,
    jobs: Job[],
    lifeEvents: LifeEvent[],
    assetClasses: AssetClass[],
    inflation: Inflation,
    endYear: number
  ) {
    this.runningBalance = startingBalance;
    this.runningMonthlyExpenses = monthlyExpenses;
    this.jobs = jobs;
    this.lifeEvents = lifeEvents;
    this.assetClasses = assetClasses;
    this.inflation = inflation;
    this.endYear = endYear;

    this.cumulativeInflationMultiplier = 1;
  }

  run() {
    const yearResults = [];

    for (
      let year = new Date().getFullYear() + 1;
      year <= this.endYear;
      year++
    ) {
      this.applyPreInflationBalanceChanges(year);
      const inflation = this.applyInflation();
      this.applyPostInflationChanges(year);

      yearResults.push({
        year,
        balance: this.runningBalance,
        inflationAdjustedBalance:
          this.runningBalance / this.cumulativeInflationMultiplier,
        inflation,
        monthlyExpenses: this.runningMonthlyExpenses,
        inflationAdjustedMonthlyExpenses:
          this.runningMonthlyExpenses / this.cumulativeInflationMultiplier,
      });
    }

    return yearResults;
  }

  applyPreInflationBalanceChanges(year: number) {
    this.runningBalance += this.investmentGain();

    this.runningBalance += this.runningMonthlyExpenses * 12;

    this.runningBalance += this.jobsIncome(year);
  }

  applyInflation() {
    const inflationRate = sampleRandomNormal(
      this.inflation.averageAnnualReturn,
      this.inflation.standardDeviation
    );

    this.cumulativeInflationMultiplier *= 1 + inflationRate;

    this.runningMonthlyExpenses *= 1 + inflationRate;

    return inflationRate;
  }

  applyPostInflationChanges(year: number) {
    this.runningMonthlyExpenses +=
      this.lifeEventsMonthlyExpensesChange(year) *
      this.cumulativeInflationMultiplier;

    this.runningBalance +=
      this.lifeEventsBalanceChange(year) * this.cumulativeInflationMultiplier;
  }

  investmentGain() {
    return this.runningBalance * this.totalWeightedInvestmentReturnRate();
  }

  totalWeightedInvestmentReturnRate() {
    return this.assetClasses.reduce((acc, assetClass) => {
      return (
        acc +
        assetClass.allocation *
          sampleRandomNormal(
            assetClass.averageAnnualReturn,
            assetClass.standardDeviation
          )
      );
    }, 0);
  }

  jobsIncome(year: number) {
    return this.jobs.reduce((acc, job) => {
      if (job.startDate && job.startDate.getFullYear() > year) return acc;
      if (job.endDate && job.endDate.getFullYear() < year) return acc;

      let income = job.postTaxAnnualIncome;
      if (job.adjustForInflation) income *= this.cumulativeInflationMultiplier;

      return acc + income;
    }, 0);
  }

  lifeEventsMonthlyExpensesChange(year: number) {
    return this.lifeEvents.reduce((acc, lifeEvent) => {
      if (!lifeEvent.date || lifeEvent.date.getFullYear() !== year) return acc;

      return acc + lifeEvent.monthlyExpensesChange;
    }, 0);
  }

  lifeEventsBalanceChange(year: number) {
    return this.lifeEvents.reduce((acc, lifeEvent) => {
      if (!lifeEvent.date || lifeEvent.date.getFullYear() !== year) return acc;

      return acc + lifeEvent.balanceChange;
    }, 0);
  }
}

export default MonteCarloSimulation;
