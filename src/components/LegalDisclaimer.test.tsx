import { fireEvent, render, screen } from '@testing-library/react';
import LegalDisclaimer from './LegalDisclaimer';

describe('LegalDisclaimer', () => {
  it('shows a short disclaimer that expands to the full text', () => {
    render(<LegalDisclaimer />);
    expect(screen.getByText(/not financial advice/)).toBeInTheDocument();
    expect(screen.queryByText(/certified financial advisors/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Read full disclaimer' }));
    expect(screen.getByText(/certified financial advisors/)).toBeInTheDocument();
  });
});
