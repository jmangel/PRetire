import { MonteCarloSettings, migrateSettings } from './Settings';

const job = (fields: Record<string, unknown>) => ({
  name: '',
  postTaxAnnualIncome: '0',
  adjustForInflation: true,
  startDate: '',
  endDate: '',
  ...fields,
});
const settingsWith = (jobs: object[], extra: Partial<MonteCarloSettings> = {}) =>
  ({
    startingBalance: '100000',
    monthlyExpenses: '-4000',
    endYear: '2100',
    jobs,
    life_events: [],
    inflation: { averageAnnualReturnPercentage: '2.9', standardDeviationPercentage: '1.1' },
    asset_classes: [],
    ...extra,
  } as unknown as MonteCarloSettings);

describe('migrateSettings', () => {
  test('leaves current files alone', () => {
    const current = settingsWith([job({ postTaxAnnualIncome: '90000', atRetirement: 'stops' })], {
      retirement: { mode: 'ready', confidence: '85', date: '' },
    });
    expect(migrateSettings(current)).toBe(current);
  });

  describe('files from before income had a type', () => {
    test('rows with an end date are work income, rows without one other income', () => {
      const migrated = migrateSettings(settingsWith([
        job({ postTaxAnnualIncome: '90000', endDate: '2042-07-01' }),
        job({ postTaxAnnualIncome: '26000', startDate: '2058-01-01' }),
      ]));

      expect(migrated.jobs.map((row) => row.atRetirement)).toEqual(['stops', 'unaffected']);
      expect(migrated.retirement).toEqual({ mode: 'date', confidence: '90', date: '2042-07-01' });
      expect(migrated.jobs[0].endDate).toBe('');
    });

    test('a file where nothing ends retires when ready, with no work income to stop', () => {
      const migrated = migrateSettings(settingsWith([job({ postTaxAnnualIncome: '60000' })]));

      expect(migrated.jobs[0].atRetirement).toBe('unaffected');
      expect(migrated.retirement?.mode).toBe('ready');
    });
  });

  describe('files from before retirement was its own setting', () => {
    test('retire on the last work income end date, which is then cleared', () => {
      const migrated = migrateSettings(settingsWith([
        job({ postTaxAnnualIncome: '60000', endDate: '2031-07-01', atRetirement: 'stops' }), // job change
        job({ postTaxAnnualIncome: '80000', startDate: '2031-07-01', endDate: '2044-07-01', atRetirement: 'stops' }),
        job({ postTaxAnnualIncome: '20000', endDate: '2044-07-01', atRetirement: 'unaffected' }),
      ]));

      expect(migrated.retirement).toEqual({ mode: 'date', confidence: '90', date: '2044-07-01' });
      expect(migrated.jobs.map((row) => row.endDate)).toEqual(['2031-07-01', '', '2044-07-01']);
    });

    test('open-ended work income retires when ready', () => {
      const migrated = migrateSettings(settingsWith([job({ postTaxAnnualIncome: '60000', atRetirement: 'stops' })]));

      expect(migrated.retirement?.mode).toBe('ready');
      expect(migrated.jobs[0].atRetirement).toBe('stops');
    });
  });
});
