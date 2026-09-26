import MonteCarloSimulation, { LifeEvent } from './MonteCarloSimulation';
import { AssetClass, Inflation, Job, fractionOfYearActive } from './MonteCarloSimulation';

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

          test('runDeterministic follows average return and inflation rates', () => {
            const startingBalance = 100;
            const monthlyExpenses = 0;
            const jobs: any[] = [];
            const lifeEvents: any[] = [];
            const assetClasses = [
              new AssetClass({
                name: 'Stocks',
                standardDeviationPercentage: 20,
                averageAnnualReturnPercentage: 10,
                allocationPercentage: 100,
              }),
            ];
            const inflation = new Inflation({
              averageAnnualReturnPercentage: 3,
              standardDeviationPercentage: 5,
            });

            const yearlyResults = new MonteCarloSimulation(
              startingBalance,
              monthlyExpenses,
              jobs,
              lifeEvents,
              assetClasses,
              inflation,
              new Date().getFullYear() + 2
            ).runDeterministic();

            expect(yearlyResults.length).toBe(2);
            expect(yearlyResults[0].balance).toBeCloseTo(110);
            expect(yearlyResults[0].inflation).toBeCloseTo(0.03);
            expect(yearlyResults[0].inflationAdjustedBalance).toBeCloseTo(110 / 1.03);
            expect(yearlyResults[1].balance).toBeCloseTo(121);
          });
        });

        describe('life events', () => {
          test('balance decrease', () => {
            const startingYear = new Date().getFullYear();
            // A date-input-shaped string, so the event's year is the same in
            // UTC at any time zone or time of day.
            const halfwayDate = `${startingYear + 50}-06-15`;

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
                  date: halfwayDate,
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

describe('fractionOfYearActive', () => {
  test('open-ended range covers the whole year', () => {
    expect(fractionOfYearActive(2030)).toBe(1);
  });

  test('range outside the year is inactive', () => {
    expect(fractionOfYearActive(2030, new Date('2031-01-01'))).toBe(0);
    expect(fractionOfYearActive(2030, undefined, new Date('2030-01-01'))).toBe(0);
  });

  test('end date is exclusive, so adjacent ranges split the year exactly', () => {
    const boundary = new Date('2030-03-02');
    const before = fractionOfYearActive(2030, undefined, boundary);
    const after = fractionOfYearActive(2030, boundary, undefined);

    expect(before).toBeCloseTo(60 / 365, 10); // Jan 1 - Mar 1
    expect(before + after).toBeCloseTo(1, 10);
  });

  test('leap years divide by 366 days', () => {
    const before = fractionOfYearActive(2032, undefined, new Date('2032-03-02'));

    expect(before).toBeCloseTo(61 / 366, 10); // Jan 1 - Mar 1, including Feb 29
  });
});

describe('MonteCarloSimulation.jobsIncome', () => {
  const cash = [
    new AssetClass({
      name: 'Cash',
      standardDeviationPercentage: 0,
      averageAnnualReturnPercentage: 0,
      allocationPercentage: 100,
    }),
  ];
  const noInflation = new Inflation({
    averageAnnualReturnPercentage: 0,
    standardDeviationPercentage: 0,
  });
  const job = (
    postTaxAnnualIncome: string,
    startDate: string,
    endDate: string,
    adjustForInflation = ''
  ) =>
    new Job({
      name: '',
      postTaxAnnualIncome,
      adjustForInflation,
      yearlyRaisePercentage: '0',
      startDate,
      endDate,
    });
  const simulation = (jobs: Job[]) =>
    new MonteCarloSimulation(0, 0, jobs, [], cash, noInflation, 2100);

  test('switching jobs mid-year does not pay both salaries for that year', () => {
    const sim = simulation([
      job('100000', '', '2030-03-02'),
      job('120000', '2030-03-02', ''),
    ]);
    const before = 60 / 365;

    expect(sim.jobsIncome(2029)).toBeCloseTo(100000, 6);
    expect(sim.jobsIncome(2030)).toBeCloseTo(100000 * before + 120000 * (1 - before), 6);
    expect(sim.jobsIncome(2031)).toBeCloseTo(120000, 6);
  });

  test('a job ending partway through a year only pays for the part worked', () => {
    const sim = simulation([job('120000', '', '2046-07-02')]);

    expect(sim.jobsIncome(2046)).toBeCloseTo(120000 * (182 / 365), 6);
    expect(sim.jobsIncome(2047)).toBe(0);
  });

  test('inflation adjustment applies to the prorated income', () => {
    const sim = simulation([job('120000', '', '2046-07-02', 'on')]);

    expect(sim.jobsIncome(2046, 1.5)).toBeCloseTo(120000 * (182 / 365) * 1.5, 6);
  });

  test('a job with an unparseable date is skipped instead of producing NaN', () => {
    const sim = simulation([job('100000', '', 'not-a-date'), job('50000', '', '')]);

    expect(sim.jobsIncome(2030)).toBe(50000);
  });
});

describe('MonteCarloSimulation life event year', () => {
  // Dates from <input type="date"> parse as UTC midnight, so a local-time year
  // check shifts boundary dates into the wrong year west or east of UTC.
  const lifeEvent = (date: string) =>
    new LifeEvent({
      name: '',
      balanceChange: '1000',
      monthlyExpensesChange: '10',
      date,
    });
  const simulation = (lifeEvents: LifeEvent[]) =>
    new MonteCarloSimulation(
      0,
      0,
      [],
      lifeEvents,
      [],
      new Inflation({ averageAnnualReturnPercentage: 0, standardDeviationPercentage: 0 }),
      2100
    );

  test.each(['2030-01-01', '2030-12-31'])('%s applies in 2030 in any time zone', (date) => {
    const sim = simulation([lifeEvent(date)]);

    expect(sim.lifeEventsBalanceChange(2029)).toBe(0);
    expect(sim.lifeEventsBalanceChange(2030)).toBe(1000);
    expect(sim.lifeEventsBalanceChange(2031)).toBe(0);
    expect(sim.lifeEventsMonthlyExpensesChange(2030)).toBe(10);
  });
});

// TODO:
// life event
// multiple life events
// multiple jobs
// multiple asset classes
// standard deviation
