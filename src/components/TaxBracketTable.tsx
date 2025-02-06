import React from 'react';
import { Table } from 'react-bootstrap';
import { TaxBracketSet } from '../calculators/TaxCalculator';

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
        </tr>
      </thead>
      <tbody>
        {taxBracketSet.brackets.map((bracket, index) => {
          const lowerBound =
            index === 0 ? 0 : taxBracketSet.brackets[index - 1].upperBound;
          return (
            <tr key={index}>
              <td>
                ${lowerBound?.toLocaleString()} -{' '}
                {bracket.upperBound
                  ? `$${bracket.upperBound.toLocaleString()}`
                  : '∞'}
              </td>
              <td>{(bracket.rate * 100).toFixed(2)}%</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default TaxBracketTable;
