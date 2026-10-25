import { fireEvent, render, screen } from '@testing-library/react';
import LegalDisclaimer from './LegalDisclaimer';

describe('LegalDisclaimer', () => {
  it('shows a short disclaimer that expands to the full text and collapses again', () => {
    render(<LegalDisclaimer />);
    expect(screen.getByText(/not financial advice/)).toBeInTheDocument();
    expect(screen.queryByText(/certified financial advisors/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Read full disclaimer' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByText(/certified financial advisors/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide full disclaimer' }));
    expect(screen.queryByText(/certified financial advisors/)).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
