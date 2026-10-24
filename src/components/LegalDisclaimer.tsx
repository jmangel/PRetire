import { useState } from 'react';
import { Button } from 'react-bootstrap';

const LegalDisclaimer = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <footer className="text-center text-muted m-2 mt-4">
      <p><small><em>
        Disclaimer: This app is for educational purposes only and is not financial advice.{' '}
        <Button
          variant="link"
          size="sm"
          className="p-0 align-baseline"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide full disclaimer' : 'Read full disclaimer'}
        </Button>
      </em></small></p>
      {expanded && (
        <p><small><em>
          We are not certified financial advisors, nor do we claim to provide expert financial
          advice. The information and tools provided by this app should not be
          interpreted as financial advice. We encourage all users to seek the advice
          of qualified financial professionals regarding personal investment and
          financial planning decisions. By using this app, you acknowledge and agree
          that any financial decisions made are at your own risk, and we shall not
          be liable for any losses or damages arising from your reliance on the
          information provided herein.
        </em></small></p>
      )}
    </footer>
  );
};

export default LegalDisclaimer;
