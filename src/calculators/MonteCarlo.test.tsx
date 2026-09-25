import { parseJobs } from './MonteCarlo';

const jobsFormData = (
  jobs: Array<{ income: string; adjustForInflation: boolean }>
) => {
  const formData = new FormData();
  jobs.forEach((job, index) => {
    formData.append('jobs[][name]', `Job ${index}`);
    formData.append('jobs[][postTaxAnnualIncome]', job.income);
    // Mirrors the browser: unchecked checkboxes are omitted from FormData,
    // and checked ones submit their value (the row index).
    if (job.adjustForInflation) {
      formData.append('jobs[][adjustForInflation]', String(index));
    }
    formData.append('jobs[][yearlyRaisePercentage]', '');
    formData.append('jobs[][startDate]', '');
    formData.append('jobs[][endDate]', '');
  });
  return formData;
};

describe('parseJobs', () => {
  test('keeps each inflation toggle on its own job when an earlier one is off', () => {
    const jobs = parseJobs(
      jobsFormData([
        { income: '100000', adjustForInflation: false },
        { income: '120000', adjustForInflation: true },
      ])
    );

    expect(jobs.map((job) => job.adjustForInflation)).toEqual([false, true]);
    expect(jobs.map((job) => job.postTaxAnnualIncome)).toEqual([100000, 120000]);
  });

  test('handles all toggles on and all toggles off', () => {
    const allOn = parseJobs(
      jobsFormData([
        { income: '1', adjustForInflation: true },
        { income: '2', adjustForInflation: true },
      ])
    );
    const allOff = parseJobs(
      jobsFormData([
        { income: '1', adjustForInflation: false },
        { income: '2', adjustForInflation: false },
      ])
    );

    expect(allOn.map((job) => job.adjustForInflation)).toEqual([true, true]);
    expect(allOff.map((job) => job.adjustForInflation)).toEqual([false, false]);
  });
});
