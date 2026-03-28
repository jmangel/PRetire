import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Form, InputGroup, Nav, Row } from 'react-bootstrap';
import { FetcherWithComponents } from 'react-router-dom';
import HasManyRows from './HasManyRows';

const NUM_SETTINGS_TABS = 4;

type MonteCarloSettings = {
  startingBalance: string;
  monthlyExpenses: string;
  endYear: string;
  jobs: Array<{
    name: string;
    postTaxAnnualIncome: string;
    adjustForInflation: boolean;
    yearlyRaisePercentage: string;
    startDate: string;
    endDate: string;
  }>;
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

export const dollarFormatter = (val: number) =>
  val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const queuedImportSettings = useRef<MonteCarloSettings | null>(null);

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
      jobs: collectRepeatedGroup('jobs', [
        'name',
        'postTaxAnnualIncome',
        'adjustForInflation',
        'yearlyRaisePercentage',
        'startDate',
        'endDate',
      ]).map((row) => ({
        name: String(row.name),
        postTaxAnnualIncome: String(row.postTaxAnnualIncome),
        adjustForInflation: Boolean(row.adjustForInflation),
        yearlyRaisePercentage: String(row.yearlyRaisePercentage),
        startDate: String(row.startDate),
        endDate: String(row.endDate),
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

  const validateSettings = (settings: unknown): settings is MonteCarloSettings => {
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

  const applySettings = (settings: MonteCarloSettings) => {
    const targetJobs = Math.max(settings.jobs.length, 1);
    const targetLifeEvents = Math.max(settings.life_events.length, 1);
    const targetAssetClasses = Math.max(settings.asset_classes.length, 1);
    const needsRowUpdate =
      targetJobs !== numJobs ||
      targetLifeEvents !== numLifeEvents ||
      targetAssetClasses !== numAssetClasses;

    queuedImportSettings.current = settings;
    setNumJobs(targetJobs);
    setNumLifeEvents(targetLifeEvents);
    setNumAssetClasses(targetAssetClasses);

    if (!needsRowUpdate) {
      const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
      if (form) {
        setRepeatedGroup(form, 'jobs', [
          'name',
          'postTaxAnnualIncome',
          'adjustForInflation',
          'yearlyRaisePercentage',
          'startDate',
          'endDate',
        ],
        settings.jobs.map((job) => ({
          ...job,
          adjustForInflation: job.adjustForInflation,
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

        setFieldValue(
          form,
          'startingBalance',
          settings.startingBalance
        );
        setFieldValue(
          form,
          'monthlyExpenses',
          settings.monthlyExpenses
        );
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

    const settings = queuedImportSettings.current;
    setRepeatedGroup(form, 'jobs', [
      'name',
      'postTaxAnnualIncome',
      'adjustForInflation',
      'yearlyRaisePercentage',
      'startDate',
      'endDate',
    ],
    settings.jobs.map((job) => ({
      ...job,
      adjustForInflation: job.adjustForInflation,
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

    setFieldValue(
      form,
      'startingBalance',
      settings.startingBalance
    );
    setFieldValue(
      form,
      'monthlyExpenses',
      settings.monthlyExpenses
    );
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
    queuedImportSettings.current = null;
  }, [numJobs, numLifeEvents, numAssetClasses]);

  const handleExportSettings = () => {
    const form = document.getElementById('monte-carlo-form') as HTMLFormElement | null;
    const settings = form ? buildSettings() : null;
    if (!settings) {
      setImportMessage(null);
      setImportError('Cannot export settings: form not available.');
      return;
    }

    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pretire-montecarlo-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setImportError(null);
    setImportMessage('Simulation settings exported locally.');
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
        if (!validateSettings(parsed)) {
          throw new Error('Invalid simulation settings file.');
        }
        applySettings(parsed);
        setImportMessage('Simulation settings imported successfully.');
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
                    placeholder="1000000"
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
                    placeholder="-4000"
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
                        defaultChecked
                        label="Adjust for inflation"
                      />
                      <Form.Text className="text-muted">
                        Increase income each year by the inflation amount
                        entered, <strong>starting immediately</strong>
                      </Form.Text>
                    </Form.Group>
                  </Col>

                  {/* <Col xs={6} sm={6} md={3} lg={2} className="flex-grow-1">
                  <Form.Group>
                    <Form.Label>Yearly Raise Percentage</Form.Label>
                    <InputGroup>
                    <Form.Control
                        type="number"
                        step="any"
                        name="jobs[][yearlyRaisePercentage]"
                        disabled
                      />
                      <InputGroup.Text>%</InputGroup.Text>
                    </InputGroup>
                    <Form.Text className="text-muted">
                    Increase income <strong>in addition to inflation</strong>{' '}
                    by this percentage each year, <strong>starting after the job starts</strong>
                      <br />
                      <em>
                        <strong>Note:</strong>{' '}
                        If you want to include inflation/cost-of-living increases in{' '}
                        these yearly raises, uncheck the previous option
                      </em>
                    </Form.Text>
                  </Form.Group>
                </Col> */}
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
                        (leave empty if you'll work to the grave)
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
            Save or restore your simulation fields locally. No settings are
            stored in the cloud.
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
                setActiveSettingsTab((prev) => prev + (1 % NUM_SETTINGS_TABS))
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
