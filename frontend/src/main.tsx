import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './index.css';
import App from './App.tsx';
import { FeedbackProvider } from './context/FeedbackProvider';
import { BootScreen } from './components/BootScreen';
import BuildBadge from './components/BuildBadge';
import { initAppVersionWatcher } from './utils/appVersion';
import { registerServiceWorker } from './utils/swRegistration';
import { initMonitoring } from './services/monitoring';

import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Global timezone overrides for America/Montevideo and locale es-UY
const originalToLocaleString = Date.prototype.toLocaleString;
const originalToLocaleDateString = Date.prototype.toLocaleDateString;
const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

Date.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
  const mergedOptions = { timeZone: 'America/Montevideo', ...options };
  return originalToLocaleString.call(this, locales || 'es-UY', mergedOptions);
};

Date.prototype.toLocaleDateString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
  const mergedOptions = { timeZone: 'America/Montevideo', ...options };
  return originalToLocaleDateString.call(this, locales || 'es-UY', mergedOptions);
};

Date.prototype.toLocaleTimeString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
  const mergedOptions = { timeZone: 'America/Montevideo', ...options };
  return originalToLocaleTimeString.call(this, locales || 'es-UY', mergedOptions);
};

defineCustomElements(window);

if (import.meta.env.MODE !== 'production') {
  (window as any).genesis = () => import('./utils/seedDatabase').then((m) => m.runGenesisProtocol());
  console.log("[dev] genesis() disponible para seed de datos.");
}

// Monitoring: arranca lazy. Si VITE_SENTRY_DSN está configurado, se
// inicializa Sentry; si no, fallback transparente a console.error.
void initMonitoring();

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
