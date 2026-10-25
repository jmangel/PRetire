/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   These tests check what the form submits and exports, which is keyed by each
   field's name attribute (the same names parseJobs reads), so they select
   fields by name rather than by label or role. */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonteCarloForm from './MonteCarloForm';
import { JOB_FIELD_NAMES, parseJobs } from '../calculators/MonteCarlo';

// The page wraps the form in <fetcher.Form id="monte-carlo-form">; a plain
// form with that id is enough for these tests.
// The page shares the desired success rate between the form and the
// results; this stands in for it.
const FormWithSuccessRate = () => {
  const [confidence, setConfidence] = useState(90);
  return <MonteCarloForm fetcher={{ state: 'idle' } as any} confidence={confidence} setConfidence={setConfidence} />;
};

const renderForm = () => {
  const { container } = render(
    <form id="monte-carlo-form">
      <FormWithSuccessRate />
    </form>
  );
  const form = container.querySelector('form') as HTMLFormElement;
  const all = (field: string) =>
    Array.from(form.querySelectorAll<HTMLInputElement & HTMLSelectElement>(`[name="jobs[][${field}]"]`));
  return { form, all };
};

// jsdom has no object URLs; capture the exported file instead.
const captureExport = () => {
  let exported: Blob | undefined;
  (URL as any).createObjectURL = jest.fn((blob: Blob) => {
    exported = blob;
    return 'blob:settings';
  });
  (URL as any).revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return () =>
    new Promise<any>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(JSON.parse(String(reader.result)));
      reader.readAsText(exported as Blob);
    });
};

const importSettings = (form: HTMLFormElement, settings: object) => {
  const input = form.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([JSON.stringify(settings)], 'scenario.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
};

afterEach(() => jest.restoreAllMocks());

describe('MonteCarloForm and parseJobs', () => {
  test('each inflation switch stays with its own job in the submitted form', () => {
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Add an income source'));
    fireEvent.change(all('postTaxAnnualIncome')[0], { target: { value: '60000' } });
    fireEvent.change(all('postTaxAnnualIncome')[1], { target: { value: '25000' } });

    // Turn off the first job's switch: the browser then leaves it out of the
    // form data entirely, which used to shift the second job's setting.
    fireEvent.click(all('adjustForInflation')[0]);

    const jobs = parseJobs(new FormData(form));
    expect(jobs.map((job) => job.postTaxAnnualIncome)).toEqual([60000, 25000]);
    expect(jobs.map((job) => job.adjustForInflation)).toEqual([false, true]);
  });
});

describe('MonteCarloForm settings export and import', () => {
  // Export and import read the form by field name, so a JOB_FIELDS entry with
  // no input would be saved as "" and never restored.
  test('every job field has an input in the form', () => {
    const { all } = renderForm();
    const missing = JOB_FIELD_NAMES.filter((field) => all(field).length === 0);
    expect(missing).toEqual([]);
  });

  // Import already ignores unknown job keys; this keeps settings files saved
  // before the raise field was removed importing if that ever changes.
  test('a settings file with the removed raise field still imports', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    settings.jobs[0] = { ...settings.jobs[0], postTaxAnnualIncome: '42000', yearlyRaisePercentage: '3' };

    importSettings(form, settings);
    await waitFor(() => expect(all('postTaxAnnualIncome')[0].value).toBe('42000'));
    expect(screen.queryByText(/Unable to import settings/)).toBeNull();
  });

  test('inflation switches export as true/false and import back to their own jobs', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Add an income source'));
    await waitFor(() => expect(all('adjustForInflation')).toHaveLength(2));
    fireEvent.click(all('adjustForInflation')[0]);

    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    expect(settings.jobs.map((job: any) => job.adjustForInflation)).toEqual([false, true]);

    // Flip both switches, then import: each should go back to its saved state.
    fireEvent.click(all('adjustForInflation')[0]);
    fireEvent.click(all('adjustForInflation')[1]);
    importSettings(form, settings);
    await waitFor(() =>
      expect(all('adjustForInflation').map((input) => input.checked)).toEqual([false, true])
    );
  });

  test('"At retirement" survives exporting and importing', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.change(all('atRetirement')[0], { target: { value: 'unaffected' } });

    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    expect(settings.jobs[0].atRetirement).toBe('unaffected');

    fireEvent.change(all('atRetirement')[0], { target: { value: 'stops' } });
    importSettings(form, settings);
    await waitFor(() => expect(all('atRetirement')[0].value).toBe('unaffected'));
  });

  test('a settings file from before "At retirement" existed keeps running income on its own dates', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    delete settings.retirement;
    const { atRetirement, ...oldJob } = settings.jobs[0];
    settings.jobs = [
      { ...oldJob, postTaxAnnualIncome: '90000', endDate: '2042-07-01' },
      { ...oldJob, postTaxAnnualIncome: '26000', startDate: '2058-01-01', endDate: '' }, // Social Security
    ];

    importSettings(form, settings);
    await waitFor(() => expect(all('atRetirement')).toHaveLength(2));
    // The job retires on its old end date; Social Security keeps paying.
    expect(all('atRetirement').map((select) => select.value)).toEqual(['stops', 'unaffected']);
    expect(screen.getByLabelText('On a date:')).toBeChecked();
    expect(screen.getByLabelText('Retirement date')).toHaveValue('2042-07-01');
  });

  test('importing more jobs than rows adds rows and fills every field', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    settings.jobs = [
      { ...settings.jobs[0], postTaxAnnualIncome: '60000', endDate: '2040-07-01' },
      { ...settings.jobs[0], postTaxAnnualIncome: '20000', atRetirement: 'unaffected' },
    ];

    importSettings(form, settings);
    await waitFor(() => expect(all('postTaxAnnualIncome')).toHaveLength(2));
    expect(all('postTaxAnnualIncome').map((input) => input.value)).toEqual(['60000', '20000']);
    expect(all('endDate')[0].value).toBe('2040-07-01');
    expect(all('atRetirement').map((select) => select.value)).toEqual(['stops', 'unaffected']);
  });
});

describe('MonteCarloForm retirement settings', () => {
  test('new plans retire when ready, at 90% confidence', () => {
    const { form } = renderForm();
    const data = new FormData(form);

    expect(data.get('retirement[mode]')).toBe('ready');
    expect(data.get('retirement[confidence]')).toBe('90');
    expect(screen.getByLabelText('Retirement date')).toBeDisabled();
  });

  test('choosing a date enables the date field and submits it', () => {
    const { form } = renderForm();
    fireEvent.click(screen.getByLabelText('On a date:'));
    fireEvent.change(screen.getByLabelText('Retirement date'), { target: { value: '2041-03-01' } });

    const data = new FormData(form);
    expect(data.get('retirement[mode]')).toBe('date');
    expect(data.get('retirement[date]')).toBe('2041-03-01');
  });

  test('the retirement setting survives exporting and importing', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    fireEvent.click(screen.getByLabelText('On a date:'));
    fireEvent.change(screen.getByLabelText('Retirement date'), { target: { value: '2041-03-01' } });
    fireEvent.change(screen.getByLabelText('Desired success rate'), { target: { value: '80' } });

    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    expect(settings.retirement).toEqual({ mode: 'date', confidence: '80', date: '2041-03-01' });

    fireEvent.click(screen.getByLabelText("As soon as I'm ready"));
    fireEvent.change(screen.getByLabelText('Desired success rate'), { target: { value: '95' } });
    importSettings(form, settings);
    await waitFor(() => expect(screen.getByLabelText('On a date:')).toBeChecked());
    expect(screen.getByLabelText('Desired success rate')).toHaveValue(80);
    expect(screen.getByLabelText('Retirement date')).toHaveValue('2041-03-01');
  });

  test('an older file retires on its last work income end date, which is then cleared', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    delete settings.retirement;
    settings.jobs = [
      { ...settings.jobs[0], postTaxAnnualIncome: '60000', endDate: '2031-07-01' }, // job change
      { ...settings.jobs[0], postTaxAnnualIncome: '80000', startDate: '2031-07-01', endDate: '2044-07-01' },
      { ...settings.jobs[0], postTaxAnnualIncome: '20000', endDate: '2044-07-01', atRetirement: 'unaffected' },
    ];

    importSettings(form, settings);
    await waitFor(() => expect(all('postTaxAnnualIncome')).toHaveLength(3));
    expect(screen.getByLabelText('On a date:')).toBeChecked();
    expect(screen.getByLabelText('Retirement date')).toHaveValue('2044-07-01');
    expect(all('endDate').map((input) => input.value)).toEqual(['2031-07-01', '', '2044-07-01']);
  });

  test('an older file with open-ended work income retires when ready', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    fireEvent.click(screen.getByLabelText('On a date:'));
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    delete settings.retirement;
    settings.jobs = [{ ...settings.jobs[0], postTaxAnnualIncome: '60000', endDate: '' }];

    importSettings(form, settings);
    await waitFor(() => expect(screen.getByLabelText("As soon as I'm ready")).toBeChecked());
  });

  test('"At retirement" life events submit with their own row and survive export and import', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    fireEvent.click(screen.getByText('Add a life event'));
    const switches = () => screen.getAllByLabelText('At retirement') as HTMLInputElement[];
    await waitFor(() => expect(switches()).toHaveLength(2));
    fireEvent.click(switches()[1]);

    expect(new FormData(form).getAll('life_events[][atRetirement]')).toEqual(['1']);
    const dates = form.querySelectorAll<HTMLInputElement>('[name="life_events[][date]"]');
    expect(dates[1].readOnly).toBe(true);
    // Read-only, not disabled, so every row still submits a date.
    expect(new FormData(form).getAll('life_events[][date]')).toHaveLength(2);

    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    expect(settings.life_events.map((event: any) => event.atRetirement)).toEqual([false, true]);

    fireEvent.click(switches()[1]);
    importSettings(form, settings);
    await waitFor(() => expect(switches().map((input) => input.checked)).toEqual([false, true]));
  });
});

describe('MonteCarloForm fixed-date plans', () => {
  test("can't run without a retirement date", () => {
    renderForm();
    const run = screen.getByRole('button', { name: 'Run Simulation' });
    expect(run).toBeEnabled();

    fireEvent.click(screen.getByLabelText('On a date:'));
    expect(run).toBeDisabled();
    expect(screen.getByText(/Pick a retirement date, or choose/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Retirement date'), { target: { value: '2041-03-01' } });
    expect(run).toBeEnabled();
  });

  test('an imported fixed-date plan with its date can run', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    settings.retirement = { mode: 'date', confidence: '90', date: '2041-03-01' };

    importSettings(form, settings);
    await waitFor(() => expect(screen.getByLabelText('On a date:')).toBeChecked());
    expect(screen.getByRole('button', { name: 'Run Simulation' })).toBeEnabled();
  });
});

describe('MonteCarloForm desired success rate field', () => {
  test('submits the last valid rate while a new one is being typed, and shows it again on leaving', () => {
    const { form } = renderForm();
    const field = screen.getByLabelText('Desired success rate');

    fireEvent.change(field, { target: { value: '8' } }); // on the way to 85
    expect(new FormData(form).get('retirement[confidence]')).toBe('90');
    fireEvent.change(field, { target: { value: '85' } });
    expect(new FormData(form).get('retirement[confidence]')).toBe('85');

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(field).toHaveValue(85);
  });
});
