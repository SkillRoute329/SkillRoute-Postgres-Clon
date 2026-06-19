/**
 * MarketIntelligenceConsole.tsx
 * ==============================================================================
 * Consola de Inteligencia Competitiva Metropolitana (Market Intelligence)
 * Fusiona: Radar de Competencia, Inteligencia de Corredores (DRO), Mapas Estratégicos y Simulador Financiero.
 * 
 * Ley de Diseño: Premium, estética dark, interactividad premium y 100% libre de placeholders.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip as LeafletTooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  addDoc,
  onSnapshot,
  orderBy,
} from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';
import { fetchSTMPosiciones } from '../../services/stmLiveService';
import type { BusSTM } from '../../services/stmLiveService';
import {
  calcularIngresos,
  breakEvenPax,
  penalizacionDemanda,
} from '../../utils/calculosEconomicos';
import { haversineMetros, haversineKm } from '../../utils/geomath';
import {
  AlertTriangle,
  RefreshCw,
  Bus,
  Zap,
  Shield,
  TrendingUp,
  Clock,
  ChevronRight,
  Wifi,
  WifiOff,
  X,
  Target,
  Globe2,
  Network,
  Download,
  Search,
  Sliders,
  DollarSign,
  Info,
  Send,
  Eye,
  PieChart as PieIcon,
  Filter,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

// ─── Constantes Visuales del Mapa ──────────────────────────────────────────
const MONTEVIDEO_CENTER: [number, number] = [-34.8941, -56.1880];
const EMPRESA_COLOR: Record<string, string> = {
  '70': '#f59e0b', // UCOT — Ámbar
  '50': '#3b82f6', // CUTCSA — Azul
  '20': '#10b981', // COME — Esmeralda
  '10': '#a855f7', // COETC — Violeta
};
const EMPRESA_NAME: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

// ─── Tipos ─────────────────────────────────────────────────────────────────
type Sentido = 'IDA' | 'VUELTA';

interface ShapeDoc {
  key: string;
  agencyId: string;
  empresa: string;
  linea: string;
  sentido: Sentido;
  points: Array<{ lat: number; lon: number }>;
  lengthMeters: number;
}

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
}

interface BusInfo {
  codigoBus: string;
  linea: string;
  destino: string;
  velocidad: number;
  lat: number;
  lng: number;
  empresa: string;
  codigoEmpresa: number;
}

interface AlertaRadar {
  busPropio: BusInfo;
  rivales: Array<{
    codigoBus: string;
    empresa: string;
    linea: string;
    destino: string;
    distanciaM: number;
    overlapPct: number;
    comparteSentido: boolean;
    threatScore: number;
  }>;
  nivelAmenaza: 'CRÍTICA' | 'MODERADA' | 'BAJA';
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export default function MarketIntelligenceConsole() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { selectedLine, setSelectedLine } = useLiveData();
  
  // Tabs: 'radar' | 'solapamiento' | 'simulador' | 'market'
  const [activeTab, setActiveTab] = useState<'radar' | 'solapamiento' | 'simulador' | 'market'>('radar');
  
  // Data State
  const [shapes, setShapes] = useState<ShapeDoc[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapDoc[]>([]);
  const [buses, setBuses] = useState<BusSTM[]>([]);
  const [loadingStatic, setLoadingStatic] = useState(true);
  const [loadingBuses, setLoadingBuses] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Selección Táctica
  const [selectedShape, setSelectedShape] = useState<ShapeDoc | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  
  // Filtros del Mapa
  const [mapOperators, setMapOperators] = useState<Set<string>>(new Set(['70', '50', '20', '10']));
  const [minDroPctMap, setMinDroPctMap] = useState<number>(10);
  const [showBusesOnMap, setShowBusesOnMap] = useState(true);
  
  // Filtros del Solapamiento
  const [overlapKind, setOverlapKind] = useState<'all' | 'cross' | 'intra'>('all');
  const [minDroFilter, setMinDroFilter] = useState<number>(10);
  
  // Simulador Táctico Financiero State
  const [simFlotaDelta, setSimFlotaDelta] = useState<number>(0); // en % (-50% a +50%)
  const [simTarifa, setSimTarifa] = useState<number>(45); // Tarifa boleto
  const [simIva, setSimIva] = useState<number>(0.22); // IVA (22%)
  const [simCostosFijos, setSimCostosFijos] = useState<number>(8500); // Costos fijos diarios
  
  // Disparo manual de alertas
  const [manualCocheId, setManualCocheId] = useState('');
  const [manualMensaje, setManualMensaje] = useState('🚨 REGULACIÓN: Coche rival pisando turno a 200m. Modere velocidad.');
  const [sendingManual, setSendingManual] = useState(false);

  // Buffer para tracking de rumbo (bearing)
  const prevPositionsRef = useRef<Record<string, { lat: number; lng: number; heading?: number }>>({});

  // ─── Cargar Datos Estáticos de Firestore ──────────────────────────────────
  const loadStaticData = useCallback(async () => {
    setLoadingStatic(true);
    try {
      const [s70, s50, s20, s10, oSnap] = await Promise.all([
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '70'), limit(450))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '50'), limit(450))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '20'), limit(450))),
        getDocs(query(collection(db, 'shapes_cross_operator'), where('agencyId', '==', '10'), limit(450))),
        getDocs(query(collection(db, 'corridor_overlap'), limit(4000))),
      ]);
      
      const s: ShapeDoc[] = [];
      const combinedDocs = [...s70.docs, ...s50.docs, ...s20.docs, ...s10.docs];
      for (const doc of combinedDocs) {
        const d = doc.data();
        if (!Array.isArray(d.points) || d.points.length < 2) continue;
        s.push({
          key: String(d.key),
          agencyId: String(d.agencyId),
          empresa: String(d.empresa),
          linea: String(d.linea),
          sentido: d.sentido as Sentido,
          points: d.points as Array<{ lat: number; lon: number }>,
          lengthMeters: Number(d.lengthMeters ?? 0),
        });
      }
      
      const o: OverlapDoc[] = oSnap.docs.map((doc) => doc.data() as OverlapDoc);
      
      setShapes(s);
      setOverlaps(o);
    } catch (err) {
      console.error('[MarketConsole] Error cargando shapes/overlaps:', err);
      toast.error('Error al conectar con la base de datos de corredores.');
    } finally {
      setLoadingStatic(false);
    }
  }, []);

  // ─── Cargar Buses en Vivo del STM ─────────────────────────────────────────
  const fetchBusesLive = useCallback(async () => {
    setLoadingBuses(true);
    try {
      const liveList = await fetchSTMPosiciones({ empresa: -1 });
      setBuses(liveList);
      setLastUpdate(new Date());
    } catch (err) {
      console.warn('[MarketConsole] Error cargando buses:', err);
    } finally {
      setLoadingBuses(false);
    }
  }, []);

  useEffect(() => {
    loadStaticData();
    fetchBusesLive();
    const interval = setInterval(fetchBusesLive, 12000);
    return () => clearInterval(interval);
  }, [loadStaticData, fetchBusesLive]);

  // Si cambia la línea seleccionada en el contexto global, sincronizar
  useEffect(() => {
    if (selectedLine) {
      const matchShape = shapes.find((s) => s.linea === selectedLine && s.agencyId === String(empresaPropia));
      if (matchShape) setSelectedShape(matchShape);
    }
  }, [selectedLine, shapes, empresaPropia]);

  // Rumbo de buses y filtrado por operador
  const liveBusesMapped = useMemo<BusInfo[]>(() => {
    return buses.map((b) => {
      const idStr = `live-${b.id}`;
      const prev = prevPositionsRef.current[idStr];
      let heading = prev?.heading ?? 0;
      if (prev && (prev.lat !== b.lat || prev.lng !== b.lng)) {
        const dist = haversineMetros(prev.lat, prev.lng, b.lat, b.lng);
        if (dist > 5) {
          heading = calculateBearing(prev.lat, prev.lng, b.lat, b.lng);
        }
      }
      prevPositionsRef.current[idStr] = { lat: b.lat, lng: b.lng, heading };
      return {
        codigoBus: String(b.codigoBus),
        linea: b.linea,
        destino: b.destinoDesc,
        velocidad: b.velocidad,
        lat: b.lat,
        lng: b.lng,
        empresa: b.empresa,
        codigoEmpresa: b.codigoEmpresa,
      };
    });
  }, [buses]);

  // ─── LÓGICA DE RADAR: Confrontaciones y Alertas GPS en Tiempo Real ────────
  const confrontaciones = useMemo<AlertaRadar[]>(() => {
    const propios = liveBusesMapped.filter((b) => b.codigoEmpresa === empresaPropia);
    const rivales = liveBusesMapped.filter((b) => b.codigoEmpresa !== empresaPropia);
    const result: AlertaRadar[] = [];

    for (const p of propios) {
      const matches: AlertaRadar['rivales'] = [];
      for (const r of rivales) {
        const dist = haversineMetros(p.lat, p.lng, r.lat, r.lng);
        if (dist > 1500) continue; // radio de disputa 1.5 km

        // Buscar DRO real en la matriz
        const key = `${empresaPropia}-${p.linea}__${r.codigoEmpresa}-${r.linea}`;
        const overlap = overlaps.find(
          (o) =>
            ((o.agencyA === String(empresaPropia) && o.lineaA === p.linea) &&
             (o.agencyB === String(r.codigoEmpresa) && o.lineaB === r.linea)) ||
            ((o.agencyB === String(empresaPropia) && o.lineaB === p.linea) &&
             (o.agencyA === String(r.codigoEmpresa) && o.lineaA === r.linea))
        );
        const overlapPct = overlap ? overlap.pctAInB : 0;

        // Sentido aproximado
        const destPropio = p.destino.toLowerCase();
        const destRival = r.destino.toLowerCase();
        let comparteSentido = false;
        const kwPropio = destPropio.split(/[\s,\-\/]+/).filter((w) => w.length > 3);
        if (kwPropio.length > 0) {
          comparteSentido = kwPropio.some((kw) => destRival.includes(kw));
        }
        if (destPropio === destRival && destPropio.length > 1) comparteSentido = true;

        // Score de nivel de amenaza
        let threatScore = Math.round(overlapPct);
        if (comparteSentido) threatScore += 50;
        if (dist < 400) threatScore += 30; // cercanía crítica

        matches.push({
          codigoBus: r.codigoBus,
          empresa: r.empresa,
          linea: r.linea,
          destino: r.destino,
          distanciaM: Math.round(dist),
          overlapPct: Math.round(overlapPct),
          comparteSentido,
          threatScore,
        });
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.threatScore - a.threatScore);
        const maxScore = matches[0].threatScore;
        const nivelAmenaza = maxScore >= 80 ? 'CRÍTICA' : maxScore >= 45 ? 'MODERADA' : 'BAJA';
        result.push({
          busPropio: p,
          rivales: matches,
          nivelAmenaza,
        });
      }
    }

    return result.sort((a, b) => {
      const threatRank = { CRÍTICA: 0, MODERADA: 1, BAJA: 2 };
      return threatRank[a.nivelAmenaza] - threatRank[b.nivelAmenaza];
    });
  }, [liveBusesMapped, empresaPropia, overlaps]);

  // ─── SOLAPAMIENTOS Y COBERTURA (DRO) ──────────────────────────────────────
  const filteredOverlaps = useMemo(() => {
    return overlaps
      .filter((o) => {
        if (overlapKind === 'cross' && o.sameEmpresa) return false;
        if (overlapKind === 'intra' && !o.sameEmpresa) return false;
        if (searchFilter) {
          const sLower = searchFilter.toLowerCase();
          const matchA = o.lineaA.toLowerCase().includes(sLower) || o.empresaA.toLowerCase().includes(sLower);
          const matchB = o.lineaB.toLowerCase().includes(sLower) || o.empresaB.toLowerCase().includes(sLower);
          if (!matchA && !matchB) return false;
        }
        return o.pctAInB >= minDroFilter;
      })
      .sort((a, b) => b.sharedKm - a.sharedKm);
  }, [overlaps, overlapKind, minDroFilter, searchFilter]);

  const topCompetitiveCorridors = useMemo(() => {
    return overlaps
      .filter((o) => !o.sameEmpresa && o.pctAInB >= 20)
      .sort((a, b) => b.sharedKm - a.sharedKm)
      .slice(0, 15);
  }, [overlaps]);

  const intraCanibalizacion = useMemo(() => {
    return overlaps
      .filter((o) => o.sameEmpresa && o.pctAInB >= 15 && o.agencyA === String(empresaPropia))
      .sort((a, b) => b.pctAInB - a.pctAInB)
      .slice(0, 15);
  }, [overlaps, empresaPropia]);

  // ─── ESTADÍSTICAS ESTRATÉGICAS Y MARKET SHARE ─────────────────────────────
  const marketShareStats = useMemo(() => {
    const totalKm = overlaps.reduce((sum, o) => sum + o.sharedKm, 0);
    const shares: Record<string, number> = {};
    overlaps.forEach((o) => {
      shares[o.empresaA] = (shares[o.empresaA] || 0) + o.sharedKm;
      shares[o.empresaB] = (shares[o.empresaB] || 0) + o.sharedKm;
    });
    
    return Object.entries(shares)
      .map(([name, km]) => ({
        name,
        kmShared: Math.round(km * 10) / 10,
        percentage: totalKm > 0 ? Math.round((km / totalKm) * 100) : 0,
      }))
      .sort((a, b) => b.kmShared - a.kmShared);
  }, [overlaps]);

  const statsResumen = useMemo(() => {
    const total = overlaps.length;
    const cross = overlaps.filter((o) => !o.sameEmpresa).length;
    const intra = overlaps.filter((o) => o.sameEmpresa).length;
    const avgDro = total > 0 ? overlaps.reduce((sum, o) => sum + o.pctAInB, 0) / total : 0;
    return {
      total,
      cross,
      intra,
      avgDro: Math.round(avgDro * 10) / 10,
    };
  }, [overlaps]);

  // ─── SIMULADOR TÁCTICO FINANCIERO ─────────────────────────────────────────
  // Selección de línea activa para simulación: usa el selectedShape o la línea seleccionada
  const activeSimLinea = selectedShape ? selectedShape.linea : '300';
  
  const simBaselineData = useMemo(() => {
    // Buscar tramos de solapamiento para esta línea
    const matches = overlaps.filter(
      (o) =>
        (o.agencyA === String(empresaPropia) && o.lineaA === activeSimLinea) ||
        (o.agencyB === String(empresaPropia) && o.lineaB === activeSimLinea)
    );
    const totalComp = matches.filter((o) => !o.sameEmpresa).length;
    
    // Baselines simulados basados en promedios operativos de Montevideo
    const viajesDia = 40;
    const paxPromedio = 35; // Boletos por viaje promedio
    const costoKmOperativo = 75; // pesos por km
    const largoPromedioKm = selectedShape ? selectedShape.lengthMeters / 1000 : 12;
    const costoViaje = largoPromedioKm * costoKmOperativo;
    const costosVariablesDia = viajesDia * costoViaje;
    
    return {
      viajesDia,
      paxPromedio,
      costosDia: costosVariablesDia + simCostosFijos,
      competidores: totalComp,
      largoKm: Math.round(largoPromedioKm * 10) / 10,
    };
  }, [overlaps, activeSimLinea, empresaPropia, selectedShape, simCostosFijos]);

  const simResultados = useMemo(() => {
    const { viajesDia, paxPromedio, costosDia } = simBaselineData;
    
    // Escenario Base
    const baseIngresos = calcularIngresos(viajesDia, paxPromedio, simTarifa, simIva);
    const baseBreakEven = breakEvenPax(costosDia, viajesDia, simTarifa, simIva);
    const baseUtilidad = baseIngresos.netos - costosDia;
    
    // Escenario Simulado
    // La elasticidad se estima asimétrica: una reducción de flota baja la demanda de pasajeros
    const deltaFlotaFrac = simFlotaDelta / 100;
    const penalizacion = penalizacionDemanda(deltaFlotaFrac * -1, 0.002);
    
    const simViajesDia = Math.round(viajesDia * (1 + deltaFlotaFrac));
    const simPaxPromedio = Math.round(paxPromedio * penalizacion);
    
    const simIngresos = calcularIngresos(simViajesDia, simPaxPromedio, simTarifa, simIva);
    
    // Si la flota baja, los costos variables de viajes bajan proporcionalmente
    const baseCostoVariables = viajesDia * (simBaselineData.largoKm * 75);
    const simCostosDia = (baseCostoVariables * (1 + deltaFlotaFrac)) + simCostosFijos;
    
    const simBreakEven = breakEvenPax(simCostosDia, simViajesDia, simTarifa, simIva);
    const simUtilidad = simIngresos.netos - simCostosDia;
    
    return {
      base: {
        viajes: viajesDia,
        pax: paxPromedio,
        costo: Math.round(costosDia),
        bruto: Math.round(baseIngresos.brutos),
        iva: Math.round(baseIngresos.iva),
        neto: Math.round(baseIngresos.netos),
        breakEven: baseBreakEven,
        utilidad: Math.round(baseUtilidad),
      },
      sim: {
        viajes: simViajesDia,
        pax: simPaxPromedio,
        costo: Math.round(simCostosDia),
        bruto: Math.round(simIngresos.brutos),
        iva: Math.round(simIngresos.iva),
        neto: Math.round(simIngresos.netos),
        breakEven: simBreakEven,
        utilidad: Math.round(simUtilidad),
      },
    };
  }, [simBaselineData, simFlotaDelta, simTarifa, simIva, simCostosFijos]);

  // ─── Disparo de Alerta Manual ─────────────────────────────────────────────
  const handleSendManualAlert = async () => {
    if (!manualCocheId) {
      toast.error('Ingrese el ID del coche UCOT de destino.');
      return;
    }
    setSendingManual(true);
    try {
      await addDoc(collection(db, 'alertas_regulacion'), {
        tipo: 'DISPARO_TACTICO',
        coche_id: manualCocheId,
        linea_id: activeSimLinea,
        empresa_id: empresaPropia,
        instruccion: 'REGULACION_MARCHA',
        mensaje_chofer: manualMensaje,
        timestamp: new Date().toISOString(),
        leido: false,
      });
      toast.success(`Alerta de regulación enviada al chofer del Coche #${manualCocheId}`);
      setManualCocheId('');
    } catch (err) {
      console.error(err);
      toast.error('Error al emitir directiva manual.');
    } finally {
      setSendingManual(false);
    }
  };

  // ─── Exportar a Excel ─────────────────────────────────────────────────────
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Hoja 1: Solapamientos
    const sheet1Data = filteredOverlaps.map((o) => ({
      'Empresa A': o.empresaA,
      'Línea A': o.lineaA,
      'Sentido A': o.sentidoA,
      'Empresa B': o.empresaB,
      'Línea B': o.lineaB,
      'Sentido B': o.sentidoB,
      'DRO %': o.pctAInB,
      'Km Solapamiento': o.sharedKm,
      'Mismo Operador': o.sameEmpresa ? 'SÍ' : 'NO',
    }));
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Corredores Compartidos');

    // Hoja 2: Resumen Market Share
    const ws2 = XLSX.utils.json_to_sheet(marketShareStats);
    XLSX.utils.book_append_sheet(wb, ws2, 'Cuotas por Km');

    XLSX.writeFile(wb, `SkillRoute-Inteligencia-Red-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Matriz exportada a Excel.');
  };

  // ─── Filtro de shapes del mapa ────────────────────────────────────────────
  const visibleShapes = useMemo(() => {
    // Si hay un shape seleccionado lo priorizamos en render, sino filtramos
    return shapes.filter((s) => {
      if (!mapOperators.has(s.agencyId)) return false;
      if (searchFilter && !s.linea.toLowerCase().includes(searchFilter.toLowerCase())) return false;
      return true;
    });
  }, [shapes, mapOperators, searchFilter]);

  // Determinar si una shape es competitiva según DRO para estilado
  const isCompetitiveShape = useCallback((key: string) => {
    return overlaps.some((o) => (o.shapeAKey === key || o.shapeBKey === key) && o.pctAInB >= minDroPctMap);
  }, [overlaps, minDroPctMap]);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] w-full bg-[#0A0D14] text-slate-100 overflow-hidden font-sans">
      {/* ================= LADO IZQUIERDO: MAPA LEAFLET ================= */}
      <div className="w-full lg:w-[50%] h-[40vh] lg:h-full relative border-r border-slate-800">
        <MapContainer
          center={MONTEVIDEO_CENTER}
          zoom={12}
          style={{ height: '100%', width: '100%', background: '#0e131f' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Polyline Shapes */}
          {visibleShapes.map((s) => {
            const isComp = isCompetitiveShape(s.key);
            const isSelected = selectedShape?.key === s.key;
            return (
              <Polyline
                key={s.key}
                positions={s.points.filter((p) => p.lat && p.lon).map((p) => [p.lat, p.lon]) as [number, number][]}
                pathOptions={{
                  color: EMPRESA_COLOR[s.agencyId] ?? '#94a3b8',
                  weight: isSelected ? 6 : isComp ? 4 : 2,
                  opacity: isSelected ? 1.0 : isComp ? 0.8 : 0.4,
                  dashArray: isComp && !isSelected ? '4,4' : undefined,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedShape(s);
                    setSelectedLine(s.linea);
                  },
                }}
              >
                <LeafletTooltip sticky>
                  <div className="text-xs font-semibold p-1">
                    <span className="font-bold text-white uppercase">{s.empresa} - Línea {s.linea}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Sentido: {s.sentido} · {(s.lengthMeters/1000).toFixed(1)} km</p>
                    {isComp && <p className="text-amber-400 text-[10px] font-bold mt-1">⚠️ Corredor Competitivo (DRO)</p>}
                  </div>
                </LeafletTooltip>
              </Polyline>
            );
          })}

          {/* Marcadores de Buses Live */}
          {showBusesOnMap && liveBusesMapped.map((b) => (
            <CircleMarker
              key={b.codigoBus}
              center={[b.lat, b.lng]}
              radius={selectedShape?.linea === b.linea ? 6 : 4.5}
              pathOptions={{
                color: EMPRESA_COLOR[String(b.codigoEmpresa)] ?? '#ffffff',
                fillColor: EMPRESA_COLOR[String(b.codigoEmpresa)] ?? '#ffffff',
                fillOpacity: 0.9,
                weight: selectedShape?.linea === b.linea ? 2.5 : 1,
              }}
            >
              <LeafletTooltip>
                <div className="text-xs p-0.5">
                  <div className="font-bold text-white">{b.empresa} Coche #{b.codigoBus}</div>
                  <div className="text-slate-300">Línea {b.linea} → {b.destino || 'Servicio'}</div>
                  <div className="text-slate-500 font-mono mt-0.5">{b.velocidad} km/h</div>
                </div>
              </LeafletTooltip>
            </CircleMarker>
          ))}

          <FitBoundsToSelected shape={selectedShape} />
        </MapContainer>

        {/* Flotante: Controles Rápidos del Mapa */}
        <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-2xl max-w-xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
            <Layers className="w-4 h-4" />
            <span>Capas e Indicadores</span>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showBusesOnMap}
                onChange={(e) => setShowBusesOnMap(e.target.checked)}
                className="accent-indigo-500 rounded"
              />
              <span>Buses en vivo stm-online</span>
            </label>
            <div className="pt-2">
              <span className="text-[10px] text-slate-500 font-bold block mb-1">VISIBILIDAD OPERADORES</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['70', '50', '20', '10'] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => {
                      const updated = new Set(mapOperators);
                      if (updated.has(op)) updated.delete(op);
                      else updated.add(op);
                      setMapOperators(updated);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                      mapOperators.has(op)
                        ? 'bg-slate-800 text-white border-slate-700'
                        : 'bg-slate-950/40 text-slate-600 border-transparent'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EMPRESA_COLOR[op] }} />
                    {EMPRESA_NAME[op]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= LADO DERECHO: TABS Y CONTROLES INTELIGENTES ================= */}
      <div className="w-full lg:w-[50%] h-[60vh] lg:h-full flex flex-col bg-[#0f131f] overflow-hidden">
        {/* Header Consola */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/30 backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400 animate-pulse" />
              <h1 className="text-lg font-black tracking-tight text-white uppercase">Market Intelligence Console</h1>
            </div>
            <p className="text-xs text-slate-500">Unificación de Red, Solapamiento (DRO) y Simulación Táctica</p>
          </div>
          <div className="flex items-center gap-2">
            {loadingBuses ? (
              <span className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2.5 py-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Sincronizando</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                <Wifi className="w-3 h-3 animate-pulse" />
                <span className="font-bold">STM VIVO</span>
              </span>
            )}
            <button
              onClick={() => { fetchBusesLive(); loadStaticData(); }}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition"
              title="Refrescar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 p-1 gap-1">
          {[
            { id: 'radar', label: 'Radar de Disputas', icon: <Zap className="w-3.5 h-3.5" /> },
            { id: 'solapamiento', label: 'Matriz DRO', icon: <Network className="w-3.5 h-3.5" /> },
            { id: 'simulador', label: 'Simulador Financiero', icon: <Sliders className="w-3.5 h-3.5" /> },
            { id: 'market', label: 'Market Share', icon: <PieIcon className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600/90 text-white shadow-md shadow-indigo-500/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* ================= TAB 1: RADAR DE DISPUTAS ================= */}
          {activeTab === 'radar' && (
            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">Disputas Activas en Corredores</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Alertas de proximidad física inmediata con rivales metropolitanos</p>
                </div>
                <div className="bg-indigo-500/15 border border-indigo-500/30 rounded-lg px-3 py-1.5 text-center">
                  <span className="text-xs text-indigo-300 block font-semibold">Confrontaciones</span>
                  <span className="text-lg font-black text-white">{confrontaciones.length}</span>
                </div>
              </div>

              {confrontaciones.length === 0 ? (
                <div className="border border-slate-800 rounded-xl p-10 text-center flex flex-col items-center justify-center space-y-3 bg-slate-900/10">
                  <Shield className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-300">Vías libres de competencia directa</p>
                  <p className="text-xs text-slate-500 max-w-sm">No hay buses propios bajo confrontación crítica en un radio de 1.5 km</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {confrontaciones.map((c, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-xl p-4 bg-slate-900/30 relative overflow-hidden transition hover:bg-slate-900/50 ${
                        c.nivelAmenaza === 'CRÍTICA' ? 'border-red-500/40' : 'border-slate-800'
                      }`}
                    >
                      {/* Glow indicator */}
                      <div className={`absolute top-0 left-0 w-1 h-full ${c.nivelAmenaza === 'CRÍTICA' ? 'bg-red-500' : 'bg-amber-500'}`} />

                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                        <div className="flex items-center gap-2">
                          <Bus className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <div>
                            <span className="text-xs font-black text-white">COCHE #{c.busPropio.codigoBus}</span>
                            <span className="text-[10px] text-slate-400 block">Línea {c.busPropio.linea} → {c.busPropio.destino}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black border uppercase ${
                          c.nivelAmenaza === 'CRÍTICA'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}>
                          Amenaza {c.nivelAmenaza}
                        </span>
                      </div>

                      {/* Rivales */}
                      <div className="space-y-2">
                        {c.rivales.map((r, rIdx) => (
                          <div key={rIdx} className="bg-slate-950/50 border border-slate-800/60 rounded-lg p-2.5 flex items-center justify-between text-xs">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-amber-400">L{r.linea}</span>
                                <span className="text-[10px] text-slate-400">({r.empresa} Coche #{r.codigoBus})</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">Rumbo: {r.destino}</p>
                              <div className="flex gap-1.5 mt-1">
                                {r.overlapPct > 0 && (
                                  <span className="text-[9px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-amber-400/80">
                                    🧬 Solapamiento: {r.overlapPct}%
                                  </span>
                                )}
                                {r.comparteSentido && (
                                  <span className="text-[9px] bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded text-red-400 font-extrabold">
                                    MISMO SENTIDO
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-white block">{r.distanciaM} metros</span>
                              <span className="text-[10px] text-slate-500 font-mono">Score: {r.threatScore}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Acción de regulación directa */}
                      <div className="mt-3 pt-3 border-t border-slate-800 flex gap-2">
                        <input
                          type="text"
                          placeholder="ID Coche propio"
                          value={manualCocheId}
                          onChange={(e) => setManualCocheId(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white w-28 focus:border-indigo-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={manualMensaje}
                          onChange={(e) => setManualMensaje(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={handleSendManualAlert}
                          disabled={sendingManual}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1 flex items-center justify-center disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: SOLAPAMIENTOS DRO ================= */}
          {activeTab === 'solapamiento' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <div>
                  <h3 className="font-bold text-white text-sm">Direccional Route Overlap (DRO)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Matriz de solapamiento geográfico real cross-operador</p>
                </div>
                <button
                  onClick={exportToExcel}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs px-3 py-2 flex items-center gap-1.5 shadow shadow-emerald-900/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
              </div>

              {/* Filtros Solapamiento */}
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Tipo de Solapamiento</span>
                  <select
                    value={overlapKind}
                    onChange={(e) => setOverlapKind(e.target.value as typeof overlapKind)}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-white"
                  >
                    <option value="all">Todos los tramos</option>
                    <option value="cross">Cross-operador (Competencia)</option>
                    <option value="intra">Intra-operador (Canibalización)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">DRO mínimo %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minDroFilter}
                    onChange={(e) => setMinDroFilter(Number(e.target.value) || 0)}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Filtrar por Línea/Empresa</span>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ej: 104, CUTCSA..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-white"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  </div>
                </label>
              </div>

              {/* Contenedor Listado / Tabla */}
              <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden">
                <div className="max-h-[350px] overflow-y-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-950 sticky top-0 text-slate-400 border-b border-slate-800 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Operador A</th>
                        <th className="px-4 py-2.5">Línea A</th>
                        <th className="px-4 py-2.5">Operador B</th>
                        <th className="px-4 py-2.5">Línea B</th>
                        <th className="px-4 py-2.5 text-right">DRO %</th>
                        <th className="px-4 py-2.5 text-right">Km Compartido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {filteredOverlaps.slice(0, 150).map((o, idx) => (
                        <tr
                          key={idx}
                          onClick={() => {
                            const match = shapes.find(s => s.linea === o.lineaA && s.agencyId === o.agencyA);
                            if (match) setSelectedShape(match);
                          }}
                          className="hover:bg-slate-800/40 cursor-pointer transition"
                        >
                          <td className="px-4 py-2 font-semibold text-slate-200">{o.empresaA}</td>
                          <td className="px-4 py-2 text-slate-400">{o.lineaA} <span className="text-[10px] text-slate-600">({o.sentidoA})</span></td>
                          <td className="px-4 py-2 font-semibold text-slate-200">{o.empresaB}</td>
                          <td className="px-4 py-2 text-slate-400">{o.lineaB} <span className="text-[10px] text-slate-600">({o.sentidoB})</span></td>
                          <td className="px-4 py-2 text-right font-bold text-amber-400">{Math.round(o.pctAInB)}%</td>
                          <td className="px-4 py-2 text-right font-mono text-emerald-400">{o.sharedKm.toFixed(2)} km</td>
                        </tr>
                      ))}
                      {filteredOverlaps.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">Ningún tramo coincide con los criterios de filtrado</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: SIMULADOR TÁCTICO FINANCIERO ================= */}
          {activeTab === 'simulador' && (
            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-white font-bold text-sm">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Simulación Operativa y de Ingresos</span>
                </div>
                <p className="text-xs text-slate-400">
                  Línea de análisis: <strong className="text-indigo-300 font-bold">Línea {activeSimLinea}</strong>. Evaluando el impacto financiero de cambiar frecuencia/flota o desviar ruta.
                </p>
              </div>

              {/* Sliders del simulador */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-3">
                  <div>
                    <label className="flex justify-between font-bold text-slate-300 mb-1">
                      <span>Variación de Frecuencia / Flota:</span>
                      <span className={simFlotaDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>{simFlotaDelta}%</span>
                    </label>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={5}
                      value={simFlotaDelta}
                      onChange={(e) => setSimFlotaDelta(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Aplica penalización de demanda del 0.2% por cada 1% de reducción de flota
                    </span>
                  </div>

                  <div>
                    <label className="flex justify-between font-bold text-slate-300 mb-1">
                      <span>Tarifa del Boleto:</span>
                      <span className="text-white">${simTarifa} UYU</span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={simTarifa}
                      onChange={(e) => setSimTarifa(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="flex justify-between font-bold text-slate-300 mb-1">
                      <span>Tasa de IVA del Boleto:</span>
                      <span className="text-white">{(simIva * 100).toFixed(0)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.30}
                      step={0.01}
                      value={simIva}
                      onChange={(e) => setSimIva(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between font-bold text-slate-300 mb-1">
                      <span>Costo Fijo Diario (Amortización + Personal):</span>
                      <span className="text-white">${simCostosFijos} UYU</span>
                    </label>
                    <input
                      type="range"
                      min={1000}
                      max={20000}
                      step={500}
                      value={simCostosFijos}
                      onChange={(e) => setSimCostosFijos(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* KPIs de Resultados */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Viajes Diarios</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-black text-white">{simResultados.sim.viajes}</span>
                    <span className="text-[10px] text-slate-400">vs {simResultados.base.viajes}</span>
                  </div>
                </div>

                <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Ingreso Neto (sin IVA)</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-black text-emerald-400">${simResultados.sim.neto}</span>
                    <span className="text-[10px] text-slate-400">vs ${simResultados.base.neto}</span>
                  </div>
                </div>

                <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Break-Even (Pax/viaje)</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-black text-amber-400">{simResultados.sim.breakEven}</span>
                    <span className="text-[10px] text-slate-400">vs {simResultados.base.breakEven}</span>
                  </div>
                </div>

                <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Retorno Neto (Utilidad)</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-lg font-black ${simResultados.sim.utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${simResultados.sim.utilidad}
                    </span>
                    <span className="text-[10px] text-slate-400">vs ${simResultados.base.utilidad}</span>
                  </div>
                </div>
              </div>

              {/* Gráfica Recharts de Comparación Financiera */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 h-[240px]">
                <span className="text-xs text-slate-400 font-bold block mb-3 uppercase">Análisis Comparativo Escenarios</span>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart
                    data={[
                      { name: 'Costo Operativo', Base: simResultados.base.costo, Simulado: simResultados.sim.costo },
                      { name: 'Ingreso Neto', Base: simResultados.base.neto, Simulado: simResultados.sim.neto },
                      { name: 'Retorno Neto', Base: simResultados.base.utilidad, Simulado: simResultados.sim.utilidad },
                    ]}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Base" fill="#475569" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Simulado" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ================= TAB 4: MARKET SHARE / ANALYTICS ================= */}
          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cuota de mercado por operador */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-[260px] flex flex-col">
                  <span className="text-xs font-bold text-slate-300 block mb-2 uppercase">Market Share (Shared km)</span>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={marketShareStats}
                          dataKey="kmShared"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={65}
                          fill="#8884d8"
                          label={({ name, percentage }) => `${name} ${percentage}%`}
                        >
                          {marketShareStats.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={EMPRESA_COLOR[entry.name === 'UCOT' ? '70' : entry.name === 'CUTCSA' ? '50' : entry.name === 'COME' ? '20' : '10'] || '#94a3b8'} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Coeficientes globales de la matriz */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block mb-3 uppercase">Resumen Global de Corredores</span>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-slate-500">Total Tramos Analizados:</span>
                        <span className="font-bold text-white">{statsResumen.total}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-slate-500">Cruces Competitivos (Cross):</span>
                        <span className="font-bold text-red-400">{statsResumen.cross}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-slate-500">Superposición Interna (Intra):</span>
                        <span className="font-bold text-amber-400">{statsResumen.intra}</span>
                      </div>
                      <div className="flex justify-between pb-1">
                        <span className="text-slate-500">DRO Promedio:</span>
                        <span className="font-bold text-indigo-400">{statsResumen.avgDro}%</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-4 leading-normal">
                    Las métricas de solapamiento están basadas en el Directional Route Overlap (TCRP Report 195) calculado de forma soberana sobre el feed público del STM.
                  </p>
                </div>
              </div>

              {/* Secciones de Canibalización y Competencia Top */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Canibalización */}
                <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2.5">
                    Canibalización Interna UCOT (DRO ≥ 15%)
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto text-xs">
                    {intraCanibalizacion.map((o, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-900/40 p-2 rounded-lg">
                        <span className="text-slate-300">L{o.lineaA} ↔ L{o.lineaB}</span>
                        <span className="font-semibold text-slate-400">
                          <strong className="text-amber-400">{Math.round(o.pctAInB)}%</strong> · {o.sharedKm.toFixed(1)} km
                        </span>
                      </div>
                    ))}
                    {intraCanibalizacion.length === 0 && (
                      <p className="text-slate-500 italic text-center py-4">No se detectó canibalización alta</p>
                    )}
                  </div>
                </div>

                {/* Top Competencia */}
                <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2.5">
                    Cruces de Alta Competencia (DRO ≥ 20%)
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto text-xs">
                    {topCompetitiveCorridors.slice(0, 8).map((o, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-900/40 p-2 rounded-lg">
                        <span className="text-slate-300">
                          {o.empresaA} L{o.lineaA} ↔ {o.empresaB} L{o.lineaB}
                        </span>
                        <span className="font-semibold text-slate-400">
                          <strong className="text-red-400">{Math.round(o.pctAInB)}%</strong> · {o.sharedKm.toFixed(1)} km
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Componente Hook para Ajustar Zoom a la Shape Seleccionada ────────────
function FitBoundsToSelected({ shape }: { shape: ShapeDoc | null }) {
  const map = useMap();
  useEffect(() => {
    if (!shape || shape.points.length === 0) return;
    const bounds = shape.points
      .filter((p) => p.lat && p.lon)
      .map((p) => [p.lat, p.lon] as [number, number]);
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [shape, map]);
  return null;
}
