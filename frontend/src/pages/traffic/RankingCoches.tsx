/**
 * RankingCoches.tsx
 *
 * Tabla de coches ordenada por % de cumplimiento (menor a mayor).
 * Permite a supervisores identificar vehículos que necesitan atención
 * sin exponer nombres de conductores — solo número de coche.
 *
 * Datos: /api/autostats/fleet-ranking/:agencyId?days=N
 */

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  fetchFleetRanking,
  type VehicleSummary,
  type FleetRankingResponse,
} from '../../services/autoStatsService';
import AdherenceLabel from '../../components/compliance/AdherenceLabel';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bus,
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  Clock,
  RefreshCw,
  Download,
  Search,
  Activity,
  ChevronUp,
  ChevronDown,
  Star,
  X,
  Route,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

/* ─── Constantes ──────────────────────────────────────── */

const AGENCIAS = [
  { id: '70', nombre: 'UCOT' },
  { id: '50', nombre: 'CUTCSA' },
  { id: '20', nombre: 'COME' },
  { id: '10', nombre: 'COETC' },
] as const;

const DIAS_OPCIONES = [
  { value: 7, label: 'Últimos 7 días' },
  { value: 14, label: 'Últimos 14 días' },
];

const PAGE_SIZE = 25;

/* ─── Helpers ─────────────────────────────────────────── */

function colorPct(pct: number) {
  if (pct >= 85) return 'text-emerald-400';
  if (pct >= 70) return 'text-blue-400';
  if (pct >= 55) return 'text-yellow-400';
  return 'text-red-400';
}

function bgPct(pct: number) {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-blue-500';
  if (pct >= 55) return 'bg-yellow-500';
  return 'bg-red-500';
}

function badgePct(pct: number) {
  if (pct >= 85) return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  if (pct >= 70) return 'bg-blue-500/15 border-blue-500/40 text-blue-300';
  if (pct >= 55) return 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300';
  return 'bg-red-500/15 border-red-500/40 text-red-300';
}

function labelPct(pct: number) {
  if (pct >= 85) return 'Excelente';
  if (pct >= 70) return 'Bueno';
  if (pct >= 55) return 'Regular';
  return 'Crítico';
}

function exportCSV(vehicles: VehicleSummary[], agenciaNombre: string, dias: number) {
  const encabezado = [
    `Ranking de Coches por Cumplimiento — ${agenciaNombre} — Últimos ${dias} días`,
    `Generado: ${new Date().toLocaleDateString('es-UY')} ${new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`,
    '',
    'Posición;Coche;Líneas;% En tiempo;% Atrasado;% Adelantado;Desv. media (min);Vel. media (km/h);Registros;Nivel',
  ];
  const filas = vehicles.map((v, i) => [
    i + 1,
    v.idBus,
    v.lineasOperadas.join(' / ') || '—',
    `${v.pctEnTiempo}%`,
    `${v.pctAtrasado}%`,
    `${v.pctAdelantado}%`,
    v.desviacionMediaMin !== null
      ? `${v.desviacionMediaMin > 0 ? '+' : ''}${v.desviacionMediaMin}`
      : '—',
    v.velocidadMedia,
    v.totalEventos,
    labelPct(v.pctEnTiempo),
  ].join(';'));

  const bom = '﻿';
  const csv = bom + [...encabezado, ...filas].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ranking_coches_${agenciaNombre.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Componente principal ────────────────────────────── */

type SortKey = 'pctEnTiempo' | 'pctAtrasado' | 'totalEventos' | 'desviacionMediaMin';

export default function RankingCoches() {
  const [agenciaId, setAgenciaId] = useState('70');
  const [dias, setDias] = useState(7);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FleetRankingResponse | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtroLinea, setFiltroLinea] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('pctEnTiempo');
  const [sortAsc, setSortAsc] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [tendencias, setTendencias] = useState<Record<string, number | null>>({});
  const [vehiculoDetalle, setVehiculoDetalle] = useState<VehicleSummary | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const cargar = async (ag: string, d: number) => {
    setCargando(true);
    setError(null);
    setPagina(0);
    setTendencias({});
    try {
      // Período actual y anterior en paralelo
      const [actual, anterior] = await Promise.all([
        fetchFleetRanking(ag, d),
        fetchFleetRanking(ag, d, d),          // offset=d → período previo
      ]);
      setData(actual);

      // Mapa idBus → pctEnTiempo del período anterior
      const prevMap: Record<string, number | null> = {};
      for (const v of (anterior.vehicles ?? [])) {
        prevMap[v.idBus] = v.pctEnTiempo;
      }
      // Diferencia: positivo = mejoró, negativo = empeoró
      const diffs: Record<string, number | null> = {};
      for (const v of (actual.vehicles ?? [])) {
        const prev = prevMap[v.idBus];
        diffs[v.idBus] = prev != null ? v.pctEnTiempo - prev : null;
      }
      setTendencias(diffs);
    } catch {
      setError('No se pudieron cargar los datos. Verificá la conexión.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(agenciaId, dias); }, [agenciaId, dias]);

  // Cerrar panel detalle al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setVehiculoDetalle(null);
      }
    };
    if (vehiculoDetalle) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vehiculoDetalle]);

  /* ─── Datos derivados ────────────── */

  // Líneas únicas en el dataset para el dropdown
  const lineasDisponibles = [...new Set(
    (data?.vehicles ?? []).flatMap((v) => v.lineasOperadas),
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const vehiculosFiltrados = (data?.vehicles ?? []).filter((v) => {
    const matchBuscar = buscar === '' ||
      v.idBus.toLowerCase().includes(buscar.toLowerCase()) ||
      v.lineasOperadas.some((l) => l.toLowerCase().includes(buscar.toLowerCase()));
    const matchLinea = filtroLinea === '' || v.lineasOperadas.includes(filtroLinea);
    return matchBuscar && matchLinea;
  });

  const ordenados = [...vehiculosFiltrados].sort((a, b) => {
    const av = sortKey === 'desviacionMediaMin'
      ? (a.desviacionMediaMin ?? 0)
      : a[sortKey as keyof VehicleSummary] as number;
    const bv = sortKey === 'desviacionMediaMin'
      ? (b.desviacionMediaMin ?? 0)
      : b[sortKey as keyof VehicleSummary] as number;
    return sortAsc ? av - bv : bv - av;
  });

  const totalPaginas = Math.ceil(ordenados.length / PAGE_SIZE);
  const pagina_actual = ordenados.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);

  const vehiculos = data?.vehicles ?? [];
  const criticos = vehiculos.filter((v) => v.pctEnTiempo < 50).length;
  const enZonaRoja = vehiculos.filter((v) => v.pctEnTiempo < 70).length;
  const promedio = vehiculos.length
    ? Math.round(vehiculos.reduce((a, v) => a + v.pctEnTiempo, 0) / vehiculos.length)
    : 0;
  const mejor = vehiculos.length
    ? vehiculos.reduce((a, b) => (a.pctEnTiempo > b.pctEnTiempo ? a : b))
    : null;

  const agenciaNombre = AGENCIAS.find((a) => a.id === agenciaId)?.nombre ?? agenciaId;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function exportPDF() {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fecha = new Date().toLocaleDateString('es-UY');
    const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

    // Encabezado
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Ranking de Coches — SkillRoute', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${agenciaNombre} · Últimos ${dias} días · Generado: ${fecha} ${hora}`, 14, 20);
    doc.setFontSize(8);
    doc.text(
      `Total: ${vehiculosFiltrados.length} coches · Promedio flota: ${promedio}% · Zona roja: ${enZonaRoja} coches`,
      14, 26.5,
    );

    const rows = vehiculosFiltrados.map((v, i) => {
      const diff = tendencias[v.idBus];
      const tendStr = diff == null ? '—' : diff > 0 ? `+${diff}%` : `${diff}%`;
      return [
        i + 1,
        v.idBus,
        v.lineasOperadas.join(' / ') || '—',
        `${v.pctEnTiempo}%`,
        `${v.pctAtrasado}%`,
        `${v.pctAdelantado}%`,
        v.desviacionMediaMin !== null
          ? `${v.desviacionMediaMin > 0 ? '+' : ''}${v.desviacionMediaMin} min`
          : '—',
        `${v.velocidadMedia} km/h`,
        v.totalEventos,
        tendStr,
        labelPct(v.pctEnTiempo),
      ];
    });

    autoTable(doc, {
      head: [['#', 'Coche', 'Líneas', 'En tiempo', 'Atrasado', 'Adelantado', 'Desv. media', 'Vel. media', 'Registros', 'Tendencia', 'Nivel']],
      body: rows,
      startY: 34,
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.column.index === 3 && d.section === 'body') {
          const val = parseInt((d.cell.raw as string).replace('%', ''));
          if (val < 55) d.cell.styles.textColor = [239, 68, 68];
          else if (val < 70) d.cell.styles.textColor = [234, 179, 8];
          else if (val < 85) d.cell.styles.textColor = [59, 130, 246];
          else d.cell.styles.textColor = [16, 185, 129];
        }
      },
      didDrawPage: (d) => {
        const total = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${d.pageNumber} de ${total}`, 283, 207, { align: 'right' });
      },
    });

    doc.save(`ranking_coches_${agenciaNombre.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  function ColHeader({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {children}
          {active ? (
            sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          ) : (
            <span className="w-3 h-3 opacity-30">↕</span>
          )}
        </span>
      </th>
    );
  }

  /* ─── Render ─────────────────────────────── */

  return (
    <div className="bg-slate-950 min-h-screen p-6">
      <div className="fixed top-0 right-1/4 w-96 h-96 bg-blue-700/6 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Ranking de Coches</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cumplimiento por vehículo — identificá los coches que necesitan atención
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          {/* Selector días */}
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            {DIAS_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => data && exportCSV(vehiculosFiltrados, agenciaNombre, dias)}
            disabled={cargando || !data}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:text-white hover:bg-emerald-600/30 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={cargando || !data}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-600/30 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            onClick={() => cargar(agenciaId, dias)}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Tabs empresa */}
      <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50 w-fit mb-6">
        {AGENCIAS.map((ag) => (
          <button
            key={ag.id}
            onClick={() => setAgenciaId(ag.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              agenciaId === ag.id
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {ag.nombre}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => cargar(agenciaId, dias)} className="mt-2 text-xs text-red-400 underline">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Cargando */}
      {cargando && !data && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Calculando ranking de coches…</p>
        </div>
      )}

      {data && !cargando && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Bus className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Coches analizados</p>
              </div>
              <p className="text-3xl font-black text-white">{vehiculos.length}</p>
              <p className="text-xs text-slate-600 mt-1">{dias} días de historial</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Promedio flota</p>
              </div>
              <p className={`text-3xl font-black ${colorPct(promedio)}`}>{promedio}%</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Zona roja</p>
              </div>
              <p className={`text-3xl font-black ${enZonaRoja > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {enZonaRoja}
              </p>
              <p className="text-xs text-slate-600 mt-1">{criticos} críticos (&lt;50%)</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                  <Star className="w-4 h-4 text-yellow-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Mejor coche</p>
              </div>
              {mejor ? (
                <>
                  <p className="text-xl font-black text-emerald-400">Coche {mejor.idBus}</p>
                  <p className="text-xs text-slate-500 mt-1">{mejor.pctEnTiempo}% en tiempo</p>
                </>
              ) : (
                <p className="text-3xl font-black text-slate-600">—</p>
              )}
            </div>
          </div>

          {/* Barra de búsqueda y filtros */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={buscar}
                onChange={(e) => { setBuscar(e.target.value); setPagina(0); }}
                placeholder="Buscar por coche o línea…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {lineasDisponibles.length > 0 && (
              <select
                value={filtroLinea}
                onChange={(e) => { setFiltroLinea(e.target.value); setPagina(0); }}
                className="text-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">Todas las líneas</option>
                {lineasDisponibles.map((l) => (
                  <option key={l} value={l}>Línea {l}</option>
                ))}
              </select>
            )}
            {(buscar || filtroLinea) && (
              <span className="text-xs text-slate-500">
                {vehiculosFiltrados.length} de {vehiculos.length} coches
              </span>
            )}
            {(buscar || filtroLinea) && (
              <button
                onClick={() => { setBuscar(''); setFiltroLinea(''); setPagina(0); }}
                className="text-xs text-slate-500 hover:text-slate-300 underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Tabla */}
          {ordenados.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-10 text-center">
              <Bus className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Sin datos de coches para este período.</p>
              <p className="text-slate-600 text-xs mt-1">
                Los datos se acumulan mientras los coches están en servicio.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60 border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest w-10">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Coche</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Líneas</th>
                      <ColHeader k="pctEnTiempo">En tiempo</ColHeader>
                      <ColHeader k="pctAtrasado">Atrasado</ColHeader>
                      <ColHeader k="desviacionMediaMin">Desv. media</ColHeader>
                      <ColHeader k="totalEventos">Registros</ColHeader>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Tendencia</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Nivel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pagina_actual.map((v, idx) => {
                      const posGlobal = pagina * PAGE_SIZE + idx + 1;
                      return (
                        <tr
                          key={v.idBus}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                          onClick={() => setVehiculoDetalle(v)}
                        >
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{posGlobal}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <Bus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="font-semibold text-slate-200">{v.idBus}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-400">
                              {v.lineasOperadas.length > 0
                                ? v.lineasOperadas.map((l) => `L${l}`).join(', ')
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[90px]">
                              <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${bgPct(v.pctEnTiempo)}`}
                                  style={{ width: `${v.pctEnTiempo}%` }}
                                />
                              </div>
                              <span className={`text-sm font-bold w-10 text-right shrink-0 ${colorPct(v.pctEnTiempo)}`}>
                                {v.pctEnTiempo}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-semibold ${v.pctAtrasado > 20 ? 'text-red-400' : 'text-slate-400'}`}>
                              {v.pctAtrasado}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {/* FASE 5.14: label literal (Atrasado/Adelantado/En tiempo) en vez de "+/- N min". */}
                            <AdherenceLabel desviacionMin={v.desviacionMediaMin} />
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{v.totalEventos}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const diff = tendencias[v.idBus];
                              if (diff == null) return <Minus className="w-4 h-4 text-slate-600" />;
                              if (diff > 2) return (
                                <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                                  <ArrowUpRight className="w-4 h-4" />+{diff}%
                                </span>
                              );
                              if (diff < -2) return (
                                <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                                  <ArrowDownRight className="w-4 h-4" />{diff}%
                                </span>
                              );
                              return <Minus className="w-4 h-4 text-slate-500" />;
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgePct(v.pctEnTiempo)}`}>
                              {labelPct(v.pctEnTiempo)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900/50">
                  <span className="text-xs text-slate-500">
                    Mostrando {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, ordenados.length)} de {ordenados.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                      disabled={pagina === 0}
                      className="px-3 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 transition-all"
                    >
                      ← Anterior
                    </button>
                    {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                      const p = Math.max(0, Math.min(totalPaginas - 5, pagina - 2)) + i;
                      return (
                        <button
                          key={p}
                          onClick={() => setPagina(p)}
                          className={`w-8 h-7 text-xs rounded-lg border transition-all ${
                            p === pagina
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          {p + 1}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                      disabled={pagina >= totalPaginas - 1}
                      className="px-3 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 transition-all"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leyenda */}
          <div className="flex items-center gap-6 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Excelente ≥85%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Bueno 70–84%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Regular 55–69%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Crítico &lt;55%</span>
            <span className="ml-auto">Hacé click en una fila para ver el detalle del coche.</span>
          </div>
        </>
      )}

      {/* Panel de detalle del vehículo */}
      {vehiculoDetalle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end">
          <div
            ref={panelRef}
            className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700 p-6 overflow-y-auto shadow-2xl"
          >
            {/* Encabezado panel */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bus className="w-5 h-5 text-blue-400" />
                  <h2 className="text-xl font-bold text-white">Coche {vehiculoDetalle.idBus}</h2>
                </div>
                <p className="text-sm text-slate-400">{vehiculoDetalle.empresa} · {dias} días de historial</p>
              </div>
              <button
                onClick={() => setVehiculoDetalle(null)}
                className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nivel general */}
            <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50 mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Cumplimiento en tiempo</p>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-4xl font-black ${colorPct(vehiculoDetalle.pctEnTiempo)}`}>
                  {vehiculoDetalle.pctEnTiempo}%
                </span>
                <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${badgePct(vehiculoDetalle.pctEnTiempo)}`}>
                  {labelPct(vehiculoDetalle.pctEnTiempo)}
                </span>
              </div>
              <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${bgPct(vehiculoDetalle.pctEnTiempo)}`}
                  style={{ width: `${vehiculoDetalle.pctEnTiempo}%` }}
                />
              </div>
              {/* Marcador objetivo 85% */}
              <div className="relative h-0">
                <div
                  className="absolute -top-3 w-px h-5 bg-white/40"
                  style={{ left: '85%' }}
                />
                <span
                  className="absolute -top-5 text-[10px] text-slate-400 -translate-x-1/2"
                  style={{ left: '85%' }}
                >
                  85%
                </span>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Atrasado', value: `${vehiculoDetalle.pctAtrasado}%`, color: vehiculoDetalle.pctAtrasado > 20 ? 'text-red-400' : 'text-slate-200' },
                { label: 'Adelantado', value: `${vehiculoDetalle.pctAdelantado}%`, color: 'text-slate-200' },
                { label: 'Sin horario', value: `${vehiculoDetalle.pctSinHorario}%`, color: 'text-slate-400' },
                { label: 'Registros totales', value: vehiculoDetalle.totalEventos, color: 'text-slate-200' },
                {
                  label: 'Velocidad media',
                  value: `${vehiculoDetalle.velocidadMedia} km/h`,
                  color: 'text-slate-200',
                },
                {
                  label: 'Desv. media',
                  value: vehiculoDetalle.desviacionMediaMin !== null
                    ? `${vehiculoDetalle.desviacionMediaMin > 0 ? '+' : ''}${vehiculoDetalle.desviacionMediaMin} min`
                    : '—',
                  color: vehiculoDetalle.desviacionMediaMin !== null && Math.abs(vehiculoDetalle.desviacionMediaMin) > 5
                    ? 'text-red-400'
                    : vehiculoDetalle.desviacionMediaMin !== null && Math.abs(vehiculoDetalle.desviacionMediaMin) > 2
                    ? 'text-yellow-400'
                    : 'text-emerald-400',
                },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-0.5">{kpi.label}</p>
                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Tendencia vs período anterior */}
            {tendencias[vehiculoDetalle.idBus] != null && (
              <div className={`flex items-center gap-3 p-4 rounded-xl border mb-4 ${
                (tendencias[vehiculoDetalle.idBus] as number) > 2
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : (tendencias[vehiculoDetalle.idBus] as number) < -2
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-slate-800 border-slate-700'
              }`}>
                {(tendencias[vehiculoDetalle.idBus] as number) > 2
                  ? <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                  : (tendencias[vehiculoDetalle.idBus] as number) < -2
                  ? <TrendingDown className="w-5 h-5 text-red-400 shrink-0" />
                  : <Minus className="w-5 h-5 text-slate-400 shrink-0" />
                }
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Tendencia vs período anterior ({dias} días previos)</p>
                  <p className={`text-sm font-bold ${
                    (tendencias[vehiculoDetalle.idBus] as number) > 2 ? 'text-emerald-400'
                    : (tendencias[vehiculoDetalle.idBus] as number) < -2 ? 'text-red-400'
                    : 'text-slate-300'
                  }`}>
                    {(tendencias[vehiculoDetalle.idBus] as number) > 0 ? '+' : ''}{tendencias[vehiculoDetalle.idBus]}% en tiempo
                  </p>
                </div>
              </div>
            )}

            {/* Líneas operadas */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Líneas operadas</p>
              {vehiculoDetalle.lineasOperadas.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {vehiculoDetalle.lineasOperadas.map((l) => (
                    <span key={l} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300">
                      <Route className="w-3 h-3" />
                      L{l}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600 text-sm">Sin líneas registradas.</p>
              )}
            </div>

            {/* Última actividad */}
            {vehiculoDetalle.ultimaActividad && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Última actividad: {new Date(vehiculoDetalle.ultimaActividad).toLocaleString('es-UY')}</span>
              </div>
            )}

            {/*
              FASE 5.14 (2026-05-13): AUDIT TRAIL del coche.
              Muestra las ultimas N pasadas individuales (fecha/hora/linea/parada/desv)
              para que un auditor pueda verificar como se construyo el OTP del
              vehiculo. Sin esto, el ranking es opaco — el operador no puede
              defender la cifra.
            */}
            <AuditTrailCoche idBus={vehiculoDetalle.idBus} agencyId={agenciaId} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Audit trail del coche (FASE 5.14) ─────────────────────────────────── */

interface PasadaTrace {
  id: string;
  linea: string;
  estadoCumplimiento: string;
  desviacionMin: number | null;
  velocidad: number;
  proximaParada: string | null;
  tripId: string | null;
  timestampGPS: string;
}

function AuditTrailCoche({ idBus, agencyId }: { idBus: string; agencyId: string }) {
  const [pasadas, setPasadas] = useState<PasadaTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('skillroute_jwt') : null;
    const base = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';
    axios
      .get(`${base}/api/autostats/vehicle-trace/${agencyId}/${encodeURIComponent(idBus)}?days=1&limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => {
        if (cancelled) return;
        setPasadas((r.data?.pasadas ?? []) as PasadaTrace[]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idBus, agencyId]);

  return (
    <div className="mt-5 bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-200">Pasadas registradas (últimas 24 h)</h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Auditoría detallada</span>
      </div>
      {loading && <p className="text-xs text-slate-500">Cargando trazas…</p>}
      {error && <p className="text-xs text-red-400">Error: {error}</p>}
      {!loading && !error && pasadas.length === 0 && (
        <p className="text-xs text-slate-500">Sin pasadas registradas en este período.</p>
      )}
      {!loading && !error && pasadas.length > 0 && (
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-left text-slate-500 uppercase tracking-wider">
                <th className="py-1 pr-3 font-semibold">Fecha y hora</th>
                <th className="py-1 pr-3 font-semibold">Línea</th>
                <th className="py-1 pr-3 font-semibold">Punto de control</th>
                <th className="py-1 pr-3 font-semibold">Trip GTFS</th>
                <th className="py-1 pr-3 font-semibold">Velocidad</th>
                <th className="py-1 pr-3 font-semibold">Cumplimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pasadas.slice(0, 60).map((p) => (
                <tr key={p.id} className="text-slate-300 hover:bg-slate-800/30">
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-400">
                    {new Date(p.timestampGPS).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-1.5 pr-3">L{p.linea}</td>
                  <td className="py-1.5 pr-3 max-w-[220px] truncate text-slate-400" title={p.proximaParada ?? ''}>
                    {p.proximaParada ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-500">{p.tripId ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-400">{p.velocidad} km/h</td>
                  <td className="py-1.5 pr-3">
                    <AdherenceLabel desviacionMin={p.desviacionMin} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-600 mt-2">
        Cada fila es un ping GPS guardado en <code>vehicle_events</code> con su comparación contra el horario oficial GTFS.
        Estándar internacional: en tiempo = adherencia en [−1, +5] min (TCRP 165 / WMATA / LA Metro).
      </p>
    </div>
  );
}
