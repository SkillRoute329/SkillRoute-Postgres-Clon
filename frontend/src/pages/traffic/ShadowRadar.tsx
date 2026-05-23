import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  where,
  Timestamp,
  addDoc,
  getDocs,
  doc,
  setDoc,
} from '../../config/firestoreShim';
import type { GeoPoint } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { fetchSTMPosiciones } from '../../services/stmLiveService';
import { haversineMetros as geoHaversineMetros } from '../../utils/geomath';
import { Radar, ShieldAlert, Bus, AlertTriangle, Zap, CheckCircle2, Target, X, Crosshair, Flag, Eye, Users, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AlertaRegulacion {
  id: string;
  tipo: string;
  coche_id: string;
  linea_id: string;
  rival_empresa?: string;
  rival_interno?: string;
  rival_coche_id?: string;
  rival_linea?: string;
  distancia_metros?: number;
  instruccion: string;
  mensaje_chofer: string;
  timestamp: Timestamp;
  leido: boolean;
  // Campos ACK escritos por la Cloud Function acknowledgeAlerta cuando
  // el chofer toca "RECIBIDO" en la push del FCM. Cierran el loop
  // operacional Swiftly/Optibus-style.
  ack_at?: Timestamp | null;
  ack_response_time_sec?: number | null;
  ack_by_coche_id?: string | null;
  // Estado FCM (escrito por onAlertaCreated trigger del backend).
  fcmSent?: boolean;
  fcmSentAt?: Timestamp | null;
  fcmError?: string | null;
}

interface VehiculoRadar {
  id: string;
  cocheId: string;
  empresa: string;
  codigoLinea: string;
  destino?: string;
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

// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return geoHaversineMetros(lat1, lng1, lat2, lng2);
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const timestamp = ts as { toMillis?: () => number; seconds?: number };
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  return 0;
}

// Sweep timestamps #65 (2026-04-23): usa helper Montevideo para consistencia UTC-3.
// Si el servidor corre en UTC, `toLocaleTimeString()` nativo genera desfase de 3h.
import { formatHoraMvd } from '../../utils/formatTimestamp';
function formatTimestamp(ts: unknown): string {
  return formatHoraMvd(ts, 'Sin fecha');
}

function minutesSince(ts: unknown): number {
  const ms = toMillis(ts);
  if (!ms) return 999;
  return Math.floor((Date.now() - ms) / 60000);
}

// ─── Componente Principal ─────────────────────────────────────────────────────

const PROXY_BASE = import.meta.env.VITE_STM_PROXY_URL || 'http://localhost:3001/api/stm/proxy';
const INACTIVITY_MS = 15 * 60 * 1000;

const EMPRESAS_OPCIONES = [
  { codigo: 70, label: 'UCOT' },
  { codigo: 50, label: 'CUTCSA' },
  { codigo: 20, label: 'COME' },
  { codigo: 10, label: 'COETC' },
] as const;

/** Mapeo nombre-operador → agencyId usado en shapes_cross_operator y corridor_overlap. */
const EMPRESA_TO_AGENCY: Record<string, string> = {
  UCOT: '70',
  CUTCSA: '50',
  COME: '20',
  COETC: '10',
};

/** DRO tier para cada rival detectado. */
type DroTier = 'T1' | 'T2' | 'T3';

interface CorridorOverlapDoc {
  key: string;
  shapeAKey: string;
  shapeBKey: string;
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
}

const ShadowRadar: React.FC = () => {
  const [alertas, setAlertas] = useState<AlertaRegulacion[]>([]);
  const [ucotFlotaFirestore, setUcotFlotaFirestore] = useState<VehiculoRadar[]>([]);
  const [ucotFlotaVE, setUcotFlotaVE] = useState<VehiculoRadar[]>([]); // vehicle_events (cron STM)
  const [ucotFlotaIMM, setUcotFlotaIMM] = useState<VehiculoRadar[]>([]);
  const [competidores, setCompetidores] = useState<VehiculoRadar[]>([]);
  const [corridorOverlaps, setCorridorOverlaps] = useState<CorridorOverlapDoc[]>([]);
  // Telemetría de producto: desglose por empresa que reporta el STM + cobertura shapes
  const [stmBreakdown, setStmBreakdown] = useState<Record<number, number>>({});
  const [shapeCoverage, setShapeCoverage] = useState<{ total: number; lastReconstructed: number | null }>({
    total: 0,
    lastReconstructed: null,
  });
  const [isScanning, setIsScanning] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { setSelectedLine } = useLiveData();

  // Buffer para tracking direccional
  const prevPositionsRef = useRef<Record<string, { lat: number; lng: number; heading?: number }>>({});

  const ucotFlota = useMemo(() => {
    const map = new Map<string, VehiculoRadar>();
    // Prioridad ascendente: el último set() gana.
    // 1) vehicle_events (cron STM cada 5 min) — fallback de relleno si IMM no capturó el bus.
    ucotFlotaVE.forEach(v => map.set(v.cocheId, v));
    // 2) IMM (API STM público, 15s, trae linea + destino + velocidad fresca) — gana sobre VE.
    ucotFlotaIMM.forEach(v => map.set(v.cocheId, v));
    // 3) viajes_activos (app mobile del chofer) — fuente interna más confiable, gana siempre.
    ucotFlotaFirestore.forEach(v => map.set(v.cocheId, v));
    return Array.from(map.values());
  }, [ucotFlotaFirestore, ucotFlotaVE, ucotFlotaIMM]);

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

      // Desglose total por empresa (incluso buses sin línea — útil para diagnóstico).
      const breakdown: Record<number, number> = {};
      for (const b of buses) {
        const emp = Number(b.codigoEmpresa) || 0;
        breakdown[emp] = (breakdown[emp] || 0) + 1;
      }
      setStmBreakdown(breakdown);

      buses.forEach((b) => {
        // Regla: si el STM no reporta linea, el bus no es ni UCOT operativo ni rival competidor.
        const lineaStr = String(b.linea ?? '').trim();
        if (!lineaStr || lineaStr === '-' || lineaStr === '—') return;
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
          updatedAt: Date.now(),
          destino: b.destinoDesc || '',
        };
        
        if (Number(b.codigoEmpresa) === empresaPropia) {
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
  }, [isScanning, empresaPropia]);

  useEffect(() => {
    if (!isScanning) return;

    // 1. Alertas de regulación — filtradas por empresa propia seleccionada
    const qAlertas = query(
      collection(db, 'alertas_regulacion'),
      where('empresa_id', '==', empresaPropia),
      orderBy('timestamp', 'desc'),
      limit(20),
    );
    let unsubAlertasFallback: (() => void) | undefined;
    const unsubAlertas = onSnapshot(
      qAlertas,
      (snapshot) => {
        const data: AlertaRegulacion[] = [];
        snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() } as AlertaRegulacion));
        setAlertas(data);
      },
      (err) => {
        // Fallback sin filtro si el índice no existe aún
        console.warn('[ShadowRadar] Query con empresa_id falló, usando sin filtro:', err);
        const qFallback = query(collection(db, 'alertas_regulacion'), orderBy('timestamp', 'desc'), limit(20));
        unsubAlertasFallback = onSnapshot(qFallback, (snap) => {
          const data: AlertaRegulacion[] = [];
          snap.forEach((doc) => data.push({ id: doc.id, ...doc.data() } as AlertaRegulacion));
          setAlertas(data);
        });
      },
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

          // Regla: saltar coches sin línea asignada (no son competencia ni mostrables).
          const lineaVA = String(data.codigoLinea ?? '').trim();
          if (!lineaVA || lineaVA === '-' || lineaVA === '—') return;

          list.push({
            id: idStr,
            cocheId: String(data.cocheId ?? docSnap.id),
            empresa: String(data.empresa ?? 'UCOT').trim(),
            codigoLinea: lineaVA,
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

    // 3. vehicle_events (cron autoStatsCollector cada 5 min) — fuente GPS estable.
    //    Se guarda en un state propio para que no sea pisado por viajes_activos (vacío).
    //    El useMemo `ucotFlota` combina ambas fuentes con prioridad correcta.
    //    agencyId es dinámico según el operador propio seleccionado.
    const since8min = new Date(Date.now() - 8 * 60 * 1000);
    const qVehicleEvents = query(
      collection(db, 'vehicle_events'),
      where('agencyId', '==', String(empresaPropia)),
      where('timestampGPS', '>=', since8min.toISOString()),
      orderBy('timestampGPS', 'desc'),
      limit(500),
    );
    const unsubVehicleEvents = onSnapshot(
      qVehicleEvents,
      (snapshot) => {
        const byBus = new Map<string, VehiculoRadar>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.lat || !data.lon || !data.idBus) return;
          const lineaVE = String(data.linea ?? '').trim();
          if (!lineaVE || lineaVE === '-' || lineaVE === '—') return;
          const cocheId = String(data.idBus);
          if (byBus.has(cocheId)) return; // ya tenemos el más reciente (orderBy desc)

          const idStr = `ve-${cocheId}`;
          const prev = prevPositionsRef.current[idStr];
          let currentHeading = prev?.heading;
          if (prev && (prev.lat !== data.lat || prev.lng !== data.lon)) {
            const dist = haversineMetros(prev.lat, prev.lng, data.lat, data.lon);
            if (dist > 5) currentHeading = calculateBearing(prev.lat, prev.lng, data.lat, data.lon);
          }
          prevPositionsRef.current[idStr] = { lat: data.lat, lng: data.lon, heading: currentHeading };

          byBus.set(cocheId, {
            id: idStr,
            cocheId,
            empresa: empresaCfg.label,
            codigoLinea: lineaVE,
            lat: data.lat,
            lng: data.lon,
            heading: currentHeading,
            estado: 'en_servicio',
            velocidad: typeof data.velocidad === 'number' ? data.velocidad : 0,
            fuente: 'firestore',
            updatedAt: data.timestampGPS,
          });
        });
        // Siempre actualizamos — evita que datos viejos queden congelados.
        setUcotFlotaVE(Array.from(byBus.values()));
      },
      (err) => console.warn('[ShadowRadar] vehicle_events no disponible:', err),
    );

    // 4. Competidores del API IMM (cada 15s — construye heading más rápido)
    fetchCompetidores();
    const rivalInterval = setInterval(fetchCompetidores, 15000);

    // 5. corridor_overlap — matriz DRO pre-calculada. Lee SOLO los pares donde
    //    la empresa propia es el "A" (perspectiva egocéntrica de esta sesión).
    //    Se recarga si cambia empresaPropia. Limit alto porque la tabla es
    //    chica (~1800 docs en todo el sistema metropolitano).
    const qOverlap = query(
      collection(db, 'corridor_overlap'),
      where('agencyA', '==', String(empresaPropia)),
      limit(2000),
    );
    const unsubOverlap = onSnapshot(
      qOverlap,
      (snapshot) => {
        const list: CorridorOverlapDoc[] = [];
        snapshot.docs.forEach((docSnap) => {
          list.push(docSnap.data() as CorridorOverlapDoc);
        });
        setCorridorOverlaps(list);
      },
      (err) => console.warn('[ShadowRadar] corridor_overlap no disponible:', err),
    );

    // 6. shapes_cross_operator — coverage + freshness. Query ligera: solo
    // contamos docs y miramos el más reciente para mostrar "última
    // reconstrucción".
    const qShapes = query(
      collection(db, 'shapes_cross_operator'),
      orderBy('reconstructedAt', 'desc'),
      limit(1),
    );
    const unsubShapes = onSnapshot(
      qShapes,
      (snapshot) => {
        const first = snapshot.docs[0]?.data();
        const ts = first?.reconstructedAt;
        let lastMs: number | null = null;
        if (ts && typeof ts.toMillis === 'function') {
          lastMs = ts.toMillis();
        } else if (ts && typeof ts.seconds === 'number') {
          lastMs = ts.seconds * 1000;
        }
        setShapeCoverage({
          total: snapshot.size,
          lastReconstructed: lastMs,
        });
      },
      (err) => console.warn('[ShadowRadar] shapes_cross_operator meta no disponible:', err),
    );
    // Conteo separado (get-once al montar) para el total real, ya que el query
    // anterior está limitado a 1 doc.
    (async () => {
      try {
        const full = await getDocs(query(collection(db, 'shapes_cross_operator'), limit(500)));
        setShapeCoverage((prev) => ({ ...prev, total: full.size }));
      } catch (err) {
        console.warn('[ShadowRadar] shapes count no disponible:', err);
      }
    })();

    return () => {
      unsubAlertas();
      unsubAlertasFallback?.();
      unsubViajes();
      unsubVehicleEvents();
      unsubOverlap();
      unsubShapes();
      clearInterval(rivalInterval);
    };
  }, [isScanning, fetchCompetidores, empresaPropia]);

  // ─── ShadowDispatcher automático ─────────────────────────────────────────
  // Throttle: no repetir la misma alerta por el mismo coche en menos de 5 min
  // NOTA: el useEffect se declara MÁS ABAJO, después del useMemo `emparejamientos`,
  // para evitar TDZ (TS2448). Acá solo queda el ref que se puede declarar arriba.
  const dispatchedRef = useRef<Record<string, number>>({});

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
        agency_id: String(empresaPropia),
        timestamp: new Date().toISOString(),
        data_jsonb: {
          tipo: 'DISPARO_MANUAL',
          coche_id: manualCocheId,
          linea_id: manualLineaId,
          empresa_id: empresaPropia,
          rival_empresa: 'MANUAL',
          distancia_metros: 0,
          instruccion: 'REGULACION_MARCHA',
          mensaje_chofer: manualMensaje,
          timestamp: new Date().toISOString(),
          leido: false,
        },
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

  // Destinos únicos de la línea seleccionada (para el dropdown de sentido)
  const destinosDisponibles = useMemo(() => {
    const base = selectedLinea ? ucotFlota.filter(v => v.codigoLinea === selectedLinea) : ucotFlota;
    const set = new Set<string>();
    base.forEach(v => { if (v.destino) set.add(v.destino); });
    return Array.from(set).sort();
  }, [ucotFlota, selectedLinea]);

  // Coches filtrados por línea y destino/sentido
  const ucotFiltrados = useMemo(() => {
    let lista = selectedLinea ? ucotFlota.filter(v => v.codigoLinea === selectedLinea) : ucotFlota;
    if (selectedSentido) {
      lista = lista.filter(v => !v.destino || v.destino === selectedSentido);
    }
    return lista;
  }, [ucotFlota, selectedLinea, selectedSentido]);

  // Para cada coche UCOT, encontrar rivales cercanos en la misma línea
  /**
   * Dado un UCOT bus, devuelve la mejor entrada de corridor_overlap que
   * matchea su línea (ambos sentidos) → pctAInB + sharedKm máximo.
   * Indexado por `${agencyB}-${lineaB}` para lookup O(1) contra rivales.
   */
  const overlapsByRivalKey = useMemo(() => {
    // key: `${agencyA-lineaA}__${agencyB-lineaB}` → mejor pctAInB entre sentidos
    const map = new Map<string, { pctAInB: number; sharedKm: number; sameEmpresa: boolean }>();
    for (const o of corridorOverlaps) {
      const k = `${o.agencyA}-${o.lineaA}__${o.agencyB}-${o.lineaB}`;
      const existing = map.get(k);
      if (!existing || o.pctAInB > existing.pctAInB) {
        map.set(k, { pctAInB: o.pctAInB, sharedKm: o.sharedKm, sameEmpresa: o.sameEmpresa });
      }
    }
    return map;
  }, [corridorOverlaps]);

  const emparejamientos = useMemo(() => {
    const agencyUcot = String(empresaPropia);

    return ucotFiltrados.map(ucot => {
      if (!ucot.lat || !ucot.lng) return { ucot, rivales: [], estado: 'SIN_GPS' as const };

      // ── Intento 1: matching DRO cross-operador ────────────────────────
      // Para cada competidor, buscamos entrada en la matriz DRO
      // (agencyUcot, lineaUcot) x (agencyRival, lineaRival). Si existe,
      // asignamos tier según pctAInB + distancia.
      type RivalConMetrica = VehiculoRadar & {
        distanciaMetros: number;
        tier: DroTier;
        pctAInB?: number;
        sharedKm?: number;
        /** ETA en segundos hasta alcanzar/ser alcanzado por el rival, null si paralelo o indeterminado. */
        etaSegundos: number | null;
        /** Velocidad relativa de cierre en km/h (puede ser negativa si se alejan). */
        closingKmh: number;
        /** HRR canónico (Swiftly/NYC MTA): headway propio / headway al rival.
         *  HRR < 0.8 → tu próximo bus está más cerca que el rival (ganás).
         *  HRR ≈ 1   → empatados.
         *  HRR > 1.2 → rival pisa antes que tu próximo bus (perdés pasajeros). */
        hrrRatio: number | null;
        /** Distancia hasta el siguiente bus de tu misma empresa+línea, en metros. */
        distanciaMismaLineaPropiaM: number | null;
        /** Presión competitiva 0-100: combina HRR × pctAInB (DRO).
         *  Mide qué tanto riesgo comercial real representa este rival en el corredor.
         *  0-30 → baja, 30-60 → media, 60+ → alta. Solo para T1/T2. */
        presionCompetitivaScore: number | null;
      };

      /** Velocidad de fallback en km/h cuando un bus reporta 0/undefined.
       *  Promedio operativo urbano Montevideo ≈ 18-22 km/h según TCRP 100. */
      const SPEED_FALLBACK_KMH = 20;

      /** Closing time helper: ETA + velocidad relativa entre dos buses.
       *  No es HRR canónico — es el tiempo hasta colisión asumiendo cierre lineal.
       *  Útil como complemento (cuándo se encuentran) pero no es el indicador
       *  de competencia comercial (eso es hrrRatio). */
      const computeClosingTime = (distanciaM: number, vUcot: number | undefined, vRival: number | undefined) => {
        const vU = typeof vUcot === 'number' ? vUcot : 0;
        const vR = typeof vRival === 'number' ? vRival : 0;
        const diffKmh = Math.abs(vR - vU);
        if (diffKmh < 2) return { etaSegundos: null as number | null, closingKmh: 0 };
        const closingMs = (diffKmh * 1000) / 3600;
        return { etaSegundos: Math.round(distanciaM / closingMs), closingKmh: Math.round(diffKmh) };
      };

      /** HRR canónico: headway propio / headway al rival.
       *  - Headway propio = tiempo (s) hasta el siguiente bus de la misma
       *    empresa+línea, basado en distancia geográfica al bus propio
       *    más cercano y velocidad operativa.
       *  - Headway rival = tiempo (s) hasta el rival (distancia / velocidad).
       *
       *  Devuelve hrrRatio + distancia al siguiente bus propio (para tooltip).
       *  Null si no hay otro bus propio cerca (flota de 1 → sin competencia
       *  interna, no aplica métrica). */
      const computeCanonicalHRR = (
        thisBus: { lat: number; lng: number; cocheId: string; codigoLinea: string; destino?: string; velocidad?: number },
        flotaPropiaMismaLinea: VehiculoRadar[],
        distanciaRivalM: number,
        velocidadRival: number | undefined,
      ): { hrrRatio: number | null; distanciaMismaLineaPropiaM: number | null } => {
        let minDistPropioM = Infinity;
        for (const otro of flotaPropiaMismaLinea) {
          if (otro.cocheId === thisBus.cocheId) continue;
          if (!otro.lat || !otro.lng) continue;
          if (thisBus.destino && otro.destino && thisBus.destino !== otro.destino) continue;
          const d = haversineMetros(thisBus.lat, thisBus.lng, otro.lat, otro.lng);
          if (d < minDistPropioM) minDistPropioM = d;
        }
        if (!Number.isFinite(minDistPropioM)) {
          return { hrrRatio: null, distanciaMismaLineaPropiaM: null };
        }
        const vPropio = (thisBus.velocidad && thisBus.velocidad > 5) ? thisBus.velocidad : SPEED_FALLBACK_KMH;
        const vRival = (velocidadRival && velocidadRival > 5) ? velocidadRival : SPEED_FALLBACK_KMH;
        const headwayPropioSec = (minDistPropioM / 1000) / vPropio * 3600;
        const headwayRivalSec = (distanciaRivalM / 1000) / vRival * 3600;
        if (headwayRivalSec < 1) return { hrrRatio: null, distanciaMismaLineaPropiaM: Math.round(minDistPropioM) };
        return {
          hrrRatio: headwayPropioSec / headwayRivalSec,
          distanciaMismaLineaPropiaM: Math.round(minDistPropioM),
        };
      };

      const droRivales: RivalConMetrica[] = [];
      const heuristicPool: VehiculoRadar[] = [];

      for (const r of competidores) {
        if (!r.lat || !r.lng) continue;
        const dist = Math.round(haversineMetros(ucot.lat, ucot.lng, r.lat, r.lng));
        if (dist > 2000) continue;

        const rivalAgency = EMPRESA_TO_AGENCY[r.empresa];
        if (!rivalAgency) {
          // Operador desconocido — mandamos al pool heurístico
          heuristicPool.push(r);
          continue;
        }

        const key = `${agencyUcot}-${ucot.codigoLinea}__${rivalAgency}-${r.codigoLinea}`;
        const overlap = overlapsByRivalKey.get(key);
        if (!overlap) {
          // No hay entrada DRO para este par → pool heurístico (T3)
          heuristicPool.push(r);
          continue;
        }

        // Tenemos entrada DRO → tiering
        let tier: DroTier;
        if (overlap.pctAInB >= 20 && dist <= 1500) tier = 'T1';
        else if (overlap.pctAInB >= 10) tier = 'T2';
        else {
          // DRO marginal → dejarlo al fallback heurístico
          heuristicPool.push(r);
          continue;
        }

        const closing = computeClosingTime(dist, ucot.velocidad, r.velocidad);
        const hrrCanonical = computeCanonicalHRR(
          { lat: ucot.lat, lng: ucot.lng, cocheId: ucot.cocheId, codigoLinea: ucot.codigoLinea, destino: ucot.destino, velocidad: ucot.velocidad },
          ucotFlota.filter(v => v.codigoLinea === ucot.codigoLinea),
          dist,
          r.velocidad,
        );
        const presionCompetitivaScore =
          hrrCanonical.hrrRatio !== null
            ? Math.min(Math.round(hrrCanonical.hrrRatio * (overlap.pctAInB / 100) * 100), 100)
            : null;
        droRivales.push({
          ...r,
          distanciaMetros: dist,
          tier,
          pctAInB: overlap.pctAInB,
          sharedKm: overlap.sharedKm,
          etaSegundos: closing.etaSegundos,
          closingKmh: closing.closingKmh,
          hrrRatio: hrrCanonical.hrrRatio,
          distanciaMismaLineaPropiaM: hrrCanonical.distanciaMismaLineaPropiaM,
          presionCompetitivaScore,
        });
      }

      // ── Intento 2 (fallback): heurística destino/heading para los rivales
      //    sin entrada DRO. Preserva la lógica actual y evita perder cobertura
      //    cuando las shapes de esa línea aún no están reconstruidas.
      const heuristicRivales: RivalConMetrica[] = heuristicPool
        .map(r => {
          const dist = Math.round(haversineMetros(ucot.lat, ucot.lng, r.lat, r.lng));
          const closing = computeClosingTime(dist, ucot.velocidad, r.velocidad);
          const hrrCanonical = computeCanonicalHRR(
            { lat: ucot.lat, lng: ucot.lng, cocheId: ucot.cocheId, codigoLinea: ucot.codigoLinea, destino: ucot.destino, velocidad: ucot.velocidad },
            ucotFlota.filter(v => v.codigoLinea === ucot.codigoLinea),
            dist,
            r.velocidad,
          );
          return {
            ...r,
            distanciaMetros: dist,
            tier: 'T3' as DroTier,
            etaSegundos: closing.etaSegundos,
            closingKmh: closing.closingKmh,
            hrrRatio: hrrCanonical.hrrRatio,
            distanciaMismaLineaPropiaM: hrrCanonical.distanciaMismaLineaPropiaM,
            presionCompetitivaScore: null,
          };
        })
        .filter(r => {
          const ucotDest = (ucot.destino ?? '').trim();
          const rivalDest = (r.destino ?? '').trim();
          if (ucotDest && rivalDest) {
            const da = ucotDest.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
            const db2 = rivalDest.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
            const tokensA = da.split(' ').filter(t => t.length >= 5);
            const tokensB = db2.split(' ').filter(t => t.length >= 5);
            const hayCoincidencia = tokensA.some(t => db2.includes(t)) || tokensB.some(t => da.includes(t));
            return hayCoincidencia;
          }
          if (ucot.heading !== undefined && r.heading !== undefined) {
            const hDiff = Math.abs(ucot.heading - r.heading) % 360;
            const shortestDiff = hDiff > 180 ? 360 - hDiff : hDiff;
            return shortestDiff <= 60;
          }
          return false;
        });

      // Merge priorizando DRO (T1/T2) sobre heurística (T3).
      const rivalesCercanos = [...droRivales, ...heuristicRivales]
        .sort((a, b) => {
          // Primero por tier (T1 < T2 < T3), luego por distancia.
          const tierRank: Record<DroTier, number> = { T1: 0, T2: 1, T3: 2 };
          if (tierRank[a.tier] !== tierRank[b.tier]) {
            return tierRank[a.tier] - tierRank[b.tier];
          }
          return a.distanciaMetros - b.distanciaMetros;
        });

      let estado: 'FIJADO_AL_BLANCO' | 'PELIGRO_BUNCHING' | 'VIA_LIBRE' | 'SIN_GPS';
      // El estado crítico se dispara si hay T1 (rival confirmado por corredor)
      // o si hay cualquier rival a <500m.
      const hayT1Cercano = rivalesCercanos.some(r => r.tier === 'T1' && r.distanciaMetros < 500);
      if (hayT1Cercano) {
        estado = 'FIJADO_AL_BLANCO';
      } else if (rivalesCercanos.length > 0 && rivalesCercanos[0].distanciaMetros < 500) {
        estado = 'FIJADO_AL_BLANCO';
      } else if (rivalesCercanos.length > 0) {
        estado = 'PELIGRO_BUNCHING';
      } else {
        estado = 'VIA_LIBRE';
      }

      return { ucot, rivales: rivalesCercanos, estado };
    });
  }, [ucotFiltrados, ucotFlota, competidores, overlapsByRivalKey, empresaPropia]);

  // ─── ShadowDispatcher automático (useEffect) ─────────────────────────────
  // Se declara acá (después del useMemo emparejamientos) para evitar TDZ.
  useEffect(() => {
    if (!isScanning || emparejamientos.length === 0) return;

    const now = Date.now();
    const THROTTLE_MS = 5 * 60 * 1000;

    emparejamientos.forEach(({ ucot, rivales: rivalesCercanos, estado }) => {
      if (estado !== 'FIJADO_AL_BLANCO' && estado !== 'PELIGRO_BUNCHING') return;
      if (!ucot.cocheId || ucot.cocheId === 'undefined') return;

      const tipo = estado === 'FIJADO_AL_BLANCO' ? 'RIVAL_PISANDO_TURNO' : 'PELIGRO_BUNCHING';
      const throttleKey = `${ucot.cocheId}-${tipo}`;
      const lastSent = dispatchedRef.current[throttleKey] ?? 0;
      if (now - lastSent < THROTTLE_MS) return;

      dispatchedRef.current[throttleKey] = now;

      const rivalPrincipal = rivalesCercanos[0];
      const distText = rivalPrincipal ? `${rivalPrincipal.distanciaMetros}m` : '?m';
      const rivalEmpresa = rivalPrincipal?.empresa ?? 'Rival';
      const rivalLinea = rivalPrincipal?.codigoLinea ?? '?';

      const instruccion = estado === 'FIJADO_AL_BLANCO'
        ? 'REGULACION_MARCHA'
        : 'VIGILAR_RIVAL';

      const mensaje = estado === 'FIJADO_AL_BLANCO'
        ? `⚠️ COCHE ${ucot.cocheId} línea ${ucot.codigoLinea}: ${rivalEmpresa} L${rivalLinea} a solo ${distText}. Regule marcha para no perder la parada.`
        : `👁 COCHE ${ucot.cocheId} línea ${ucot.codigoLinea}: ${rivalEmpresa} L${rivalLinea} a ${distText}. Mantenga frecuencia.`;

      // ID determinístico: dedupe la misma alerta dentro del bucket de 5 min.
      // Formato: ${empresa}_${cocheUcot}_${rival}_${tipo}_${bucket5min}.
      // Si el backend shadowDispatcher.ts genera la misma alerta en paralelo
      // dentro del mismo bucket, setDoc con merge:true evita duplicados y
      // el error firestore "Document already exists".
      const rivalKey = String(rivalPrincipal?.cocheId ?? 'na');
      const bucket5min = Math.floor(Date.now() / (5 * 60 * 1000));
      const docId = `${empresaPropia}_${ucot.cocheId}_${rivalKey}_${tipo}_${bucket5min}`;
      setDoc(
        doc(db, 'alertas_regulacion', docId),
        {
          id: docId,
          tipo,
          coche_id: ucot.cocheId,
          linea_id: ucot.codigoLinea,
          agency_id: String(empresaPropia),
          timestamp: new Date().toISOString(),
          data_jsonb: {
            tipo,
            coche_id: ucot.cocheId,
            linea_id: ucot.codigoLinea,
            empresa_id: empresaPropia,
            rival_empresa: rivalEmpresa,
            rival_linea: rivalLinea,
            rival_coche_id: rivalKey,
            distancia_metros: rivalPrincipal?.distanciaMetros ?? 0,
            instruccion,
            mensaje_chofer: mensaje,
            timestamp: new Date().toISOString(),
            leido: false,
            fuente: 'auto_shadow_dispatcher',
            bucket5min,
          }
        },
        { merge: true },
      ).catch((err) => console.warn('[ShadowDispatcher] No se pudo escribir alerta:', err));
    });
  }, [emparejamientos, isScanning, empresaPropia]);

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

  const empresaLabel = EMPRESAS_OPCIONES.find(e => e.codigo === empresaPropia)?.label ?? 'Propia';

  /**
   * Métricas de calidad del radar — lo que hace que el producto se sienta
   * "production-grade" para un directivo: sabe CUÁNTO es DRO confirmado y
   * cuánto es heurística fallback, y qué tan fresca está la matriz.
   */
  const coverageStats = useMemo(() => {
    let t1 = 0, t2 = 0, t3 = 0;
    emparejamientos.forEach(e => {
      e.rivales.forEach(r => {
        if (r.tier === 'T1') t1++;
        else if (r.tier === 'T2') t2++;
        else t3++;
      });
    });
    const total = t1 + t2 + t3;
    const pctDro = total > 0 ? Math.round(((t1 + t2) / total) * 100) : 0;
    return { t1, t2, t3, total, pctDro };
  }, [emparejamientos]);

  /** Edad de la última reconstrucción de shapes, en horas. */
  const shapeAgeHours = useMemo(() => {
    if (!shapeCoverage.lastReconstructed) return null;
    return Math.round((Date.now() - shapeCoverage.lastReconstructed) / 3600_000);
  }, [shapeCoverage.lastReconstructed]);

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
            Detecta coches {empresaLabel} en la calle, identifica rivales por línea, distancia y sentido de marcha.
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

      {/* Resumen en vivo — 5 KPIs production-grade */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">{empresaLabel} en Calle</div>
          <div className="text-3xl font-bold text-blue-400 mt-1">{ucotFlota.length}</div>
          {ucotFlota.length === 0 && competidores.length > 0 && (
            <div className="text-[10px] text-amber-400 mt-1" title="El operador seleccionado no reporta GPS al STM ahora mismo">
              sin reporte GPS
            </div>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Rivales Detectados</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{competidores.length}</div>
          {lastRefresh && <div className="text-[10px] text-slate-600 mt-1">API IMM: {formatHoraMvd(lastRefresh)}</div>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Fijados al Blanco</div>
          <div className="text-3xl font-bold text-orange-400 mt-1">
            {emparejamientos.filter(e => e.estado === 'FIJADO_AL_BLANCO').length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Cobertura DRO</div>
          <div className="text-3xl font-bold text-emerald-400 mt-1">{coverageStats.pctDro}%</div>
          <div className="text-[10px] text-slate-600 mt-1" title={`T1 (corredor): ${coverageStats.t1} · T2 (posible): ${coverageStats.t2} · T3 (heurística): ${coverageStats.t3}`}>
            {coverageStats.t1 + coverageStats.t2}/{coverageStats.total} clasificados por matriz
          </div>
          {shapeCoverage.total > 0 && (
            <div className={`text-[10px] mt-0.5 ${shapeAgeHours !== null && shapeAgeHours > 168 ? 'text-amber-400' : 'text-slate-600'}`}>
              {shapeCoverage.total} shapes{shapeAgeHours !== null ? ` · hace ${shapeAgeHours < 24 ? shapeAgeHours + 'h' : Math.round(shapeAgeHours / 24) + 'd'}` : ''}
            </div>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Alertas Hoy</div>
          <div className="text-3xl font-bold text-purple-400 mt-1">{alertas.length}</div>
        </div>
      </div>

      {/* Banner diagnóstico cuando el operador propio no reporta al STM */}
      {ucotFlota.length === 0 && Object.keys(stmBreakdown).length > 0 && (
        <div className="mb-6 bg-amber-950/30 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-bold text-amber-300">
              {empresaLabel} no reporta GPS al STM en este momento
            </div>
            <div className="text-amber-400/80 mt-1">
              El STM tiene {Object.values(stmBreakdown).reduce((a, b) => a + b, 0)} buses activos:{' '}
              {EMPRESAS_OPCIONES.map(({ codigo, label }) => {
                const n = stmBreakdown[codigo] ?? 0;
                return (
                  <span key={codigo} className={n > 0 ? 'text-white font-semibold' : 'text-amber-400/50'}>
                    {label} {n}
                    {codigo !== 10 ? ' · ' : ''}
                  </span>
                );
              })}
            </div>
            <div className="text-amber-400/70 text-xs mt-2">
              Probable causa: paro del operador, falla de telemetría o fin de horario operativo. Podés analizar la red de otro operador cambiando "Empresa Propia" arriba.
            </div>
          </div>
        </div>
      )}

      {/* Selector de Empresa + Línea */}
      <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="sm:w-48 w-full">
            <label className="block text-xs font-bold text-slate-400 mb-1 tracking-wider uppercase">Empresa Propia</label>
            <select
              value={empresaPropia}
              onChange={(e) => { setEmpresaPropia(Number(e.target.value)); setSelectedLinea(''); }}
              className="w-full bg-slate-950 border border-blue-500/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400 font-semibold"
            >
              {EMPRESAS_OPCIONES.map(({ codigo, label }) => (
                <option key={codigo} value={codigo}>{label} ({codigo})</option>
              ))}
            </select>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-400 mb-1 tracking-wider uppercase">Línea Objetivo</label>
            <select
              value={selectedLinea}
              onChange={(e) => setSelectedLinea(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Todas las líneas ({ucotFlota.length} coches {empresaLabel} activos)</option>
              {lineasDisponibles.map(l => {
                const count = ucotFlota.filter(v => v.codigoLinea === l).length;
                return <option key={l} value={l}>Línea {l} — {count} coches {empresaLabel}</option>;
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
              <option value="">Todos los destinos</option>
              {destinosDisponibles.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
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
            Emparejamiento {empresaLabel} vs Competencia
            {selectedLinea && <span className="text-sm font-normal text-slate-500 ml-2">(Foco: Línea {selectedLinea})</span>}
          </h2>

          {emparejamientos.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
              <Bus className="w-12 h-12 text-slate-700 mb-4" />
              <p className="text-slate-500 font-medium text-center">
                {ucotFlota.length === 0
                  ? `No hay vehículos ${empresaLabel} reportando GPS en este momento.`
                  : `No hay coches ${empresaLabel} activos en la línea ${selectedLinea}.`
                }
              </p>
              {ucotFlota.length === 0 && (
                <p className="text-slate-600 text-xs mt-2 text-center max-w-sm">
                  El radar carga datos GPS del STM en tiempo real.
                  Los coches aparecerán al seleccionar empresa y esperar el ciclo de actualización (30s).
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
                      <span className="flex items-center gap-1"><Bus className="w-3 h-3" /> {items.length} {empresaLabel}</span>
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
                            {empresaLabel} #{emp.ucot.cocheId}
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

                        {/* Rivales detectados (con tier DRO + métricas) */}
                        {emp.rivales.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {emp.rivales.slice(0, 3).map((r, i) => {
                              const tier = r.tier ?? 'T3';
                              const tierColor =
                                tier === 'T1'
                                  ? 'bg-red-900/60 text-red-300 border-red-700'
                                  : tier === 'T2'
                                  ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                                  : 'bg-slate-800 text-slate-400 border-slate-700';
                              const tierLabel =
                                tier === 'T1'
                                  ? 'CORREDOR'
                                  : tier === 'T2'
                                  ? 'POSIBLE'
                                  : 'HEURÍSTICA';
                              const tierTitle =
                                tier === 'T1'
                                  ? `Corredor confirmado por matriz DRO (${r.pctAInB?.toFixed(0)}% solapado, ${r.sharedKm?.toFixed(1)} km)`
                                  : tier === 'T2'
                                  ? `Solapamiento menor (${r.pctAInB?.toFixed(0)}% DRO)`
                                  : 'Sin matriz DRO para esta línea, detección por destino/heading';
                              // ETA hasta colisión (sólo si las velocidades difieren)
                              const etaSec = r.etaSegundos;
                              const etaTxt =
                                etaSec === null
                                  ? 'paralelo'
                                  : etaSec < 60
                                  ? `${etaSec}s`
                                  : `${Math.floor(etaSec / 60)}:${String(etaSec % 60).padStart(2, '0')}`;
                              const etaColor =
                                etaSec === null
                                  ? 'text-slate-500'
                                  : etaSec < 120
                                  ? 'text-red-400'
                                  : etaSec < 300
                                  ? 'text-orange-400'
                                  : 'text-emerald-400';
                              const etaTitle =
                                etaSec === null
                                  ? 'Velocidades similares, rival mantiene distancia'
                                  : `ETA ${etaTxt} a cierre · Δv ${r.closingKmh} km/h`;
                              // HRR canónico (Swiftly/NYC MTA) + Presión Competitiva DRO
                              const hrr = r.hrrRatio;
                              const pcs = r.presionCompetitivaScore;
                              const hrrColor =
                                hrr === null
                                  ? 'text-slate-500'
                                  : hrr < 0.8
                                  ? 'text-emerald-400'
                                  : hrr <= 1.2
                                  ? 'text-amber-400'
                                  : 'text-red-400';
                              const hrrTxt = hrr === null ? '—' : `${hrr.toFixed(1)}×`;
                              const hrrTitle =
                                hrr === null
                                  ? 'Sin HRR: flota propia de 1 coche en este sentido'
                                  : `HRR ${hrr.toFixed(2)}× — ` +
                                    (hrr < 0.8
                                      ? 'tu próximo bus llega antes que el rival (ganás pasajero)'
                                      : hrr <= 1.2
                                      ? 'tu próximo bus y el rival llegan parejo (empate)'
                                      : 'rival llega antes que tu próximo bus (perdés pasajero)') +
                                    ` · próximo propio a ${r.distanciaMismaLineaPropiaM ?? '?'}m` +
                                    (pcs !== null ? ` · Presión DRO: ${pcs}/100` : '');
                              const pcsColor =
                                pcs === null
                                  ? ''
                                  : pcs < 30
                                  ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                                  : pcs < 60
                                  ? 'bg-amber-900/40 text-amber-400 border-amber-700'
                                  : 'bg-red-900/50 text-red-300 border-red-700';
                              const pcsTitle =
                                pcs === null
                                  ? ''
                                  : `Presión competitiva DRO: ${pcs}/100 (HRR×corredor_compartido) — ` +
                                    (pcs < 30 ? 'baja amenaza en corredor' : pcs < 60 ? 'amenaza moderada' : 'amenaza alta — corredor compartido con rival fuerte');
                              return (
                                <div key={i} className="flex flex-col gap-1.5 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 rounded-lg p-2.5 transition-all shadow-md relative overflow-hidden">
                                  {/* Level 1: Identificación Expandida sin Truncamiento */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                      <ShieldAlert className="w-3 h-3 text-red-500 animate-pulse shrink-0" />
                                      <span className="font-extrabold text-red-400 text-[10px] tracking-tight uppercase truncate max-w-[70px]">
                                        {r.empresa}
                                      </span>
                                      <span className="bg-slate-800 text-white px-1 py-0.5 rounded text-[9px] font-bold border border-slate-700 shrink-0">
                                        #{r.cocheId}
                                      </span>
                                      <span className="bg-red-950/40 text-red-300 px-1 py-0.5 rounded text-[9px] font-black border border-red-900/50 shrink-0">
                                        L{r.codigoLinea}
                                      </span>
                                    </div>
                                    <span className={`font-mono font-black text-[10px] shrink-0 px-1.5 py-0.5 bg-slate-950/50 rounded border border-slate-800 ${
                                      r.distanciaMetros < 500 ? 'text-red-400' : 'text-orange-400'
                                    }`}>
                                      {r.distanciaMetros}m
                                    </span>
                                  </div>

                                  {/* Level 2: Badges Métricas Tácticas */}
                                  <div className="flex items-center gap-1 pt-1.5 border-t border-slate-800/40 flex-wrap">
                                    <span
                                      className={`px-1 py-0.5 rounded text-[8px] font-mono font-extrabold border tracking-tight shrink-0 ${tierColor}`}
                                      title={tierTitle}
                                    >
                                      {tierLabel}
                                    </span>
                                    <span className={`font-mono text-[8px] font-bold shrink-0 bg-slate-950 px-1 py-0.5 rounded border border-slate-850 ${etaColor}`} title={etaTitle}>
                                      ⏳ {etaTxt}
                                    </span>
                                    <span
                                      className={`font-mono text-[8px] font-black px-1 py-0.5 rounded border border-slate-850 shrink-0 ${hrrColor} bg-slate-950`}
                                      title={hrrTitle}
                                    >
                                      HRR {hrrTxt}
                                    </span>
                                    {pcs !== null && (
                                      <span
                                        className={`font-mono text-[8px] font-extrabold px-1 py-0.5 rounded border shrink-0 ${pcsColor}`}
                                        title={pcsTitle}
                                      >
                                        DRO {pcs}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
              alertas.map((alerta) => {
                // Estado del loop FCM:
                //   ack_at presente → chofer reconoció (verde, con response_time)
                //   fcmSent && !ack_at → push enviada, esperando ACK (azul tenue)
                //   fcmError → push falló (rojo tenue)
                //   sin fcm fields → alerta legacy (estado neutro)
                const ackAt = alerta.ack_at ?? null;
                const fcmSent = alerta.fcmSent === true;
                const fcmError = alerta.fcmError;
                const responseTimeSec = alerta.ack_response_time_sec ?? null;
                const responseTimeTxt =
                  responseTimeSec != null
                    ? responseTimeSec < 60
                      ? `${responseTimeSec}s`
                      : `${Math.floor(responseTimeSec / 60)}:${String(responseTimeSec % 60).padStart(2, '0')}`
                    : null;
                return (
                  <div
                    key={alerta.id}
                    className={`flex flex-col gap-2 p-3 rounded-xl border text-sm transition-all duration-300 ${getAlertColor(alerta.tipo, alerta.leido)} ${alerta.linea_id ? 'cursor-pointer hover:opacity-90' : ''}`}
                    onClick={() => alerta.linea_id && setSelectedLine(alerta.linea_id)}
                    title={alerta.linea_id ? `Filtrar por línea ${alerta.linea_id} en todos los módulos` : undefined}
                  >
                    <div className="flex items-center gap-2">
                      {getAlertIcon(alerta.tipo, alerta.leido)}
                      <span className="font-bold truncate max-w-[200px]">{alerta.tipo.replace(/_/g, ' ')}</span>
                      {/* Badge de estado ACK / FCM */}
                      {ackAt ? (
                        <span
                          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border bg-emerald-900/40 text-emerald-300 border-emerald-700/50"
                          title={`Reconocido por chofer en ${responseTimeTxt ?? '—'} (Swiftly/Optibus-style ACK loop)`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          ACK {responseTimeTxt}
                        </span>
                      ) : fcmError ? (
                        <span
                          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border bg-red-900/40 text-red-300 border-red-700/50"
                          title={`Push fallida: ${fcmError}`}
                        >
                          <X className="w-2.5 h-2.5" />
                          PUSH ERR
                        </span>
                      ) : fcmSent ? (
                        <span
                          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border bg-blue-900/40 text-blue-300 border-blue-700/50"
                          title="Push enviada al chofer, esperando que toque RECIBIDO"
                        >
                          <Zap className="w-2.5 h-2.5" />
                          ENVIADA
                        </span>
                      ) : null}
                    </div>
                    <div className="pl-7">
                      <p className="font-medium opacity-90 line-clamp-2">"{alerta.mensaje_chofer}"</p>
                      {/*
                        FASE 5.14 (2026-05-13): identificacion explicita del rival.
                        Antes solo se mostraba el coche propio (UCOT) sin identificar
                        que operador / linea / coche rival disparo la alerta. Para
                        que el operador de turno actue, necesita saber A QUIEN tiene
                        encima — no solo su propia info.
                      */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 opacity-80 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] uppercase opacity-60">Propio:</span>
                          <span className="font-semibold">#{alerta.coche_id}</span>
                          {alerta.linea_id && <span>· L{alerta.linea_id}</span>}
                        </span>
                        {(alerta.rival_empresa || alerta.rival_interno || alerta.rival_coche_id) && (
                          <span className="flex items-center gap-1 text-red-300">
                            <span className="text-[10px] uppercase opacity-60">Rival:</span>
                            {alerta.rival_empresa && <span className="font-semibold">{alerta.rival_empresa}</span>}
                            {(alerta.rival_interno || alerta.rival_coche_id) && (
                              <span>· #{alerta.rival_interno ?? alerta.rival_coche_id}</span>
                            )}
                            {alerta.rival_linea && <span>· L{alerta.rival_linea}</span>}
                          </span>
                        )}
                        {alerta.distancia_metros != null && alerta.distancia_metros > 0 && (
                          <span className="opacity-70">{alerta.distancia_metros}m</span>
                        )}
                        {ackAt && alerta.ack_by_coche_id && (
                          <span className="text-emerald-400">ACK por #{alerta.ack_by_coche_id}</span>
                        )}
                      </div>
                    </div>
                    <div className="pl-7 text-[10px] text-right font-mono opacity-50 mt-1">
                      {formatTimestamp(alerta.timestamp)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ShadowRadar;
