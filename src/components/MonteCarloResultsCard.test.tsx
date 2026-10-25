import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MonteCarloForm from './MonteCarloForm';
import MonteCarloResultsCard from './MonteCarloResultsCard';
import { AssetClass, Inflation, Job } from '../calculators/PlanInputs';
import { MonteCarloResponse, RetirementMode, simulatePlan } from '../calculators/MonteCarlo';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = ResizeObserverStub;

const startYear = new Date().getFullYear() + 1;
const plan = (mode: RetirementMode, endDate = '') => ({
  startingBalance: 200000,
  monthlyExpenses: -3000,
  jobs: [
    new Job({
      name: '',
      postTaxAnnualIncome: '70000',
      adjustForInflation: 'on',
      startDate: '',
      endDate,
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
  startYear,
  endYear: startYear + 40,
  mode,
  confidence: 90,
  plannedRetirement: mode === 'date' ? new Date(`${startYear + 12}-07-01`) : undefined,
  futures: 20,
  sequences: 50,
});

// The page shares the desired success rate between the form and the
// results; this stands in for it.
const CardWithSuccessRate = ({ data }: { data: MonteCarloResponse }) => {
  const [confidence, setConfidence] = useState(90);
  return (
    <MonteCarloResultsCard
      fetcher={{ data, state: 'idle' } as any}
      confidence={confidence}
      setConfidence={setConfidence}
    />
  );
};

const renderCard = (mode: RetirementMode, endDate?: string) =>
  render(<CardWithSuccessRate data={simulatePlan(plan(mode, endDate))} />);

describe('MonteCarloResultsCard', () => {
  test('retiring when ready leads with the typical ready year and how often the money lasts', () => {
    renderCard('ready');

    expect(screen.getByRole('heading', { level: 3 }).textContent).toMatch(
      /^You'd typically be ready to retire by the end of \d{4}$/
    );
    expect(screen.getByText(/the money lasts in/)).toBeInTheDocument();
    expect(screen.queryByText(/Your simulation succeeded/)).not.toBeInTheDocument();
  });

  test('a fixed date leads with the success rate, as before', () => {
    renderCard('date');

    expect(screen.getByText(/Your simulation succeeded \d+\/20 times/)).toBeInTheDocument();
    expect(screen.getByText('When you could retire')).toBeInTheDocument();
    expect(screen.getByText(/assumes you retire on July 1/)).toBeInTheDocument();
  });

  test('there is no separate keep-working view any more', () => {
    renderCard('date');
    expect(screen.queryByLabelText('Keep working until ready')).not.toBeInTheDocument();
  });

  test('the slider and the form field are one setting', () => {
    const Page = () => {
      const [confidence, setConfidence] = useState(90);
      return (
        <form id="monte-carlo-form">
          <MonteCarloForm fetcher={{ state: 'idle' } as any} confidence={confidence} setConfidence={setConfidence} />
          <MonteCarloResultsCard
            fetcher={{ data: simulatePlan(plan('ready')), state: 'idle' } as any}
            confidence={confidence}
            setConfidence={setConfidence}
          />
        </form>
      );
    };
    render(<Page />);
    const field = screen.getByLabelText('Desired success rate');
    const slider = screen.getByLabelText(/Desired success rate: /);

    fireEvent.change(slider, { target: { value: '75' } });
    expect(field).toHaveValue(75);

    fireEvent.change(field, { target: { value: '82' } });
    expect(slider).toHaveValue('82');
    expect(screen.getByText('Desired success rate: 82%')).toBeInTheDocument();
  });

  test('the ready line needs the inflation-adjusted view', () => {
    renderCard('ready');
    fireEvent.click(screen.getByLabelText('Adjust for inflation?'));

    expect(screen.getByText('(Turn this on to see the ready line)')).toBeInTheDocument();
  });
});
