import { TaxBracket } from './TaxCalculator';

export interface ValidationError {
  message: string;
  field?: string;
  index?: number;
}

export function validateTaxBrackets(brackets: TaxBracket[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if brackets array is empty
  if (!brackets || brackets.length === 0) {
    errors.push({ message: 'Tax brackets cannot be empty' });
    return errors;
  }

  let lastBound = -1;
  brackets.forEach((bracket, index) => {
    // Check for invalid rates
    if (typeof bracket.rate !== 'number' || isNaN(bracket.rate)) {
      errors.push({
        message: 'Tax rate must be a valid number',
        field: 'rate',
        index,
      });
    } else if (bracket.rate < 0 || bracket.rate > 1) {
      errors.push({
        message: 'Tax rate must be between 0% and 100%',
        field: 'rate',
        index,
      });
    }

    if (bracket.upperBound !== null) {
      // Check for invalid upper bounds
      if (typeof bracket.upperBound !== 'number' || isNaN(bracket.upperBound)) {
        errors.push({
          message: 'Upper bound must be a valid number or null',
          field: 'upperBound',
          index,
        });
      } else if (bracket.upperBound <= 0) {
        errors.push({
          message: 'Upper bound must be greater than 0',
          field: 'upperBound',
          index,
        });
      }

      // Check that upper bounds are increasing
      if (bracket.upperBound < lastBound) {
        errors.push({
          message: 'Upper bounds must be in increasing order',
          field: 'upperBound',
          index,
        });
      }
      lastBound = bracket.upperBound;
    } else {
      // Check that only the last bracket can have null upper bound
      if (index !== brackets.length - 1) {
        errors.push({
          message: 'Only the last bracket can have an infinite upper bound',
        });
      }
    }
  });

  return errors;
}

export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  return errors
    .map((error) => {
      if (error.index !== undefined) {
        return `Bracket ${error.index + 1}: ${error.message}`;
      }
      return error.message;
    })
    .join('\n');
}
