import MonteCarloSimulation, { LifeEvent } from './MonteCarloSimulation';
import { AssetClass, Inflation, Job } from './MonteCarloSimulation';

describe('MonteCarloSimulation', () => {
  describe('single asset class', () => {
    const allCashAssetClasses = [
      new AssetClass({
        name: 'Cash',
        standardDeviationPercentage: 0,
        averageAnnualReturnPercentage: 0,
        allocationPercentage: 100,
      }),
    ];
    const allStockAssetClasses = [
      new AssetClass({
        name: 'Stocks',
        standardDeviationPercentage: 0,
        averageAnnualReturnPercentage: 10,
        allocationPercentage: 100,
      }),
    ];

    type TestEmbellishmentTuple = [string, AssetClass[], number];
    const testCaseEmbellishments = [
      ['all cash, no inflation', allCashAssetClasses, 0],
      ['all cash, 3% inflation', allCashAssetClasses, 3],
      ['all 10% growth stocks, no inflation', allStockAssetClasses, 0],
      ['all 10% growth stocks, 3% inflation', allStockAssetClasses, 3],
      ['all 10% growth stocks, 10% inflation', allStockAssetClasses, 10],
    ] as TestEmbellishmentTuple[];

    describe.each<TestEmbellishmentTuple>(testCaseEmbellishments)(
      'single job with %s',
      (_name, assetClasses, inflationPercentage) => {
        const inflation = new Inflation({
          averageAnnualReturnPercentage: inflationPercentage,
          standardDeviationPercentage: 0,
        });

        const deflate = (balance: number, elapsedYears: number) => {
          return (
            balance / Math.pow(1 + inflation.averageAnnualReturn, elapsedYears)
          );
        };

        const growBalanceWithNetIncome = (
          balance: number,
          offset: number,
          elapsedYears: number
        ) => {
          const growthRate = 1 + assetClasses[0].averageAnnualReturn;
          const inflationRate = 1 + inflation.averageAnnualReturn;

          const totalCompoundedOffset = Array.from(
            { length: elapsedYears },
            (_, i) => {
              // offset is applied before inflation, so inflation has happened i times
              const yearsToInflateThisOffset = i;
              // growth happens each year after offset is applied, so growth has happened elapsedYears - 1 - i times
              const yearsToGrowThisOffset = elapsedYears - 1 - i;
              return (
                offset *
                Math.pow(inflationRate, yearsToInflateThisOffset) *
                Math.pow(growthRate, yearsToGrowThisOffset)
              );
            }
          ).reduce((acc, curr) => acc + curr, 0);

          return (
            balance * Math.pow(growthRate, elapsedYears) + totalCompoundedOffset
          );
        };

        describe('single job', () => {
          test('single perfect job', () => {
            const startingBalance = 1;
            const monthlyExpenses = -5000;
            const yearlyExpenses = monthlyExpenses * 12;
            const yearlyIncome = -yearlyExpenses;
            const jobs = [
              new Job({
                name: 'Job That Covers Exact Starting Expenses',
                postTaxAnnualIncome: yearlyIncome.toString(),
                adjustForInflation: 'on',
                yearlyRaisePercentage: '0',
                startDate: '',
                endDate: '',
              }),
            ];

            const yearlyResults = new MonteCarloSimulation(
              startingBalance,
              monthlyExpenses,
              jobs,
              [],
              assetClasses,
              inflation,
              new Date().getFullYear() + 100
            ).run();

            expect(yearlyResults.length).toBe(100);

            const firstYear = yearlyResults[0];
            const lastYear = yearlyResults[yearlyResults.length - 1];

            if (
              inflationPercentage === 0 &&
              assetClasses[0].averageAnnualReturn === 0
            ) {
              /* eslint-disable jest/no-conditional-expect */
              expect(firstYear.balance).toBe(startingBalance);
              expect(firstYear.inflationAdjustedBalance).toBe(
                firstYear.balance
              );

              expect(lastYear.balance).toBe(startingBalance);
              expect(lastYear.inflationAdjustedBalance).toBe(lastYear.balance);
              /* eslint-enable jest/no-conditional-expect */
            }

            let expectedBalance = growBalanceWithNetIncome(
              startingBalance,
              0,
              1
            );
            expect(firstYear.balance).toBeCloseTo(expectedBalance);
            expect(firstYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 1)
            );

            expectedBalance = growBalanceWithNetIncome(startingBalance, 0, 100);
            expect(lastYear.balance).toBeCloseTo(expectedBalance);
            expect(lastYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 100)
            );
          });

          test('single losing job', () => {
            const startingBalance = 1;
            const monthlyExpenses = -5000;
            const yearlyExpenses = monthlyExpenses * 12;
            const yearlyIncome = -yearlyExpenses - 1;
            const jobs = [
              new Job({
                name: 'Job That ALMOST Covers Exact Starting Expenses',
                postTaxAnnualIncome: yearlyIncome.toString(),
                adjustForInflation: 'on',
                yearlyRaisePercentage: '0',
                startDate: '',
                endDate: '',
              }),
            ];

            const yearlyResults = new MonteCarloSimulation(
              startingBalance,
              monthlyExpenses,
              jobs,
              [],
              assetClasses,
              inflation,
              new Date().getFullYear() + 100
            ).run();

            expect(yearlyResults.length).toBe(100);

            const firstYear = yearlyResults[0];
            const lastYear = yearlyResults[yearlyResults.length - 1];

            if (
              inflationPercentage === 0 &&
              assetClasses[0].averageAnnualReturn === 0
            ) {
              /* eslint-disable jest/no-conditional-expect */
              expect(firstYear.balance).toBe(startingBalance - 1);
              expect(firstYear.inflationAdjustedBalance).toBe(
                firstYear.balance
              );

              expect(lastYear.balance).toBe(startingBalance - 100);
              expect(lastYear.inflationAdjustedBalance).toBe(lastYear.balance);
              /* eslint-enable jest/no-conditional-expect */
            }

            let expectedBalance = growBalanceWithNetIncome(
              startingBalance,
              -1,
              1
            );

            expect(firstYear.balance).toBeCloseTo(expectedBalance);
            expect(firstYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 1)
            );

            expectedBalance = growBalanceWithNetIncome(
              startingBalance,
              -1,
              100
            );
            expect(lastYear.balance).toBeCloseTo(expectedBalance);
            expect(lastYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 100)
            );
          });

          test('single winning job', () => {
            const startingBalance = 0;
            const monthlyExpenses = -5000;
            const yearlyExpenses = monthlyExpenses * 12;
            const yearlyIncome = -yearlyExpenses + 1;
            const jobs = [
              new Job({
                name: 'Job That Covers Exact Starting Expenses PLUS $1',
                postTaxAnnualIncome: yearlyIncome.toString(),
                adjustForInflation: 'on',
                yearlyRaisePercentage: '0',
                startDate: '',
                endDate: '',
              }),
            ];

            const yearlyResults = new MonteCarloSimulation(
              startingBalance,
              monthlyExpenses,
              jobs,
              [],
              assetClasses,
              inflation,
              new Date().getFullYear() + 100
            ).run();

            expect(yearlyResults.length).toBe(100);

            const firstYear = yearlyResults[0];
            const lastYear = yearlyResults[yearlyResults.length - 1];

            if (
              inflationPercentage === 0 &&
              assetClasses[0].averageAnnualReturn === 0
            ) {
              /* eslint-disable jest/no-conditional-expect */
              expect(firstYear.balance).toBe(startingBalance + 1);
              expect(firstYear.inflationAdjustedBalance).toBe(
                firstYear.balance
              );

              expect(lastYear.balance).toBe(startingBalance + 100);
              expect(lastYear.inflationAdjustedBalance).toBe(lastYear.balance);
              /* eslint-enable jest/no-conditional-expect */
            }

            let expectedBalance = growBalanceWithNetIncome(
              startingBalance,
              1,
              1
            );

            expect(firstYear.balance).toBeCloseTo(expectedBalance);
            expect(firstYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 1)
            );

            expectedBalance = growBalanceWithNetIncome(startingBalance, 1, 100);

            expect(lastYear.balance).toBeCloseTo(expectedBalance);
            expect(lastYear.inflationAdjustedBalance).toBeCloseTo(
              deflate(expectedBalance, 100)
            );
          });
        });

        describe('life events', () => {
          test('balance decrease', () => {
            const startingDate = new Date();
            const startingYear = startingDate.getFullYear();

            const halfwayDate = new Date(startingDate);
            halfwayDate.setFullYear(startingYear + 50);

            const startingBalance = 100000;

            const yearlyResults = new MonteCarloSimulation(
              startingBalance,
              0,
              [],
              [
                new LifeEvent({
                  name: 'Lose It All In Hustlers Casino',
                  monthlyExpensesChange: '0',
                  balanceChange: (-startingBalance).toString(),
                  date: halfwayDate.toString(),
                }),
              ],
              assetClasses,
              inflation,
              startingYear + 100
            ).run();

            expect(yearlyResults.length).toBe(100);

            const averageReturn = assetClasses.reduce(
              (acc, { averageAnnualReturn, allocation }) =>
                acc + averageAnnualReturn * allocation,
              0
            );
            const isStatic = averageReturn === 0;

            yearlyResults.forEach((year, index) => {
              const expectedAdjustedBalance =
                startingBalance *
                Math.pow(
                  (1 + averageReturn) / (1 + inflation.averageAnnualReturn),
                  index + 1
                );

              /* eslint-disable jest/no-conditional-expect */
              if (index < 49) {
                if (isStatic) expect(year.balance).toBe(startingBalance);
                expect(year.inflationAdjustedBalance).toBeCloseTo(
                  expectedAdjustedBalance
                );
              } else if (index === 49) {
                if (averageReturn === inflation.averageAnnualReturn) {
                  expect(year.balance).toBeCloseTo(0);
                  expect(year.inflationAdjustedBalance).toBeCloseTo(0);
                } else if (averageReturn > inflation.averageAnnualReturn) {
                  expect(year.balance).toBeGreaterThan(0);
                  expect(year.inflationAdjustedBalance).toBeGreaterThan(0);

                  expect(year.inflationAdjustedBalance).toBeCloseTo(
                    expectedAdjustedBalance - startingBalance
                  );
                } else {
                  expect(year.balance).toBeLessThan(0);
                  expect(year.inflationAdjustedBalance).toBeLessThan(0);

                  expect(year.inflationAdjustedBalance).toBeCloseTo(
                    expectedAdjustedBalance - startingBalance
                  );
                }
              }
              /* eslint-enable jest/no-conditional-expect */
            });
          });
        });

        // test('all factors interact', () => {
        //   const startingYear = new Date().getFullYear();
        //   const endingYear = startingYear + 100;

        //   const startingBalance = 100000;
        //   const monthlyExpenses = 2000;
        //   const jobs = [
        //     new Job({
        //       name: 'Job That Covers Exact Starting Expenses',
        //       postTaxAnnualIncome: '24000',
        //       adjustForInflation: 'true',
        //       yearlyRaisePercentage: '0',
        //       startDate: '',
        //       endDate: '2025-12-31',
        //     }),
        //     new Job({
        //       name: 'Big Girl Job',
        //       postTaxAnnualIncome: '100000',
        //       adjustForInflation: 'on',
        //       yearlyRaisePercentage: '0',
        //       startDate: '2026-01-01',
        //       endDate: '2050-12-31',
        //     }),
        //   ];
        //   const lifeEvents = [
        //     new LifeEvent({
        //       name: 'Buy House',
        //       balanceChange: '-100000',
        //       monthlyExpensesChange: '1000',
        //       date: '2031-01-01',
        //     }),
        //   ];
        //   // asset classes average out to 5% annual return
        //   const assetClasses = [
        //     new AssetClass({
        //       name: 'Stocks',
        //       standardDeviationPercentage: 0,
        //       averageAnnualReturnPercentage: 10,
        //       allocationPercentage: 25,
        //     }),
        //     new AssetClass({
        //       name: 'Bonds',
        //       standardDeviationPercentage: 0,
        //       averageAnnualReturnPercentage: 5,
        //       allocationPercentage: 50,
        //     }),
        //     new AssetClass({
        //       name: 'Cash',
        //       standardDeviationPercentage: 0,
        //       averageAnnualReturnPercentage: 0,
        //       allocationPercentage: 25,
        //     }),
        //   ];
        //   const inflation = new Inflation({
        //     averageAnnualReturnPercentage: 3,
        //     standardDeviationPercentage: 0,
        //   });
        //   const yearlyResults = new MonteCarloSimulation(
        //     startingBalance,
        //     monthlyExpenses,
        //     jobs,
        //     lifeEvents,
        //     assetClasses,
        //     inflation,
        //     endingYear
        //   ).run();

        //   expect(yearlyResults.length).toBe(100);
        //   console.warn(yearlyResults[0]);
        // });
      }
    );
  });
});

// TODO:
// life event
// multiple life events
// multiple jobs
// multiple asset classes
// standard deviation
