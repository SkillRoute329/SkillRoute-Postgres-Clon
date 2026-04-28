/**
 * TendenciaTab — Comparación semana actual vs semana anterior
 *
 * Usa fetchHistorySummary con days=7 (semana actual) y days=14 (2 semanas).
 * La semana anterior se aproxima calculando con días 8-14 del historial de 14 días:
 *   pctEnTiempo(anterior) = ponderado por totalEventos de cada LineSummary en el período extendido.
 *
 * Como el endpoint /autostats/history/:agencyId?days=N devuelve el acumulado del período,
 * se hace: semana_anterior ≈ ( valor_14d * total_14d - valor_7d * total_7d ) / total_8_14
 * Esto es una estimación de buena fe cuando el backend no expone períodos discretos.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import {
  fetchHistorySummary,
  fetchAgencies,
  type LineSummary,
  type AgencyInfo,
  AGENCY_LABELS,
} from '../../services/autoStatsService';

/* ─── Tipos internos ─────────────────────────────── */

interface LineaComparacion {
  linea: string;
  actualPct: number;
  anteriorPct: number;
  delta: number; // actual - anterior (positivo = mejora)
  actualEventos: number;
  anteriorEventos: number;
}

interface ResumenComparacion {
  otpActual: number;
  otpAnterior: number;
  deltaOtp: number;
  criticas7d: number;   // líneas con OTP < 70% esta semana
  criticas14d: number;  // líneas con OTP < 70% semana anterior
  lineas: LineaComparacion[];
}

/* ─── Helpers ─────────────────────────────────────── */

const UMBRAL_CRITICO = 70; // % — debajo de esto = línea crítica

function deltaColor(delta: number): string {
  if (delta > 1) return 'text-emerald-400';
  if (delta < -1) return 'text-red-400';
  return 'text-slate-400';
}

function DeltaBadge({ delta }: { delta: number }) {
  const abs = Math.abs(delta).toFixed(1);
  if (delta > 1)
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold text-xs">
        <TrendingUp className="w-3.5 h-3.5" />+{abs}%
      </span>
    );
  if (delta < -1)
    return (
      <span className="inline-flex items-center gap-0.5 text-red-400 font-semibold text-xs">
        <TrendingDown className="w-3.5 h-3.5" />-{abs}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-400 font-semibold text-xs">
      <Minus className="w-3.5 h-3.5" />{abs}%
    </span>
  );
}

function BarraComparacion({ pct, color }: { pct: number; color: 'blue' | 'slate' }) {
  const bg = color === 'blue' ? 'bg-blue-500' : 'bg-slate-600';
  return (
    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`${bg} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

/* ─── Lógica de comparación ─────────────────────── */

function construirComparacion(
  lines7: LineSummary[],
  lines14: LineSummary[],
): ResumenComparacion {
  // Mapear 14d por línea
  const map14 = new Map<string, LineSummary>(lines14.map((l) => [l.linea, l]));

  const lineas: LineaComparacion[] = [];
  let sumaOtpActual = 0;
  let sumaOtpAnterior = 0;
  let countActual = 0;
  let countAnterior = 0;

  for (const l7 of lines7) {
    const l14 = map14.get(l7.linea);
    if (!l14) {
      // Solo tenemos datos de la semana actual
      lineas.push({
        linea: l7.linea,
        actualPct: l7.pctEnTiempo,
        anteriorPct: 0,
        delta: 0,
        actualEventos: l7.totalEventos,
        anteriorEventos: 0,
      });
      sumaOtpActual += l7.pctEnTiempo;
      countActual++;
      continue;
    }

    // Estimar semana anterior: total14 * pct14 - total7 * pct7 / total_anterior
    const totalAnterior = Math.max(l14.totalEventos - l7.totalEventos, 0);
    let anteriorPct: number;
    if (totalAnterior <= 0) {
      // Sin datos de la semana anterior — usar misma base como fallback
      anteriorPct = l14.pctEnTiempo;
    } else {
      const enTiempo14 = (l14.pctEnTiempo / 100) * l14.totalEventos;
      const enTiempo7 = (l7.pctEnTiempo / 100) * l7.totalEventos;
      const enTiempoAnterior = enTiempo14 - enTiempo7;
      anteriorPct = Math.max(0, Math.min(100, (enTiempoAnterior / totalAnterior) * 100));
    }

    const delta = l7.pctEnTiempo - anteriorPct;
    lineas.push({
      linea: l7.linea,
      actualPct: l7.pctEnTiempo,
      anteriorPct,
      delta,
      actualEventos: l7.totalEventos,
      anteriorEventos: totalAnterior,
    });

    sumaOtpActual += l7.pctEnTiempo;
    sumaOtpAnterior += anteriorPct;
    countActual++;
    countAnterior++;
  }

  // Ordenar por delta más negativo primero (las peores arriba)
  lineas.sort((a, b) => a.delta - b.delta);

  const otpActual = countActual > 0 ? sumaOtpActual / countActual : 0;
  const otpAnterior = countAnterior > 0 ? sumaOtpAnterior / countAnterior : 0;

  return {
    otpActual,
    otpAnterior,
    deltaOtp: otpActual - otpAnterior,
    criticas7d: lines7.filter((l) => l.pctEnTiempo < UMBRAL_CRITICO).length,
    criticas14d: lineas.filter((l) => l.anteriorPct > 0 && l.anteriorPct < UMBRAL_CRITICO).length,
    lineas,
  };
}

/* ─── Componente principal ───────────────────────── */

export default function TendenciaTab() {
  const [agencies, setAgencies] = useState<AgencyInfo[]>([]);
  const [agencyId, setAgencyId] = useState<string>('70');
  const [comparacion, setComparacion] = useState<ResumenComparacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

  // Cargar agencias disponibles
  useEffect(() => {
    fetchAgencies()
      .then((list) => {
        setAgencies(list);
        if (list.length > 0 && !list.find((a) => a.id === agencyId)) {
          setAgencyId(list[0].id);
        }
      })
      .catch(() => {
        // Sin agencias del endpoint, usar lista fija
        setAgencies([
          { id: '70', name: 'UCOT', routes: [] },
          { id: '50', name: 'CUTCSA', routes: [] },
          { id: '20', name: 'COME', routes: [] },
          { id: '10', name: 'COETC', routes: [] },
        ]);
      });
  }, []);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [res7, res14] = await Promise.all([
        fetchHistorySummary(agencyId, 7),
        fetchHistorySummary(agencyId, 14),
      ]);
      if (!res7.ok || !res14.ok) {
        throw new Error('Respuesta inválida del servidor');
      }
      const comp = construirComparacion(res7.lines, res14.lines);
      setComparacion(comp);
      setUltimaActualizacion(new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError('No se pudieron cargar los datos históricos. Verificá que el servidor esté disponible.');
    } finally {
      setCargando(false);
    }
  }, [agencyId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const agencyLabel = AGENCY_LABELS[agencyId] ?? agencyId;

  /* ─── Render ─────────────────────────────────── */

  return (
    <div className="p-6 space-y-6">

      {/* Encabezado + controles */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-200">Tendencia de Cumplimiento</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Semana actual (últimos 7 días) vs semana anterior (días 8–14)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector de empresa */}
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            {agencies.length > 0
              ? agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {AGENCY_LABELS[a.id] ?? a.name}
                  </option>
                ))
              : Object.entries(AGENCY_LABELS).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
          </select>
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Estado de carga / error */}
      {cargando && !comparacion && (
        <div className="flex items-center justify-center py-24 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-slate-400 text-sm">Cargando datos históricos de {agencyLabel}…</span>
        </div>
      )}

      {error && !comparacion && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-400 font-semibold text-sm">Error al cargar datos</p>
            <p className="text-slate-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {comparacion && (
        <>
          {/* Timestamp */}
          {ultimaActualizacion && (
            <p className="text-xs text-slate-500 -mt-2">
              Última actualización: {ultimaActualizacion} · Empresa: {agencyLabel}
            </p>
          )}

          {/* Tarjetas resumen semana vs semana */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Esta semana */}
            <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">Esta semana</span>
                <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">Últimos 7 días</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-white">{comparacion.otpActual.toFixed(1)}%</span>
                  <DeltaBadge delta={comparacion.deltaOtp} />
                </div>
                <p className="text-slate-400 text-sm">Cumplimiento promedio (OTP)</p>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-2">
                    {comparacion.criticas7d > 0 ? (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className={`text-sm font-semibold ${comparacion.criticas7d > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {comparacion.criticas7d} {comparacion.criticas7d === 1 ? 'línea crítica' : 'líneas críticas'}
                    </span>
                    <span className="text-slate-500 text-xs">(OTP &lt; {UMBRAL_CRITICO}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Semana anterior */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">Semana anterior</span>
                <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full border border-slate-600/30 font-medium">Días 8–14</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-slate-300">{comparacion.otpAnterior.toFixed(1)}%</span>
                </div>
                <p className="text-slate-400 text-sm">Cumplimiento promedio (OTP)</p>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-2">
                    {comparacion.criticas14d > 0 ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className={`text-sm font-semibold ${comparacion.criticas14d > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {comparacion.criticas14d} {comparacion.criticas14d === 1 ? 'línea crítica' : 'líneas críticas'}
                    </span>
                    <span className="text-slate-500 text-xs">(OTP &lt; {UMBRAL_CRITICO}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interpretación del delta */}
          {Math.abs(comparacion.deltaOtp) > 0.5 && (
            <div className={`rounded-xl p-4 border flex items-start gap-3 ${
              comparacion.deltaOtp > 0
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
            }`}>
              {comparacion.deltaOtp > 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              )}
              <p className={`text-sm font-medium ${comparacion.deltaOtp > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {comparacion.deltaOtp > 0
                  ? `El cumplimiento mejoró ${comparacion.deltaOtp.toFixed(1)} puntos porcentuales respecto a la semana anterior.`
                  : `El cumplimiento bajó ${Math.abs(comparacion.deltaOtp).toFixed(1)} puntos porcentuales respecto a la semana anterior.`}
              </p>
            </div>
          )}

          {/* Tabla por línea */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Comparación por línea</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ordenadas por peor variación primero — {comparacion.lineas.length} líneas</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Esta semana</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />Semana anterior</span>
              </div>
            </div>

            {comparacion.lineas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Clock className="w-10 h-10 text-slate-600" />
                <p className="text-slate-500 text-sm">Sin datos de líneas para el período seleccionado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-6 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium">Línea</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium">Esta semana</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium w-32">Barra</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium">Semana ant.</th>
                      <th className="hidden sm:table-cell px-4 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium w-32">Barra</th>
                      <th className="text-right px-6 py-3 text-xs text-slate-500 uppercase tracking-widest font-medium">Δ Cambio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {comparacion.lineas.map((row) => (
                      <tr key={row.linea} className="hover:bg-slate-800/30 transition-colors">
                        {/* Línea */}
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                              row.actualPct < UMBRAL_CRITICO ? 'bg-red-500/15 text-red-400' : 'bg-slate-700/60 text-slate-300'
                            }`}>
                              {row.actualPct < UMBRAL_CRITICO ? '!' : '·'}
                            </span>
                            <span className="font-semibold text-slate-200">Línea {row.linea}</span>
                          </div>
                        </td>

                        {/* Esta semana % */}
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${
                            row.actualPct >= 85 ? 'text-emerald-400' :
                            row.actualPct >= 70 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {row.actualPct.toFixed(1)}%
                          </span>
                        </td>

                        {/* Barra actual */}
                        <td className="hidden sm:table-cell px-4 py-3 w-32">
                          <BarraComparacion pct={row.actualPct} color="blue" />
                        </td>

                        {/* Semana anterior % */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-slate-400">
                            {row.anteriorEventos > 0 ? `${row.anteriorPct.toFixed(1)}%` : '—'}
                          </span>
                        </td>

                        {/* Barra anterior */}
                        <td className="hidden sm:table-cell px-4 py-3 w-32">
                          {row.anteriorEventos > 0 && (
                            <BarraComparacion pct={row.anteriorPct} color="slate" />
                          )}
                        </td>

                        {/* Delta */}
                        <td className="px-6 py-3 text-right">
                          {row.anteriorEventos > 0 ? (
                            <DeltaBadge delta={row.delta} />
                          ) : (
                            <span className="text-slate-600 text-xs">sin datos</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Nota metodológica */}
          <p className="text-xs text-slate-600 leading-relaxed">
            * La semana anterior se estima a partir de la diferencia entre el historial acumulado de 14 días y el de 7 días.
            Si el backend no registra suficiente actividad para el período 8–14, algunos valores aparecen como "—".
            Los datos se actualizan en tiempo real desde el servicio GPS del STM.
          </p>
        </>
      )}
    </div>
  );
}
