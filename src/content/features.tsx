import { ReactNode } from 'react';

export const FEATURES: { title: string; body: ReactNode }[] = [
  {
    title: 'Unlimited time-bound income sources',
    body: (
      <>
        Most retirement projections start from the retirement date.
        With PREtire, you can <b>configure as many income sources as you want across different dates</b>,
        so you can plan ahead whether you're just starting your career,
        considering a move to a slower-paced job,
        or ready to semi-retire before you give up work completely.
      </>
    ),
  },
  {
    title: 'Plan for big purchases, sales, or other changes',
    body: (
      <>
        Planning to sell your house in a couple years, then rent for a year, then maybe buy a bigger house?
        Plug all your planned sales, purchases, and changes to monthly expenses into the
        Life Events settings tab and see the projection graphs adjust to your plans.
      </>
    ),
  },
  {
    title: 'Fully customize your asset allocation',
    body: (
      <>
        Set up as many asset classes as you like, and make adjustments to the simulator even down to the standard deviation of each asset class.
      </>
    ),
  },
];
