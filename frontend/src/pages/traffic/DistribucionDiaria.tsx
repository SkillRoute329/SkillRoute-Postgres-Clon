/**
 * DistribucionDiaria — Vista de rotación diaria coche → servicio
 * Muestra para cada fecha disponible qué coche físico corre qué servicio.
 * Incluye indicador GPS en vivo desde STM (UCOT empresa 70).
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { Bus, Search, RefreshCw, Calendar, ArrowRight, Clock, Route, Wifi, WifiOff, Building2 } from 'lucide-react';

interface CocheServicio {
  coche: string;
  servicio: string;
  horaSalida: string;
  linea: string;
}

interface RotacionDia {
  fecha: string;
  meta: {
    totalCoches: number;
    archivo: string;
  };
  coches: CocheServicio[];
}

interface BusGPS {
  codigoBus: string;
  linea: string;
  destino: string;
  lat: number;
  lng: number;
  timestamp: string;
}

const LINEAS_COLORES: Record<string, string> = {
  '300': 'bg-blue-600',
  '306': 'bg-green-600',
  '316': 'bg-purple-600',
  '317': 'bg-orange-600',
  '328': 'bg-pink-600',
  '329': 'bg-rose-600',
  '330': 'bg-indigo-600',
  '370': 'bg-teal-600',
  '371': 'bg-cyan-600',
  '379': 'bg-yellow-600',
  '396': 'bg-red-600',
  '221': 'bg-emerald-600',
  'DM1': 'bg-slate-600',
  'CE1': 'bg-amber-600',
  'XA1': 'bg-violet-600',
  'XA2': 'bg-fuchsia-600',
  'L-12': 'bg-sky-600',
  'L-13': 'bg-lime-600',
  'L-31': 'bg-stone-600',
  'L-32': 'bg-zinc-600',
  'L-33': 'bg-neutral-600',
};

function lineaColor(linea: string): string {
  const base = linea.replace(/[abhrpev]/g, '');
  return LINEAS_COLORES[base] || 'bg-slate-600';
}

export default function DistribucionDiaria() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [rotacion, setRotacion] = useState<RotacionDia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fecha, setFecha] = useState('2026-01-21');
  const [busqueda, setBusqueda] = useState('');
  const [lineaFiltro, setLineaFiltro] = useState('');
  const [detalleServicio, setDetalleServicio] = useState<any | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [gpsMap, setGpsMap] = useState<Record<string, BusGPS>>({});
  const [gpsActivos, setGpsActivos] = useState(0);
  const [gpsTs, setGpsTs] = useState('');

  const fetchGPS = useCallback(async () => {
    try {
      const res = await fetch('/api/positions');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;
      const ucot: BusGPS[] = (data.buses ?? []).filter((b: any) => b.empresaId === empresaPropia);
      const map: Record<string, BusGPS> = {};
      for (const b of ucot) map[b.codigoBus] = b;
      setGpsMap(map);
      setGpsActivos(ucot.length);
      setGpsTs(new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // GPS opcional, no bloquear UI
    }
  }, []);

  useEffect(() => {
    fetchGPS();
    const interval = setInterval(fetchGPS, 30000); // refresh cada 30s
    return () => clearInterval(interval);
  }, [fetchGPS]);

  const fetchRotacion = async (fechaBuscar: string) => {
    setLoading(true);
    setError('');
    setRotacion(null);
    try {
      const res = await fetch(`/api/rotacion/${fechaBuscar}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setRotacion(data);
    } catch (e: any) {
      setError(e.message || 'Error al cargar rotación');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalle = async (servicio: string) => {
    if (detalleServicio?.servicio === servicio) {
      setDetalleServicio(null);
      return;
    }
    setLoadingDetalle(true);
    try {
      const res = await fetch(`/api/cartones/oficiales/${servicio}`);
      if (res.ok) {
        const d = await res.json();
        setDetalleServicio(d.ok ? d.carton : null);
      }
    } catch {
      // Si no hay cartón, no hay problema
    } finally {
      setLoadingDetalle(false);
    }
  };

  useEffect(() => {
    fetchRotacion(fecha);
  }, []);

  const coches = rotacion?.coches ?? [];
  const lineasDisponibles = [...new Set(coches.map(c => c.linea.replace(/[abhrpev]/g, '')))].sort();

  const cochesFiltrados = coches.filter(c => {
    const q = busqueda.toLowerCase();
    const linBase = c.linea.replace(/[abhrpev]/g, '');
    if (lineaFiltro && linBase !== lineaFiltro) return false;
    if (!q) return true;
    return c.coche.includes(q) || c.servicio.includes(q) || c.linea.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Route className="w-7 h-7 text-primary-400" />
            Distribución Diaria — {empresaCfg.label}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Rotación coche físico → servicio por fecha. Fuente: planilla oficial {empresaCfg.label}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select value={empresaPropia} onChange={(e) => setEmpresaPropia(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" title="Operador propio"><option value={70}>UCOT</option><option value={50}>CUTCSA</option><option value={20}>COME</option><option value={10}>COETC</option></select>
        </div>
        {/* Selector de fecha */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2 border border-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={() => fetchRotacion(fecha)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Cargar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl border border-red-600/40 bg-red-950/20 text-red-400 text-sm">
          {error === 'Fecha no encontrada'
            ? `No hay rotación cargada para ${fecha}. Cargá los datos desde Admin → Seed.`
            : error}
        </div>
      )}

      {/* Stats */}
      {rotacion && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-slate-400 text-xs">Total coches</p>
            <p className="text-2xl font-bold text-white mt-1">{rotacion.meta.totalCoches}</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-slate-400 text-xs">Líneas activas</p>
            <p className="text-2xl font-bold text-white mt-1">{lineasDisponibles.length}</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-slate-400 text-xs">Filtrados</p>
            <p className="text-2xl font-bold text-primary-400 mt-1">{cochesFiltrados.length}</p>
          </div>
          <div className={`rounded-xl p-4 border ${gpsActivos > 0 ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-900'}`}>
            <p className="text-slate-400 text-xs flex items-center gap-1">
              {gpsActivos > 0 ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3" />}
              GPS en vivo ({empresaCfg.label})
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{gpsActivos}</p>
            {gpsTs && <p className="text-[10px] text-slate-500 mt-0.5">act. {gpsTs}</p>}
          </div>
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-slate-400 text-xs">Fuente</p>
            <p className="text-sm font-mono text-slate-300 mt-1 truncate">{rotacion.meta.archivo}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            placeholder="Buscar coche, servicio o línea..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-transparent text-white text-sm flex-1 focus:outline-none placeholder:text-slate-500"
          />
        </div>

        <select
          value={lineaFiltro}
          onChange={e => setLineaFiltro(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">Todas las líneas</option>
          {lineasDisponibles.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      )}

      {!loading && cochesFiltrados.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-8"></th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Coche</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Servicio</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Línea</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Hora salida</span>
                </th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Cartón</th>
              </tr>
            </thead>
            <tbody>
              {cochesFiltrados.map((c) => {
                const gps = gpsMap[c.coche];
                return (
                <Fragment key={c.coche}>
                  <tr
                    className={`border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors cursor-pointer ${detalleServicio?.servicio === c.servicio ? 'bg-primary-950/30' : ''}`}
                    onClick={() => fetchDetalle(c.servicio)}
                  >
                    <td className="pl-4 py-3">
                      {gps
                        ? <span title={`GPS: ${gps.linea} → ${gps.destino}`} className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                        : <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Bus className="w-4 h-4 text-slate-500" />
                        <span className="font-mono font-bold text-white">{c.coche}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-primary-300 font-semibold">{c.servicio}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white ${lineaColor(c.linea)}`}>
                        {c.linea}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-300">{c.horaSalida}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                        {loadingDetalle && detalleServicio === null ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3 h-3" />
                        )}
                        Ver cartón
                      </button>
                    </td>
                  </tr>

                  {/* Panel de detalle del cartón */}
                  {detalleServicio?.servicio === c.servicio && (
                    <tr key={`${c.coche}-detalle`}>
                      <td colSpan={6} className="px-4 py-4 bg-slate-900/70">
                        <div className="rounded-xl border border-primary-600/30 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-white">
                              Servicio {detalleServicio.servicio} — Línea {detalleServicio.linea}
                            </p>
                            <span className="text-xs text-slate-400">
                              {detalleServicio.totalVueltas} vueltas · {detalleServicio.primeraSalida} → {detalleServicio.ultimaLlegada}
                            </span>
                          </div>

                          {(detalleServicio.instrucciones || []).length > 0 && (
                            <p className="text-xs text-amber-300 mb-3 font-mono">
                              {detalleServicio.instrucciones.join(' | ')}
                            </p>
                          )}

                          {/* Primera vuelta */}
                          {detalleServicio.vueltas?.[0] && (
                            <div>
                              <p className="text-xs text-slate-400 mb-2">Primera vuelta:</p>
                              <div className="flex flex-wrap gap-2">
                                {detalleServicio.vueltas[0].paradas?.slice(0, 8).map((p: any, i: number) => (
                                  <div key={i} className="bg-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                                    <p className="text-slate-400 text-[10px]">{p.etapa}</p>
                                    <p className="text-white font-mono font-semibold">{p.hora}</p>
                                  </div>
                                ))}
                                {(detalleServicio.vueltas[0].paradas?.length ?? 0) > 8 && (
                                  <div className="bg-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 self-center">
                                    +{detalleServicio.vueltas[0].paradas.length - 8} más
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && cochesFiltrados.length === 0 && rotacion && (
        <div className="text-center py-20 text-slate-500">
          No hay coches que coincidan con la búsqueda.
        </div>
      )}

      {!loading && !error && !rotacion && (
        <div className="text-center py-20 text-slate-500">
          <Route className="w-12 h-12 mx-auto mb-3 text-slate-700" />
          <p>Seleccioná una fecha y presioná Cargar.</p>
          <p className="text-xs mt-1">Fechas disponibles: 2026-01-21 (miércoles hábil)</p>
        </div>
      )}
    </div>
  );
}
