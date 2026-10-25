import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';
import { FEATURES } from '../content/features';

describe('AboutPage', () => {
  it('explains privacy, lists every feature, and links to the planner', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);
    expect(screen.getByText(/never leaves your device/)).toBeInTheDocument();
    expect(screen.getByText(/JSON file/)).toBeInTheDocument();
    FEATURES.forEach(({ title }) => expect(screen.getByText(title)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Start planning' })).toHaveAttribute('href', '/monte_carlo');
  });
});
