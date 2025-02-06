import React from 'react';
import { Table } from 'react-bootstrap';
import { TaxBracketSet, calculateTax } from '../calculators/TaxCalculator';

interface TaxBracketTableProps {
  taxBracketSet: TaxBracketSet;
}

const TaxBracketTable: React.FC<TaxBracketTableProps> = ({ taxBracketSet }) => {
  return (
    <Table striped bordered hover>
      <thead>
        <tr>
          <th>Income Range</th>
          <th>Rate</th>
          <th>Maximum Tax in Bracket</th>
        </tr>
      </thead>
      <tbody>
        {taxBracketSet.brackets.map((bracket, index) => {
          const lowerBound =
            index === 0 ? 0 : taxBracketSet.brackets[index - 1].upperBound;
          const maxTaxInBracket = bracket.upperBound
            ? calculateTax(bracket.upperBound, taxBracketSet.brackets)
            : null;

          return (
            <tr key={index}>
              <td>
                ${lowerBound?.toLocaleString()} -{' '}
                {bracket.upperBound
                  ? `$${bracket.upperBound.toLocaleString()}`
                  : '∞'}
              </td>
              <td>{(bracket.rate * 100).toFixed(2)}%</td>
              <td>
                {maxTaxInBracket !== null
                  ? `$${maxTaxInBracket.toLocaleString()}`
                  : '∞'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default TaxBracketTable;
