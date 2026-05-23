/**
 * DriverLineaAlertToast — Toast persistente que avisa al conductor cuando
 * el motor de consecuencias dispara un evento crítico en una línea
 * (FASE 5.35, 2026-05-22).
 *
 * Visible sólo si el usuario logueado tiene rol de conductor. Toast no
 * intrusivo (esquina inferior izquierda), descartable, máx 3 visibles.
 */

import { useEffect, useState } from 'react';
import { Bus, X, AlertOctagon } from 'lucide-react';
import { on as socketOn } from '../clients/socketClient';
import { useAuth } from '../context/AuthContext';

interface AlertaLinea {
  ts: number;
  lineaId: string;
  agencyId?: string;
  tipo: string;
  causa: string;
  feedId?: number | null;
}

function isConductor(role?: string): boolean {
  const r = String(role ?? '').toLowerCase();
  return r === 'driver' || r === 'chofer' || r === 'user' || r === 'conductor';
}

export default function DriverLineaAlertToast() {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState<AlertaLinea[]>([]);

  useEffect(() => {
    if (!isConductor(user?.role)) return;
    const off = socketOn<{ lineaId: string; agencyId?: string; tipo: string; causa: string; feedId?: number | null }>(
      'bus:driver:linea-critica',
      (data) => {
        setAlertas((prev) => {
          const nuevo: AlertaLinea = {
            ts: Date.now(),
            lineaId: data.lineaId,
            agencyId: data.agencyId,
            tipo: data.tipo,
            causa: data.causa ?? data.tipo,
            feedId: data.feedId,
          };
          // Dedup por lineaId+tipo dentro de 60s
          if (prev.some((a) => a.lineaId === nuevo.lineaId && a.tipo === nuevo.tipo && Date.now() - a.ts < 60_000)) {
            return prev;
          }
          return [nuevo, ...prev].slice(0, 3);
        });
        // Auto-dismiss tras 30s
        setTimeout(() => {
          setAlertas((prev) => prev.filter((a) => Date.now() - a.ts < 30_000));
        }, 30_500);
      },
    );
    return () => off();
  }, [user?.role]);

  if (!isConductor(user?.role) || alertas.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[1900] flex flex-col gap-2 pointer-events-none max-w-sm">
      {alertas.map((a) => (
        <div
          key={a.ts}
          className="bg-red-950/95 border border-red-500/50 backdrop-blur rounded-xl shadow-2xl shadow-red-900/40 p-3 flex items-start gap-3 animate-fade-in-up pointer-events-auto"
        >
          <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
            <AlertOctagon className="w-5 h-5 text-red-300 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-red-200 font-bold text-xs">
              <Bus className="w-3 h-3" />
              <span>LÍNEA L{a.lineaId} — ALERTA CRÍTICA</span>
            </div>
            <div className="text-[11px] text-red-100/80 mt-1">{a.tipo.replace(/_/g, ' ')}</div>
            <div className="text-[10px] text-red-200/60 mt-1 italic">{a.causa.slice(0, 140)}</div>
          </div>
          <button
            onClick={() => setAlertas((prev) => prev.filter((x) => x.ts !== a.ts))}
            className="text-red-300/60 hover:text-white p-1 rounded shrink-0"
            title="Descartar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
