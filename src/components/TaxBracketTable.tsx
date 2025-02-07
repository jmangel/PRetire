import React, { useMemo, useState } from 'react';
import { Table, Form, Button } from 'react-bootstrap';
import {
  TaxBracketSet,
  calculateBracketValues,
  TaxBracket,
} from '../calculators/TaxCalculator';

interface TaxBracketTableProps {
  taxBracketSet: TaxBracketSet;
  onBracketsChange: (brackets: TaxBracket[]) => void;
}

interface ActiveEdit {
  index: number;
  field: 'upperBound' | 'rate';
  value: string;
}

const TaxBracketTable: React.FC<TaxBracketTableProps> = ({
  taxBracketSet,
  onBracketsChange,
}) => {
  const [activeEdit, setActiveEdit] = useState<ActiveEdit | null>(null);

  const bracketsWithCalculations = useMemo(
    () => calculateBracketValues(taxBracketSet.brackets),
    [taxBracketSet.brackets]
  );

  const handleEditStart = (
    index: number,
    field: 'upperBound' | 'rate',
    currentValue: string
  ) => {
    setActiveEdit({ index, field, value: currentValue });
  };

  const handleEditChange = (value: string) => {
    if (activeEdit) {
      setActiveEdit({ ...activeEdit, value });
    }
  };

  const handleEditComplete = () => {
    if (!activeEdit) return;

    const newBrackets = [...taxBracketSet.brackets];
    const { index, field, value } = activeEdit;

    if (field === 'upperBound') {
      const trimmedValue = value.trim().toLowerCase();
      if (trimmedValue === 'null' || trimmedValue === '') {
        newBrackets[index] = { ...newBrackets[index], upperBound: null };
      } else {
        const parsedValue = parseFloat(value);
        if (!isNaN(parsedValue)) {
          newBrackets[index] = {
            ...newBrackets[index],
            upperBound: parsedValue,
          };
        }
      }
    } else if (field === 'rate') {
      const parsedValue = parseFloat(value);
      if (!isNaN(parsedValue)) {
        newBrackets[index] = { ...newBrackets[index], rate: parsedValue / 100 };
      }
    }

    onBracketsChange(newBrackets);
    setActiveEdit(null);
  };

  const handleAddBracket = () => {
    const lastBracket =
      taxBracketSet.brackets[taxBracketSet.brackets.length - 1];
    const newBrackets = [...taxBracketSet.brackets];

    if (lastBracket.upperBound === null) {
      newBrackets[newBrackets.length - 1] = {
        ...lastBracket,
        upperBound: 100000,
      };
    }

    newBrackets.push({
      upperBound: null,
      rate: lastBracket.rate,
    });

    onBracketsChange(newBrackets);
  };

  const handleDeleteBracket = (index: number) => {
    const newBrackets = [...taxBracketSet.brackets];
    newBrackets.splice(index, 1);
    onBracketsChange(newBrackets);
  };

  return (
    <div>
      <div
        className="table-responsive"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Income Range Start</th>
              <th>Income Range End</th>
              <th>Tax Rate</th>
              <th>Bracket Tax</th>
              <th>Cumulative Tax</th>
              <th>Take-Home Income</th>
              <th>Effective Rate</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bracketsWithCalculations.map((bracket, index) => {
              const bracketStart =
                index === 0
                  ? 0
                  : bracketsWithCalculations[index - 1].upperBound ?? 0;

              const takeHomeIncome =
                bracket.upperBound !== null
                  ? bracket.upperBound - (bracket.totalTax ?? 0)
                  : null;

              const isEditingUpperBound =
                activeEdit?.index === index &&
                activeEdit.field === 'upperBound';
              const isEditingRate =
                activeEdit?.index === index && activeEdit.field === 'rate';

              return (
                <tr key={index}>
                  <td>${bracketStart.toLocaleString()}</td>
                  <td>
                    <Form.Control
                      type="text"
                      value={
                        isEditingUpperBound
                          ? activeEdit.value
                          : bracket.upperBound?.toString() ?? 'null'
                      }
                      onChange={(e) => handleEditChange(e.target.value)}
                      onFocus={() =>
                        handleEditStart(
                          index,
                          'upperBound',
                          bracket.upperBound?.toString() ?? 'null'
                        )
                      }
                      onBlur={handleEditComplete}
                      size="sm"
                    />
                  </td>
                  <td>
                    <Form.Control
                      type="text"
                      value={
                        isEditingRate
                          ? activeEdit.value
                          : (bracket.rate * 100).toString()
                      }
                      onChange={(e) => handleEditChange(e.target.value)}
                      onFocus={() =>
                        handleEditStart(
                          index,
                          'rate',
                          (bracket.rate * 100).toString()
                        )
                      }
                      onBlur={handleEditComplete}
                      size="sm"
                    />
                  </td>
                  <td>
                    {bracket.taxInBracket !== null
                      ? `$${bracket.taxInBracket.toLocaleString()}`
                      : '∞'}
                  </td>
                  <td>
                    {bracket.totalTax !== null
                      ? `$${bracket.totalTax.toLocaleString()}`
                      : '∞'}
                  </td>
                  <td>
                    {takeHomeIncome !== null
                      ? `$${takeHomeIncome.toLocaleString()}`
                      : '∞'}
                  </td>
                  <td>
                    {bracket.effectiveRate !== null
                      ? `${(bracket.effectiveRate * 100).toFixed(1)}%`
                      : '∞'}
                  </td>
                  <td>
                    {taxBracketSet.brackets.length > 1 && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteBracket(index)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      <Button variant="primary" onClick={handleAddBracket}>
        Add Tax Bracket
      </Button>
    </div>
  );
};

export default TaxBracketTable;
