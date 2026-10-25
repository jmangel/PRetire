import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/Tip The Dev/i);
  expect(linkElement).toBeInTheDocument();
});

test('shows the disclaimer once and links to About in the nav', () => {
  render(<App />);
  expect(screen.getAllByText(/not financial advice/)).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
});
