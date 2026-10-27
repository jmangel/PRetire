import { useEffect, useState } from 'react';
import {
  RestoreResult,
  SavedScenario,
  SavedScenarios,
  loadScenarios,
  mergeScenarios,
  newScenarioId,
  requestPersistentStorage,
  storeScenarios,
  toBackup,
  STORAGE_KEY,
} from '../savedScenarios';
import { ScenarioTags, hasTags } from '../scenarioTags';

/** Have the browser save `data` as a JSON file. */
export const downloadJson = (fileName: string, data: unknown) => {
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

const STORAGE_REFUSED = "Couldn't save: this browser is blocking or out of storage for this site.";

/** What the saved scenarios need from the form they save and load. */
export type ScenarioFormHooks<Settings> = {
  /** The form's current settings, or null if the form isn't there. */
  readSettings: () => Settings | null;
  /** Fill the form with a scenario's settings and run it. */
  loadScenario: (scenario: SavedScenario<Settings>) => void;
  /** A scenario was saved under a new name. */
  onNamed: (name: string) => void;
  /** A scenario's name changed. */
  onRenamed: (oldName: string, newName: string) => void;
  /** The scenario with this name was deleted. */
  onDeleted: (name: string) => void;
  /** Show a message by the Import button, where restoring a backup starts. */
  showMessage: (message: string) => void;
  showError: (message: string) => void;
};

/** A message about the last thing done with the scenario bar, shown right under it. */
export type ScenarioNotice = { text: string; isError: boolean };

/**
 * The scenarios saved in this browser, which one is picked, and everything
 * that changes them. Every change is applied to what's in storage at that
 * moment rather than to this tab's copy, so a tab with an old list can't undo
 * what another tab saved, and each tab follows the others' changes.
 */
export const useSavedScenarios = <Settings,>(
  isSettings: (value: unknown) => value is Settings,
  form: ScenarioFormHooks<Settings>
) => {
  const [saved, setSaved] = useState<SavedScenarios<Settings>>(() => loadScenarios(isSettings));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScenarioNotice | null>(null);
  const tell = (text: string) => setNotice({ text, isError: false });
  const warn = (text: string) => setNotice({ text, isError: true });

  // Another tab saved, renamed or deleted a scenario: show the same list here.
  // If the picked scenario is gone, nothing is picked anymore.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const latest = loadScenarios(isSettings);
      setSaved(latest);
      setSelectedId((id) => (latest.scenarios.some((scenario) => scenario.id === id) ? id : null));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isSettings]);

  // Saved scenarios only change through here, so what's shown always matches
  // what's stored. The change is applied to what's in storage now. Returns
  // false, with an error shown, if the browser refused.
  const update = (
    change: (current: SavedScenarios<Settings>) => SavedScenarios<Settings>,
    showError: (message: string) => void = warn
  ) => {
    const next = change(loadScenarios(isSettings));
    if (!storeScenarios(next)) {
      showError(STORAGE_REFUSED);
      return false;
    }
    setSaved(next);
    return true;
  };

  const selected = saved.scenarios.find((scenario) => scenario.id === selectedId);

  const select = (id: string | null) => {
    setSelectedId(id);
    const scenario = saved.scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return;
    form.loadScenario(scenario);
    tell(`Loaded "${scenario.name}".`);
  };

  const save = () => {
    const settings = form.readSettings();
    if (!selected || !settings) return;
    const savedAt = new Date().toISOString();
    // Only the settings change, on the copy in storage, so a rename or tag
    // edit another tab just made stays. If another tab deleted it
    // meanwhile, saving puts it back.
    const stored = update((current) => ({
      ...current,
      scenarios: current.scenarios.some((scenario) => scenario.id === selected.id)
        ? current.scenarios.map((scenario) =>
            scenario.id === selected.id ? { ...scenario, settings, savedAt } : scenario
          )
        : [...current.scenarios, { ...selected, settings, savedAt }],
    }));
    if (stored) tell(`Saved "${selected.name}".`);
  };

  const saveAs = (name: string, tags?: ScenarioTags) => {
    const settings = form.readSettings();
    if (!settings) return;
    const created: SavedScenario<Settings> = {
      id: newScenarioId(),
      name,
      savedAt: new Date().toISOString(),
      settings,
      ...(hasTags(tags) ? { tags } : {}),
    };
    const stored = update((current) => ({ ...current, scenarios: [...current.scenarios, created] }));
    if (!stored) return;
    requestPersistentStorage();
    setSelectedId(created.id);
    form.onNamed(name);
    tell(`Saved "${name}".`);
  };

  const rename = (name: string) => {
    if (!selected) return;
    const stored = update((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.id === selected.id ? { ...scenario, name } : scenario
      ),
    }));
    if (!stored) return;
    form.onRenamed(selected.name, name);
    tell(`Renamed "${selected.name}" to "${name}".`);
  };

  // Editing tags counts as a save, so a backup's older copy won't undo it.
  const setTags = (id: string, tags: ScenarioTags) => {
    const scenario = saved.scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return;
    const savedAt = new Date().toISOString();
    const stored = update((current) => ({
      ...current,
      scenarios: current.scenarios.map((candidate) => {
        if (candidate.id !== id) return candidate;
        const { tags: _old, ...rest } = candidate;
        return hasTags(tags) ? { ...rest, tags, savedAt } : { ...rest, savedAt };
      }),
    }));
    if (stored) tell(`Saved the tags for "${scenario.name}".`);
  };

  // Deleting leaves the form as it is, so the settings aren't lost if the
  // user wants to save them again.
  const remove = () => {
    if (!selected) return;
    const stored = update((current) => ({
      ...current,
      scenarios: current.scenarios.filter((scenario) => scenario.id !== selected.id),
    }));
    if (!stored) return;
    setSelectedId(null);
    form.onDeleted(selected.name);
    tell(`Deleted "${selected.name}".`);
  };

  const exportAll = () => {
    const now = new Date();
    const fileName = `pretire-scenarios-backup-${now.toISOString().slice(0, 10)}.json`;
    // Back up what's in storage now, which includes other tabs' saves.
    const current = loadScenarios(isSettings);
    downloadJson(fileName, toBackup(current));
    const exported = `Exported ${current.scenarios.length} saved scenario(s) as ${fileName}.`;
    const recorded = update((latest) => ({ ...latest, lastBackupAt: now.toISOString() }));
    if (recorded) {
      tell(`${exported} Import it to restore them.`);
    } else {
      // The file was still saved; only the "Last backed up" date wasn't.
      warn(
        `${exported} Couldn't record the backup date: this browser is blocking or out of storage for this site.`
      );
    }
  };

  const restore = (restored: Array<SavedScenario<Settings>>, fileName: string) => {
    let result: RestoreResult<Settings> | undefined;
    let replacedPicked: string | undefined;
    setNotice(null);
    const stored = update((current) => {
      result = mergeScenarios(current, restored);
      // If the backup's newer copy replaced the picked scenario, the form
      // still shows the old settings, and Save would write them over the
      // restored copy. So it's unpicked until the user picks it again.
      const before = current.scenarios.find((scenario) => scenario.id === selectedId);
      const after = result.saved.scenarios.find((scenario) => scenario.id === selectedId);
      if (before && after && after.savedAt !== before.savedAt) replacedPicked = after.name;
      return result.saved;
    }, form.showError);
    if (!stored || !result) return;
    if (replacedPicked) setSelectedId(null);
    form.showMessage(
      describeRestore(result, fileName) +
        (replacedPicked
          ? ` The backup had a newer copy of "${replacedPicked}", so it's no longer picked; pick it again to load the restored settings.`
          : '')
    );
  };

  return {
    scenarios: saved.scenarios,
    lastBackupAt: saved.lastBackupAt,
    notice,
    selectedId,
    selected,
    select,
    save,
    saveAs,
    setTags,
    rename,
    remove,
    exportAll,
    restore,
  };
};
