import {
  TaxBracket,
  calculateBracketValues,
  parseTaxBracketsFromCSV,
  calculateTax,
  calculateEffectiveTaxRate,
  findPreTaxIncome,
  exportTaxBracketsToCSV,
} from './TaxCalculator';

describe('TaxCalculator', () => {
  const sampleBrackets: TaxBracket[] = [
    { upperBound: 10000, rate: 0.1 },
    { upperBound: 50000, rate: 0.2 },
    { upperBound: null, rate: 0.3 },
  ];

  describe('calculateBracketValues', () => {
    it('sorts brackets by upper bound', () => {
      const unsortedBrackets: TaxBracket[] = [
        { upperBound: 50000, rate: 0.2 },
        { upperBound: 10000, rate: 0.1 },
        { upperBound: null, rate: 0.3 },
      ];

      const sorted = calculateBracketValues(unsortedBrackets);
      expect(sorted[0].upperBound).toBe(10000);
      expect(sorted[1].upperBound).toBe(50000);
      expect(sorted[2].upperBound).toBe(null);
    });

    it('calculates derived values correctly', () => {
      const calculated = calculateBracketValues(sampleBrackets);

      // First bracket
      expect(calculated[0].cumulativeTaxUpToBracket).toBe(0);
      expect(calculated[0].taxInBracket).toBe(1000); // 10000 * 0.10
      expect(calculated[0].totalTax).toBe(1000);
      expect(calculated[0].effectiveRate).toBe(0.1);

      // Second bracket
      expect(calculated[1].cumulativeTaxUpToBracket).toBe(1000);
      expect(calculated[1].taxInBracket).toBe(8000); // (50000 - 10000) * 0.20
      expect(calculated[1].totalTax).toBe(9000);
      expect(calculated[1].effectiveRate).toBe(0.18); // 9000 / 50000

      // Third bracket (infinite)
      expect(calculated[2].cumulativeTaxUpToBracket).toBe(9000);
      expect(calculated[2].taxInBracket).toBe(null);
      expect(calculated[2].totalTax).toBe(null);
      expect(calculated[2].effectiveRate).toBe(null);
    });
  });

  describe('parseTaxBracketsFromCSV', () => {
    it('parses valid CSV content', () => {
      const csvContent = 'upperBound,rate\n10000,10\n50000,20\nnull,30';
      const result = parseTaxBracketsFromCSV(csvContent);

      expect(result.brackets.length).toBe(3);
      expect(result.brackets[0].upperBound).toBe(10000);
      expect(result.brackets[0].rate).toBe(0.1);
      expect(result.brackets[2].upperBound).toBe(null);
    });

    it('throws error for invalid CSV format', () => {
      const invalidCSV = 'invalid,csv\ncontent';
      expect(() => parseTaxBracketsFromCSV(invalidCSV)).toThrow(
        'Failed to parse CSV'
      );
    });

    it('throws error for invalid tax rates', () => {
      const csvContent = 'upperBound,rate\n10000,-10\n50000,20\nnull,30';
      expect(() => parseTaxBracketsFromCSV(csvContent)).toThrow(
        'Tax rate must be between 0% and 100%'
      );
    });

    it('throws error for non-increasing upper bounds', () => {
      const csvContent = 'upperBound,rate\n50000,10\n10000,20\nnull,30';
      expect(() => parseTaxBracketsFromCSV(csvContent)).toThrow(
        'Upper bounds must be in increasing order'
      );
    });

    it('throws error for multiple null upper bounds', () => {
      const csvContent = 'upperBound,rate\nnull,10\nnull,20';
      expect(() => parseTaxBracketsFromCSV(csvContent)).toThrow(
        'Only the last bracket can have an infinite upper bound'
      );
    });

    it('throws error for null upper bound not in last position', () => {
      const csvContent = 'upperBound,rate\nnull,10\n50000,20';
      expect(() => parseTaxBracketsFromCSV(csvContent)).toThrow(
        'Only the last bracket can have an infinite upper bound'
      );
    });
  });

  describe('calculateTax', () => {
    it('calculates tax correctly for income in first bracket', () => {
      const tax = calculateTax(5000, sampleBrackets);
      expect(tax).toBe(500); // 5000 * 0.10
    });

    it('calculates tax correctly for income at bracket boundary', () => {
      const tax = calculateTax(10000, sampleBrackets);
      expect(tax).toBe(1000); // 10000 * 0.10
    });

    it('calculates tax correctly for income spanning multiple brackets', () => {
      const tax = calculateTax(30000, sampleBrackets);
      // First 10000 at 10%: 1000
      // Next 20000 at 20%: 4000
      // Total: 5000
      expect(tax).toBe(5000);
    });

    it('calculates tax correctly for income in highest bracket', () => {
      const tax = calculateTax(100000, sampleBrackets);
      // First 10000 at 10%: 1000
      // Next 40000 at 20%: 8000
      // Remaining 50000 at 30%: 15000
      // Total: 24000
      expect(tax).toBe(24000);
    });
  });

  describe('calculateEffectiveTaxRate', () => {
    it('calculates effective rate correctly for single bracket income', () => {
      const rate = calculateEffectiveTaxRate(5000, sampleBrackets);
      expect(rate).toBe(0.1); // All income taxed at 10%
    });

    it('calculates effective rate correctly for multi-bracket income', () => {
      const rate = calculateEffectiveTaxRate(20000, sampleBrackets);
      // First 10000 at 10%: 1000
      // Next 10000 at 20%: 2000
      // Total tax: 3000 on 20000 income = 15% effective rate
      expect(rate).toBe(0.15);
    });
  });

  describe('findPreTaxIncome', () => {
    it('finds correct pre-tax income for desired post-tax amount', () => {
      const postTaxDesired = 4500;
      const preTaxRequired = findPreTaxIncome(postTaxDesired, sampleBrackets);
      const actualPostTax =
        preTaxRequired - calculateTax(preTaxRequired, sampleBrackets);
      expect(actualPostTax).toBeCloseTo(postTaxDesired, 2);
    });

    it('handles edge cases', () => {
      // Very small amount
      expect(findPreTaxIncome(100, sampleBrackets)).toBeGreaterThan(100);

      // Large amount in highest bracket
      const largePostTax = 1000000;
      const preTaxLarge = findPreTaxIncome(largePostTax, sampleBrackets);
      const actualPostTaxLarge =
        preTaxLarge - calculateTax(preTaxLarge, sampleBrackets);
      expect(actualPostTaxLarge).toBeCloseTo(largePostTax, 2);
    });
  });

  describe('exportTaxBracketsToCSV', () => {
    it('exports tax brackets to CSV format', () => {
      const brackets: TaxBracket[] = [
        { upperBound: 10000, rate: 0.1 },
        { upperBound: 50000, rate: 0.2 },
        { upperBound: null, rate: 0.3 },
      ];

      const csvContent = exportTaxBracketsToCSV(brackets);
      const expectedCSV = 'upperBound,rate\n10000,10\n50000,20\nnull,30';

      expect(csvContent).toBe(expectedCSV);
    });

    it('handles empty brackets array', () => {
      const brackets: TaxBracket[] = [];
      const csvContent = exportTaxBracketsToCSV(brackets);
      expect(csvContent).toBe('upperBound,rate');
    });
  });
});
