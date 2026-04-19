/**
 * rivalTrackerService.ts — RivalLineTracker
 * ==========================================
 * Seguimiento en tiempo real de todos los buses en la red STM.
 * Detecta adelantos de horario y genera evidencia para el Dossier Regulatorio.
 *
 * REGLA DE ORO (Precisión vs Certeza):
 *   → Solo se acusa trampa si hay confirmación GPS activa.
 *   → Bus sin señal = estado INCIERTO (nunca silencio + nunca acusación falsa).
 *   → Un bus que reaparece: se verifica contra horario esperado en ese momento.
 *
 * TECNOLOGÍA 2G/5G:
 *   → 5G: posición continua, alta precisión temporal
 *   → 2G: actualizaciones intermitentes (30s – 5min de gap)
 *   → Sin señal: bus puede estar operando pero invisible para el sistema
 */

import {
  cargarFotoDesdecache,
  getSalidasEsperadasAhora,
  type IMMSalida,
} from './immScheduleService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoBus =
  | 'NORMAL'          // Opera dentro del horario esperado (±2 min)
  | 'SOSPECHOSO'      // Adelanto de 2-5 minutos
  | 'INFRACCION'      // Adelanto > 5 minutos (trampa confirmada)
  | 'INFRACCION_GRAVE'// Adelanto > 10 minutos
  | 'INCIERTO'        // Sin señal GPS — no se puede determinar
  | 'RETRASO';        // Atraso > 5 minutos (no infracción, pero notable)

/** Estado de un bus individual desde la API STM */
export interface BusSTM {
  /** ID único del bus en el sistema STM */
  idBus: string;
  /** Número de línea (ej: "300", "103") */
  linea: string;
  /** Variante de ruta */
  variante: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
  /** Velocidad en km/h */
  velocidad: number;
  /** Dirección en grados */
  direccion: number;
  /** Timestamp del último reporte GPS */
  timestampGPS: Date;
  /** Empresa operadora */
  empresa: string;
  /** ¿Señal activa? (false = 2G con gap) */
  senalActiva: boolean;
}

/** Análisis de un bus individual contra su horario esperado */
export interface AnalisisBus {
  bus: BusSTM;
  /** Salida esperada más cercana en el tiempo */
  salidaEsperada: IMMSalida | null;
  /** Delta en minutos (positivo = adelantado, negativo = retrasado) */
  deltaMinutos: number | null;
  estado: EstadoBus;
  /** Nivel de confianza del análisis (0-100) */
  confianza: number;
  /** Descripción del análisis para el inspector */
  descripcion: string;
  /** ¿Se debe registrar en el Dossier? */
  registrarEnDossier: boolean;
  timestamp: Date;
}

/** Informe de seguimiento de una línea rival */
export interface InformeRival {
  lineId: string;
  empresa: string;
  buses: AnalisisBus[];
  resumen: {
    total: number;
    normales: number;
    sospechosos: number;
    infracciones: number;
    inciertos: number;
    retrasos: number;
  };
  nivelAmenaza: 'ALTO' | 'MEDIO' | 'BAJO' | 'INCIERTO';
  ultimaActualizacion: Date;
}

/** Evento de infracción para el Dossier Regulatorio */
export interface EventoInfraccion {
  id: string; // UUID
  timestamp: Date;
  lineaRival: string;
  empresaRival: string;
  idBus: string;
  lat: number;
  lng: number;
  deltaMinutos: number;
  estado: EstadoBus;
  salidaEsperadaHora: string;
  /** Hash SHA-256 del evento para garantizar inmutabilidad */
  hashIntegridad: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const BRIDGE_BASE = import.meta.env?.PROD ? '' : 'http://localhost:3099';

const IMM_POSICION_URL = 'https://www.montevideo.gub.uy/buses/rest/posicion';
const POSICION_CACHE_TTL_MS = 30_000; // 30 segundos

/** Tolerancia normal de operación en minutos */
const TOLERANCIA_NORMAL_MIN = 2;
/** Umbral de sospecha en minutos */
const UMBRAL_SOSPECHA_MIN = 5;
/** Umbral de infracción grave en minutos */
const UMBRAL_GRAVE_MIN = 10;
/** Gap máximo de GPS para considerar señal activa (milisegundos) */
const MAX_GAP_GPS_ACTIVO_MS = 3 * 60 * 1000; // 3 minutos

// ─── Cache de posiciones ──────────────────────────────────────────────────────

let _posicionesCache: BusSTM[] = [];
let _posicionesCacheTs = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generarId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function sha256(mensaje: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(mensaje);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback básico si crypto.subtle no está disponible
  return `hash_${mensaje.length}_${Date.now()}`;
}

/** Parsea la respuesta de posiciones de la API STM */
function parsearPosiciones(raw: unknown): BusSTM[] {
  if (!Array.isArray(raw)) return [];
  
  const ahora = Date.now();
  
  return raw
    .filter((b: unknown) => b !== null && typeof b === 'object')
    .map((b: unknown) => {
      const item = b as Record<string, unknown>;
      const tsGPS = new Date(String(item['timestamp'] ?? item['fecha'] ?? new Date()));
      const gapMs = ahora - tsGPS.getTime();
      
      return {
        idBus: String(item['idBus'] ?? item['id'] ?? item['numeroBus'] ?? ''),
        linea: String(item['linea'] ?? item['numeroLinea'] ?? ''),
        variante: String(item['variante'] ?? item['varianteCodigo'] ?? ''),
        lat: Number(item['lat'] ?? item['latitud'] ?? item['y'] ?? 0),
        lng: Number(item['lng'] ?? item['longitud'] ?? item['x'] ?? 0),
        velocidad: Number(item['velocidad'] ?? 0),
        direccion: Number(item['direccion'] ?? item['rumbo'] ?? 0),
        timestampGPS: tsGPS,
        empresa: String(item['empresa'] ?? item['nombreEmpresa'] ?? 'Desconocida'),
        senalActiva: gapMs < MAX_GAP_GPS_ACTIVO_MS,
      } as BusSTM;
    })
    .filter((b) => b.idBus !== '' && b.lat !== 0 && b.lng !== 0);
}

// ─── Fetch de posiciones ──────────────────────────────────────────────────────

/** Obtiene posiciones en tiempo real desde el bridge o la IMM directamente */
export async function fetchPosicionesSTM(): Promise<BusSTM[]> {
  const ahora = Date.now();
  // Usar cache si está fresca
  if (_posicionesCache.length > 0 && ahora - _posicionesCacheTs < POSICION_CACHE_TTL_MS) {
    return _posicionesCache;
  }
  
  // Intentar via bridge (sin CORS)
  try {
    const res = await fetch(`${BRIDGE_BASE}/api/posicion`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const data: unknown = await res.json();
      const buses = parsearPosiciones(Array.isArray(data) ? data : (data as Record<string, unknown>)['buses'] ?? []);
      if (buses.length > 0) {
        _posicionesCache = buses;
        _posicionesCacheTs = ahora;
        return buses;
      }
    }
  } catch {
    // fallthrough
  }
  
  // Intentar directo a la IMM (puede fallar por CORS)
  try {
    const res = await fetch(IMM_POSICION_URL, { signal: AbortSignal.timeout(12_000) });
    if (res.ok) {
      const data: unknown = await res.json();
      const buses = parsearPosiciones(Array.isArray(data) ? data : []);
      if (buses.length > 0) {
        _posicionesCache = buses;
        _posicionesCacheTs = ahora;
        return buses;
      }
    }
  } catch {
    // fallthrough
  }
  
  // Devolver cache aunque esté vieja (mejor que nada)
  return _posicionesCache;
}

// ─── Analizador principal ────────────────────────────────────────────────────

/**
 * Analiza un bus individual contra el horario esperado de su línea.
 * Implementa la regla de incertidumbre 2G/5G.
 */
export async function analizarBus(bus: BusSTM): Promise<AnalisisBus> {
  // Sin señal → INCIERTO (regla fundamental de no acusación)
  if (!bus.senalActiva) {
    return {
      bus,
      salidaEsperada: null,
      deltaMinutos: null,
      estado: 'INCIERTO',
      confianza: 20,
      descripcion: `Bus ${bus.idBus} (L.${bus.linea}): sin señal GPS activa. Estado desconocido — posiblemente 2G.`,
      registrarEnDossier: false,
      timestamp: new Date(),
    };
  }
  
  // Con señal: comparar contra horario esperado
  const foto = cargarFotoDesdecache();
  if (!foto) {
    return {
      bus,
      salidaEsperada: null,
      deltaMinutos: null,
      estado: 'INCIERTO',
      confianza: 30,
      descripcion: `Bus ${bus.idBus} (L.${bus.linea}): sin Foto del Día disponible. Ejecutar sincronización IMM.`,
      registrarEnDossier: false,
      timestamp: new Date(),
    };
  }
  
  const salidasEsperadas = getSalidasEsperadasAhora(foto, bus.linea, 60);
  
  if (salidasEsperadas.length === 0) {
    return {
      bus,
      salidaEsperada: null,
      deltaMinutos: null,
      estado: 'INCIERTO',
      confianza: 40,
      descripcion: `Bus ${bus.idBus} (L.${bus.linea}): no hay salidas esperadas en la ventana actual (fuera de horario).`,
      registrarEnDossier: false,
      timestamp: new Date(),
    };
  }
  
  // Calcular delta con la salida esperada más próxima
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  
  // Buscar la salida esperada más cercana al momento actual
  const salidaMasCercana = salidasEsperadas.reduce((prev, curr) => {
    const distPrev = Math.abs(toMin(prev.hora) - ahoraMin);
    const distCurr = Math.abs(toMin(curr.hora) - ahoraMin);
    return distCurr < distPrev ? curr : prev;
  });
  
  const salidaMin = toMin(salidaMasCercana.hora);
  // Positivo = el bus está adelantado al horario
  const delta = salidaMin - ahoraMin;
  
  let estado: EstadoBus;
  let confianza: number;
  let descripcion: string;
  let registrarEnDossier: boolean;
  
  if (delta > UMBRAL_GRAVE_MIN) {
    estado = 'INFRACCION_GRAVE';
    confianza = 90;
    descripcion = `⛔ INFRACCIÓN GRAVE: L.${bus.linea} adelantó ${delta} min (esperado: ${salidaMasCercana.hora}). GPS confirmado.`;
    registrarEnDossier = true;
  } else if (delta > UMBRAL_SOSPECHA_MIN) {
    estado = 'INFRACCION';
    confianza = 85;
    descripcion = `🚨 INFRACCIÓN: L.${bus.linea} adelantó ${delta} min (esperado: ${salidaMasCercana.hora}). Dentro del margen de trampa.`;
    registrarEnDossier = true;
  } else if (delta > TOLERANCIA_NORMAL_MIN) {
    estado = 'SOSPECHOSO';
    confianza = 70;
    descripcion = `⚠️ SOSPECHOSO: L.${bus.linea} con ${delta} min de adelanto. Dentro del margen de tolerancia (≤5 min).`;
    registrarEnDossier = false;
  } else if (delta < -UMBRAL_SOSPECHA_MIN) {
    estado = 'RETRASO';
    confianza = 80;
    descripcion = `⏳ RETRASO: L.${bus.linea} con ${Math.abs(delta)} min de atraso. Puede causar pérdida de pasajeros.`;
    registrarEnDossier = false;
  } else {
    estado = 'NORMAL';
    confianza = 95;
    descripcion = `✅ NORMAL: L.${bus.linea} operando en rango (${delta >= 0 ? '+' : ''}${delta} min).`;
    registrarEnDossier = false;
  }
  
  return {
    bus,
    salidaEsperada: salidaMasCercana,
    deltaMinutos: delta,
    estado,
    confianza,
    descripcion,
    registrarEnDossier,
    timestamp: new Date(),
  };
}

/** Genera un informe de seguimiento para una línea rival */
export async function generarInformeRival(
  lineId: string,
  empresa: string,
  buses: BusSTM[],
): Promise<InformeRival> {
  const busesDeLinea = buses.filter((b) => b.linea === lineId);
  
  const analisis = await Promise.all(busesDeLinea.map(analizarBus));
  
  const contadores = {
    total: analisis.length,
    normales: analisis.filter((a) => a.estado === 'NORMAL').length,
    sospechosos: analisis.filter((a) => a.estado === 'SOSPECHOSO').length,
    infracciones: analisis.filter(
      (a) => a.estado === 'INFRACCION' || a.estado === 'INFRACCION_GRAVE'
    ).length,
    inciertos: analisis.filter((a) => a.estado === 'INCIERTO').length,
    retrasos: analisis.filter((a) => a.estado === 'RETRASO').length,
  };
  
  let nivelAmenaza: InformeRival['nivelAmenaza'];
  if (contadores.infracciones >= 2 || analisis.some((a) => a.estado === 'INFRACCION_GRAVE')) {
    nivelAmenaza = 'ALTO';
  } else if (contadores.sospechosos >= 2 || contadores.infracciones >= 1) {
    nivelAmenaza = 'MEDIO';
  } else if (contadores.inciertos > contadores.total / 2) {
    nivelAmenaza = 'INCIERTO';
  } else {
    nivelAmenaza = 'BAJO';
  }
  
  return {
    lineId,
    empresa,
    buses: analisis,
    resumen: contadores,
    nivelAmenaza,
    ultimaActualizacion: new Date(),
  };
}

/** Crea un evento de infracción con hash de integridad para el Dossier */
export async function crearEventoInfraccion(
  analisis: AnalisisBus,
): Promise<EventoInfraccion> {
  const evento = {
    id: generarId(),
    timestamp: analisis.timestamp,
    lineaRival: analisis.bus.linea,
    empresaRival: analisis.bus.empresa,
    idBus: analisis.bus.idBus,
    lat: analisis.bus.lat,
    lng: analisis.bus.lng,
    deltaMinutos: analisis.deltaMinutos ?? 0,
    estado: analisis.estado,
    salidaEsperadaHora: analisis.salidaEsperada?.hora ?? '??:??',
    hashIntegridad: '',
  };
  
  // Hash para inmutabilidad
  const contenido = JSON.stringify({
    ...evento,
    hashIntegridad: undefined,
  });
  evento.hashIntegridad = await sha256(contenido);
  
  return evento;
}
