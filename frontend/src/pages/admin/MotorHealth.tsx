/**
 * MotorHealth — Telemetría del motor de consecuencias (FASE 5.37, 2026-05-22).
 *
 * Muestra:
 *   - Eventos por hora (gráfico de barras, últimas 24h)
 *   - Distribución por tipo y por fuente
 *   - Cooldowns activos (desglose por tipo)
 *   - Atención: cuántos eventos críticos siguen sin atender
 *
 * Pensada para SuperAdmin / monitoreo de la propia infra del motor.
 */

import { useEffect, useState } from 'react';
import { Activity, RefreshCw, Network, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';

interface MotorHealthData {
  scheduler: { tickIntervalSec: number; activo: boolean; detectores: string[] };
  actividad24h: {
    totalEventos: number;
    criticos: number;
    promedioHora: number;
    porHora: Array<{ hora: string; total: number; criticos: number }>;
    porTipo: Record<string, number>;
    porFuente: Record<string, number>;
  };
  atencion: { atendidos: number; noAtendidosCriticos: number };
  cooldowns: {
    total: number;
    desglose: Array<{ entity_type: string; evento_tipo: string; total: number; oldest: string }>;
  };
}

const TIPO_LABEL: Record<string, string> = {
  CONDUCTOR_AUSENTE: 'Conductor ausente',
  VEHICULO_FUERA_DE_SERVICIO: 'Vehículo fuera serv.',
  RETRASO_OPERATIVO: 'Retraso operativo',
  VIAJE_CANCELADO: 'Viaje cancelado',
};

export default function MotorHealth() {
  const [data, setData] = useState<MotorHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<MotorHealthData>('/api/motor/health');
      const d = (res as unknown as { data?: MotorHealthData }).data ?? null;
      setData(d);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('[MotorHealth]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
    const id = setInterval(() => { void cargar(); }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <div className="text-center py-16 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
        Cargando salud del motor…
      </div>
    );
  }

  const maxHora = Math.max(...data.actividad24h.porHora.map((h) => h.total), 1);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Zap className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Salud del Motor de Consecuencias</h1>
            <p className="text-sm text-slate-400">
              Telemetría propia: actividad de los detectores, cooldowns activos, atención.
            </p>
          </div>
        </div>
        <button
          onClick={() => void cargar()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {/* Header del scheduler */}
      <div className="bg-gradient-to-br from-purple-900/20 to-slate-900 border border-purple-500/30 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${data.scheduler.activo ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-sm font-bold text-white">
            Scheduler {data.scheduler.activo ? 'ACTIVO' : 'DETENIDO'}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          Tick cada <span className="font-mono text-purple-300">{data.scheduler.tickIntervalSec}s</span>
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {data.scheduler.detectores.map((d) => (
            <span key={d} className="px-2 py-0.5 text-[10px] bg-purple-500/15 text-purple-300 rounded border border-purple-500/30 font-mono">
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Eventos 24h" valor={data.actividad24h.totalEventos} color="text-purple-300" icon={Network} />
        <Kpi label="Críticos" valor={data.actividad24h.criticos} color="text-red-300" icon={AlertTriangle} />
        <Kpi label="Promedio/hora" valor={data.actividad24h.promedioHora} color="text-blue-300" icon={Activity} />
        <Kpi label="Cooldowns activos" valor={data.cooldowns.total} color="text-amber-300" icon={Network} />
        <Kpi label="Atendidos" valor={data.atencion.atendidos} color="text-emerald-300" icon={CheckCircle} extra={`${data.atencion.noAtendidosCriticos} crít. sin atender`} />
      </div>

      {/* Eventos por hora (chart de barras) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-xs uppercase text-slate-500 font-bold mb-3 flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Eventos por hora · últimas 24h
        </h2>
        {data.actividad24h.porHora.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">Sin eventos en las últimas 24h.</div>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {data.actividad24h.porHora.map((h) => {
              const pct = (h.total / maxHora) * 100;
              const critPct = (h.criticos / maxHora) * 100;
              const hora = new Date(h.hora).getHours().toString().padStart(2, '0');
              return (
                <div key={h.hora} className="flex-1 flex flex-col items-center gap-1" title={`${hora}:00 · ${h.total} eventos · ${h.criticos} críticos`}>
                  <div className="flex-1 w-full flex flex-col-reverse relative">
                    <div className="w-full bg-purple-500/60 rounded-sm" style={{ height: `${pct}%` }} />
                    <div className="w-full bg-red-500/80 absolute bottom-0 rounded-sm" style={{ height: `${critPct}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono">{hora}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-purple-300"><span className="w-2 h-2 bg-purple-500/60 rounded" /> Total</span>
          <span className="flex items-center gap-1 text-red-300"><span className="w-2 h-2 bg-red-500/80 rounded" /> Críticos</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Distribución por tipo */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs uppercase text-slate-500 font-bold mb-3">Distribución por tipo (24h)</h2>
          {Object.keys(data.actividad24h.porTipo).length === 0 ? (
            <div className="text-sm text-slate-500">Sin datos.</div>
          ) : (
            <ul className="space-y-1.5">
              {Object.entries(data.actividad24h.porTipo).map(([t, c]) => {
                const max = Math.max(...Object.values(data.actividad24h.porTipo));
                const pct = (c / max) * 100;
                return (
                  <li key={t} className="flex items-center gap-2 text-xs">
                    <div className="w-32 text-slate-300 truncate">{TIPO_LABEL[t] ?? t}</div>
                    <div className="flex-1 bg-slate-800/60 rounded h-5 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-purple-500/60 rounded" style={{ width: `${Math.max(pct, 2)}%` }} />
                      <div className="absolute inset-0 px-2 flex items-center text-[10px] font-mono text-white">{c}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Distribución por fuente */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs uppercase text-slate-500 font-bold mb-3">Distribución por fuente (24h)</h2>
          {Object.keys(data.actividad24h.porFuente).length === 0 ? (
            <div className="text-sm text-slate-500">Sin datos.</div>
          ) : (
            <ul className="space-y-1.5">
              {Object.entries(data.actividad24h.porFuente).map(([f, c]) => {
                const max = Math.max(...Object.values(data.actividad24h.porFuente));
                const pct = (c / max) * 100;
                const labelFuente = f.replace('cascadeAutoTriggerScheduler:', 'auto:').replace('cascadeAutoTriggerScheduler', 'auto');
                return (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <div className="w-32 text-slate-300 truncate font-mono text-[10px]">{labelFuente}</div>
                    <div className="flex-1 bg-slate-800/60 rounded h-5 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-emerald-500/60 rounded" style={{ width: `${Math.max(pct, 2)}%` }} />
                      <div className="absolute inset-0 px-2 flex items-center text-[10px] font-mono text-white">{c}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Cooldowns activos */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-xs uppercase text-slate-500 font-bold mb-3">Cooldowns activos · {data.cooldowns.total}</h2>
        {data.cooldowns.desglose.length === 0 ? (
          <div className="text-sm text-slate-500">Sin cooldowns activos.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-2 py-1 text-left">Entity Type</th>
                <th className="px-2 py-1 text-left">Evento Tipo</th>
                <th className="px-2 py-1 text-right">Total</th>
                <th className="px-2 py-1 text-right">Más antiguo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.cooldowns.desglose.map((c) => (
                <tr key={c.entity_type + c.evento_tipo}>
                  <td className="px-2 py-1.5 text-slate-300 font-mono">{c.entity_type}</td>
                  <td className="px-2 py-1.5 text-purple-300">{c.evento_tipo}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-white">{c.total}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] text-slate-500 font-mono">
                    {new Date(c.oldest).toLocaleString('es-UY', { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-[10px] text-slate-500 text-right">
        Refresh cada 60s · última actualización: {lastUpdate.toLocaleTimeString('es-UY')}
      </div>
    </div>
  );
}

function Kpi({ label, valor, color, icon: Icon, extra }: { label: string; valor: number; color: string; icon: React.ElementType; extra?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
      <div className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{valor.toLocaleString('es-UY')}</div>
      {extra && <div className="text-[9px] text-slate-500 mt-0.5">{extra}</div>}
    </div>
  );
}
