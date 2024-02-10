import { useFetcher } from "react-router-dom";

export async function action() {
  const result = await new Promise((resolve) => setTimeout(() => resolve("Hello, world"), 1000));

  return result;
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="POST">
      <h1>Monte Carlo!</h1>
      <button type="submit">Submit</button>
    </fetcher.Form>
  );
}

export default MonteCarloPage;