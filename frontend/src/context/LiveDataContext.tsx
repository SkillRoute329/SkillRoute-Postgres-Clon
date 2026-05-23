/**
 * LiveDataContext.tsx — Tejido conector del Centro de Mando (FASE 4.3)
 *
 * REGLA -6: 100% sobre el clon. Sin Firebase, sin cloud functions.
 *
 * REGLA -1 NO REGRESIÓN: la API pública `useLiveData()` mantiene la misma
 * estructura (`buses`, `fleetKPIs`, `alertas`, `otpHoy`, `otpSeries`,
 * `selectedLine`, `selectedOperator`, etc.) para que los módulos que la
 * consumen sigan funcionando sin cambios.
 *
 * Fuentes (todas del clon):
 *   - GET /api/audit/buses-active?agency=N&minutes=5  → buses por agencia
 *   - GET /api/audit/coverage?agency=N&from&to        → OTP histórico
 *   - GET /api/db/alertas_regulacion (poll cada 15s) → alertas en tiempo real
 *
 * Las alertas usan polling cada 15s vía /api/db/alertas_regulacion. Cuando
 * el backend emita el evento Socket.io 'firestore:alertas_regulacion',
 * el shim ya tiene la lógica para forzar refresh inmediato — acá no hace
 * falta agregar nada extra.
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
import { useAuth } from './AuthContext';
import { apiClient } from '../clients/apiClient';
import { on as socketOn } from '../clients/socketClient';

// ── Tipos públicos (idénticos al contexto anterior — no regresión) ──────────

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  perEmpresa: Record<number, number>;
  totalRed: number;
}

export interface LiveDataState {
  buses: BusLive[];
  fleetKPIs: FleetKPIs;
  busesLoading: boolean;
  busesLastUpdate: Date | null;
  alertas: AlertaViva[];
  alertasCriticas: number;
  otpHoy: number | null;
  otpSeries: OtpPoint[];
  selectedLine: string | null;
  setSelectedLine: (line: string | null) => void;
  selectedOperator: string;
  setSelectedOperator: (op: string) => void;
}

const LiveDataContext = createContext<LiveDataState | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────

const AGENCIES = [70, 50, 20, 10]; // UCOT, CUTCSA, COME, COETC
const AGENCY_NAMES: Record<number, string> = {
  70: 'UCOT',
  50: 'CUTCSA',
  20: 'COME',
  10: 'COETC',
};

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

interface BusActiveResponse {
  agency: string;
  ventana_minutos: number;
  total_buses_activos: number;
  buses: Array<{
    id_bus: string;
    linea: string;
    lat: number;
    lon: number;
    velocidad: number;
    estado_cumplimiento: string;
    timestamp_gps: string;
  }>;
}

// ── Proveedor ──────────────────────────────────────────────────────────────

export function LiveDataProvider({ children }: { children: ReactNode }): JSX.Element {
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
  // FASE 5.35 (2026-05-22): persistir el operador seleccionado en localStorage
  // para que el filtro se recuerde entre pantallas y entre sesiones.
  const [selectedOperator, setSelectedOperatorRaw] = useState<string>(() => {
    try { return localStorage.getItem('skillroute_selected_operator') || '70'; }
    catch { return '70'; }
  });
  const setSelectedOperator = useCallback((op: string) => {
    setSelectedOperatorRaw(op);
    try { localStorage.setItem('skillroute_selected_operator', op); } catch { /* */ }
  }, []);

  const busIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertasIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch buses (clon, 4 agencias en paralelo) ─────────────────────────

  const fetchBuses = useCallback(async () => {
    try {
      const responses = await Promise.allSettled(
        AGENCIES.map((agency) =>
          apiClient.get<BusActiveResponse>('/api/audit/buses-active', {
            query: { agency, minutes: 5 },
          }),
        ),
      );

      const allBuses: BusLive[] = [];
      for (let i = 0; i < AGENCIES.length; i++) {
        const r = responses[i];
        if (r.status !== 'fulfilled' || !r.value.data) continue;
        const agencyNum = AGENCIES[i]!;
        const empresa = AGENCY_NAMES[agencyNum] ?? String(agencyNum);
        for (const b of r.value.data.buses) {
          allBuses.push({
            idBus: b.id_bus,
            codigoBus: b.id_bus,
            linea: b.linea ?? '',
            sublinea: null,
            destino: '',
            lat: b.lat,
            lng: b.lon,
            empresaId: agencyNum,
            empresa,
            timestamp: b.timestamp_gps,
          });
        }
      }

      setBuses(allBuses);
      setBusesLastUpdate(new Date());

      const agencyId = parseInt(selectedOperator, 10);
      const propios = allBuses.filter((b) => b.empresaId === agencyId);
      const lineasActivas = new Set(propios.map((b) => b.linea).filter(Boolean)).size;

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[LiveData] fetchBuses error', err);
    } finally {
      setBusesLoading(false);
    }
  }, [selectedOperator]);

  // ── Fetch OTP (cobertura por día, derivada de poller_health) ───────────

  const fetchOtp = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await apiClient.get<{
        from: string;
        to: string;
        agency: string;
        pct_cobertura_promedio: number;
        dias: Array<{ fecha: string; pct_cobertura_estimado: number; ciclos_total: number }>;
      }>('/api/audit/coverage', {
        query: { agency: selectedOperator, from: sevenDaysAgo, to: today },
      });
      if (!res.data?.dias) return;
      const series: OtpPoint[] = res.data.dias.map((d) => ({
        date: typeof d.fecha === 'string' ? d.fecha : String(d.fecha),
        value: Number(d.pct_cobertura_estimado) || 0,
        total: Number(d.ciclos_total) || 0,
      }));
      setOtpSeries(series);
      const hoy = series.find((s) => s.date === today) ?? series[series.length - 1];
      setOtpHoy(hoy?.value ?? null);
    } catch {
      // Silencioso
    }
  }, [selectedOperator]);

  // ── Fetch alertas (polling al clon vía /api/db/alertas_regulacion) ─────

  const fetchAlertas = useCallback(async () => {
    try {
      const res = await apiClient.get<Array<Record<string, unknown>>>('/api/db/alertas_regulacion', {
        query: { orderBy: 'timestamp:desc', limit: 30 },
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      const docs: AlertaViva[] = rows.map((r) => ({
        id: String(r.id ?? ''),
        tipo: String(r.tipo ?? ''),
        titulo: r.titulo as string | undefined,
        mensaje: r.mensaje as string | undefined,
        lineaId: (r.linea_id as string) ?? null,
        urgencia: r.urgencia as AlertaViva['urgencia'],
        timestamp: r.timestamp,
        leido: (r.atendida as boolean) ?? false,
      }));
      setAlertas(docs);
      setAlertasCriticas(
        docs.filter((a) => !a.leido && (a.urgencia === 'critica' || a.urgencia === 'alta')).length,
      );
    } catch {
      // Silencioso
    }
  }, []);

  // ── Efectos: iniciar loops ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    void fetchBuses();
    void fetchOtp();
    void fetchAlertas();
    busIntervalRef.current = setInterval(fetchBuses, 30_000);
    otpIntervalRef.current = setInterval(fetchOtp, 5 * 60_000);
    alertasIntervalRef.current = setInterval(fetchAlertas, 15_000);
    return () => {
      if (busIntervalRef.current) clearInterval(busIntervalRef.current);
      if (otpIntervalRef.current) clearInterval(otpIntervalRef.current);
      if (alertasIntervalRef.current) clearInterval(alertasIntervalRef.current);
    };
  }, [user, fetchBuses, fetchOtp, fetchAlertas]);

  // Re-fetch al cambiar operador
  useEffect(() => {
    if (!user) return;
    setBusesLoading(true);
    void fetchBuses();
    void fetchOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOperator]);

  // Socket.io: cuando el backend emite alertas en vivo, refresh inmediato
  useEffect(() => {
    if (!user) return;
    const off1 = socketOn('alerta-operativa', () => {
      void fetchAlertas();
    });
    const off2 = socketOn('firestore:alertas_regulacion', () => {
      void fetchAlertas();
    });
    return () => {
      off1();
      off2();
    };
  }, [user, fetchAlertas]);

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

export function useLiveData(): LiveDataState {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData debe usarse dentro de <LiveDataProvider>');
  return ctx;
}
