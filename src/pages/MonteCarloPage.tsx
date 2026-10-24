import { ActionFunction, Link, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloResultsCard from "../components/MonteCarloResultsCard";
import IntroCard from "../components/IntroCard";

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();

  return (
    <fetcher.Form id="monte-carlo-form" method="POST" noValidate>
      <div className="text-center m-2">
        <h1>PREtirement Planning - Monte Carlo Projections</h1>
        <p className="text-muted">
          <small>🔒 Runs entirely in your browser. Your data never leaves your device. <Link to="/about">Learn more</Link></small>
        </p>
        <IntroCard />
      </div>

      <MonteCarloForm fetcher={fetcher} />

      <MonteCarloResultsCard fetcher={fetcher} />
    </fetcher.Form>
  );
}

export default MonteCarloPage;