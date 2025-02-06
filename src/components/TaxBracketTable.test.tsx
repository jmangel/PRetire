import React from 'react';
import { render, screen } from '@testing-library/react';
import TaxBracketTable from './TaxBracketTable';
import { TaxBracketSet } from '../calculators/TaxCalculator';

describe('TaxBracketTable', () => {
  const sampleTaxBracketSet: TaxBracketSet = {
    name: 'Test Brackets',
    year: 2024,
    brackets: [
      { upperBound: 10000, rate: 0.1, cumulativeTaxAtStart: 0 },
      { upperBound: 50000, rate: 0.2, cumulativeTaxAtStart: 1000 },
      { upperBound: null, rate: 0.3, cumulativeTaxAtStart: 9000 },
    ],
  };

  it('renders all tax brackets', () => {
    render(<TaxBracketTable taxBracketSet={sampleTaxBracketSet} />);

    // Check headers
    expect(screen.getByText('Income Range')).toBeInTheDocument();
    expect(screen.getByText('Rate')).toBeInTheDocument();
    expect(screen.getByText('Maximum Tax in Bracket')).toBeInTheDocument();

    // Check first bracket
    expect(screen.getByText(/\$0 -/)).toBeInTheDocument();
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();

    // Check middle bracket
    expect(screen.getByText(/\$10,000 -/)).toBeInTheDocument();
    expect(screen.getByText('20.00%')).toBeInTheDocument();
    expect(screen.getByText('$9,000')).toBeInTheDocument();

    // Check highest bracket
    expect(screen.getByText(/\$50,000 - ∞/)).toBeInTheDocument();
    expect(screen.getByText('30.00%')).toBeInTheDocument();
    expect(screen.getByText('∞')).toBeInTheDocument();
  });
});
