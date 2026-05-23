/**
 * ExecutiveSummary.tsx — Panel Ejecutivo Cross-Operador
 * ======================================================
 * Resumen ejecutivo de posición de mercado en 30 segundos.
 * Consume `corridor_overlap` (1850 pares DRO pre-calculados).
 *
 * Métricas clave:
 *   - % corredores ganados vs perdidos (DRO como proxy de ventaja/amenaza)
 *   - Top 3 amenazas (DRO rival > 30% en corredores compartidos)
 *   - Top 3 oportunidades (DRO propio alto, rival bajo)
 *   - Km de red compartida por rival
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Activity,
  Network,
  Loader2,
  RefreshCw,
  Building2,
  MapPin,
  FileDown,
} from 'lucide-react';
import { useEmpresaPropia, EMPRESAS_OPCIONES, type EmpresaConfig } from '../../hooks/useEmpresaPropia';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface OverlapDoc {
  key: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  sentidoA: string;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  sentidoB: string;
  pctAInB: number;   // % de la ruta A cubierta por B
  sharedKm: number;
  sameEmpresa: boolean;
}

interface RivalSummary {
  agencyId: string;
  empresa: string;
  label: string;
  color: string;
  sharedKm: number;
  pairsTotal: number;
  avgDroPropioEnRival: number; // pctAInB con A=propio
  avgDroRivalEnPropio: number; // pctAInB con A=rival
  ganados: number;  // pares donde DRO propio > DRO rival (ventaja)
  perdidos: number; // pares donde DRO rival > DRO propio (amenaza)
}

interface ThreatOpportunity {
  linea: string;
  lineaRival: string;
  empresa: string;
  label: string;
  color: string;
  sharedKm: number;
  droPropioEnRival: number;
  droRivalEnPropio: number;
  diferencia: number; // positivo = ventaja propia, negativo = amenaza
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getEmpresaConfig(agencyId: string): EmpresaConfig | undefined {
  return EMPRESAS_OPCIONES.find((e) => e.agencyId === agencyId);
}

function colorBar(color: string, pct: number) {
  return (
    <div className="relative h-2 rounded-full bg-slate-700/50 overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function ExecutiveSummary() {
  const { empresaCfg } = useEmpresaPropia();
  const myAgencyId = empresaCfg.agencyId;

  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Carga de datos ────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Dos queries paralelas por agencyId — evita que limit(5000) corte los pares
      // "70-..." (UCOT como agencyA) que caen al final del sort por doc ID.
      // Sin este fix: 0 pares como agencyA → balance "0% gané / 100% perdido".
      const [snapA, snapB] = await Promise.all([
        getDocs(query(collection(db, 'corridor_overlap'), where('agencyA', '==', myAgencyId))),
        getDocs(query(collection(db, 'corridor_overlap'), where('agencyB', '==', myAgencyId))),
      ]);
      const dedup = new Map<string, OverlapDoc>();
      [...snapA.docs, ...snapB.docs].forEach((d) => {
        const o = d.data() as OverlapDoc;
        if (!dedup.has(o.key)) dedup.set(o.key, o);
      });
      setOverlaps(Array.from(dedup.values()));
      setLastRefresh(new Date());
    } catch (e) {
      setError('No se pudo cargar la colección corridor_overlap.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [myAgencyId]);

  // ── Cálculos derivados ────────────────────────────────────────────────

  const {
    kpis,
    rivalSummaries,
    topAmenazas,
    topOportunidades,
    maxSharedKm,
  } = useMemo(() => {
    if (!overlaps.length) return {
      kpis: { pares: 0, kmTotal: 0, operadoresRivales: 0, pctGanados: 0, pctPerdidos: 0 },
      rivalSummaries: [] as RivalSummary[],
      topAmenazas: [] as ThreatOpportunity[],
      topOportunidades: [] as ThreatOpportunity[],
      maxSharedKm: 1,
    };

    // Filtrar solo pares cross-operador que involucran a la empresa propia
    // Par "propio como A": propio ataca al rival (pctAInB = % propio cubierto por rival)
    // Par "propio como B": rival ataca al propio
    const pairsAsA = overlaps.filter(
      (o) => !o.sameEmpresa && o.agencyA === myAgencyId,
    );
    const pairsAsB = overlaps.filter(
      (o) => !o.sameEmpresa && o.agencyB === myAgencyId,
    );

    // Construir lookup rival→pares bidireccionales
    const rivalMap = new Map<string, {
      asA: OverlapDoc[];
      asB: OverlapDoc[];
      empresa: string;
    }>();

    for (const p of pairsAsA) {
      if (!rivalMap.has(p.agencyB)) rivalMap.set(p.agencyB, { asA: [], asB: [], empresa: p.empresaB });
      rivalMap.get(p.agencyB)!.asA.push(p);
    }
    for (const p of pairsAsB) {
      if (!rivalMap.has(p.agencyA)) rivalMap.set(p.agencyA, { asA: [], asB: [], empresa: p.empresaA });
      rivalMap.get(p.agencyA)!.asB.push(p);
    }

    // Métricas por rival
    const rivalSummaries: RivalSummary[] = [];
    let totalGanados = 0;
    let totalPerdidos = 0;
    let totalPares = 0;
    let totalKm = 0;

    for (const [agencyId, { asA, asB, empresa }] of rivalMap.entries()) {
      const cfg = getEmpresaConfig(agencyId);
      if (!cfg) continue;

      const sharedKm = [
        ...asA.map((o) => o.sharedKm),
        ...asB.map((o) => o.sharedKm),
      ].reduce((s, v) => s + v, 0) / 2; // promedio para no duplicar

      const avgDroPropioEnRival = asA.length
        ? asA.reduce((s, o) => s + o.pctAInB, 0) / asA.length
        : 0;
      const avgDroRivalEnPropio = asB.length
        ? asB.reduce((s, o) => s + o.pctAInB, 0) / asB.length
        : 0;

      // Ganado = propio cubre más al rival que el rival lo cubre a mí
      // Mirror debe coincidir en líneas Y en sentido (IDA vs IDA, VUELTA vs VUELTA)
      const ganados = asA.filter((o) => {
        const mirror = asB.find(
          (b) => b.lineaA === o.lineaB && b.lineaB === o.lineaA &&
                 b.sentidoA === o.sentidoB && b.sentidoB === o.sentidoA,
        );
        const rivalDro = mirror ? mirror.pctAInB : 0;
        return o.pctAInB > rivalDro;
      }).length;

      const perdidos = asA.filter((o) => {
        const mirror = asB.find(
          (b) => b.lineaA === o.lineaB && b.lineaB === o.lineaA &&
                 b.sentidoA === o.sentidoB && b.sentidoB === o.sentidoA,
        );
        const rivalDro = mirror ? mirror.pctAInB : 0;
        return o.pctAInB < rivalDro;
      }).length;

      totalGanados += ganados;
      totalPerdidos += perdidos;
      totalPares += asA.length + asB.length;
      totalKm += sharedKm;

      rivalSummaries.push({
        agencyId,
        empresa,
        label: cfg.label,
        color: cfg.color,
        sharedKm,
        pairsTotal: asA.length + asB.length,
        avgDroPropioEnRival,
        avgDroRivalEnPropio,
        ganados,
        perdidos,
      });
    }

    rivalSummaries.sort((a, b) => b.sharedKm - a.sharedKm);

    // Top amenazas: pares donde el rival cubre mucho de mi ruta (asB, pctAInB alto)
    const amenazas: ThreatOpportunity[] = pairsAsB
      .filter((o) => o.pctAInB >= 10)
      .map((o): ThreatOpportunity => {
        const cfg = getEmpresaConfig(o.agencyA);
        const mirror = pairsAsA.find(
          (a) => a.lineaB === o.lineaA && a.lineaA === o.lineaB,
        );
        const droPropioEnRival = mirror ? mirror.pctAInB : 0;
        return {
          linea: o.lineaB,
          lineaRival: o.lineaA,
          empresa: o.empresaA,
          label: cfg?.label ?? o.empresaA,
          color: cfg?.color ?? '#94a3b8',
          sharedKm: o.sharedKm,
          droPropioEnRival,
          droRivalEnPropio: o.pctAInB,
          diferencia: droPropioEnRival - o.pctAInB, // negativo = amenaza
        };
      })
      .sort((a, b) => a.diferencia - b.diferencia) // más negativo primero
      .slice(0, 3);

    // Top oportunidades: pares donde yo cubro mucho al rival (asA, pctAInB alto)
    const oportunidades: ThreatOpportunity[] = pairsAsA
      .filter((o) => o.pctAInB >= 10)
      .map((o): ThreatOpportunity => {
        const cfg = getEmpresaConfig(o.agencyB);
        const mirror = pairsAsB.find(
          (b) => b.lineaA === o.lineaB && b.lineaB === o.lineaA,
        );
        const droRivalEnPropio = mirror ? mirror.pctAInB : 0;
        return {
          linea: o.lineaA,
          lineaRival: o.lineaB,
          empresa: o.empresaB,
          label: cfg?.label ?? o.empresaB,
          color: cfg?.color ?? '#94a3b8',
          sharedKm: o.sharedKm,
          droPropioEnRival: o.pctAInB,
          droRivalEnPropio,
          diferencia: o.pctAInB - droRivalEnPropio, // positivo = ventaja
        };
      })
      .sort((a, b) => b.diferencia - a.diferencia) // más positivo primero
      .slice(0, 3);

    const pctGanados = totalPares > 0 ? Math.round((totalGanados / (totalGanados + totalPerdidos || 1)) * 100) : 0;
    const maxSharedKm = Math.max(...rivalSummaries.map((r) => r.sharedKm), 1);

    return {
      kpis: {
        pares: pairsAsA.length + pairsAsB.length,
        kmTotal: Math.round(totalKm),
        operadoresRivales: rivalSummaries.length,
        pctGanados,
        pctPerdidos: 100 - pctGanados,
      },
      rivalSummaries,
      topAmenazas: amenazas,
      topOportunidades: oportunidades,
      maxSharedKm,
    };
  }, [overlaps, myAgencyId]);

  // ── Exportar PDF ejecutivo ─────────────────────────────────────────────

  const exportPDF = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const PW = doc.internal.pageSize.getWidth();   // 210
      const margin = 16;
      const cw = PW - margin * 2;
      let y = 0;

      // ── Cabecera ──────────────────────────────────────────────────────
      doc.setFillColor(15, 23, 42);   // slate-950
      doc.rect(0, 0, PW, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('SkillRoute', margin, 12);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('INTELIGENCIA DE RED — REPORTE EJECUTIVO', margin, 19);

      const now = new Date();
      const fechaStr = now.toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.setFontSize(7);
      doc.text(`${empresaCfg.label} · ${fechaStr}`, PW - margin, 12, { align: 'right' });
      doc.setTextColor(251, 146, 60); // orange-400
      doc.text('CONFIDENCIAL', PW - margin, 19, { align: 'right' });

      y = 36;

      // ── KPIs ──────────────────────────────────────────────────────────
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('MÉTRICAS DE POSICIÓN DE MERCADO', margin, y);
      y += 5;

      const kpiW = cw / 4 - 2;
      const kpiItems = [
        { label: 'Pares analizados', value: kpis.pares.toLocaleString('es-UY'), unit: 'corredores' },
        { label: 'Red compartida', value: `${kpis.kmTotal.toLocaleString('es-UY')} km`, unit: 'con rivales' },
        { label: 'Operadores rivales', value: String(kpis.operadoresRivales), unit: 'activos' },
        { label: 'Balance de red', value: `${kpis.pctGanados}%`, unit: 'corredores ganados' },
      ];

      kpiItems.forEach((k, i) => {
        const x = margin + i * (kpiW + 2.5);
        doc.setFillColor(241, 245, 249);  // slate-100
        doc.roundedRect(x, y, kpiW, 20, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);  // slate-500
        doc.text(k.label.toUpperCase(), x + 3, y + 5);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(k.value, x + 3, y + 13);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(k.unit, x + 3, y + 18);
      });

      y += 27;

      // ── Amenazas y Oportunidades ───────────────────────────────────────
      const colW = (cw - 4) / 2;

      // Columna izquierda — Amenazas
      doc.setFillColor(254, 242, 242); // red-50
      doc.roundedRect(margin, y, colW, 6, 1, 1, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 28, 28);   // red-700
      doc.text('▼  TOP 3 AMENAZAS', margin + 3, y + 4.5);

      // Columna derecha — Oportunidades
      doc.setFillColor(240, 253, 244); // green-50
      doc.roundedRect(margin + colW + 4, y, colW, 6, 1, 1, 'F');
      doc.setTextColor(21, 128, 61);   // green-700
      doc.text('▲  TOP 3 OPORTUNIDADES', margin + colW + 7, y + 4.5);

      y += 9;

      const rowH = 18;
      const renderThreatRows = (
        items: ThreatOpportunity[],
        xOffset: number,
        tipo: 'amenaza' | 'oportunidad',
      ) => {
        items.forEach((item, i) => {
          const rx = margin + xOffset;
          const ry = y + i * (rowH + 2);
          const isA = tipo === 'amenaza';
          doc.setFillColor(isA ? 255 : 240, isA ? 249 : 253, isA ? 249 : 244);
          doc.roundedRect(rx, ry, colW, rowH, 1.5, 1.5, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(`${i + 1}. Línea ${item.linea}  vs  ${item.label} · L${item.lineaRival}`, rx + 3, ry + 5);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`${item.sharedKm.toFixed(1)} km compartidos`, rx + 3, ry + 10);
          doc.setTextColor(isA ? 185 : 21, isA ? 28 : 128, isA ? 28 : 61);
          doc.text(
            `Mi DRO: ${item.droPropioEnRival.toFixed(0)}%   DRO rival: ${item.droRivalEnPropio.toFixed(0)}%   Δ ${Math.abs(item.diferencia).toFixed(0)}%`,
            rx + 3,
            ry + 15,
          );
        });
      };

      renderThreatRows(topAmenazas, 0, 'amenaza');
      renderThreatRows(topOportunidades, colW + 4, 'oportunidad');

      const filasUsadas = Math.max(topAmenazas.length, topOportunidades.length, 1);
      y += filasUsadas * (rowH + 2) + 8;

      // ── Distribución por rival ─────────────────────────────────────────
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y, cw, 6, 1, 1, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235); // blue-600
      doc.text('DISTRIBUCIÓN POR OPERADOR RIVAL', margin + 3, y + 4.5);
      y += 9;

      // Cabecera de tabla
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('Operador', margin + 3, y + 3);
      doc.text('Km compartidos', margin + 45, y + 3);
      doc.text('DRO propio prom.', margin + 85, y + 3);
      doc.text('DRO rival prom.', margin + 118, y + 3);
      doc.text('% Ganados', margin + 151, y + 3);
      y += 6;

      rivalSummaries.forEach((r, i) => {
        const ry = y + i * 9;
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, ry, cw, 9, 'F');
        }
        const balance = r.ganados + r.perdidos > 0
          ? Math.round((r.ganados / (r.ganados + r.perdidos)) * 100)
          : 50;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(r.label, margin + 3, ry + 6);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(`${r.sharedKm.toFixed(0)} km`, margin + 48, ry + 6);
        doc.text(`${r.avgDroPropioEnRival.toFixed(0)}%`, margin + 92, ry + 6);
        doc.text(`${r.avgDroRivalEnPropio.toFixed(0)}%`, margin + 124, ry + 6);

        const balColor: [number, number, number] = balance >= 50
          ? [21, 128, 61] : [185, 28, 28];
        doc.setTextColor(...balColor);
        doc.setFont('helvetica', 'bold');
        doc.text(`${balance}%`, margin + 158, ry + 6);
      });

      y += rivalSummaries.length * 9 + 8;

      // ── Footer ────────────────────────────────────────────────────────
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, footerY - 3, PW - margin, footerY - 3);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Generado por SkillRoute Intelligence · ${empresaCfg.label} · ${now.toLocaleString('es-UY')} · Uso exclusivo interno`,
        margin,
        footerY,
      );
      doc.text('skillroute.uy', PW - margin, footerY, { align: 'right' });

      // ── Guardar ───────────────────────────────────────────────────────
      const filename = `SkillRoute_Inteligencia_${empresaCfg.label.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('[ExportPDF]', err);
    } finally {
      setExporting(false);
    }
  };

  // ── Render estados ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        <span className="text-slate-400 text-sm">Calculando posición de mercado…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={loadData} className="text-xs text-blue-400 hover:text-blue-300 underline">
          Reintentar
        </button>
      </div>
    );
  }

  if (!overlaps.length) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Network className="w-10 h-10 text-slate-600" />
        <p className="text-slate-400 text-sm">Sin datos en corridor_overlap.</p>
        <p className="text-slate-500 text-xs">Ejecutá el script droMatrix.ts para generar los pares.</p>
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-200">Inteligencia de Red</h2>
          <p className="text-sm text-slate-400 mt-1">
            Posición competitiva de{' '}
            <span className="font-semibold" style={{ color: empresaCfg.color }}>
              {empresaCfg.label}
            </span>{' '}
            en el sistema metropolitano
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-500">
              Actualizado {lastRefresh.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={exportPDF}
            disabled={exporting || loading || !overlaps.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/50 disabled:opacity-40 text-xs font-medium transition-all"
          >
            {exporting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileDown className="w-3.5 h-3.5" />
            }
            {exporting ? 'Generando…' : 'Exportar PDF'}
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-xs font-medium transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          icon={<Network className="w-5 h-5 text-blue-400" />}
          label="Pares analizados"
          value={kpis.pares.toLocaleString('es-UY')}
          sub="corredores cross-operador"
        />
        <KpiCard
          icon={<MapPin className="w-5 h-5 text-orange-400" />}
          label="Km de red compartida"
          value={`${kpis.kmTotal.toLocaleString('es-UY')} km`}
          sub="con todos los rivales"
        />
        <KpiCard
          icon={<Building2 className="w-5 h-5 text-purple-400" />}
          label="Operadores rivales"
          value={String(kpis.operadoresRivales)}
          sub="con solapamiento activo"
        />
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-slate-500 uppercase tracking-widest">Balance</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400">{kpis.pctGanados}%</span>
            <span className="text-sm text-slate-400">gano</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-red-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${kpis.pctGanados}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{kpis.pctPerdidos}% perdido frente a rivales</p>
        </div>
      </div>

      {/* Amenazas y Oportunidades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top 3 amenazas */}
        <div className="bg-slate-900 border border-red-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-slate-200">Top 3 Amenazas</h3>
            <span className="ml-auto text-xs text-slate-500">rival llega antes en este corredor</span>
          </div>
          {topAmenazas.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">Sin amenazas detectadas con DRO ≥10%</p>
          ) : (
            <div className="space-y-3">
              {topAmenazas.map((t, i) => (
                <ThreatRow key={i} item={t} tipo="amenaza" index={i + 1} />
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600 mt-4">
            DRO rival &gt; DRO propio → rival cubre más de mi red en ese tramo
          </p>
        </div>

        {/* Top 3 oportunidades */}
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Top 3 Oportunidades</h3>
            <span className="ml-auto text-xs text-slate-500">ventaja que podría ampliarse</span>
          </div>
          {topOportunidades.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">Sin oportunidades detectadas con DRO ≥10%</p>
          ) : (
            <div className="space-y-3">
              {topOportunidades.map((t, i) => (
                <ThreatRow key={i} item={t} tipo="oportunidad" index={i + 1} />
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600 mt-4">
            DRO propio &gt; DRO rival → cubro más del corredor rival que él del mío
          </p>
        </div>
      </div>

      {/* Distribución por rival */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">Distribución por Operador Rival</h3>
          <span className="text-xs text-slate-500 ml-auto">km de red compartida y DRO promedio</span>
        </div>

        {rivalSummaries.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Sin rivales con pares cross-operador detectados</p>
        ) : (
          <div className="space-y-5">
            {rivalSummaries.map((r) => (
              <RivalBar key={r.agencyId} rival={r} maxKm={maxSharedKm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function ThreatRow({
  item,
  tipo,
  index,
}: {
  item: ThreatOpportunity;
  tipo: 'amenaza' | 'oportunidad';
  index: number;
}) {
  const isAmenaza = tipo === 'amenaza';
  const difAbs = Math.abs(item.diferencia);
  const myDro = isAmenaza ? item.droPropioEnRival : item.droPropioEnRival;
  const rivalDro = item.droRivalEnPropio;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          isAmenaza ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
        }`}
      >
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">Línea {item.linea}</span>
          <span className="text-xs text-slate-500">vs</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${item.color}20`, color: item.color }}>
            {item.label} · L{item.lineaRival}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
          <span>{item.sharedKm.toFixed(1)} km compartidos</span>
          <span className={isAmenaza ? 'text-red-400' : 'text-emerald-400'}>
            {isAmenaza ? <TrendingDown className="w-3 h-3 inline mr-0.5" /> : <TrendingUp className="w-3 h-3 inline mr-0.5" />}
            Δ {difAbs.toFixed(0)}% DRO
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <span>Mi DRO: <span className="text-blue-400 font-semibold">{myDro.toFixed(0)}%</span></span>
          <span>DRO rival: <span className={`font-semibold ${isAmenaza ? 'text-red-400' : 'text-slate-300'}`}>{rivalDro.toFixed(0)}%</span></span>
        </div>
      </div>
    </div>
  );
}

function RivalBar({ rival, maxKm }: { rival: RivalSummary; maxKm: number }) {
  const pctBar = (rival.sharedKm / maxKm) * 100;
  const balance = rival.ganados + rival.perdidos > 0
    ? Math.round((rival.ganados / (rival.ganados + rival.perdidos)) * 100)
    : 50;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: rival.color }}
          />
          <span className="text-sm font-semibold text-slate-200">{rival.label}</span>
          <span className="text-xs text-slate-500">· {rival.pairsTotal} pares</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-400">
            <span className="text-white font-semibold">{rival.sharedKm.toFixed(0)} km</span> compartidos
          </span>
          <span className={`font-semibold ${balance >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
            {balance}% ganados
          </span>
        </div>
      </div>
      {colorBar(rival.color, pctBar)}
      <div className="flex items-center justify-between mt-1.5 text-xs text-slate-600">
        <span>DRO propio prom: {rival.avgDroPropioEnRival.toFixed(0)}%</span>
        <span>DRO rival prom: {rival.avgDroRivalEnPropio.toFixed(0)}%</span>
      </div>
    </div>
  );
}
