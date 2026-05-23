import { useState, useEffect } from 'react';
import { API_URL } from '../services/api';

const BuildTag = () => {
  const [clientInfo, setClientInfo] = useState<{ version: string; buildTime: string } | null>(null);
  const [serverInfo, setServerInfo] = useState<{ version: string } | null>(() => {
    const isSim = sessionStorage.getItem('TRANSFORMA_SIMULATION_MODE') === 'true';
    return isSim ? { version: 'SIMULATION-CORE' } : null;
  });

  useEffect(() => {
    // 1. Get Client Version (Real-time from public/version.json)
    fetch('/version.json?t=' + Date.now())
      .then((res) => res.json())
      .then((data) => setClientInfo(data))
      .catch((err) => console.error('Client Version Error', err));

    // 2. Get Server Version desde el clon local (Postgres + JWT, sin cloud)
    //    FASE 4.8 (2026-05-12): se eliminó el fallback "Firebase Connected"
    //    porque el clon ya no usa Firebase; ahora muestra "Backend local" u
    //    "Offline" según la respuesta del health del clon.
    if (!serverInfo) {
      fetch(`${API_URL}/health`)
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('API Unreachable')))
        .then((body) => {
          const v = body?.data?.version || body?.version || 'local';
          setServerInfo({ version: `Backend local ${v}` });
        })
        .catch(() => {
          setServerInfo({ version: 'Backend offline' });
        });
    }
  }, [serverInfo]);

  if (!clientInfo) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur text-emerald-500 text-[10px] font-mono py-1 px-4 flex justify-between items-center z-[9999] border-t border-slate-800">
      <div className="flex gap-4">
        <span className="font-bold text-emerald-400">🟢 v{clientInfo.version}</span>
        <span className="text-blue-400">
          📡 {serverInfo ? serverInfo.version : 'Connecting...'}
        </span>
      </div>
      <div className="text-slate-500">
        {(() => {
          if (!clientInfo.buildTime) return 'Built: —';
          const d = new Date(clientInfo.buildTime);
          if (isNaN(d.getTime())) return `Built: ${clientInfo.buildTime}`;
          return `Built: ${d.toLocaleString()}`;
        })()}
      </div>
    </div>
  );
};

export default BuildTag;
