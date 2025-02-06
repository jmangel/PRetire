import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaxCalculatorPage from './TaxCalculatorPage';

describe('TaxCalculatorPage', () => {
  const validCSVContent = 'upperBound,rate\n10000,10\n50000,20\nnull,30';
  const invalidCSVContent = 'invalid,csv\ncontent';

  beforeEach(() => {
    // Mock FileReader
    const mockFileReader = {
      readAsText: jest.fn(),
      result: '',
      onload: () => {},
    };
    window.FileReader = jest.fn(() => mockFileReader) as any;
  });

  it('renders initial state correctly', () => {
    render(<TaxCalculatorPage />);

    expect(screen.getByText('Tax Calculator')).toBeInTheDocument();
    expect(screen.getByText(/Import Tax Brackets/)).toBeInTheDocument();
    expect(
      screen.getByText(/Download sample tax brackets CSV/)
    ).toBeInTheDocument();
  });

  it('handles valid CSV file upload', () => {
    render(<TaxCalculatorPage />);

    const file = new File([validCSVContent], 'tax_brackets.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    // Mock FileReader behavior
    Object.defineProperty(window.FileReader.prototype, 'readAsText', {
      value: function () {
        this.result = validCSVContent;
        this.onload({ target: this });
      },
    });

    fireEvent.change(input, { target: { files: [file] } });

    // After successful upload, tax bracket table should be visible
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('10.00%')).toBeInTheDocument();
  });

  it('handles invalid CSV file upload', () => {
    render(<TaxCalculatorPage />);

    const file = new File([invalidCSVContent], 'invalid.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    // Mock FileReader behavior
    Object.defineProperty(window.FileReader.prototype, 'readAsText', {
      value: function () {
        this.result = invalidCSVContent;
        this.onload({ target: this });
      },
    });

    fireEvent.change(input, { target: { files: [file] } });

    // Should show error message
    expect(screen.getByText(/Failed to parse CSV file/)).toBeInTheDocument();
  });

  it('shows calculator form only after tax brackets are loaded', () => {
    render(<TaxCalculatorPage />);

    // Initially, calculator form should not be visible
    expect(screen.queryByText('Calculate Tax')).not.toBeInTheDocument();

    const file = new File([validCSVContent], 'tax_brackets.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    // Mock FileReader behavior
    Object.defineProperty(window.FileReader.prototype, 'readAsText', {
      value: function () {
        this.result = validCSVContent;
        this.onload({ target: this });
      },
    });

    fireEvent.change(input, { target: { files: [file] } });

    // After loading tax brackets, calculator form should be visible
    expect(screen.getByText('Calculate Tax')).toBeInTheDocument();
  });
});
