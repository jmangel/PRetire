import Papa from 'papaparse';

export interface TaxBracket {
  upperBound: number | null; // null represents infinity
  rate: number; // as decimal (e.g., 0.25 for 25%)
  cumulativeTaxAtStart: number; // Pre-calculated tax up to this bracket's start
}

export interface TaxBracketSet {
  name: string;
  brackets: TaxBracket[];
  year: number;
}

// Sort tax brackets by upper bound and pre-calculate cumulative tax
export function prepareTaxBrackets(brackets: TaxBracket[]): TaxBracket[] {
  const sortedBrackets = brackets.sort((a, b) => {
    if (a.upperBound === null) return 1;
    if (b.upperBound === null) return -1;
    return a.upperBound - b.upperBound;
  });

  let cumulativeTax = 0;
  let previousUpperBound = 0;

  return sortedBrackets.map((bracket) => {
    const bracketStart = previousUpperBound;
    if (bracket.upperBound !== null) {
      cumulativeTax += (bracket.upperBound - bracketStart) * bracket.rate;
      previousUpperBound = bracket.upperBound;
    }
    return {
      ...bracket,
      cumulativeTaxAtStart: cumulativeTax,
    };
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
    cumulativeTaxAtStart: 0, // Will be calculated in prepareTaxBrackets
  }));

  return {
    name: 'Imported Tax Brackets',
    brackets: prepareTaxBrackets(brackets),
    year: new Date().getFullYear(),
  };
}

export function calculateTax(income: number, brackets: TaxBracket[]): number {
  // Find the applicable bracket
  const bracket = brackets.find(
    (b) => b.upperBound === null || income <= b.upperBound
  );
  if (!bracket) return 0;

  // Get the previous bracket's upper bound (or 0 if it's the first bracket)
  const bracketIndex = brackets.indexOf(bracket);
  const bracketStart =
    bracketIndex > 0 ? brackets[bracketIndex - 1].upperBound! : 0;

  // Calculate tax using pre-calculated cumulative tax
  return bracket.cumulativeTaxAtStart + (income - bracketStart) * bracket.rate;
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
  const tolerance = 0.01;

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
