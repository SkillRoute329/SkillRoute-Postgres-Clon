import React, { useEffect, useState } from 'react';
import { ConnectivityGuard } from '../services/ConnectivityGuard';
import type { ConnectivityStatus } from '../services/ConnectivityGuard';
import { ShieldCheck, WifiOff, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface BootScreenProps {
  onComplete: () => void;
}

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<ConnectivityStatus>('ONLINE');
  const [message, setMessage] = useState('Iniciando protocolos de seguridad...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const boot = async () => {
      // Fake progress for UX
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 200);

      try {
        const health = await ConnectivityGuard.performHealthCheck();
        setStatus(health.status);
        setMessage(health.message);

        setProgress(100);
        setTimeout(() => {
          clearInterval(interval);
          onComplete();
        }, 800); // Small delay to show "100%"
      } catch (e) {
        console.error('Boot Error', e);
        setStatus('BLOCKED');
        setMessage('Error crítico en inicialización.');
        // Even on error, we might want to let them in (Offline Mode)
        setTimeout(() => onComplete(), 2000);
      }
    };

    // FAIL-SAFE: If detailed checks hang (e.g. Firestore offline), force entry after 3 seconds anyway.
    // We never want to lock the user out with a permanent spinner.
    // FAIL-SAFE: IMMEDIATE ENTRY IF ANY LAG DETECTED
    const safeTimeout = setTimeout(() => {
      console.warn('🛡️ BootScreen: Safety Timeout. Entrando...');
      onComplete();
    }, 500); // 0.5s max wait

    boot().then(() => clearTimeout(safeTimeout));
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[99999]">
      {/* Logo Pulse */}
      <div className="mb-12 relative">
        <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center animate-pulse shadow-[0_0_50px_rgba(37,99,235,0.5)]">
          <ShieldCheck className="w-12 h-12 text-white" />
        </div>
        {/* Spinner Ring */}
        {progress < 100 && (
          <div className="absolute top-0 left-0 w-24 h-24 border-4 border-blue-400/30 border-t-white rounded-full animate-spin" />
        )}
      </div>

      <h1 className="text-2xl font-black text-white tracking-tight mb-2">
        UCOT GESTOR <span className="text-blue-500">CLOUD</span>
      </h1>

      {/* Status Message */}
      <div className="h-8 flex items-center gap-2">
        {status === 'OFFLINE' && <WifiOff className="w-4 h-4 text-orange-500" />}
        {status === 'UNSTABLE' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
        <p
          className={`text-sm font-mono ${status === 'BLOCKED' ? 'text-red-400' : 'text-slate-400'}`}
        >
          {message}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-64 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden">
        <div
          className={clsx(
            'h-full transition-all duration-300 progress-bar-fill',
            status === 'BLOCKED'
              ? 'bg-red-500'
              : status === 'OFFLINE'
                ? 'bg-orange-500'
                : 'bg-emerald-500',
          )}
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
        />
      </div>

      <p className="fixed bottom-8 text-[10px] text-slate-600 font-mono">
        v2.1.0 • SECURE CONNECTION GUARD
      </p>
    </div>
  );
};
