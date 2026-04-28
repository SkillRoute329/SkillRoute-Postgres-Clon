import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db, authReady } from '../../config/firebase';
import {
  Bus,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  ChevronRight,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Normaliza los distintos esquemas de estado de vehículo que conviven en Firestore:
// - VehicleList escribe: status = 'OPERATIONAL'|'MAINTENANCE'|'STOPPED'
// - adminSeeds escribe: estado_operativo = 'ACTIVO'|'EN_TALLER'|...
// - disco nativo: estado = 'activo'|'taller'|'inactivo'
function normalizeEstado(raw: string | undefined): 'activo' | 'taller' | 'inactivo' {
  if (!raw) return 'activo';
  const s = raw.toLowerCase();
  if (s === 'taller' || s === 'maintenance' || s.includes('taller')) return 'taller';
  if (s === 'inactivo' || s === 'stopped') return 'inactivo';
  return 'activo';
}

interface Vehiculo {
  id: string;
  numero: string;
  linea: string;
  estado: 'activo' | 'taller' | 'inactivo';
  tipo_combustible: 'diesel' | 'electrico';
  ultimo_kilometraje: number;
  ultimo_reporte: Timestamp | null;
}

interface ViajeActivo {
  id: string;
  coche_id: string;
  linea_id: string;
  conductor_id: string;
  timestamp: Timestamp | null;
}

interface OrdenMantenimiento {
  id: string;
  cocheId: string;
  tipo: string;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  kilometraje?: number;
  fechaProgramada?: string;
}

interface AlertaPM {
  cocheId: string;
  numeroCoche: string;
  lineaAsignada: string;
  tipoMantenimiento: string;
  kmActuales: number;
  kmLimite: number;
  kmRestantes: number;
  urgencia: 'critico' | 'proximo' | 'programado';
  enRutaAhora: boolean;
}

type FiltroEstado = 'todos' | 'disponibles' | 'taller' | 'alertas';

// ─── Constantes preventivo ────────────────────────────────────────────────────

const INTERVALOS = {
  diesel: { aceite_km: 10_000, filtros_km: 20_000, neumaticos_km: 80_000 },
  electrico: { neumaticos_km: 60_000 },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKm(n: number): string {
  return n.toLocaleString('es-UY') + ' km';
}

function calcularProximoPM(
  v: Vehiculo,
  ordenes: OrdenMantenimiento[],
): { tipoMantenimiento: string; kmLimite: number; kmRestantes: number } | null {
  const kmActual = v.ultimo_kilometraje;
  if (!kmActual) return null;

  // Buscar el último PM completado para este coche
  const completadas = ordenes
    .filter((o) => o.cocheId === v.id && o.estado === 'completado' && o.kilometraje)
    .sort((a, b) => (b.kilometraje ?? 0) - (a.kilometraje ?? 0));

  const kmUltimoPM = completadas.length > 0 ? (completadas[0].kilometraje ?? 0) : 0;
  const kmRecorridos = kmActual - kmUltimoPM;

  const intervalos =
    v.tipo_combustible === 'electrico' ? INTERVALOS.electrico : INTERVALOS.diesel;

  let menorRestante: number | null = null;
  let tipoMenor = '';
  let limiteKm = 0;

  for (const [tipo, intervalo] of Object.entries(intervalos)) {
    const kmRestantes = intervalo - kmRecorridos;
    if (menorRestante === null || kmRestantes < menorRestante) {
      menorRestante = kmRestantes;
      tipoMenor = tipo.replace('_km', '').replace('_', ' ');
      limiteKm = kmUltimoPM + intervalo;
    }
  }

  if (menorRestante === null) return null;

  return {
    tipoMantenimiento: tipoMenor,
    kmLimite: limiteKm,
    kmRestantes: menorRestante,
  };
}

function urgenciaPM(kmRestantes: number): 'critico' | 'proximo' | 'programado' | null {
  if (kmRestantes < 0) return 'critico';
  if (kmRestantes <= 500) return 'proximo';
  if (kmRestantes <= 2000) return 'programado';
  return null;
}

function badgeEstado(estado: Vehiculo['estado'], enRuta: boolean) {
  if (enRuta)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        En Servicio
      </span>
    );
  if (estado === 'taller')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        En Taller
      </span>
    );
  if (estado === 'activo')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
        Disponible
      </span>
    );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
      Inactivo
    </span>
  );
}

function colorKmRestantes(km: number): string {
  if (km < 0) return 'text-red-400';
  if (km <= 500) return 'text-red-400';
  if (km <= 2000) return 'text-amber-400';
  return 'text-emerald-400';
}

// ─── Componente principal ─────────────────────────────────────────────────────

const DisponibilidadFlota = () => {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [viajesActivos, setViajesActivos] = useState<ViajeActivo[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenMantenimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date>(new Date());
  const [sinDatosMantenimiento, setSinDatosMantenimiento] = useState(false);

  // ── Carga inicial: vehiculos + ordenes de mantenimiento ──────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await authReady;

      // Intentar vehicles, luego vehiculos como fallback
      let snapV = await getDocs(collection(db, 'vehicles'));
      if (snapV.empty) {
        snapV = await getDocs(collection(db, 'vehiculos'));
      }

      const listaVehiculos: Vehiculo[] = snapV.docs.map((d) => ({
        id: d.id,
        numero: d.data().numero ?? d.id,
        linea: d.data().linea ?? '—',
        estado: (d.data().estado as 'activo' | 'taller' | 'inactivo') ??
                normalizeEstado(d.data().status ?? d.data().estado_operativo),
        tipo_combustible: d.data().tipo_combustible ?? 'diesel',
        ultimo_kilometraje: d.data().ultimo_kilometraje ?? 0,
        ultimo_reporte: d.data().ultimo_reporte ?? null,
      }));

      // Intentar maintenance, luego ordenes_mantenimiento como fallback
      let snapM = await getDocs(collection(db, 'maintenance'));
      if (snapM.empty) {
        snapM = await getDocs(collection(db, 'maintenance_orders'));
        if (snapM.empty) {
          snapM = await getDocs(collection(db, 'ordenes_mantenimiento'));
        }
      }

      const listaOrdenes: OrdenMantenimiento[] = snapM.docs.map((d) => ({
        id: d.id,
        cocheId: d.data().cocheId ?? '',
        tipo: d.data().tipo ?? '',
        estado: d.data().estado ?? 'pendiente',
        prioridad: d.data().prioridad ?? 'baja',
        kilometraje: d.data().kilometraje,
        fechaProgramada: d.data().fechaProgramada,
      }));

      setSinDatosMantenimiento(listaOrdenes.length === 0);
      setVehiculos(listaVehiculos);
      setOrdenes(listaOrdenes);
      setUltimaActualizacion(new Date());
    } catch (err) {
      console.error('[DisponibilidadFlota] error cargando datos:', err);
      setError('Error al cargar datos de flota. Verificar conexión con Firebase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // ── Listener RT: viajes_activos ──────────────────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;

    const setup = async () => {
      await authReady;
      const q = query(collection(db, 'viajes_activos'));
      unsub = onSnapshot(
        q,
        (snap) => {
          const lista: ViajeActivo[] = snap.docs.map((d) => ({
            id: d.id,
            coche_id: d.data().coche_id ?? '',
            linea_id: d.data().linea_id ?? '',
            conductor_id: d.data().conductor_id ?? '',
            timestamp: d.data().timestamp ?? null,
          }));
          setViajesActivos(lista);
          setUltimaActualizacion(new Date());
        },
        (err) => {
          console.error('[DisponibilidadFlota] viajes_activos error:', err);
        },
      );
    };

    void setup();
    return () => {
      unsub?.();
    };
  }, []);

  // ── Derivados ────────────────────────────────────────────────────────────────

  const cochesEnRuta = new Set(viajesActivos.map((v) => v.coche_id));

  const alertasPM: AlertaPM[] = vehiculos
    .map((v) => {
      const pm = calcularProximoPM(v, ordenes);
      if (!pm) return null;
      const urg = urgenciaPM(pm.kmRestantes);
      if (!urg) return null;
      return {
        cocheId: v.id,
        numeroCoche: v.numero,
        lineaAsignada: v.linea,
        tipoMantenimiento: pm.tipoMantenimiento,
        kmActuales: v.ultimo_kilometraje,
        kmLimite: pm.kmLimite,
        kmRestantes: pm.kmRestantes,
        urgencia: urg,
        enRutaAhora: cochesEnRuta.has(v.numero ?? '') || cochesEnRuta.has(v.id),
      } satisfies AlertaPM;
    })
    .filter((a): a is AlertaPM => a !== null)
    .sort((a, b) => a.kmRestantes - b.kmRestantes);

  const cochesConAlerta = new Set(alertasPM.map((a) => a.cocheId));
  const cochesTaller = vehiculos.filter((v) => v.estado === 'taller');

  const kpiTotal = vehiculos.length;
  const kpiEnServicio = cochesEnRuta.size;
  const kpiEnTaller = cochesTaller.length;
  const kpiConAlerta = cochesConAlerta.size;

  // ── Filtrado de tabla ────────────────────────────────────────────────────────

  const vehiculosFiltrados = vehiculos.filter((v) => {
    if (filtro === 'disponibles') return v.estado === 'activo' && !cochesEnRuta.has(v.numero ?? '') && !cochesEnRuta.has(v.id);
    if (filtro === 'taller') return v.estado === 'taller';
    if (filtro === 'alertas') return cochesConAlerta.has(v.id);
    return true;
  });

  // ── Impacto operacional ──────────────────────────────────────────────────────

  const lineasAfectadas = [...new Set(cochesTaller.map((v) => v.linea).filter((l) => l && l !== '—'))];

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-slate-950 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Cargando disponibilidad de flota…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-950 min-h-screen flex items-center justify-center p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-semibold mb-1">Error al cargar</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => void cargarDatos()}
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl px-4 py-2 font-semibold text-white text-sm flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen p-6 space-y-6">
      {/* Glow ambiental */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-700/8 rounded-full blur-[160px] pointer-events-none" />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200 flex items-center gap-3">
            <Bus className="w-7 h-7 text-blue-400" />
            Disponibilidad de Flota
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Última actualización:{' '}
            {ultimaActualizacion.toLocaleTimeString('es-UY', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />
          {(
            [
              { key: 'todos', label: 'Todos' },
              { key: 'disponibles', label: 'Disponibles' },
              { key: 'taller', label: 'En Taller' },
              { key: 'alertas', label: 'Con Alertas' },
            ] as { key: FiltroEstado; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filtro === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => void cargarDatos()}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Sección 1 — KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Total Coches</p>
          <p className="text-3xl font-black text-white">{kpiTotal}</p>
          <p className="text-xs text-slate-400 mt-1">Flota registrada</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">En Servicio</p>
          <p className="text-3xl font-black text-emerald-400">{kpiEnServicio}</p>
          <p className="text-xs text-slate-400 mt-1">Con viaje activo ahora</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">En Taller</p>
          <p className="text-3xl font-black text-amber-400">{kpiEnTaller}</p>
          <p className="text-xs text-slate-400 mt-1">Fuera de servicio</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Con Alerta PM</p>
          <p className="text-3xl font-black text-red-400">{kpiConAlerta}</p>
          <p className="text-xs text-slate-400 mt-1">Preventiva próxima o vencida</p>
        </div>
      </div>

      {/* ── Sección 2 — Tabla de flota ── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Bus className="w-4 h-4 text-blue-400" />
            Estado de Flota
            <span className="text-xs text-slate-500 font-normal ml-1">
              ({vehiculosFiltrados.length} coches)
            </span>
          </h2>
        </div>

        {vehiculosFiltrados.length === 0 ? (
          <div className="py-12 text-center">
            <Bus className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay coches que coincidan con el filtro seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    N° Coche
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    Línea
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    En Ruta
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    Último km
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    Próx. PM
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    Alerta
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehiculosFiltrados.map((v) => {
                  const enRuta = cochesEnRuta.has(v.id);
                  const pm = calcularProximoPM(v, ordenes);
                  const alerta = pm ? alertasPM.find((a) => a.cocheId === v.id) : null;

                  return (
                    <tr key={v.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                      {/* N° Coche */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {v.tipo_combustible === 'electrico' ? (
                            <Zap className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : (
                            <Bus className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-200">{v.numero}</span>
                        </div>
                      </td>
                      {/* Línea */}
                      <td className="px-4 py-3 text-slate-300">{v.linea}</td>
                      {/* Estado */}
                      <td className="px-4 py-3">{badgeEstado(v.estado, enRuta)}</td>
                      {/* En Ruta */}
                      <td className="px-4 py-3">
                        {enRuta ? (
                          <span className="text-emerald-400 font-medium">Sí</span>
                        ) : (
                          <span className="text-slate-500">No</span>
                        )}
                      </td>
                      {/* Último km */}
                      <td className="px-4 py-3 text-slate-300">
                        {v.ultimo_kilometraje ? fmtKm(v.ultimo_kilometraje) : '—'}
                      </td>
                      {/* Próx. PM */}
                      <td className="px-4 py-3">
                        {pm ? (
                          <span className={`font-medium ${colorKmRestantes(pm.kmRestantes)}`}>
                            {pm.kmRestantes < 0
                              ? `Vencido (${Math.abs(pm.kmRestantes).toLocaleString('es-UY')} km)`
                              : fmtKm(pm.kmRestantes)}
                          </span>
                        ) : (
                          <span className="text-slate-500">Sin datos</span>
                        )}
                      </td>
                      {/* Alerta */}
                      <td className="px-4 py-3">
                        {alerta ? (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                              alerta.urgencia === 'critico'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : alerta.urgencia === 'proximo'
                                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {alerta.urgencia === 'critico'
                              ? 'CRÍTICO'
                              : alerta.urgencia === 'proximo'
                                ? 'PRÓXIMO'
                                : 'PROGRAMADO'}{' '}
                            — {alerta.tipoMantenimiento}
                          </span>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-slate-600" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sección 3 — Alertas de mantenimiento proactivas ── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-400" />
            Alertas de Mantenimiento Preventivo
          </h2>
          {alertasPM.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
              {alertasPM.length} coches requieren atención
            </span>
          )}
        </div>

        {sinDatosMantenimiento && (
          <div className="px-6 py-4 bg-slate-800/30 border-b border-slate-800 flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-slate-400 text-sm">
              Sin historial de mantenimiento registrado. Los cálculos de preventivo se basan en
              kilómetros desde 0.{' '}
              <Link
                to="/dashboard/admin/maintenance"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Ir al módulo de mantenimiento →
              </Link>
            </p>
          </div>
        )}

        {alertasPM.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Todos los coches están dentro de los intervalos preventivos.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {alertasPM.map((alerta) => (
              <div key={alerta.cocheId} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Indicador de urgencia */}
                <div
                  className={`w-1.5 h-12 rounded-full shrink-0 ${
                    alerta.urgencia === 'critico'
                      ? 'bg-red-500'
                      : alerta.urgencia === 'proximo'
                        ? 'bg-orange-500'
                        : 'bg-amber-400'
                  }`}
                />
                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-200">Coche #{alerta.numeroCoche}</span>
                    <span className="text-slate-500 text-xs">Línea {alerta.lineaAsignada}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        alerta.urgencia === 'critico'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : alerta.urgencia === 'proximo'
                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {alerta.urgencia === 'critico'
                        ? 'CRÍTICO'
                        : alerta.urgencia === 'proximo'
                          ? 'PRÓXIMO'
                          : 'PROGRAMADO'}
                    </span>
                    {alerta.enRutaAhora && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        EN RUTA — atención urgente
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">
                    <span className="capitalize">{alerta.tipoMantenimiento}</span> —{' '}
                    {alerta.kmRestantes < 0 ? (
                      <span className="text-red-400 font-medium">
                        Vencido hace {Math.abs(alerta.kmRestantes).toLocaleString('es-UY')} km
                      </span>
                    ) : (
                      <span className={colorKmRestantes(alerta.kmRestantes)}>
                        {alerta.kmRestantes.toLocaleString('es-UY')} km restantes
                      </span>
                    )}{' '}
                    · Km actuales: {fmtKm(alerta.kmActuales)} · Límite: {fmtKm(alerta.kmLimite)}
                  </p>
                </div>
                {/* Acción */}
                <Link
                  to="/dashboard/admin/maintenance"
                  className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors font-medium"
                >
                  Programar mantenimiento
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sección 4 — Impacto operacional ── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Impacto Operacional
        </h2>

        {kpiEnTaller === 0 ? (
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-emerald-400 text-sm font-medium">
              Flota completa disponible — sin impacto operacional
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-slate-200 text-sm font-medium">
                  Coches fuera de servicio actualmente:{' '}
                  <span className="text-amber-400 font-bold">{kpiEnTaller}</span>
                </p>
                {lineasAfectadas.length > 0 ? (
                  <p className="text-slate-400 text-sm mt-1">
                    Líneas posiblemente afectadas:{' '}
                    <span className="text-slate-200 font-medium">
                      {lineasAfectadas.join(', ')}
                    </span>
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">
                    Sin información de líneas asignadas a los coches en taller.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {cochesTaller.map((v) => (
                <span
                  key={v.id}
                  className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                >
                  #{v.numero} — Línea {v.linea}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DisponibilidadFlota;
