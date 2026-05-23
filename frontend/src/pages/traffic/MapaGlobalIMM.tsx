/**
 * MapaGlobalIMM — mapa con todas las paradas críticas del sistema STM
 * pintadas por operador dominante o por nivel de competencia.
 *
 * FASE 5.15 (2026-05-14): visualización agregada de TODOS los operadores
 * para identificar:
 *   • Corredores en disputa (paradas con presencia balanceada entre 2-4
 *     operadores → color naranja/rojo en modo "Competencia")
 *   • Zonas de monopolio (un solo operador domina → gris en "Competencia")
 *   • Áreas donde UCOT no participa (paradas sin presencia UCOT)
 *
 * Datos: validaciones oficiales IMM (stm_validaciones_mensual).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Calendar, Database, Layers, Filter, Info, RefreshCw, TrendingUp,
} from 'lucide-react';
import {
  fetchMesesIngestados,
  fetchMapaGlobal,
  type MesIngestado,
  type DemandaMapaGlobalItem,
} from '../../services/stmDemandaService';
import { OPERADORES as OPERADORES_CANON } from '../../utils/operadores';

const MVD_CENTER: [number, number] = [-34.9011, -56.1645];
// FASE 5.16: color por nombre derivado de la fuente única.
const COLOR_OP: Record<string, string> = OPERADORES_CANON.reduce(
  (acc, o) => { acc[o.nombre] = o.colorHex; return acc; },
  {} as Record<string, string>,
);

type Modo = 'dominio' | 'competencia' | 'ucot';

function fmtMes(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
}

function colorCompetencia(hhi: number, nOps: number): string {
  // hhi normalizado en [0.25, 1]. nOps en [1,4]
  // 1 operador → monopolio → gris oscuro
  // 4 operadores parejos → competencia alta → rojo intenso
  if (nOps <= 1) return '#475569'; // slate-600
  if (hhi >= 0.7) return '#94a3b8'; // poco competida
  if (hhi >= 0.5) return '#fb923c'; // moderada
  if (hhi >= 0.4) return '#f97316'; // alta
  return '#ef4444';                  // disputa máxima
}

function radio(total: number, maxTotal: number): number {
  if (maxTotal === 0) return 4;
  // Raíz cuadrada para que el área sea proporcional al volumen (no el radio).
  return 4 + Math.sqrt(total / maxTotal) * 22;
}

const MapaGlobalIMM: React.FC = () => {
  const [meses, setMeses] = useState<MesIngestado[]>([]);
  const [mesSel, setMesSel] = useState<string>('');
  const [items, setItems] = useState<DemandaMapaGlobalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>('dominio');
  const [topN, setTopN] = useState<number>(500);
  const [minViajes, setMinViajes] = useState<number>(500);
  const [filtroUcot, setFiltroUcot] = useState<boolean>(false);

  useEffect(() => {
    fetchMesesIngestados().then((m) => {
      setMeses(m);
      if (m.length > 0 && !mesSel) setMesSel(m[0].mes.slice(0, 7));
    });
  }, []);

  useEffect(() => {
    if (!mesSel) return;
    setLoading(true);
    fetchMapaGlobal({ mes: mesSel, top: topN, minViajes, conUcot: filtroUcot })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, [mesSel, topN, minViajes, filtroUcot]);

  const maxTotal = useMemo(() => Math.max(0, ...items.map((i) => i.total)), [items]);
  const itemsConGeo = useMemo(() => items.filter((i) => i.lat != null && i.lon != null), [items]);

  const stats = useMemo(() => {
    const total = items.reduce((s, i) => s + i.total, 0);
    const totalUcot = items.reduce((s, i) => s + i.ucot, 0);
    const totalCutcsa = items.reduce((s, i) => s + i.cutcsa, 0);
    const totalCoetc = items.reduce((s, i) => s + i.coetc, 0);
    const totalCome = items.reduce((s, i) => s + i.come, 0);
    const conUcot = items.filter((i) => i.ucot > 0).length;
    const disputaAlta = items.filter((i) => i.nOperadores >= 3 && i.hhi < 0.5).length;
    const monopolios = items.filter((i) => i.nOperadores === 1).length;
    return { total, totalUcot, totalCutcsa, totalCoetc, totalCome, conUcot, disputaAlta, monopolios };
  }, [items]);

  function colorPunto(it: DemandaMapaGlobalItem): string {
    if (modo === 'dominio') return COLOR_OP[it.dominante] ?? '#94a3b8';
    if (modo === 'competencia') return colorCompetencia(it.hhi, it.nOperadores);
    // modo 'ucot': escala según cuota UCOT en la parada
    if (it.ucot === 0) return '#1e293b';
    const cuota = it.ucot / it.total;
    if (cuota >= 0.5) return '#10b981'; // verde fuerte: UCOT manda
    if (cuota >= 0.25) return '#84cc16'; // lima: relevante
    if (cuota >= 0.1) return '#f59e0b';  // amarillo: presencia
    return '#dc2626';                     // rojo: presencia marginal
  }

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 p-4 md:p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <Database className="w-7 h-7 text-amber-400 mt-1" />
          <div>
            <h1 className="text-2xl font-bold">Mapa global STM — corredores en disputa</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Top paradas del sistema metropolitano con desglose por operador. Datos oficiales IMM.
            </p>
          </div>
        </div>
        {loading && <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            value={mesSel}
            onChange={(e) => setMesSel(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            {meses.length === 0 && <option>(sin datos)</option>}
            {meses.map((m) => (
              <option key={m.mes} value={m.mes.slice(0, 7)}>{fmtMes(m.mes)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Modo</span>
          <div className="flex gap-1">
            <button
              onClick={() => setModo('dominio')}
              className={`text-xs font-semibold px-3 py-1 rounded ${
                modo === 'dominio' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'
              }`}
              title="Color por operador dominante en la parada"
            >Dominio</button>
            <button
              onClick={() => setModo('competencia')}
              className={`text-xs font-semibold px-3 py-1 rounded ${
                modo === 'competencia' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'
              }`}
              title="Color por nivel de disputa (HHI)"
            >Competencia</button>
            <button
              onClick={() => setModo('ucot')}
              className={`text-xs font-semibold px-3 py-1 rounded ${
                modo === 'ucot' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'
              }`}
              title="Color por % cuota UCOT en la parada"
            >Cuota UCOT</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 uppercase">Top</span>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 uppercase">Min. viajes</span>
          <select
            value={minViajes}
            onChange={(e) => setMinViajes(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filtroUcot}
            onChange={(e) => setFiltroUcot(e.target.checked)}
            className="accent-amber-500"
          />
          Solo paradas con UCOT
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Paradas (mes)</p>
          <p className="text-2xl font-black text-slate-100">{items.length.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">{itemsConGeo.length} geo-localizadas</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Viajes totales</p>
          <p className="text-2xl font-black text-slate-100">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-3">
          <p className="text-[10px] text-amber-400 uppercase tracking-wider">UCOT</p>
          <p className="text-2xl font-black text-amber-300">{stats.totalUcot.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">en {stats.conUcot} paradas</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] text-blue-400 uppercase tracking-wider">CUTCSA</p>
          <p className="text-2xl font-black text-blue-300">{stats.totalCutcsa.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-3">
          <p className="text-[10px] text-red-400 uppercase tracking-wider">Disputa alta</p>
          <p className="text-2xl font-black text-red-300">{stats.disputaAlta}</p>
          <p className="text-[10px] text-slate-500">3+ operadores · HHI&lt;0.5</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Monopolios</p>
          <p className="text-2xl font-black text-slate-300">{stats.monopolios}</p>
          <p className="text-[10px] text-slate-500">1 solo operador</p>
        </div>
      </div>

      {/* Mapa */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5" />
            Cada círculo es una parada · tamaño = volumen del mes
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            {modo === 'dominio' && (
              <>
                {(['UCOT', 'CUTCSA', 'COETC', 'COME'] as const).map((op) => (
                  <span key={op} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_OP[op] }} />
                    {op}
                  </span>
                ))}
              </>
            )}
            {modo === 'competencia' && (
              <>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" />Disputa máxima</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" />Alta</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-300" />Moderada</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-400" />Poco competida</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-600" />Monopolio</span>
              </>
            )}
            {modo === 'ucot' && (
              <>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" />UCOT &gt;50%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-lime-500" />25-50%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500" />10-25%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600" />&lt;10%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-800 border" />Sin UCOT</span>
              </>
            )}
          </div>
        </div>
        <div style={{ height: 600 }}>
          <MapContainer center={MVD_CENTER} zoom={12} style={{ width: '100%', height: '100%' }} preferCanvas>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap · CartoDB"
            />
            {itemsConGeo.map((it) => (
              <CircleMarker
                key={it.codigoParada}
                center={[it.lat as number, it.lon as number]}
                radius={radio(it.total, maxTotal)}
                pathOptions={{
                  color: colorPunto(it),
                  fillColor: colorPunto(it),
                  fillOpacity: 0.55,
                  weight: 1.2,
                }}
              >
                <Tooltip>
                  <div className="text-xs leading-tight">
                    <strong>{it.nombre || it.codigoParada}</strong>
                    <br />
                    <span className="text-slate-500 font-mono">cód {it.codigoParada}</span>
                    <br />
                    Total mes: <strong>{it.total.toLocaleString()}</strong>
                    <br />
                    <span style={{ color: COLOR_OP.UCOT }}>UCOT: {it.ucot.toLocaleString()}</span> ({((it.ucot / it.total) * 100).toFixed(0)}%)
                    <br />
                    <span style={{ color: COLOR_OP.CUTCSA }}>CUTCSA: {it.cutcsa.toLocaleString()}</span> ({((it.cutcsa / it.total) * 100).toFixed(0)}%)
                    <br />
                    <span style={{ color: COLOR_OP.COETC }}>COETC: {it.coetc.toLocaleString()}</span> ({((it.coetc / it.total) * 100).toFixed(0)}%)
                    <br />
                    <span style={{ color: COLOR_OP.COME }}>COME: {it.come.toLocaleString()}</span> ({((it.come / it.total) * 100).toFixed(0)}%)
                    <br />
                    Dominante: <strong>{it.dominante}</strong> ({(it.cuotaDominante * 100).toFixed(0)}%)
                    {' '}· HHI {it.hhi.toFixed(2)} · {it.nOperadores} op.
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Tabla top disputa */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-red-400" />
          Top 12 paradas en disputa real (3+ operadores con cuota balanceada)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1">Parada</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">UCOT</th>
                <th className="py-1 text-right">CUTCSA</th>
                <th className="py-1 text-right">COETC</th>
                <th className="py-1 text-right">COME</th>
                <th className="py-1 text-right">HHI</th>
                <th className="py-1">Dom.</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((i) => i.nOperadores >= 3 && i.hhi < 0.5)
                .slice(0, 12)
                .map((i) => (
                  <tr key={i.codigoParada} className="border-t border-slate-800/60">
                    <td className="py-1">
                      <span className="font-mono text-slate-500">{i.codigoParada}</span>
                      <span className="block text-[10px] text-slate-400 line-clamp-1">{i.nombre || '(s/n)'}</span>
                    </td>
                    <td className="py-1 text-right font-mono">{i.total.toLocaleString()}</td>
                    <td className="py-1 text-right" style={{ color: i.ucot > 0 ? COLOR_OP.UCOT : '#64748b' }}>{i.ucot.toLocaleString()}</td>
                    <td className="py-1 text-right" style={{ color: i.cutcsa > 0 ? COLOR_OP.CUTCSA : '#64748b' }}>{i.cutcsa.toLocaleString()}</td>
                    <td className="py-1 text-right" style={{ color: i.coetc > 0 ? COLOR_OP.COETC : '#64748b' }}>{i.coetc.toLocaleString()}</td>
                    <td className="py-1 text-right" style={{ color: i.come > 0 ? COLOR_OP.COME : '#64748b' }}>{i.come.toLocaleString()}</td>
                    <td className="py-1 text-right text-red-400 font-bold">{i.hhi.toFixed(2)}</td>
                    <td className="py-1 font-bold" style={{ color: COLOR_OP[i.dominante] }}>{i.dominante}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 mt-4 max-w-3xl">
        <strong>HHI (Índice Herfindahl-Hirschman):</strong> mide concentración de mercado.
        HHI = 1.0 monopolio puro · HHI = 0.25 cuatro operadores iguales.
        Paradas con HHI &lt; 0.5 y 3+ operadores presentes son zonas de competencia real.
        {' '}<strong>Modo &quot;Cuota UCOT&quot;</strong> resalta dónde UCOT lidera, participa marginalmente o está ausente — útil para identificar territorios de expansión.
      </p>
    </div>
  );
};

export default MapaGlobalIMM;
