/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   These tests check what the form submits and exports, which is keyed by each
   field's name attribute (the same names parseJobs reads), so they select
   fields by name rather than by label or role. */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonteCarloForm, { axisDollarFormatter, compactDollarFormatter } from './MonteCarloForm';
import { JOB_FIELD_NAMES, parseJobs } from '../calculators/MonteCarlo';

// The page wraps the form in <fetcher.Form id="monte-carlo-form">; a plain
// form with that id is enough for these tests.
// The page shares the desired success rate between the form and the
// results; this stands in for it.
const FormWithSuccessRate = ({ submit }: { submit?: jest.Mock }) => {
  const [confidence, setConfidence] = useState(90);
  return (
    <MonteCarloForm fetcher={{ state: 'idle', submit } as any} confidence={confidence} setConfidence={setConfidence} />
  );
};

const renderForm = () => {
  const submit = jest.fn();
  const { container, unmount } = render(
    <form id="monte-carlo-form">
      <FormWithSuccessRate submit={submit} />
    </form>
  );
  const form = container.querySelector('form') as HTMLFormElement;
  const all = (field: string) =>
    Array.from(form.querySelectorAll<HTMLInputElement & HTMLSelectElement>(`[name="jobs[][${field}]"]`));
  return { form, all, submit, unmount };
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

afterEach(() => {
  jest.restoreAllMocks();
  window.localStorage.clear();
});

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

describe('MonteCarloForm saved scenarios', () => {
  const field = (form: HTMLFormElement, name: string) =>
    form.querySelector(`[name="${name}"]`) as HTMLInputElement;
  const scenarioSelect = () => screen.getByLabelText('Saved scenarios') as HTMLSelectElement;
  const optionNames = () => Array.from(scenarioSelect().options).slice(1).map((option) => option.text);

  // Save as new opens a dialog with a name and tags.
  const saveAs = (name: string, tags: string[] = []) => {
    fireEvent.click(screen.getByText('Save as new…'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
    tags.forEach((tag) => addTagText(tag));
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
  };
  const tagInput = () => screen.getByLabelText('Tags');
  // Typing a whole tag and pressing Enter adds it (the top suggestion is that tag).
  const addTagText = (text: string) => {
    fireEvent.change(tagInput(), { target: { value: text } });
    fireEvent.keyDown(tagInput(), { key: 'Enter' });
  };


  test('saves the form under a name, in this browser only', () => {
    const { form } = renderForm();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '750000' } });
    saveAs('Married in Austin');

    expect(optionNames()).toEqual(['Married in Austin']);
    expect(scenarioSelect().selectedOptions[0].text).toBe('Married in Austin');
    const stored = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!);
    expect(stored.scenarios[0].settings.startingBalance).toBe('750000');
  });

  test('Enter in the name field saves the scenario instead of running the simulation', () => {
    renderForm();
    fireEvent.click(screen.getByText('Save as new…'));
    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Single' } });

    // Enter's default in a form field is submitting the form; false means
    // that was prevented.
    expect(fireEvent.keyDown(nameInput, { key: 'Enter' })).toBe(false);
    expect(optionNames()).toEqual(['Single']);
  });

  test('picking a scenario fills the form and runs it', async () => {
    const { form, submit } = renderForm();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '500000' } });
    saveAs('Lean');
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '900000' } });
    saveAs('Comfortable');

    fireEvent.change(scenarioSelect(), { target: { value: scenarioSelect().options[1].value } });

    expect(field(form, 'startingBalance').value).toBe('500000');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(form);
  });

  test("a picked scenario runs with its own retirement setting and success rate", async () => {
    const { form, submit } = renderForm();
    fireEvent.click(screen.getByLabelText('On a date:'));
    fireEvent.change(screen.getByLabelText('Retirement date'), { target: { value: '2041-03-01' } });
    fireEvent.change(screen.getByLabelText('Desired success rate'), { target: { value: '80' } });
    saveAs('Fixed date');
    fireEvent.click(screen.getByLabelText("As soon as I'm ready"));
    fireEvent.change(screen.getByLabelText('Desired success rate'), { target: { value: '95' } });

    let submitted: FormData | undefined;
    submit.mockImplementation(() => {
      submitted = new FormData(form);
    });
    fireEvent.change(scenarioSelect(), { target: { value: scenarioSelect().options[1].value } });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submitted!.get('retirement[mode]')).toBe('date');
    expect(submitted!.get('retirement[date]')).toBe('2041-03-01');
    expect(submitted!.get('retirement[confidence]')).toBe('80');
  });

  test('a scenario with more income sources runs only once its rows are filled', async () => {
    const view = renderForm();
    fireEvent.click(screen.getByText('Add an income source'));
    await waitFor(() => expect(view.all('postTaxAnnualIncome')).toHaveLength(2));
    fireEvent.change(view.all('postTaxAnnualIncome')[1], { target: { value: '25000' } });
    saveAs('Two jobs');
    view.unmount();

    // A fresh page has one income row.
    const { all, submit } = renderForm();
    expect(all('postTaxAnnualIncome')).toHaveLength(1);

    let incomesWhenRun: string[] = [];
    submit.mockImplementation(() => {
      incomesWhenRun = all('postTaxAnnualIncome').map((input) => input.value);
    });
    fireEvent.change(scenarioSelect(), { target: { value: scenarioSelect().options[1].value } });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(incomesWhenRun).toHaveLength(2);
    expect(incomesWhenRun[1]).toBe('25000');
  });

  test("shows what the scenario bar did right under it", () => {
    renderForm();
    saveAs('Near the bar');
    expect(screen.getByRole('status')).toHaveTextContent('Saved "Near the bar".');
  });

  test('the export file name follows a rename, so deleting afterwards still resets it', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderForm();
    saveAs('Old name');
    const exportName = screen.getByPlaceholderText('pretire-montecarlo-settings') as HTMLInputElement;
    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByPlaceholderText('Scenario name'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(exportName.value).toBe('New name');
    fireEvent.click(screen.getByText('Delete'));
    expect(exportName.value).toBe('pretire-montecarlo-settings');
  });

  test("deleting a scenario stops using its name for the export file", () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderForm();
    saveAs('Old plan');
    const exportName = screen.getByPlaceholderText('pretire-montecarlo-settings') as HTMLInputElement;
    expect(exportName.value).toBe('Old plan');
    fireEvent.click(screen.getByText('Delete'));
    expect(exportName.value).toBe('pretire-montecarlo-settings');
  });

  test('saves over, renames, and deletes the picked scenario', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { form } = renderForm();
    saveAs('Plan');
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    let stored = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!);
    expect(stored.scenarios).toHaveLength(1);
    expect(stored.scenarios[0].settings.startingBalance).toBe('123');

    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByPlaceholderText('Scenario name'), { target: { value: 'Plan B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(optionNames()).toEqual(['Plan B']);

    fireEvent.click(screen.getByText('Delete'));
    expect(optionNames()).toEqual([]);
    stored = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!);
    expect(stored.scenarios).toEqual([]);
    // The form keeps the deleted scenario's settings.
    expect(field(form, 'startingBalance').value).toBe('123');
  });

  // Settings as another tab would have saved them.
  const otherTabScenario = (id: string, name: string) => ({
    id,
    name,
    savedAt: '2026-10-01T00:00:00.000Z',
    settings: {
      startingBalance: '1', monthlyExpenses: '0', endYear: '2100', jobs: [], life_events: [],
      inflation: { averageAnnualReturnPercentage: '2', standardDeviationPercentage: '1' }, asset_classes: [],
    },
  });
  const storedNames = () =>
    JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!).scenarios.map((scenario: any) => scenario.name);

  test("saving here keeps what another tab saved since this tab opened", async () => {
    const readExport = captureExport();
    renderForm();
    // Another tab saves while this one still shows an empty list.
    window.localStorage.setItem(
      'pretire.savedScenarios.v1',
      JSON.stringify({ scenarios: [otherTabScenario('other', 'From the other tab')] })
    );

    saveAs('From this tab');
    expect(storedNames()).toEqual(['From the other tab', 'From this tab']);

    fireEvent.click(screen.getByText('Export all scenarios'));
    const backup = await readExport();
    expect(backup.scenarios.map((scenario: any) => scenario.name)).toEqual(['From the other tab', 'From this tab']);
    expect(storedNames()).toEqual(['From the other tab', 'From this tab']);
  });

  test('shows what another tab saves, and unpicks a scenario it deletes', () => {
    renderForm();
    saveAs('Mine');
    const mine = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!).scenarios[0];
    const otherTabWrites = (scenarios: unknown[]) => {
      window.localStorage.setItem('pretire.savedScenarios.v1', JSON.stringify({ scenarios }));
      fireEvent(window, new StorageEvent('storage', { key: 'pretire.savedScenarios.v1' }));
    };

    otherTabWrites([mine, otherTabScenario('other', 'From the other tab')]);
    expect(optionNames()).toEqual(['Mine', 'From the other tab']);
    expect(scenarioSelect().selectedOptions[0].text).toBe('Mine');

    otherTabWrites([otherTabScenario('other', 'From the other tab')]);
    expect(optionNames()).toEqual(['From the other tab']);
    expect(scenarioSelect().value).toBe('');
  });

  test("Save keeps a rename or tags another tab gave the scenario", () => {
    const { form } = renderForm();
    saveAs('Mine');
    const stored = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!);
    stored.scenarios[0] = {
      ...stored.scenarios[0],
      name: 'Renamed elsewhere',
      tags: { dimensions: { Household: 'Married' }, labels: [] },
    };
    window.localStorage.setItem('pretire.savedScenarios.v1', JSON.stringify(stored));

    fireEvent.change(field(form, 'startingBalance'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [saved] = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!).scenarios;
    expect(saved).toMatchObject({ name: 'Renamed elsewhere', tags: { dimensions: { Household: 'Married' } } });
    expect(saved.settings.startingBalance).toBe('42');
  });

  test('Save puts back a picked scenario that another tab deleted', () => {
    renderForm();
    saveAs('Keep me');
    window.localStorage.setItem('pretire.savedScenarios.v1', JSON.stringify({ scenarios: [] }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(storedNames()).toEqual(['Keep me']);
  });

  test('picking another scenario closes the name field instead of renaming it', () => {
    renderForm();
    saveAs('First');
    saveAs('Second');
    fireEvent.click(screen.getByText('Rename'));
    expect(screen.getByPlaceholderText('Scenario name')).toHaveValue('Second');

    fireEvent.change(scenarioSelect(), { target: { value: scenarioSelect().options[1].value } });
    expect(screen.queryByPlaceholderText('Scenario name')).toBeNull();
    expect(optionNames()).toEqual(['First', 'Second']);
  });

  test('a save the browser refuses shows an error and leaves the list as it was', () => {
    renderForm();
    saveAs('Kept');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    saveAs('Refused');
    expect(screen.getByText(/Couldn't save: this browser is blocking or out of storage/)).toBeInTheDocument();
    expect(optionNames()).toEqual(['Kept']);
  });

  test('export all says so when it could not record the backup date', async () => {
    const readExport = captureExport();
    renderForm();
    saveAs('Plan');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    fireEvent.click(screen.getByText('Export all scenarios'));
    await readExport();
    expect(screen.getByText(/Exported 1 saved scenario\(s\) as .*Couldn't record the backup date/)).toBeInTheDocument();
    expect(screen.queryByText(/Import it to restore them/)).toBeNull();
    expect(screen.getByText(/Last backed up: never/)).toBeInTheDocument();
  });

  test('declining the delete confirmation keeps the scenario', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    saveAs('Stay');
    fireEvent.click(screen.getByText('Delete'));
    expect(optionNames()).toEqual(['Stay']);
    expect(scenarioSelect().selectedOptions[0].text).toBe('Stay');
  });

  test('saved scenarios are there after a reload, with none picked', () => {
    renderForm();
    saveAs('Keeper');
    cleanup();

    renderForm();
    expect(optionNames()).toEqual(['Keeper']);
    expect(scenarioSelect().value).toBe('');
  });

  test('export all writes a backup that import restores', async () => {
    const readExport = captureExport();
    renderForm();
    saveAs('One');
    saveAs('Two');
    fireEvent.click(screen.getByText('Export all scenarios'));
    const backup = await readExport();
    expect(backup.scenarios.map((scenario: any) => scenario.name)).toEqual(['One', 'Two']);
    expect(screen.getByText(/Last backed up: (?!never)/)).toBeInTheDocument();

    // The browser clears the site's data; the next visit starts empty.
    cleanup();
    window.localStorage.clear();
    const { form } = renderForm();
    expect(optionNames()).toEqual([]);
    importSettings(form, backup);
    expect(await screen.findByText(/added 2 scenarios/)).toBeInTheDocument();
    expect(optionNames()).toEqual(['One', 'Two']);
    const stored = JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!);
    expect(stored.scenarios.map((scenario: any) => scenario.name)).toEqual(['One', 'Two']);
  });

  test('restoring a backup says what it did, and never doubles up names', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    saveAs('Lean');
    fireEvent.click(screen.getByText('Export all scenarios'));
    const backup = await readExport();

    importSettings(form, backup);
    expect(await screen.findByText(/Everything in scenario\.json is already saved here/)).toBeInTheDocument();

    // A different scenario with the same name, as if from another browser.
    importSettings(form, {
      ...backup,
      scenarios: [{ ...backup.scenarios[0], id: 'from-elsewhere' }],
    });
    expect(await screen.findByText(/added 1 scenario; added "\(restored\)" to one name/)).toBeInTheDocument();
    expect(optionNames()).toEqual(['Lean', 'Lean (restored)']);
  });

  test('restoring a newer copy of the picked scenario unpicks it, so Save cannot overwrite it', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '500000' } });
    saveAs('Plan');
    fireEvent.click(screen.getByText('Export all scenarios'));
    const backup = await readExport();
    // The backup's copy is newer, as if saved later in another browser.
    backup.scenarios[0] = {
      ...backup.scenarios[0],
      savedAt: '2099-01-01T00:00:00.000Z',
      settings: { ...backup.scenarios[0].settings, startingBalance: '777' },
    };

    importSettings(form, backup);
    expect(await screen.findByText(/newer copy of "Plan", so it's no longer picked/)).toBeInTheDocument();
    expect(scenarioSelect().value).toBe('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(field(form, 'startingBalance').value).toBe('500000');

    fireEvent.change(scenarioSelect(), { target: { value: scenarioSelect().options[1].value } });
    expect(field(form, 'startingBalance').value).toBe('777');
  });

  test('a restore the browser refuses shows an error and changes nothing', async () => {
    const readExport = captureExport();
    const { form } = renderForm();
    saveAs('Plan');
    fireEvent.click(screen.getByText('Export all scenarios'));
    const backup = await readExport();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    importSettings(form, { ...backup, scenarios: [{ ...backup.scenarios[0], id: 'elsewhere', name: 'New' }] });
    expect(await screen.findByText(/Couldn't save: this browser is blocking or out of storage/)).toBeInTheDocument();
    expect(optionNames()).toEqual(['Plan']);
  });
});

describe('MonteCarloForm scenario tags', () => {
  const field = (form: HTMLFormElement, name: string) =>
    form.querySelector(`[name="${name}"]`) as HTMLInputElement;
  const tagInput = () => screen.getByLabelText('Tags');
  const typeTag = (text: string) => fireEvent.change(tagInput(), { target: { value: text } });
  const pressEnter = () => fireEvent.keyDown(tagInput(), { key: 'Enter' });
  const openSaveAs = (name?: string) => {
    fireEvent.click(screen.getByText('Save as new…'));
    if (name) fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  };
  const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
  const stored = () => JSON.parse(window.localStorage.getItem('pretire.savedScenarios.v1')!).scenarios;
  const suggestionTexts = () => screen.queryAllByRole('option').map((option) => option.textContent);

  test('saves a new scenario with dimension tags and labels', () => {
    renderForm();
    openSaveAs('Austin, married');
    typeTag('Household: Married');
    pressEnter();
    typeTag('favorite');
    pressEnter();
    clickSave();

    expect(stored()[0]).toMatchObject({
      name: 'Austin, married',
      tags: { dimensions: { Household: 'Married' }, labels: ['favorite'] },
    });
  });

  test('Enter in the tag field adds the tag without saving or running anything', () => {
    renderForm();
    openSaveAs('Plan');
    typeTag('Household: Single');
    expect(pressEnter()).toBe(false);
    expect(screen.getByLabelText('Remove tag Household: Single')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(window.localStorage.getItem('pretire.savedScenarios.v1')).toBeNull();
  });

  test('suggests dimensions and values already in use', () => {
    renderForm();
    openSaveAs('First');
    typeTag('Household: Married');
    pressEnter();
    clickSave();

    openSaveAs('Second');
    // The new dialog starts from First's tags; clear them to start fresh.
    fireEvent.click(screen.getByLabelText('Remove tag Household: Married'));
    typeTag('hou');
    expect(suggestionTexts()).toContain('Household: …');
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Household: …' }));
    expect(tagInput()).toHaveValue('Household: ');
    typeTag('Household: m');
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Household: Married' }));
    expect(screen.getByLabelText('Remove tag Household: Married')).toBeInTheDocument();
    expect(tagInput()).toHaveValue('');
  });

  test("starts from the picked scenario's tags, and saves a tag that was typed but not added", () => {
    renderForm();
    openSaveAs('Base');
    typeTag('Location: Austin');
    pressEnter();
    clickSave();

    openSaveAs('Variant');
    expect(screen.getByText('Tags copied from "Base".')).toBeInTheDocument();
    typeTag('Household: Married');
    clickSave();
    expect(stored()[1].tags).toEqual({ dimensions: { Location: 'Austin', Household: 'Married' }, labels: [] });
  });

  test('removes tags with their buttons or Backspace', () => {
    renderForm();
    openSaveAs('Plan');
    typeTag('Household: Single');
    pressEnter();
    typeTag('Location: Austin');
    pressEnter();
    typeTag('idea');
    pressEnter();

    fireEvent.click(screen.getByLabelText('Remove tag Household: Single'));
    fireEvent.keyDown(tagInput(), { key: 'Backspace' });
    clickSave();
    expect(stored()[0].tags).toEqual({ dimensions: { Location: 'Austin' }, labels: [] });
  });

  test('says when the tags match another scenario, and lists how their settings differ', () => {
    const { form } = renderForm();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '500000' } });
    openSaveAs('Austin, married');
    typeTag('Household: Married');
    pressEnter();
    clickSave();

    fireEvent.change(field(form, 'startingBalance'), { target: { value: '900000' } });
    openSaveAs('Austin, married, bigger');
    expect(screen.getByText('Same tags as "Austin, married".')).toBeInTheDocument();
    expect(screen.getByText('Starting balance: $900,000 vs $500,000')).toBeInTheDocument();

    typeTag('Housing: Buy');
    pressEnter();
    expect(screen.queryByText(/Same tags as/)).toBeNull();
  });

  test("edits a saved scenario's tags, shown under the dropdown", () => {
    renderForm();
    openSaveAs('Plan');
    typeTag('Household: Single');
    pressEnter();
    clickSave();
    const firstSavedAt = stored()[0].savedAt;
    expect(screen.getByLabelText('Tags of Plan')).toHaveTextContent('Household: Single');

    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }));
    expect(screen.getByText('Edit tags for "Plan"')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).toBeNull();
    typeTag('Household: Married');
    pressEnter();
    typeTag('favorite');
    pressEnter();
    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));

    expect(stored()[0].tags).toEqual({ dimensions: { Household: 'Married' }, labels: ['favorite'] });
    expect(stored()[0].savedAt >= firstSavedAt).toBe(true);
    expect(screen.getByLabelText('Tags of Plan')).toHaveTextContent('Household: Married');
    expect(screen.getByRole('status')).toHaveTextContent('Saved the tags for "Plan".');
  });

  test('editing tags compares with other scenarios, not the one being edited', () => {
    const { form } = renderForm();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '100' } });
    openSaveAs('One');
    typeTag('Household: Single');
    pressEnter();
    clickSave();
    fireEvent.change(field(form, 'startingBalance'), { target: { value: '200' } });
    openSaveAs('Two');
    typeTag('Household: Married');
    pressEnter();
    clickSave();

    // Two is picked. Its own tags don't count as a match...
    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }));
    expect(screen.queryByText(/Same tags as/)).toBeNull();
    // ...but changing them to One's does, comparing the two scenarios' own settings.
    typeTag('Household: Single');
    pressEnter();
    expect(screen.getByText('Same tags as "One".')).toBeInTheDocument();
    expect(screen.getByText('Starting balance: $200 vs $100')).toBeInTheDocument();
  });

  test('removing every tag leaves the scenario untagged', () => {
    renderForm();
    openSaveAs('Plan');
    typeTag('idea');
    pressEnter();
    clickSave();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }));
    fireEvent.click(screen.getByLabelText('Remove tag idea'));
    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));
    expect(stored()[0].tags).toBeUndefined();
    expect(screen.getByLabelText('Tags of Plan')).toHaveTextContent('No tags');
  });

  test('Cancel saves nothing, and a name is needed to save', () => {
    renderForm();
    openSaveAs();
    expect(screen.getByRole('button', { name: 'Save scenario' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.localStorage.getItem('pretire.savedScenarios.v1')).toBeNull();
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
