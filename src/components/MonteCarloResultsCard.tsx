import { Card, Col, Form, Row } from "react-bootstrap";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useMemo, useState } from "react";
import MonteCarloGraph from "./MonteCarloGraph";
import SpinnerOverlay from "./SpinnerOverlay";
import { FetcherWithComponents } from "react-router-dom";

const MonteCarloResultsCard = ({ fetcher }: { fetcher: FetcherWithComponents<any> }) => {
  const results = fetcher.data as MonteCarloResult[];
  const loading = fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(true);
  const [onlyShowPercentiles, setOnlyShowPercentiles] = useState(false);

  const graph = useMemo(() => (
    <MonteCarloGraph
      results={results}
      inflationAdjusted={inflationAdjusted}
      onlyShowPercentiles={onlyShowPercentiles}
    />
  ), [results, inflationAdjusted, onlyShowPercentiles]);

  if (!results) return null;

  const successes = !!results && results.filter((result) => result.every(({ balance }) => balance >= 0));

  return (
    <Card border="secondary" className="m-2 bg-light">
      <Card.Header><h3 className="my-1">Your simulation succeeded {successes.length}/{results.length} times ({successes.length / results.length * 100}%)</h3></Card.Header>
      <Card.Body>
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
            </Form.Group>
          </Col>
          <Col xs="auto">
            <Form.Group>
              <Form.Check
                type="switch"
                label="Only show percentiles?"
                id="inflation_adjusted"
                checked={onlyShowPercentiles}
                onChange={(e) => setOnlyShowPercentiles(e.target.checked)}
              />
              <Form.Text>(This will speed up and simplify the graph)</Form.Text>
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