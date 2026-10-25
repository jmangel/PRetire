import { Card, Col, Form, Row } from "react-bootstrap";
import { useEffect, useMemo, useState } from "react";
import MonteCarloGraph, { ReadyLineSeries } from "./MonteCarloGraph";
import SpinnerOverlay from "./SpinnerOverlay";
import ReadyLineSummary, { readyHeadline } from "./ReadyLineSummary";
import { FetcherWithComponents } from "react-router-dom";
import { DEFAULT_CONFIDENCE, MonteCarloResponse } from "../calculators/MonteCarlo";
import { readyFutures, readyLineAt, readyOutcomes, summarizeReadyYears } from "../calculators/ReadyLine";

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

const MonteCarloResultsCard = ({ fetcher }: { fetcher: FetcherWithComponents<any> }) => {
  const response = (fetcher.data as MonteCarloResponse) || null;
  const loading = fetcher.state === 'loading' || fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [onlyShowPercentiles, setOnlyShowPercentiles] = useState(true);
  // On by default: the max (and min) future sets the y-axis on its own, which
  // flattens the other percentile lines and the ready line near the bottom.
  const [excludeMinMax, setExcludeMinMax] = useState(true);
  const [onlyShowDeterministicLine, setOnlyShowDeterministicLine] = useState(false);
  // Off by default, since a log scale is less familiar. On a linear scale,
  // though, the futures that grow to tens of millions by the end year can
  // flatten everything else, including the ready line, near the bottom.
  const [logScale, setLogScale] = useState(false);
  const [confidence, setConfidenceState] = useState(response?.confidence ?? DEFAULT_CONFIDENCE);

  // Start from the confidence each run was made with.
  useEffect(() => {
    if (response) setConfidenceState(response.confidence);
  }, [response]);

  // The slider and the form's confidence field are one setting: keep the
  // form in step, so exporting the settings or running again uses the
  // confidence shown here.
  const setConfidence = (value: number) => {
    setConfidenceState(value);
    const field = document.querySelector<HTMLInputElement>('[name="retirement[confidence]"]');
    if (field) field.value = String(value);
  };

  const readyLineData = response?.readyLine;
  const retiresWhenReady = response?.mode === 'ready' && !!readyLineData;

  // Changing the confidence only replays futures already drawn; nothing is
  // re-sampled. The summary and the slider's label always follow the slider
  // live.
  const readyLine = useMemo(
    () => (readyLineData ? readyLineAt(readyLineData, confidence / 100) : undefined),
    [readyLineData, confidence]
  );
  const readySummary = useMemo(
    () => (readyLineData && readyLine ? summarizeReadyYears(readyOutcomes(readyLineData, readyLine)) : undefined),
    [readyLineData, readyLine]
  );

  // The chart uses its own confidence. When it only moves the ready line (a
  // fixed date, percentiles view), a redraw takes tens of milliseconds, so it
  // follows the slider live. Otherwise it waits until the slider has been
  // still for SLIDER_SETTLE_MS: with every future drawn each redraw takes
  // about 25 seconds, and retiring when ready re-runs every future. Everything
  // that feeds the chart reads only chartConfidence; reading the live value
  // anywhere below would make it redraw on every step again.
  const settledConfidence = useSettledValue(confidence, SLIDER_SETTLE_MS);
  const chartFollowsLive = onlyShowPercentiles && !retiresWhenReady;
  const chartConfidence = chartFollowsLive ? confidence : settledConfidence;

  // Retiring when ready, the futures themselves depend on the confidence.
  const chartFutures = useMemo(() => {
    if (!response) return undefined;
    if (!retiresWhenReady || !readyLineData || chartConfidence === response.confidence) {
      return { results: response.results, deterministicResult: response.deterministicResult };
    }
    return readyFutures(readyLineData, readyLineAt(readyLineData, chartConfidence / 100));
  }, [response, retiresWhenReady, readyLineData, chartConfidence]);
  const results = useMemo(() => chartFutures?.results ?? [], [chartFutures]);
  const deterministicResult = chartFutures?.deterministicResult;

  const chartSummary = useMemo(
    () =>
      retiresWhenReady && readyLineData
        ? summarizeReadyYears(readyOutcomes(readyLineData, readyLineAt(readyLineData, chartConfidence / 100)))
        : undefined,
    [retiresWhenReady, readyLineData, chartConfidence]
  );

  const readyLineSeries = useMemo((): ReadyLineSeries | undefined => {
    // The line is in today's dollars, so it only lines up with adjusted balances.
    if (!readyLineData || !inflationAdjusted) return undefined;
    return {
      values: readyLineAt(readyLineData, chartConfidence / 100),
      startYear: readyLineData.startYear,
      // Futures that retire on a fixed date are retired after it, so the line
      // stops there. Retiring when ready, it stops once 9 in 10 are ready.
      lastYear: retiresWhenReady
        ? chartSummary?.p90
        : readyLineData.plannedRetirement?.getUTCFullYear(),
      label: `Ready line (${chartConfidence}%)`,
    };
  }, [readyLineData, inflationAdjusted, retiresWhenReady, chartSummary, chartConfidence]);

  const graph = useMemo(() => (
    <MonteCarloGraph
      results={results}
      deterministicResult={deterministicResult}
      inflationAdjusted={inflationAdjusted}
      onlyShowPercentiles={onlyShowPercentiles}
      excludeMinMax={excludeMinMax}
      onlyShowDeterministicLine={onlyShowDeterministicLine}
      readyLine={readyLineSeries}
      plannedRetirementYear={
        retiresWhenReady ? chartSummary?.median : readyLineData?.plannedRetirement?.getUTCFullYear()
      }
      retirementLabel={retiresWhenReady ? 'Typically ready' : undefined}
      logScale={logScale}
    />
  ), [results, deterministicResult, inflationAdjusted, onlyShowPercentiles, excludeMinMax, onlyShowDeterministicLine, readyLineSeries, retiresWhenReady, chartSummary, readyLineData, logScale]);

  if (!response || response.results.length === 0) return null;

  const workEndYear = readyLineData?.workEnd?.getUTCFullYear();
  // With a fixed date, the success rate is for the plan as entered.
  const planResults = response.results;
  const successes = planResults.filter((result) => result.every(({ balance }) => balance >= 0));

  return (
    <Card border="secondary" className="m-2 bg-light">
      <Card.Header>
        <h3 className="my-1">
          {retiresWhenReady && readySummary && readyLineData
            ? readyHeadline(readySummary, readyLineData.endYear, workEndYear)
            : `Your simulation succeeded ${successes.length}/${planResults.length} times (${successes.length / planResults.length * 100}%)`}
        </h3>
      </Card.Header>
      <Card.Body>
        {readyLineData && readySummary && (
          <ReadyLineSummary
            mode={retiresWhenReady ? 'ready' : 'date'}
            summary={readySummary}
            endYear={readyLineData.endYear}
            workEndYear={workEndYear}
            plannedRetirement={readyLineData.plannedRetirement}
            confidence={confidence}
            setConfidence={setConfidence}
            chartWaitsForSlider={!chartFollowsLive}
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
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Log scale?"
                id="log_scale"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
              />
              <Form.Text>
                {logScale
                  ? '(Fits small and huge balances; below $1,000 shows at the bottom)'
                  : '(Turn on if the ready line is squashed at the bottom)'}
              </Form.Text>
            </Form.Group>
          </Col>
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
