import React, { useState, useEffect } from 'react';
import { ChaosEngine } from '../simulation/ChaosEngine';

export const SystemMonitor: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Subscribe to Chaos Logs
    ChaosEngine.setCallback((msg) => {
      setLogs((prev) => [msg, ...prev].slice(0, 10)); // Keep last 10
      setVisible(true);
    });

    // Expose start/stop globally
    (window as any).startChaos = () => ChaosEngine.start();
    (window as any).stopChaos = () => ChaosEngine.stop();

    return () => ChaosEngine.stop();
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 w-[350px] bg-black/85 text-[#00ff00] font-mono p-4 rounded-lg z-[9999] border border-[#00ff00] text-xs shadow-[0_0_15px_rgba(0,255,0,0.2)]">
      <div className="flex justify-between mb-2.5 pb-2 border-b border-[#333]">
        <strong>🖥️ SYSTEM MONITOR (CHAOS ENGINE)</strong>
        <button
          onClick={() => setVisible(false)}
          className="bg-transparent border-none text-[#666] cursor-pointer hover:text-white"
        >
          ×
        </button>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="mb-1">
            {log}
          </div>
        ))}
      </div>
      <div className="mt-2.5 text-[10px] text-[#888]">
        Mode: CLIENT-SIDE SIMULATION | Status: RUNNING
      </div>
    </div>
  );
};
