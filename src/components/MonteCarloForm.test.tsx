/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   These tests check what the form submits and exports, which is keyed by each
   field's name attribute (the same names parseJobs reads), so they select
   fields by name rather than by label or role. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonteCarloForm, { axisDollarFormatter, compactDollarFormatter } from './MonteCarloForm';
import { JOB_FIELD_NAMES, parseJobs } from '../calculators/MonteCarlo';

// The page wraps the form in <fetcher.Form id="monte-carlo-form">; a plain
// form with that id is enough for these tests.
const renderForm = () => {
  const { container } = render(
    <form id="monte-carlo-form">
      <MonteCarloForm fetcher={{ state: 'idle' } as any} />
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
  test('starts with a balance and expenses filled in, so a first run draws a real chart', () => {
    const { form } = renderForm();
    const data = new FormData(form);
    expect(data.get('startingBalance')).toBe('1000000');
    expect(data.get('monthlyExpenses')).toBe('-4000');
  });

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

  test('a settings file from before "At retirement" existed imports as "Stops"', async () => {
    const readExport = captureExport();
    const { form, all } = renderForm();
    fireEvent.click(screen.getByText('Export settings'));
    const settings = await readExport();
    delete settings.jobs[0].atRetirement;

    fireEvent.change(all('atRetirement')[0], { target: { value: 'unaffected' } });
    importSettings(form, settings);
    await waitFor(() => expect(all('atRetirement')[0].value).toBe('stops'));
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

describe('dollar formatters', () => {
  test.each([
    [0, '$0'],
    [0.5, '$0.5'],
    [4, '$4'],
    [-4000, '-$4K'],
    [855782.5, '$856K'],
    [1455153418.05, '$1.46B'],
    [2.5e12, '$2.5T'],
  ])('compactDollarFormatter(%p) is %p', (value, label) => {
    expect(compactDollarFormatter(value)).toBe(label);
  });

  test.each([
    // A narrow range: three significant digits would give $1M, $1.03M, $1.05M...
    [[1000000, 1025000, 1050000, 1075000, 1100000], ['$1.000M', '$1.025M', '$1.050M', '$1.075M', '$1.100M']],
    [[0, 30e6, 60e6, 90e6, 120e6], ['$0', '$30M', '$60M', '$90M', '$120M']],
    [[0, 250000, 500000, 750000, 1000000], ['$0', '$0.25M', '$0.50M', '$0.75M', '$1.00M']],
    [[-500000, 0, 500000], ['-$500K', '$0', '$500K']],
    [[0, 1, 2, 3, 4], ['$0', '$1', '$2', '$3', '$4']],
  ])('axisDollarFormatter labels %p as %p', (ticks, labels) => {
    expect(ticks.map(axisDollarFormatter(ticks))).toEqual(labels);
  });
});
