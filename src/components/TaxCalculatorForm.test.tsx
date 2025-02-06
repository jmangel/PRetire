import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaxCalculatorForm from './TaxCalculatorForm';
import { TaxBracketSet } from '../calculators/TaxCalculator';

describe('TaxCalculatorForm', () => {
  const mockOnPreTaxIncomeChange = jest.fn();
  const mockOnPostTaxIncomeChange = jest.fn();

  const sampleTaxBracketSet: TaxBracketSet = {
    name: 'Test Brackets',
    year: 2024,
    brackets: [
      { upperBound: 10000, rate: 0.1, cumulativeTaxAtStart: 0 },
      { upperBound: 50000, rate: 0.2, cumulativeTaxAtStart: 1000 },
      { upperBound: null, rate: 0.3, cumulativeTaxAtStart: 9000 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form elements', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={0}
        postTaxIncome={0}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    expect(screen.getByLabelText(/Pre-tax Income/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Desired Post-tax Income/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles pre-tax income changes', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={0}
        postTaxIncome={0}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    const input = screen.getByLabelText(/Pre-tax Income/);
    fireEvent.change(input, { target: { value: '50000' } });

    expect(mockOnPreTaxIncomeChange).toHaveBeenCalledWith(50000);
  });

  it('handles post-tax income changes', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={0}
        postTaxIncome={0}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    const input = screen.getByLabelText(/Desired Post-tax Income/);
    fireEvent.change(input, { target: { value: '40000' } });

    expect(mockOnPostTaxIncomeChange).toHaveBeenCalledWith(40000);
  });

  it('displays tax calculation results when pre-tax income is provided', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={50000}
        postTaxIncome={0}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    expect(screen.getByText(/Tax Amount:/)).toBeInTheDocument();
    expect(screen.getByText(/Post-tax Income:/)).toBeInTheDocument();
    expect(screen.getByText(/Effective Tax Rate:/)).toBeInTheDocument();
  });

  it('handles invalid inputs gracefully', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={0}
        postTaxIncome={0}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    const input = screen.getByLabelText(/Pre-tax Income/);
    fireEvent.change(input, { target: { value: 'invalid' } });

    expect(mockOnPreTaxIncomeChange).toHaveBeenCalledWith(0);
  });

  it('calculates required pre-tax income when button is clicked', () => {
    render(
      <TaxCalculatorForm
        taxBracketSet={sampleTaxBracketSet}
        preTaxIncome={0}
        postTaxIncome={40000}
        onPreTaxIncomeChange={mockOnPreTaxIncomeChange}
        onPostTaxIncomeChange={mockOnPostTaxIncomeChange}
      />
    );

    const button = screen.getByRole('button', {
      name: /Calculate Required Pre-tax Income/,
    });
    fireEvent.click(button);

    expect(mockOnPreTaxIncomeChange).toHaveBeenCalled();
  });
});
