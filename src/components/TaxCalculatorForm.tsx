import React, { useMemo } from 'react';
import { Form, Button } from 'react-bootstrap';
import {
  TaxBracketSet,
  calculateTax,
  calculateEffectiveTaxRate,
  findPreTaxIncome,
} from '../calculators/TaxCalculator';

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
    <>
      <Form.Group className="mb-3">
        <Form.Label>Pre-tax Income</Form.Label>
        <Form.Control
          type="number"
          min="0"
          step="1000"
          value={preTaxIncome || ''}
          onChange={handlePreTaxChange}
          placeholder="Enter pre-tax income"
        />
      </Form.Group>

      {taxResults && (
        <div className="mb-3">
          <p>Tax Amount: ${taxResults.tax.toLocaleString()}</p>
          <p>Post-tax Income: ${taxResults.postTaxIncome.toLocaleString()}</p>
          <p>Effective Tax Rate: {taxResults.effectiveRate.toFixed(2)}%</p>
        </div>
      )}

      <hr className="my-4" />

      <Form.Group className="mb-3">
        <Form.Label>Desired Post-tax Income</Form.Label>
        <Form.Control
          type="number"
          min="0"
          step="1000"
          value={postTaxIncome || ''}
          onChange={handlePostTaxChange}
          placeholder="Enter desired post-tax income"
        />
      </Form.Group>

      <Button
        variant="primary"
        onClick={handleFindPreTaxIncome}
        disabled={!postTaxIncome || isNaN(postTaxIncome)}
      >
        Calculate Required Pre-tax Income
      </Button>
    </>
  );
};

export default TaxCalculatorForm;
