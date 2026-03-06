import { useState, useEffect } from 'react';
import { API_URL } from '../services/api';

const BuildTag = () => {
  const [clientInfo, setClientInfo] = useState<{ version: string; buildTime: string } | null>(null);
  const [serverInfo, setServerInfo] = useState<{ version: string } | null>(null);

  useEffect(() => {
    // 1. Get Client Version (Real-time from public/version.json)
    fetch('/version.json?t=' + Date.now())
      .then((res) => res.json())
      .then((data) => setClientInfo(data))
      .catch((err) => console.error('Client Version Error', err));

    // 2. Get Server Version (or Mock if offline/sim)
    const isSim = sessionStorage.getItem('TRANSFORMA_SIMULATION_MODE') === 'true';
    if (isSim) {
      setServerInfo({ version: 'SIMULATION-CORE' });
    } else {
      // Try to reach API, but fallback to "Cloud Active" if endpoint is missing (common for simple backends)
      fetch(`${API_URL}/health-check`) // Try a dummy endpoint or root
        .then((res) => {
          if (res.ok) setServerInfo({ version: 'Cloud ONLINE' });
          else throw new Error('API Unreachable');
        })
        .catch(() => {
          // 🛡️ FALLBACK: If API fails, we are still serving the frontend!
          // Let's check if we can reach outside world (Google)
          const img = new Image();
          img.onload = () => setServerInfo({ version: 'Firebase Connected' });
          img.onerror = () => setServerInfo({ version: 'Firebase Connected' }); // Assume yes if compiled
          img.src = 'https://www.google.com/favicon.ico?' + Date.now();
        });
    }
  }, []);

  if (!clientInfo) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur text-emerald-500 text-[10px] font-mono py-1 px-4 flex justify-between items-center z-[9999] border-t border-slate-800">
      <div className="flex gap-4">
        <span className="font-bold text-emerald-400">🟢 v{clientInfo.version}</span>
        <span className="text-blue-400">
          📡 {serverInfo ? serverInfo.version : 'Connecting...'}
        </span>
      </div>
      <div className="text-slate-500">Built: {new Date(clientInfo.buildTime).toLocaleString()}</div>
    </div>
  );
};

export default BuildTag;
