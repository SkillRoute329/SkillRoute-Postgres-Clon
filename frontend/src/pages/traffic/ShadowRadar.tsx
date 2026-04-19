import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import type { GeoPoint } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { fetchSTMPosiciones } from '../../services/stmLiveService';
import { Radar, ShieldAlert, Bus, AlertTriangle, Zap, CheckCircle2, Target, X, Crosshair, Flag, Eye, Users, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AlertaRegulacion {
  id: string;
  tipo: string;
  coche_id: string;
  linea_id: string;
  rival_empresa?: string;
  rival_interno?: string;
  distancia_metros?: number;
  instruccion: string;
  mensaje_chofer: string;
  timestamp: Timestamp;
  leido: boolean;
}

interface VehiculoRadar {
  id: string;
  cocheId: string;
  empresa: string;
  codigoLinea: string;
  conductorNombre?: string;
  lat: number;
  lng: number;
  estado: string;
  velocidad?: number;
  pasajeros?: number;
  heading?: number;
  updatedAt?: unknown;
  fuente: 'firestore' | 'api_imm';
}

// ─── Funciones de ayuda ───────────────────────────────────────────────────────

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  const timestamp = ts as { toMillis?: () => number; seconds?: number };
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  return 0;
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Sin fecha';
  const timestamp = ts as { toDate?: () => Date; seconds?: number } | string | number;
  if (typeof timestamp === 'object' && timestamp !== null) {
    if (timestamp.toDate) return timestamp.toDate().toLocaleTimeString();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleTimeString();
  }
  try {
    return new Date(timestamp as string | number).toLocaleTimeString();
  } catch {
    return 'Fecha inválida';
  }
}

function minutesSince(ts: unknown): number {
  const ms = toMillis(ts);
  if (!ms) return 999;
  return Math.floor((Date.now() - ms) / 60000);
}

// ─── Componente Principal ─────────────────────────────────────────────────────

const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';
const LINEAS_UCOT = ['300', '306', '316', '330', '17'];
const INACTIVITY_MS = 15 * 60 * 1000;

const ShadowRadar: React.FC = () => {
  const [alertas, setAlertas] = useState<AlertaRegulacion[]>([]);
  const [ucotFlotaFirestore, setUcotFlotaFirestore] = useState<VehiculoRadar[]>([]);
  const [ucotFlotaIMM, setUcotFlotaIMM] = useState<VehiculoRadar[]>([]);
  const [competidores, setCompetidores] = useState<VehiculoRadar[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Buffer para tracking direccional
  const prevPositionsRef = useRef<Record<string, { lat: number; lng: number; heading?: number }>>({});

  const ucotFlota = useMemo(() => {
    const map = new Map<string, VehiculoRadar>();
    ucotFlotaIMM.forEach(v => map.set(v.cocheId, v));
    ucotFlotaFirestore.forEach(v => map.set(v.cocheId, v));
    return Array.from(map.values());
  }, [ucotFlotaFirestore, ucotFlotaIMM]);

  // Filtros
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedSentido, setSelectedSentido] = useState<string>('');

  // Modal Disparo Manual
  const [showModal, setShowModal] = useState(false);
  const [manualCocheId, setManualCocheId] = useState('');
  const [manualLineaId, setManualLineaId] = useState('');
  const [manualMensaje, setManualMensaje] = useState('🚨 ATENCIÓN COCHE: Regule marcha para mantener frecuencia.');

  // ─── Listeners ────────────────────────────────────────────────────────────

  // ─── Fetch competidores desde API IMM ──────────────────────────────────
  const fetchCompetidores = useCallback(async () => {
    if (!isScanning) return;
    try {
      const buses = await fetchSTMPosiciones({ empresa: -1 });
      const listRival: VehiculoRadar[] = [];
      const listUcotExt: VehiculoRadar[] = [];

      buses.forEach((b) => {
        const idStr = `stm-${b.id}`;
        const prev = prevPositionsRef.current[idStr];
        let currentHeading = prev?.heading;
        
        if (prev && (prev.lat !== b.lat || prev.lng !== b.lng)) {
          const dist = haversineMetros(prev.lat, prev.lng, b.lat, b.lng);
          if (dist > 5) { // Filtrar ruido de GPS
            currentHeading = calculateBearing(prev.lat, prev.lng, b.lat, b.lng);
          }
        }
        
        prevPositionsRef.current[idStr] = { lat: b.lat, lng: b.lng, heading: currentHeading };

        const v: VehiculoRadar = {
          id: idStr,
          cocheId: String(b.codigoBus),
          empresa: b.empresa || 'Competencia',
          codigoLinea: b.linea,
          conductorNombre: undefined,
          lat: b.lat,
          lng: b.lng,
          heading: currentHeading,
          estado: 'en_servicio',
          fuente: 'api_imm',
          velocidad: b.velocidad,
          pasajeros: 0,
        };
        
        if (b.codigoEmpresa === 70 || (b.empresa || '').toUpperCase() === 'UCOT') {
          listUcotExt.push(v);
        } else {
          listRival.push(v);
        }
      });

      setCompetidores(listRival);
      setUcotFlotaIMM(listUcotExt);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[ShadowRadar] Error fetching buses IMM:', e);
    }
  }, [isScanning]);

  useEffect(() => {
    if (!isScanning) return;

    // 1. Alertas de regulación
    const qAlertas = query(collection(db, 'alertas_regulacion'), orderBy('timestamp', 'desc'), limit(20));
    const unsubAlertas = onSnapshot(
      qAlertas,
      (snapshot) => {
        const data: AlertaRegulacion[] = [];
        snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() } as AlertaRegulacion));
        setAlertas(data);
      },
      (err) => console.error('[ShadowRadar] Error alertas:', err),
    );

    // 2. Viajes activos — UCOT fleet GPS (igual que FleetMonitor)
    const colRef = collection(db, 'viajes_activos');
    const unsubViajes = onSnapshot(
      colRef,
      (snapshot) => {
        const cutoff = Date.now() - INACTIVITY_MS;
        const list: VehiculoRadar[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const updatedAtMs = toMillis(data.updatedAt);
          if (updatedAtMs < cutoff) return;
          // GeoPoint handling (same as FleetMonitor)
          const pos = data.posicion as GeoPoint | undefined;
          if (!pos || typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') return;
          
          const idStr = docSnap.id;
          const prev = prevPositionsRef.current[idStr];
          let currentHeading = prev?.heading;
          
          if (prev && (prev.lat !== pos.latitude || prev.lng !== pos.longitude)) {
            const dist = haversineMetros(prev.lat, prev.lng, pos.latitude, pos.longitude);
            if (dist > 5) {
              currentHeading = calculateBearing(prev.lat, prev.lng, pos.latitude, pos.longitude);
            }
          }
          
          prevPositionsRef.current[idStr] = { lat: pos.latitude, lng: pos.longitude, heading: currentHeading };

          list.push({
            id: idStr,
            cocheId: String(data.cocheId ?? docSnap.id),
            empresa: String(data.empresa ?? 'UCOT').trim(),
            codigoLinea: String(data.codigoLinea ?? '—').trim(),
            conductorNombre: data.conductorNombre ? String(data.conductorNombre) : undefined,
            lat: pos.latitude,
            lng: pos.longitude,
            heading: currentHeading,
            estado: String(data.estado ?? 'en_servicio'),
            velocidad: typeof data.velocidad === 'number' ? data.velocidad : 0,
            pasajeros: typeof data.pasajeros === 'number' ? data.pasajeros : 0,
            updatedAt: data.updatedAt,
            fuente: 'firestore',
          });
        });
        setUcotFlotaFirestore(list);
      },
      (err) => console.error('[ShadowRadar] Error viajes_activos:', err),
    );

    // 3. Competidores del API IMM (cada 30s)
    fetchCompetidores();
    const rivalInterval = setInterval(fetchCompetidores, 30000);

    return () => {
      unsubAlertas();
      unsubViajes();
      clearInterval(rivalInterval);
    };
  }, [isScanning, fetchCompetidores]);

  // ─── Disparar alerta manual ───────────────────────────────────────────────

  const handleShootAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCocheId || !manualLineaId || !manualMensaje) {
      toast.error('Complete todos los campos del disparo.');
      return;
    }
    try {
      await addDoc(collection(db, 'alertas_regulacion'), {
        tipo: 'DISPARO_MANUAL',
        coche_id: manualCocheId,
        linea_id: manualLineaId,
        rival_empresa: 'MANUAL',
        distancia_metros: 0,
        instruccion: 'REGULACION_MARCHA',
        mensaje_chofer: manualMensaje,
        timestamp: Timestamp.now(),
        leido: false,
      });
      toast.success(`Disparo táctico emitido a coche ${manualCocheId}`);
      setShowModal(false);
      setManualCocheId('');
      setManualLineaId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`Error al disparar: ${msg}`);
    }
  };

  // ─── Procesamiento de datos ───────────────────────────────────────────────

  // Líneas disponibles (calculadas de los datos reales de UCOT)
  const lineasDisponibles = useMemo(() => {
    const set = new Set<string>();
    ucotFlota.forEach(v => { if (v.codigoLinea && v.codigoLinea !== '—') set.add(v.codigoLinea); });
    return Array.from(set).sort();
  }, [ucotFlota]);

  // Coches UCOT filtrados por línea seleccionada
  const ucotFiltrados = useMemo(() => {
    if (!selectedLinea) return ucotFlota;
    return ucotFlota.filter(v => v.codigoLinea === selectedLinea);
  }, [ucotFlota, selectedLinea]);

  // Para cada coche UCOT, encontrar rivales cercanos en la misma línea
  const emparejamientos = useMemo(() => {
    return ucotFiltrados.map(ucot => {
      if (!ucot.lat || !ucot.lng) return { ucot, rivales: [], estado: 'SIN_GPS' as const };

      // Buscar rivales en el mismo corredor (por proximidad, sin importar la línea exacta)
      const rivalesDetectables = competidores.filter(r => r.lat && r.lng);

      const rivalesCercanos = rivalesDetectables
        .map(r => {
          const dist = haversineMetros(ucot.lat, ucot.lng, r.lat, r.lng);
          return { ...r, distanciaMetros: Math.round(dist) };
        })
        .filter(r => {
          // Filtro por distancia
          if (r.distanciaMetros > 2000) return false;
          
          // Filtro Vectorial por Rumbo (Oposición)
          if (ucot.heading !== undefined && r.heading !== undefined) {
             const hDiff = Math.abs(ucot.heading - r.heading) % 360;
             const shortestDiff = hDiff > 180 ? 360 - hDiff : hDiff;
             if (shortestDiff > 80) return false; // si superan 80 grados de diff, ignorarlos (están en direcciones cruzadas o de frente)
          }
          return true;
        })
        .sort((a, b) => a.distanciaMetros - b.distanciaMetros);

      let estado: 'FIJADO_AL_BLANCO' | 'PELIGRO_BUNCHING' | 'VIA_LIBRE' | 'SIN_GPS';
      if (rivalesCercanos.length > 0 && rivalesCercanos[0].distanciaMetros < 500) {
        estado = 'FIJADO_AL_BLANCO';
      } else if (rivalesCercanos.length > 0) {
        estado = 'PELIGRO_BUNCHING';
      } else {
        estado = 'VIA_LIBRE';
      }

      return { ucot, rivales: rivalesCercanos, estado };
    });
  }, [ucotFiltrados, competidores]);

  // Agrupar por línea
  const porLinea = useMemo(() => {
    const map = new Map<string, typeof emparejamientos>();
    emparejamientos.forEach(e => {
      const l = e.ucot.codigoLinea || '—';
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(e);
    });
    return map;
  }, [emparejamientos]);

  // ─── Helpers UI ───────────────────────────────────────────────────────────

  const getAlertColor = (tipo: string, leido: boolean) => {
    if (leido) return 'border-slate-800 bg-slate-900/50 text-slate-400';
    if (tipo === 'PELIGRO_BUNCHING') return 'border-orange-500/50 bg-orange-950/30 text-orange-400';
    if (tipo === 'RIVAL_PISANDO_TURNO') return 'border-red-500/50 bg-red-950/30 text-red-400';
    if (tipo === 'GANAR_SALIDA') return 'border-emerald-500/50 bg-emerald-950/30 text-emerald-400';
    if (tipo === 'DISPARO_MANUAL') return 'border-purple-500/50 bg-purple-950/30 text-purple-400';
    return 'border-blue-500/50 bg-blue-950/30 text-blue-400';
  };

  const getAlertIcon = (tipo: string, leido: boolean) => {
    if (leido) return <CheckCircle2 className="w-5 h-5" />;
    if (tipo === 'PELIGRO_BUNCHING') return <AlertTriangle className="w-5 h-5 animate-pulse" />;
    if (tipo === 'RIVAL_PISANDO_TURNO') return <ShieldAlert className="w-5 h-5 animate-pulse" />;
    if (tipo === 'GANAR_SALIDA') return <Flag className="w-5 h-5 animate-bounce" />;
    return <Zap className="w-5 h-5" />;
  };

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'FIJADO_AL_BLANCO':
        return (
          <span className="flex items-center gap-1.5 text-red-400 bg-red-950/50 px-2.5 py-1 rounded text-xs font-bold font-mono border border-red-900 shadow-[0_0_10px_rgba(239,68,68,0.15)]">
            <Crosshair className="w-3.5 h-3.5 animate-pulse" />
            FIJADO AL BLANCO
          </span>
        );
      case 'PELIGRO_BUNCHING':
        return (
          <span className="flex items-center gap-1.5 text-orange-400 bg-orange-950/50 px-2.5 py-1 rounded text-xs font-bold font-mono border border-orange-900">
            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
            RIVAL CERCA
          </span>
        );
      case 'VIA_LIBRE':
        return (
          <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded text-xs font-bold font-mono border border-emerald-900">
            <CheckCircle2 className="w-3.5 h-3.5" />
            VÍA LIBRE
          </span>
        );
      case 'SIN_GPS':
        return (
          <span className="flex items-center gap-1.5 text-slate-500 bg-slate-900 px-2.5 py-1 rounded text-xs font-bold font-mono border border-slate-800">
            <Eye className="w-3.5 h-3.5" />
            SIN GPS
          </span>
        );
      default:
        return null;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      {/* Modal Disparo Táctico */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-red-900/20">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Disparo Táctico Manual
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleShootAlert} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Coche ID</label>
                  <input
                    type="text"
                    required
                    value={manualCocheId}
                    onChange={(e) => setManualCocheId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="Ej. 87"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Línea ID</label>
                  <input
                    type="text"
                    required
                    value={manualLineaId}
                    onChange={(e) => setManualLineaId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="Ej. 306"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Mensaje al Chofer</label>
                <textarea
                  required
                  rows={3}
                  value={manualMensaje}
                  onChange={(e) => setManualMensaje(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm hover:bg-slate-700 font-medium">
                  Cancelar
                </button>
                <button type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Ejecutar Disparo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent flex items-center gap-3">
            <Radar className={`w-8 h-8 text-red-500 ${isScanning ? 'animate-spin [animation-duration:3s]' : ''}`} />
            Radar Táctico Anti-Barrido
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-2xl">
            Detecta coches UCOT en la calle, identifica rivales por línea y distancia, y genera alertas tácticas.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-2 mr-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-xs font-bold tracking-wider text-slate-300">
              {isScanning ? 'LIVE SYNC' : 'OFFLINE'}
            </span>
          </div>
          <button onClick={() => setIsScanning(!isScanning)}
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 font-medium">
            {isScanning ? 'Pausar' : 'Reanudar'}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg shadow-red-900/50">
            <Target className="w-4 h-4" />
            DISPARO ASISTIDO
          </button>
        </div>
      </div>

      {/* Resumen en vivo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">UCOT en Calle</div>
          <div className="text-3xl font-bold text-blue-400 mt-1">{ucotFlota.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Rivales Detectados</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{competidores.length}</div>
          {lastRefresh && <div className="text-[10px] text-slate-600 mt-1">API IMM: {lastRefresh.toLocaleTimeString()}</div>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Fijados al Blanco</div>
          <div className="text-3xl font-bold text-orange-400 mt-1">
            {emparejamientos.filter(e => e.estado === 'FIJADO_AL_BLANCO').length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Alertas Hoy</div>
          <div className="text-3xl font-bold text-purple-400 mt-1">{alertas.length}</div>
        </div>
      </div>

      {/* Selector de Línea */}
      <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-400 mb-1 tracking-wider uppercase">Línea Objetivo</label>
            <select
              value={selectedLinea}
              onChange={(e) => setSelectedLinea(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Todas las líneas ({ucotFlota.length} coches UCOT activos)</option>
              {lineasDisponibles.map(l => {
                const count = ucotFlota.filter(v => v.codigoLinea === l).length;
                const rivCount = competidores.filter(v => v.codigoLinea === l).length;
                return <option key={l} value={l}>Línea {l} — {count} UCOT, {rivCount} rivales</option>;
              })}
            </select>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-400 mb-1 tracking-wider uppercase">Destino / Sentido</label>
            <select
              value={selectedSentido}
              onChange={(e) => setSelectedSentido(e.target.value)}
              disabled={!selectedLinea}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">Ambos sentidos</option>
              <option value="IDA">Ida</option>
              <option value="VUELTA">Vuelta</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* LEFT: Fleet Tracking */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-emerald-400" />
            Emparejamiento UCOT vs Competencia
            {selectedLinea && <span className="text-sm font-normal text-slate-500 ml-2">(Foco: Línea {selectedLinea})</span>}
          </h2>

          {emparejamientos.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
              <Bus className="w-12 h-12 text-slate-700 mb-4" />
              <p className="text-slate-500 font-medium text-center">
                {ucotFlota.length === 0
                  ? 'No hay vehículos UCOT reportando GPS en este momento.'
                  : `No hay coches UCOT activos en la línea ${selectedLinea}.`
                }
              </p>
              {ucotFlota.length === 0 && (
                <p className="text-slate-600 text-xs mt-2 text-center max-w-sm">
                  El radar analiza datos de <code className="text-slate-400">viajes_activos</code> en tiempo real.
                  Los coches aparecerán aquí cuando reporten posición GPS.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(porLinea.entries()).map(([linea, items]) => (
                <div key={linea} className="border border-slate-800 bg-slate-900/30 rounded-xl overflow-hidden">
                  <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-sm bg-blue-500 text-white px-2.5 py-0.5 rounded">Línea {linea}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Bus className="w-3 h-3" /> {items.length} UCOT</span>
                      <span className="flex items-center gap-1 text-red-400">
                        <Users className="w-3 h-3" />
                        {items.reduce((acc, e) => acc + e.rivales.length, 0)} rivales cerca
                      </span>
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((emp) => (
                      <div
                        key={emp.ucot.id}
                        className={`flex flex-col gap-2 p-3 rounded-lg border shadow-inner transition-all ${
                          emp.estado === 'FIJADO_AL_BLANCO'
                            ? 'bg-red-950/20 border-red-900/50'
                            : emp.estado === 'PELIGRO_BUNCHING'
                            ? 'bg-orange-950/10 border-orange-900/30'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        {/* Encabezado del coche */}
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200 flex items-center gap-2">
                            <Bus className="w-4 h-4 text-blue-400" />
                            UCOT #{emp.ucot.cocheId}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            hace {minutesSince(emp.ucot.updatedAt)} min
                          </span>
                        </div>

                        {/* Conductor */}
                        {emp.ucot.conductorNombre && (
                          <div className="text-xs text-slate-500 -mt-1">
                            {emp.ucot.conductorNombre}
                          </div>
                        )}

                        {/* Estado del radar */}
                        <div className="mt-1">
                          {estadoBadge(emp.estado)}
                        </div>

                        {/* Rivales detectados */}
                        {emp.rivales.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {emp.rivales.slice(0, 3).map((r, i) => (
                              <div key={i} className="flex items-center justify-between text-xs bg-slate-900/80 rounded px-2 py-1 border border-slate-800">
                                <span className="text-red-400 font-bold flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  {r.empresa} #{r.cocheId}
                                </span>
                                <span className={`font-mono font-bold ${
                                  r.distanciaMetros < 500 ? 'text-red-400' : 'text-orange-400'
                                }`}>
                                  {r.distanciaMetros}m
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Alerts Column */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-400" />
              Alertas Tácticas
            </h2>
            <span className="text-xs bg-slate-800 px-2 py-1 rounded-full text-slate-400">{alertas.length}</span>
          </div>

          <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            {alertas.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No hay alertas recientes.</p>
            ) : (
              alertas.map((alerta) => (
                <div
                  key={alerta.id}
                  className={`flex flex-col gap-2 p-3 rounded-xl border text-sm transition-all duration-300 ${getAlertColor(alerta.tipo, alerta.leido)}`}
                >
                  <div className="flex items-center gap-2">
                    {getAlertIcon(alerta.tipo, alerta.leido)}
                    <span className="font-bold truncate max-w-[200px]">{alerta.tipo.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="pl-7">
                    <p className="font-medium opacity-90 line-clamp-2">"{alerta.mensaje_chofer}"</p>
                    <div className="flex items-center gap-2 mt-2 opacity-70 text-xs">
                      <span>Coche: {alerta.coche_id}</span>
                      {alerta.linea_id && <span>| L. {alerta.linea_id}</span>}
                      {alerta.distancia_metros != null && alerta.distancia_metros > 0 && (
                        <span>| {alerta.distancia_metros}m</span>
                      )}
                    </div>
                  </div>
                  <div className="pl-7 text-[10px] text-right font-mono opacity-50 mt-1">
                    {formatTimestamp(alerta.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ShadowRadar;
