import { Col, Form, Row } from "react-bootstrap";
import { ActionFunction, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloGraph from "../components/MonteCarloGraph";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useMemo, useState } from "react";
import SpinnerOverlay from "../components/SpinnerOverlay";

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();
  const loading = fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(false);
  const [onlyShowPercentiles, setOnlyShowPercentiles] = useState(false);

  const graph = useMemo(() => (
    <MonteCarloGraph results={fetcher.data as MonteCarloResult[]} inflationAdjusted={inflationAdjusted} onlyShowPercentiles={onlyShowPercentiles} />
  ), [fetcher.data, inflationAdjusted, onlyShowPercentiles]);

  return (
    <fetcher.Form method="POST">
      <MonteCarloForm fetcher={fetcher} />

      {!!fetcher.data && (
        <>
          {
            inflationAdjusted ? (
              <h5>All data in graph adjusts for inflation and dollars shown are adjusted to today's dollars.</h5>
            ) : (
              <h5>All data in graph include inflation increases and dollars shown are <strong>not</strong> adjusted to today's dollars.</h5>
            )
          }
          <Row>
            <Col xs={12} sm={6}>
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
            <Col xs={12} sm={6}>
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
        </>
      )}
    </fetcher.Form>
  );
}

export default MonteCarloPage;