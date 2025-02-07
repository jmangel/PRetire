import Papa from 'papaparse';

export interface TaxBracket {
  upperBound: number | null; // null represents infinity
  rate: number; // as decimal (e.g., 0.25 for 25%)
}

export interface TaxBracketWithCalculations extends TaxBracket {
  cumulativeTaxUpToBracket: number;
  taxInBracket: number | null;
  totalTax: number | null;
  effectiveRate: number | null;
}

export interface TaxBracketSet {
  name: string;
  brackets: TaxBracket[];
  year: number;
}

// Calculate derived values for a set of brackets
export function calculateBracketValues(
  brackets: TaxBracket[]
): TaxBracketWithCalculations[] {
  const sortedBrackets = brackets.sort((a, b) => {
    if (a.upperBound === null) return 1;
    if (b.upperBound === null) return -1;
    return a.upperBound - b.upperBound;
  });

  let cumulativeTax = 0;
  let previousUpperBound = 0;

  return sortedBrackets.map((bracket) => {
    const result: TaxBracketWithCalculations = {
      ...bracket,
      cumulativeTaxUpToBracket: cumulativeTax,
      taxInBracket: null,
      totalTax: null,
      effectiveRate: null,
    };

    if (bracket.upperBound !== null) {
      result.taxInBracket =
        (bracket.upperBound - previousUpperBound) * bracket.rate;
      result.totalTax = cumulativeTax + result.taxInBracket;
      result.effectiveRate = result.totalTax / bracket.upperBound;

      cumulativeTax = result.totalTax;
      previousUpperBound = bracket.upperBound;
    }

    return result;
  });
}

export function parseTaxBracketsFromCSV(csvContent: string): TaxBracketSet {
  const results = Papa.parse(csvContent, { header: true });

  if (results.errors.length > 0) {
    throw new Error('Failed to parse CSV: ' + results.errors[0].message);
  }

  const brackets: TaxBracket[] = results.data.map((row: any) => ({
    upperBound: row.upperBound === 'null' ? null : parseFloat(row.upperBound),
    rate: parseFloat(row.rate) / 100, // Convert percentage to decimal
  }));

  return {
    name: 'Imported Tax Brackets',
    brackets,
    year: new Date().getFullYear(),
  };
}

export function calculateTax(income: number, brackets: TaxBracket[]): number {
  const sortedBrackets = brackets.sort((a, b) => {
    if (a.upperBound === null) return 1;
    if (b.upperBound === null) return -1;
    return a.upperBound - b.upperBound;
  });

  let totalTax = 0;
  let remainingIncome = income;
  let previousUpperBound = 0;

  for (const bracket of sortedBrackets) {
    const bracketSize =
      bracket.upperBound === null
        ? remainingIncome
        : Math.min(bracket.upperBound - previousUpperBound, remainingIncome);

    if (bracketSize <= 0) break;

    totalTax += bracketSize * bracket.rate;
    remainingIncome -= bracketSize;

    if (bracket.upperBound !== null) {
      previousUpperBound = bracket.upperBound;
    }

    if (remainingIncome <= 0) break;
  }

  return totalTax;
}

export function calculateEffectiveTaxRate(
  income: number,
  brackets: TaxBracket[]
): number {
  const totalTax = calculateTax(income, brackets);
  return totalTax / income;
}

export function findPreTaxIncome(
  targetPostTaxIncome: number,
  brackets: TaxBracket[]
): number {
  // binary search
  let low = targetPostTaxIncome;
  let high = targetPostTaxIncome * 2;
  const tolerance = 0.005;

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    const calculatedPostTax = mid - calculateTax(mid, brackets);

    if (Math.abs(calculatedPostTax - targetPostTaxIncome) < tolerance) {
      return mid;
    }

    if (calculatedPostTax > targetPostTaxIncome) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}
