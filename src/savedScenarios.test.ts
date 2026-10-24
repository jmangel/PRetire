import {
  STORAGE_KEY,
  loadScenarios,
  mergeScenarios,
  scenariosFromBackup,
  storeScenarios,
  toBackup,
} from './savedScenarios';

type Settings = { balance: string };
const isSettings = (value: unknown): value is Settings =>
  !!value && typeof (value as Settings).balance === 'string';
const scenario = (id: string, balance = '1') => ({
  id,
  name: `Scenario ${id}`,
  savedAt: '2026-10-24T00:00:00.000Z',
  settings: { balance },
});

afterEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('loadScenarios', () => {
  test('round-trips what storeScenarios wrote', () => {
    const saved = { scenarios: [scenario('a')], lastBackupAt: '2026-10-01T00:00:00.000Z' };
    expect(storeScenarios(saved)).toBe(true);
    expect(loadScenarios(isSettings)).toEqual(saved);
  });

  test('is empty when nothing is stored, or what is stored is not scenarios', () => {
    expect(loadScenarios(isSettings)).toEqual({ scenarios: [] });
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(loadScenarios(isSettings)).toEqual({ scenarios: [] });
    window.localStorage.setItem(STORAGE_KEY, '{"scenarios": 3}');
    expect(loadScenarios(isSettings)).toEqual({ scenarios: [] });
  });

  test('drops scenarios whose settings are not valid', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ scenarios: [scenario('a'), { ...scenario('b'), settings: {} }] })
    );
    expect(loadScenarios(isSettings).scenarios.map((s) => s.id)).toEqual(['a']);
  });

  test('is empty, not an error, when storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadScenarios(isSettings)).toEqual({ scenarios: [] });
  });
});

test('storeScenarios reports when the browser refuses', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  expect(storeScenarios({ scenarios: [scenario('a')] })).toBe(false);
});

describe('backups', () => {
  test('a backup reads back as its scenarios; other files are not backups', () => {
    const backup = toBackup({ scenarios: [scenario('a')], lastBackupAt: 'x' });
    expect(scenariosFromBackup(JSON.parse(JSON.stringify(backup)), isSettings)).toEqual([scenario('a')]);
    expect(scenariosFromBackup({ balance: '1' }, isSettings)).toBeNull();
    expect(scenariosFromBackup(null, isSettings)).toBeNull();
  });

  test('restoring replaces scenarios with the same ID and keeps the rest', () => {
    const merged = mergeScenarios(
      { scenarios: [scenario('a', 'old'), scenario('b')], lastBackupAt: 'x' },
      [scenario('a', 'new'), scenario('c')]
    );
    expect(merged.scenarios.map((s) => [s.id, s.settings.balance])).toEqual([
      ['b', '1'],
      ['a', 'new'],
      ['c', '1'],
    ]);
    expect(merged.lastBackupAt).toBe('x');
  });
});
