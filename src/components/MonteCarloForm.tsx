import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Form, InputGroup, Nav, Row } from 'react-bootstrap';
import { FetcherWithComponents } from 'react-router-dom';
import HasManyRows from './HasManyRows';
import ScenarioBar from './ScenarioBar';
import { parseAtRetirement } from '../calculators/MonteCarloSimulation';
import { JOB_FIELD_NAMES, JOB_FIELDS, JobField } from '../calculators/MonteCarlo';
import {
  RestoreResult,
  SavedScenarios,
  loadScenarios,
  mergeScenarios,
  newScenarioId,
  requestPersistentStorage,
  scenariosFromBackup,
  storeScenarios,
  toBackup,
  STORAGE_KEY,
} from '../savedScenarios';

const NUM_SETTINGS_TABS = 4;

// One exported income source: switches are saved as booleans, every other
// field as text.
type JobSettings = {
  [K in Exclude<JobField, 'atRetirement'>]: typeof JOB_FIELDS[K] extends 'boolean' ? boolean : string;
} & {
  // Missing in settings files saved before this option existed.
  atRetirement?: string;
};

type MonteCarloSettings = {
  startingBalance: string;
  monthlyExpenses: string;
  endYear: string;
  jobs: JobSettings[];
  life_events: Array<{
    name: string;
    date: string;
    balanceChange: string;
    monthlyExpensesChange: string;
  }>;
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

/** Short dollar amounts for the graph, like $856K or $1.46B. */
export const compactDollarFormatter = (val: number) =>
  val.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });

const DOLLAR_UNITS: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/**
 * Labels for evenly spaced y-axis ticks. Every tick uses the largest tick's
 * unit and enough decimals to show the step between ticks, so neighboring
 * labels never round to the same text: $1.000M, $1.025M, $1.050M rather
 * than $1M, $1.03M, $1.05M.
 */
export const axisDollarFormatter = (ticks: number[]): ((val: number) => string) => {
  if (ticks.length < 2) return compactDollarFormatter;
  const largest = Math.max(...ticks.map(Math.abs));
  const [unit, suffix] = DOLLAR_UNITS.find(([size]) => largest >= size) ?? [1, ''];
  const step = Math.abs(ticks[1] - ticks[0]) / unit;
  let decimals = 0;
  while (decimals < 6 && Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-6) {
    decimals++;
  }
  return (val: number) =>
    val === 0
      ? '$0'
      : `${val < 0 ? '-' : ''}$${(Math.abs(val) / unit).toFixed(decimals)}${suffix}`;
};

/** Have the browser save `data` as a JSON file. */
const downloadJson = (fileName: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** One sentence saying what restoring a backup did, leaving out what didn't happen. */
const describeRestore = (
  { added, updated, keptNewer, unchanged, renamed }: Omit<RestoreResult<unknown>, 'saved'>,
  fileName: string
) => {
  const scenarios = (n: number) => `${n} scenario${n === 1 ? '' : 's'}`;
  const parts = [
    added > 0 && `added ${scenarios(added)}`,
    updated > 0 && `updated ${scenarios(updated)} with newer copies`,
    keptNewer > 0 && `kept ${scenarios(keptNewer)} saved here because ${keptNewer === 1 ? 'it was' : 'they were'} newer than the backup`,
    renamed > 0 && `added "(restored)" to ${renamed === 1 ? 'one name' : `${renamed} names`} another scenario already had`,
  ].filter(Boolean);
  if (parts.length > 0) return `From ${fileName}: ${parts.join('; ')}.`;
  return unchanged > 0
    ? `Everything in ${fileName} is already saved here.`
    : `Nothing to restore from ${fileName}: it has no saved scenarios.`;
};

const defaultAssetClasses = [
  // I basically used the most conservative stats I could find, ie. lowest
  // average annual return I saw online and highest standard deviation I saw
  {
    name: 'S&P 500 (starting estimates found online)',
    averageAnnualReturnPercentage: 0.099 * 100,
    standardDeviationPercentage: 0.197028 * 100,
    allocationPercentage: 1.0 * 100,
  },
  {
    name: 'US 10-yr Treasury Bonds (starting estimates found online)',
    averageAnnualReturnPercentage: 0.0466 * 100,
    standardDeviationPercentage: 0.077 * 100,
    allocationPercentage: 0.0 * 100,
  },
];

const AssetClassRow = ({
  isInflation,
  defaultName,
  defaultAverageAnnualReturnPercentage,
  defaultStandardDeviationPercentage,
  defaultAllocationPercentage,
}: {
  isInflation?: boolean;
  defaultName?: string;
  defaultAverageAnnualReturnPercentage?: number;
  defaultStandardDeviationPercentage?: number;
  defaultAllocationPercentage?: number;
}) => {
  const fieldNamePrefix = isInflation ? 'inflation' : 'asset_classes[]';
  return (
    <Row>
      {!isInflation && (
        <>
          <Col xs={12} sm={6} md={3} className="flex-grow-1">
            <Form.Group>
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="name"
                placeholder="Ticker/etc."
                name={`${fieldNamePrefix}[name]`}
                defaultValue={defaultName || ''}
              />
            </Form.Group>
          </Col>
          <Col xs={12} sm={6} md={3} className="flex-grow-1">
            <Form.Group>
              <Form.Label>Allocation Percentage</Form.Label>
              <InputGroup>
                <Form.Control
                  type="number"
                  step="any"
                  name={`${fieldNamePrefix}[allocationPercentage]`}
                  defaultValue={defaultAllocationPercentage || 0}
                  autoFocus
                />
                <InputGroup.Text>%</InputGroup.Text>
              </InputGroup>
            </Form.Group>
          </Col>
        </>
      )}
      <Col xs={12} sm={6} md={3} className="flex-grow-1">
        <Form.Group>
          <Form.Label>Average Annual Return</Form.Label>
          <InputGroup>
            <Form.Control
              type="number"
              step="any"
              name={`${fieldNamePrefix}[averageAnnualReturnPercentage]`}
              defaultValue={defaultAverageAnnualReturnPercentage || 0}
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          {!isInflation && (
            <Form.Text>
              (NOT accounting for inflation. Inflation will already be
              calculated separately from the investment gain.)
            </Form.Text>
          )}
        </Form.Group>
      </Col>
      <Col xs={12} sm={6} md={3} className="flex-grow-1">
        <Form.Group>
          <Form.Label>Standard Deviation</Form.Label>
          <InputGroup>
            <Form.Control
              type="number"
              step="any"
              name={`${fieldNamePrefix}[standardDeviationPercentage]`}
              defaultValue={defaultStandardDeviationPercentage || 0}
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
        </Form.Group>
      </Col>
    </Row>
  );
};

const isMonteCarloSettings = (settings: unknown): settings is MonteCarloSettings => {
  if (!settings || typeof settings !== 'object') return false;
  const candidate = settings as MonteCarloSettings;
  const hasArray = (value: unknown): value is unknown[] =>
    Array.isArray(value);
  if (!hasArray(candidate.jobs) || !hasArray(candidate.life_events)) return false;
  if (!hasArray(candidate.asset_classes)) return false;
  if (
    !candidate.inflation ||
    typeof candidate.inflation !== 'object' ||
    typeof candidate.inflation.averageAnnualReturnPercentage !== 'string' ||
    typeof candidate.inflation.standardDeviationPercentage !== 'string'
  ) {
    return false;
  }
  return true;
};

const MonteCarloForm = ({
  fetcher,
}: {
  fetcher: FetcherWithComponents<any>;
}) => {
  const running = fetcher.state === 'submitting';

  const [numJobs, setNumJobs] = useState(1);
  const [numLifeEvents, setNumLifeEvents] = useState(1);
  const [numAssetClasses, setNumAssetClasses] = useState(2);
  const [activeSettingsTab, setActiveSettingsTab] = useState(0);
  const [exportFileName, setExportFileName] = useState('pretire-montecarlo-settings');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const queuedImportSettings = useRef<MonteCarloSettings | null>(null);
  // Set when the settings being applied should run as soon as they're in the form.
  const runAfterFill = useRef(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarios<MonteCarloSettings>>(
    () => loadScenarios(isMonteCarloSettings)
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Another tab saved, renamed or deleted a scenario: show the same list here.
  // If the picked scenario is gone, nothing is picked anymore.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const latest = loadScenarios(isMonteCarloSettings);
      setSavedScenarios(latest);
      setSelectedScenarioId((id) =>
        latest.scenarios.some((scenario) => scenario.id === id) ? id : null
      );
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const collectRepeatedGroup = (
    groupName: string,
    fields: string[]
  ): Array<Record<string, string | boolean>> => {
    const valuesByField = fields.map((field) => {
      const elements = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          `[name="${groupName}[][${field}]"]`
        )
      );
      return elements.map((element) =>
        element.type === 'checkbox' ? element.checked : element.value
      );
    });

    const rowCount = Math.max(...valuesByField.map((arr) => arr.length), 0);
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const row: Record<string, string | boolean> = {};
      fields.forEach((field, fieldIndex) => {
        row[field] = valuesByField[fieldIndex][rowIndex] ?? '';
      });
      return row;
    });
  };

  const getSettingValue = (name: string) => {
    const element = document.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[name="${name}"]`);
    if (!element) {
      return '';
    }
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      return element.checked ? 'on' : 'off';
    }
    return element.value;
  };

  const buildSettings = (): MonteCarloSettings | null => {
    const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
    if (!form) {
      return null;
    }

    return {
      startingBalance: getSettingValue('startingBalance'),
      monthlyExpenses: getSettingValue('monthlyExpenses'),
      endYear: getSettingValue('endYear'),
      jobs: collectRepeatedGroup('jobs', JOB_FIELD_NAMES).map((row) => ({
        ...(Object.fromEntries(
          JOB_FIELD_NAMES.map((field) => [
            field,
            JOB_FIELDS[field] === 'boolean' ? Boolean(row[field]) : String(row[field]),
          ])
        ) as JobSettings),
        atRetirement: parseAtRetirement(String(row.atRetirement)),
      })),
      life_events: collectRepeatedGroup('life_events', [
        'name',
        'date',
        'balanceChange',
        'monthlyExpensesChange',
      ]).map((row) => ({
        name: String(row.name),
        date: String(row.date),
        balanceChange: String(row.balanceChange),
        monthlyExpensesChange: String(row.monthlyExpensesChange),
      })),
      inflation: {
        averageAnnualReturnPercentage: getSettingValue(
          'inflation[averageAnnualReturnPercentage]'
        ),
        standardDeviationPercentage: getSettingValue(
          'inflation[standardDeviationPercentage]'
        ),
      },
      asset_classes: collectRepeatedGroup('asset_classes', [
        'name',
        'allocationPercentage',
        'averageAnnualReturnPercentage',
        'standardDeviationPercentage',
      ]).map((row) => ({
        name: String(row.name),
        allocationPercentage: String(row.allocationPercentage),
        averageAnnualReturnPercentage: String(
          row.averageAnnualReturnPercentage
        ),
        standardDeviationPercentage: String(row.standardDeviationPercentage),
      })),
    };
  };

  const setFieldValue = (
    form: HTMLFormElement,
    name: string,
    value: string | boolean
  ) => {
    const elements = Array.from(
      form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(`[name="${name}"]`)
    );
    elements.forEach((element) => {
      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        element.checked = Boolean(value);
      } else {
        element.value = String(value ?? '');
      }
    });
  };

  const setRepeatedGroup = (
    form: HTMLFormElement,
    groupName: string,
    fields: string[],
    values: Array<Record<string, string | boolean>>
  ) => {
    fields.forEach((field) => {
      const elements = Array.from(
        form.querySelectorAll<HTMLInputElement>(
          `[name="${groupName}[][${field}]"]`
        )
      );
      elements.forEach((element, index) => {
        const value = values[index]?.[field] ?? '';
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = String(value ?? '');
        }
      });
    });
  };

  // Fill every form field from imported settings. Used both when the row
  // counts already match and after new rows render.
  const fillForm = (form: HTMLFormElement, settings: MonteCarloSettings) => {
    setRepeatedGroup(form, 'jobs', JOB_FIELD_NAMES,
      settings.jobs.map((job) => ({
        ...job,
        atRetirement: parseAtRetirement(job.atRetirement),
      })));

    setRepeatedGroup(form, 'life_events', [
      'name',
      'date',
      'balanceChange',
      'monthlyExpensesChange',
    ],
    settings.life_events);

    setRepeatedGroup(form, 'asset_classes', [
      'name',
      'allocationPercentage',
      'averageAnnualReturnPercentage',
      'standardDeviationPercentage',
    ],
    settings.asset_classes);

    setFieldValue(form, 'startingBalance', settings.startingBalance);
    setFieldValue(form, 'monthlyExpenses', settings.monthlyExpenses);
    setFieldValue(form, 'endYear', settings.endYear);
    setFieldValue(
      form,
      'inflation[averageAnnualReturnPercentage]',
      settings.inflation.averageAnnualReturnPercentage
    );
    setFieldValue(
      form,
      'inflation[standardDeviationPercentage]',
      settings.inflation.standardDeviationPercentage
    );
  };

  // Fill the form, then run the simulation if the settings asked for it.
  const fillFormAndMaybeRun = (form: HTMLFormElement, settings: MonteCarloSettings) => {
    fillForm(form, settings);
    if (runAfterFill.current) {
      runAfterFill.current = false;
      fetcher.submit(form);
    }
  };

  const applySettings = (settings: MonteCarloSettings, { run = false } = {}) => {
    const targetJobs = Math.max(settings.jobs.length, 1);
    const targetLifeEvents = Math.max(settings.life_events.length, 1);
    const targetAssetClasses = Math.max(settings.asset_classes.length, 1);
    const needsRowUpdate =
      targetJobs !== numJobs ||
      targetLifeEvents !== numLifeEvents ||
      targetAssetClasses !== numAssetClasses;

    queuedImportSettings.current = settings;
    runAfterFill.current = run;
    setNumJobs(targetJobs);
    setNumLifeEvents(targetLifeEvents);
    setNumAssetClasses(targetAssetClasses);

    if (!needsRowUpdate) {
      const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
      if (form) {
        fillFormAndMaybeRun(form, settings);
      }
      queuedImportSettings.current = null;
    }
  };

  useEffect(() => {
    if (!queuedImportSettings.current) {
      return;
    }

    const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
    if (!form) {
      return;
    }

    fillFormAndMaybeRun(form, queuedImportSettings.current);
    queuedImportSettings.current = null;
    // Runs only after the row counts change, once the new rows exist. The
    // settings come from a ref, so fillFormAndMaybeRun doesn't need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numJobs, numLifeEvents, numAssetClasses]);

  const getExportFileName = () => {
    const normalized = exportFileName
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '-');

    const baseName = normalized || 'pretire-montecarlo-settings';
    return baseName.toLowerCase().endsWith('.json')
      ? baseName
      : `${baseName}.json`;
  };

  const handleExportSettings = () => {
    const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
    const settings = form ? buildSettings() : null;
    if (!settings) {
      setImportMessage(null);
      setImportError('Cannot export settings: form not available.');
      return;
    }

    const fileName = getExportFileName();
    downloadJson(fileName, settings);

    setImportError(null);
    setImportMessage(`Simulation settings exported locally as ${fileName}.`);
  };

  // Saved scenarios only change through here, so what's shown always matches
  // what's stored. A change given as a function is applied to what's in
  // storage now, not to this tab's copy, so it can't undo what another tab
  // saved since this one last read. Returns false, with an error shown, if
  // the browser refused.
  const updateSavedScenarios = (
    change:
      | SavedScenarios<MonteCarloSettings>
      | ((current: SavedScenarios<MonteCarloSettings>) => SavedScenarios<MonteCarloSettings>)
  ) => {
    const next = typeof change === 'function' ? change(loadScenarios(isMonteCarloSettings)) : change;
    if (!storeScenarios(next)) {
      setImportMessage(null);
      setImportError("Couldn't save: this browser is blocking or out of storage for this site.");
      return false;
    }
    setSavedScenarios(next);
    return true;
  };

  const showMessage = (message: string) => {
    setImportError(null);
    setImportMessage(message);
  };

  const selectedScenario = savedScenarios.scenarios.find(
    (scenario) => scenario.id === selectedScenarioId
  );

  const handleSelectScenario = (id: string | null) => {
    setSelectedScenarioId(id);
    const scenario = savedScenarios.scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return;
    setExportFileName(scenario.name);
    applySettings(scenario.settings, { run: true });
    showMessage(`Loaded "${scenario.name}".`);
  };

  const handleSaveScenario = () => {
    const settings = buildSettings();
    if (!selectedScenario || !settings) return;
    const saved = { ...selectedScenario, settings, savedAt: new Date().toISOString() };
    // If another tab deleted it meanwhile, saving puts it back.
    const updated = updateSavedScenarios((current) => ({
      ...current,
      scenarios: current.scenarios.some((scenario) => scenario.id === saved.id)
        ? current.scenarios.map((scenario) => (scenario.id === saved.id ? saved : scenario))
        : [...current.scenarios, saved],
    }));
    if (updated) showMessage(`Saved "${saved.name}".`);
  };

  const handleSaveScenarioAs = (name: string) => {
    const settings = buildSettings();
    if (!settings) return;
    const saved = { id: newScenarioId(), name, savedAt: new Date().toISOString(), settings };
    const updated = updateSavedScenarios((current) => ({
      ...current,
      scenarios: [...current.scenarios, saved],
    }));
    if (!updated) return;
    requestPersistentStorage();
    setSelectedScenarioId(saved.id);
    setExportFileName(name);
    showMessage(`Saved "${name}".`);
  };

  const handleRenameScenario = (name: string) => {
    if (!selectedScenario) return;
    const updated = updateSavedScenarios((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.id === selectedScenario.id ? { ...scenario, name } : scenario
      ),
    }));
    if (updated) showMessage(`Renamed "${selectedScenario.name}" to "${name}".`);
  };

  // Deleting leaves the form as it is, so the settings aren't lost if the
  // user wants to save them again.
  const handleDeleteScenario = () => {
    if (!selectedScenario) return;
    const updated = updateSavedScenarios((current) => ({
      ...current,
      scenarios: current.scenarios.filter((scenario) => scenario.id !== selectedScenario.id),
    }));
    if (!updated) return;
    setSelectedScenarioId(null);
    showMessage(`Deleted "${selectedScenario.name}".`);
  };

  const handleExportAllScenarios = () => {
    const now = new Date();
    const fileName = `pretire-scenarios-backup-${now.toISOString().slice(0, 10)}.json`;
    // Back up what's in storage now, which includes other tabs' saves.
    const current = loadScenarios(isMonteCarloSettings);
    downloadJson(fileName, toBackup(current));
    const exported = `Exported ${current.scenarios.length} saved scenario(s) as ${fileName}.`;
    const recorded = updateSavedScenarios((latest) => ({ ...latest, lastBackupAt: now.toISOString() }));
    if (recorded) {
      showMessage(`${exported} Import it to restore them.`);
    } else {
      // The file was still saved; only the "Last backed up" date wasn't.
      setImportMessage(null);
      setImportError(
        `${exported} Couldn't record the backup date: this browser is blocking or out of storage for this site.`
      );
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    setImportMessage(null);
    importInputRef.current?.click();
  };

  const handleImportFile = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result;
        const parsed = JSON.parse(String(content));
        const restored = scenariosFromBackup(parsed, isMonteCarloSettings);
        if (restored) {
          let result: RestoreResult<MonteCarloSettings> | undefined;
          let replacedPicked: string | undefined;
          const stored = updateSavedScenarios((current) => {
            result = mergeScenarios(current, restored);
            // If the backup's newer copy replaced the picked scenario, the form
            // still shows the old settings, and Save would write them over
            // the restored copy. So it's unpicked until the user picks it again.
            const before = current.scenarios.find((scenario) => scenario.id === selectedScenarioId);
            const after = result.saved.scenarios.find((scenario) => scenario.id === selectedScenarioId);
            if (before && after && after.savedAt !== before.savedAt) replacedPicked = after.name;
            return result.saved;
          });
          if (stored && result) {
            if (replacedPicked) setSelectedScenarioId(null);
            showMessage(
              describeRestore(result, file.name) +
                (replacedPicked
                  ? ` The backup had a newer copy of "${replacedPicked}", so it's no longer picked; pick it again to load the restored settings.`
                  : '')
            );
          }
          return;
        }
        if (!isMonteCarloSettings(parsed)) {
          throw new Error('Invalid simulation settings file.');
        }
        applySettings(parsed);

        const importedFileName = file.name.replace(/\.[^.]+$/, '');
        setExportFileName(importedFileName || 'pretire-montecarlo-settings');

        setImportMessage(
          `Simulation settings imported successfully from ${file.name}.`
        );
        setImportError(null);
      } catch (error) {
        console.error(error);
        setImportError(
          'Unable to import settings. Please select a valid PREtire JSON file.'
        );
        setImportMessage(null);
      }
    };
    reader.onerror = () => {
      setImportError('Unable to read the selected file.');
      setImportMessage(null);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <>
      <ScenarioBar
        scenarios={savedScenarios.scenarios}
        selectedId={selectedScenarioId}
        lastBackupAt={savedScenarios.lastBackupAt}
        onSelect={handleSelectScenario}
        onSave={handleSaveScenario}
        onSaveAs={handleSaveScenarioAs}
        onRename={handleRenameScenario}
        onDelete={handleDeleteScenario}
        onExportAll={handleExportAllScenarios}
      />

      <Card border="secondary" className="m-2 bg-light">
        <Card.Header>
          <Nav
            variant="tabs"
            defaultActiveKey="#first"
            activeKey={activeSettingsTab}
          >
            <Nav.Item>
              <Nav.Link onClick={() => setActiveSettingsTab(0)} eventKey={0}>
                Basic Settings
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link onClick={() => setActiveSettingsTab(1)} eventKey={1}>
                Income
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link onClick={() => setActiveSettingsTab(2)} eventKey={2}>
                Life Events
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link onClick={() => setActiveSettingsTab(3)} eventKey={3}>
                Market Conditions
              </Nav.Link>
            </Nav.Item>
          </Nav>
        </Card.Header>
        <Card.Body>
          {/* Basic Settings */}
          <Row className={activeSettingsTab === 0 ? '' : 'd-none'}>
            <Col xs={12} sm={4}>
              <Form.Group>
                <Form.Label>Starting Balance</Form.Label>
                <InputGroup>
                  <InputGroup.Text>$</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="any"
                    name="startingBalance"
                    defaultValue={1000000}
                  />
                </InputGroup>
              </Form.Group>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Group>
                <Form.Label>Manual Monthly Expenses</Form.Label>
                <InputGroup>
                  <InputGroup.Text>$</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="any"
                    name="monthlyExpenses"
                    defaultValue={-4000}
                  />
                </InputGroup>
                <Form.Text className="text-muted">
                  Should usually be negative
                </Form.Text>
              </Form.Group>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Group>
                <Form.Label>Ending Year</Form.Label>
                <InputGroup>
                  <Form.Control
                    type="number"
                    step={1}
                    name="endYear"
                    defaultValue={2100}
                  />
                </InputGroup>
              </Form.Group>
            </Col>
          </Row>

          {/* Jobs/Income Sources */}
          <div className={activeSettingsTab === 1 ? '' : 'd-none'}>
            <HasManyRows
              numRows={numJobs}
              setNumRows={setNumJobs}
              buttonText="Add an income source"
              rowComponent={(index) => (
                <Row key={`income-source-row-${index}`}>
                  <Col xs={12} sm={6} md={6} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>Name</Form.Label>
                      <Form.Control
                        type="name"
                        placeholder="Job name"
                        name="jobs[][name]"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6} md={6} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>
                        Yearly Income (in today's dollars)
                      </Form.Label>
                      <InputGroup>
                        <InputGroup.Text>$</InputGroup.Text>
                        <Form.Control
                          type="number"
                          step="any"
                          name="jobs[][postTaxAnnualIncome]"
                          placeholder="10000"
                          autoFocus
                        />
                      </InputGroup>
                      <Form.Text>(post-tax)</Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={6} sm={6} md={3} lg={2}>
                    <Form.Group>
                      <Form.Check
                        type="switch"
                        name="jobs[][adjustForInflation]"
                        // Unchecked boxes are left out of FormData entirely,
                        // so the row index is submitted as the value to keep
                        // each toggle attached to the right job.
                        value={String(index)}
                        defaultChecked
                        label="Adjust for inflation"
                      />
                      <Form.Text className="text-muted">
                        Increase income each year by the inflation amount
                        entered, <strong>starting immediately</strong>
                      </Form.Text>
                    </Form.Group>
                  </Col>

                  <Col xs={12} sm={6} md={3} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>Start Date</Form.Label>
                      <InputGroup>
                        <Form.Control type="date" name="jobs[][startDate]" />
                      </InputGroup>
                      <Form.Text className="text-muted">
                        (leave empty if already started)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6} md={3} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>End Date</Form.Label>
                      <InputGroup>
                        <Form.Control type="date" name="jobs[][endDate]" />
                      </InputGroup>
                      <Form.Text className="text-muted">
                        (leave empty if you'll work to the grave; income is prorated, so
                        this is your first day not working)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6} md={3} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>At retirement, this income</Form.Label>
                      <Form.Select name="jobs[][atRetirement]" defaultValue="stops">
                        <option value="stops">Stops</option>
                        <option value="unaffected">Keeps its own dates</option>
                      </Form.Select>
                      <Form.Text className="text-muted">
                        Use "Keeps its own dates" for Social Security,
                        pensions, or rental income
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              )}
            />
          </div>

          {/* Life Events */}
          <div className={activeSettingsTab === 2 ? '' : 'd-none'}>
            <HasManyRows
              numRows={numLifeEvents}
              setNumRows={setNumLifeEvents}
              buttonText="Add a life event"
              rowComponent={(index) => (
                <Row key={`life-event-row-${index}`}>
                  <Col xs={12} sm={6} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>Name</Form.Label>
                      <Form.Control
                        type="name"
                        placeholder="Name"
                        name="life_events[][name]"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>Date</Form.Label>
                      <InputGroup>
                        <Form.Control
                          type="date"
                          name="life_events[][date]"
                          autoFocus
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>
                  <Col xs={12} lg={4} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>
                        Change In Balance (in today's dollars)
                      </Form.Label>
                      <InputGroup>
                        <InputGroup.Text>$</InputGroup.Text>
                        <Form.Control
                          type="number"
                          step="any"
                          name="life_events[][balanceChange]"
                          defaultValue={0}
                        />
                      </InputGroup>
                      <Form.Text>
                        (ie., if you will spend $100,000 on a house, enter
                        -100,000)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={12} lg={4} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>
                        Change In Monthly Expenses (in today's dollars)
                      </Form.Label>
                      <InputGroup>
                        <InputGroup.Text>$</InputGroup.Text>
                        <Form.Control
                          type="number"
                          step="any"
                          name="life_events[][monthlyExpensesChange]"
                          defaultValue={0}
                        />
                      </InputGroup>
                      <Form.Text>
                        (Positive numbers mean expenses get smaller. ie., if you
                        expect to stop paying your mortgage of $2,000/month,
                        enter 2,000)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              )}
            />
          </div>

          {/* Market Conditions (Inflation + Asset Classes) */}
          <div className={activeSettingsTab === 3 ? '' : 'd-none'}>
            <h5>Inflation</h5>
            <AssetClassRow
              isInflation
              defaultAverageAnnualReturnPercentage={2.9}
              defaultStandardDeviationPercentage={0.011343 * 100}
            />
            <hr />

            {/* Asset Classes */}
            <h5>Asset Allocation</h5>
            <HasManyRows
              numRows={numAssetClasses}
              setNumRows={setNumAssetClasses}
              buttonText="Add an asset class"
              rowComponent={(index) => (
                <AssetClassRow
                  key={`asset-class-row-${index}`}
                  defaultName={defaultAssetClasses[index]?.name || ''}
                  defaultAverageAnnualReturnPercentage={
                    defaultAssetClasses[index]?.averageAnnualReturnPercentage ||
                    0.1 * 100
                  }
                  defaultStandardDeviationPercentage={
                    defaultAssetClasses[index]?.standardDeviationPercentage ||
                    0.2 * 100
                  }
                  defaultAllocationPercentage={
                    defaultAssetClasses[index]?.allocationPercentage || 0
                  }
                />
              )}
            />
          </div>
        </Card.Body>
      </Card>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      <Row className="m-2 gy-2 align-items-center">
        <Col xs={12} md={4}>
          <Form.Group>
            <Form.Label>Export filename</Form.Label>
            <Form.Control
              type="text"
              value={exportFileName}
              placeholder="pretire-montecarlo-settings"
              onChange={(event) => setExportFileName(event.target.value)}
            />
            <Form.Text className="text-muted">
              The downloaded file name will be saved locally with a .json
              extension.
            </Form.Text>
          </Form.Group>
        </Col>
        <Col xs={12} md="auto">
          <Button variant="secondary" onClick={handleExportSettings}>
            Export settings
          </Button>
        </Col>
        <Col xs={12} md="auto">
          <Button variant="secondary" onClick={handleImportClick}>
            Import settings
          </Button>
        </Col>
        <Col xs={12} md="auto">
          <Form.Text className="text-muted">
            Export or import one scenario as a file, or import a backup of
            all saved scenarios. Nothing is stored in the cloud.
          </Form.Text>
        </Col>
      </Row>

      {importMessage && (
        <Row className="m-2">
          <Col>
            <div className="text-success">{importMessage}</div>
          </Col>
        </Row>
      )}
      {importError && (
        <Row className="m-2">
          <Col>
            <div className="text-danger">{importError}</div>
          </Col>
        </Row>
      )}

      <Row className="m-2">
        {activeSettingsTab < NUM_SETTINGS_TABS - 1 && (
          <Col xs="auto">
            <Button
              variant="outline-primary"
              onClick={() =>
                setActiveSettingsTab((prev) => (prev + 1) % NUM_SETTINGS_TABS)
              }
            >
              {'Next Settings'}
            </Button>
          </Col>
        )}
        <Col>
          <Button variant="primary" type="submit" disabled={running}>
            {running ? 'Running, please wait' : 'Run Simulation'}
          </Button>
        </Col>
      </Row>
    </>
  );
};

export default MonteCarloForm;
