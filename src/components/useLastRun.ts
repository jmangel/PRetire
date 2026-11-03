import { useEffect, useRef } from 'react';
import { FetcherWithComponents } from 'react-router-dom';
import { MonteCarloResponse } from '../calculators/MonteCarlo';
import { MonteCarloSettings } from '../calculators/Settings';
import { ResultSummary, sameRun, summarizeRun } from '../resultSummary';

/**
 * The page's last run: the settings it used and its results, so they can be
 * kept with a saved scenario that has those settings.
 *
 * The settings are read as each run is submitted, whether by the Run button
 * (or Enter) or by picking a scenario, which runs it right away. A new
 * submit while a run is still going replaces it, so the results that come
 * back are always the last submit's.
 */
export const useLastRun = ({ fetcher, formId, readSettings, onRunFinished }: {
  fetcher: FetcherWithComponents<any>;
  formId: string;
  readSettings: () => MonteCarloSettings | null;
  /** Called once a run's results are in. */
  onRunFinished: () => void;
}) => {
  const latest = useRef({ readSettings, onRunFinished, data: fetcher.data });
  latest.current = { readSettings, onRunFinished, data: fetcher.data };

  const running = useRef<{ settings: MonteCarloSettings; dataBefore: unknown } | null>(null);
  const last = useRef<{ settings: MonteCarloSettings; response: MonteCarloResponse } | null>(null);
  // The picked scenario's settings as saved, and as the form reads them back
  // once loaded. They can differ and still be the same plan: an older file,
  // or no income rows where the form always shows one blank row.
  const loaded = useRef<{ saved: MonteCarloSettings; awaitingRun: boolean; asLoaded?: MonteCarloSettings } | null>(null);

  /** Call as a run is submitted. */
  const submitted = () => {
    const settings = latest.current.readSettings();
    running.current = settings ? { settings, dataBefore: latest.current.data } : null;
    if (settings && loaded.current?.awaitingRun) {
      loaded.current.asLoaded = settings;
      loaded.current.awaitingRun = false;
    }
  };

  // The Run button and Enter submit the form itself.
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return undefined;
    const handleSubmit = () => submitted();
    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
  }, [formId]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !running.current) return;
    const { settings, dataBefore } = running.current;
    running.current = null;
    // No new results means the run failed.
    if (!fetcher.data || fetcher.data === dataBefore) return;
    last.current = { settings, response: fetcher.data as MonteCarloResponse };
    latest.current.onRunFinished();
  }, [fetcher.state, fetcher.data]);

  return {
    submitted,
    /** A saved scenario was loaded, and the run it starts is next. */
    loaded: (saved: MonteCarloSettings) => {
      loaded.current = { saved, awaitingRun: true };
    },
    /** The summary of the last run, if it ran these settings. */
    summaryFor: (settings: MonteCarloSettings): ResultSummary | undefined => {
      const run = last.current;
      if (!run) return undefined;
      const asLoaded = loaded.current?.asLoaded;
      const ranThese =
        sameRun(run.settings, settings) ||
        (!!asLoaded && sameRun(loaded.current!.saved, settings) && sameRun(run.settings, asLoaded));
      return ranThese ? summarizeRun(run.response, settings) : undefined;
    },
  };
};
