import { ActionFunction, useFetcher } from "react-router-dom";
import MonteCarloForm from "../components/MonteCarloForm";
import runMonteCarlo from "../calculators/MonteCarlo";
import MonteCarloResultsCard from "../components/MonteCarloResultsCard";

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();

  return await runMonteCarlo(formData);
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="POST" noValidate>
      <div className="text-center m-2">
        <h1>Monte Carlo PRetirement Projections</h1>
        <p>Your data stays with you. All computation is done on your browser and your data never leaves your device.</p>
      </div>

      <MonteCarloForm fetcher={fetcher} />

      <MonteCarloResultsCard fetcher={fetcher} />
    </fetcher.Form>
  );
}

export default MonteCarloPage;