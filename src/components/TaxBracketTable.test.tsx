import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaxBracketTable from './TaxBracketTable';
import { TaxBracketSet } from '../calculators/TaxCalculator';

describe('TaxBracketTable', () => {
  const mockOnBracketsChange = jest.fn();

  const sampleTaxBracketSet: TaxBracketSet = {
    name: 'Test Brackets',
    year: 2024,
    brackets: [
      { upperBound: 10000, rate: 0.1 },
      { upperBound: 50000, rate: 0.2 },
      { upperBound: null, rate: 0.3 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all tax brackets with calculated values', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    // Check headers
    expect(screen.getByText('Income Range Start')).toBeInTheDocument();
    expect(screen.getByText('Income Range End')).toBeInTheDocument();
    expect(screen.getByText('Tax Rate')).toBeInTheDocument();
    expect(screen.getByText('Bracket Tax')).toBeInTheDocument();
    expect(screen.getByText('Cumulative Tax')).toBeInTheDocument();
    expect(screen.getByText('Take-Home Income')).toBeInTheDocument();
    expect(screen.getByText('Effective Rate')).toBeInTheDocument();

    // Check first bracket calculations
    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveValue('10000');
    expect(inputs[1]).toHaveValue('10');

    // Check calculated values
    // First row: bracket tax and cumulative tax should both be $1,000
    const firstRowCells = screen.getAllByRole('cell');
    expect(firstRowCells[3]).toHaveTextContent('$1,000'); // Bracket tax column
    expect(firstRowCells[4]).toHaveTextContent('$1,000'); // Cumulative tax column

    // Check infinite bracket
    expect(screen.getByDisplayValue('null')).toBeInTheDocument();
    expect(screen.getAllByText('∞').length).toBeGreaterThan(0);
  });

  it('handles upper bound changes', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const firstBracketInput = screen.getAllByRole('textbox')[0];

    // Start editing
    fireEvent.focus(firstBracketInput);
    fireEvent.change(firstBracketInput, { target: { value: '15000' } });

    // Complete edit
    fireEvent.blur(firstBracketInput);

    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ upperBound: 15000, rate: 0.1 }),
      ])
    );
  });

  it('handles rate changes', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const firstBracketRateInput = screen.getAllByRole('textbox')[1];

    // Start editing
    fireEvent.focus(firstBracketRateInput);
    fireEvent.change(firstBracketRateInput, { target: { value: '15' } });

    // Complete edit
    fireEvent.blur(firstBracketRateInput);

    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ upperBound: 10000, rate: 0.15 }),
      ])
    );
  });

  it('handles null upper bound', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const lastBracketInput = screen.getByDisplayValue('null');

    // Start editing
    fireEvent.focus(lastBracketInput);
    fireEvent.change(lastBracketInput, { target: { value: '100000' } });

    // Complete edit
    fireEvent.blur(lastBracketInput);

    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ upperBound: 100000, rate: 0.3 }),
      ])
    );
  });

  it('handles invalid inputs gracefully', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const firstBracketInput = screen.getAllByRole('textbox')[0];

    // Start editing
    fireEvent.focus(firstBracketInput);
    fireEvent.change(firstBracketInput, { target: { value: 'invalid' } });

    // Complete edit
    fireEvent.blur(firstBracketInput);

    // The brackets should remain unchanged
    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      sampleTaxBracketSet.brackets
    );
  });

  it('can add a new tax bracket', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const addButton = screen.getByText('Add Tax Bracket');
    fireEvent.click(addButton);

    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ upperBound: 100000, rate: 0.3 }),
        expect.objectContaining({ upperBound: null, rate: 0.3 }),
      ])
    );
  });

  it('can delete a tax bracket', () => {
    render(
      <TaxBracketTable
        taxBracketSet={sampleTaxBracketSet}
        onBracketsChange={mockOnBracketsChange}
      />
    );

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(mockOnBracketsChange).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        expect.objectContaining({ upperBound: 10000, rate: 0.1 }),
      ])
    );
  });
});
