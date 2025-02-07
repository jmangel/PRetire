import Papa from 'papaparse';

export interface TaxBracket {
  lowerBound: number;
  upperBound: number | null; // null represents infinity
  rate: number; // as decimal (e.g., 0.25 for 25%)
}

export interface TaxBracketSet {
  name: string;
  brackets: TaxBracket[];
  year: number;
}

// Efficiently sort tax brackets by lower bound
export function sortTaxBrackets(brackets: TaxBracket[]): TaxBracket[] {
  return brackets.sort((a, b) => a.lowerBound - b.lowerBound);
}

export function parseTaxBracketsFromCSV(csvContent: string): TaxBracketSet {
  const results = Papa.parse(csvContent, { header: true });

  if (results.errors.length > 0) {
    throw new Error('Failed to parse CSV: ' + results.errors[0].message);
  }

  const brackets: TaxBracket[] = results.data.map((row: any) => ({
    lowerBound: parseFloat(row.lowerBound),
    upperBound: row.upperBound === 'null' ? null : parseFloat(row.upperBound),
    rate: parseFloat(row.rate) / 100, // Convert percentage to decimal
  }));

  return {
    name: 'Imported Tax Brackets',
    brackets: sortTaxBrackets(brackets),
    year: new Date().getFullYear(),
  };
}

export function calculateTax(income: number, brackets: TaxBracket[]): number {
  let totalTax = 0;
  let remainingIncome = income;

  for (const bracket of brackets) {
    const bracketSize =
      bracket.upperBound === null
        ? remainingIncome
        : Math.min(bracket.upperBound - bracket.lowerBound, remainingIncome);

    if (bracketSize <= 0) break;

    totalTax += bracketSize * bracket.rate;
    remainingIncome -= bracketSize;

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

// Binary search to find pre-tax income that results in target post-tax income
export function findPreTaxIncome(
  targetPostTaxIncome: number,
  brackets: TaxBracket[]
): number {
  // binary search
  let low = targetPostTaxIncome;
  let high = targetPostTaxIncome * 2; // Initial guess: double the post-tax income
  const tolerance = 0.01; // Acceptable difference in dollars

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
