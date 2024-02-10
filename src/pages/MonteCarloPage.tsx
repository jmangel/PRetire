import { ActionFunction, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloResultsCard from "../components/MonteCarloResultsCard";
import { Accordion } from "react-bootstrap";

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="POST" noValidate>
      <div className="text-center m-2">
        <h1>PREtirement Planning - Monte Carlo Projections</h1>
        <p><em>Your data stays with you. All computation is done on your browser and your data never leaves your device.</em></p>
        <h4>Fully configure your Monte Carlo simulations</h4>
        <Accordion>
          <Accordion.Item eventKey="income">
            <Accordion.Header>Unlimited time-bound income sources</Accordion.Header>
            <Accordion.Body>
              Most retirement projections start from the retirement date.
              With PREtire, you can <b>configure as many income sources as you want across different dates</b>,
              so you can plan ahead whether you're just starting your career,
              considering a move to a slower-paced job,
              or ready to semi-retire before you give up work completely.
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="lifeEvents">
            <Accordion.Header>Plan for big purchases, sales, or other changes</Accordion.Header>
            <Accordion.Body>
              Planning to sell your house in a couple years, then rent for a year, then maybe buy a bigger house?
              Plug all your planned sales, purchases, and changes to monthly expenses into the
              Life Events settings tab and see the projection graphs adjust to your plans.
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="allocation">
            <Accordion.Header>Fully customize your asset allocation</Accordion.Header>
            <Accordion.Body>
              Set up as many asset classes as you like, and make adjustments to the simulator even down to the standard deviation of each asset class.
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </div>

      <MonteCarloForm fetcher={fetcher} />

      <MonteCarloResultsCard fetcher={fetcher} />
    </fetcher.Form>
  );
}

export default MonteCarloPage;