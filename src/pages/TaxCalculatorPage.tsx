import React, { useState } from 'react';
import { Container, Form, Card, Alert } from 'react-bootstrap';
import {
  TaxBracketSet,
  parseTaxBracketsFromCSV,
  TaxBracket,
} from '../calculators/TaxCalculator';
import TaxBracketTable from '../components/TaxBracketTable';
import TaxCalculatorForm from '../components/TaxCalculatorForm';

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

    // Validate brackets
    try {
      // Check that rates are between 0 and 1
      if (newBrackets.some((b) => b.rate < 0 || b.rate > 1)) {
        throw new Error('Tax rates must be between 0% and 100%');
      }

      // Check that upper bounds are increasing (except for null)
      let lastBound = 0;
      for (const bracket of newBrackets) {
        if (bracket.upperBound !== null) {
          if (bracket.upperBound <= lastBound) {
            throw new Error('Upper bounds must be in increasing order');
          }
          lastBound = bracket.upperBound;
        }
      }

      setTaxBracketSet({
        ...taxBracketSet,
        brackets: newBrackets,
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid tax brackets');
    }
  };

  return (
    <Container className="py-4">
      <h1>Tax Calculator</h1>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>Tax Brackets</Card.Title>
          <Form.Group controlId="csvUpload" className="mb-3">
            <Form.Label>Import Tax Brackets (CSV)</Form.Label>
            <Form.Control
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
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

      {error && <Alert variant="danger">{error}</Alert>}

      {taxBracketSet && (
        <Card>
          <Card.Body>
            <Card.Title>Calculate Tax</Card.Title>
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
