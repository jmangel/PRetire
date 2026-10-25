import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntroCard, { INTRO_DISMISSED_KEY } from './IntroCard';
import { FEATURES } from '../content/features';

const renderCard = () => render(<MemoryRouter><IntroCard /></MemoryRouter>);

describe('IntroCard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it('shows the intro and a link to the About page on first visit', () => {
    renderCard();
    expect(screen.getByText(/New here\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn more about PREtire/ })).toHaveAttribute('href', '/about');
  });

  it('lists every feature', () => {
    renderCard();
    FEATURES.forEach(({ title }) => expect(screen.getByText(title)).toBeInTheDocument());
  });

  it('opens the About link in a new tab so the form is not lost', () => {
    renderCard();
    expect(screen.getByRole('link', { name: /Learn more about PREtire/ })).toHaveAttribute('target', '_blank');
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

  it('still shows when storage cannot be read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    renderCard();
    expect(screen.getByText(/New here\?/)).toBeInTheDocument();
  });

  it('still hides on close when storage cannot be written', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
  });
});
