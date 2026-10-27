import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Form, InputGroup, Nav, Row } from 'react-bootstrap';
import { FetcherWithComponents } from 'react-router-dom';
import HasManyRows from './HasManyRows';
import ScenarioBar from './ScenarioBar';
import { parseAtRetirement } from '../calculators/PlanInputs';
import {
  JOB_FIELD_NAMES,
  JOB_FIELDS,
  MAX_CONFIDENCE,
  MIN_CONFIDENCE,
  RetirementMode,
  parseConfidence,
  parseRetirementMode,
} from '../calculators/MonteCarlo';
import { JobSettings, MonteCarloSettings, migrateSettings } from '../calculators/Settings';
import ScenarioTagsDialog from './ScenarioTagsDialog';
import { describeDifferences } from '../settingsDifferences';
import { scenariosFromBackup } from '../savedScenarios';
import { downloadJson, useSavedScenarios } from './useSavedScenarios';

const NUM_SETTINGS_TABS = 4;

const LIFE_EVENT_FIELDS = ['name', 'date', 'balanceChange', 'monthlyExpensesChange'];

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

/**
 * The desired success rate's field. It edits the page's success rate, which
 * the results slider shares. While typing, the field can hold text that isn't
 * a valid rate yet (like "8" on the way to "85"); the rate only changes once
 * it is one, and the field shows the rate again when it loses focus.
 */
const SuccessRateField = ({
  confidence,
  setConfidence,
}: {
  confidence: number;
  setConfidence: (confidence: number) => void;
}) => {
  const [text, setText] = useState(String(confidence));
  // Follow changes made elsewhere, like the results slider or an import.
  useEffect(() => {
    setText((current) => (Number(current) === confidence ? current : String(confidence)));
  }, [confidence]);

  return (
    <Form.Control
      type="number"
      step={1}
      min={MIN_CONFIDENCE}
      max={MAX_CONFIDENCE}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const value = Number(event.target.value);
        if (event.target.value !== '' && value >= MIN_CONFIDENCE && value <= MAX_CONFIDENCE) {
          setConfidence(parseConfidence(value));
        }
      }}
      onBlur={() => setText(String(confidence))}
    />
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
  confidence,
  setConfidence,
}: {
  fetcher: FetcherWithComponents<any>;
  /** The desired success rate (a percentage), shared with the results. */
  confidence: number;
  setConfidence: (confidence: number) => void;
}) => {
  const running = fetcher.state === 'submitting';

  const [numJobs, setNumJobs] = useState(1);
  const [numLifeEvents, setNumLifeEvents] = useState(1);
  const [retirementMode, setRetirementMode] = useState<RetirementMode>('ready');
  // A fixed-date plan can't run without its date: otherwise work income
  // would just keep going to the end year.
  const [hasRetirementDate, setHasRetirementDate] = useState(false);
  const missingRetirementDate = retirementMode === 'date' && !hasRetirementDate;
  // Which life events happen at retirement, by row. Their date field is
  // read-only while the switch is on (not disabled: disabled fields are left
  // out of the form data, which would shift every later row's date).
  const [lifeEventsAtRetirement, setLifeEventsAtRetirement] = useState<boolean[]>([]);
  const [numAssetClasses, setNumAssetClasses] = useState(2);
  const [activeSettingsTab, setActiveSettingsTab] = useState(0);
  const [exportFileName, setExportFileName] = useState('pretire-montecarlo-settings');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const queuedImportSettings = useRef<MonteCarloSettings | null>(null);
  // Set when the settings being applied should run as soon as they're in the form.
  const runAfterFill = useRef(false);
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
      retirement: {
        mode: retirementMode,
        confidence: getSettingValue('retirement[confidence]'),
        date: getSettingValue('retirement[date]'),
      },
      jobs: collectRepeatedGroup('jobs', JOB_FIELD_NAMES).map((row) => ({
        ...(Object.fromEntries(
          JOB_FIELD_NAMES.map((field) => [
            field,
            JOB_FIELDS[field] === 'boolean' ? Boolean(row[field]) : String(row[field]),
          ])
        ) as JobSettings),
        atRetirement: parseAtRetirement(String(row.atRetirement)),
      })),
      life_events: collectRepeatedGroup('life_events', LIFE_EVENT_FIELDS).map((row, index) => ({
        name: String(row.name),
        date: String(row.date),
        balanceChange: String(row.balanceChange),
        monthlyExpensesChange: String(row.monthlyExpensesChange),
        atRetirement: Boolean(lifeEventsAtRetirement[index]),
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

    setRepeatedGroup(form, 'life_events', LIFE_EVENT_FIELDS, settings.life_events);

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
    setFieldValue(form, 'retirement[date]', settings.retirement?.date ?? '');
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
  // The run waits for the next render: the retirement setting and success
  // rate are React state, and the form only submits them once rendered.
  const [runRequests, setRunRequests] = useState(0);
  const fillFormAndMaybeRun = (form: HTMLFormElement, settings: MonteCarloSettings) => {
    fillForm(form, settings);
    if (runAfterFill.current) {
      runAfterFill.current = false;
      setRunRequests((count) => count + 1);
    }
  };
  useEffect(() => {
    if (runRequests === 0) return;
    const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
    if (form) fetcher.submit(form);
    // Runs once per request; fetcher changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRequests]);

  const applySettings = (imported: MonteCarloSettings, { run = false } = {}) => {
    const settings = migrateSettings(imported);
    setRetirementMode(parseRetirementMode(settings.retirement?.mode));
    setConfidence(parseConfidence(settings.retirement?.confidence));
    setHasRetirementDate(Boolean(settings.retirement?.date));
    setLifeEventsAtRetirement(settings.life_events.map((event) => Boolean(event.atRetirement)));
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

  const showMessage = (message: string) => {
    setImportError(null);
    setImportMessage(message);
  };

  const savedScenarios = useSavedScenarios(isMonteCarloSettings, {
    readSettings: () => buildSettings(),
    loadScenario: (scenario) => {
      setExportFileName(scenario.name);
      applySettings(scenario.settings, { run: true });
    },
    onNamed: setExportFileName,
    // The export file keeps following the scenario it was named for.
    onRenamed: (oldName, newName) =>
      setExportFileName((current) => (current === oldName ? newName : current)),
    onDeleted: (name) =>
      setExportFileName((current) => (current === name ? 'pretire-montecarlo-settings' : current)),
    showMessage,
    showError: (message) => {
      setImportMessage(null);
      setImportError(message);
    },
    describeDifferences,
  });

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
          savedScenarios.restore(restored, file.name);
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
        selectedId={savedScenarios.selectedId}
        lastBackupAt={savedScenarios.lastBackupAt}
        notice={savedScenarios.notice}
        onSelect={savedScenarios.select}
        onSave={savedScenarios.save}
        onSaveAs={savedScenarios.openSaveAs}
        onRename={savedScenarios.rename}
        onDelete={savedScenarios.remove}
        onExportAll={savedScenarios.exportAll}
      />
      <ScenarioTagsDialog
        mode={savedScenarios.dialog}
        vocabulary={savedScenarios.vocabulary}
        findTwin={savedScenarios.findTwin}
        onSaveAs={savedScenarios.saveAs}
        onSaveTags={savedScenarios.setTags}
        onClose={savedScenarios.closeDialog}
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
            <Col xs={12} className="mt-3">
              <Form.Group>
                <Form.Label as="legend" className="fs-6 mb-1">When do you retire?</Form.Label>
                <Form.Check
                  type="radio"
                  id="retirement_mode_ready"
                  name="retirement[mode]"
                  value="ready"
                  label="As soon as I'm ready"
                  checked={retirementMode === 'ready'}
                  onChange={() => setRetirementMode('ready')}
                />
                <Row className="align-items-center g-2">
                  <Col xs="auto">
                    <Form.Check
                      type="radio"
                      id="retirement_mode_date"
                      name="retirement[mode]"
                      value="date"
                      label="On a date:"
                      checked={retirementMode === 'date'}
                      onChange={() => setRetirementMode('date')}
                    />
                  </Col>
                  <Col xs="auto">
                    <Form.Control
                      type="date"
                      name="retirement[date]"
                      aria-label="Retirement date"
                      size="sm"
                      disabled={retirementMode !== 'date'}
                      isInvalid={missingRetirementDate}
                      onChange={(event) => setHasRetirementDate(event.target.value !== '')}
                    />
                  </Col>
                </Row>
                {missingRetirementDate && (
                  <div className="text-danger small">
                    Pick a retirement date, or choose "As soon as I'm ready".
                  </div>
                )}
                <Form.Text className="text-muted">
                  Retiring when ready, each simulated future keeps working
                  until its savings reach the ready line, then retires. Work
                  income stops when you retire; other income (like Social
                  Security) keeps its own dates.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col xs={12} sm={6} md={4} className="mt-3">
              <Form.Group controlId="retirement_confidence">
                <Form.Label>Desired success rate</Form.Label>
                <InputGroup>
                  <SuccessRateField confidence={confidence} setConfidence={setConfidence} />
                  <InputGroup.Text>%</InputGroup.Text>
                </InputGroup>
                {/* What's submitted and exported: always a valid rate. */}
                <input type="hidden" name="retirement[confidence]" value={confidence} />
                <Form.Text className="text-muted">
                  The chance of never running out you want before you
                  retire. You're ready once your savings give at least this.
                  You can also adjust it with the slider in the results.
                </Form.Text>
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
                        (for work income, only if it ends before you retire,
                        like a job change; income is prorated, so this is the
                        first day without it)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6} md={3} lg={2} className="flex-grow-1">
                    <Form.Group>
                      <Form.Label>Type of income</Form.Label>
                      <Form.Select name="jobs[][atRetirement]" defaultValue="stops">
                        <option value="stops">Work income</option>
                        <option value="unaffected">Other income</option>
                      </Form.Select>
                      <Form.Text className="text-muted">
                        Work income stops when you retire. Other income (Social
                        Security, pensions, rent) follows its own dates.
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
                          readOnly={Boolean(lifeEventsAtRetirement[index])}
                          className={lifeEventsAtRetirement[index] ? 'bg-body-secondary' : undefined}
                          autoFocus
                        />
                      </InputGroup>
                      <Form.Check
                        type="switch"
                        id={`life_event_at_retirement_${index}`}
                        name="life_events[][atRetirement]"
                        // Submits the row index, like the jobs' inflation
                        // switches, so each switch stays with its own row.
                        value={String(index)}
                        label="At retirement"
                        checked={Boolean(lifeEventsAtRetirement[index])}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setLifeEventsAtRetirement((previous) => {
                            const next = [...previous];
                            next[index] = checked;
                            return next;
                          });
                        }}
                      />
                      {lifeEventsAtRetirement[index] && (
                        <Form.Text className="text-muted">
                          Happens on the retirement date instead
                        </Form.Text>
                      )}
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
          <Button variant="primary" type="submit" disabled={running || missingRetirementDate}>
            {running ? 'Running, please wait' : 'Run Simulation'}
          </Button>
          {missingRetirementDate && (
            <Form.Text className="text-danger ms-2">
              Pick a retirement date on Basic Settings first.
            </Form.Text>
          )}
        </Col>
      </Row>
    </>
  );
};

export default MonteCarloForm;
