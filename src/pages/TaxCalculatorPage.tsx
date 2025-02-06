import React, { useState } from 'react';
import { Container, Form, Card, Alert } from 'react-bootstrap';
import {
  TaxBracketSet,
  parseTaxBracketsFromCSV,
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
    };
    reader.readAsText(file);
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

          {taxBracketSet && <TaxBracketTable taxBracketSet={taxBracketSet} />}
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
