import { useState, useEffect, useMemo } from 'react';
import { useLiveData } from '../../context/LiveDataContext';
import { apiClient } from '../../clients/apiClient';
import {
  Activity, AlertTriangle, Bus, Users, ShieldAlert,
  TrendingDown, Radio, ArrowRight, RefreshCw, Bell,
} from 'lucide-react';
import { formatTime } from '../../utils/dateFormatter';
import { useLiveOperations } from '../../hooks/useLiveOperations';
interface ResumenDiario {
  turnosTotal: number;
  turnosCubiertos: number;
  turnosSinConductor: number;
  conductoresAusentes: number;
  conductoresReservaLibres: number;
  vehiculosEnTaller: number;
  coberturaFlota: number;
  alertasActivas: number;
  impactoIngresosRiesgoUSD: number;
  lineasEnRiesgoIMM: string[];
}

const EMPRESAS_RED = [
  { id: 70, label: 'UCOT',   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  { id: 50, label: 'CUTCSA', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { id: 20, label: 'COME',   color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20'},
  { id: 10, label: 'COETC',  color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
] as const;

export default function DashboardOperacional() {
  const { fleetKPIs: rawFleetKPIs, busesLoading: fleetLoading, alertas: alertasVivas } = useLiveData();
  const { serviciosPropios, serviciosRivales } = useLiveOperations();

  const fleetKPIs = useMemo(() => {
    if (rawFleetKPIs.totalRed > 0) return rawFleetKPIs;
    
    const allBuses = [...(serviciosPropios || []), ...(serviciosRivales || [])];

    // Fallback: calcular KPIs localmente para este módulo (hace bypass a la BD local, viendo IMM)
    const perEmpresa: Record<number, number> = {};
    for (const b of allBuses) {
      perEmpresa[b.empresaId] = (perEmpresa[b.empresaId] ?? 0) + 1;
    }
    const lineasActivas = new Set(allBuses.map(b => b.linea).filter(Boolean)).size;
    
    return {
      ...rawFleetKPIs,
      totalRed: allBuses.length,
      perEmpresa,
      lineasActivas,
      totalRivales: allBuses.length - (perEmpresa[70] ?? 0),
      totalPropios: perEmpresa[70] ?? 0
    };
  }, [rawFleetKPIs, serviciosPropios, serviciosRivales]);

  const [resumen, setResumen] = useState<ResumenDiario | null>(null);
  const [alertas, setAlertas] = useState<Array<{ id: string; urgencia: string; titulo: string; mensaje: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  const TIPO_LABEL: Record<string, string> = {
    RIVAL_PISANDO_TURNO: '⚠️ Rival pisando turno',
    PELIGRO_BUNCHING: '👁 Riesgo de bunching',
  };

  useEffect(() => {
    if (alertasVivas.length > 0) {
      setAlertas(
        alertasVivas.slice(0, 5).map((a) => {
          const raw = a as Record<string, any>;
          const base = TIPO_LABEL[a.tipo] ?? a.tipo;
          const linea = raw.linea_id ? ` — Línea ${raw.linea_id}` : '';
          const titulo = a.titulo ?? `${base}${linea}`;
          const horaStr = raw.timestamp?.toDate
            ? ` · ${formatTime(raw.timestamp.toDate())}`
            : '';
          const mensaje = a.mensaje ?? (raw.mensaje_chofer ? `${raw.mensaje_chofer}${horaStr}` : '');
          return { id: a.id, urgencia: a.urgencia ?? 'media', titulo, mensaje };
        }),
      );
    }
  }, [alertasVivas]);

  useEffect(() => {
    if (!loading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const fecha = new Date().toISOString().split('T')[0];

    apiClient
      .get<{ resumen: ResumenDiario }>(`/api/listero/resumen`, { query: { fecha } })
      .then((res) => {
        const r = (res as unknown as { resumen?: ResumenDiario })?.resumen ?? res.data?.resumen;
        if (r) setResumen(r);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => setLoading(false));

    type _Alerta = { id: string; urgencia: string; titulo: string; mensaje: string };
    apiClient
      .get<{ alertas: _Alerta[] }>(`/api/listero/alertas`, { query: { fecha } })
      .then((res) => {
        const a = (res as unknown as { alertas?: _Alerta[] })?.alertas ?? res.data?.alertas;
        if (a && alertasVivas.length === 0) setAlertas(a.slice(0, 5));
      })
      .catch(() => { /* silencioso */ });
  }, []);

  const URGENCIA_COLOR: Record<string, string> = {
    critica: 'border-red-500/50 bg-red-900/20 text-red-300',
    alta:    'border-orange-500/50 bg-orange-900/20 text-orange-300',
    media:   'border-amber-500/40 bg-amber-900/10 text-amber-300',
    baja:    'border-slate-600 bg-slate-800/40 text-slate-300',
  };

  return (
    <div className="space-y-5">
      {/* KPIs Operacionales */}
      <div>
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Situación del día</h2>
        {loading && !timedOut ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Cargando estado operacional…
          </div>
        ) : timedOut ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-none" />
            Resumen operativo no disponible ·{' '}
            <button className="text-indigo-400 underline" onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        ) : resumen ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Cobertura flota', value: resumen.turnosTotal > 0 ? `${resumen.coberturaFlota}%` : '—', icon: Activity, color: resumen.turnosTotal === 0 ? 'text-slate-500' : resumen.coberturaFlota >= 90 ? 'text-emerald-400' : resumen.coberturaFlota >= 75 ? 'text-amber-400' : 'text-red-400', sub: resumen.turnosTotal > 0 ? `${resumen.turnosCubiertos}/${resumen.turnosTotal} turnos` : 'Sin turnos programados' },
              { label: 'Sin conductor', value: resumen.turnosSinConductor, icon: Users, color: resumen.turnosSinConductor > 0 ? 'text-amber-400' : 'text-slate-500', sub: `${resumen.conductoresReservaLibres} reservas libres` },
              { label: 'Vehículos en taller', value: resumen.vehiculosEnTaller, icon: Bus, color: resumen.vehiculosEnTaller > 0 ? 'text-orange-400' : 'text-slate-500', sub: `${resumen.conductoresAusentes} ausentes hoy` },
              { label: 'Riesgo ingresos', value: resumen.impactoIngresosRiesgoUSD > 0 ? `USD ${resumen.impactoIngresosRiesgoUSD}` : 'Sin alertas hoy', icon: TrendingDown, color: resumen.impactoIngresosRiesgoUSD > 0 ? 'text-red-400' : 'text-emerald-400', sub: resumen.lineasEnRiesgoIMM.length > 0 ? `L${resumen.lineasEnRiesgoIMM.join(', ')} en riesgo IMM` : 'Sin alertas de riesgo de ingresos' },
            ].map(({ label, value, icon: Icon, color, sub }) => {
              const sinDatos = value === 0 || value === '—';
              return (
                <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 flex-none ${color}`} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <p className={`text-2xl font-black ${color}`}>{value}</p>
                    {sinDatos && (
                      <span className="mb-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-700/60 text-slate-500 leading-none" title="Aún no se generó el resumen operativo del día">
                        Sin datos hoy
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500">
            Sin turnos programados hoy. <a href="/dashboard/traffic/listero" className="text-indigo-400 underline">Abrir Listero</a> para generar la programación.
          </div>
        )}
      </div>

      {/* GPS Fleet — vista de red metropolitana (4 operadores) */}
      {!fleetLoading && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Red metropolitana GPS — tiempo real
            </h2>
            <span className="text-[10px] text-slate-600 font-mono">
              {fleetKPIs.totalRed} buses en vía
            </span>
          </div>
          {/* Una card por operador */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {EMPRESAS_RED.map(({ id, label, color, bg, border }) => (
              <div key={id} className={`rounded-xl border p-3 flex items-center gap-3 ${bg} ${border}`}>
                <Radio className={`w-4 h-4 flex-none ${color}`} />
                <div>
                  <p className={`text-xl font-black ${color}`}>
                    {fleetKPIs.perEmpresa[id] ?? 0}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold">{label}</p>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wide">buses en vía</p>
                </div>
              </div>
            ))}
          </div>
          {/* Métricas de red */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
              <Activity className="w-4 h-4 flex-none text-emerald-400" />
              <div>
                <p className="text-xl font-black text-emerald-400">{fleetKPIs.lineasActivas}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Líneas operando</p>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle className={`w-4 h-4 flex-none ${fleetKPIs.bunchingPares > 0 ? 'text-red-400' : 'text-slate-600'}`} />
              <div>
                <p className={`text-xl font-black ${fleetKPIs.bunchingPares > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {fleetKPIs.bunchingPares}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Alertas bunching</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alertas activas */}
      {alertas.length > 0 && (
        <div>
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Bell className="w-3 h-3 text-amber-400" />
            Alertas operativas activas
          </h2>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 ${URGENCIA_COLOR[a.urgencia] ?? URGENCIA_COLOR.baja}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{a.titulo}</p>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${URGENCIA_COLOR[a.urgencia]}`}>
                    {a.urgencia}
                  </span>
                </div>
                <p className="text-[11px] opacity-80 mt-1">{a.mensaje}</p>
              </div>
            ))}
          </div>
          {resumen && resumen.alertasActivas > 5 && (
            <a href="/dashboard/traffic/listero" className="block mt-2 text-xs text-indigo-400 hover:text-indigo-300">
              Ver todas las alertas en el Listero →
            </a>
          )}
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Accesos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Inteligencia Cross-Operador', href: '/dashboard/traffic/corridor-intelligence', color: 'bg-orange-600/20 border-orange-500/40 text-orange-300', desc: 'DRO, HRR y posición de mercado' },
            { label: 'Cumplimiento de Servicio', href: '/dashboard/traffic/diagnostico-cumplimiento', color: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300', desc: 'OTP, tendencia y diagnóstico' },
            { label: 'Gestión de Incidencias', href: '/dashboard/traffic/incidents', color: 'bg-red-600/20 border-red-500/40 text-red-300', desc: 'Alertas y resolución en tiempo real' },
            { label: 'Terminal del Listero', href: '/dashboard/traffic/listero', color: 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300', desc: 'Programación y asignaciones' },
          ].map(({ label, href, color, desc }) => (
            <a
              key={label}
              href={href}
              className={`rounded-xl border p-4 transition-all hover:scale-[1.02] flex flex-col gap-1.5 ${color}`}
            >
              <p className="text-sm font-bold">{label}</p>
              <p className="text-[10px] opacity-70">{desc}</p>
              <ArrowRight className="w-3.5 h-3.5 mt-auto self-end opacity-60" />
            </a>
          ))}
        </div>
      </div>

      {resumen?.lineasEnRiesgoIMM && resumen.lineasEnRiesgoIMM.length > 0 && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          <ShieldAlert className="w-4 h-4 flex-none text-red-400" />
          <span>Líneas en riesgo de infracción IMM: <strong>{resumen.lineasEnRiesgoIMM.join(', ')}</strong> — Activar protocolo de emergencia.</span>
        </div>
      )}
    </div>
  );
}
