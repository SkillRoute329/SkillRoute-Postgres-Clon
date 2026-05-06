/**
 * OTPDashboard — Tablero de Puntualidad (On-Time Performance)
 *
 * Metodología:
 * - Compara el horario programado (ScheduleService) con los registros
 *   de inspecciones en Firestore (colección 'inspecciones').
 * - Cada registro de inspección contiene: lineaId, servicioId, horaReal (HH:MM).
 * - Se clasifica: PUNTUAL (±4 min), ADELANTADO (>4 min antes), DEMORADO (>4 min después).
 *
 * Sin simulaciones. Sin datos hardcoded de estado. Sólo Firestore + ScheduleService.
 */

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { db, authReady } from '../../config/firebase';
import { useLiveData } from '../../context/LiveDataContext';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Bus,
  BarChart3,
  Award,
  Zap,
  Building2,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import type { OtpSummary } from '../../services/otpService';

/* ─── Types ───────────────────────────────────────────── */

type OTPClasificacion = 'PUNTUAL' | 'ADELANTADO' | 'DEMORADO';

interface OTPRegistro {
  id: string;
  lineaId: string;
  lineaNombre?: string;
  servicioId?: string;
  horaProgramada: string; // HH:MM
  horaReal: string; // HH:MM
  diferencia: number; // minutos (negativo = adelantado)
  clasificacion: OTPClasificacion;
  fecha: string; // YYYY-MM-DD
}

interface OTPLinea {
  lineaId: string;
  lineaNombre: string;
  total: number;
  puntuales: number;
  adelantados: number;
  demorados: number;
  otp: number; // porcentaje
  demora_avg: number; // minutos promedio de demora (solo demorados)
}

/* ─── Helpers ─────────────────────────────────────────── */

const TOLERANCIA_MIN = 4; // ±4 minutos = PUNTUAL (POLITICA_OTP_UNIFICADA.md · IMM/TCRP 165)

function horaToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function clasificar(diff: number): OTPClasificacion {
  if (diff < -TOLERANCIA_MIN) return 'ADELANTADO';
  if (diff > TOLERANCIA_MIN) return 'DEMORADO';
  return 'PUNTUAL';
}

function minToHHMM(min: number): string {
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = min < 0 ? '-' : '+';
  return `${sign}${h > 0 ? `${h}h ` : ''}${m}min`;
}

const OTP_COLOR = (otp: number) => {
  if (otp >= 85) {
    return {
      bar: 'bg-emerald-500',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    };
  }
  if (otp >= 70) {
    return {
      bar: 'bg-amber-500',
      text: 'text-amber-400',
      badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    };
  }
  return {
    bar: 'bg-red-500',
    text: 'text-red-400',
    badge: 'bg-red-500/10 border-red-500/20 text-red-400',
  };
};

/* ─── Component ───────────────────────────────────────── */

export default function OTPDashboard() {
  const { otpHoy, otpSeries } = useLiveData();
  const { empresaPropia, empresaCfg, setEmpresaPropia } = useEmpresaPropia();
  const [registros, setRegistros] = useState<OTPRegistro[]>([]);
  const [byLinea, setByLinea] = useState<OTPLinea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<7 | 14 | 30>(7);
  const [sortBy, setSortBy] = useState<'otp' | 'linea' | 'demora'>('otp');
  const [refreshKey, setRefreshKey] = useState(0);
  const [otpSummaryLines, setOtpSummaryLines] = useState<OtpSummary[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let unsubscribe: (() => void) | null = null;

    const processSnapshot = (snap: import('firebase/firestore').QuerySnapshot) => {
      if (snap.empty) {
        setRegistros([]);
        setByLinea([]);
        setLoading(false);
        return;
      }

      // Procesar cada inspección usando los campos reales guardados por InspectorCapture
      const regs: OTPRegistro[] = [];

      for (const d of snap.docs) {
        const data = d.data();

        // InspectionService guarda: lineId, scheduledTime, actualPassedAt (Timestamp), timeDeltaMinutes
        const lineaId: string = ((data.lineId ?? data.lineaId ?? data.linea ?? '') as string);
        const timeDeltaMinutes: number | null =
          typeof data.timeDeltaMinutes === 'number' ? data.timeDeltaMinutes : null;

        if (!lineaId || timeDeltaMinutes === null) continue;

        // Convertir actualPassedAt (Timestamp) a HH:MM
        let horaReal = '';
        if (data.actualPassedAt instanceof Timestamp) {
          const dt = data.actualPassedAt.toDate();
          horaReal = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        }
        if (!horaReal) continue;

        const scheduledTime: string = (data.scheduledTime ?? '') as string;
        const clasificacion = clasificar(timeDeltaMinutes);
        const fecha =
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate().toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        regs.push({
          id: d.id,
          lineaId,
          lineaNombre: (data.lineaNombre as string | undefined) ?? `Línea ${lineaId}`,
          servicioId: (data.cartonServiceId ?? data.servicioId) as string | undefined,
          horaProgramada: scheduledTime || '—',
          horaReal,
          diferencia: timeDeltaMinutes,
          clasificacion,
          fecha,
        });
      }

      setRegistros(regs);

      // Agregar por línea
      const map = new Map<string, OTPLinea>();
      for (const r of regs) {
        if (!map.has(r.lineaId)) {
          map.set(r.lineaId, {
            lineaId: r.lineaId,
            lineaNombre: r.lineaNombre ?? `Línea ${r.lineaId}`,
            total: 0,
            puntuales: 0,
            adelantados: 0,
            demorados: 0,
            otp: 0,
            demora_avg: 0,
          });
        }
        const row = map.get(r.lineaId)!;
        row.total++;
        if (r.clasificacion === 'PUNTUAL') row.puntuales++;
        if (r.clasificacion === 'ADELANTADO') row.adelantados++;
        if (r.clasificacion === 'DEMORADO') row.demorados++;
      }

      // Calcular OTP y demora promedio
      const lineas: OTPLinea[] = [...map.values()].map((l) => {
        const demorados_data = regs.filter(
          (r) => r.lineaId === l.lineaId && r.clasificacion === 'DEMORADO',
        );
        return {
          ...l,
          otp: l.total > 0 ? Math.round(((l.puntuales + l.adelantados) / l.total) * 100) : 0,
          demora_avg:
            demorados_data.length > 0
              ? Math.round(
                  demorados_data.reduce((s, r) => s + r.diferencia, 0) / demorados_data.length,
                )
              : 0,
        };
      });

      setByLinea(lineas);
      setLoading(false);
    };

    void authReady.then(() => {
      // Fecha límite
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      const desdeTs = Timestamp.fromDate(desde);

      unsubscribe = onSnapshot(
        query(
          collection(db, 'inspections'),
          where('createdAt', '>=', desdeTs),
          orderBy('createdAt', 'desc'),
          limit(2000),
        ),
        processSnapshot,
        (e) => {
          console.error('OTP onSnapshot error:', e);
          setError('No se pudieron cargar los datos de puntualidad. Verifica la conexión.');
          setLoading(false);
        },
      );
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [dias, refreshKey, empresaPropia]);

  // Cargar otp_summary del motor GPS (otpEngine — snap-to-stop real, cada 10 min)
  // Cross-operador: filtra por la empresa actualmente seleccionada
  useEffect(() => {
    void getDocs(
      query(collection(db, 'otp_summary'), where('agencyId', '==', empresaCfg.agencyId)),
    )
      .then((snap) => setOtpSummaryLines(snap.docs.map((d) => d.data() as OtpSummary)))
      .catch(() => setOtpSummaryLines([]));
  }, [empresaPropia, refreshKey]);

  /* ── KPIs globales ── */
  const totalReg = registros.length;
  const puntuales = registros.filter((r) => r.clasificacion === 'PUNTUAL').length;
  const adelantados = registros.filter((r) => r.clasificacion === 'ADELANTADO').length;
  const demorados = registros.filter((r) => r.clasificacion === 'DEMORADO').length;
  const otpGlobal = totalReg > 0 ? Math.round(((puntuales + adelantados) / totalReg) * 100) : 0;
  const demoraAvg =
    demorados > 0
      ? Math.round(
          registros
            .filter((r) => r.clasificacion === 'DEMORADO')
            .reduce((s, r) => s + r.diferencia, 0) / demorados,
        )
      : 0;

  /* ── Sorted lines ── */
  const sortedLineas = [...byLinea].sort((a, b) => {
    if (sortBy === 'otp') return a.otp - b.otp;
    if (sortBy === 'demora') return b.demora_avg - a.demora_avg;
    return a.lineaNombre.localeCompare(b.lineaNombre);
  });

  const globalColor = OTP_COLOR(otpGlobal);

  /* ─── RENDER ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-6">

      {/* ── Banner OTP GPS en vivo — fuente autorizada ── */}
      {otpHoy !== null && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-black ${otpHoy >= 90 ? 'text-emerald-400' : otpHoy >= 75 ? 'text-yellow-400' : 'text-red-400'}`}>
              {otpHoy.toFixed(1)}%
            </div>
            <div>
              <p className="text-sm font-bold text-white">OTP en tiempo real (GPS)</p>
              <p className="text-xs text-slate-400">Basado en {otpSeries.find(s => s.date === new Date().toISOString().slice(0,10))?.total?.toLocaleString() ?? '—'} servicios GPS monitoreados hoy</p>
            </div>
          </div>
          {otpSeries.length > 1 && (
            <div className="flex items-end gap-1 h-8 ml-auto">
              {otpSeries.slice(-7).map((s) => (
                <div key={s.date} className="flex flex-col items-center gap-0.5" title={`${s.date}: ${s.value}%`}>
                  <div
                    className={`w-5 rounded-sm ${s.value >= 90 ? 'bg-emerald-500' : s.value >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ height: `${Math.max(4, (s.value / 100) * 32)}px` }}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 w-full">
            ℹ El OTP GPS mide el cumplimiento horario de todos los servicios activos cruzando posición GPS contra horarios STM scrapeados. Los datos de inspecciones manuales se muestran debajo.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Tablero OTP — Puntualidad
            </h1>
            <p className="text-xs text-slate-500">
              On-Time Performance · Tolerancia ±{TOLERANCIA_MIN} min · Empresa: <span className="text-blue-400 font-semibold">{empresaCfg.label}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Días selector */}
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dias === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 border border-white/5 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-white/5 text-xs text-slate-300 hover:bg-slate-700/60 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>
      {/* Selector de empresa */}
      <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50 w-fit -mt-2">
        {([{ id: 70, nombre: 'UCOT' }, { id: 50, nombre: 'CUTCSA' }, { id: 20, nombre: 'COME' }, { id: 10, nombre: 'COETC' }] as const).map((ag) => (
          <button
            key={ag.id}
            onClick={() => { setEmpresaPropia(ag.id); setRefreshKey(k => k + 1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              empresaPropia === ag.id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {ag.nombre}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* OTP Global — card grande */}
        <div
          className={`col-span-2 md:col-span-2 rounded-2xl p-5 border ${globalColor.badge} flex items-center gap-5`}
        >
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke={otpGlobal >= 85 ? '#10b981' : otpGlobal >= 70 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${otpGlobal} ${100 - otpGlobal}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-black ${globalColor.text}`}>
                {loading ? '…' : `${otpGlobal}%`}
              </span>
            </div>
          </div>
          <div>
            <p className={`text-3xl font-black ${globalColor.text}`}>
              {loading ? '—' : `${otpGlobal}%`}
            </p>
            <p className="text-sm font-bold text-white">OTP Global</p>
            <p className="text-xs text-slate-500">
              {totalReg} servicios analizados · {dias} días
            </p>
          </div>
        </div>

        {/* Puntuales */}
        <div className="rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <p className="text-2xl font-black text-emerald-400">{loading ? '—' : puntuales}</p>
            <p className="text-xs text-slate-500">Puntuales</p>
            <p className="text-xs text-emerald-500/70">
              {totalReg > 0 ? `${Math.round((puntuales / totalReg) * 100)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Adelantados */}
        <div className="rounded-2xl p-4 border border-blue-500/20 bg-blue-500/5 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-400 shrink-0" />
          <div>
            <p className="text-2xl font-black text-blue-400">{loading ? '—' : adelantados}</p>
            <p className="text-xs text-slate-500">Adelantados</p>
            <p className="text-xs text-blue-500/70">
              {totalReg > 0 ? `${Math.round((adelantados / totalReg) * 100)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Demorados */}
        <div className="rounded-2xl p-4 border border-red-500/20 bg-red-500/5 flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <p className="text-2xl font-black text-red-400">{loading ? '—' : demorados}</p>
            <p className="text-xs text-slate-500">Demorados</p>
            <p className="text-xs text-red-500/70">
              {demorados > 0 ? `Avg ${minToHHMM(demoraAvg)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Sin inspecciones → mostrar Motor GPS (otp_summary cross-operador) */}
      {!loading && totalReg === 0 && !error && otpSummaryLines.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                OTP por Línea — Motor GPS · {empresaCfg.label}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Snap-to-stop · GPS oficial STM · Actualización cada 10 min · {otpSummaryLines.length} líneas con datos
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold">
              GPS OFICIAL
            </span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {[...otpSummaryLines]
              .sort((a, b) => a.pctOnTime - b.pctOnTime)
              .map((s, i) => {
                const c = OTP_COLOR(s.pctOnTime);
                return (
                  <div
                    key={`${s.agencyId}_${s.linea}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className={`w-6 text-center text-xs font-black ${i === 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                      {i === 0 ? <Award className="w-4 h-4 inline" /> : `#${i + 1}`}
                    </span>
                    <div className="w-36 shrink-0">
                      <p className="text-sm font-bold text-white">Línea {s.linea}</p>
                      <p className="text-xs text-slate-500">{s.busesActivos} buses activos</p>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${c.bar} rounded-full transition-all duration-700`}
                          style={{ width: `${s.pctOnTime}%` }}
                        />
                      </div>
                      <span className={`text-sm font-black w-12 text-right ${c.text}`}>
                        {Math.round(s.pctOnTime)}%
                      </span>
                    </div>
                    <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 shrink-0">
                      <span className="text-emerald-400">{s.aTiempo} en tiempo</span>
                      <span className="text-red-400">{s.retrasado} ret.</span>
                      {s.retrasoPromedioMin > 0 && (
                        <span className="text-amber-400 flex items-center gap-0.5">
                          <Zap className="w-3 h-3" />
                          +{s.retrasoPromedioMin.toFixed(1)}min avg
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border hidden sm:block ${c.badge}`}>
                      {s.pctOnTime >= 85 ? 'ÓPTIMO' : s.pctOnTime >= 70 ? 'REGULAR' : 'CRÍTICO'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Sin inspecciones NI motor GPS → mensaje informativo */}
      {!loading && totalReg === 0 && !error && otpSummaryLines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-4 rounded-2xl border border-white/5 bg-slate-900/40">
          <BarChart3 className="w-12 h-12 text-slate-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-400">
              Sin datos de puntualidad para {empresaCfg.label} en los últimos {dias} días
            </p>
            <p className="text-xs text-slate-600 mt-1">
              El Motor GPS (otpEngine) actualiza cada 10 min. Si no hay datos, verificar que el cron esté activo para esta empresa.
            </p>
          </div>
        </div>
      )}

      {/* By-Line table */}
      {!loading && sortedLineas.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Bus className="w-4 h-4 text-blue-400" />
              OTP por Línea
            </h2>
            <div className="flex items-center gap-1 bg-slate-800/60 rounded-xl p-1">
              {(
                [
                  ['otp', 'Por OTP ↑'],
                  ['demora', 'Por Demora'],
                  ['linea', 'Línea'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    sortBy === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {sortedLineas.map((l, i) => {
              const c = OTP_COLOR(l.otp);
              return (
                <div
                  key={l.lineaId}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank */}
                  <span
                    className={`w-6 text-center text-xs font-black ${i === 0 ? 'text-amber-400' : 'text-slate-600'}`}
                  >
                    {i === 0 ? <Award className="w-4 h-4 inline" /> : `#${i + 1}`}
                  </span>

                  {/* Nombre */}
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-bold text-white">{l.lineaNombre}</p>
                    <p className="text-xs text-slate-500">{l.total} servicios</p>
                  </div>

                  {/* Barra OTP */}
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${c.bar} rounded-full transition-all duration-700`}
                        ref={(el) => {
                          if (el) el.style.width = `${l.otp}%`;
                        }}
                      />
                    </div>
                    <span className={`text-sm font-black w-12 text-right ${c.text}`}>{l.otp}%</span>
                  </div>

                  {/* Detalle */}
                  <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 shrink-0">
                    <span className="text-emerald-400">{l.puntuales}P</span>
                    <span className="text-blue-400">{l.adelantados}A</span>
                    <span className="text-red-400">{l.demorados}D</span>
                    {l.demorados > 0 && (
                      <span className="text-amber-400 flex items-center gap-0.5">
                        <Zap className="w-3 h-3" />
                        {minToHHMM(l.demora_avg)}
                      </span>
                    )}
                  </div>

                  {/* Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold border hidden sm:block ${c.badge}`}
                  >
                    {l.otp >= 85 ? 'ÓPTIMO' : l.otp >= 70 ? 'REGULAR' : 'CRÍTICO'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 rounded-2xl bg-slate-900/60 border border-white/5 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-slate-600 text-center">
        Metodología OTP: PUNTUAL = ±{TOLERANCIA_MIN}min · ADELANTADO &lt; -{TOLERANCIA_MIN}min ·
        DEMORADO &gt; +{TOLERANCIA_MIN}min
      </p>
    </div>
  );
}
