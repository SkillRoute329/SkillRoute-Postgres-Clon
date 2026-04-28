/**
 * CorridorIntelligence.tsx — Dashboard estratégico de corredores metropolitanos
 * ==============================================================================
 * DIRECTRIZ 2026-04-24: producto nivel internacional, no MVP.
 *
 * Es el artefacto vendible del pitch: ninguna plataforma comercial (Optibus,
 * Swiftly, Remix) ofrece análisis de competencia cross-operador en tiempo
 * real sobre datos GTFS-RT combinados del sistema completo — porque ningún
 * operador individual tiene esa data. SkillRoute sí.
 *
 * Fuentes de datos:
 *   - `corridor_overlap` (matriz DRO pre-calculada por droMatrix.ts)
 *   - `shapes_cross_operator` (metadata de las shapes reconstruidas)
 *
 * Cuatro secciones (TCRP 195 + TfL Bus Service Planning Guidelines):
 *   1. KPIs globales del sistema
 *   2. Top competitive corridors (cross-operator)
 *   3. Canibalización intra-empresa por operador
 *   4. Resumen por operador
 *
 * Exportable a Excel (3 sheets). Tabla filtrable. Loading/empty/error states.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveData } from '../../context/LiveDataContext';
import {
  collection,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import * as XLSX from 'xlsx';
import {
  Download,
  Network,
  TrendingUp,
  GitBranch,
  Ruler,
  AlertTriangle,
  Loader2,
  Filter as FilterIcon,
  ArrowUpDown,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────

type Sentido = 'IDA' | 'VUELTA';

interface OverlapDoc {
  key: string;
  shapeAKey: string;
  shapeBKey: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: Sentido;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: Sentido;
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
  sampleCount?: number;
}

interface ShapeMeta {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: Sentido;
  lengthMeters: number;
  pointCount: number;
}

interface OperatorRow {
  agencyId: string;
  empresa: string;
  shapesCount: number;
  avgLengthKm: number;
  totalCompetitivePairs: number;
  totalIntraPairs: number;
  avgDroPct: number;
  totalSharedKmVsRivals: number;
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function CorridorIntelligencePage() {
  const { selectedLine, setSelectedLine } = useLiveData();
  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [shapes, setShapes] = useState<ShapeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // Filtros de tabla
  const [filterEmpresa, setFilterEmpresa] = useState<string>('');
  const [filterLinea, setFilterLinea] = useState<string>(selectedLine ?? '');
  const [filterMinPct, setFilterMinPct] = useState<number>(10);
  const [filterMinSharedKm, setFilterMinSharedKm] = useState<number>(0);
  const [filterKind, setFilterKind] = useState<'all' | 'cross' | 'intra'>('all');
  const [sortBy, setSortBy] = useState<'sharedKm' | 'pctAInB'>('sharedKm');

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'corridor_overlap'), limit(5000))),
        getDocs(query(collection(db, 'shapes_cross_operator'), limit(500))),
      ]);
      const o: OverlapDoc[] = [];
      for (const doc of oSnap.docs) o.push(doc.data() as OverlapDoc);
      const s: ShapeMeta[] = [];
      for (const doc of sSnap.docs) {
        const d = doc.data();
        s.push({
          key: String(d.key),
          agencyId: String(d.agencyId),
          empresa: String(d.empresa),
          linea: String(d.linea),
          sentido: d.sentido as Sentido,
          lengthMeters: Number(d.lengthMeters ?? 0),
          pointCount: Number(d.pointCount ?? 0),
        });
      }
      setOverlaps(o);
      setShapes(s);
      setLastLoadedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Adoptar línea del contexto global cuando el usuario navega desde otro módulo
  useEffect(() => {
    if (selectedLine) setFilterLinea(selectedLine);
  }, [selectedLine]);

  // ── Aggregations ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = overlaps.length;
    const cross = overlaps.filter((o) => !o.sameEmpresa).length;
    const intra = overlaps.filter((o) => o.sameEmpresa).length;
    const avgPct = total > 0 ? overlaps.reduce((a, o) => a + o.pctAInB, 0) / total : 0;
    const totalSharedKm = overlaps.reduce((a, o) => a + o.sharedKm, 0);
    return {
      total,
      cross,
      intra,
      avgPct: Math.round(avgPct * 10) / 10,
      totalSharedKm: Math.round(totalSharedKm),
    };
  }, [overlaps]);

  const operatorSummary = useMemo<OperatorRow[]>(() => {
    const byEmpresa = new Map<string, OperatorRow>();
    for (const sh of shapes) {
      const row =
        byEmpresa.get(sh.agencyId) ?? {
          agencyId: sh.agencyId,
          empresa: sh.empresa,
          shapesCount: 0,
          avgLengthKm: 0,
          totalCompetitivePairs: 0,
          totalIntraPairs: 0,
          avgDroPct: 0,
          totalSharedKmVsRivals: 0,
        };
      row.shapesCount += 1;
      row.avgLengthKm += sh.lengthMeters / 1000;
      byEmpresa.set(sh.agencyId, row);
    }
    // Finalizar avg length
    for (const row of byEmpresa.values()) {
      row.avgLengthKm = row.shapesCount > 0 ? row.avgLengthKm / row.shapesCount : 0;
    }
    // Acumular pares desde overlaps
    const pctSums = new Map<string, { sum: number; n: number }>();
    for (const o of overlaps) {
      const row = byEmpresa.get(o.agencyA);
      if (!row) continue;
      if (o.sameEmpresa) {
        row.totalIntraPairs += 1;
      } else {
        row.totalCompetitivePairs += 1;
        row.totalSharedKmVsRivals += o.sharedKm;
        const ps = pctSums.get(o.agencyA) ?? { sum: 0, n: 0 };
        ps.sum += o.pctAInB;
        ps.n += 1;
        pctSums.set(o.agencyA, ps);
      }
    }
    for (const row of byEmpresa.values()) {
      const ps = pctSums.get(row.agencyId);
      row.avgDroPct = ps && ps.n > 0 ? ps.sum / ps.n : 0;
    }
    return [...byEmpresa.values()].sort((a, b) => b.totalCompetitivePairs - a.totalCompetitivePairs);
  }, [shapes, overlaps]);

  const topCompetitive = useMemo(() => {
    return overlaps
      .filter((o) => !o.sameEmpresa && o.pctAInB >= 20)
      .sort((a, b) => b.sharedKm - a.sharedKm)
      .slice(0, 20);
  }, [overlaps]);

  const intraByEmpresa = useMemo(() => {
    const byEmp = new Map<string, OverlapDoc[]>();
    for (const o of overlaps) {
      if (!o.sameEmpresa) continue;
      const arr = byEmp.get(o.empresaA) ?? [];
      arr.push(o);
      byEmp.set(o.empresaA, arr);
    }
    const out: Array<{ empresa: string; top: OverlapDoc[]; avgPct: number; count: number }> = [];
    for (const [empresa, arr] of byEmp.entries()) {
      const top = [...arr].sort((a, b) => b.pctAInB - a.pctAInB).slice(0, 10);
      const avgPct = arr.reduce((a, o) => a + o.pctAInB, 0) / arr.length;
      out.push({ empresa, top, avgPct: Math.round(avgPct * 10) / 10, count: arr.length });
    }
    return out.sort((a, b) => b.avgPct - a.avgPct);
  }, [overlaps]);

  const filtered = useMemo(() => {
    return overlaps
      .filter((o) => {
        if (filterKind === 'cross' && o.sameEmpresa) return false;
        if (filterKind === 'intra' && !o.sameEmpresa) return false;
        if (filterEmpresa && o.empresaA !== filterEmpresa) return false;
        if (filterLinea && o.lineaA !== filterLinea && o.lineaB !== filterLinea) return false;
        if (o.pctAInB < filterMinPct) return false;
        if (o.sharedKm < filterMinSharedKm) return false;
        return true;
      })
      .sort((a, b) => (sortBy === 'sharedKm' ? b.sharedKm - a.sharedKm : b.pctAInB - a.pctAInB));
  }, [overlaps, filterKind, filterEmpresa, filterLinea, filterMinPct, filterMinSharedKm, sortBy]);

  // ── Export ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (overlaps.length === 0) return;
    const wb = XLSX.utils.book_new();

    const sheet1 = XLSX.utils.json_to_sheet(
      topCompetitive.map((o) => ({
        'Empresa A': o.empresaA,
        'Línea A': o.lineaA,
        'Sentido A': o.sentidoA,
        'Empresa B': o.empresaB,
        'Línea B': o.lineaB,
        'Sentido B': o.sentidoB,
        'DRO % (A en B)': o.pctAInB,
        'Km compartidos': o.sharedKm,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet1, 'Top Competitive');

    const sheet2Rows: Record<string, string | number>[] = [];
    for (const group of intraByEmpresa) {
      for (const o of group.top) {
        sheet2Rows.push({
          Empresa: o.empresaA,
          'Línea A': o.lineaA,
          'Sentido A': o.sentidoA,
          'Línea B': o.lineaB,
          'Sentido B': o.sentidoB,
          'DRO %': o.pctAInB,
          'Km compartidos': o.sharedKm,
        });
      }
    }
    const sheet2 = XLSX.utils.json_to_sheet(sheet2Rows);
    XLSX.utils.book_append_sheet(wb, sheet2, 'Canibalización Intra');

    const sheet3 = XLSX.utils.json_to_sheet(
      operatorSummary.map((r) => ({
        Operador: r.empresa,
        'Agency ID': r.agencyId,
        'Shapes reconstruidas': r.shapesCount,
        'Largo promedio (km)': Math.round(r.avgLengthKm * 10) / 10,
        'Pares competitivos (cross)': r.totalCompetitivePairs,
        'Pares canibalización (intra)': r.totalIntraPairs,
        'DRO % promedio vs rivales': Math.round(r.avgDroPct * 10) / 10,
        'Km compartidos con rivales': Math.round(r.totalSharedKmVsRivals * 10) / 10,
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet3, 'Resumen por Operador');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `skillroute-corridor-intelligence-${date}.xlsx`);
  }, [overlaps.length, topCompetitive, intraByEmpresa, operatorSummary]);

  // ── UI ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando matriz de corredores…</span>
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
            <div className="font-bold text-red-300">Error al cargar corredores</div>
            <div className="text-red-400/80 text-sm mt-1">{error}</div>
            <button
              onClick={loadData}
              className="mt-3 px-3 py-1.5 bg-red-800/40 hover:bg-red-800/60 text-red-200 rounded text-xs"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (overlaps.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-xl mx-auto bg-amber-950/30 border border-amber-700/50 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300">Matriz de corredores vacía</div>
            <div className="text-amber-400/80 text-sm mt-1">
              La colección <code className="bg-slate-900 px-1 rounded">corridor_overlap</code> no
              tiene documentos. Ejecutá el endpoint HTTP{' '}
              <code className="bg-slate-900 px-1 rounded">recomputeDroMatrixNow</code> para
              generar la matriz.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
            <Network className="w-8 h-8 text-emerald-400" />
            Inteligencia de Corredores
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Análisis de competencia y solapamiento del sistema metropolitano completo
            (UCOT · CUTCSA · COME · COETC). Métrica base: <strong>DRO</strong> (Directional
            Route Overlap, TCRP 195). Cobertura cross-operador y canibalización intra-empresa en
            un mismo tablero — imposible de reproducir por un operador individual.
          </p>
          {lastLoadedAt && (
            <div className="text-xs text-slate-600 mt-2">
              Última sincronización: {lastLoadedAt.toLocaleTimeString('es-UY')}
            </div>
          )}
        </div>
        <button
          onClick={handleExport}
          className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm shadow-lg shadow-emerald-900/30"
          title="Exportar las 3 tablas como .xlsx"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPI
          label="Corredores analizados"
          value={stats.total.toLocaleString('es-UY')}
          icon={<Network className="w-4 h-4" />}
          color="text-cyan-400"
        />
        <KPI
          label="Competencia cross-operador"
          value={stats.cross.toLocaleString('es-UY')}
          sublabel={`${stats.total > 0 ? Math.round((stats.cross / stats.total) * 100) : 0}% del total`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-red-400"
        />
        <KPI
          label="Canibalización interna"
          value={stats.intra.toLocaleString('es-UY')}
          sublabel={`${stats.total > 0 ? Math.round((stats.intra / stats.total) * 100) : 0}% del total`}
          icon={<GitBranch className="w-4 h-4" />}
          color="text-amber-400"
        />
        <KPI
          label="Km compartidos"
          value={`${stats.totalSharedKm.toLocaleString('es-UY')} km`}
          sublabel={`DRO promedio: ${stats.avgPct}%`}
          icon={<Ruler className="w-4 h-4" />}
          color="text-emerald-400"
        />
      </div>

      {/* Sección 1: Top competitive */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-red-400" />
          Top 20 corredores competitivos (cross-operador)
        </h2>
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Operador A</th>
                <th className="px-4 py-2">Línea A</th>
                <th className="px-4 py-2">Operador B</th>
                <th className="px-4 py-2">Línea B</th>
                <th className="px-4 py-2 text-right">DRO %</th>
                <th className="px-4 py-2 text-right">Km compartidos</th>
              </tr>
            </thead>
            <tbody>
              {topCompetitive.map((o, i) => (
                <tr key={o.key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                  <td className="px-4 py-2 font-semibold">{o.empresaA}</td>
                  <td className="px-4 py-2 text-slate-400">{o.lineaA} <span className="text-slate-600 text-xs">({o.sentidoA})</span></td>
                  <td className="px-4 py-2 font-semibold">{o.empresaB}</td>
                  <td className="px-4 py-2 text-slate-400">{o.lineaB} <span className="text-slate-600 text-xs">({o.sentidoB})</span></td>
                  <td className="px-4 py-2 text-right font-mono text-red-400 font-bold">{o.pctAInB.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400 font-bold">{o.sharedKm.toFixed(2)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sección 2: Intra-operator */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-amber-400" />
          Canibalización intra-empresa — líneas propias que comparten corredor
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          TCRP 195 &quot;internal route duplication&quot;: cuando dos líneas del mismo operador
          solapan &gt;40% DRO son candidatas a fusión o re-spacing. Oportunidad de optimización
          interna sin ceder mercado.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intraByEmpresa.map((group) => (
            <div key={group.empresa} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="font-bold text-slate-200 text-lg">{group.empresa}</span>
                <span className="text-xs text-slate-500">
                  {group.count} pares · DRO promedio <strong className="text-amber-400">{group.avgPct}%</strong>
                </span>
              </div>
              <div className="space-y-1 text-xs">
                {group.top.slice(0, 6).map((o) => (
                  <div key={o.key} className="flex justify-between items-center">
                    <span className="text-slate-400 truncate">
                      L{o.lineaA} ({o.sentidoA}) ↔ L{o.lineaB} ({o.sentidoB})
                    </span>
                    <span className="font-mono">
                      <span className="text-amber-400 font-bold">{o.pctAInB.toFixed(0)}%</span>
                      <span className="text-slate-600 mx-1">·</span>
                      <span className="text-emerald-400">{o.sharedKm.toFixed(1)} km</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {intraByEmpresa.length === 0 && (
            <div className="md:col-span-2 text-slate-500 text-sm p-4 bg-slate-900 border border-slate-800 rounded-xl">
              No hay pares intra-empresa con solapamiento ≥10% en la matriz actual.
            </div>
          )}
        </div>
      </section>

      {/* Sección 3: Resumen por operador */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          Resumen por operador
        </h2>
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                <th className="px-4 py-2">Operador</th>
                <th className="px-4 py-2 text-right">Shapes</th>
                <th className="px-4 py-2 text-right">Largo prom.</th>
                <th className="px-4 py-2 text-right">Pares competitivos</th>
                <th className="px-4 py-2 text-right">Pares intra</th>
                <th className="px-4 py-2 text-right">DRO prom. vs rivales</th>
                <th className="px-4 py-2 text-right">Km vs rivales</th>
              </tr>
            </thead>
            <tbody>
              {operatorSummary.map((r) => (
                <tr key={r.agencyId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-2 font-bold">{r.empresa} <span className="text-slate-600 text-xs">({r.agencyId})</span></td>
                  <td className="px-4 py-2 text-right font-mono text-cyan-400">{r.shapesCount}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.avgLengthKm.toFixed(1)} km</td>
                  <td className="px-4 py-2 text-right font-mono text-red-400">{r.totalCompetitivePairs}</td>
                  <td className="px-4 py-2 text-right font-mono text-amber-400">{r.totalIntraPairs}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.avgDroPct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400">{r.totalSharedKmVsRivals.toFixed(1)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sección 4: Tabla completa con filtros */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2">
          <FilterIcon className="w-5 h-5 text-blue-400" />
          Explorador de pares ({filtered.length.toLocaleString('es-UY')} resultados)
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-slate-500 uppercase font-bold">Tipo</span>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as 'all' | 'cross' | 'intra')}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
            >
              <option value="all">Todos</option>
              <option value="cross">Cross-operador</option>
              <option value="intra">Intra-empresa</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-500 uppercase font-bold">Operador A</span>
            <select
              value={filterEmpresa}
              onChange={(e) => setFilterEmpresa(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
            >
              <option value="">Todos</option>
              <option value="UCOT">UCOT</option>
              <option value="CUTCSA">CUTCSA</option>
              <option value="COME">COME</option>
              <option value="COETC">COETC</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-500 uppercase font-bold">DRO mín %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={filterMinPct}
              onChange={(e) => setFilterMinPct(Number(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-500 uppercase font-bold">Km mín</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={filterMinSharedKm}
              onChange={(e) => setFilterMinSharedKm(Number(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-500 uppercase font-bold">Ordenar por</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'sharedKm' | 'pctAInB')}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
            >
              <option value="sharedKm">Km compartidos</option>
              <option value="pctAInB">DRO %</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl max-h-[60vh] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                <th className="px-4 py-2">Operador A</th>
                <th className="px-4 py-2">Línea A</th>
                <th className="px-4 py-2">Sentido A</th>
                <th className="px-4 py-2">Operador B</th>
                <th className="px-4 py-2">Línea B</th>
                <th className="px-4 py-2">Sentido B</th>
                <th className="px-4 py-2 text-right">
                  <button
                    onClick={() => setSortBy('pctAInB')}
                    className="inline-flex items-center gap-1 hover:text-white"
                    title="Ordenar por %"
                  >
                    DRO % <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-2 text-right">
                  <button
                    onClick={() => setSortBy('sharedKm')}
                    className="inline-flex items-center gap-1 hover:text-white"
                    title="Ordenar por km"
                  >
                    Km compartidos <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-2">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((o) => (
                <tr key={o.key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-2 font-semibold">{o.empresaA}</td>
                  <td className="px-4 py-2">{o.lineaA}</td>
                  <td className="px-4 py-2 text-slate-500">{o.sentidoA}</td>
                  <td className="px-4 py-2 font-semibold">{o.empresaB}</td>
                  <td className="px-4 py-2">{o.lineaB}</td>
                  <td className="px-4 py-2 text-slate-500">{o.sentidoB}</td>
                  <td className="px-4 py-2 text-right font-mono">{o.pctAInB.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400">{o.sharedKm.toFixed(2)} km</td>
                  <td className="px-4 py-2">
                    {o.sameEmpresa ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50 font-bold">INTRA</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700/50 font-bold">CROSS</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length > 500 && (
                <tr>
                  <td colSpan={9} className="px-4 py-3 text-center text-slate-500 text-xs">
                    Mostrando 500 de {filtered.length.toLocaleString('es-UY')} resultados. Refiná los filtros o exportá a Excel para ver todo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  sublabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider font-bold">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
      {sublabel && <div className="text-[10px] text-slate-600 mt-1">{sublabel}</div>}
    </div>
  );
}
