/**
 * CrossOpCoverage.tsx — Estado de migración cross-operador
 * ============================================================
 * Página Admin que muestra, para cada operador del sistema metropolitano
 * (UCOT, CUTCSA, COME, COETC), el estado de las colecciones que necesita
 * para operar SkillRoute end-to-end:
 *
 *  - shapes_cross_operator    — recorridos catalogados
 *  - corridor_overlap         — matriz DRO con otros operadores
 *  - vehicle_events (ult 24h) — flota emitiendo GPS
 *  - personal                 — empleados del operador
 *  - vehicles                 — flota registrada
 *  - turnos_dia (hoy)         — programación del día
 *  - cartones / servicios     — disponibles para asignar
 *  - alertas_regulacion (7d)  — actividad reciente
 *
 * Útil para:
 *  - Onboarding de un nuevo operador (qué colecciones faltan poblar).
 *  - Smoke check de salud del sistema cross-op.
 *  - Diagnóstico cuando algún módulo aparece vacío.
 *
 * Acceso: rol ADMIN / SUPERADMIN.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  getCountFromServer,
  query,
  where,
  Timestamp,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  Building2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  Bus,
  ListChecks,
  MapPin,
  Network,
  Activity,
  Bell,
  Calendar,
} from 'lucide-react';
import { EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';

interface CoverageRow {
  metric: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  values: Record<number, number | null>; // codigo → count (null si error)
  threshold: number; // mínimo para considerar "saludable"
}

const METRICS: Omit<CoverageRow, 'values'>[] = [
  {
    metric: 'shapes_cross_operator',
    icon: MapPin,
    description: 'Recorridos catalogados (IDA + VUELTA por línea)',
    threshold: 5,
  },
  {
    metric: 'corridor_overlap',
    icon: Network,
    description: 'Solapamientos DRO con otros operadores',
    threshold: 1,
  },
  {
    metric: 'vehicle_events_24h',
    icon: Activity,
    description: 'Eventos GPS últimas 24 horas',
    threshold: 100,
  },
  {
    metric: 'personal',
    icon: Users,
    description: 'Empleados registrados',
    threshold: 1,
  },
  {
    metric: 'vehicles',
    icon: Bus,
    description: 'Flota registrada',
    threshold: 1,
  },
  {
    metric: 'cartones',
    icon: ListChecks,
    description: 'Cartones de servicio disponibles',
    threshold: 1,
  },
  {
    metric: 'turnos_dia_hoy',
    icon: Calendar,
    description: 'Programación de turnos del día',
    threshold: 1,
  },
  {
    metric: 'alertas_regulacion_7d',
    icon: Bell,
    description: 'Alertas tácticas últimos 7 días',
    threshold: 0, // 0 es ok (sistema sano)
  },
];

function todayMvd(): string {
  const localMs = Date.now() - 3 * 3600 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

async function safeCount(q: ReturnType<typeof query>): Promise<number | null> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.warn('[CrossOpCoverage] count error:', err);
    return null;
  }
}

async function fetchCoverageForAgency(agencyId: number): Promise<Record<string, number | null>> {
  const agStr = String(agencyId);
  const since24h = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);
  const since7d = Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000);
  const today = todayMvd();

  const [
    shapes,
    overlap,
    events24h,
    personal,
    vehicles,
    cartonesCount,
    turnosHoy,
    alertas7d,
  ] = await Promise.all([
    safeCount(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', agStr))),
    safeCount(query(collection(db, 'corridor_overlap'), where('agencyA', '==', agStr))),
    safeCount(
      query(
        collection(db, 'vehicle_events'),
        where('agencyId', '==', agStr),
        where('createdAt', '>=', since24h),
      ),
    ),
    safeCount(query(collection(db, 'personal'), where('agencyId', '==', agStr))),
    safeCount(query(collection(db, 'vehicles'), where('agencyId', '==', agStr))),
    // Para UCOT usamos servicios_ucot (legacy). Otros usan cartones genérica.
    agencyId === 70
      ? safeCount(query(collection(db, 'servicios_ucot'), limit(1000)))
      : safeCount(query(collection(db, 'cartones'), where('agencyId', '==', agStr))),
    safeCount(
      query(
        collection(db, 'turnos_dia'),
        where('agencyId', '==', agStr),
        where('fecha', '==', today),
      ),
    ),
    safeCount(
      query(
        collection(db, 'alertas_regulacion'),
        where('empresa_id', '==', agencyId),
        where('timestamp', '>=', since7d),
      ),
    ),
  ]);

  return {
    shapes_cross_operator: shapes,
    corridor_overlap: overlap,
    vehicle_events_24h: events24h,
    personal,
    vehicles,
    cartones: cartonesCount,
    turnos_dia_hoy: turnosHoy,
    alertas_regulacion_7d: alertas7d,
  };
}

export default function CrossOpCoverage() {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        EMPRESAS_OPCIONES.map((op) => fetchCoverageForAgency(op.codigo)),
      );

      const newRows: CoverageRow[] = METRICS.map((m) => {
        const values: Record<number, number | null> = {};
        EMPRESAS_OPCIONES.forEach((op, idx) => {
          values[op.codigo] = results[idx]![m.metric] ?? null;
        });
        return { ...m, values };
      });

      setRows(newRows);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[CrossOpCoverage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Score por operador (% métricas sobre threshold)
  const scoresByAgency: Record<number, { ok: number; total: number; pct: number }> = {};
  for (const op of EMPRESAS_OPCIONES) {
    let ok = 0;
    let total = 0;
    for (const r of rows) {
      const v = r.values[op.codigo];
      if (v == null) continue;
      total += 1;
      if (v >= r.threshold) ok += 1;
    }
    scoresByAgency[op.codigo] = {
      ok,
      total,
      pct: total > 0 ? (ok / total) * 100 : 0,
    };
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Building2 className="w-7 h-7 text-cyan-400" />
            Cobertura Cross-Operador
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Estado de las colecciones críticas para operar SkillRoute end-to-end
            por cada operador del sistema. Métricas cumplidas sobre umbrales mínimos.
            Útil para onboarding de nuevos operadores y diagnóstico cuando un módulo
            aparece vacío.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              Actualizado {lastUpdate.toLocaleTimeString('es-UY')}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </header>

      {/* Score cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {EMPRESAS_OPCIONES.map((op) => {
          const s = scoresByAgency[op.codigo];
          const colorClass =
            s.pct >= 75
              ? 'border-emerald-500/30 bg-emerald-900/20 text-emerald-300'
              : s.pct >= 50
                ? 'border-amber-500/30 bg-amber-900/20 text-amber-300'
                : 'border-red-500/30 bg-red-900/20 text-red-300';
          return (
            <div
              key={op.codigo}
              className={`rounded-xl border p-4 ${colorClass}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: op.color }}
                  aria-hidden
                />
                <span className="text-[10px] uppercase tracking-widest font-bold opacity-80">
                  Cobertura
                </span>
              </div>
              <div className="text-3xl font-black mt-2 tabular-nums">
                {Math.round(s.pct)}%
              </div>
              <div className="text-sm font-bold mt-0.5">{op.label}</div>
              <div className="text-[10px] opacity-70 mt-1">
                {s.ok} de {s.total} métricas sobre umbral
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabla de cobertura */}
      <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-black text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Métrica</th>
                  {EMPRESAS_OPCIONES.map((op) => (
                    <th key={op.codigo} className="px-4 py-3 text-center">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                        style={{ background: op.color }}
                        aria-hidden
                      />
                      {op.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Umbral</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const Icon = r.icon;
                  return (
                    <tr
                      key={r.metric}
                      className="border-t border-slate-800/50 hover:bg-slate-800/20"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-slate-500" />
                          <div>
                            <div className="font-bold text-slate-200">{r.metric}</div>
                            <div className="text-[10px] text-slate-500">
                              {r.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      {EMPRESAS_OPCIONES.map((op) => {
                        const v = r.values[op.codigo];
                        if (v == null) {
                          return (
                            <td
                              key={op.codigo}
                              className="px-4 py-3 text-center text-slate-600"
                              title="No se pudo consultar (probable índice faltante o permisos)"
                            >
                              <AlertTriangle className="w-3 h-3 inline" /> —
                            </td>
                          );
                        }
                        const ok = v >= r.threshold;
                        return (
                          <td
                            key={op.codigo}
                            className={`px-4 py-3 text-center font-mono font-bold ${
                              ok ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {ok && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                            {v.toLocaleString('es-UY')}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right text-[10px] text-slate-500 font-mono">
                        ≥ {r.threshold}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-[10px] text-slate-600">
        SkillRoute Admin · Cross-Op Coverage · Datos en vivo Firestore
      </p>
    </div>
  );
}
