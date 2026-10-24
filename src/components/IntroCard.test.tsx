import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntroCard, { INTRO_DISMISSED_KEY } from './IntroCard';

const renderCard = () => render(<MemoryRouter><IntroCard /></MemoryRouter>);

describe('IntroCard', () => {
  beforeEach(() => localStorage.clear());

  it('shows the intro and a link to the About page on first visit', () => {
    renderCard();
    expect(screen.getByText(/New here\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn more about PREtire/ })).toHaveAttribute('href', '/about');
  });

  it('hides and remembers dismissal when closed', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
    expect(localStorage.getItem(INTRO_DISMISSED_KEY)).toBe('true');
  });

  it('stays hidden for returning users who dismissed it', () => {
    localStorage.setItem(INTRO_DISMISSED_KEY, 'true');
    renderCard();
    expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
  });
});
