import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './index.css';
import App from './App.tsx';
import { FeedbackProvider } from './context/FeedbackProvider';
import { BootScreen } from './components/BootScreen';
import BuildBadge from './components/BuildBadge';
import { initAppVersionWatcher } from './utils/appVersion';
import { registerServiceWorker } from './utils/swRegistration';

import { defineCustomElements } from '@ionic/pwa-elements/loader';

defineCustomElements(window);

(window as any).genesis = () => import('./utils/seedDatabase').then((m) => m.runGenesisProtocol());
console.log("🤖 [GENESIS] Protocol ready. Type 'window.genesis()' to seed data.");

// Ciclo de vida: SW + watcher de versión. Si se despliega una versión nueva,
// el cliente la detecta en <=60s y se recarga solo (sin intervención manual).
initAppVersionWatcher();
registerServiceWorker();

const Root = () => {
  const [booted, setBooted] = useState(false);

  if (!booted) {
    return <BootScreen onComplete={() => setBooted(true)} />;
  }

  return (
    <>
      <FeedbackProvider />
      <App />
      <BuildBadge />
    </>
  );
};

createRoot(document.getElementById('root')!).render(<Root />);
