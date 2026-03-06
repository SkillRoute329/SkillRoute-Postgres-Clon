import React from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { RefreshCw } from 'lucide-react';

export const VersionGuard = () => {
  const { isUpdating } = useVersionCheck();

  if (!isUpdating) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-[99999] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
      <RefreshCw className="w-16 h-16 text-primary-500 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-white mb-2">Actualizando Sistema...</h2>
      <p className="text-slate-400 max-w-sm">
        Se ha detectado una nueva versión de la plataforma. Sincronizando cambios críticos para
        garantizar la integridad de sus datos.
      </p>
      <div className="mt-8 bg-slate-800 rounded-full h-1 w-48 overflow-hidden">
        <div className="h-full bg-primary-500 animate-progress"></div>
      </div>
    </div>
  );
};
