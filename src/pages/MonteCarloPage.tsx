import { ActionFunction, Link, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloResultsCard from "../components/MonteCarloResultsCard";
import IntroCard from "../components/IntroCard";
import { useState } from "react";
import { DEFAULT_CONFIDENCE } from "../calculators/MonteCarlo";

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();
  // The desired success rate, shared by the form's field and the results
  // slider: moving either one moves the other.
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE);

  return (
    <fetcher.Form id="monte-carlo-form" method="POST" noValidate>
      <div className="text-center m-2">
        <h1>PREtirement Planning - Monte Carlo Projections</h1>
        <p className="text-muted">
          <small>🔒 Runs entirely in your browser. Your data never leaves your device. <Link to="/about" target="_blank" rel="noopener noreferrer">Learn more</Link></small>
        </p>
        <IntroCard />
      </div>

      <MonteCarloForm fetcher={fetcher} confidence={confidence} setConfidence={setConfidence} />

      <MonteCarloResultsCard fetcher={fetcher} confidence={confidence} setConfidence={setConfidence} />
    </fetcher.Form>
  );
}

export default MonteCarloPage;