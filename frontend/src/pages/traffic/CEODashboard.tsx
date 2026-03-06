/**
 * Dashboard de Mando CEO: KPIs en tiempo real, alertas críticas e historial de rotación.
 * Tríada Coche-Servicio-Chofer como fuente de verdad.
 */
import { useState, useEffect } from 'react';
import {
  FleetService,
  ServicioEstadoService,
  ActiveAssignmentsService,
} from '../../services/firestore';
import { BarChart3, AlertTriangle, Users, RefreshCw, Loader2 } from 'lucide-react';

const todayStr = () => new Date().toISOString().split('T')[0];
const yearMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function parseHoraToMinutes(h: string): number {
  const [hh, mm] = h.trim().split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

export default function CEODashboard() {
  const [loading, setLoading] = useState(true);
  const [flotaActivaPct, setFlotaActivaPct] = useState<number | null>(null);
  const [puntualidadPct, setPuntualidadPct] = useState<number | null>(null);
  const [alertasCriticas, setAlertasCriticas] = useState<
    Array<{ servicioId: string; linea?: string; horaInicio?: string }>
  >([]);
  const [cocheRotacionId, setCocheRotacionId] = useState('115');
  const [rotacion, setRotacion] = useState<{
    cambios: number;
    detalle: Array<{ date: string; servicioId: string; cambios: number }>;
  } | null>(null);
  const [rotacionLoading, setRotacionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const today = todayStr();
    const nowMin = parseHoraToMinutes(
      `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    );
    const ventanaFin = nowMin + 30;

    Promise.all([FleetService.getVehicles(), ServicioEstadoService.getByDate(today)])
      .then(([vehicles, estados]) => {
        if (cancelled) return;
        const total = vehicles.length;
        const activos = vehicles.filter(
          (v) => !/mantenimiento|taller|paralizado|baja/i.test(String(v.status ?? '')),
        ).length;
        setFlotaActivaPct(total > 0 ? Math.round((activos / total) * 1000) / 10 : null);

        const conAtraso = estados.filter((e) => e.atrasoMinutos != null);
        const puntuales = conAtraso.filter((e) => (e.atrasoMinutos ?? 0) <= 3).length;
        setPuntualidadPct(
          conAtraso.length > 0 ? Math.round((puntuales / conAtraso.length) * 1000) / 10 : null,
        );

        const sinChoferProximos = estados.filter((e) => {
          const h = e.horaInicio;
          if (!h) return false;
          const min = parseHoraToMinutes(h);
          if (min < nowMin || min > ventanaFin) return false;
          return !e.choferActual || e.choferActual.trim() === '';
        });
        setAlertasCriticas(
          sinChoferProximos.map((e) => ({
            servicioId: e.servicioId,
            linea: e.linea,
            horaInicio: e.horaInicio,
          })),
        );
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cocheRotacionId.trim()) return;
    setRotacionLoading(true);
    ActiveAssignmentsService.getRotacionByCocheMonth(cocheRotacionId.trim(), yearMonth())
      .then(setRotacion)
      .catch(() => setRotacion(null))
      .finally(() => setRotacionLoading(false));
  }, [cocheRotacionId]);

  return (
    <div className="animate-fade-in space-y-6 p-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-primary-400" />
          Dashboard de Mando CEO
        </h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-10 h-10 text-primary-400 animate-spin" aria-hidden />
        </div>
      ) : (
        <>
          {/* Panel de Eficiencia - KPIs (pintados y legibles) */}
          <section
            className="grid grid-cols-1 md:grid-cols-3 gap-5"
            aria-label="KPIs de eficiencia"
          >
            <div className="glass-panel p-6 rounded-2xl border-2 border-slate-600 bg-slate-800/50 shadow-xl">
              <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2 text-base">
                <RefreshCw className="w-5 h-5 text-emerald-400" aria-hidden /> Flota Activa
              </h3>
              <div
                className="text-4xl font-black text-emerald-400 tabular-nums"
                data-testid="kpi-flota-activa"
              >
                {flotaActivaPct != null ? `${flotaActivaPct}%` : '—'}
              </div>
              <p className="text-sm text-slate-400 mt-2">Coches en calle vs total</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-2 border-slate-600 bg-slate-800/50 shadow-xl">
              <h3 className="font-bold text-slate-200 mb-2 text-base">Puntualidad</h3>
              <div
                className="text-4xl font-black text-blue-400 tabular-nums"
                data-testid="kpi-puntualidad"
              >
                {puntualidadPct != null ? `${puntualidadPct}%` : '—'}
              </div>
              <p className="text-sm text-slate-400 mt-2">Desvío ≤3 min (DriverTimeline)</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-2 border-slate-600 bg-slate-800/50 shadow-xl">
              <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden /> Alertas Críticas
              </h3>
              <div
                className="text-4xl font-black text-amber-400 tabular-nums"
                data-testid="kpi-alertas"
              >
                {alertasCriticas.length}
              </div>
              <p className="text-sm text-slate-400 mt-2">Servicios sin chofer en próximos 30 min</p>
            </div>
          </section>

          {alertasCriticas.length > 0 && (
            <section className="glass-panel p-4 rounded-2xl border border-amber-500/30">
              <h3 className="font-bold text-amber-400 mb-2">
                Servicios sin chofer (próximos 30 min)
              </h3>
              <ul className="space-y-1 text-sm text-slate-300">
                {alertasCriticas.map((a, i) => (
                  <li key={i}>
                    {a.linea ?? '—'} Servicio {a.servicioId} · {a.horaInicio ?? '—'}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Historial de Rotación */}
          <section className="glass-panel p-6 rounded-2xl border border-slate-700">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" /> Historial de Rotación (mes actual)
            </h3>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-slate-400 text-sm">Coche</label>
              <input
                type="text"
                value={cocheRotacionId}
                onChange={(e) => setCocheRotacionId(e.target.value)}
                placeholder="Ej: 115"
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white w-24"
              />
            </div>
            {rotacionLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            ) : rotacion ? (
              <>
                <div className="text-2xl font-bold text-primary-400 mb-2">
                  {rotacion.cambios} cambio(s) de manos
                </div>
                {rotacion.detalle.length > 0 && (
                  <ul className="text-sm text-slate-400 space-y-1">
                    {rotacion.detalle.slice(0, 10).map((d, i) => (
                      <li key={i}>
                        {d.date} · {d.servicioId} · {d.cambios} cambio(s)
                      </li>
                    ))}
                    {rotacion.detalle.length > 10 && (
                      <li className="text-slate-500">… y {rotacion.detalle.length - 10} más</li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-slate-500">Sin datos para este coche en el mes.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
