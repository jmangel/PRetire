import { Job, workIncomeEndDate } from './PlanInputs';
import { DEFAULT_CONFIDENCE, JOB_FIELDS, JobField, RetirementMode } from './MonteCarlo';

/*
 * The settings file the form exports and imports, and how files saved by
 * earlier versions are brought up to date.
 */

// One exported income source: switches are saved as booleans, every other
// field as text.
export type JobSettings = {
  [K in Exclude<JobField, 'atRetirement'>]: typeof JOB_FIELDS[K] extends 'boolean' ? boolean : string;
} & {
  // Missing in settings files saved before this option existed.
  atRetirement?: string;
};

type RetirementSettings = {
  mode: RetirementMode;
  confidence: string;
  date: string;
};

type LifeEventSettings = {
  name: string;
  date: string;
  balanceChange: string;
  monthlyExpensesChange: string;
  // Missing in settings files saved before this option existed.
  atRetirement?: boolean;
};

export type MonteCarloSettings = {
  startingBalance: string;
  monthlyExpenses: string;
  endYear: string;
  // Missing in settings files saved before retirement was its own setting.
  retirement?: RetirementSettings;
  jobs: JobSettings[];
  life_events: LifeEventSettings[];
  inflation: {
    averageAnnualReturnPercentage: string;
    standardDeviationPercentage: string;
  };
  asset_classes: Array<{
    name: string;
    allocationPercentage: string;
    averageAnnualReturnPercentage: string;
    standardDeviationPercentage: string;
  }>;
};

/**
 * Brings a settings file saved by an earlier version up to date, so it gives
 * the same results it did then.
 *
 * Files from before income had a type ("At retirement") ran every income
 * source on its own dates. Rows with an end date become work income and rows
 * without one become other income, which keeps paying on its own dates as
 * before. (A blank end date then meant income that runs to the end year,
 * like Social Security or a job you'd "work to the grave".)
 *
 * Files from before retirement was its own setting worked out the retirement
 * date from the income: the last end date among work income. Those open on
 * that fixed date. The end dates that marked retirement are cleared, since
 * the retirement setting now covers them and a work income end date means
 * "ends before retirement" (like a job change). Without such a date (some
 * work income had no end date, or there was none), the plan retires when
 * ready.
 */
export const migrateSettings = (imported: MonteCarloSettings): MonteCarloSettings => {
  if (imported.retirement) return imported;

  const settings = {
    ...imported,
    jobs: imported.jobs.map((job) =>
      job.atRetirement === undefined
        ? { ...job, atRetirement: String(job.endDate ?? '') === '' ? 'unaffected' : 'stops' }
        : job
    ),
  };
  const jobs = settings.jobs.map(
    (job) =>
      new Job({
        name: String(job.name ?? ''),
        postTaxAnnualIncome: String(job.postTaxAnnualIncome ?? ''),
        adjustForInflation: job.adjustForInflation ? 'on' : '',
        startDate: String(job.startDate ?? ''),
        endDate: String(job.endDate ?? ''),
        atRetirement: job.atRetirement,
      })
  );
  const retirementDate = workIncomeEndDate(jobs);
  if (!retirementDate) {
    return {
      ...settings,
      retirement: { mode: 'ready', confidence: String(DEFAULT_CONFIDENCE), date: '' },
    };
  }

  const endsAtRetirement = (index: number) =>
    jobs[index].atRetirement === 'stops' && jobs[index].endDate?.getTime() === retirementDate.getTime();
  return {
    ...settings,
    retirement: {
      mode: 'date',
      confidence: String(DEFAULT_CONFIDENCE),
      date: settings.jobs[jobs.findIndex((_, index) => endsAtRetirement(index))].endDate,
    },
    jobs: settings.jobs.map((job, index) => (endsAtRetirement(index) ? { ...job, endDate: '' } : job)),
  };
};
