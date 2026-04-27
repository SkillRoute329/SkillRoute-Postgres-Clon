import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PieChart, Network, Shield, TrendingUp, AlertTriangle, Info } from 'lucide-react';

interface OverlapDoc {
  key: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: 'IDA' | 'VUELTA';
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: 'IDA' | 'VUELTA';
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
  sampleCount: number;
}

const OPERADORES = [
  { agencyId: '70', nombre: 'UCOT',   bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30',    bar: '#3B82F6' },
  { agencyId: '50', nombre: 'CUTCSA', bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30',  bar: '#F97316' },
  { agencyId: '20', nombre: 'COME',   bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', bar: '#10B981' },
  { agencyId: '10', nombre: 'COETC',  bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/30',  bar: '#A855F7' },
] as const;

type AgencyId = (typeof OPERADORES)[number]['agencyId'];
type SortKey = 'sharedKm' | 'pctAInB' | 'lineaA' | 'empresaA';
type SortDir = 'asc' | 'desc';

function getOp(agencyId: string) {
  return OPERADORES.find(o => o.agencyId === agencyId);
}

function tierBadge(pct: number) {
  if (pct >= 20) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-500/30">T1</span>;
  if (pct >= 10) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-500/30">T2</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-600">T3</span>;
}

const CorridorMarketShare = () => {
  const [docs, setDocs] = useState<OverlapDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('sharedKm');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterA, setFilterA] = useState<'all' | AgencyId>('all');
  const [filterB, setFilterB] = useState<'all' | AgencyId>('all');
  const [showOnlyCross, setShowOnlyCross] = useState(true);
  const [expandedRows, setExpandedRows] = useState(50);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'corridor_overlap'), limit(5000)));
        setDocs(snap.docs.map(d => d.data() as OverlapDoc));
      } catch (err) {
        console.error('corridor_overlap load error:', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const { crossDocs, operadorStats, crossMatrix, totalKm, totalPairs } = useMemo(() => {
    const crossDocs = showOnlyCross ? docs.filter(d => !d.sameEmpresa) : docs;
    const totalKm = crossDocs.reduce((s, d) => s + (d.sharedKm ?? 0), 0);
    const totalPairs = crossDocs.length;

    const operadorStats = OPERADORES.map(op => {
      const asA = crossDocs.filter(d => d.agencyA === op.agencyId);
      const asB = crossDocs.filter(d => d.agencyB === op.agencyId);
      const exposedKm = asA.reduce((s, d) => s + d.sharedKm, 0);
      const attackingKm = asB.reduce((s, d) => s + d.sharedKm, 0);
      const uniqueLines = new Set(asA.map(d => d.lineaA)).size;
      const t1 = asA.filter(d => d.pctAInB >= 20).length;
      const t2 = asA.filter(d => d.pctAInB >= 10 && d.pctAInB < 20).length;
      const byRival: Record<string, number> = {};
      asA.forEach(d => { byRival[d.empresaB] = (byRival[d.empresaB] ?? 0) + d.sharedKm; });
      const biggestRival = Object.entries(byRival).sort((a, b) => b[1] - a[1])[0] ?? null;
      return { ...op, exposedKm, attackingKm, uniqueLines, t1, t2, biggestRival };
    });

    // cross matrix: [agencyA][agencyB] → { km, count, avgPct }
    type Cell = { km: number; count: number; avgPct: number };
    const crossMatrix: Record<string, Record<string, Cell>> = {};
    OPERADORES.forEach(a => {
      crossMatrix[a.agencyId] = {};
      OPERADORES.forEach(b => {
        if (a.agencyId === b.agencyId) return;
        const pairs = crossDocs.filter(d => d.agencyA === a.agencyId && d.agencyB === b.agencyId);
        crossMatrix[a.agencyId][b.agencyId] = {
          km: pairs.reduce((s, d) => s + d.sharedKm, 0),
          count: pairs.length,
          avgPct: pairs.length ? pairs.reduce((s, d) => s + d.pctAInB, 0) / pairs.length : 0,
        };
      });
    });

    return { crossDocs, operadorStats, crossMatrix, totalKm, totalPairs };
  }, [docs, showOnlyCross]);

  const tableData = useMemo(() => {
    let rows = crossDocs;
    if (filterA !== 'all') rows = rows.filter(d => d.agencyA === filterA);
    if (filterB !== 'all') rows = rows.filter(d => d.agencyB === filterB);
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [crossDocs, filterA, filterB, sortKey, sortDir]);

  const maxExposedKm = Math.max(...operadorStats.map(o => o.exposedKm), 1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // Biggest single rivalry for KPI card
  const biggestPair = (() => {
    let max = 0;
    let pair = { a: '', b: '', km: 0 };
    OPERADORES.forEach(a => {
      OPERADORES.forEach(b => {
        if (a.agencyId === b.agencyId) return;
        const cell = crossMatrix[a.agencyId]?.[b.agencyId];
        if (cell && cell.km > max) { max = cell.km; pair = { a: a.nombre, b: b.nombre, km: cell.km }; }
      });
    });
    return pair;
  })();

  const mostExposed = [...operadorStats].sort((a, b) => b.exposedKm - a.exposedKm)[0];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Network className="w-8 h-8 text-blue-500 animate-pulse" />
        <p className="text-slate-500 animate-pulse">Cargando datos de corredores…</p>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p>Sin datos en <code className="text-slate-400">corridor_overlap</code>. Ejecutar matriz DRO primero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
            <PieChart className="w-6 h-6 text-blue-400" />
            Participación por Corredor-km
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Análisis cross-operador · {totalPairs.toLocaleString()} pares DRO · {totalKm.toFixed(0)} km disputados en la red
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOnlyCross}
            onChange={e => setShowOnlyCross(e.target.checked)}
            className="accent-blue-500"
          />
          Solo competencia inter-operador
        </label>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Km disputados</p>
          <p className="text-3xl font-black text-white">{totalKm.toFixed(0)}</p>
          <p className="text-xs text-slate-500 mt-1">km de red en competencia directa</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Pares DRO</p>
          <p className="text-3xl font-black text-white">{totalPairs.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">relaciones línea↔línea con solapamiento</p>
        </div>
        <div className={`bg-slate-900 border ${getOp(mostExposed.agencyId)?.border ?? 'border-slate-700/50'} rounded-xl p-4`}>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Mayor exposición</p>
          <p className={`text-3xl font-black ${getOp(mostExposed.agencyId)?.text ?? 'text-white'}`}>{mostExposed.nombre}</p>
          <p className="text-xs text-slate-500 mt-1">{mostExposed.exposedKm.toFixed(0)} km de rutas disputadas</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Par más disputado</p>
          <p className="text-lg font-black text-white leading-tight">{biggestPair.a} ↔ {biggestPair.b}</p>
          <p className="text-xs text-slate-500 mt-1">{biggestPair.km.toFixed(0)} km en común</p>
        </div>
      </div>

      {/* Barras de exposición por operador */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-start gap-2 mb-1">
          <Shield className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Exposición competitiva por operador</h2>
            <p className="text-xs text-slate-500 mt-0.5">Km de rutas propias con solapamiento de otro operador (línea A en matriz DRO)</p>
          </div>
        </div>
        <div className="space-y-5 mt-4">
          {[...operadorStats].sort((a, b) => b.exposedKm - a.exposedKm).map(op => (
            <div key={op.agencyId}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${op.text}`}>{op.nombre}</span>
                  <span className="text-xs text-slate-500">{op.uniqueLines} líneas · <span className="text-red-400">{op.t1} T1</span> · <span className="text-amber-400">{op.t2} T2</span></span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono text-slate-300">{op.exposedKm.toFixed(1)} km</span>
                  <span className="text-xs text-slate-500 ml-2">({totalKm > 0 ? ((op.exposedKm / totalKm) * 100).toFixed(0) : 0}%)</span>
                </div>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${(op.exposedKm / maxExposedKm) * 100}%`, backgroundColor: op.bar }}
                />
              </div>
              {op.biggestRival && (
                <p className="text-xs text-slate-500 mt-1">Mayor rival: <span className="text-slate-400">{op.biggestRival[0]}</span> · {op.biggestRival[1].toFixed(1)} km</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Matriz cross-operador */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 overflow-x-auto">
        <div className="flex items-start gap-2 mb-1">
          <Network className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Matriz cross-operador</h2>
            <p className="text-xs text-slate-500 mt-0.5">Fila = operador expuesto (línea A) · Columna = rival (línea B) · Celda = km compartidos / DRO% promedio</p>
          </div>
        </div>
        <table className="w-full text-xs mt-4">
          <thead>
            <tr>
              <th className="text-left text-slate-500 pb-2 pr-6">Expuesto ↓ / Rival →</th>
              {OPERADORES.map(op => (
                <th key={op.agencyId} className={`pb-2 px-4 font-bold text-center ${op.text}`}>{op.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OPERADORES.map(opA => (
              <tr key={opA.agencyId} className="border-t border-slate-800">
                <td className={`py-3 pr-6 font-bold ${opA.text}`}>{opA.nombre}</td>
                {OPERADORES.map(opB => {
                  if (opA.agencyId === opB.agencyId) {
                    const intraKm = docs
                      .filter(d => d.agencyA === opA.agencyId && d.sameEmpresa)
                      .reduce((s, d) => s + d.sharedKm, 0);
                    return (
                      <td key={opB.agencyId} className="py-3 px-4 text-center">
                        {intraKm > 0
                          ? <span className="text-slate-500">{intraKm.toFixed(0)} km<br /><span className="text-slate-600 text-[9px]">intra</span></span>
                          : <span className="text-slate-700">—</span>}
                      </td>
                    );
                  }
                  const cell = crossMatrix[opA.agencyId]?.[opB.agencyId];
                  if (!cell || cell.km === 0) return <td key={opB.agencyId} className="py-3 px-4 text-center text-slate-700">—</td>;
                  const pctColor = cell.avgPct >= 30 ? 'text-red-400' : cell.avgPct >= 15 ? 'text-amber-400' : 'text-slate-400';
                  return (
                    <td key={opB.agencyId} className="py-3 px-4 text-center">
                      <div className="font-mono font-bold text-slate-200">{cell.km.toFixed(0)} km</div>
                      <div className={`text-[9px] ${pctColor}`}>{cell.avgPct.toFixed(0)}% DRO · {cell.count} pares</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla de corredores disputados */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Corredores disputados</h2>
          </div>
          <select
            value={filterA}
            onChange={e => setFilterA(e.target.value as 'all' | AgencyId)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos (expuesto)</option>
            {OPERADORES.map(op => <option key={op.agencyId} value={op.agencyId}>{op.nombre} expuesto</option>)}
          </select>
          <select
            value={filterB}
            onChange={e => setFilterB(e.target.value as 'all' | AgencyId)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos (rival)</option>
            {OPERADORES.map(op => <option key={op.agencyId} value={op.agencyId}>{op.nombre} rival</option>)}
          </select>
          <span className="text-xs text-slate-500">{tableData.length.toLocaleString()} pares</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="text-left text-slate-500 px-4 py-2.5 font-medium cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('lineaA')}>
                  Línea A (expuesta){sortArrow('lineaA')}
                </th>
                <th className="text-left text-slate-500 px-4 py-2.5 font-medium cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('empresaA')}>
                  Empresa A{sortArrow('empresaA')}
                </th>
                <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Línea B (rival)</th>
                <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Empresa B</th>
                <th className="text-right text-slate-500 px-4 py-2.5 font-medium cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('sharedKm')}>
                  Km compartidos{sortArrow('sharedKm')}
                </th>
                <th className="text-right text-slate-500 px-4 py-2.5 font-medium cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('pctAInB')}>
                  DRO%{sortArrow('pctAInB')}
                </th>
                <th className="text-center text-slate-500 px-4 py-2.5 font-medium">Tier</th>
                <th className="text-center text-slate-500 px-4 py-2.5 font-medium">Sentido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tableData.slice(0, expandedRows).map(row => {
                const opA = getOp(row.agencyA);
                const opB = getOp(row.agencyB);
                return (
                  <tr key={row.key} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-200">{row.lineaA}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${opA?.bg ?? ''} ${opA?.text ?? 'text-slate-400'}`}>{row.empresaA}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">{row.lineaB}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${opB?.bg ?? ''} ${opB?.text ?? 'text-slate-400'}`}>{row.empresaB}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-200">{row.sharedKm.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={row.pctAInB >= 20 ? 'text-red-400' : row.pctAInB >= 10 ? 'text-amber-400' : 'text-slate-400'}>
                        {row.pctAInB.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">{tierBadge(row.pctAInB)}</td>
                    <td className="px-4 py-2.5 text-center text-slate-400">{row.sentidoA}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tableData.length > expandedRows && (
          <div className="p-4 border-t border-slate-800 text-center">
            <button
              onClick={() => setExpandedRows(r => r + 100)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Cargar 100 más ({(tableData.length - expandedRows).toLocaleString()} restantes)
            </button>
          </div>
        )}
      </div>

      {/* Nota metodológica */}
      <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-200/70">
          <strong className="text-blue-300">Metodología DRO</strong> (Directional Route Overlap, TCRP 195): cada par línea A → línea B
          representa los km de la ruta A cubiertos por la ruta B en el mismo sentido de circulación (tolerancia lateral ≤35 m,
          diferencia de heading ≤60°). El porcentaje DRO indica qué fracción de la línea expuesta está siendo superpuesta por el rival.
          T1: DRO ≥ 20% · T2: DRO ≥ 10%.
        </p>
      </div>

    </div>
  );
};

export default CorridorMarketShare;
