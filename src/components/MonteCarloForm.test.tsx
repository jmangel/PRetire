/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   These tests check what the form submits and exports, which is keyed by each
   field's name attribute (the same names parseJobs reads), so they select
   fields by name rather than by label or role. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonteCarloForm from './MonteCarloForm';
import { parseJobs } from '../calculators/MonteCarlo';

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
