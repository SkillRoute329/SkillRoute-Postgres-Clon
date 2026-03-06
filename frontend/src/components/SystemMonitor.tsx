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
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '350px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#00ff00',
        fontFamily: 'monospace',
        padding: '15px',
        borderRadius: '8px',
        zIndex: 9999,
        border: '1px solid #00ff00',
        fontSize: '12px',
        boxShadow: '0 0 15px rgba(0, 255, 0, 0.2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '10px',
          borderBottom: '1px solid #333',
        }}
      >
        <strong>🖥️ SYSTEM MONITOR (CHAOS ENGINE)</strong>
        <button
          onClick={() => setVisible(false)}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '4px' }}>
            {log}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '10px', fontSize: '10px', color: '#888' }}>
        Mode: CLIENT-SIDE SIMULATION | Status: RUNNING
      </div>
    </div>
  );
};
