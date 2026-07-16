import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingDown,
  ShieldAlert,
  BarChart3,
  Download,
  RefreshCw,
  Clock,
  Activity,
  AlertCircle,
  Database,
  Calendar,
  Layers,
  MapPin,
  CheckCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '../../clients/apiClient';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colores oficiales por operador
const OPERATOR_METADATA: Record<string, { label: string; color: string; rgb: [number, number, number]; bgClass: string; textClass: string; borderClass: string }> = {
  '50': {
    label: 'CUTCSA',
    color: '#EF4444', // Red
    rgb: [239, 68, 68],
    bgClass: 'bg-red-950/20 border-red-500/20',
    textClass: 'text-red-400',
    borderClass: 'border-l-red-500',
  },
  '70': {
    label: 'UCOT',
    color: '#F97316', // Orange
    rgb: [249, 115, 22],
    bgClass: 'bg-orange-950/20 border-orange-500/20',
    textClass: 'text-orange-400',
    borderClass: 'border-l-orange-500',
  },
  '20': {
    label: 'COME',
    color: '#22C55E', // Green
    rgb: [34, 197, 94],
    bgClass: 'bg-emerald-950/20 border-emerald-500/20',
    textClass: 'text-emerald-400',
    borderClass: 'border-l-emerald-500',
  },
  '10': {
    label: 'COETC',
    color: '#FACC15', // Yellow
    rgb: [250, 204, 21],
    bgClass: 'bg-yellow-950/20 border-yellow-500/20',
    textClass: 'text-yellow-400',
    borderClass: 'border-l-yellow-500',
  },
};

const DEFAULT_METADATA = {
  label: 'Desconocido',
  color: '#64748B',
  rgb: [100, 116, 139] as [number, number, number],
  bgClass: 'bg-slate-900/60 border-slate-800',
  textClass: 'text-slate-400',
  borderClass: 'border-l-slate-500',
};

interface ResumenData {
  meta: {
    generado_en: string;
    ms: number;
    ciudad: string;
    pais: string;
    operadores_monitoreados: Array<{ id: string; name: string }>;
    fuente: string;
  };
  salud_sistema: {
    poller: {
      total_ciclos: number;
      total_buses_recibidos: number;
      total_eventos_persistidos: number;
      ultimo_ciclo: string;
      segundos_desde_ultimo_ciclo: number;
      estado: 'LIVE' | 'STALE';
    };
    eventos_historicos_totales: number;
  };
  cobertura_24h: Array<{
    agency_id: string;
    operador: string;
    eventos: number;
    buses_unicos: number;
    lineas_activas: number;
  }>;
  buses_live_5min: Array<{
    agency_id: string;
    operador: string;
    buses_live: number;
  }>;
  otp_hoy_por_operador: Array<{
    agency_id: string;
    operador: string;
    eventos_clasificados: number;
    en_tiempo: number;
    pct_otp: number;
  }>;
  top_10_lineas_mas_problematicas_3d: Array<{
    agency_id: string;
    operador: string;
    linea: string;
    muestras: number;
    pct_en_tiempo: number;
  }>;
  cartones: {
    por_agencia: Array<{
      agency_id: string;
      operador: string;
      total: number;
    }>;
    total_cargados: number;
  };
  dro_cross_operador: {
    total_pares: number;
    t1_alta_competencia: number;
    t2_media_competencia: number;
    t3_baja_competencia: number;
  };
  alertas_regulacion_ultimas_24h: Array<{
    agency_id: string;
    operador: string;
    total: number;
  }>;
}

export default function ExecutiveCoverage() {
  const { token } = useAuth();
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ResumenData>('/api/audit/resumen-imm');
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Error al obtener los datos de la API.');
      }
    } catch (err: any) {
      console.error('[ExecutiveCoverage] Error fetching resumen:', err);
      setError(err?.message || 'Error de red al comunicarse con el servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  // Cálculos consolidados
  const totalLiveBuses = data?.buses_live_5min?.reduce((acc, b) => acc + (b.buses_live || 0), 0) || 0;
  
  // OTP Metropolitana Promedio Ponderado
  const totalClasificados = data?.otp_hoy_por_operador?.reduce((acc, r) => acc + (r.eventos_clasificados || 0), 0) || 0;
  const totalEnTiempo = data?.otp_hoy_por_operador?.reduce((acc, r) => acc + (r.en_tiempo || 0), 0) || 0;
  const avgOtpMetropolitan = totalClasificados > 0 ? Number(((totalEnTiempo / totalClasificados) * 100).toFixed(2)) : 0;

  // Total buses únicos registrados hoy (24h)
  const totalBuses24h = data?.cobertura_24h?.reduce((acc, r) => acc + (r.buses_unicos || 0), 0) || 0;

  // Exportar PDF Profesional (Rediseño Estilo McKinsey/Optibus)
  const handleExportPDF = () => {
    if (!data) return;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Paleta Premium (Optibus/Swiftly feel)
    const primaryBlue = [30, 58, 138]; // slate-900 / blue-900
    const accentCyan = [6, 182, 212];
    const surfaceGray = [248, 250, 252];

    // Encabezado principal (Banda de color)
    doc.setFillColor(15, 23, 42); // bg-slate-950
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFillColor(6, 182, 212); // cyan line
    doc.rect(0, 35, pageWidth, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('SKILLROUTE', 14, 20);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(148, 163, 184);
    doc.text('| INTELLIGENCE HUB • REPORTE METROPOLITANO', 65, 20);

    doc.setFontSize(9);
    doc.text(`Generado: ${new Date(data.meta.generado_en).toLocaleString('es-UY')} • Fuente: ${data.meta.fuente} • Confidencial`, 14, 28);

    // KPI Dashboard Panel
    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(14, 45, pageWidth - 28, 25, 3, 3, 'F');

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('MÉTRICAS CONSOLIDADAS AL CORTE', 20, 52);

    // Valores KPIs distribuidos en landscape
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalLiveBuses}`, 20, 62);
    doc.text(`${avgOtpMetropolitan}%`, 80, 62);
    doc.text(`${totalBuses24h}`, 140, 62);
    doc.text(`${data.cartones.total_cargados}`, 200, 62);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Flota Activa (5 min)', 20, 66);
    doc.text('OTP Promedio Metropolitana', 80, 66);
    doc.text('Buses Únicos Hoy (24h)', 140, 66);
    doc.text('Servicios Planificados (Cartones)', 200, 66);

    // Tablas Lado a Lado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('1. Cobertura y Cumplimiento por Operador', 14, 82);
    doc.text('2. Top 10 Líneas Críticas (Bajo OTP)', 155, 82);

    // Tabla 1 (Izquierda)
    const tableData1 = data.otp_hoy_por_operador.map((otp) => {
      const cob = data.cobertura_24h.find((c) => c.agency_id === otp.agency_id);
      const live = data.buses_live_5min.find((b) => b.agency_id === otp.agency_id);
      const metadata = OPERATOR_METADATA[otp.agency_id] || DEFAULT_METADATA;
      
      return [
        metadata.label,
        live?.buses_live ?? 0,
        cob?.buses_unicos ?? 0,
        cob?.lineas_activas ?? 0,
        cob?.eventos.toLocaleString('es-UY') ?? 0,
        `${otp.pct_otp}%`,
      ];
    });

    autoTable(doc, {
      head: [['Operador', 'Live(5m)', 'Únicos(24h)', 'Líneas', 'Eventos(24h)', 'OTP%']],
      body: tableData1,
      startY: 86,
      margin: { left: 14, right: 155 },
      tableWidth: 130,
      styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [15, 23, 42] },
        5: { fontStyle: 'bold', textColor: [2, 132, 199] }
      }
    });

    // Tabla 2 (Derecha)
    const tableData2 = data.top_10_lineas_mas_problematicas_3d.slice(0, 8).map((linea, index) => {
      const metadata = OPERATOR_METADATA[linea.agency_id] || DEFAULT_METADATA;
      return [
        `#${index + 1}`,
        linea.linea,
        metadata.label,
        `${linea.pct_en_tiempo}%`,
      ];
    });

    autoTable(doc, {
      head: [['Rank', 'Línea', 'Operador', 'OTP%']],
      body: tableData2,
      startY: 86,
      margin: { left: 155, right: 14 },
      tableWidth: pageWidth - 169,
      styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { halign: 'center' },
        1: { fontStyle: 'bold', textColor: [15, 23, 42] },
        3: { fontStyle: 'bold', textColor: [220, 38, 38] }
      }
    });

    const finalY1 = (doc as any).lastAutoTable.finalY || 100;
    
    // Tabla 3 Salud del sistema en la parte inferior
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Integración STM y Competitividad', 14, finalY1 + 15);

    const tableData3 = [
      ['Estado Poller STM', data.salud_sistema.poller.estado, `Último ciclo hace ${data.salud_sistema.poller.segundos_desde_ultimo_ciclo}s`],
      ['Total Eventos STM Hoy', data.salud_sistema.poller.total_eventos_persistidos.toLocaleString('es-UY'), `De un total histórico de ${data.salud_sistema.eventos_historicos_totales.toLocaleString('es-UY')}`],
      ['Inteligencia DRO', `${data.dro_cross_operador.total_pares} Corredores Analizados`, `Alta Competencia: ${data.dro_cross_operador.t1_alta_competencia} | Media: ${data.dro_cross_operador.t2_media_competencia}`],
    ];

    autoTable(doc, {
      head: [['Métrica', 'Valor', 'Detalle']],
      body: tableData3,
      startY: finalY1 + 19,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    // Footer de página
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`SkillRoute Intelligence Hub • Página ${i} de ${totalPages} • Reporte Confidencial Generado Automáticamente`, 14, pageHeight - 10);
    }

    const todayDate = new Date().toISOString().slice(0, 10);
    doc.save(`skillroute_intelligence_${todayDate}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm font-semibold">Cargando Resumen Ejecutivo Metropolitano...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 max-w-md text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Error al cargar datos</h2>
          <p className="text-sm text-slate-400">{error || 'No se pudieron recuperar los indicadores de cobertura ejecutiva.'}</p>
          <button
            onClick={fetchResumen}
            className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Preparar datos para los gráficos
  const chartLiveBusesData = data.buses_live_5min.map((item) => {
    const meta = OPERATOR_METADATA[item.agency_id] || DEFAULT_METADATA;
    return {
      name: meta.label,
      "Buses Activos": item.buses_live,
      color: meta.color,
    };
  });

  const chartOtpData = data.otp_hoy_por_operador.map((item) => {
    const meta = OPERATOR_METADATA[item.agency_id] || DEFAULT_METADATA;
    return {
      name: meta.label,
      "OTP %": item.pct_otp,
      color: meta.color,
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 space-y-6 pb-24">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <ShieldCheck className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-100 via-white to-blue-200 drop-shadow-sm">
              Intelligence Hub & Cobertura
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                Executive
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                STM Link:
                <span className={`font-bold ${data.salud_sistema.poller.estado === 'LIVE' ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {data.salud_sistema.poller.estado === 'LIVE' ? 'LIVE' : 'STALE'}
                </span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {new Date(data.meta.generado_en).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchResumen}
            className="flex items-center gap-2 bg-slate-900/50 hover:bg-slate-800 border border-slate-700/50 text-slate-300 text-xs px-4 py-2.5 rounded-xl font-bold transition-all hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
            title="Refrescar datos de la API"
          >
            <RefreshCw className="w-4 h-4" />
            Refrescar
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs px-5 py-2.5 rounded-xl font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all hover:scale-105 border border-blue-400/30"
          >
            <Download className="w-4 h-4" />
            Exportar Informe PDF
          </button>
        </div>
      </div>

      {/* Tarjetas KPI Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Flota Activa */}
        <div className="glass-panel p-5 relative overflow-hidden group hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 border-t border-t-white/5 hover:border-t-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)]">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Activity className="w-16 h-16 text-blue-400" />
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Flota en Servicio Activa
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{totalLiveBuses}</span>
            <span className="text-xs text-slate-400">buses (5m)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Unidades reportando GPS en los últimos 5 minutos.
          </p>
        </div>

        {/* KPI 2: OTP Metropolitana */}
        <div className="glass-panel p-5 relative overflow-hidden group hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 border-t border-t-white/5 hover:border-t-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)]">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <ShieldCheck className="w-16 h-16 text-emerald-400" />
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            OTP Metropolitana Promedio
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-black ${avgOtpMetropolitan >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {avgOtpMetropolitan}%
            </span>
            <span className="text-xs text-slate-400">en tiempo</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Puntualidad global ponderada bajo margen ±4 min.
          </p>
        </div>

        {/* KPI 3: Flota Total Única */}
        <div className="glass-panel p-5 relative overflow-hidden group hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 border-t border-t-white/5 hover:border-t-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)]">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Layers className="w-16 h-16 text-purple-400" />
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Flota Acumulada 24h
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{totalBuses24h}</span>
            <span className="text-xs text-slate-400">buses únicos</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Vehículos diferentes detectados a lo largo del día.
          </p>
        </div>

        {/* KPI 4: Servicios Planificados */}
        <div className="glass-panel p-5 relative overflow-hidden group hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 border-t border-t-white/5 hover:border-t-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)]">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Calendar className="w-16 h-16 text-yellow-400" />
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Servicios Planificados (Cartones)
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white">{data.cartones.total_cargados}</span>
            <span className="text-xs text-slate-400">cargados</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Cartones activos en base de datos para la jornada.
          </p>
        </div>
      </div>

      {/* Gráficos Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Buses Activos */}
        <div className="glass-panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Flota en Operación Activa por Operador
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Cantidad de unidades móviles reportando señal de geolocalización activa (ventana de 5 minutos).
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartLiveBusesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#F8FAFC', fontSize: '11px' }}
                  itemStyle={{ color: '#94A3B8', fontSize: '11px' }}
                />
                <Bar dataKey="Buses Activos" radius={[6, 6, 0, 0]}>
                  {chartLiveBusesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: OTP% */}
        <div className="glass-panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Cumplimiento de Horarios (OTP %) por Operador
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Porcentaje de viajes en tiempo (tolerancia TCRP 165 de 1 min adelantado a 4 min atrasado).
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartOtpData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#F8FAFC', fontSize: '11px' }}
                  itemStyle={{ color: '#94A3B8', fontSize: '11px' }}
                />
                <Bar dataKey="OTP %" radius={[6, 6, 0, 0]}>
                  {chartOtpData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Grid de Tablas: Comparativa Detallada & Top 10 Problemáticas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabla Comparativa de Operadores (Columnas 2) */}
        <div className="lg:col-span-2 glass-panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Comparativa Detallada Cross-Op
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Desglose consolidado de la cobertura e indicadores acumulados de las últimas 24 horas.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3 border-b border-slate-800">Operador</th>
                  <th className="px-4 py-3 border-b border-slate-800 text-center">Buses Activos (5m)</th>
                  <th className="px-4 py-3 border-b border-slate-800 text-center">Buses Únicos (24h)</th>
                  <th className="px-4 py-3 border-b border-slate-800 text-center">Líneas Activas</th>
                  <th className="px-4 py-3 border-b border-slate-800 text-center">Alertas Reg. (24h)</th>
                  <th className="px-4 py-3 border-b border-slate-800 text-center">OTP%</th>
                </tr>
              </thead>
              <tbody>
                {data.otp_hoy_por_operador.map((otp) => {
                  const cob = data.cobertura_24h.find((c) => c.agency_id === otp.agency_id);
                  const live = data.buses_live_5min.find((b) => b.agency_id === otp.agency_id);
                  const alerts = data.alertas_regulacion_ultimas_24h.find((a) => a.agency_id === otp.agency_id);
                  const meta = OPERATOR_METADATA[otp.agency_id] || DEFAULT_METADATA;

                  return (
                    <tr key={otp.agency_id} className="border-b border-slate-800/40 hover:bg-slate-900/20 text-slate-300">
                      <td className={`px-4 py-3 font-bold text-white flex items-center gap-2 border-l-4 ${meta.borderClass} pl-3`}>
                        <span className={meta.textClass}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-white">{live?.buses_live ?? 0}</td>
                      <td className="px-4 py-3 text-center">{cob?.buses_unicos ?? 0}</td>
                      <td className="px-4 py-3 text-center">{cob?.lineas_activas ?? 0}</td>
                      <td className="px-4 py-3 text-center text-amber-400 font-semibold">{alerts?.total ?? 0}</td>
                      <td className={`px-4 py-3 text-center font-bold ${otp.pct_otp >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {otp.pct_otp}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 Líneas Más Problemáticas */}
        <div className="glass-panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-red-400" />
              Líneas Críticas (3 Días)
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Top 10 líneas metropolitanas con menor OTP acumulado en los últimos 3 días (mínimo 100 muestras).
            </p>
          </div>

          <div className="overflow-y-auto max-h-[260px] rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-bold sticky top-0">
                <tr>
                  <th className="px-3 py-2.5">Línea</th>
                  <th className="px-3 py-2.5">Operador</th>
                  <th className="px-3 py-2.5 text-center">OTP%</th>
                </tr>
              </thead>
              <tbody>
                {data.top_10_lineas_mas_problematicas_3d.map((linea, idx) => {
                  const meta = OPERATOR_METADATA[linea.agency_id] || DEFAULT_METADATA;
                  return (
                    <tr key={`${linea.linea}-${idx}`} className="border-t border-slate-800/40 hover:bg-slate-900/20 text-slate-300">
                      <td className="px-3 py-2 font-bold text-white">Línea {linea.linea}</td>
                      <td className={`px-3 py-2 text-xs font-semibold ${meta.textClass}`}>{meta.label}</td>
                      <td className="px-3 py-2 text-center text-red-400 font-bold">{linea.pct_en_tiempo}%</td>
                    </tr>
                  );
                })}
                {data.top_10_lineas_mas_problematicas_3d.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-slate-500 italic">
                      No hay líneas críticas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Panel Inferior: Salud de Sistema y Competitividad (DRO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Salud del Poller GPS */}
        <div className="glass-panel p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-4 h-4 text-blue-400" />
            Canal de Integración GPS (IMM)
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Estado Poller</span>
              <span className={`font-bold ${data.salud_sistema.poller.estado === 'LIVE' ? 'text-emerald-400' : 'text-amber-500'}`}>
                {data.salud_sistema.poller.estado === 'LIVE' ? 'ACTIVO (LIVE)' : 'RETRASADO (STALE)'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Último ciclo recibido</span>
              <span className="text-white font-medium">Hace {data.salud_sistema.poller.segundos_desde_ultimo_ciclo}s</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Eventos Persistidos</span>
              <span className="text-white font-medium">{data.salud_sistema.poller.total_eventos_persistidos.toLocaleString('es-UY')}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Ciclos de salud poller</span>
              <span className="text-white font-medium">{data.salud_sistema.poller.total_cycles || data.salud_sistema.poller.total_ciclos}</span>
            </div>
          </div>
        </div>

        {/* Competitividad (DRO) */}
        <div className="glass-panel p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan-400" />
            Solapamiento de Corredores (DRO)
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Total pares analizados</span>
              <span className="text-white font-bold">{data.dro_cross_operador.total_pares} pares</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Tier 1 (Alta Competencia)</span>
              <span className="text-red-400 font-bold">{data.dro_cross_operador.t1_alta_competencia} corredores</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Tier 2 (Media Competencia)</span>
              <span className="text-orange-400 font-bold">{data.dro_cross_operador.t2_media_competencia} corredores</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Tier 3 (Baja Competencia)</span>
              <span className="text-emerald-400 font-bold">{data.dro_cross_operador.t3_baja_competencia} corredores</span>
            </div>
          </div>
        </div>

        {/* Información Normativa y Metodología */}
        <div className="glass-panel p-5 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            Metodología de Puntualidad
          </h4>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            El cálculo de **On-Time Performance (OTP)** se rige bajo la norma internacional **TCRP Report 165**.
          </p>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Se considera un servicio **En Tiempo** si pasa por el punto de control entre **1 minuto adelantado** y **4 minutos atrasado** respecto a su grilla horaria teórica autorizada por la Intendencia de Montevideo (IMM).
          </p>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Los datos son alimentados en tiempo real por el GPS oficial metropolitano y consolidados en la base Postgres soberana de SkillRoute.
          </p>
        </div>
      </div>
    </div>
  );
}
