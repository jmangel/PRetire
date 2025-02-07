import React, { useState } from 'react';
import { Container, Form, Card, Alert } from 'react-bootstrap';
import {
  TaxBracketSet,
  parseTaxBracketsFromCSV,
  TaxBracket,
} from '../calculators/TaxCalculator';
import {
  validateTaxBrackets,
  formatValidationErrors,
} from '../calculators/TaxBracketValidation';
import TaxBracketTable from '../components/TaxBracketTable';
import TaxCalculatorForm from '../components/TaxCalculatorForm';
import './TaxCalculatorPage.css';

const TaxCalculatorPage: React.FC = () => {
  const [taxBracketSet, setTaxBracketSet] = useState<TaxBracketSet | null>(
    null
  );
  const [preTaxIncome, setPreTaxIncome] = useState<number>(0);
  const [postTaxIncome, setPostTaxIncome] = useState<number>(0);
  const [error, setError] = useState<string>('');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const brackets = parseTaxBracketsFromCSV(content);
        setTaxBracketSet(brackets);
        setError('');
      } catch (err) {
        setError('Failed to parse CSV file. Please check the format.');
      }
      // Clear the input value so the same file can be selected again
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleBracketsChange = (newBrackets: TaxBracket[]) => {
    if (!taxBracketSet) return;

    const validationErrors = validateTaxBrackets(newBrackets);
    if (validationErrors.length > 0) {
      setError(formatValidationErrors(validationErrors));
      return;
    }

    setTaxBracketSet({
      ...taxBracketSet,
      brackets: newBrackets,
    });
    setError('');
  };

  return (
    <Container className="tax-calculator-container py-4">
      <h1 className="tax-calculator-title">Tax Calculator</h1>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title className="mb-3">Tax Brackets</Card.Title>
          <Form.Group controlId="csvUpload" className="mb-4">
            <Form.Label>Import Tax Brackets (CSV)</Form.Label>
            <Form.Control
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="mb-2"
            />
            <Form.Text className="text-muted">
              CSV should have columns: upperBound, rate (as percentage)
              <br />
              <a href="/sample_tax_brackets.csv" download>
                Download sample tax brackets CSV
              </a>
            </Form.Text>
          </Form.Group>

          {taxBracketSet && (
            <TaxBracketTable
              taxBracketSet={taxBracketSet}
              onBracketsChange={handleBracketsChange}
            />
          )}
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {taxBracketSet && (
        <Card>
          <Card.Body>
            <Card.Title className="mb-3">Calculate Tax</Card.Title>
            <TaxCalculatorForm
              taxBracketSet={taxBracketSet}
              preTaxIncome={preTaxIncome}
              postTaxIncome={postTaxIncome}
              onPreTaxIncomeChange={setPreTaxIncome}
              onPostTaxIncomeChange={setPostTaxIncome}
            />
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default TaxCalculatorPage;
