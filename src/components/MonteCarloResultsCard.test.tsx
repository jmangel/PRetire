import { fireEvent, render, screen } from '@testing-library/react';
import MonteCarloResultsCard from './MonteCarloResultsCard';
import MonteCarloSimulation, { AssetClass, Inflation, Job } from '../calculators/MonteCarloSimulation';
import { computeReadyLine } from '../calculators/ReadyLine';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = ResizeObserverStub;

const startYear = new Date().getFullYear() + 1;
const inputs = {
  startingBalance: 200000,
  monthlyExpenses: -3000,
  jobs: [
    new Job({
      name: '',
      postTaxAnnualIncome: '70000',
      adjustForInflation: 'on',
      yearlyRaisePercentage: '0',
      startDate: '',
      endDate: `${startYear + 12}-07-01`,
      atRetirement: 'stops',
    }),
  ],
  lifeEvents: [],
  assetClasses: [
    new AssetClass({
      name: 'Stocks',
      allocationPercentage: 100,
      averageAnnualReturnPercentage: 7,
      standardDeviationPercentage: 15,
    }),
  ],
  inflation: new Inflation({ averageAnnualReturnPercentage: 2.5, standardDeviationPercentage: 1 }),
  endYear: startYear + 40,
};

const response = () => {
  const simulate = () =>
    new MonteCarloSimulation(
      inputs.startingBalance, inputs.monthlyExpenses, inputs.jobs, inputs.lifeEvents,
      inputs.assetClasses, inputs.inflation, inputs.endYear
    );
  return {
    results: [...Array(20)].map(() => simulate().run()),
    deterministicResult: simulate().runDeterministic(),
    readyLine: computeReadyLine({ ...inputs, futures: 20, sequences: 50 }),
  };
};

const renderCard = () =>
  render(<MonteCarloResultsCard fetcher={{ data: response(), state: 'idle' } as any} />);

describe('MonteCarloResultsCard', () => {
  test('the success rate stays on the plan when showing keep-working futures', () => {
    renderCard();
    const headline = () => screen.getByText(/Your simulation succeeded/).textContent;
    const before = headline();

    fireEvent.click(screen.getByLabelText('Keep working until ready'));

    expect(screen.getByLabelText('Keep working until ready')).toBeChecked();
    expect(headline()).toBe(before);
  });

  test('keep-working view needs the inflation-adjusted view', () => {
    renderCard();
    fireEvent.click(screen.getByLabelText('Keep working until ready'));

    fireEvent.click(screen.getByLabelText('Adjust for inflation?'));

    expect(screen.getByLabelText('Keep working until ready')).toBeDisabled();
    expect(screen.getByLabelText('Keep working until ready')).not.toBeChecked();
    expect(screen.getByText(/Needs "Adjust for inflation\?" on/)).toBeInTheDocument();
  });
});
