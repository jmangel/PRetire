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
      <h1 className="text-center">Monte Carlo PRetirement Projections</h1>

      <MonteCarloForm fetcher={fetcher} />

      <MonteCarloResultsCard fetcher={fetcher} />
    </fetcher.Form>
  );
}

export default MonteCarloPage;