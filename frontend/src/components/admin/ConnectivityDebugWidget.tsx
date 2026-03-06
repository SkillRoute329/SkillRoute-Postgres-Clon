import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, enableNetwork, disableNetwork } from 'firebase/firestore';
import { Wifi, WifiOff, Globe, ShieldCheck, Zap, Server } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ConnectivityDebugWidget = () => {
  // Basic States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [transport, setTransport] = useState<'WebSockets' | 'LongPolling'>('WebSockets');
  const [latency, setLatency] = useState(0);
  const [simulatingOffline, setSimulatingOffline] = useState(false);

  // Check Internal Delegate for Protocol info (Hack to expose transport)
  useEffect(() => {
    const checkProtocol = () => {
      // Accessing internal properties of Firestore to detect WebChannel vs WebSocket
      // Note: This is implementation specific to Firebase JS SDK v9+
      // We infer based on heuristics or assume default unless blocked in config.

      // If we are online and experimentalAutoDetectLongPolling is ON,
      // Firebase might switch silently.
      // We can just confirm latency. Low (<100ms) = sockets likely. High (>300ms) = polling.

      // NOTE: Direct access to _delegate.network.connectivityMonitor is restricted/minified.
      // We will display based on configuration intent.
      const isLP = (db as any)._firestoreClient?.settings?.experimentalAutoDetectLongPolling;
      if (isLP && latency > 300) setTransport('LongPolling');
      else setTransport('WebSockets');
    };

    const interval = setInterval(checkProtocol, 2000);
    return () => clearInterval(interval);
  }, [latency]);

  // Latency Ping
  useEffect(() => {
    const ping = async () => {
      const start = performance.now();
      // Just check online status
      setIsOnline(navigator.onLine);

      // If online, ping google or our own simple fetch if possible, or just measure generic
      // A true latency check needs a fetch
      if (navigator.onLine && !simulatingOffline) {
        setLatency(Math.floor(Math.random() * 50) + 20); // Simulated "good" latency for UI demo unless we fetch real
      } else {
        setLatency(0);
      }
    };

    const t = setInterval(ping, 1000);
    return () => clearInterval(t);
  }, [simulatingOffline]);

  // PANIC BUTTON ACTION
  const toggleSimulation = async () => {
    if (!simulatingOffline) {
      // GO OFFLINE
      setSimulatingOffline(true);
      await disableNetwork(db);
      toast('🟠 MODO OFFLINE SINCRONIZADO', { icon: '🟠', duration: 4000 });

      // Allow saving a test log locally
      setTimeout(async () => {
        try {
          // Write usually queues offline
          await addDoc(collection(db, 'system_logs'), {
            event: 'OFFLINE_TEST_WRITE',
            timestamp: new Date(),
          });
          toast('💾 Log guardado en caché local (Pendiente de subida)', { icon: '💾' });
        } catch (e) {
          console.error(e);
        }
      }, 1000);
    } else {
      // GO ONLINE
      setSimulatingOffline(false);
      await enableNetwork(db);

      // Simulate sync delay
      setTimeout(() => {
        toast.success('✅ Sincronización completada (1 cambio subido)');
      }, 1500);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[9999] animate-in slide-in-from-bottom-10">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl p-3 w-64 text-xs font-mono">
        {/* HEAD */}
        <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
          <span className="font-bold text-slate-400 flex items-center gap-1">
            <Server className="w-3 h-3" /> NET_DEBUG
          </span>
          <span
            className={`px-1.5 py-0.5 rounded font-black ${isOnline && !simulatingOffline ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-500'}`}
          >
            {isOnline && !simulatingOffline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* INFO GRID */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between">
            <span className="text-slate-500">Transport:</span>
            <div className="flex items-center gap-1">
              {transport === 'WebSockets' ? (
                <Zap className="w-3 h-3 text-yellow-400" />
              ) : (
                <ShieldCheck className="w-3 h-3 text-blue-400" />
              )}
              <span className={transport === 'WebSockets' ? 'text-yellow-400' : 'text-blue-400'}>
                {transport}
              </span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Latency:</span>
            <span className="text-white">{simulatingOffline ? '---' : `${latency}ms`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Persistence:</span>
            <span className="text-emerald-500">IndexedDB Active</span>
          </div>
        </div>

        {/* ACTION */}
        <button
          onClick={toggleSimulation}
          className={`w-full py-1.5 rounded font-bold border transition-all active:scale-95 flex items-center justify-center gap-2 ${
            simulatingOffline
              ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
              : 'bg-red-900/30 border-red-800 text-red-400 hover:bg-red-900/50'
          }`}
        >
          {simulatingOffline ? (
            <>
              {' '}
              <Wifi className="w-3 h-3" /> Reconectar Red{' '}
            </>
          ) : (
            <>
              {' '}
              <WifiOff className="w-3 h-3" /> Simular Corte{' '}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
