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
      }
    );

    test('all factors interact', () => {
      const startingYear = new Date().getFullYear();
      const endingYear = startingYear + 100;

      const startingBalance = 100000;
      const monthlyExpenses = -2000;
      const jobs = [
        new Job({
          name: 'Initial Job',
          postTaxAnnualIncome: '24000',
          adjustForInflation: 'on',
          yearlyRaisePercentage: '0',
          startDate: '',
          endDate: (startingYear + 5).toString() + '-12-31',
        }),
        new Job({
          name: 'Career Job',
          postTaxAnnualIncome: '100000',
          adjustForInflation: 'on',
          yearlyRaisePercentage: '3',
          startDate: (startingYear + 6).toString() + '-01-01',
          endDate: (startingYear + 30).toString() + '-12-31',
        }),
      ];
      const lifeEvents = [
        new LifeEvent({
          name: 'Buy House',
          balanceChange: '-100000',
          monthlyExpensesChange: '-1000',
          date: (startingYear + 10).toString() + '-02-01',
        }),
        new LifeEvent({
          name: 'Inheritance',
          balanceChange: '200000',
          monthlyExpensesChange: '0',
          date: (startingYear + 20).toString() + '-02-01',
        }),
        new LifeEvent({
          name: 'Retirement',
          balanceChange: '0',
          monthlyExpensesChange: '1000',
          date: (startingYear + 30).toString() + '-02-01',
        }),
      ];
      const assetClasses = [
        new AssetClass({
          name: 'Stocks',
          standardDeviationPercentage: 0,
          averageAnnualReturnPercentage: 10,
          allocationPercentage: 60,
        }),
        new AssetClass({
          name: 'Bonds',
          standardDeviationPercentage: 0,
          averageAnnualReturnPercentage: 5,
          allocationPercentage: 30,
        }),
        new AssetClass({
          name: 'Cash',
          standardDeviationPercentage: 0,
          averageAnnualReturnPercentage: 2,
          allocationPercentage: 10,
        }),
      ];
      const testInflation = new Inflation({
        averageAnnualReturnPercentage: 3,
        standardDeviationPercentage: 0,
      });

      // Run simulation
      const yearlyResults = new MonteCarloSimulation(
        startingBalance,
        monthlyExpenses,
        jobs,
        lifeEvents,
        assetClasses,
        testInflation,
        endingYear
      ).run();

      expect(yearlyResults.length).toBe(100);

      const year5 = yearlyResults[4]; // End of initial job
      const year9 = yearlyResults[8]; // Year before house purchase
      const year10 = yearlyResults[9]; // House purchase
      const year20 = yearlyResults[19]; // Inheritance
      const year30 = yearlyResults[29]; // Retirement
      const year100 = yearlyResults[99]; // End of simulation

      // Test balance progression
      expect(year5.inflationAdjustedBalance).toBeGreaterThan(startingBalance);
      expect(year9.inflationAdjustedBalance).toBeGreaterThan(
        year5.inflationAdjustedBalance
      );

      // Test house purchase impact
      const expectedYear10WithoutPurchase =
        year9.inflationAdjustedBalance * (1 + 0.077) + 100000 - 24000; // Growth + income - expenses
      expect(year10.inflationAdjustedBalance).toBeLessThan(
        expectedYear10WithoutPurchase
      );

      // Test inheritance impact
      expect(year20.inflationAdjustedBalance).toBeGreaterThan(
        yearlyResults[18].inflationAdjustedBalance + 200000
      );

      // Should still have money at end due to investment returns
      expect(year100.balance).toBeGreaterThan(0);
      expect(year100.inflationAdjustedBalance).toBeLessThan(year100.balance);

      // Test monthly expenses changes
      expect(year10.inflationAdjustedMonthlyExpenses).toBeCloseTo(
        monthlyExpenses - 1000
      );
      // Retirement increases monthly expenses by 1000
      expect(year30.inflationAdjustedMonthlyExpenses).toBeCloseTo(
        year20.inflationAdjustedMonthlyExpenses + 1000
      );
    });
  });
});

// TODO:
// life event
// multiple life events
// multiple jobs
// multiple asset classes
// standard deviation
