import React, { useEffect, useState } from 'react';
import { ConnectivityGuard } from '../services/ConnectivityGuard';
import type { ConnectivityStatus } from '../services/ConnectivityGuard';
import { ShieldCheck, WifiOff, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface BootScreenProps {
  onComplete: () => void;
}

const widthMap: Record<number, string> = {
  0: 'w-0',
  10: 'w-[10%]',
  20: 'w-[20%]',
  30: 'w-[30%]',
  40: 'w-[40%]',
  50: 'w-[50%]',
  60: 'w-[60%]',
  70: 'w-[70%]',
  80: 'w-[80%]',
  90: 'w-[90%]',
  100: 'w-full',
};

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<ConnectivityStatus>('ONLINE');
  const [message, setMessage] = useState('Iniciando protocolos de seguridad...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const boot = async () => {
      // Fake progress for UX
      const interval = setInterval(() => {
        setProgress((p) => {
          const next = Math.min(p + 10, 90);
          return Math.floor(next / 10) * 10; // ensure it locks to tens map
        });
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
      <div className="mb-10 relative">
        <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(37,99,235,0.3)]"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <img
            src="/skillroute-logo.png"
            alt="SkillRoute"
            className="w-16 h-16 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).replaceWith((() => { const el = document.createElement('div'); el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="48" height="48"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5c-.3-1-.8-2-1.6-2.8C17.7 4.4 16.4 4 15 4H5c-1.4 0-2.7.4-3.8 1c-.8.8-1.3 1.8-1.6 2.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'; return el.firstChild as Node; })()); }}
          />
        </div>
        {progress < 100 && (
          <div className="absolute top-0 left-0 w-24 h-24 border-2 border-blue-400/20 border-t-blue-400/60 rounded-full animate-spin" />
        )}
      </div>

      <h1 className="text-2xl font-black tracking-tight mb-2">
        <span className="text-white">Skill</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-orange-400">Route</span>
      </h1>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-4">Gestión en Movimiento</p>

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
            widthMap[progress] || 'w-0',
            status === 'BLOCKED'
              ? 'bg-red-500'
              : status === 'OFFLINE'
                ? 'bg-orange-500'
                : 'bg-emerald-500',
          )}
        />
      </div>

      <p className="fixed bottom-8 text-[10px] text-slate-700 font-mono">
        SkillRoute v4.0 • Plataforma Multi-Empresa
      </p>
    </div>
  );
};
