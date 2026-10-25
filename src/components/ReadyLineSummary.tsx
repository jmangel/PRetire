import { Form } from 'react-bootstrap';
import { ReadyYearSummary } from '../calculators/ReadyLine';
import { MAX_CONFIDENCE, MIN_CONFIDENCE, RetirementMode } from '../calculators/MonteCarlo';

export const formatPlannedDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    timeZone: 'UTC', // date inputs are parsed as UTC midnight
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const percent = (share: number) => Math.round(share * 100);

type SentenceSummary = Pick<ReadyYearSummary, 'p25' | 'median' | 'p75' | 'p90' | 'neverReady'> &
  Partial<Pick<ReadyYearSummary, 'forcedOut' | 'ranOutWhileWorking'>>;

/** Plain-language description of when the futures are ready. */
export const readySentences = (
  summary: SentenceSummary,
  endYear: number,
  workEndYear?: number
): { typical?: number; text: string[] } => {
  const { p25, median, p75, p90, neverReady, forcedOut = 0, ranOutWhileWorking = 0 } = summary;
  const forced = workEndYear !== undefined ? forcedOut : 0;
  const forcedSentence = (share: string) =>
    `${share} of these futures haven't reached the ready line when your work income ends in ${workEndYear}, so they stop working then without being ready.`;
  const ranOutSentence = (share: string) =>
    `${share} of these futures run out of money while still working, so they never reach the ready line.`;
  // Not ready for any other reason: still short of the line at the end year.
  const notReadyByEnd = neverReady - forced - ranOutWhileWorking;

  if (median === undefined) {
    const text = [];
    if (forced > 0.5) {
      text.push(
        forcedSentence('Most'),
        'Try a lower success rate, lower expenses, or a later end date for your work income.'
      );
    } else if (ranOutWhileWorking > 0.5) {
      text.push(ranOutSentence('Most'), 'Try lower expenses or more work income.');
    } else {
      text.push(
        `Most of these futures don't reach the ready line before ${endYear}.`,
        'Try a lower success rate, lower expenses, or a later ending year.'
      );
    }
    if (forced <= 0.5 && percent(forced) > 0) text.push(forcedSentence(`About ${percent(forced)}%`));
    if (ranOutWhileWorking <= 0.5 && percent(ranOutWhileWorking) > 0) {
      text.push(ranOutSentence(`About ${percent(ranOutWhileWorking)}%`));
    }
    return { text };
  }

  const text = [];
  if (p25 !== undefined && p75 !== undefined) {
    text.push(`Half of these futures are ready between ${p25} and ${p75}.`);
  }
  if (p90 !== undefined) {
    text.push(`9 in 10 are ready by ${p90}.`);
  } else if (percent(notReadyByEnd) > 0) {
    // More than 1 in 10 never reach the line; say how many, so the page
    // doesn't understate the risk.
    text.push(`About ${percent(notReadyByEnd)}% of these futures aren't ready before ${endYear}.`);
  }
  if (percent(forced) > 0) text.push(forcedSentence(`About ${percent(forced)}%`));
  if (percent(ranOutWhileWorking) > 0) text.push(ranOutSentence(`About ${percent(ranOutWhileWorking)}%`));

  return { typical: median, text };
};

/**
 * How often the money lasts when retiring when ready. When some futures
 * never reach the line, the rate for those that do is given separately, so
 * it isn't mixed up with futures that stopped working without being ready.
 */
export const successSentences = (summary: ReadyYearSummary, workEndYear?: number): string[] => {
  const { neverReady, forcedOut, successRate, readySuccessRate, forcedSuccessRate } = summary;
  if (percent(neverReady) === 0) {
    return [
      'If you re-check every year and retire once your balance reaches the green ready line, ' +
        `the money lasts in ${percent(successRate)}% of these futures.`,
    ];
  }

  const text = [];
  if (percent(1 - neverReady) > 0 && readySuccessRate !== undefined) {
    text.push(
      `Of the futures that reach the green ready line and retire then, the money lasts in ${percent(readySuccessRate)}%.`
    );
  }
  if (workEndYear !== undefined && percent(forcedOut) > 0 && forcedSuccessRate !== undefined) {
    text.push(
      text.length > 0
        ? `Of those that stop working in ${workEndYear} without being ready, it lasts in ${percent(forcedSuccessRate)}%.`
        : `Of the futures that stop working in ${workEndYear} without being ready, the money lasts in ${percent(forcedSuccessRate)}%.`
    );
    // Practically every future is in that one group, so an overall rate
    // would only repeat it.
    if (text.length === 1 && percent(forcedOut) === 100) return text;
  }
  text.push(`Overall, the money lasts in ${percent(successRate)}% of these futures.`);
  return text;
};

/** The results' headline in "retire when ready" plans. */
export const readyHeadline = (summary: ReadyYearSummary, endYear: number, workEndYear?: number) => {
  if (summary.median !== undefined) {
    return `You'd typically be ready to retire by the end of ${summary.median}`;
  }
  if (summary.forcedOut > 0.5 && workEndYear !== undefined) {
    return `Most futures haven't reached the ready line when your work income ends in ${workEndYear}`;
  }
  if (summary.ranOutWhileWorking > 0.5) {
    return 'Most futures run out of money while still working';
  }
  return `Most futures aren't ready to retire before ${endYear}`;
};

type Props = {
  mode: RetirementMode;
  summary: ReadyYearSummary;
  endYear: number;
  /** When work income runs out on its own end dates, if it does. */
  workEndYear?: number;
  plannedRetirement?: Date;
  confidence: number;
  setConfidence: (confidence: number) => void;
  /** The chart redraws only once the slider stops. */
  chartWaitsForSlider?: boolean;
};

const ReadyLineSummary = ({
  mode,
  summary,
  endYear,
  workEndYear,
  plannedRetirement,
  confidence,
  setConfidence,
  chartWaitsForSlider = false,
}: Props) => {
  const { typical, text } = readySentences(summary, endYear, workEndYear);

  return (
    <div className="mb-3">
      {mode === 'ready' ? (
        <p className="mb-2">
          {[...text, ...successSentences(summary, workEndYear)].join(' ')}
        </p>
      ) : (
        <>
          <h4>When you could retire</h4>
          <p className="mb-2">
            {plannedRetirement && (
              <>
                The success rate above assumes you retire on{' '}
                {formatPlannedDate(plannedRetirement)} no matter how markets go.{' '}
              </>
            )}
            {typical !== undefined && (
              <>
                If you re-check every year and retire once your balance reaches the
                green ready line, you'd typically be ready by the end of{' '}
                <strong>{typical}</strong>.{' '}
              </>
            )}
            {text.join(' ')}
          </p>
        </>
      )}
      <Form.Group controlId="ready_line_confidence" style={{ maxWidth: '32rem' }}>
        <Form.Label className="mb-0">
          Desired success rate: {confidence}%
        </Form.Label>
        <Form.Range
          min={MIN_CONFIDENCE}
          max={MAX_CONFIDENCE}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
        />
        <Form.Text className="text-muted">
          The ready line is the balance, in today's dollars, that gives at
          least this chance of never running out if you retire that year.
          {chartWaitsForSlider &&
            ' The chart updates once you stop moving the slider.'}
        </Form.Text>
      </Form.Group>
    </div>
  );
};

export default ReadyLineSummary;
