import React from 'react';
import { render, screen } from '@testing-library/react';
import TaxCalculatorPage from './TaxCalculatorPage';
import userEvent from '@testing-library/user-event';

describe('TaxCalculatorPage', () => {
  const validCSVContent = 'upperBound,rate\n10000,10\n50000,20\nnull,30';
  const invalidCSVContent = 'invalid,csv\ncontent';

  const mockFileReader = (content: string) => {
    window.FileReader = jest.fn().mockImplementation(function (this: any) {
      this.onload = null;
      this.readAsText = () => {
        setTimeout(() => {
          this.result = content;
          this.onload?.({ target: this });
        }, 0);
      };
      return this;
    }) as any;
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('renders initial state correctly', () => {
    render(<TaxCalculatorPage />);

    expect(screen.getByText('Tax Calculator')).toBeInTheDocument();
    expect(screen.getByText(/Import Tax Brackets/)).toBeInTheDocument();
    expect(
      screen.getByText(/Download sample tax brackets CSV/)
    ).toBeInTheDocument();
  });

  it('handles valid CSV file upload', async () => {
    const user = userEvent.setup();
    render(<TaxCalculatorPage />);

    mockFileReader(validCSVContent);

    const file = new File([validCSVContent], 'tax_brackets.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    await user.upload(input, file);

    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('10');
  });

  it('handles invalid CSV file upload', async () => {
    const user = userEvent.setup();
    render(<TaxCalculatorPage />);

    mockFileReader(invalidCSVContent);

    const file = new File([invalidCSVContent], 'invalid.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    await user.upload(input, file);

    const errorMessage = await screen.findByText(/Failed to parse CSV file/);
    expect(errorMessage).toBeInTheDocument();
  });

  it('shows calculator form only after tax brackets are loaded', async () => {
    const user = userEvent.setup();
    render(<TaxCalculatorPage />);

    // Initially, calculator form should not be visible
    expect(screen.queryByText('Calculate Tax')).not.toBeInTheDocument();

    mockFileReader(validCSVContent);

    const file = new File([validCSVContent], 'tax_brackets.csv', {
      type: 'text/csv',
    });
    const input = screen.getByLabelText(/Import Tax Brackets/);

    await user.upload(input, file);

    // Wait for the calculator form to appear
    const calcForm = await screen.findByText('Calculate Tax');
    expect(calcForm).toBeInTheDocument();
  });
});
