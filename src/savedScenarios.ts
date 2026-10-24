// Scenarios saved in this browser's localStorage. Nothing here is ever sent
// anywhere: it's the same settings the JSON export holds, kept under a name.

export type SavedScenario<Settings> = {
  id: string;
  name: string;
  /** When the scenario was last saved, as an ISO timestamp. */
  savedAt: string;
  settings: Settings;
};

export type SavedScenarios<Settings> = {
  scenarios: Array<SavedScenario<Settings>>;
  /** When "Export all scenarios" was last used, as an ISO timestamp. */
  lastBackupAt?: string;
};

/** A full backup from "Export all scenarios", as written to the file. */
export type ScenariosBackup<Settings> = {
  pretireScenariosBackup: 1;
  scenarios: Array<SavedScenario<Settings>>;
};

export const STORAGE_KEY = 'pretire.savedScenarios.v1';

const empty = <Settings,>(): SavedScenarios<Settings> => ({ scenarios: [] });

/**
 * Read the saved scenarios, keeping only those whose settings pass
 * `isSettings`. Storage can be unavailable (private windows, blocked site
 * data) or hold something unexpected; either way this returns an empty list
 * rather than throwing.
 */
export const loadScenarios = <Settings,>(
  isSettings: (value: unknown) => value is Settings
): SavedScenarios<Settings> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.scenarios)) return empty();
    return {
      scenarios: parsed.scenarios.filter((scenario: any) => isSavedScenario(scenario, isSettings)),
      ...(typeof parsed.lastBackupAt === 'string' ? { lastBackupAt: parsed.lastBackupAt } : {}),
    };
  } catch {
    return empty();
  }
};

/** Write the saved scenarios. Returns false if the browser refused (e.g. storage is full or blocked). */
export const storeScenarios = <Settings,>(saved: SavedScenarios<Settings>): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
};

const isSavedScenario = <Settings,>(
  value: any,
  isSettings: (value: unknown) => value is Settings
): value is SavedScenario<Settings> =>
  !!value &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.savedAt === 'string' &&
  isSettings(value.settings);

export const newScenarioId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Ask the browser not to clear this site's storage on its own. Browsers
 * decide whether to grant it; either way saving still works, so the answer
 * is ignored.
 */
export const requestPersistentStorage = () => {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Not supported; nothing to do.
  }
};

export const toBackup = <Settings,>(saved: SavedScenarios<Settings>): ScenariosBackup<Settings> => ({
  pretireScenariosBackup: 1,
  scenarios: saved.scenarios,
});

/** The scenarios in a backup file, or null if `value` isn't one. */
export const scenariosFromBackup = <Settings,>(
  value: unknown,
  isSettings: (value: unknown) => value is Settings
): Array<SavedScenario<Settings>> | null => {
  const candidate = value as Partial<ScenariosBackup<Settings>> | null;
  if (!candidate || candidate.pretireScenariosBackup !== 1 || !Array.isArray(candidate.scenarios)) {
    return null;
  }
  return candidate.scenarios.filter((scenario) => isSavedScenario(scenario, isSettings));
};

/**
 * Add a backup's scenarios to the saved ones. A scenario with the same ID is
 * replaced by the backup's copy, so restoring the same file twice doesn't
 * duplicate anything.
 */
export const mergeScenarios = <Settings,>(
  saved: SavedScenarios<Settings>,
  restored: Array<SavedScenario<Settings>>
): SavedScenarios<Settings> => {
  const restoredIds = new Set(restored.map((scenario) => scenario.id));
  return {
    ...saved,
    scenarios: [...saved.scenarios.filter((scenario) => !restoredIds.has(scenario.id)), ...restored],
  };
};
