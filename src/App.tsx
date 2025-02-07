import React from 'react';
import './App.css';
import Root from './routes/root';
import {
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';
import ErrorPage from './pages/ErrorPage';
import MonteCarloPage, {
  action as monteCarloAction,
} from './pages/MonteCarloPage';
import TaxCalculatorPage from './pages/TaxCalculatorPage';

const App = () => {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Root />,
      errorElement: <ErrorPage />,
      children: [
        {
          index: true,
          element: <Navigate to="monte_carlo" replace />,
        },
        {
          path: 'monte_carlo',
          element: <MonteCarloPage />,
          action: monteCarloAction,
        },
        {
          path: 'tax_calculator',
          element: <TaxCalculatorPage />,
        },
      ],
    },
  ];

  return <RouterProvider router={createBrowserRouter(routes)} />;
};

export default App;
