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

/** Plain-language description of when the futures are ready. */
export const readySentences = (
  summary: Pick<ReadyYearSummary, 'p25' | 'median' | 'p75' | 'p90' | 'neverReady'> & { forcedOut?: number },
  endYear: number,
  workEndYear?: number
): { typical?: number; text: string[] } => {
  const { p25, median, p75, p90, neverReady, forcedOut = 0 } = summary;
  const forcedSentence =
    workEndYear !== undefined && percent(forcedOut) > 0
      ? `About ${percent(forcedOut)}% of these futures aren't ready by ${workEndYear}, when your work income ends, so they retire then anyway.`
      : undefined;

  if (median === undefined) {
    if (forcedOut > 0.5 && workEndYear !== undefined) {
      return {
        text: [
          `Most of these futures aren't ready by ${workEndYear}, when your work income ends, so they retire then anyway.`,
          'Try a lower confidence, lower expenses, or a later end date for your work income.',
        ],
      };
    }
    return {
      text: [
        `Most of these futures don't reach the ready line before ${endYear}.`,
        'Try a lower confidence, lower expenses, or a later ending year.',
      ],
    };
  }

  const text = [];
  if (p25 !== undefined && p75 !== undefined) {
    text.push(`Half of these futures are ready between ${p25} and ${p75}.`);
  }
  if (p90 !== undefined) {
    text.push(`9 in 10 are ready by ${p90}.`);
  } else if (percent(neverReady - forcedOut) > 0) {
    // More than 1 in 10 never reach the line; say how many, so the page
    // doesn't understate the risk.
    text.push(`About ${percent(neverReady - forcedOut)}% of these futures aren't ready before ${endYear}.`);
  }
  if (forcedSentence) text.push(forcedSentence);

  return { typical: median, text };
};

/** The results' headline in "retire when ready" plans. */
export const readyHeadline = (summary: ReadyYearSummary, endYear: number, workEndYear?: number) => {
  if (summary.median !== undefined) {
    return `You'd typically be ready to retire by the end of ${summary.median}`;
  }
  if (summary.forcedOut > 0.5 && workEndYear !== undefined) {
    return `Most futures aren't ready before your work income ends in ${workEndYear}`;
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
          {text.join(' ')}{' '}
          If you re-check every year and retire once your balance reaches the
          green ready line, the money lasts in{' '}
          <strong>{percent(summary.successRate)}%</strong> of these futures.
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
          Confidence you won't run out: {confidence}%
        </Form.Label>
        <Form.Range
          min={MIN_CONFIDENCE}
          max={MAX_CONFIDENCE}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
        />
        <Form.Text className="text-muted">
          The ready line is the balance, in today's dollars, that gives this
          chance of never running out if you retire that year.
          {chartWaitsForSlider &&
            ' The chart updates once you stop moving the slider.'}
        </Form.Text>
      </Form.Group>
    </div>
  );
};

export default ReadyLineSummary;
