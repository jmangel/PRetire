import { Card, Col, Form, Row } from "react-bootstrap";
import { useEffect, useMemo, useState } from "react";
import MonteCarloGraph, { ReadyLineSeries } from "./MonteCarloGraph";
import SpinnerOverlay from "./SpinnerOverlay";
import ReadyLineSummary from "./ReadyLineSummary";
import { FetcherWithComponents } from "react-router-dom";
import { MonteCarloResponse } from "../calculators/MonteCarlo";
import { readyLineAt, readyYears, summarizeReadyYears } from "../calculators/ReadyLine";

/** How long the slider must be still before a slow chart redraws. */
export const SLIDER_SETTLE_MS = 300;

/**
 * The value once it has stopped changing for delayMs. Covers mouse, touch,
 * and keyboard alike: arrow-key presses keep resetting the wait, just like
 * dragging does.
 */
export const useSettledValue = <T,>(value: T, delayMs: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
};

/**
 * Last year to show in the keep-working view. Those futures grow huge by the
 * end year, which flattens the ready line, so zoom in to a few years past
 * when 9 in 10 are ready (or the planned retirement, if that's later). If
 * more than 1 in 10 are never ready, show everything up to the end year.
 */
export const keepWorkingChartLastYear = (
  endYear: number,
  p90?: number,
  plannedRetirementYear?: number
) => Math.min(endYear, Math.max(p90 ?? endYear, plannedRetirementYear ?? 0) + 5);

const MonteCarloResultsCard = ({ fetcher }: { fetcher: FetcherWithComponents<any> }) => {
  const response = (fetcher.data as MonteCarloResponse) || null;
  const readyLineData = response?.readyLine;
  const loading = fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [onlyShowPercentiles, setOnlyShowPercentiles] = useState(true);
  // On by default: the max (and min) future sets the y-axis on its own, which
  // flattens the other percentile lines and the ready line near the bottom.
  const [excludeMinMax, setExcludeMinMax] = useState(true);
  const [onlyShowDeterministicLine, setOnlyShowDeterministicLine] = useState(false);
  const [confidence, setConfidence] = useState(90);
  // Kept while the switch is disabled (with "Adjust for inflation" off) on
  // purpose: turning inflation back on returns to the view you had.
  const [showKeepWorking, setShowKeepWorking] = useState(false);

  // With no planned retirement date, the plan already keeps working, so
  // there's nothing different to switch to. The view exists to show where
  // futures cross the ready line, which is in today's dollars, so it needs
  // the inflation-adjusted view.
  const canShowKeepWorking = !!readyLineData?.plannedRetirement;
  const keepWorking = showKeepWorking && canShowKeepWorking && inflationAdjusted;
  const results = useMemo(
    () => (keepWorking && readyLineData ? readyLineData.workingResults : response?.results) ?? [],
    [keepWorking, readyLineData, response]
  );
  const deterministicResult = keepWorking && readyLineData
    ? readyLineData.workingDeterministicResult
    : response?.deterministicResult;

  // Changing the confidence only re-reads sorted data; nothing is re-simulated.
  // The summary and the slider's label always follow the slider live.
  const readyLine = useMemo(
    () => (readyLineData ? readyLineAt(readyLineData, confidence / 100) : undefined),
    [readyLineData, confidence]
  );
  const readySummary = useMemo(
    () => (readyLineData && readyLine ? summarizeReadyYears(readyYears(readyLineData, readyLine)) : undefined),
    [readyLineData, readyLine]
  );

  // The chart's ready line uses its own confidence. In the default percentiles
  // view a redraw takes tens of milliseconds, so it follows the slider live.
  // With every future drawn, each redraw takes about 25 seconds, so the chart
  // waits until the slider has been still for SLIDER_SETTLE_MS. Everything
  // that feeds the chart reads only chartConfidence; reading the live value
  // anywhere below would make it redraw on every step again.
  const settledConfidence = useSettledValue(confidence, SLIDER_SETTLE_MS);
  const chartConfidence = onlyShowPercentiles ? confidence : settledConfidence;
  const readyLineSeries = useMemo((): ReadyLineSeries | undefined => {
    // The line is in today's dollars, so it only lines up with adjusted balances.
    if (!readyLineData || !inflationAdjusted) return undefined;
    const values = readyLineAt(readyLineData, chartConfidence / 100);
    const plannedYear = readyLineData.plannedRetirement?.getUTCFullYear();
    return {
      values,
      startYear: readyLineData.startYear,
      // Futures that retire as planned are retired after that year, so the
      // line stops there unless the keep-working futures are shown.
      lastYear: keepWorking ? undefined : plannedYear,
      chartLastYear: keepWorking
        ? keepWorkingChartLastYear(
            readyLineData.endYear,
            summarizeReadyYears(readyYears(readyLineData, values)).p90,
            plannedYear
          )
        : undefined,
      label: `Ready line (${chartConfidence}%)`,
    };
  }, [readyLineData, inflationAdjusted, keepWorking, chartConfidence]);

  const graph = useMemo(() => (
    <MonteCarloGraph
      results={results}
      deterministicResult={deterministicResult}
      inflationAdjusted={inflationAdjusted}
      onlyShowPercentiles={onlyShowPercentiles}
      excludeMinMax={excludeMinMax}
      onlyShowDeterministicLine={onlyShowDeterministicLine}
      readyLine={readyLineSeries}
      plannedRetirementYear={readyLineData?.plannedRetirement?.getUTCFullYear()}
    />
  ), [results, deterministicResult, inflationAdjusted, onlyShowPercentiles, excludeMinMax, onlyShowDeterministicLine, readyLineSeries, readyLineData]);

  if (!response || response.results.length === 0) return null;

  // The success rate is always for the plan as entered, even when the chart
  // shows the keep-working futures.
  const planResults = response.results;
  const successes = planResults.filter((result) => result.every(({ balance }) => balance >= 0));

  return (
    <Card border="secondary" className="m-2 bg-light">
      <Card.Header><h3 className="my-1">Your simulation succeeded {successes.length}/{planResults.length} times ({successes.length / planResults.length * 100}%)</h3></Card.Header>
      <Card.Body>
        {readyLineData && readySummary && (
          <ReadyLineSummary
            summary={readySummary}
            endYear={readyLineData.endYear}
            plannedRetirement={readyLineData.plannedRetirement}
            confidence={confidence}
            setConfidence={setConfidence}
            chartWaitsForSlider={!onlyShowPercentiles}
          />
        )}
        {
          inflationAdjusted ? (
            <h5>All data in graph adjusts for inflation and dollars shown are adjusted to today's dollars.</h5>
          ) : (
            <h5>All data in graph include inflation increases and dollars shown are <strong>not</strong> adjusted to today's dollars.</h5>
          )
        }
        <Row>
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Adjust for inflation?"
                id="inflation_adjusted"
                checked={inflationAdjusted}
                onChange={(e) => setInflationAdjusted(e.target.checked)}
              />
              {readyLineData && !inflationAdjusted && (
                <Form.Text>(Turn this on to see the ready line)</Form.Text>
              )}
            </Form.Group>
          </Col>
          {canShowKeepWorking && (
            <Col xs="auto">
              <Form.Group>
                <Form.Check
                  type="switch"
                  label="Keep working until ready"
                  id="show_keep_working"
                  checked={keepWorking}
                  disabled={!inflationAdjusted}
                  onChange={(e) => setShowKeepWorking(e.target.checked)}
                />
                <Form.Text>
                  {inflationAdjusted
                    ? '(Shows futures that keep working past your planned retirement, zoomed in to when they reach the ready line)'
                    : '(Needs "Adjust for inflation?" on, since the ready line is in today\'s dollars)'}
                </Form.Text>
              </Form.Group>
            </Col>
          )}
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Only show percentiles?"
                id="only_show_percentiles"
                checked={onlyShowPercentiles}
                onChange={(e) => setOnlyShowPercentiles(e.target.checked)}
                disabled={onlyShowDeterministicLine}
              />
              <Form.Text>(This will speed up and simplify the graph)</Form.Text>
            </Form.Group>
          </Col>
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Exclude min/max from graph?"
                id="exclude_min_max"
                checked={excludeMinMax}
                onChange={(e) => setExcludeMinMax(e.target.checked)}
                disabled={!onlyShowPercentiles || onlyShowDeterministicLine}
              />
              <Form.Text>(Still shows the other percentile lines)</Form.Text>
            </Form.Group>
          </Col>
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Only show deterministic average trajectory"
                id="only_show_deterministic_line"
                checked={onlyShowDeterministicLine}
                onChange={(e) => setOnlyShowDeterministicLine(e.target.checked)}
                disabled={!deterministicResult}
              />
              <Form.Text>
                (Hides other lines so you can compare the Monte Carlo envelope against an isolated average path.)
              </Form.Text>
            </Form.Group>
          </Col>
        </Row>

        <SpinnerOverlay loading={loading}>
          {graph}
        </SpinnerOverlay>
      </Card.Body>
    </Card>
  )
};

export default MonteCarloResultsCard;
