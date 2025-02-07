import {
  validateTaxBrackets,
  formatValidationErrors,
} from './TaxBracketValidation';
import { TaxBracket } from './TaxCalculator';

describe('validateTaxBrackets', () => {
  const validBrackets: TaxBracket[] = [
    { upperBound: 10000, rate: 0.1 },
    { upperBound: 50000, rate: 0.2 },
    { upperBound: null, rate: 0.3 },
  ];

  it('accepts valid tax brackets', () => {
    const errors = validateTaxBrackets(validBrackets);
    expect(errors).toHaveLength(0);
  });

  it('rejects empty brackets array', () => {
    const errors = validateTaxBrackets([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Tax brackets cannot be empty');
  });

  describe('tax rate validation', () => {
    it('rejects negative tax rates', () => {
      const brackets = [{ upperBound: 10000, rate: -0.1 }];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Tax rate must be between 0% and 100%');
      expect(errors[0].field).toBe('rate');
      expect(errors[0].index).toBe(0);
    });

    it('rejects tax rates over 100%', () => {
      const brackets = [{ upperBound: 10000, rate: 1.5 }];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Tax rate must be between 0% and 100%');
      expect(errors[0].field).toBe('rate');
      expect(errors[0].index).toBe(0);
    });

    it('rejects invalid tax rate values', () => {
      const brackets = [{ upperBound: 10000, rate: NaN }];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Tax rate must be a valid number');
      expect(errors[0].field).toBe('rate');
      expect(errors[0].index).toBe(0);
    });
  });

  describe('upper bound validation', () => {
    it('rejects non-increasing upper bounds', () => {
      const brackets = [
        { upperBound: 50000, rate: 0.1 },
        { upperBound: 20000, rate: 0.2 },
      ];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(
        'Upper bounds must be in increasing order'
      );
      expect(errors[0].field).toBe('upperBound');
      expect(errors[0].index).toBe(1);
    });

    it('rejects negative upper bounds', () => {
      const brackets = [{ upperBound: -10000, rate: 0.1 }];
      const errors = validateTaxBrackets(brackets);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
          (e) =>
            e.message === 'Upper bound must be greater than 0' &&
            e.field === 'upperBound' &&
            e.index === 0
        )
      ).toBe(true);
    });

    it('rejects invalid upper bound values', () => {
      const brackets = [{ upperBound: NaN, rate: 0.1 }];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(
        'Upper bound must be a valid number or null'
      );
      expect(errors[0].field).toBe('upperBound');
      expect(errors[0].index).toBe(0);
    });

    it('rejects multiple null upper bounds', () => {
      const brackets = [
        { upperBound: null, rate: 0.1 },
        { upperBound: null, rate: 0.2 },
      ];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(
        'Only the last bracket can have an infinite upper bound'
      );
    });

    it('rejects null upper bound not in last position', () => {
      const brackets = [
        { upperBound: null, rate: 0.1 },
        { upperBound: 50000, rate: 0.2 },
      ];
      const errors = validateTaxBrackets(brackets);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(
        'Only the last bracket can have an infinite upper bound'
      );
    });
  });
});

describe('formatValidationErrors', () => {
  it('returns empty string for no errors', () => {
    expect(formatValidationErrors([])).toBe('');
  });

  it('formats single error without index', () => {
    const errors = [{ message: 'Test error' }];
    expect(formatValidationErrors(errors)).toBe('Test error');
  });

  it('formats single error with index', () => {
    const errors = [{ message: 'Test error', index: 0 }];
    expect(formatValidationErrors(errors)).toBe('Bracket 1: Test error');
  });

  it('formats multiple errors', () => {
    const errors = [
      { message: 'First error', index: 0 },
      { message: 'Second error', index: 1 },
      { message: 'Global error' },
    ];
    expect(formatValidationErrors(errors)).toBe(
      'Bracket 1: First error\nBracket 2: Second error\nGlobal error'
    );
  });
});
