import { Card, Col, Form, Row } from "react-bootstrap";
import { useMemo, useState } from "react";
import MonteCarloGraph, { ReadyLineSeries } from "./MonteCarloGraph";
import SpinnerOverlay from "./SpinnerOverlay";
import ReadyLineSummary from "./ReadyLineSummary";
import { FetcherWithComponents } from "react-router-dom";
import { MonteCarloResponse } from "../calculators/MonteCarlo";
import { readyLineAt, readyYears, summarizeReadyYears } from "../calculators/ReadyLine";

const MonteCarloResultsCard = ({ fetcher }: { fetcher: FetcherWithComponents<any> }) => {
  const response = (fetcher.data as MonteCarloResponse) || null;
  const readyLineData = response?.readyLine;
  const loading = fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [onlyShowPercentiles, setOnlyShowPercentiles] = useState(true);
  const [excludeMinMax, setExcludeMinMax] = useState(false);
  const [onlyShowDeterministicLine, setOnlyShowDeterministicLine] = useState(false);
  const [confidence, setConfidence] = useState(90);
  const [showKeepWorking, setShowKeepWorking] = useState(false);

  // With no planned retirement date, the plan already keeps working, so
  // there's nothing different to switch to.
  const canShowKeepWorking = !!readyLineData?.plannedRetirement;
  const keepWorking = showKeepWorking && canShowKeepWorking;
  const results = useMemo(
    () => (keepWorking ? readyLineData!.workingResults : response?.results) ?? [],
    [keepWorking, readyLineData, response]
  );
  const deterministicResult = keepWorking
    ? readyLineData!.workingDeterministicResult
    : response?.deterministicResult;

  // Changing the confidence only re-reads sorted data; nothing is re-simulated.
  const readyLine = useMemo(
    () => (readyLineData ? readyLineAt(readyLineData, confidence / 100) : undefined),
    [readyLineData, confidence]
  );
  const readySummary = useMemo(
    () => (readyLineData && readyLine ? summarizeReadyYears(readyYears(readyLineData, readyLine)) : undefined),
    [readyLineData, readyLine]
  );
  const readyLineSeries = useMemo((): ReadyLineSeries | undefined => {
    // The line is in today's dollars, so it only lines up with adjusted balances.
    if (!readyLineData || !readyLine || !inflationAdjusted) return undefined;
    return {
      values: readyLine,
      startYear: readyLineData.startYear,
      // Futures that retire as planned are retired after that year, so the
      // line stops there unless the keep-working futures are shown.
      lastYear: keepWorking ? undefined : readyLineData.plannedRetirement?.getUTCFullYear(),
      // Futures that keep working grow huge by the end year, which flattens
      // the ready line. Zoom in to a few years past when 9 in 10 are ready.
      chartLastYear: keepWorking
        ? Math.min(
            readyLineData.endYear,
            Math.max(
              readySummary?.p90 ?? readyLineData.endYear,
              readyLineData.plannedRetirement?.getUTCFullYear() ?? 0
            ) + 5
          )
        : undefined,
      label: `Ready line (${confidence}%)`,
    };
  }, [readyLineData, readyLine, readySummary, inflationAdjusted, keepWorking, confidence]);

  const graph = useMemo(() => (
    <MonteCarloGraph
      results={results}
      deterministicResult={deterministicResult}
      inflationAdjusted={inflationAdjusted}
      onlyShowPercentiles={onlyShowPercentiles}
      excludeMinMax={excludeMinMax}
      onlyShowDeterministicLine={onlyShowDeterministicLine}
      readyLine={readyLineSeries}
    />
  ), [results, deterministicResult, inflationAdjusted, onlyShowPercentiles, excludeMinMax, onlyShowDeterministicLine, readyLineSeries]);

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
                  checked={showKeepWorking}
                  onChange={(e) => setShowKeepWorking(e.target.checked)}
                />
                <Form.Text>
                  (Shows futures that keep working past your planned retirement,
                  zoomed in to when they reach the ready line)
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
