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

  const at = (id: string, savedAt: string, name = `Scenario ${id}`) => ({
    ...scenario(id, savedAt),
    name,
    savedAt,
  });
  const EARLY = '2026-10-01T00:00:00.000Z';
  const LATE = '2026-10-20T00:00:00.000Z';

  test('matches by ID: the newer copy wins, and the rest are kept', () => {
    const result = mergeScenarios(
      { scenarios: [at('a', EARLY), at('b', LATE), at('c', EARLY)], lastBackupAt: 'x' },
      [at('a', LATE), at('b', EARLY), at('d', EARLY)]
    );
    expect(result.saved.scenarios.map((s) => [s.id, s.savedAt])).toEqual([
      ['a', LATE],
      ['b', LATE],
      ['c', EARLY],
      ['d', EARLY],
    ]);
    expect(result).toMatchObject({ added: 1, updated: 1, keptNewer: 1, unchanged: 0, renamed: 0 });
    expect(result.saved.lastBackupAt).toBe('x');
  });

  test('restoring the same backup again changes nothing', () => {
    const backup = [at('a', EARLY), at('b', EARLY)];
    const once = mergeScenarios({ scenarios: [] }, backup);
    const twice = mergeScenarios(once.saved, backup);
    expect(twice.saved).toEqual(once.saved);
    expect(twice).toMatchObject({ added: 0, updated: 0, keptNewer: 0, unchanged: 2 });
  });

  test('a new scenario with a taken name gets "(restored)" added', () => {
    const result = mergeScenarios(
      { scenarios: [at('a', EARLY, 'Lean'), at('b', EARLY, 'Lean (restored)')] },
      [at('c', EARLY, 'Lean'), at('d', EARLY, 'Lean'), at('e', EARLY, 'Comfortable')]
    );
    expect(result.saved.scenarios.map((s) => s.name)).toEqual([
      'Lean',
      'Lean (restored)',
      'Lean (restored 2)',
      'Lean (restored 3)',
      'Comfortable',
    ]);
    expect(result).toMatchObject({ added: 3, renamed: 2 });
  });

  test('an updated copy renamed elsewhere to a taken name gets "(restored)" too', () => {
    const result = mergeScenarios(
      { scenarios: [at('a', EARLY, 'Lean'), at('b', EARLY, 'Comfortable')] },
      [at('a', LATE, 'Comfortable')]
    );
    expect(result.saved.scenarios.map((s) => s.name)).toEqual(['Comfortable (restored)', 'Comfortable']);
    expect(result).toMatchObject({ updated: 1, renamed: 1 });
  });

  test('an updated copy keeps its own name', () => {
    const result = mergeScenarios({ scenarios: [at('a', EARLY, 'Lean')] }, [at('a', LATE, 'Lean')]);
    expect(result.saved.scenarios[0].name).toBe('Lean');
    expect(result.renamed).toBe(0);
  });
});
