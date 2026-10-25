import { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FEATURES } from '../content/features';

export const INTRO_DISMISSED_KEY = 'pretire.introDismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(INTRO_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

// A first-visit introduction that stays hidden once the user closes it.
const IntroCard = () => {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INTRO_DISMISSED_KEY, 'true');
    } catch {
      // Storage unavailable (e.g. private browsing); hide for this visit only.
    }
  };

  return (
    <Alert variant="info" dismissible onClose={dismiss} className="text-start mx-auto" style={{ maxWidth: 720 }}>
      <Alert.Heading as="h5">New here? PREtire lets you fully configure your Monte Carlo simulations:</Alert.Heading>
      <ul className="mb-2">
        {FEATURES.map(({ title }) => <li key={title}>{title}</li>)}
      </ul>
      <Link to="/about" target="_blank" rel="noopener noreferrer">Learn more about PREtire</Link>
    </Alert>
  );
};

export default IntroCard;
