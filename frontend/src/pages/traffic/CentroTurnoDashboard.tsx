import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db, authReady } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Bus,
  AlertTriangle,
  Wrench,
  Activity,
  CheckCircle,
  Clock,
  RefreshCw,
  MapPin,
  Zap,
  BarChart3,
  Navigation,
  Siren,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Vehiculo {
  id: string;
  numero: string;
  linea: string;
  estado: 'activo' | 'taller' | 'inactivo';
  ultimo_reporte?: Timestamp | null;
}

interface EventoDesvio {
  id: string;
  coche_id: string;
  linea_id: string;
  tipo: 'FUERA_DE_RUTA' | 'FUERA_DE_DESVIO_OFICIAL';
  metros_fuera: number;
  resuelto: boolean;
  timestamp: Timestamp | null;
}

interface Incidencia {
  id: string;
  titulo: string;
  estado: 'abierta' | 'en_proceso' | 'cerrada';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  coche_id?: string;
  linea_id?: string;
  timestamp: Timestamp | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tiempoAtras(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  const mins = Math.round((Date.now() - ts.toDate().getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins === 1) return 'hace 1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return 'hace 1 h';
  return `hace ${hrs} h`;
}

function horaActual(): string {
  return new Date().toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fechaActual(): string {
  return new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'verde' | 'amarillo' | 'rojo' | 'naranja';
  loading?: boolean;
}

const KpiCard = ({ label, value, icon, color, loading }: KpiCardProps) => {
  const colorMap: Record<string, string> = {
    verde: 'text-emerald-400',
    amarillo: 'text-yellow-400',
    rojo: 'text-red-400',
    naranja: 'text-orange-400',
  };
  const bgMap: Record<string, string> = {
    verde: 'bg-emerald-500/10',
    amarillo: 'bg-yellow-500/10',
    rojo: 'bg-red-500/10',
    naranja: 'bg-orange-500/10',
  };

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgMap[color]}`}>
        <span className={colorMap[color]}>{icon}</span>
      </div>
      {loading ? (
        <div className="h-9 w-16 bg-slate-700/50 rounded animate-pulse" />
      ) : (
        <span className={`text-3xl font-black ${colorMap[color]}`}>{value}</span>
      )}
      <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const CentroTurnoDashboard = () => {
  useAuth(); // contexto de auth requerido

  const [horaRefresh, setHoraRefresh] = useState(horaActual());
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [desvios, setDesvios] = useState<EventoDesvio[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);

  const [loadingVehiculos, setLoadingVehiculos] = useState(true);
  const [loadingDesvios, setLoadingDesvios] = useState(true);
  const [loadingIncidencias, setLoadingIncidencias] = useState(true);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  // ── Reloj del header ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setHoraRefresh(horaActual()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = useCallback(() => {
    setHoraRefresh(horaActual());
  }, []);

  // ── Listener: vehicles / vehiculos ────────────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      setLoadingVehiculos(true);
      const q = query(collection(db, 'vehicles'), orderBy('numero', 'asc'), limit(500));
      unsub = onSnapshot(
        q,
        snap => {
          setVehiculos(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Vehiculo, 'id'>) })),
          );
          setLoadingVehiculos(false);
        },
        err => {
          console.error('[CentroTurno] vehicles error:', err);
          // fallback: intentar colección "vehiculos"
          const q2 = query(collection(db, 'vehiculos'), orderBy('numero', 'asc'), limit(500));
          unsub = onSnapshot(
            q2,
            snap => {
              setVehiculos(
                snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Vehiculo, 'id'>) })),
              );
              setLoadingVehiculos(false);
            },
            err2 => {
              console.error('[CentroTurno] vehiculos fallback error:', err2);
              setLoadingVehiculos(false);
            },
          );
        },
      );
    };
    void setup();
    return () => { unsub?.(); };
  }, []);

  // ── Listener: eventos_desvio (sin resolver) ───────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      setLoadingDesvios(true);
      const q = query(
        collection(db, 'eventos_desvio'),
        where('resuelto', '==', false),
        orderBy('timestamp', 'desc'),
        limit(20),
      );
      unsub = onSnapshot(
        q,
        snap => {
          setDesvios(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EventoDesvio, 'id'>) })),
          );
          setLoadingDesvios(false);
        },
        err => {
          console.error('[CentroTurno] eventos_desvio error:', err);
          setLoadingDesvios(false);
        },
      );
    };
    void setup();
    return () => { unsub?.(); };
  }, []);

  // ── Listener: incidencias abiertas / en proceso ───────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      setLoadingIncidencias(true);
      const q = query(
        collection(db, 'incidencias'),
        where('estado', 'in', ['abierta', 'en_proceso']),
        orderBy('timestamp', 'desc'),
        limit(10),
      );
      unsub = onSnapshot(
        q,
        snap => {
          setIncidencias(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Incidencia, 'id'>) })),
          );
          setLoadingIncidencias(false);
        },
        err => {
          console.error('[CentroTurno] incidencias error:', err);
          setLoadingIncidencias(false);
        },
      );
    };
    void setup();
    return () => { unsub?.(); };
  }, []);

  // ── Resolver desvío ───────────────────────────────────────────────────────
  const resolverDesvio = async (desvioId: string) => {
    setResolviendoId(desvioId);
    try {
      await updateDoc(doc(db, 'eventos_desvio', desvioId), { resuelto: true });
    } catch (err) {
      console.error('[CentroTurno] resolver desvío error:', err);
    } finally {
      setResolviendoId(null);
    }
  };

  // ── KPIs calculados ───────────────────────────────────────────────────────
  const cochesActivos = vehiculos.filter(v => v.estado === 'activo').length;
  const cochesEnTaller = vehiculos.filter(v => v.estado === 'taller').length;
  const desviosSinResolver = desvios.length;
  const incidenciasAbiertas = incidencias.length;

  // ── Helpers de estilo ─────────────────────────────────────────────────────
  const tipoBadge = (tipo: EventoDesvio['tipo']) => {
    if (tipo === 'FUERA_DE_RUTA') {
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400">
          Fuera de ruta
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-400">
        Fuera de desvío
      </span>
    );
  };

  const prioridadBadge = (p: Incidencia['prioridad']) => {
    const map: Record<Incidencia['prioridad'], string> = {
      critica: 'bg-red-500/20 text-red-400',
      alta: 'bg-orange-500/20 text-orange-400',
      media: 'bg-yellow-500/20 text-yellow-400',
      baja: 'bg-slate-700 text-slate-400',
    };
    const label: Record<Incidencia['prioridad'], string> = {
      critica: 'Crítica',
      alta: 'Alta',
      media: 'Media',
      baja: 'Baja',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[p] ?? 'bg-slate-700 text-slate-400'}`}>
        {label[p] ?? p}
      </span>
    );
  };

  // ── Accesos rápidos ───────────────────────────────────────────────────────
  const accesos = [
    { label: 'Mapa en Vivo', to: '/dashboard/traffic/live-map', icon: <MapPin size={18} /> },
    { label: 'Puntualidad OTP', to: '/dashboard/traffic/otp', icon: <BarChart3 size={18} /> },
    { label: 'Monitoreo de Flota', to: '/dashboard/traffic/fleet-monitor', icon: <Bus size={18} /> },
    { label: 'Centro de Desvíos', to: '/dashboard/traffic/desvios', icon: <Navigation size={18} /> },
    { label: 'Centro de Incidencias', to: '/dashboard/traffic/incidents', icon: <Siren size={18} /> },
    { label: 'Distribución Diaria', to: '/dashboard/traffic/distribucion', icon: <Zap size={18} /> },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-950 min-h-screen p-6 space-y-6">

      {/* ── Glow de ambiente ─────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/4 w-[600px] h-[300px] bg-blue-700/8 rounded-full blur-[160px]"
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
            <Activity className="text-blue-400" size={24} />
            Centro de Turno
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 capitalize">{fechaActual()}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <Clock size={14} className="text-slate-400" />
            <span className="text-xs text-slate-300 font-mono">{horaRefresh}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl px-4 py-2.5 font-semibold text-white flex items-center gap-2 text-sm transition-all"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Sección 1 — KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Coches Activos"
          value={cochesActivos}
          icon={<Bus size={20} />}
          color="verde"
          loading={loadingVehiculos}
        />
        <KpiCard
          label="En Taller"
          value={cochesEnTaller}
          icon={<Wrench size={20} />}
          color="amarillo"
          loading={loadingVehiculos}
        />
        <KpiCard
          label="Desvíos sin Resolver"
          value={desviosSinResolver}
          icon={<AlertTriangle size={20} />}
          color={desviosSinResolver > 0 ? 'rojo' : 'verde'}
          loading={loadingDesvios}
        />
        <KpiCard
          label="Incidencias Abiertas"
          value={incidenciasAbiertas}
          icon={<Siren size={20} />}
          color={incidenciasAbiertas > 0 ? 'naranja' : 'verde'}
          loading={loadingIncidencias}
        />
      </div>

      {/* ── Secciones 2 + 3 — Dos columnas ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Sección 2 — Desvíos activos (2/3) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" />
              Alertas de Desvío Activas
            </h2>
            {!loadingDesvios && (
              <span className="text-xs text-slate-500">
                {desvios.length === 0 ? 'Sin alertas' : `${desvios.length} pendiente${desvios.length > 1 ? 's' : ''}`}
              </span>
            )}
          </div>

          {loadingDesvios ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-800/60 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : desvios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <CheckCircle size={36} className="text-emerald-400" />
              <p className="text-emerald-400 font-medium">No hay desvíos activos — operación normal</p>
              <p className="text-xs text-slate-500">Todos los coches siguen sus recorridos habituales</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {desvios.map(ev => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/40 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {tipoBadge(ev.tipo)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        Coche {ev.coche_id} · Línea {ev.linea_id}
                      </p>
                      <p className="text-xs text-slate-400">
                        {ev.metros_fuera ? `${ev.metros_fuera} m fuera · ` : ''}
                        {tiempoAtras(ev.timestamp)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => resolverDesvio(ev.id)}
                    disabled={resolviendoId === ev.id}
                    className="shrink-0 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <CheckCircle size={13} />
                    {resolviendoId === ev.id ? 'Resolviendo…' : 'Resolver'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección 3 — Incidencias (1/3) */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Siren size={18} className="text-orange-400" />
            Incidencias
          </h2>

          {loadingIncidencias ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-800/60 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : incidencias.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle size={28} className="text-emerald-400" />
              <p className="text-sm text-emerald-400 font-medium text-center">Sin incidencias abiertas</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {incidencias.map(inc => (
                <div
                  key={inc.id}
                  className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-200 leading-tight">{inc.titulo}</p>
                    {prioridadBadge(inc.prioridad)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {inc.coche_id && (
                      <span className="text-xs text-slate-400">Coche {inc.coche_id}</span>
                    )}
                    {inc.linea_id && (
                      <span className="text-xs text-slate-400">· Línea {inc.linea_id}</span>
                    )}
                    <span className="text-xs text-slate-500 ml-auto">{tiempoAtras(inc.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sección 4 — Accesos rápidos ──────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Zap size={18} className="text-blue-400" />
          Accesos Rápidos
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {accesos.map(acc => (
            <Link
              key={acc.to}
              to={acc.to}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-xl px-3 py-4 flex flex-col items-center gap-2 text-slate-300 hover:text-white transition-all group"
            >
              <span className="text-blue-400 group-hover:text-blue-300 transition-colors">
                {acc.icon}
              </span>
              <span className="text-xs font-medium text-center leading-tight">{acc.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CentroTurnoDashboard;
