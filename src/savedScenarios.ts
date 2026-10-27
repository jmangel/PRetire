// Scenarios saved in this browser's localStorage. Nothing here is ever sent
// anywhere: it's the same settings the JSON export holds, kept under a name.

import { ScenarioTags, cleanTags } from './scenarioTags';

export type SavedScenario<Settings> = {
  id: string;
  name: string;
  /** When the scenario was last saved, as an ISO timestamp. */
  savedAt: string;
  settings: Settings;
  /** Missing on scenarios saved before tags existed, which is the same as no tags. */
  tags?: ScenarioTags;
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
      scenarios: parsed.scenarios
        .filter((scenario: any) => isSavedScenario(scenario, isSettings))
        .map(withCleanTags),
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

// Tags that aren't usable (hand-edited, say) are dropped rather than losing
// the whole scenario.
const withCleanTags = <Settings,>(scenario: SavedScenario<Settings>): SavedScenario<Settings> => {
  const { tags, ...rest } = scenario;
  const cleaned = cleanTags(tags);
  return cleaned ? { ...rest, tags: cleaned } : rest;
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
  return candidate.scenarios
    .filter((scenario) => isSavedScenario(scenario, isSettings))
    .map(withCleanTags);
};

/** What restoring a backup did, for telling the user. */
export type RestoreResult<Settings> = {
  saved: SavedScenarios<Settings>;
  /** Scenarios that weren't saved here before. */
  added: number;
  /** Scenarios saved here that the backup's newer copy replaced. */
  updated: number;
  /** Scenarios whose copy here was newer than the backup's, so it was kept. */
  keptNewer: number;
  /** Scenarios already saved here exactly as in the backup. */
  unchanged: number;
  /** Restored scenarios renamed because another scenario here had the same name. */
  renamed: number;
};

/**
 * Add a backup's scenarios to the saved ones. Scenarios are matched by ID,
 * never by name: restoring a backup into the browser it came from updates
 * what's there, and restoring it twice changes nothing. When both copies of
 * a scenario exist, the more recently saved one wins. A restored scenario
 * whose name another scenario here already has gets " (restored)" added,
 * so two different scenarios never share a name in the list.
 */
export const mergeScenarios = <Settings,>(
  saved: SavedScenarios<Settings>,
  restored: Array<SavedScenario<Settings>>
): RestoreResult<Settings> => {
  const scenarios = [...saved.scenarios];
  const result = { added: 0, updated: 0, keptNewer: 0, unchanged: 0, renamed: 0 };

  // A name no other scenario here uses (the scenario being replaced, if
  // any, doesn't count).
  const uniqueName = (name: string, replacingId?: string) => {
    const taken = new Set(
      scenarios.filter((scenario) => scenario.id !== replacingId).map((scenario) => scenario.name)
    );
    if (!taken.has(name)) return name;
    let candidate = `${name} (restored)`;
    for (let n = 2; taken.has(candidate); n++) candidate = `${name} (restored ${n})`;
    return candidate;
  };

  restored.forEach((scenario) => {
    const index = scenarios.findIndex((existing) => existing.id === scenario.id);
    if (index === -1) {
      const name = uniqueName(scenario.name);
      if (name !== scenario.name) result.renamed++;
      scenarios.push({ ...scenario, name });
      result.added++;
    } else if (scenarios[index].savedAt > scenario.savedAt) {
      result.keptNewer++;
    } else if (scenarios[index].savedAt === scenario.savedAt) {
      result.unchanged++;
    } else {
      const name = uniqueName(scenario.name, scenario.id);
      if (name !== scenario.name) result.renamed++;
      scenarios[index] = { ...scenario, name };
      result.updated++;
    }
  });

  return { saved: { ...saved, scenarios }, ...result };
};
