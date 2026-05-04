/**
 * CentroMandoUnificado.tsx — Dashboard ejecutivo SUPERADMIN
 * ==========================================================
 * Vista exclusiva para el super-administrador de la plataforma.
 * Muestra el estado de los 4 operadores del sistema metropolitano
 * de Montevideo en tiempo real con KPIs cross-empresa.
 *
 * Operadores: UCOT (70), CUTCSA (50), COME (20), COETC (10)
 * Datos: compliance_alerts + vehiculos + vehicle_events
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Lock,
  TrendingUp,
  Bus,
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  BarChart3,
  Network,
  Clock,
  Radio,
} from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EmpresaConfig {
  id: number;
  label: string;
  labelCorto: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  colorBadge: string;
}

interface ComplianceAlerta {
  id: string;
  empresa?: number;
  linea?: string;
  pctEnTiempo?: number;
  dismissed?: boolean;
  createdAt?: { seconds: number } | Date | null;
  tipo?: string;
  descripcion?: string;
}

interface VehiculoDoc {
  agencyId?: number | string;
  empresa?: number | string;
  state?: string;
  estado?: string;
  estado_operativo?: string;
  activo?: boolean;
}

interface VehicleEvent {
  id: string;
  empresa?: number;
  agencyId?: number;
  tipo?: string;
  descripcion?: string;
  timestamp?: { seconds: number } | Date | null;
  linea?: string;
}

interface EstadoEmpresa {
  codigo: number;
  totalVehiculos: number;
  vehiculosActivos: number;
  alertasActivas: ComplianceAlerta[];
  otpPromedio: number | null;
  top3LineasPeorOtp: { linea: string; otp: number }[];
  expandido: boolean;
}

// ── Configuración de empresas ──────────────────────────────────────────────

const EMPRESAS: EmpresaConfig[] = [
  {
    id: 70,
    label: 'UCOT',
    labelCorto: 'UCOT',
    color: 'blue',
    colorBg: 'bg-blue-500/10',
    colorBorder: 'border-blue-500/30',
    colorText: 'text-blue-400',
    colorBadge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  },
  {
    id: 50,
    label: 'CUTCSA',
    labelCorto: 'CUTCSA',
    color: 'violet',
    colorBg: 'bg-violet-500/10',
    colorBorder: 'border-violet-500/30',
    colorText: 'text-violet-400',
    colorBadge: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
  },
  {
    id: 20,
    label: 'COME',
    labelCorto: 'COME',
    color: 'emerald',
    colorBg: 'bg-emerald-500/10',
    colorBorder: 'border-emerald-500/30',
    colorText: 'text-emerald-400',
    colorBadge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  },
  {
    id: 10,
    label: 'COETC',
    labelCorto: 'COETC',
    color: 'orange',
    colorBg: 'bg-orange-500/10',
    colorBorder: 'border-orange-500/30',
    colorText: 'text-orange-400',
    colorBadge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatHaceMinutos(ts: { seconds: number } | Date | null | undefined): string {
  if (!ts) return '—';
  const date = ts instanceof Date ? ts : new Date((ts as { seconds: number }).seconds * 1000);
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff === 1) return 'hace 1 min';
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  return `hace ${h}h`;
}

function semaforo(otp: number | null): { color: string; label: string; dot: string } {
  if (otp === null) return { color: 'text-slate-500', label: 'Sin datos', dot: 'bg-slate-600' };
  if (otp >= 85) return { color: 'text-emerald-400', label: 'Óptimo', dot: 'bg-emerald-400' };
  if (otp >= 70) return { color: 'text-amber-400', label: 'Regular', dot: 'bg-amber-400' };
  return { color: 'text-red-400', label: 'Crítico', dot: 'bg-red-400' };
}

function isVehiculoActivo(v: VehiculoDoc): boolean {
  if (v.activo === true) return true;
  const s = (v.state || v.estado || v.estado_operativo || '').toLowerCase();
  return s === 'activo' || s === 'en_servicio' || s === 'en servicio' || s === 'disponible';
}

// ── Componente principal ───────────────────────────────────────────────────

export default function CentroMandoUnificado() {
  const { user } = useAuth();

  // Guard de acceso SUPERADMIN (case-insensitive)
  const esSuperAdmin = (user?.role ?? '').toLowerCase() === 'superadmin';
  if (!esSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Lock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">Acceso restringido a SUPERADMIN</p>
          <p className="text-slate-600 text-sm mt-1">
            Tu rol actual ({user?.role || 'USER'}) no tiene permiso para esta vista.
          </p>
        </div>
      </div>
    );
  }

  const [estadoEmpresas, setEstadoEmpresas] = useState<Record<number, EstadoEmpresa>>({});
  const [eventosRecientes, setEventosRecientes] = useState<VehicleEvent[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // Cargar datos de todas las empresas en paralelo
      const resultados = await Promise.allSettled(
        EMPRESAS.map(async (empresa) => {
          // compliance_alerts activas de esta empresa — dos queries por tipo de campo
          const [snapNum, snapStr] = await Promise.all([
            getDocs(query(
              collection(db, 'compliance_alerts'),
              where('dismissed', '==', false),
              where('empresa', '==', empresa.id),
              limit(100),
            )),
            getDocs(query(
              collection(db, 'compliance_alerts'),
              where('dismissed', '==', false),
              where('empresa', '==', String(empresa.id)),
              limit(100),
            )),
          ]);
          const seenIds = new Set<string>();
          const alertasEmpresa: ComplianceAlerta[] = [];
          for (const snap of [snapNum, snapStr]) {
            for (const d of snap.docs) {
              if (!seenIds.has(d.id)) {
                seenIds.add(d.id);
                alertasEmpresa.push({ id: d.id, ...(d.data() as Omit<ComplianceAlerta, 'id'>) } as ComplianceAlerta);
              }
            }
          }

          // Calcular OTP promedio
          const alertasConOtp = alertasEmpresa.filter(
            (a) => typeof a.pctEnTiempo === 'number' && !isNaN(a.pctEnTiempo),
          );
          const otpPromedio =
            alertasConOtp.length > 0
              ? Math.round(
                  alertasConOtp.reduce((s, a) => s + (a.pctEnTiempo ?? 0), 0) /
                    alertasConOtp.length,
                )
              : null;

          // Top 3 líneas con peor OTP
          const porLinea: Record<string, number[]> = {};
          alertasConOtp.forEach((a) => {
            const linea = a.linea ?? 'Sin línea';
            if (!porLinea[linea]) porLinea[linea] = [];
            porLinea[linea].push(a.pctEnTiempo ?? 0);
          });
          const top3 = Object.entries(porLinea)
            .map(([linea, vals]) => ({
              linea,
              otp: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
            }))
            .sort((a, b) => a.otp - b.otp)
            .slice(0, 3);

          // Vehículos de esta empresa (OR string/number — type mismatch Firestore)
          let totalVehiculos = 0;
          let vehiculosActivos = 0;
          try {
            const [vSnapNum, vSnapStr] = await Promise.all([
              getDocs(query(collection(db, 'vehiculos'), where('agencyId', '==', empresa.id))),
              getDocs(query(collection(db, 'vehiculos'), where('agencyId', '==', String(empresa.id)))),
            ]);
            const seenVehs = new Set<string>();
            const allVehs: VehiculoDoc[] = [];
            for (const snap of [vSnapNum, vSnapStr]) {
              for (const d of snap.docs) {
                if (!seenVehs.has(d.id)) {
                  seenVehs.add(d.id);
                  allVehs.push(d.data() as VehiculoDoc);
                }
              }
            }
            totalVehiculos = allVehs.length;
            vehiculosActivos = allVehs.filter(isVehiculoActivo).length;
          } catch {
            // Vehículos no disponibles para esta empresa
          }

          return {
            codigo: empresa.id,
            totalVehiculos,
            vehiculosActivos,
            alertasActivas: alertasEmpresa.slice(0, 20),
            otpPromedio,
            top3LineasPeorOtp: top3,
            expandido: estadoEmpresas[empresa.id]?.expandido ?? false,
          } as EstadoEmpresa;
        }),
      );

      const nuevoEstado: Record<number, EstadoEmpresa> = {};
      resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          nuevoEstado[EMPRESAS[i].id] = r.value;
        } else {
          // Empresa sin datos disponibles
          nuevoEstado[EMPRESAS[i].id] = {
            codigo: EMPRESAS[i].id,
            totalVehiculos: 0,
            vehiculosActivos: 0,
            alertasActivas: [],
            otpPromedio: null,
            top3LineasPeorOtp: [],
            expandido: estadoEmpresas[EMPRESAS[i].id]?.expandido ?? false,
          };
        }
      });
      setEstadoEmpresas(nuevoEstado);

      // Eventos recientes: vehicle_events + compliance_alerts más recientes
      try {
        const evQuery = query(
          collection(db, 'vehicle_events'),
          orderBy('timestamp', 'desc'),
          limit(10),
        );
        const evSnap = await getDocs(evQuery);
        const eventos = evSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<VehicleEvent, 'id'>),
        })) as VehicleEvent[];
        setEventosRecientes(eventos);
      } catch {
        // vehicle_events no disponible
        setEventosRecientes([]);
      }

      setUltimaActualizacion(new Date());
    } catch (err) {
      console.error('[CentroMandoUnificado] Error cargando datos:', err);
    } finally {
      setCargando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarDatos();
    const interval = setInterval(cargarDatos, 60000);
    return () => clearInterval(interval);
  }, [cargarDatos]);

  const toggleExpandir = (codigo: number) => {
    setEstadoEmpresas((prev) => ({
      ...prev,
      [codigo]: {
        ...prev[codigo],
        expandido: !prev[codigo]?.expandido,
      },
    }));
  };

  // Métricas globales calculadas
  const totalBusesActivos = Object.values(estadoEmpresas).reduce(
    (s, e) => s + e.vehiculosActivos,
    0,
  );
  const totalAlertasActivas = Object.values(estadoEmpresas).reduce(
    (s, e) => s + e.alertasActivas.length,
    0,
  );
  const lineasCriticas = Object.values(estadoEmpresas).flatMap((e) =>
    e.top3LineasPeorOtp.filter((l) => l.otp < 70),
  );

  // Ranking de operadores por OTP
  const rankingOperadores = EMPRESAS.map((emp) => ({
    ...emp,
    estado: estadoEmpresas[emp.id],
  }))
    .filter((e) => e.estado)
    .sort((a, b) => {
      const otpA = a.estado?.otpPromedio ?? -1;
      const otpB = b.estado?.otpPromedio ?? -1;
      return otpB - otpA;
    });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-blue-700/5 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-violet-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-200">
                  Centro de Mando Unificado
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
                  SUPERADMIN
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Sistema Metropolitano de Montevideo — 4 operadores — tiempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {ultimaActualizacion && (
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Act. {ultimaActualizacion.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={cargarDatos}
              disabled={cargando}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-semibold text-slate-300 transition-colors disabled:opacity-50"
            >
              {cargando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Actualizar
            </button>
          </div>
        </div>

        {/* ── Sección 4 — KPIs globales ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Bus className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-500 uppercase tracking-widest">Buses activos</span>
            </div>
            <div className="text-3xl font-black text-white">
              {cargando ? <Loader2 className="w-6 h-6 animate-spin text-slate-600" /> : totalBusesActivos}
            </div>
            <p className="text-xs text-slate-500 mt-1">en toda la red</p>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-500 uppercase tracking-widest">Alertas OTP</span>
            </div>
            <div className="text-3xl font-black text-white">
              {cargando ? <Loader2 className="w-6 h-6 animate-spin text-slate-600" /> : totalAlertasActivas}
            </div>
            <p className="text-xs text-slate-500 mt-1">activas en la red</p>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-red-400" />
              <span className="text-xs text-slate-500 uppercase tracking-widest">Líneas críticas</span>
            </div>
            <div className="text-3xl font-black text-white">
              {cargando ? <Loader2 className="w-6 h-6 animate-spin text-slate-600" /> : lineasCriticas.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">OTP &lt; 70%</p>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Network className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-500 uppercase tracking-widest">Operadores</span>
            </div>
            <div className="text-3xl font-black text-white">4</div>
            <p className="text-xs text-slate-500 mt-1">UCOT · CUTCSA · COME · COETC</p>
          </div>
        </div>

        {/* ── Sección 1 — Cards por empresa ────────────────────────────── */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest font-black mb-3 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" />
            Estado por operador
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {EMPRESAS.map((empresa) => {
              const estado = estadoEmpresas[empresa.id];
              const sem = semaforo(estado?.otpPromedio ?? null);
              const exp = estado?.expandido ?? false;

              return (
                <div
                  key={empresa.id}
                  className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${empresa.colorBorder}`}
                >
                  {/* Card header */}
                  <div className={`p-5 ${empresa.colorBg}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${empresa.colorBadge}`}
                          >
                            {empresa.labelCorto}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${sem.dot} animate-pulse`}
                            title={sem.label}
                          />
                        </div>
                        <p className={`text-xs mt-1 ${empresa.colorText} font-semibold`}>
                          {sem.label}
                        </p>
                      </div>
                      {estado?.otpPromedio !== null && estado?.otpPromedio !== undefined ? (
                        <div className="text-right">
                          <div className={`text-2xl font-black ${sem.color}`}>
                            {estado.otpPromedio}%
                          </div>
                          <p className="text-xs text-slate-500">OTP prom.</p>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-600">—</div>
                          <p className="text-xs text-slate-600">Sin datos</p>
                        </div>
                      )}
                    </div>

                    {/* KPIs fila */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <div className="text-lg font-black text-white">
                          {cargando ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-600 mx-auto" />
                          ) : (
                            estado?.alertasActivas.length ?? 0
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">alertas</p>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-black text-white">
                          {cargando ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-600 mx-auto" />
                          ) : estado?.totalVehiculos ? (
                            estado.vehiculosActivos
                          ) : (
                            <span className="text-slate-600 text-sm">—</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">activos</p>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-black text-white">
                          {cargando ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-600 mx-auto" />
                          ) : estado?.totalVehiculos ? (
                            estado.totalVehiculos
                          ) : (
                            <span className="text-slate-600 text-sm" title="Sin datos de flota cargados">—</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">total flota</p>
                      </div>
                    </div>
                  </div>

                  {/* Botón expandir */}
                  <button
                    onClick={() => toggleExpandir(empresa.id)}
                    className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors border-t border-slate-700/50"
                  >
                    <span>Ver detalles</span>
                    {exp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {/* Panel expandido */}
                  {exp && (
                    <div className="px-5 pb-4 space-y-4 border-t border-slate-700/30">
                      {/* Top 3 líneas peor OTP */}
                      <div className="pt-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Peor OTP por línea
                        </p>
                        {estado?.top3LineasPeorOtp.length === 0 ? (
                          <p className="text-xs text-slate-600">Sin datos de líneas</p>
                        ) : (
                          <div className="space-y-1.5">
                            {estado?.top3LineasPeorOtp.map((l) => {
                              const ls = semaforo(l.otp);
                              return (
                                <div key={l.linea} className="flex items-center justify-between">
                                  <span className="text-xs text-slate-400 truncate max-w-[100px]">
                                    Línea {l.linea}
                                  </span>
                                  <span className={`text-xs font-bold ${ls.color}`}>{l.otp}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Últimas 3 alertas */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Alertas recientes
                        </p>
                        {estado?.alertasActivas.length === 0 ? (
                          <p className="text-xs text-slate-600">Sin alertas activas</p>
                        ) : (
                          <div className="space-y-1.5">
                            {estado?.alertasActivas.slice(0, 3).map((a) => (
                              <div
                                key={a.id}
                                className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-300 truncate">
                                    {a.tipo || 'Alerta OTP'}{a.linea ? ` · L.${a.linea}` : ''}
                                  </span>
                                  {a.pctEnTiempo !== undefined && (
                                    <span
                                      className={`font-bold shrink-0 ${semaforo(a.pctEnTiempo).color}`}
                                    >
                                      {a.pctEnTiempo}%
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-600 mt-0.5">
                                  {formatHaceMinutos(a.createdAt)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Sección 2 — Ranking comparativo ───────────────────────────── */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest font-black mb-3 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Ranking de operadores
          </h2>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    #
                  </th>
                  <th className="text-left text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    Empresa
                  </th>
                  <th className="text-right text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    Flota activa
                  </th>
                  <th className="text-right text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    OTP %
                  </th>
                  <th className="text-right text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    Alertas
                  </th>
                  <th className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-black px-5 py-3">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankingOperadores.map((op, idx) => {
                  const estado = op.estado;
                  const sem = semaforo(estado?.otpPromedio ?? null);
                  const esPeor =
                    idx === rankingOperadores.length - 1 &&
                    estado?.otpPromedio !== null;

                  return (
                    <tr
                      key={op.id}
                      className={`border-b border-slate-700/30 last:border-0 transition-colors hover:bg-slate-800/30 ${esPeor ? 'bg-red-500/5' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-slate-500 text-sm font-bold">{idx + 1}</span>
                        {idx === 0 && (
                          <span className="ml-1 text-xs">🏆</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-bold ${op.colorText}`}>{op.label}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm text-white font-semibold">
                          {estado?.vehiculosActivos ?? '—'}
                        </span>
                        {estado && estado.totalVehiculos > 0 && (
                          <span className="text-xs text-slate-500 ml-1">
                            / {estado.totalVehiculos}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`text-sm font-black ${sem.color}`}>
                          {estado?.otpPromedio !== null && estado?.otpPromedio !== undefined
                            ? `${estado.otpPromedio}%`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`text-sm font-semibold ${
                            (estado?.alertasActivas.length ?? 0) > 5
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {estado?.alertasActivas.length ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${sem.dot}`} />
                          <span className={`text-xs font-semibold ${sem.color}`}>
                            {sem.label}
                          </span>
                          {esPeor && (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" title="Peor OTP de la red" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rankingOperadores.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500 text-sm">
                      {cargando ? 'Cargando datos...' : 'Sin datos disponibles'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Sección 3 — Actividad reciente ────────────────────────────── */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest font-black mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Actividad reciente del sistema
          </h2>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl divide-y divide-slate-700/30">
            {cargando ? (
              <div className="px-5 py-8 flex items-center justify-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando eventos...
              </div>
            ) : eventosRecientes.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-500 text-sm">
                Sin eventos recientes en vehicle_events
              </div>
            ) : (
              eventosRecientes.map((ev) => {
                // Detectar empresa del evento
                const empId =
                  typeof ev.empresa === 'number'
                    ? ev.empresa
                    : typeof ev.agencyId === 'number'
                    ? ev.agencyId
                    : null;
                const empCfg = EMPRESAS.find((e) => e.id === empId);

                return (
                  <div key={ev.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-xs text-slate-500 shrink-0 w-20">
                      {formatHaceMinutos(ev.timestamp)}
                    </span>
                    {empCfg ? (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${empCfg.colorBadge}`}
                      >
                        {empCfg.labelCorto}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-700/50 text-slate-400 shrink-0">
                        SYS
                      </span>
                    )}
                    <span className="text-xs text-slate-400 truncate">
                      {ev.tipo && <span className="text-slate-300 font-semibold">{ev.tipo} · </span>}
                      {ev.descripcion || ev.linea || ev.id}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
          <p className="text-xs text-slate-600">
            SkillRoute · Centro de Mando Unificado · SUPERADMIN
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-600">
              Auto-refresh cada 60s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
