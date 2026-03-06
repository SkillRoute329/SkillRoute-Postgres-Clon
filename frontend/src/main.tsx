import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './index.css';
import App from './App.tsx';
import { FeedbackProvider } from './context/FeedbackProvider';
import { runGenesisProtocol } from './utils/seedDatabase';
import { BootScreen } from './components/BootScreen';

import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Initialize PWA Elements (Camera, etc)
defineCustomElements(window);

// Expose Genesis Protocol for Manual/Automated Trigger
(window as any).genesis = runGenesisProtocol;
console.log("🤖 [GENESIS] Protocol ready. Type 'window.genesis()' to seed data.");

const Root = () => {
  const [booted, setBooted] = useState(false);

  if (!booted) {
    return <BootScreen onComplete={() => setBooted(true)} />;
  }

  return (
    <>
      <FeedbackProvider />
      <App />
    </>
  );
};

createRoot(document.getElementById('root')!).render(<Root />);
