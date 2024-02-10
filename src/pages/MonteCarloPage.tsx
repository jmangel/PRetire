import { Col, Form, Row, Spinner } from "react-bootstrap";
import { ActionFunction, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloGraph from "../components/MonteCarloGraph";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useMemo, useState } from "react";


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

          <div style={{ position: 'relative' }}>
            {graph}
            {loading && (
              <div style={{ display: 'block', position: 'absolute', height: '100%', background: 'rgba(0, 0, 0, 0.5)', top: 0, left: 0, right: 0 }}>
                <Spinner animation="grow" variant="light" style={{ position: 'absolute', top: '50%', left: '50%' }} />
              </div>
            )}
          </div>
        </>
      )}
    </fetcher.Form>
  );
}

export default MonteCarloPage;