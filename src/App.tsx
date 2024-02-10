import React from 'react';
import './App.css';
import Root from './routes/root'
import { Navigate, RouteObject, RouterProvider, createBrowserRouter } from 'react-router-dom';
import ErrorPage from './pages/ErrorPage';
import MonteCarloPage from './pages/MonteCarloPage';

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
          path: "monte_carlo",
          element: <MonteCarloPage />,
        },
      ],
    },
  ];

  return <RouterProvider router={createBrowserRouter(routes)} />
}

export default App;
