import { Button, Spinner } from "react-bootstrap";
import { useFetcher } from "react-router-dom";

export async function action() {
  const result = await new Promise((resolve) => setTimeout(() => resolve("Hello, world"), 1000));

  return result;
}

const MonteCarloPage = () => {
  const fetcher = useFetcher();
  const loading = fetcher.state === 'submitting'
  const succeeded = fetcher.state === 'idle' && !!fetcher.data;

  return (
    <fetcher.Form method="POST">
      <h1>Monte Carlo!</h1>
      <Button type="submit">Submit</Button>

      {loading && (<p><Spinner animation="grow" /></p>)}
      {succeeded && <p>Success! {fetcher.data}</p>}
    </fetcher.Form>
  );
}

export default MonteCarloPage;