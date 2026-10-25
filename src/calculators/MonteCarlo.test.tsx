import { parseConfidence, parseJobs, parseLifeEvents, parseRetirementMode } from './MonteCarlo';

const jobsFormData = (
  jobs: Array<{ income: string; adjustForInflation: boolean; atRetirement?: string }>
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
    formData.append('jobs[][startDate]', '');
    formData.append('jobs[][endDate]', '');
    if (job.atRetirement !== undefined) {
      formData.append('jobs[][atRetirement]', job.atRetirement);
    }
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

  test('reads each income source\'s "At retirement" option', () => {
    const jobs = parseJobs(
      jobsFormData([
        { income: '95000', adjustForInflation: true, atRetirement: 'stops' },
        { income: '30000', adjustForInflation: true, atRetirement: 'unaffected' },
      ])
    );

    expect(jobs.map((job) => job.atRetirement)).toEqual(['stops', 'unaffected']);
  });
});

describe('parseLifeEvents', () => {
  test('keeps each "At retirement" switch on its own life event', () => {
    const formData = new FormData();
    ['House', 'Insurance'].forEach((name) => {
      formData.append('life_events[][name]', name);
      formData.append('life_events[][balanceChange]', '-1000');
      formData.append('life_events[][monthlyExpensesChange]', '0');
      formData.append('life_events[][date]', '');
    });
    formData.append('life_events[][atRetirement]', '1');

    expect(parseLifeEvents(formData).map((event) => event.atRetirement)).toEqual([false, true]);
    expect(parseLifeEvents(formData).map((event) => event.balanceChange)).toEqual([-1000, -1000]);
  });
});

describe('retirement settings', () => {
  test('anything but "date" means retiring when ready', () => {
    expect(parseRetirementMode('date')).toBe('date');
    expect(parseRetirementMode('ready')).toBe('ready');
    expect(parseRetirementMode(null)).toBe('ready');
  });

  test('confidence stays within the slider range', () => {
    expect(parseConfidence('80')).toBe(80);
    expect(parseConfidence('120')).toBe(99);
    expect(parseConfidence('10')).toBe(50);
    expect(parseConfidence('')).toBe(90);
    expect(parseConfidence(undefined)).toBe(90);
  });
});
