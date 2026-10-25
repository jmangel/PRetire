import { fireEvent, render, screen } from '@testing-library/react';
import MonteCarloResultsCard from './MonteCarloResultsCard';
import { AssetClass, Inflation, Job } from '../calculators/MonteCarloSimulation';
import { RetirementMode, simulatePlan } from '../calculators/MonteCarlo';

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

const renderCard = (mode: RetirementMode, endDate?: string) =>
  render(<MonteCarloResultsCard fetcher={{ data: simulatePlan(plan(mode, endDate)), state: 'idle' } as any} />);

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

  test('the slider keeps the form\'s confidence field in step', () => {
    const field = document.createElement('input');
    field.name = 'retirement[confidence]';
    field.value = '90';
    document.body.appendChild(field);
    renderCard('ready');

    fireEvent.change(screen.getByLabelText(/Desired success rate/), { target: { value: '75' } });

    expect(field.value).toBe('75');
    field.remove();
  });

  test('the ready line needs the inflation-adjusted view', () => {
    renderCard('ready');
    fireEvent.click(screen.getByLabelText('Adjust for inflation?'));

    expect(screen.getByText('(Turn this on to see the ready line)')).toBeInTheDocument();
  });
});
