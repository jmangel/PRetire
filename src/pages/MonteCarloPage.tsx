import { Col, Form, Spinner } from "react-bootstrap";
import { ActionFunction, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloGraph from "../components/MonteCarloGraph";
import { MonteCarloResult } from "../calculators/MonteCarloSimulation";
import { useState } from "react";


export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();
  const loading = fetcher.state === 'submitting';

  const [inflationAdjusted, setInflationAdjusted] = useState(false);

  return (
    <fetcher.Form method="POST">
      <MonteCarloForm fetcher={fetcher} />

      {loading && (<p><Spinner animation="grow" /></p>)}

      {!!fetcher.data && (
        <>
          {
            inflationAdjusted ? (
              <h5>All data in graph adjusts for inflation and dollars shown are adjusted to today's dollars.</h5>
            ) : (
              <h5>All data in graph include inflation increases and dollars shown are <strong>not</strong> adjusted to today's dollars.</h5>
            )
          }
          <Col xs={12} sm={2}>
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

          <MonteCarloGraph results={fetcher.data as MonteCarloResult[]} inflationAdjusted={inflationAdjusted} />
        </>
      )}
    </fetcher.Form>
  );
}

export default MonteCarloPage;