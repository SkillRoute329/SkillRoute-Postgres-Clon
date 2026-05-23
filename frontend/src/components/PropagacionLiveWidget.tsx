/**
 * PropagacionLiveWidget — Feed en vivo del bus de eventos (FASE 5.30, 2026-05-21)
 *
 * Materializa el "TODO interconectado" en la UI: muestra los últimos
 * eventos de propagación que dispara el backend (motor de consecuencias,
 * operaciones críticas, cambios de DB) en una píldora flotante
 * colapsable arriba a la derecha.
 *
 * No interfiere con ninguna pantalla — es overlay puro. Cuando el bus
 * emite, el widget pulsa para que el usuario sepa que algo se propagó.
 */

import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Network, X } from 'lucide-react';
import { on as socketOn } from '../clients/socketClient';
import { apiClient } from '../clients/apiClient';
import CascadaDetalleModal from './CascadaDetalleModal';

type Severidad = 'info' | 'advertencia' | 'critico';

interface CascadeEvent {
  ts: number;
  kind: 'cascade' | 'operation' | 'db';
  titulo: string;
  detalle: string;
  severidad: Severidad;
  efectos?: number;
  // FASE 5.33 (2026-05-22): id del registro en logs_auditoria para abrir
  // el modal de detalle. Solo presente en eventos de tipo 'cascade'.
  feedId?: number;
}

const SEVERIDAD_COLOR: Record<Severidad, string> = {
  info: 'text-slate-300 border-slate-700',
  advertencia: 'text-amber-300 border-amber-500/40',
  critico: 'text-red-300 border-red-500/50 animate-pulse',
};

const OP_LABELS: Record<string, string> = {
  ausencia: 'Conductor ausente',
  'vehiculo-taller': 'Vehículo en taller',
  'reserva-asignada': 'Reserva asignada',
  'turno-firmado': 'Cartón firmado',
};

const COLLECTION_LABELS: Record<string, string> = {
  shifts: 'Turnos',
  turnos_dia: 'Turnos día',
  penalties: 'Sanciones',
  abl_red_numbers: 'Números rojos',
  inspecciones: 'Inspecciones',
  cartones_completados: 'Cartones',
  alertas_operativas: 'Alertas',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function PropagacionLiveWidget() {
  const [eventos, setEventos] = useState<CascadeEvent[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const push = (ev: CascadeEvent) => {
      setEventos((prev) => {
        // Dedup por ts+titulo (evita doble-render cuando el bus y el feed
        // se solapan al recargar).
        const key = ev.ts + '|' + ev.titulo;
        if (prev.some((x) => x.ts + '|' + x.titulo === key)) return prev;
        return [ev, ...prev].slice(0, 25);
      });
      setPulse(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulse(false), 1500);
    };

    // FASE 5.31 (2026-05-21) — Hidratación inicial desde el endpoint
    // /api/cascade/feed para que al recargar la pantalla el widget arranque
    // con los últimos eventos del motor, no vacío.
    (async () => {
      try {
        const res = await apiClient.get<{ events: Array<{ ts: string; titulo: string; tipo?: string; totalEfectos?: number; severidad?: Severidad; resumen?: { impactoNomina?: number; impactoSubsidio?: number } }> }>(
          '/api/cascade/feed',
          { query: { limit: 15 } },
        );
        const events = (res as unknown as { events?: typeof res.data extends { events: infer V } ? V : never })?.events
          ?? res.data?.events ?? [];
        if (events.length > 0) {
          const inicial: CascadeEvent[] = events.map((e: { id?: number; ts: string; titulo?: string; tipo?: string; totalEfectos?: number; severidad?: string; resumen?: { impactoNomina?: number; impactoSubsidio?: number } }) => {
            const det: string[] = [];
            if (e.resumen?.impactoNomina) det.push(`Nómina $${e.resumen.impactoNomina}`);
            if (e.resumen?.impactoSubsidio) det.push(`Subsidio $${e.resumen.impactoSubsidio}`);
            return {
              ts: new Date(e.ts).getTime(),
              kind: 'cascade' as const,
              titulo: e.titulo ?? `Cascada: ${(e.tipo ?? '?').toLowerCase()}`,
              detalle: det.join(' · '),
              severidad: (e.severidad as Severidad) ?? 'info',
              efectos: e.totalEfectos,
              feedId: e.id,
            };
          });
          setEventos(inicial);
        }
      } catch {
        /* arranque vacío si falla */
      }
    })();

    const offCascade = socketOn<{ evento: Record<string, unknown>; efectos: Array<{ titulo: string; severidad: Severidad }>; resumen: { severidadGlobal?: Severidad; impactoNomina?: number; impactoSubsidio?: number }; feedId?: number | null }>(
      'bus:cascade:summary',
      (data) => {
        const tipo = String(data.evento?.tipo ?? '?');
        const sev = (data.resumen?.severidadGlobal ?? 'info') as Severidad;
        const efectos = data.efectos?.length ?? 0;
        const det: string[] = [];
        if (data.resumen?.impactoNomina) det.push(`Nómina $${data.resumen.impactoNomina}`);
        if (data.resumen?.impactoSubsidio) det.push(`Subsidio $${data.resumen.impactoSubsidio}`);
        push({
          ts: Date.now(),
          kind: 'cascade',
          titulo: `Cascada: ${tipo.replace(/_/g, ' ').toLowerCase()}`,
          detalle: det.join(' · '),
          severidad: sev,
          efectos,
          feedId: data.feedId ?? undefined,
        });
      },
    );

    const offOperation = socketOn<{ tipo: string; conductorNombre?: string; vehiculoInterno?: string; fecha?: string; motivo?: string }>(
      'bus:operation:any',
      (data) => {
        const label = OP_LABELS[data.tipo] ?? data.tipo;
        const detalle = data.conductorNombre
          ? `${data.conductorNombre}${data.motivo ? ' · ' + data.motivo : ''}`
          : data.vehiculoInterno
          ? `Coche ${data.vehiculoInterno}${data.motivo ? ' · ' + data.motivo : ''}`
          : '';
        push({ ts: Date.now(), kind: 'operation', titulo: label, detalle, severidad: 'advertencia' });
      },
    );

    const offDb = socketOn<{ collection: string; op: string; id?: string }>(
      'bus:db:any',
      (data) => {
        // Solo mostrar colecciones operativamente relevantes para no saturar.
        const label = COLLECTION_LABELS[data.collection];
        if (!label) return;
        push({
          ts: Date.now(),
          kind: 'db',
          titulo: `${label} · ${data.op}`,
          detalle: data.id ? `#${String(data.id).slice(0, 16)}` : '',
          severidad: 'info',
        });
      },
    );

    return () => {
      offCascade();
      offOperation();
      offDb();
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  if (oculto) return null;

  return (
    <div className="fixed top-20 right-4 z-[1500] pointer-events-none select-none">
      <div className="pointer-events-auto">
        {/* Pill colapsada */}
        {!abierto && (
          <button
            onClick={() => setAbierto(true)}
            className={`flex items-center gap-2 bg-slate-900/95 backdrop-blur border ${pulse ? 'border-purple-400/80 shadow-lg shadow-purple-900/40' : 'border-slate-700/60'} rounded-full px-3 py-1.5 text-[11px] font-bold text-purple-300 hover:bg-slate-800 transition-all`}
            title="Propagación en vivo · clic para ver detalle"
          >
            <Network className={`w-3.5 h-3.5 ${pulse ? 'text-purple-300 animate-spin' : 'text-purple-400'}`} />
            <span>Propagación</span>
            <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
              {eventos.length}
            </span>
          </button>
        )}

        {/* Panel expandido */}
        {abierto && (
          <div className="bg-slate-900/95 backdrop-blur border border-purple-500/30 rounded-xl shadow-2xl shadow-purple-900/30 w-[340px] max-h-[60vh] overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/50 to-slate-900">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                <Activity className="w-3.5 h-3.5" />
                Propagación del sistema
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setAbierto(false)}
                  className="text-slate-500 hover:text-white p-0.5 rounded"
                  title="Minimizar"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setOculto(true)}
                  className="text-slate-500 hover:text-white p-0.5 rounded"
                  title="Ocultar hasta el próximo recargo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1">
              {eventos.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-slate-500">
                  Esperando eventos del sistema...
                  <br />
                  <span className="text-[10px] text-slate-600">
                    Cualquier acción operativa aparece acá.
                  </span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {eventos.map((ev, i) => (
                    <li
                      key={ev.ts + '-' + i}
                      onClick={() => {
                        // FASE 5.33: solo eventos de cascade con feedId
                        // pueden abrir el modal de detalle.
                        if (ev.kind === 'cascade' && ev.feedId != null) {
                          setDetalleId(ev.feedId);
                        }
                      }}
                      className={`px-3 py-2 border-l-2 ${SEVERIDAD_COLOR[ev.severidad]} hover:bg-slate-800/30 transition-colors ${ev.kind === 'cascade' && ev.feedId != null ? 'cursor-pointer' : ''}`}
                      title={ev.kind === 'cascade' && ev.feedId != null ? 'Click para ver detalle cross-dominio' : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold truncate">
                            {ev.titulo}
                            {ev.efectos != null && ev.efectos > 0 && (
                              <span className="ml-1.5 text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded">
                                {ev.efectos} efectos
                              </span>
                            )}
                          </div>
                          {ev.detalle && (
                            <div className="text-[10px] text-slate-400 truncate">{ev.detalle}</div>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono whitespace-nowrap pt-0.5">
                          {formatTime(ev.ts)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-800 flex items-center justify-between text-[9px] text-slate-500 bg-slate-950/40">
              <span>Bus: socket.io · tiempo real</span>
              <button
                onClick={() => setEventos([])}
                className="hover:text-white"
                title="Limpiar feed"
              >
                Limpiar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FASE 5.33: modal de detalle del evento */}
      <CascadaDetalleModal eventoId={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}
