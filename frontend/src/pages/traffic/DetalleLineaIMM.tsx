/**
 * DetalleLineaIMM — drill-down de una línea del operador.
 *
 * FASE 5.15 (2026-05-14): vista detallada que se abre al hacer click sobre
 * una línea en DemandaOficialIMM. Combina:
 *   - Evolución mensual (línea de tiempo de 6 meses)
 *   - Perfil hora × día de semana (heatmap propio de la línea)
 *   - Mapa con paradas críticas (tamaño = volumen, color = Δ vs mes anterior)
 *
 * Datos: 100 % validaciones oficiales IMM (stm_validaciones_mensual).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, TrendingUp, TrendingDown, Minus, MapPin, BarChart3, Calendar,
} from 'lucide-react';
import {
  fetchLineaEvolucion,
  fetchParadasLinea,
  type DemandaLineaEvolucion,
  type DemandaParadaLinea,
} from '../../services/stmDemandaService';

const DOW_LBL = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const MVD_CENTER: [number, number] = [-34.9011, -56.1645];

function fmtMes(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { month: 'short', year: '2-digit' });
}

const DetalleLineaIMM: React.FC<{
  op: string;
  opNombre: string;
  linea: string;
  mes: string; // YYYY-MM
  onClose: () => void;
}> = ({ op, opNombre, linea, mes, onClose }) => {
  const [evol, setEvol] = useState<DemandaLineaEvolucion | null>(null);
  const [paradas, setParadas] = useState<DemandaParadaLinea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchLineaEvolucion(op, linea),
      fetchParadasLinea(op, linea, mes),
    ])
      .then(([ev, par]) => { setEvol(ev); setParadas(par); })
      .finally(() => setLoading(false));
  }, [op, linea, mes]);

  // Stats globales
  const totalActual = useMemo(() => paradas.reduce((s, p) => s + p.actual, 0), [paradas]);
  const paradasConGeo = useMemo(() => paradas.filter((p) => p.lat != null && p.lon != null), [paradas]);
  const maxVal = useMemo(() => Math.max(0, ...paradasConGeo.map((p) => p.actual)), [paradasConGeo]);
  const evolItems = evol?.evolucionMensual ?? [];
  const maxEvol = Math.max(0, ...evolItems.map((e) => e.validaciones));

  // Heatmap matriz desde horaDow
  const heat = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 0;
    for (const r of evol?.horaDow ?? []) {
      if (r.dow >= 0 && r.dow < 7 && r.hora >= 0 && r.hora < 24) {
        m[r.dow][r.hora] = r.validaciones;
        if (r.validaciones > max) max = r.validaciones;
      }
    }
    return { m, max };
  }, [evol]);
  function colorHeat(v: number, max: number): string {
    if (max === 0 || v === 0) return 'bg-slate-800';
    const pct = v / max;
    if (pct < 0.1) return 'bg-blue-900/40';
    if (pct < 0.3) return 'bg-blue-700/60';
    if (pct < 0.5) return 'bg-emerald-700/70';
    if (pct < 0.7) return 'bg-yellow-600/80';
    if (pct < 0.85) return 'bg-orange-600/90';
    return 'bg-red-600';
  }

  function colorDelta(delta: number, previo: number): string {
    if (previo === 0) return '#94a3b8'; // slate
    const pct = (delta / previo) * 100;
    if (pct > 10) return '#10b981';   // emerald
    if (pct > 0) return '#34d399';     // light emerald
    if (pct > -10) return '#fb923c';   // orange
    return '#ef4444';                  // red
  }

  function radioParada(actual: number): number {
    if (maxVal === 0) return 4;
    const pct = actual / maxVal;
    return 4 + Math.sqrt(pct) * 18;
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-7xl w-full max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800 px-6 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-amber-400">L{linea}</span>
              <span className="text-sm text-slate-400">· {opNombre}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{mes}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Validaciones oficiales IMM · drill-down completo</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && <p className="text-sm text-slate-500">Cargando…</p>}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total mes</p>
              <p className="text-2xl font-black text-amber-300">{totalActual.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">validaciones</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Paradas activas</p>
              <p className="text-2xl font-black text-blue-400">{paradas.length}</p>
              <p className="text-[10px] text-slate-500">{paradasConGeo.length} con coordenadas</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Meses con datos</p>
              <p className="text-2xl font-black text-emerald-400">{evolItems.length}</p>
              <p className="text-[10px] text-slate-500">en histórico</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Parada top</p>
              <p className="text-sm font-bold text-slate-200 leading-tight mt-1 line-clamp-2">
                {paradas[0]?.nombre ?? '(s/n)'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">{paradas[0]?.actual.toLocaleString() ?? 0} viajes</p>
            </div>
          </div>

          {/* Evolución mensual */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" /> Evolución mensual
            </h3>
            {evolItems.length === 0 && <p className="text-xs text-slate-500">Sin datos.</p>}
            {evolItems.length > 0 && (
              <div className="flex items-end gap-2 h-32">
                {evolItems.map((e, i) => {
                  const altura = maxEvol > 0 ? (e.validaciones / maxEvol) * 100 : 0;
                  const prev = evolItems[i - 1];
                  const delta = prev ? e.validaciones - prev.validaciones : 0;
                  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                  const deltaCol = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-slate-500';
                  return (
                    <div key={e.mes} className="flex-1 flex flex-col items-center gap-1">
                      <div className="relative w-full flex items-end h-24">
                        <div
                          className="w-full bg-amber-500 rounded-t transition-all duration-500"
                          style={{ height: `${altura}%` }}
                          title={`${fmtMes(e.mes)}: ${e.validaciones.toLocaleString()}`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{e.validaciones.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-500">{fmtMes(e.mes)}</span>
                      {prev && (
                        <span className={`text-[9px] ${deltaCol} flex items-center gap-0.5`}>
                          <Icon className="w-2.5 h-2.5" />
                          {delta >= 0 ? '+' : ''}{((delta / prev.validaciones) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Heatmap */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-400" /> Heatmap hora × día
              </h3>
              <div className="overflow-x-auto">
                <table className="text-[9px] font-mono w-full">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left pr-1">h</th>
                      {DOW_LBL.map((d) => <th key={d} className="text-center px-1">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 24 }, (_, h) => (
                      <tr key={h}>
                        <td className="text-slate-500 pr-1">{String(h).padStart(2, '0')}</td>
                        {DOW_LBL.map((_, dow) => {
                          const v = heat.m[dow][h];
                          return (
                            <td
                              key={dow}
                              className={`text-center w-7 h-4 text-[8px] ${colorHeat(v, heat.max)}`}
                              title={`${DOW_LBL[dow]} ${h}:00 — ${v.toLocaleString()}`}
                            >
                              {v > 0 && v >= heat.max * 0.4 ? Math.round(v / 1000) + 'k' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top paradas tabla */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Top 15 paradas
              </h3>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 text-left sticky top-0 bg-slate-900">
                    <tr>
                      <th className="py-1">#</th>
                      <th className="py-1">Parada</th>
                      <th className="py-1 text-right">Mes</th>
                      <th className="py-1 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paradas.slice(0, 15).map((p, i) => {
                      const Icon = p.delta > 0 ? TrendingUp : p.delta < 0 ? TrendingDown : Minus;
                      const col = p.delta > 0 ? 'text-emerald-400' : p.delta < 0 ? 'text-red-400' : 'text-slate-500';
                      return (
                        <tr key={p.codigoParada} className="border-t border-slate-800/60">
                          <td className="py-1 text-slate-500">{i + 1}</td>
                          <td className="py-1">
                            <span className="font-mono text-slate-500">{p.codigoParada}</span>
                            <span className="block text-[10px] text-slate-400 line-clamp-1">
                              {p.nombre || '(sin nombre)'}
                            </span>
                          </td>
                          <td className="py-1 text-right font-mono">{p.actual.toLocaleString()}</td>
                          <td className={`py-1 text-right ${col}`}>
                            {p.previo > 0 ? (
                              <>
                                <Icon className="w-2.5 h-2.5 inline" />
                                {' '}{p.pctCambio >= 0 ? '+' : ''}{p.pctCambio.toFixed(0)}%
                              </>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Mapa */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Mapa de paradas críticas — L{linea}
              </h3>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  Crece &gt;10%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  Cae 0-10%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  Cae &gt;10%
                </span>
                <span className="text-slate-500">· radio = volumen</span>
              </div>
            </div>
            <div style={{ height: 480 }}>
              {paradasConGeo.length === 0 && (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  Sin paradas geo-referenciadas (línea sin coincidencia con stops_geo)
                </div>
              )}
              {paradasConGeo.length > 0 && (
                <MapContainer
                  center={[
                    paradasConGeo[0].lat as number,
                    paradasConGeo[0].lon as number,
                  ]}
                  zoom={12}
                  style={{ width: '100%', height: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution="&copy; OpenStreetMap · CartoDB"
                  />
                  {paradasConGeo.map((p) => (
                    <CircleMarker
                      key={p.codigoParada}
                      center={[p.lat as number, p.lon as number]}
                      radius={radioParada(p.actual)}
                      pathOptions={{
                        color: colorDelta(p.delta, p.previo),
                        fillColor: colorDelta(p.delta, p.previo),
                        fillOpacity: 0.6,
                        weight: 1.5,
                      }}
                    >
                      <Tooltip>
                        <div className="text-xs">
                          <strong>{p.nombre || p.codigoParada}</strong>
                          <br />
                          {mes}: {p.actual.toLocaleString()} viajes
                          {p.previo > 0 && (
                            <>
                              <br />Δ: {p.delta >= 0 ? '+' : ''}{p.delta.toLocaleString()}
                              {' '}({p.pctCambio >= 0 ? '+' : ''}{p.pctCambio.toFixed(1)}%)
                            </>
                          )}
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              )}
            </div>
            <p className="text-[10px] text-slate-600 p-3">
              Coordenadas tomadas de <code>schedule_index.json</code> + <code>stops_geo.json</code> oficial.
              Tamaño del círculo proporcional al volumen mensual de validaciones. Color según variación vs el mes anterior.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

void MVD_CENTER; // referenciado por si en futuro fallback al centro
export default DetalleLineaIMM;
