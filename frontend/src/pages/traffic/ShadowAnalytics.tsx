/**
 * ShadowAnalytics.tsx — Analytics histórico de eventos Shadow
 * =============================================================
 * DIRECTRIZ 2026-04-24: producto nivel internacional.
 *
 * Convierte las alertas acumuladas en `alertas_regulacion` (generadas por
 * shadowDispatcher.ts backend + el radar frontend) en insights de negocio
 * para el pitch y para el operador:
 *   - Dónde y cuándo ocurre el bunching cross-operador
 *   - Qué parejas de líneas pierden más eficiencia por paralelismo
 *   - Patrones horarios (picos de la mañana vs tarde)
 *   - Ranking de "corredores calientes" por frecuencia de eventos
 *
 * Referencia internacional:
 *   - TCRP 100 "Bunching Analysis"
 *   - TfL iBus performance reports
 *   - NYC MTA BusTime historical analytics
 *
 * Data source: colección `alertas_regulacion` (onCreate del backend +
 * frontend ShadowDispatcher). Docs incluyen tipo, coche_id, linea_id,
 * empresa_id, rival_empresa, rival_linea, distancia_metros, timestamp.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import {
  Download,
  TrendingUp,
  Activity,
  AlertTriangle,
  Loader2,
  Clock,
  Swords,
  Gauge,
  CheckCircle2,
  BellRing,
  Timer,
  UserCheck,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface AlertaDoc {
  id: string;
  tipo: string;
  coche_id: string;
  linea_id: string;
  empresa_id?: number | string;
  rival_empresa?: string;
  rival_linea?: string;
  distancia_metros?: number;
  timestamp: Timestamp;
  instruccion?: string;
  fuente?: string;
  // ─── Campos ACK (agregados cuando el conductor acusa recibo) ──────────
  ack_at?: Timestamp | null;
  ack_by_coche_id?: string;
  ack_response_time_sec?: number;
  // ─── Campos FCM (agregados por onAlertaCreated dispatcher) ────────────
  fcmSent?: boolean;
  fcmError?: string;
  fcm_token_resolved_from?: string;
}

// Sólo estas tipos generan push FCM (DriverAlertOverlay.TIPOS_REGULACION).
// Los analíticos de ACK sólo aplican a estos tipos — para info events no
// esperamos que el conductor acuse.
const TIPOS_QUE_GENERAN_PUSH = new Set([
  'RIVAL_PISANDO_TURNO',
  'PELIGRO_BUNCHING',
  'DISPARO_MANUAL',
]);

// ─── Constantes ────────────────────────────────────────────────────────────

const EMPRESA_COLOR: Record<string, string> = {
  UCOT: '#eab308',
  CUTCSA: '#3b82f6',
  COME: '#22c55e',
  COETC: '#ef4444',
};

const EMPRESA_TO_ID: Record<string, string> = {
  UCOT: '70',
  CUTCSA: '50',
  COME: '20',
  COETC: '10',
};

// ─── Componente principal ──────────────────────────────────────────────────

export default function ShadowAnalyticsPage() {
  const [alertas, setAlertas] = useState<AlertaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState<number>(7);
  const [filterEmpresa, setFilterEmpresa] = useState<string>(''); // id numérico
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = Timestamp.fromMillis(Date.now() - daysBack * 24 * 3600 * 1000);
      const q = query(
        collection(db, 'alertas_regulacion'),
        where('timestamp', '>=', since),
        orderBy('timestamp', 'desc'),
        limit(10000),
      );
      const snap = await getDocs(q);
      const list: AlertaDoc[] = [];
      for (const doc of snap.docs) {
        list.push({ id: doc.id, ...doc.data() } as AlertaDoc);
      }
      setAlertas(list);
      setLastLoadedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  // Auth guard — esperar a que el usuario esté autenticado antes de hacer
  // queries a Firestore. Sin esto hay race condition en el primer render:
  // el query corre antes de que AuthContext propague el user y Firestore
  // rechaza con permission-denied.
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return; // esperar auth
    load();
    // Refresh automatico cada 60s para que el dashboard no quede estatico
    // mientras el usuario lo tiene abierto. Production-grade.
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load, user]);

  // ── Filtrado por empresa propia ────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!filterEmpresa) return alertas;
    return alertas.filter((a) => String(a.empresa_id ?? '') === filterEmpresa);
  }, [alertas, filterEmpresa]);

  // ── KPIs ───────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = filtered.length;
    const criticos = filtered.filter((a) => a.tipo === 'RIVAL_PISANDO_TURNO').length;
    // Filtrar lineas vacias/null para no contar undefined como 1.
    const lineas = new Set<string>();
    for (const a of filtered) {
      if (a.linea_id && String(a.linea_id).trim() !== '') {
        lineas.add(String(a.linea_id));
      }
    }
    const operadoresInvolucrados = new Set<string>();
    for (const a of filtered) {
      if (a.empresa_id) operadoresInvolucrados.add(String(a.empresa_id));
      if (a.rival_empresa) operadoresInvolucrados.add(a.rival_empresa);
    }
    return {
      total,
      criticos,
      pctCriticos: total > 0 ? Math.round((criticos / total) * 100) : 0,
      lineasUnicas: lineas.size,
      operadoresInvolucrados: operadoresInvolucrados.size,
    };
  }, [filtered]);

  // Breakdown de eventos por empresa propia (sin filtrar) para que el
  // usuario sepa cuantas alertas hay por cada operador antes de filtrar.
  const breakdownEmpresaPropia = useMemo(() => {
    const counts: Record<string, number> = { '70': 0, '50': 0, '20': 0, '10': 0, otros: 0 };
    for (const a of alertas) {
      const id = String(a.empresa_id ?? '');
      if (id in counts) counts[id]++;
      else counts.otros++;
    }
    return counts;
  }, [alertas]);

  // ── Serie temporal por día (últimos N días) ────────────────────────────

  // Cuando daysBack === 1 agrupamos por HORA (24 buckets) para ver
  // exactamente CUANDO ocurrieron los eventos en el dia.
  // Para 3/7/14/30 dias agrupamos por dia.
  const dailySeries = useMemo(() => {
    if (daysBack === 1) {
      const now = Date.now();
      const byHour = new Map<
        string,
        { date: string; total: number; criticos: number; timestamp: number }
      >();
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now - i * 3600 * 1000);
        d.setMinutes(0, 0, 0);
        const key = `${String(d.getHours()).padStart(2, '0')}:00`;
        byHour.set(key, { date: key, total: 0, criticos: 0, timestamp: d.getTime() });
      }
      for (const a of filtered) {
        const ms = a.timestamp?.toMillis?.() ?? 0;
        if (!ms) continue;
        const eventDate = new Date(ms);
        eventDate.setMinutes(0, 0, 0);
        const key = `${String(eventDate.getHours()).padStart(2, '0')}:00`;
        const entry = byHour.get(key);
        if (!entry) continue;
        if (Math.abs(eventDate.getTime() - entry.timestamp) > 30 * 60 * 1000) continue;
        entry.total += 1;
        if (a.tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
      }
      return [...byHour.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((d) => ({ ...d, dateShort: d.date }));
    }
    const byDay = new Map<string, { date: string; total: number; criticos: number }>();
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, total: 0, criticos: 0 });
    }
    for (const a of filtered) {
      const ms = a.timestamp?.toMillis?.() ?? 0;
      if (!ms) continue;
      const key = new Date(ms).toISOString().slice(0, 10);
      const entry = byDay.get(key);
      if (!entry) continue;
      entry.total += 1;
      if (a.tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
    }
    return [...byDay.values()].map((d) => ({
      ...d,
      dateShort: d.date.slice(5),
    }));
  }, [filtered, daysBack]);

  // ── Distribución por hora del día ──────────────────────────────────────

  const hourlyDistribution = useMemo(() => {
    const counts = new Array(24).fill(0) as number[];
    for (const a of filtered) {
      const ms = a.timestamp?.toMillis?.() ?? 0;
      if (!ms) continue;
      const h = new Date(ms).getHours();
      counts[h] += 1;
    }
    return counts.map((c, h) => ({
      hour: `${String(h).padStart(2, '0')}h`,
      count: c,
      isPeak:
        (h >= 7 && h <= 9) || (h >= 17 && h <= 20),
    }));
  }, [filtered]);

  // ── Top 10 líneas con más eventos ──────────────────────────────────────

  const topLines = useMemo(() => {
    const counts = new Map<string, { linea: string; count: number; criticos: number }>();
    for (const a of filtered) {
      const linea = a.linea_id || '—';
      const entry = counts.get(linea) ?? { linea, count: 0, criticos: 0 };
      entry.count += 1;
      if (a.tipo === 'RIVAL_PISANDO_TURNO') entry.criticos += 1;
      counts.set(linea, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  // ── Top duelos rivales (línea propia ↔ línea rival) ───────────────────

  const topDuelos = useMemo(() => {
    const pairs = new Map<string, {
      lineaPropia: string;
      empresaRival: string;
      lineaRival: string;
      count: number;
      avgDist: number;
      minDist: number;
    }>();
    for (const a of filtered) {
      if (!a.rival_empresa || !a.rival_linea) continue;
      const key = `${a.linea_id}__${a.rival_empresa}-${a.rival_linea}`;
      const dist = typeof a.distancia_metros === 'number' ? a.distancia_metros : 0;
      const entry = pairs.get(key);
      if (entry) {
        entry.count += 1;
        entry.avgDist = (entry.avgDist * (entry.count - 1) + dist) / entry.count;
        if (dist > 0 && (entry.minDist === 0 || dist < entry.minDist)) entry.minDist = dist;
      } else {
        pairs.set(key, {
          lineaPropia: a.linea_id,
          empresaRival: a.rival_empresa,
          lineaRival: a.rival_linea,
          count: 1,
          avgDist: dist,
          minDist: dist,
        });
      }
    }
    return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [filtered]);

  // ── Analytics de ACK Performance ────────────────────────────────────────
  // Sólo aplica a alertas que GENERAN push (TIPOS_QUE_GENERAN_PUSH).
  // Info events no esperamos que el chofer acuse — no cuentan.

  const alertasConPush = useMemo(
    () => filtered.filter((a) => TIPOS_QUE_GENERAN_PUSH.has(a.tipo)),
    [filtered],
  );

  const ackKpis = useMemo(() => {
    const total = alertasConPush.length;
    const pushEnviadas = alertasConPush.filter((a) => a.fcmSent === true).length;
    const pushFallidas = alertasConPush.filter((a) => a.fcmSent === false).length;
    const acusadas = alertasConPush.filter((a) => !!a.ack_at).length;
    const ackRate = total > 0 ? (acusadas / total) * 100 : 0;
    const pushSuccessRate =
      pushEnviadas + pushFallidas > 0
        ? (pushEnviadas / (pushEnviadas + pushFallidas)) * 100
        : 0;
    const ackTimes = alertasConPush
      .filter((a) => typeof a.ack_response_time_sec === 'number')
      .map((a) => a.ack_response_time_sec as number);
    const avgResponseSec =
      ackTimes.length > 0
        ? Math.round(ackTimes.reduce((s, n) => s + n, 0) / ackTimes.length)
        : 0;
    const medianResponseSec = (() => {
      if (ackTimes.length === 0) return 0;
      const sorted = [...ackTimes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
        : sorted[mid]!;
    })();
    return {
      total,
      pushEnviadas,
      pushFallidas,
      acusadas,
      noAcusadas: total - acusadas,
      ackRate,
      pushSuccessRate,
      avgResponseSec,
      medianResponseSec,
    };
  }, [alertasConPush]);

  // ── Top conductores por ack_rate ──────────────────────────────────────
  // Sólo conductores con >= 3 alertas en el período (evitar ranking sesgado
  // por muestras chicas). Orden: ackRate DESC, luego avgResponseSec ASC.

  const topDrivers = useMemo(() => {
    const byDriver = new Map<
      string,
      { cocheId: string; recibidas: number; acusadas: number; totalResponseSec: number }
    >();
    for (const a of alertasConPush) {
      const c = String(a.coche_id ?? '').trim();
      if (!c) continue;
      const entry = byDriver.get(c) ?? {
        cocheId: c,
        recibidas: 0,
        acusadas: 0,
        totalResponseSec: 0,
      };
      entry.recibidas += 1;
      if (a.ack_at) {
        entry.acusadas += 1;
        entry.totalResponseSec += Number(a.ack_response_time_sec ?? 0);
      }
      byDriver.set(c, entry);
    }
    return [...byDriver.values()]
      .filter((d) => d.recibidas >= 3)
      .map((d) => ({
        cocheId: d.cocheId,
        recibidas: d.recibidas,
        acusadas: d.acusadas,
        ackRate: (d.acusadas / d.recibidas) * 100,
        avgResponseSec: d.acusadas > 0 ? Math.round(d.totalResponseSec / d.acusadas) : 0,
      }))
      .sort((a, b) => {
        if (b.ackRate !== a.ackRate) return b.ackRate - a.ackRate;
        return a.avgResponseSec - b.avgResponseSec;
      })
      .slice(0, 20);
  }, [alertasConPush]);

  // ── Histograma de tiempos de respuesta ────────────────────────────────
  // Buckets: 0-5s, 5-15s, 15-30s, 30-60s, 60s+, No ACK

  const responseTimeHistogram = useMemo(() => {
    const buckets = [
      { label: '0-5s', min: 0, max: 5, count: 0, color: '#22c55e' },
      { label: '5-15s', min: 5, max: 15, count: 0, color: '#84cc16' },
      { label: '15-30s', min: 15, max: 30, count: 0, color: '#eab308' },
      { label: '30-60s', min: 30, max: 60, count: 0, color: '#f97316' },
      { label: '60s+', min: 60, max: Infinity, count: 0, color: '#ef4444' },
      { label: 'No ACK', min: -1, max: -1, count: 0, color: '#475569' },
    ];
    for (const a of alertasConPush) {
      if (!a.ack_at) {
        buckets[5]!.count += 1;
        continue;
      }
      const t = Number(a.ack_response_time_sec ?? 0);
      for (let i = 0; i < 5; i++) {
        const b = buckets[i]!;
        if (t >= b.min && t < b.max) {
          b.count += 1;
          break;
        }
      }
    }
    return buckets;
  }, [alertasConPush]);

  // ── Export ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (filtered.length === 0) return;
    const wb = XLSX.utils.book_new();

    const sheet1 = XLSX.utils.json_to_sheet(
      filtered.slice(0, 5000).map((a) => ({
        Fecha: a.timestamp?.toDate?.()?.toLocaleString('es-UY') ?? '',
        Tipo: a.tipo,
        'Coche propio': a.coche_id,
        'Línea propia': a.linea_id,
        'Empresa ID': a.empresa_id ?? '',
        'Empresa rival': a.rival_empresa ?? '',
        'Línea rival': a.rival_linea ?? '',
        'Distancia (m)': a.distancia_metros ?? '',
        Instrucción: a.instruccion ?? '',
        Fuente: a.fuente ?? '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet1, 'Eventos');

    const sheet2 = XLSX.utils.json_to_sheet(
      topDuelos.map((d) => ({
        'Línea propia': d.lineaPropia,
        'Empresa rival': d.empresaRival,
        'Línea rival': d.lineaRival,
        'Eventos totales': d.count,
        'Distancia promedio (m)': Math.round(d.avgDist),
        'Mínima distancia (m)': d.minDist,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet2, 'Top Duelos');

    const sheet3 = XLSX.utils.json_to_sheet(
      dailySeries.map((d) => ({ Día: d.date, Total: d.total, Críticos: d.criticos })),
    );
    XLSX.utils.book_append_sheet(wb, sheet3, 'Serie diaria');

    const sheet4 = XLSX.utils.json_to_sheet(
      hourlyDistribution.map((h) => ({ Hora: h.hour, Eventos: h.count })),
    );
    XLSX.utils.book_append_sheet(wb, sheet4, 'Distribución horaria');

    // Hoja 5: Resumen de ACK Performance
    const sheet5 = XLSX.utils.json_to_sheet([
      { Métrica: 'Alertas con push FCM esperado', Valor: ackKpis.total },
      { Métrica: 'Push entregadas (fcmSent=true)', Valor: ackKpis.pushEnviadas },
      { Métrica: 'Push fallidas (fcmSent=false)', Valor: ackKpis.pushFallidas },
      { Métrica: 'Tasa de éxito FCM (%)', Valor: Math.round(ackKpis.pushSuccessRate * 10) / 10 },
      { Métrica: 'Acuses recibidos', Valor: ackKpis.acusadas },
      { Métrica: 'Sin acuse', Valor: ackKpis.noAcusadas },
      { Métrica: 'Tasa de acuse (%)', Valor: Math.round(ackKpis.ackRate * 10) / 10 },
      { Métrica: 'Tiempo de respuesta promedio (s)', Valor: ackKpis.avgResponseSec },
      { Métrica: 'Tiempo de respuesta mediano (s)', Valor: ackKpis.medianResponseSec },
    ]);
    XLSX.utils.book_append_sheet(wb, sheet5, 'ACK KPIs');

    // Hoja 6: Top conductores por ack_rate
    const sheet6 = XLSX.utils.json_to_sheet(
      topDrivers.map((d, i) => ({
        '#': i + 1,
        Coche: d.cocheId,
        'Alertas recibidas': d.recibidas,
        'Acuses enviados': d.acusadas,
        'Tasa de acuse (%)': Math.round(d.ackRate * 10) / 10,
        'Tiempo respuesta promedio (s)': d.avgResponseSec,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet6, 'Top Conductores ACK');

    // Hoja 7: Distribución de tiempos de respuesta
    const sheet7 = XLSX.utils.json_to_sheet(
      responseTimeHistogram.map((b) => ({
        'Rango de respuesta': b.label,
        Eventos: b.count,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet7, 'Histograma tiempos ACK');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `skillroute-shadow-analytics-${date}.xlsx`);
  }, [
    filtered,
    topDuelos,
    dailySeries,
    hourlyDistribution,
    ackKpis,
    topDrivers,
    responseTimeHistogram,
  ]);

  // ── UI ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando histórico de eventos…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-xl mx-auto bg-red-950/30 border border-red-800/50 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-red-300">Error al cargar eventos</div>
            <div className="text-red-400/80 text-sm mt-1">{error}</div>
            <button
              onClick={load}
              className="mt-3 px-3 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-200 rounded text-xs"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-800 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-amber-400 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="w-8 h-8 text-fuchsia-400" />
            Analytics Shadow — Histórico de competencia
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Análisis retrospectivo de eventos de bunching y competencia cross-operador
            detectados por el Radar Shadow. Insights para optimización operacional y
            pitch comercial. Base metodológica: TCRP 100 (Bunching Analysis) + TfL iBus
            performance reports.
          </p>
          {lastLoadedAt && (
            <div className="text-xs text-slate-600 mt-2">
              {filtered.length.toLocaleString('es-UY')} eventos cargados · sincronizado {lastLoadedAt.toLocaleTimeString('es-UY')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            title="Rango temporal"
          >
            <option value={1}>Últimas 24h</option>
            <option value={3}>Últimos 3 días</option>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <select
            value={filterEmpresa}
            onChange={(e) => setFilterEmpresa(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            title="Empresa propia"
          >
            <option value="">Todos los operadores</option>
            <option value="70">UCOT</option>
            <option value="50">CUTCSA</option>
            <option value="20">COME</option>
            <option value="10">COETC</option>
          </select>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white font-bold rounded-lg text-sm shadow-lg disabled:opacity-50"
            title="Exportar a Excel (4 hojas)"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Distribucion de alertas por empresa propia. Siempre visible para
          que el usuario sepa que hay en la base antes de filtrar. */}
      <div className="mb-4 bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
          Alertas por operador propio:
        </span>
        {[
          { id: '70', label: 'UCOT' },
          { id: '50', label: 'CUTCSA' },
          { id: '20', label: 'COME' },
          { id: '10', label: 'COETC' },
        ].map(({ id, label }) => {
          const count = breakdownEmpresaPropia[id] ?? 0;
          return (
            <span
              key={id}
              className={`px-2 py-1 rounded-lg border ${count > 0 ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300' : 'border-slate-700 bg-slate-800/40 text-slate-600'}`}
            >
              {label}:{' '}
              <span className="font-mono font-black">
                {count.toLocaleString('es-UY')}
              </span>
            </span>
          );
        })}
      </div>

      {/* Banner explicativo cuando el filtro deja todo en cero */}
      {filterEmpresa && filtered.length === 0 && alertas.length > 0 && (
        <div className="mb-4 bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-amber-300 font-bold">
                No hay alertas con este operador como propio
              </p>
              <p className="text-slate-400 mt-1 text-xs leading-relaxed">
                El backend de detección (Radar Sombra) hoy genera alertas
                considerando UCOT como operador propio (
                {breakdownEmpresaPropia['70'].toLocaleString('es-UY')} eventos)
                y los demás operadores aparecen sólo como rivales en esos
                eventos. Para análisis cross-operador real, ver el módulo{' '}
                <a
                  href="/dashboard/traffic/corridor-intelligence"
                  className="text-fuchsia-400 hover:underline"
                >
                  Inteligencia de Corredores
                </a>{' '}
                (matriz DRO simétrica).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Eventos totales</div>
          <div className="text-3xl font-bold text-fuchsia-400 mt-1">{kpis.total.toLocaleString('es-UY')}</div>
          <div className="text-[10px] text-slate-600 mt-1">ventana de {daysBack} día{daysBack > 1 ? 's' : ''}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Eventos críticos</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{kpis.criticos.toLocaleString('es-UY')}</div>
          <div className="text-[10px] text-slate-600 mt-1">{kpis.pctCriticos}% del total (RIVAL_PISANDO_TURNO)</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Líneas afectadas</div>
          <div className="text-3xl font-bold text-amber-400 mt-1">{kpis.lineasUnicas}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Operadores involucrados</div>
          <div className="text-3xl font-bold text-cyan-400 mt-1">{kpis.operadoresInvolucrados}</div>
        </div>
      </div>

      {/* Serie temporal */}
      <section className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-fuchsia-400" />
          {daysBack === 1
            ? 'Evolución horaria — últimas 24 horas (cada barra = 1 hora real)'
            : `Evolución diaria — últimos ${daysBack} días`}
        </h2>
        {filtered.length === 0 ? (
          <EmptySeries days={daysBack} />
        ) : (
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="dateShort" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <ReTooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total" stroke="#e879f9" strokeWidth={2} dot={{ r: 3 }} name="Total" />
                <Line type="monotone" dataKey="criticos" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Críticos" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Distribución horaria */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Patrón horario — picos de bunching
          </h2>
          {filtered.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">Sin eventos en el período</div>
          ) : (
            <div style={{ width: '100%', height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={hourlyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={10} interval={2} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <ReTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  />
                  <Bar dataKey="count" name="Eventos">
                    {hourlyDistribution.map((e, i) => (
                      <Cell key={i} fill={e.isPeak ? '#f59e0b' : '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-2">
            Horas pico destacadas en ámbar (7-9h y 17-20h según patrón operativo estándar Montevideo).
          </p>
        </section>

        {/* Top líneas */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-red-400" />
            Top 10 líneas con más eventos
          </h2>
          {topLines.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">Sin eventos en el período</div>
          ) : (
            <div className="space-y-1.5">
              {topLines.map((l) => {
                const pctCritico = l.count > 0 ? (l.criticos / l.count) * 100 : 0;
                return (
                  <div key={l.linea} className="flex items-center gap-2 text-xs">
                    <div className="w-14 font-mono font-bold text-slate-300">L {l.linea}</div>
                    <div className="flex-1 bg-slate-800/60 rounded-full overflow-hidden h-5 relative">
                      <div
                        className="h-full bg-red-500/50"
                        style={{ width: `${(l.criticos / (topLines[0]?.count || 1)) * 100}%` }}
                      />
                      <div
                        className="h-full bg-amber-500/30 absolute top-0"
                        style={{
                          left: `${(l.criticos / (topLines[0]?.count || 1)) * 100}%`,
                          width: `${((l.count - l.criticos) / (topLines[0]?.count || 1)) * 100}%`,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-end px-2 text-[10px] font-mono text-white/90">
                        {l.count} ({pctCritico.toFixed(0)}% crít)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Top duelos */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
          <Swords className="w-4 h-4 text-amber-400" />
          Top duelos rivales — pares más frecuentes
        </h2>
        <p className="text-[10px] text-slate-500 mb-3">
          Pares (línea propia ↔ línea rival) con mayor frecuencia de eventos. Un par que aparece muchas
          veces con distancia mínima baja es un corredor crítico para negociación operativa o re-spacing.
        </p>
        {topDuelos.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">Sin duelos registrados en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Línea propia</th>
                  <th className="px-3 py-2">Empresa rival</th>
                  <th className="px-3 py-2">Línea rival</th>
                  <th className="px-3 py-2 text-right">Eventos</th>
                  <th className="px-3 py-2 text-right">Dist. promedio</th>
                  <th className="px-3 py-2 text-right">Mín. registrada</th>
                </tr>
              </thead>
              <tbody>
                {topDuelos.map((d, i) => (
                  <tr key={`${d.lineaPropia}_${d.empresaRival}_${d.lineaRival}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-bold">L {d.lineaPropia}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ background: EMPRESA_COLOR[d.empresaRival] ?? '#94a3b8' }}
                      />
                      {d.empresaRival}
                    </td>
                    <td className="px-3 py-2 font-mono">L {d.lineaRival}</td>
                    <td className="px-3 py-2 text-right font-mono text-fuchsia-400 font-bold">
                      {d.count}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {Math.round(d.avgDist)} m
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-400 font-bold">
                      {d.minDist} m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ═══ ACK PERFORMANCE ═══════════════════════════════════════════════
          Métricas de rendimiento del loop FCM → overlay del conductor → ACK.
          Indica cuántas alertas efectivamente llegaron, cuántas se acusaron,
          y qué tan rápido responden los conductores. KPI operativo clave
          para justificar la inversión en la pila de alertas tácticas. */}
      <section className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Rendimiento de Acuses (ACK) — loop FCM → conductor → respuesta
            </h2>
            <p className="text-[10px] text-slate-500 mt-1 max-w-4xl">
              Mide el funcionamiento del loop operacional: push FCM entregada
              al dispositivo del conductor, recepción del overlay táctico,
              tiempo hasta el click "RECIBIDO". Sólo cuenta alertas de tipos
              que disparan push (RIVAL_PISANDO_TURNO, PELIGRO_BUNCHING,
              DISPARO_MANUAL). KPI operativo análogo al de mensajería crítica
              (ring-tone acknowledgement) de CAD/AVL internacionales.
            </p>
          </div>
        </div>

        {ackKpis.total === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <div className="text-sm text-slate-400">
              Sin alertas de regulación en el período
            </div>
            <div className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              El loop FCM sólo se activa con alertas críticas (rival pisando
              turno, bunching detectado o disparo manual). Ampliá el rango
              temporal o esperá a que el sistema las genere.
            </div>
          </div>
        ) : (
          <>
            {/* KPIs ACK — 4 cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-slate-950/50 border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  <UserCheck className="w-3 h-3" />
                  Tasa de acuse
                </div>
                <div className="text-3xl font-black text-emerald-400 mt-1 tabular-nums">
                  {ackKpis.ackRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {ackKpis.acusadas.toLocaleString('es-UY')} de{' '}
                  {ackKpis.total.toLocaleString('es-UY')} alertas
                </div>
              </div>

              <div className="bg-slate-950/50 border border-cyan-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                  <Timer className="w-3 h-3" />
                  Tiempo de respuesta
                </div>
                <div className="text-3xl font-black text-cyan-400 mt-1 tabular-nums">
                  {ackKpis.avgResponseSec}
                  <span className="text-sm font-bold text-cyan-500/70 ml-1">s</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  mediana {ackKpis.medianResponseSec}s
                </div>
              </div>

              <div className="bg-slate-950/50 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                  <BellRing className="w-3 h-3" />
                  Push entregadas
                </div>
                <div className="text-3xl font-black text-blue-400 mt-1 tabular-nums">
                  {ackKpis.pushSuccessRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {ackKpis.pushEnviadas.toLocaleString('es-UY')} ok ·{' '}
                  {ackKpis.pushFallidas.toLocaleString('es-UY')} falló
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-600/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-3 h-3" />
                  Sin acuse
                </div>
                <div className="text-3xl font-black text-slate-400 mt-1 tabular-nums">
                  {ackKpis.noAcusadas.toLocaleString('es-UY')}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {ackKpis.total > 0
                    ? Math.round(
                        (ackKpis.noAcusadas / ackKpis.total) * 100,
                      )
                    : 0}
                  % del total
                </div>
              </div>
            </div>

            {/* Histograma de tiempos de respuesta + Top conductores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-wider">
                  Distribución de tiempos de respuesta
                </h3>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={responseTimeHistogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <ReTooltip
                        contentStyle={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: 6,
                        }}
                        labelStyle={{ color: '#e2e8f0' }}
                      />
                      <Bar dataKey="count" name="Alertas">
                        {responseTimeHistogram.map((b, i) => (
                          <Cell key={i} fill={b.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Un buen operativo tiene la mayoría de acuses en 0-15s
                  (verde/lima). Acuses &gt; 30s sugieren conductores no
                  atentos al tablet o problemas de señal.
                </p>
              </div>

              <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-wider">
                  Top conductores por tasa de acuse
                </h3>
                {topDrivers.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    Sin conductores con ≥3 alertas en el período
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[220px] overflow-y-auto custom-scrollbar">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-slate-950/90 backdrop-blur">
                        <tr className="text-left text-slate-500 uppercase tracking-wider border-b border-slate-800">
                          <th className="px-2 py-1.5">#</th>
                          <th className="px-2 py-1.5">Coche</th>
                          <th className="px-2 py-1.5 text-right">Rec.</th>
                          <th className="px-2 py-1.5 text-right">ACK %</th>
                          <th className="px-2 py-1.5 text-right">Resp.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topDrivers.map((d, i) => {
                          const ackBadge =
                            d.ackRate >= 80
                              ? 'text-emerald-400'
                              : d.ackRate >= 50
                                ? 'text-amber-400'
                                : 'text-red-400';
                          return (
                            <tr
                              key={d.cocheId}
                              className="border-b border-slate-800/50 hover:bg-slate-800/30"
                            >
                              <td className="px-2 py-1.5 text-slate-600">{i + 1}</td>
                              <td className="px-2 py-1.5 font-mono font-bold text-slate-300">
                                {d.cocheId}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                                {d.recibidas}
                              </td>
                              <td
                                className={`px-2 py-1.5 text-right font-mono font-black ${ackBadge}`}
                              >
                                {d.ackRate.toFixed(0)}%
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-cyan-400">
                                {d.avgResponseSec > 0 ? `${d.avgResponseSec}s` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-2">
                  Ranking de conductores con ≥3 alertas. Verde = ≥80% de
                  acuse (bueno), ámbar = 50-80% (aceptable), rojo = &lt;50%
                  (requiere seguimiento operativo).
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Nota pie */}
      <div className="mt-6 text-center text-[10px] text-slate-600">
        SkillRoute · Analytics Shadow · TCRP 100 bunching framework · datos de{' '}
        <code className="bg-slate-900 px-1 rounded">alertas_regulacion</code>
      </div>
    </div>
  );
}

// ─── Empty state de la serie temporal ───────────────────────────────────────

function EmptySeries({ days }: { days: number }) {
  return (
    <div className="py-12 text-center">
      <Activity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
      <div className="text-sm text-slate-400">
        Sin eventos en los últimos {days} día{days > 1 ? 's' : ''}.
      </div>
      <div className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
        Posibles causas: shadowDispatcher backend o frontend no han registrado alertas en la
        ventana seleccionada, o filtro de empresa demasiado restrictivo. Ampliá el rango o quitá
        el filtro.
      </div>
    </div>
  );
}
