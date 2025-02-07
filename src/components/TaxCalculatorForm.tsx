import React, { useMemo } from 'react';
import { Form, Button } from 'react-bootstrap';
import {
  TaxBracketSet,
  calculateTax,
  calculateEffectiveTaxRate,
  findPreTaxIncome,
} from '../calculators/TaxCalculator';
import './TaxCalculatorForm.css';

interface TaxCalculatorFormProps {
  taxBracketSet: TaxBracketSet;
  preTaxIncome: number;
  postTaxIncome: number;
  onPreTaxIncomeChange: (value: number) => void;
  onPostTaxIncomeChange: (value: number) => void;
}

const TaxCalculatorForm: React.FC<TaxCalculatorFormProps> = ({
  taxBracketSet,
  preTaxIncome,
  postTaxIncome,
  onPreTaxIncomeChange,
  onPostTaxIncomeChange,
}) => {
  const taxResults = useMemo(() => {
    if (!preTaxIncome || isNaN(preTaxIncome)) return null;

    const tax = calculateTax(preTaxIncome, taxBracketSet.brackets);
    const effectiveRate = calculateEffectiveTaxRate(
      preTaxIncome,
      taxBracketSet.brackets
    );

    return {
      tax,
      postTaxIncome: preTaxIncome - tax,
      effectiveRate: effectiveRate * 100,
    };
  }, [preTaxIncome, taxBracketSet.brackets]);

  const handlePreTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPreTaxIncomeChange(parseFloat(e.target.value) || 0);
  };

  const handlePostTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPostTaxIncomeChange(parseFloat(e.target.value) || 0);
  };

  const handleFindPreTaxIncome = () => {
    if (!postTaxIncome || isNaN(postTaxIncome)) return;
    const requiredPreTax = findPreTaxIncome(
      postTaxIncome,
      taxBracketSet.brackets
    );
    onPreTaxIncomeChange(requiredPreTax);
  };

  return (
    <div className="tax-calculator-form">
      <Form.Group className="mb-4">
        <Form.Label htmlFor="preTaxIncome" className="fw-bold">
          Pre-tax Income
        </Form.Label>
        <Form.Control
          id="preTaxIncome"
          type="number"
          inputMode="decimal"
          min="0"
          step="1000"
          value={preTaxIncome || ''}
          onChange={handlePreTaxChange}
          placeholder="Enter pre-tax income"
          className="income-input"
        />
      </Form.Group>

      {taxResults && (
        <div className="tax-results mb-4">
          <p className="tax-result-item">
            <span className="result-label">Tax Amount:</span>
            <span className="result-value">
              ${taxResults.tax.toLocaleString()}
            </span>
          </p>
          <p className="tax-result-item">
            <span className="result-label">Post-tax Income:</span>
            <span className="result-value">
              ${taxResults.postTaxIncome.toLocaleString()}
            </span>
          </p>
          <p className="tax-result-item mb-0">
            <span className="result-label">Effective Tax Rate:</span>
            <span className="result-value">
              {taxResults.effectiveRate.toFixed(2)}%
            </span>
          </p>
        </div>
      )}

      <hr className="my-4" />

      <Form.Group className="mb-4">
        <Form.Label htmlFor="postTaxIncome" className="fw-bold">
          Desired Post-tax Income
        </Form.Label>
        <Form.Control
          id="postTaxIncome"
          type="number"
          inputMode="decimal"
          min="0"
          step="1000"
          value={postTaxIncome || ''}
          onChange={handlePostTaxChange}
          placeholder="Enter desired post-tax income"
          className="income-input"
        />
      </Form.Group>

      <Button
        variant="primary"
        onClick={handleFindPreTaxIncome}
        disabled={!postTaxIncome || isNaN(postTaxIncome)}
        className="w-100 calculate-btn"
      >
        Calculate Required Pre-tax Income
      </Button>
    </div>
  );
};

export default TaxCalculatorForm;
