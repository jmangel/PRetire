import React, { useState, useRef } from 'react';
import { Container, Form, Button, Card, Table, Alert } from 'react-bootstrap';
import {
  TaxBracketSet,
  parseTaxBracketsFromCSV,
  calculateTax,
  calculateEffectiveTaxRate,
  findPreTaxIncome,
} from '../calculators/TaxCalculator';

const TaxCalculatorPage: React.FC = () => {
  const [taxBracketSet, setTaxBracketSet] = useState<TaxBracketSet | null>(
    null
  );
  const [preTaxIncome, setPreTaxIncome] = useState<string>('');
  const [postTaxIncome, setPostTaxIncome] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const calculateTaxResults = (income: number) => {
    if (!taxBracketSet) return null;

    const tax = calculateTax(income, taxBracketSet.brackets);
    const effectiveRate = calculateEffectiveTaxRate(
      income,
      taxBracketSet.brackets
    );

    return {
      preTaxIncome: income,
      tax,
      postTaxIncome: income - tax,
      effectiveRate: effectiveRate * 100,
    };
  };

  const handlePreTaxCalculation = () => {
    if (!taxBracketSet || !preTaxIncome) return;

    const income = parseFloat(preTaxIncome);
    if (isNaN(income)) {
      setError('Please enter a valid number for pre-tax income');
      return;
    }

    setError('');
    const results = calculateTaxResults(income);
    setPostTaxIncome(results?.postTaxIncome.toFixed(2) || '');
  };

  const handlePostTaxCalculation = () => {
    if (!taxBracketSet || !postTaxIncome) return;

    const targetPostTax = parseFloat(postTaxIncome);
    if (isNaN(targetPostTax)) {
      setError('Please enter a valid number for post-tax income');
      return;
    }

    setError('');
    const requiredPreTax = findPreTaxIncome(
      targetPostTax,
      taxBracketSet.brackets
    );
    setPreTaxIncome(requiredPreTax.toFixed(2));
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
              ref={fileInputRef}
            />
            <Form.Text className="text-muted">
              CSV should have columns: lowerBound, upperBound, rate (as
              percentage)
              <br />
              <a href="/sample_tax_brackets.csv" download>
                Download sample tax brackets CSV
              </a>
            </Form.Text>
          </Form.Group>

          {taxBracketSet && (
            <Table striped bordered hover>
              <thead>
                <tr>
                  <th>Lower Bound</th>
                  <th>Upper Bound</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {taxBracketSet.brackets.map((bracket, index) => (
                  <tr key={index}>
                    <td>${bracket.lowerBound.toLocaleString()}</td>
                    <td>
                      {bracket.upperBound
                        ? `$${bracket.upperBound.toLocaleString()}`
                        : '∞'}
                    </td>
                    <td>{(bracket.rate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>Calculate Tax</Card.Title>

          <Form.Group className="mb-3">
            <Form.Label>Pre-tax Income</Form.Label>
            <Form.Control
              type="number"
              value={preTaxIncome}
              onChange={(e) => setPreTaxIncome(e.target.value)}
              placeholder="Enter pre-tax income"
            />
          </Form.Group>

          <Button
            variant="primary"
            onClick={handlePreTaxCalculation}
            disabled={!taxBracketSet}
            className="mb-3"
          >
            Calculate Tax
          </Button>

          {preTaxIncome && taxBracketSet && (
            <div className="mt-3">
              {(() => {
                const results = calculateTaxResults(parseFloat(preTaxIncome));
                if (!results) return null;
                return (
                  <>
                    <p>Tax Amount: ${results.tax.toLocaleString()}</p>
                    <p>
                      Post-tax Income: ${results.postTaxIncome.toLocaleString()}
                    </p>
                    <p>
                      Effective Tax Rate: {results.effectiveRate.toFixed(2)}%
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <Card.Title>Find Required Pre-tax Income</Card.Title>

          <Form.Group className="mb-3">
            <Form.Label>Desired Post-tax Income</Form.Label>
            <Form.Control
              type="number"
              value={postTaxIncome}
              onChange={(e) => setPostTaxIncome(e.target.value)}
              placeholder="Enter desired post-tax income"
            />
          </Form.Group>

          <Button
            variant="primary"
            onClick={handlePostTaxCalculation}
            disabled={!taxBracketSet}
          >
            Calculate Required Pre-tax Income
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default TaxCalculatorPage;
