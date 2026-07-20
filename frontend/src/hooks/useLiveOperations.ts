import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmpresaPropia } from './useEmpresaPropia';
import { fetchSTMPosiciones, type BusSTM } from '../services/stmLiveService';
import { ServicioEstadoService, type ServicioEstadoRecord } from '../services/firestore/servicioEstado';
import { PersonalService, type PersonalRecord } from '../services/firestore/personal';
import { collection, query, onSnapshot, where, limit, orderBy } from '../config/firestoreShim';
import { db, authReady } from '../config/firebase';
import { haversineKm } from '../utils/geomath';

// ─── Tipos Unificados ──────────────────────────────────────────────────────────

export interface AlertaBunching {
  linea: string;
  bus1: string;
  bus2: string;
  distanciaKm: number;
  bus1Coords: [number, number];
  bus2Coords: [number, number];
}

export interface IncidenciaReportada {
  id: string;
  titulo: string;
  estado: 'abierta' | 'en_proceso' | 'cerrada';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  coche_id?: string;
  linea_id?: string;
  timestamp: any;
}

export interface DesvioReportado {
  id: string;
  coche_id: string;
  linea_id: string;
  tipo: 'FUERA_DE_RUTA' | 'FUERA_DE_DESVIO_OFICIAL';
  metros_fuera: number;
  resuelto: boolean;
  timestamp: any;
}

export interface ServicioActivo {
  id: string; // codigoBus
  codigoBus: string;
  empresa: string;
  empresaId: number;
  linea: string;
  sublinea: string | null;
  destino: string;
  lat: number;
  lng: number;
  velocidad: number;
  // Fusión con listero / turnos
  servicioId?: string;
  horaInicio?: string;
  choferId?: string;
  choferNombre?: string;
  choferLegajo?: string;
  estadoTurno?: 'activo' | 'pendiente' | 'incidencia' | 'pendiente_de_coche';
  // Fusión con Alertas y Desvíos
  desvio?: DesvioReportado;
  incidencia?: IncidenciaReportada;
}

export interface LiveOperationsKPIs {
  totalPropios: number;
  totalRivales: number;
  desviosAbiertos: number;
  incidenciasAbiertas: number;
  bunchingPares: number;
}

// ─── Re-implementar detectarBunching para evitar dependencias circulares ──────
function calcularBunching(propios: ServicioActivo[]): AlertaBunching[] {
  const alertas: AlertaBunching[] = [];
  for (let i = 0; i < propios.length; i++) {
    for (let j = i + 1; j < propios.length; j++) {
      // Must be same line
      if (propios[i].linea !== propios[j].linea) continue;
      
      // Prevent comparing a bus with itself (duplicate GPS points)
      if (propios[i].codigoBus === propios[j].codigoBus) continue;

      // Must be going in the same direction (same destino)
      if (propios[i].destino !== propios[j].destino) continue;

      const dist = haversineKm(propios[i].lat, propios[i].lng, propios[j].lat, propios[j].lng);
      if (dist < 0.8) { // BUNCHING_UMBRAL_KM = 0.8
        alertas.push({
          linea: propios[i].linea,
          bus1: propios[i].codigoBus,
          bus2: propios[j].codigoBus,
          distanciaKm: Math.round(dist * 1000) / 1000,
          bus1Coords: [propios[i].lat, propios[i].lng],
          bus2Coords: [propios[j].lat, propios[j].lng]
        });
      }
    }
  }
  return alertas;
}

// ─── Hook Central ─────────────────────────────────────────────────────────────

export function useLiveOperations() {
  const { empresaPropia, empresaCfg } = useEmpresaPropia();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Catálogos y datos crudos
  const [busesRaw, setBusesRaw] = useState<BusSTM[]>([]);
  const [listeroRaw, setListeroRaw] = useState<ServicioEstadoRecord[]>([]);
  const [personal, setPersonal] = useState<PersonalRecord[]>([]);
  const [desviosRaw, setDesviosRaw] = useState<DesvioReportado[]>([]);
  const [incidenciasRaw, setIncidenciasRaw] = useState<IncidenciaReportada[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Carga inicial del catálogo de personal (una vez al montar)
  useEffect(() => {
    let active = true;
    PersonalService.getAll()
      .then(res => {
        if (active) setPersonal(res);
      })
      .catch(err => console.error('[useLiveOperations] Error al obtener personal:', err));
    return () => { active = false; };
  }, []);

  // 1. Polling de buses GPS (cada 10 segundos)
  const cargarGPS = useCallback(async () => {
    try {
      const datos = await fetchSTMPosiciones({ empresa: -1 });
      setBusesRaw(datos);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      console.warn('[useLiveOperations] Error al obtener GPS:', err);
      setError('Error al obtener posiciones GPS. Reintentando...');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarGPS();
    const t = setInterval(cargarGPS, 10000);
    return () => clearInterval(t);
  }, [cargarGPS]);

  // 2. Suscripción en tiempo real a Turnos de Listero (servicio_estado de hoy)
  useEffect(() => {
    const hoy = new Date().toISOString().split('T')[0];
    const unsub = ServicioEstadoService.subscribeByDate(hoy, (records) => {
      setListeroRaw(records);
    });
    return () => unsub();
  }, []);

  // 3. Suscripción en tiempo real a Desvíos Activos (resuelto == false)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      const q = query(
        collection(db, 'eventos_desvio'),
        where('resuelto', '==', false),
        orderBy('timestamp', 'desc'),
        limit(50),
      );
      unsub = onSnapshot(q, (snap) => {
        setDesviosRaw(
          snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DesvioReportado, 'id'>) }))
        );
      }, err => {
        console.error('[useLiveOperations] Error desvios:', err);
      });
    };
    void setup();
    return () => unsub?.();
  }, []);

  // 4. Suscripción en tiempo real a Incidencias Abiertas (estado != cerrada)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      const q = query(
        collection(db, 'incidencias'),
        where('estado', 'in', ['abierta', 'en_proceso']),
        orderBy('timestamp', 'desc'),
        limit(50),
      );
      unsub = onSnapshot(q, (snap) => {
        setIncidenciasRaw(
          snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<IncidenciaReportada, 'id'>) }))
        );
      }, err => {
        console.error('[useLiveOperations] Error incidencias:', err);
      });
    };
    void setup();
    return () => unsub?.();
  }, []);

  // 5. Fusión profunda de datos en memoria (Reactiva)
  const propios: ServicioActivo[] = [];
  const rivales: ServicioActivo[] = [];
  
  busesRaw.forEach(bus => {
    const esPropio = bus.codigoEmpresa === empresaPropia;
    
    // Buscar listero/turno asignado
    const stringCoche = String(bus.codigoBus);
    const turno = listeroRaw.find(t => String(t.cocheActual) === stringCoche);
    
    // Buscar conductor
    let choferNombre = undefined;
    let choferLegajo = undefined;
    if (turno?.choferActual) {
      const chofer = personal.find(p => p.id === turno.choferActual);
      choferNombre = chofer?.fullName ?? chofer?.apodo ?? 'Conductor no registrado';
      choferLegajo = chofer?.internalNumber ?? chofer?.legajo ?? undefined;
    }

    // Buscar desvío activo del coche (Match por coche_id y linea_id para evitar colisión cruzada)
    const desvio = desviosRaw.find(d => 
      String(d.coche_id) === stringCoche && 
      (d.linea_id ? String(d.linea_id) === bus.linea : true) &&
      !d.resuelto
    );

    // Buscar incidencia activa del coche o línea
    const incidencia = incidenciasRaw.find(
      i => i.estado !== 'cerrada' &&
           ((String(i.coche_id) === stringCoche && (i.linea_id ? String(i.linea_id) === bus.linea : true)) || 
           (i.linea_id && !i.coche_id && String(i.linea_id) === bus.linea))
    );

    const servicio: ServicioActivo = {
      id: `${bus.codigoEmpresa}-${stringCoche}`, // Globally unique to prevent map marker collisions
      codigoBus: stringCoche,
      empresa: bus.empresa,
      empresaId: bus.codigoEmpresa,
      linea: bus.linea,
      sublinea: bus.sublinea,
      destino: bus.destinoDesc,
      lat: bus.lat,
      lng: bus.lng,
      velocidad: bus.velocidad,
      // Fusión de Listero
      servicioId: turno?.servicioId,
      horaInicio: turno?.horaInicio,
      choferId: turno?.choferActual ?? undefined,
      choferNombre,
      choferLegajo,
      estadoTurno: turno?.status,
      // Fusión de Alertas
      desvio,
      incidencia,
    };

    if (esPropio) {
      propios.push(servicio);
    } else {
      rivales.push(servicio);
    }
  });

  // Detección de bunching y KPIs unificados
  const bunchingAlertas = calcularBunching(propios);
  
  // Contar desvíos e incidencias específicos de nuestra empresa propia
  const desviosPropios = desviosRaw.filter(d => 
    propios.some(p => p.codigoBus === String(d.coche_id))
  ).length;

  const incidenciasPropias = incidenciasRaw.filter(i => 
    !i.coche_id || propios.some(p => p.codigoBus === String(i.coche_id))
  ).length;

  const kpis: LiveOperationsKPIs = {
    totalPropios: propios.length,
    totalRivales: rivales.length,
    desviosAbiertos: desviosPropios,
    incidenciasAbiertas: incidenciasPropias,
    bunchingPares: bunchingAlertas.length,
  };

  return {
    serviciosPropios: propios,
    serviciosRivales: rivales,
    desvios: desviosRaw,
    incidencias: incidenciasRaw,
    bunching: bunchingAlertas,
    kpis,
    loading: loading && busesRaw.length === 0,
    error,
    lastUpdate,
    empresaCfg,
    refrescar: cargarGPS,
  };
}
