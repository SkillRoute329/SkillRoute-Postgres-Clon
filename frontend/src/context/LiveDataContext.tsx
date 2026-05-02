/**
 * LiveDataContext — tejido conector del Centro de Mando
 * =======================================================
 * Un único proveedor, montado en DashboardLayout, que alimenta
 * a TODOS los módulos con:
 *  - Buses en vivo (poll /api/positions cada 30s)
 *  - Alertas activas (Firestore onSnapshot en tiempo real)
 *  - OTP del día y serie 7d (poll /historicOtp cada 5min)
 *  - Contexto de navegación compartido: línea y operador seleccionados
 *
 * Los módulos consumen con useLiveData() en lugar de fetchar por su cuenta.
 * Esto elimina el "re-fetch masivo" y propaga actualizaciones automáticamente.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface BusLive {
  idBus: string;
  codigoBus: string;
  linea: string;
  sublinea: string | null;
  destino: string;
  lat: number;
  lng: number;
  empresaId: number;
  empresa: string;
  timestamp: string;
}

export interface AlertaViva {
  id: string;
  tipo: string;
  titulo?: string;
  mensaje?: string;
  lineaId?: string | null;
  urgencia?: 'critica' | 'alta' | 'media' | 'baja';
  timestamp: any;
  leido?: boolean;
}

export interface OtpPoint {
  date: string;
  value: number;
  total: number;
}

export interface FleetKPIs {
  totalPropios: number;
  totalRivales: number;
  lineasActivas: number;
  bunchingPares: number;
  /** Buses activos por empresaId (todas las empresas de la red) */
  perEmpresa: Record<number, number>;
  /** Total buses en toda la red metropolitana */
  totalRed: number;
}

export interface LiveDataState {
  /** Todos los buses activos en el sistema metropolitano */
  buses: BusLive[];
  /** KPIs calculados para el operador seleccionado */
  fleetKPIs: FleetKPIs;
  busesLoading: boolean;
  busesLastUpdate: Date | null;

  /** Alertas tácticas de la sesión activa (onSnapshot) */
  alertas: AlertaViva[];
  /** Cantidad de alertas críticas o altas no leídas */
  alertasCriticas: number;

  /** OTP del día (GPS-based) — null hasta que cargue */
  otpHoy: number | null;
  /** Serie de los últimos 7 días */
  otpSeries: OtpPoint[];

  /** Línea seleccionada — compartida entre todos los módulos */
  selectedLine: string | null;
  setSelectedLine: (line: string | null) => void;

  /** Operador activo — compartido */
  selectedOperator: string;
  setSelectedOperator: (op: string) => void;
}

// ── Contexto ──────────────────────────────────────────────────────────────────

const LiveDataContext = createContext<LiveDataState | null>(null);

// ── Helper: calcular pares de bunching (< 800 m, misma línea) ─────────────────

function calcBunchingPairs(buses: BusLive[], agencyId: number): number {
  const propios = buses.filter((b) => b.empresaId === agencyId);
  let count = 0;
  for (let i = 0; i < propios.length; i++) {
    for (let j = i + 1; j < propios.length; j++) {
      if (propios[i]!.linea !== propios[j]!.linea) continue;
      const R = 6371;
      const dLat = ((propios[j]!.lat - propios[i]!.lat) * Math.PI) / 180;
      const dLng = ((propios[j]!.lng - propios[i]!.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((propios[i]!.lat * Math.PI) / 180) *
          Math.cos((propios[j]!.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      if (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 0.8) count++;
    }
  }
  return count;
}

// ── Proveedor ─────────────────────────────────────────────────────────────────

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [buses, setBuses] = useState<BusLive[]>([]);
  const [fleetKPIs, setFleetKPIs] = useState<FleetKPIs>({
    totalPropios: 0,
    totalRivales: 0,
    lineasActivas: 0,
    bunchingPares: 0,
    perEmpresa: {},
    totalRed: 0,
  });
  const [busesLoading, setBusesLoading] = useState(true);
  const [busesLastUpdate, setBusesLastUpdate] = useState<Date | null>(null);

  const [alertas, setAlertas] = useState<AlertaViva[]>([]);
  const [alertasCriticas, setAlertasCriticas] = useState(0);

  const [otpHoy, setOtpHoy] = useState<number | null>(null);
  const [otpSeries, setOtpSeries] = useState<OtpPoint[]>([]);

  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState('70');

  const busIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch buses ─────────────────────────────────────────────────────────────

  const fetchBuses = useCallback(async () => {
    try {
      const r = await fetch('/api/positions', { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return;
      const d = await r.json();
      const allBuses = (d.buses ?? []) as BusLive[];
      setBuses(allBuses);
      setBusesLastUpdate(new Date());

      const agencyId = parseInt(selectedOperator, 10);
      const propios = allBuses.filter((b) => b.empresaId === agencyId);
      const lineasActivas = new Set(propios.map((b) => b.linea).filter(Boolean)).size;

      // Conteo por empresa para la vista de red metropolitana
      const perEmpresa: Record<number, number> = {};
      for (const b of allBuses) {
        perEmpresa[b.empresaId] = (perEmpresa[b.empresaId] ?? 0) + 1;
      }

      setFleetKPIs({
        totalPropios: propios.length,
        totalRivales: allBuses.length - propios.length,
        lineasActivas,
        bunchingPares: calcBunchingPairs(allBuses, agencyId),
        perEmpresa,
        totalRed: allBuses.length,
      });
    } catch {
      // Silencioso — fallo de GPS no debe interrumpir otros módulos
    } finally {
      setBusesLoading(false);
    }
  }, [selectedOperator]);

  // ── Fetch OTP ────────────────────────────────────────────────────────────────

  const fetchOtp = useCallback(async () => {
    try {
      const r = await fetch(`/historicOtp?agencyId=${selectedOperator}&days=7`);
      if (!r.ok) return;
      const d = await r.json();
      if (!d.ok || !Array.isArray(d.series) || !d.series.length) return;

      const series: OtpPoint[] = d.series.map((s: any) => ({
        date: s.date as string,
        value: s.value as number,
        total: (s.meta?.total as number) ?? 0,
      }));
      setOtpSeries(series);

      const today = new Date().toISOString().slice(0, 10);
      const hoy = series.find((s) => s.date === today) ?? series[series.length - 1];
      setOtpHoy(hoy?.value ?? null);
    } catch {
      // Silencioso
    }
  }, [selectedOperator]);

  // ── Efectos: iniciar loops ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    fetchBuses();
    fetchOtp();
    busIntervalRef.current = setInterval(fetchBuses, 30_000);
    otpIntervalRef.current = setInterval(fetchOtp, 5 * 60_000);
    return () => {
      if (busIntervalRef.current) clearInterval(busIntervalRef.current);
      if (otpIntervalRef.current) clearInterval(otpIntervalRef.current);
    };
  }, [user, fetchBuses, fetchOtp]);

  // Re-fetchear cuando cambia operador
  useEffect(() => {
    if (!user) return;
    setBusesLoading(true);
    fetchBuses();
    fetchOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOperator]);

  // ── Alertas en tiempo real (Firestore onSnapshot) ────────────────────────────

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'alertas_regulacion'),
      orderBy('timestamp', 'desc'),
      limit(30),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AlertaViva[];
        setAlertas(docs);
        setAlertasCriticas(
          docs.filter((a) => !a.leido && (a.urgencia === 'critica' || a.urgencia === 'alta')).length,
        );
      },
      () => {
        // Sin permisos (conductor sin acceso) — ignorar silenciosamente
      },
    );
    return unsub;
  }, [user]);

  return (
    <LiveDataContext.Provider
      value={{
        buses,
        fleetKPIs,
        busesLoading,
        busesLastUpdate,
        alertas,
        alertasCriticas,
        otpHoy,
        otpSeries,
        selectedLine,
        setSelectedLine,
        selectedOperator,
        setSelectedOperator,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
}

// ── Hook de consumo ───────────────────────────────────────────────────────────

export function useLiveData(): LiveDataState {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData debe usarse dentro de <LiveDataProvider>');
  return ctx;
}
