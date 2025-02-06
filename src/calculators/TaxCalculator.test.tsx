import {
  TaxBracket,
  prepareTaxBrackets,
  parseTaxBracketsFromCSV,
  calculateTax,
  calculateEffectiveTaxRate,
  findPreTaxIncome,
} from './TaxCalculator';

describe('TaxCalculator', () => {
  const sampleBrackets: TaxBracket[] = [
    { upperBound: 10000, rate: 0.1, cumulativeTaxAtStart: 0 },
    { upperBound: 50000, rate: 0.2, cumulativeTaxAtStart: 0 },
    { upperBound: null, rate: 0.3, cumulativeTaxAtStart: 0 },
  ];

  describe('prepareTaxBrackets', () => {
    it('sorts brackets by upper bound', () => {
      const unsortedBrackets: TaxBracket[] = [
        { upperBound: 50000, rate: 0.2, cumulativeTaxAtStart: 0 },
        { upperBound: 10000, rate: 0.1, cumulativeTaxAtStart: 0 },
        { upperBound: null, rate: 0.3, cumulativeTaxAtStart: 0 },
      ];

      const sorted = prepareTaxBrackets(unsortedBrackets);
      expect(sorted[0].upperBound).toBe(10000);
      expect(sorted[1].upperBound).toBe(50000);
      expect(sorted[2].upperBound).toBe(null);
    });

    it('calculates cumulative tax correctly', () => {
      const prepared = prepareTaxBrackets(sampleBrackets);
      // First bracket: no cumulative tax
      expect(prepared[0].cumulativeTaxAtStart).toBe(0);
      // Second bracket: 10000 * 0.10 = 1000
      expect(prepared[1].cumulativeTaxAtStart).toBe(1000);
      // Third bracket: 1000 + (50000 - 10000) * 0.20 = 9000
      expect(prepared[2].cumulativeTaxAtStart).toBe(9000);
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

    it('throws error for invalid CSV', () => {
      const invalidCSV = 'invalid,csv\ncontent';
      expect(() => parseTaxBracketsFromCSV(invalidCSV)).toThrow();
    });
  });

  describe('calculateTax', () => {
    const preparedBrackets = prepareTaxBrackets(sampleBrackets);

    it('calculates tax correctly for income in first bracket', () => {
      const tax = calculateTax(5000, preparedBrackets);
      expect(tax).toBe(500); // 5000 * 0.10
    });

    it('calculates tax correctly for income at bracket boundary', () => {
      const tax = calculateTax(10000, preparedBrackets);
      expect(tax).toBe(1000); // 10000 * 0.10
    });

    it('calculates tax correctly for income spanning multiple brackets', () => {
      const tax = calculateTax(30000, preparedBrackets);
      // First 10000 at 10%: 1000
      // Next 20000 at 20%: 4000
      // Total: 5000
      expect(tax).toBe(5000);
    });

    it('calculates tax correctly for income in highest bracket', () => {
      const tax = calculateTax(100000, preparedBrackets);
      // First 10000 at 10%: 1000
      // Next 40000 at 20%: 8000
      // Remaining 50000 at 30%: 15000
      // Total: 24000
      expect(tax).toBe(24000);
    });
  });

  describe('calculateEffectiveTaxRate', () => {
    const preparedBrackets = prepareTaxBrackets(sampleBrackets);

    it('calculates effective rate correctly for single bracket income', () => {
      const rate = calculateEffectiveTaxRate(5000, preparedBrackets);
      expect(rate).toBe(0.1); // All income taxed at 10%
    });

    it('calculates effective rate correctly for multi-bracket income', () => {
      const rate = calculateEffectiveTaxRate(20000, preparedBrackets);
      // First 10000 at 10%: 1000
      // Next 10000 at 20%: 2000
      // Total tax: 3000 on 20000 income = 15% effective rate
      expect(rate).toBe(0.15);
    });
  });

  describe('findPreTaxIncome', () => {
    const preparedBrackets = prepareTaxBrackets(sampleBrackets);

    it('finds correct pre-tax income for desired post-tax amount', () => {
      const postTaxDesired = 4500;
      const preTaxRequired = findPreTaxIncome(postTaxDesired, preparedBrackets);
      const actualPostTax =
        preTaxRequired - calculateTax(preTaxRequired, preparedBrackets);

      expect(actualPostTax).toBeCloseTo(postTaxDesired, 2);
    });

    it('handles edge cases', () => {
      // Very small amount
      expect(findPreTaxIncome(100, preparedBrackets)).toBeGreaterThan(100);

      // Large amount in highest bracket
      const largePostTax = 1000000;
      const preTaxLarge = findPreTaxIncome(largePostTax, preparedBrackets);
      const actualPostTaxLarge =
        preTaxLarge - calculateTax(preTaxLarge, preparedBrackets);
      expect(actualPostTaxLarge).toBeCloseTo(largePostTax, 2);
    });
  });
});
