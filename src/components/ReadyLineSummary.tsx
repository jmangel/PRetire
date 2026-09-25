import { Form } from 'react-bootstrap';
import { ReadyYearSummary } from '../calculators/ReadyLine';

export const formatPlannedDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    timeZone: 'UTC', // date inputs are parsed as UTC midnight
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/** Plain-language description of when the keep-working futures are ready. */
export const readySentences = (
  summary: ReadyYearSummary,
  endYear: number
): { typical?: number; text: string[] } => {
  const { p25, median, p75, p90, neverReady } = summary;

  if (median === undefined) {
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
  text.push(
    p90 !== undefined
      ? `9 in 10 are ready by ${p90}.`
      : // More than 1 in 10 never reach the line; say how many, so the page
        // doesn't understate the risk.
        `About ${Math.round(neverReady * 100)}% of these futures aren't ready before ${endYear}.`
  );

  return { typical: median, text };
};

type Props = {
  summary: ReadyYearSummary;
  endYear: number;
  plannedRetirement?: Date;
  confidence: number;
  setConfidence: (confidence: number) => void;
};

const ReadyLineSummary = ({
  summary,
  endYear,
  plannedRetirement,
  confidence,
  setConfidence,
}: Props) => {
  const { typical, text } = readySentences(summary, endYear);

  return (
    <div className="mb-3">
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
      <Form.Group controlId="ready_line_confidence" style={{ maxWidth: '32rem' }}>
        <Form.Label className="mb-0">
          Confidence you won't run out: {confidence}%
        </Form.Label>
        <Form.Range
          min={50}
          max={99}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
        />
        <Form.Text className="text-muted">
          The ready line is the balance, in today's dollars, that gives this
          chance of never running out if you retire that year.
        </Form.Text>
      </Form.Group>
    </div>
  );
};

export default ReadyLineSummary;
