/**
 * immScheduleService.ts — ScheduleWatchdog
 * =========================================
 * Sincroniza horarios oficiales de la IMM (Intendencia de Montevideo).
 * Ejecuta planificación automática en ventana 01:00–03:00 AM.
 *
 * Fuente oficial: https://www.montevideo.gub.uy/buses/rest/
 *
 * CASCADA DE DATOS:
 *  1. IMM API (via backend proxy) → IMM_LIVE
 *  2. Cache localStorage (< 24h)  → CACHE
 *  3. Master JSON UCOT 2026       → MASTER
 *
 * GESTIÓN DE INCERTIDUMBRE 2G/5G:
 *  - Bus sin GPS → estado 'INCIERTO' (nunca se acusa sin evidencia)
 *  - Bus reaparece → se verifica contra horario esperado en ese momento
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type IMM_DataSource = 'IMM_LIVE' | 'PROXY_CACHE' | 'LOCAL_CACHE' | 'MASTER';

/** Variante de línea según la API de la IMM */
export interface IMMVariante {
  varianteCodigo: string;
  linea: string;
  /** Descripción completa: "DESDE ... HASTA ..." */
  descripcion: string;
  origen: string;
  destino: string;
  /** true = servicio especial (nocturno, refuerzo) */
  especial: boolean;
  sentido: 'A' | 'B' | 'C';
}

/** Horario de una salida de la IMM */
export interface IMMSalida {
  hora: string;         // "HH:MM"
  variante: string;
  tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO' | 'ESPECIAL';
}

/** Horario completo de una variante por tipo de día */
export interface IMMHorarioVariante {
  varianteCodigo: string;
  linea: string;
  origen: string;
  destino: string;
  salidasHabil:   IMMSalida[];
  salidasSabado:  IMMSalida[];
  salidasDomingo: IMMSalida[];
  /** Frecuencia calculada en pico (min) — derivada de las salidas reales */
  frecPicoMin: number;
  /** Frecuencia calculada en valle (min) */
  frecValleMin: number;
  /** Frecuencia calculada en fin de semana (min) */
  frecFinSemanaMin: number;
}

/** Resultado de comparar horarios de hoy vs ayer */
export interface IMMCambioDetectado {
  linea: string;
  variante: string;
  tipo: 'NUEVA_SALIDA' | 'SALIDA_ELIMINADA' | 'CAMBIO_FRECUENCIA';
  detalle: string;
  timestamp: Date;
}

/** Foto del día: estado completo de todas las líneas monitoreadas */
export interface FotoDelDia {
  timestamp: Date;
  source: IMM_DataSource;
  lineas: Record<string, LineaFoto>;
  cambiosDetectados: IMMCambioDetectado[];
  totalLineasSincronizadas: number;
  totalLineasConCambios: number;
}

/** Foto de una línea específica */
export interface LineaFoto {
  lineId: string;
  variantes: IMMVariante[];
  horarios: IMMHorarioVariante[];
  /** Última sincronización con la IMM */
  lastSync: Date;
  source: IMM_DataSource;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** URL base del backend proxy (evita CORS de la IMM) */
const BACKEND_BASE = (() => {
  const env = (typeof import.meta !== 'undefined' ? (import.meta as { env?: { PROD?: boolean; VITE_BRIDGE_URL?: string } }).env : undefined) || {};
  if (env.VITE_BRIDGE_URL) return env.VITE_BRIDGE_URL;
  if (env.PROD) return '';
  return 'http://localhost:3099';
})();

/** URL directa de la IMM (solo disponible si el backend la proxea) */
const IMM_BASE = 'https://www.montevideo.gub.uy/buses/rest';

/** Cache key en localStorage */
const CACHE_KEY_FOTO = 'imm_foto_del_dia_v2';
const CACHE_KEY_SYNC = 'imm_last_sync_v2';

/** TTL del cache: 22 horas (la próxima sync es a la 1 AM del día siguiente) */
const CACHE_TTL_MS = 22 * 60 * 60 * 1000;

/** Timeout de llamadas a la API */
const API_TIMEOUT_MS = 15_000;

/** Líneas UCOT + rivales principales a monitorear */
const LINEAS_A_MONITOREAR = [
  // UCOT
  '300', '306', '316', '328', '329', '330', '370', '396',
  '221', 'DM1', 'CE1',
  // Rivales Cutcsa principales
  '103', '125', '148', '181', '110',
  // Rivales COETC
  'G1', 'G3', 'G5',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Calcula la frecuencia media de un array de salidas en una franja horaria */
function calcularFrecuencia(salidas: IMMSalida[], horaInicio: string, horaFin: string): number {
  const enFranja = salidas.filter((s) => s.hora >= horaInicio && s.hora < horaFin);
  if (enFranja.length < 2) return 0;
  
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  
  const gaps: number[] = [];
  for (let i = 1; i < enFranja.length; i++) {
    gaps.push(toMin(enFranja[i].hora) - toMin(enFranja[i - 1].hora));
  }
  
  // Media aritmética (descartar outliers > 45 min)
  const gapsFiltrados = gaps.filter((g) => g > 0 && g <= 45);
  if (gapsFiltrados.length === 0) return 0;
  return Math.round(gapsFiltrados.reduce((s, g) => s + g, 0) / gapsFiltrados.length);
}

/** Parsea respuesta de variantes de la IMM */
function parsearVariantes(raw: unknown[]): IMMVariante[] {
  return raw
    .filter((v: unknown) => v !== null && typeof v === 'object')
    .map((v: unknown) => {
      const item = v as Record<string, unknown>;
      return {
        varianteCodigo: String(item['varianteCodigo'] ?? item['codigo'] ?? ''),
        linea: String(item['linea'] ?? ''),
        descripcion: String(item['descripcion'] ?? item['nombre'] ?? ''),
        origen: String(item['origen'] ?? ''),
        destino: String(item['destino'] ?? ''),
        especial: Boolean(item['especial'] ?? false),
        sentido: (['A', 'B', 'C'].includes(String(item['sentido'])) ? item['sentido'] : 'A') as 'A' | 'B' | 'C',
      };
    })
    .filter((v) => v.varianteCodigo !== '');
}

/** Parsea salidas de horario de la IMM */
function parsearSalidas(raw: unknown[], tipoDia: IMMSalida['tipoDia'], varianteCodigo: string): IMMSalida[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: unknown) => {
      const item = s as Record<string, unknown>;
      // La IMM puede devolver "hora" como "HH:MM" o "HH:MM:SS"
      const horaRaw = String(item['hora'] ?? item['time'] ?? '');
      const hora = horaRaw.substring(0, 5); // Tomar solo HH:MM
      return { hora, variante: varianteCodigo, tipoDia };
    })
    .filter((s) => /^\d{2}:\d{2}$/.test(s.hora))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

// ─── Fetch desde la API de la IMM (via proxy backend) ───────────────────────

/** Intenta fetch via proxy backend, luego directo a IMM */
async function fetchIMM(path: string): Promise<unknown> {
  const proxyUrl = `${BACKEND_BASE}/api/imm${path}`;
  const directUrl = `${IMM_BASE}${path}`;
  
  // Intentar via proxy primero
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (res.ok) {
      const data: unknown = await res.json();
      return data;
    }
  } catch {
    // fallthrough a directo
  }
  
  // Intentar directo (puede fallar por CORS en navegador)
  try {
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (res.ok) {
      const data: unknown = await res.json();
      return data;
    }
  } catch {
    // fallthrough
  }
  
  return null;
}

/** Obtiene las variantes de una línea desde la IMM */
export async function fetchVariantes(linea: string): Promise<IMMVariante[]> {
  const raw = await fetchIMM(`/variantes?linea=${encodeURIComponent(linea)}`);
  if (!raw || !Array.isArray(raw)) return [];
  return parsearVariantes(raw);
}

/** Obtiene los horarios de una variante por tipo de día */
export async function fetchHorariosVariante(
  varianteCodigo: string,
  linea: string,
  origen: string,
  destino: string,
): Promise<IMMHorarioVariante> {
  // La IMM suele tener un endpoint por tipo de día
  const [rawHabil, rawSabado, rawDomingo] = await Promise.all([
    fetchIMM(`/horarios?variante=${varianteCodigo}&tipoDia=0`),  // 0 = hábil
    fetchIMM(`/horarios?variante=${varianteCodigo}&tipoDia=1`),  // 1 = sábado
    fetchIMM(`/horarios?variante=${varianteCodigo}&tipoDia=2`),  // 2 = domingo
  ]);
  
  const salidasHabil   = parsearSalidas(Array.isArray(rawHabil)   ? rawHabil   : [], 'HABIL',   varianteCodigo);
  const salidasSabado  = parsearSalidas(Array.isArray(rawSabado)  ? rawSabado  : [], 'SABADO',  varianteCodigo);
  const salidasDomingo = parsearSalidas(Array.isArray(rawDomingo) ? rawDomingo : [], 'DOMINGO', varianteCodigo);
  
  // Calcular frecuencias derivadas de las salidas reales
  const frecPicoMin      = calcularFrecuencia(salidasHabil,   '07:00', '09:30') || 15;
  const frecValleMin     = calcularFrecuencia(salidasHabil,   '10:00', '16:00') || 20;
  const frecFinSemanaMin = calcularFrecuencia(salidasSabado,  '08:00', '20:00') || 25;
  
  return {
    varianteCodigo,
    linea,
    origen,
    destino,
    salidasHabil,
    salidasSabado,
    salidasDomingo,
    frecPicoMin,
    frecValleMin,
    frecFinSemanaMin,
  };
}

/** Sincroniza todas las líneas monitoreadas y construye la Foto del Día */
export async function syncFotoDelDia(): Promise<FotoDelDia> {
  const fotoAnterior = cargarFotoDesdecache();
  const lineas: Record<string, LineaFoto> = {};
  const cambiosDetectados: IMMCambioDetectado[] = [];
  let lineasSincronizadas = 0;
  let source: IMM_DataSource = 'MASTER';
  
  for (const lineId of LINEAS_A_MONITOREAR) {
    try {
      const variantes = await fetchVariantes(lineId);
      
      if (variantes.length > 0) {
        // Tomar solo la variante principal (sentido A y B, no especiales)
        const variantesPrincipales = variantes.filter((v) => !v.especial).slice(0, 2);
        
        const horarios: IMMHorarioVariante[] = await Promise.all(
          variantesPrincipales.map((v) =>
            fetchHorariosVariante(v.varianteCodigo, v.linea, v.origen, v.destino),
          ),
        );
        
        // Detectar cambios vs foto anterior
        const fotoAnteriorLinea = fotoAnterior?.lineas[lineId];
        if (fotoAnteriorLinea && horarios.length > 0) {
          const horariosAnteriores = fotoAnteriorLinea.horarios;
          horarios.forEach((h) => {
            const hAnterior = horariosAnteriores.find(
              (a) => a.varianteCodigo === h.varianteCodigo,
            );
            if (hAnterior) {
              const diferencia = Math.abs(h.frecPicoMin - hAnterior.frecPicoMin);
              if (diferencia >= 3) {
                cambiosDetectados.push({
                  linea: lineId,
                  variante: h.varianteCodigo,
                  tipo: 'CAMBIO_FRECUENCIA',
                  detalle: `Frecuencia pico cambió de ${hAnterior.frecPicoMin} a ${h.frecPicoMin} min`,
                  timestamp: new Date(),
                });
              }
            }
          });
        }
        
        lineas[lineId] = {
          lineId,
          variantes: variantesPrincipales,
          horarios,
          lastSync: new Date(),
          source: 'IMM_LIVE',
        };
        
        lineasSincronizadas++;
        source = 'IMM_LIVE';
      } else if (fotoAnterior?.lineas[lineId]) {
        // Usar datos del día anterior si la IMM no respondió
        lineas[lineId] = {
          ...fotoAnterior.lineas[lineId],
          source: 'LOCAL_CACHE',
        };
      }
    } catch {
      // Si falla, usar cache anterior sin romper todo
      if (fotoAnterior?.lineas[lineId]) {
        lineas[lineId] = {
          ...fotoAnterior.lineas[lineId],
          source: 'LOCAL_CACHE',
        };
      }
    }
  }
  
  const foto: FotoDelDia = {
    timestamp: new Date(),
    source,
    lineas,
    cambiosDetectados,
    totalLineasSincronizadas: lineasSincronizadas,
    totalLineasConCambios: cambiosDetectados.length,
  };
  
  // Guardar en cache
  guardarFotoEnCache(foto);
  
  return foto;
}

// ─── Cache localStorage ───────────────────────────────────────────────────────

export function cargarFotoDesdecache(): FotoDelDia | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_FOTO);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FotoDelDia & { timestamp: string };
    const timestamp = new Date(parsed.timestamp);
    const edad = Date.now() - timestamp.getTime();
    if (edad > CACHE_TTL_MS) return null; // Expirado
    return { ...parsed, timestamp };
  } catch {
    return null;
  }
}

function guardarFotoEnCache(foto: FotoDelDia): void {
  try {
    localStorage.setItem(CACHE_KEY_FOTO, JSON.stringify(foto));
    localStorage.setItem(CACHE_KEY_SYNC, new Date().toISOString());
  } catch {
    // localStorage lleno — ignorar
  }
}

export function getUltimaSync(): Date | null {
  const raw = localStorage.getItem(CACHE_KEY_SYNC);
  if (!raw) return null;
  return new Date(raw);
}

/** Retorna la frecuencia real de una línea para un tipo de día, o null si no hay datos IMM */
export function getFrecuenciaReal(
  foto: FotoDelDia,
  lineId: string,
  tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO',
  sentido: 'A' | 'B' = 'A',
): { frecPicoMin: number; frecValleMin: number; salidas: IMMSalida[] } | null {
  const lineaFoto = foto.lineas[lineId];
  if (!lineaFoto || lineaFoto.horarios.length === 0) return null;
  
  // Tomar la variante del sentido solicitado
  const horario = lineaFoto.horarios.find((h) => {
    const variante = lineaFoto.variantes.find((v) => v.varianteCodigo === h.varianteCodigo);
    return variante?.sentido === sentido;
  }) ?? lineaFoto.horarios[0];
  
  const salidas =
    tipoDia === 'HABIL'   ? horario.salidasHabil :
    tipoDia === 'SABADO'  ? horario.salidasSabado :
                            horario.salidasDomingo;
  
  return {
    frecPicoMin: horario.frecPicoMin,
    frecValleMin: horario.frecValleMin,
    salidas,
  };
}

/** 
 * ¿Es la ventana de planificación nocturna? (01:00–03:00 AM)
 * Usado para ejecutar la syncFotoDelDia automáticamente.
 */
export function esVentanaDePlanificacion(): boolean {
  const hora = new Date().getHours();
  return hora >= 1 && hora < 3;
}

/**
 * Retorna el horario de salidas esperadas para el momento actual de una línea.
 * Útil para el TrampaDetector: compara con la posición GPS real.
 */
export function getSalidasEsperadasAhora(
  foto: FotoDelDia,
  lineId: string,
  ventanaMin: number = 30,
): IMMSalida[] {
  const ahora = new Date();
  const tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO' =
    ahora.getDay() === 0 ? 'DOMINGO' :
    ahora.getDay() === 6 ? 'SABADO' : 'HABIL';
  
  const datos = getFrecuenciaReal(foto, lineId, tipoDia);
  if (!datos) return [];
  
  const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  
  // Devolver salidas en la ventana [ahora - 5min, ahora + ventanaMin]
  return datos.salidas.filter((s) => {
    const sMin = toMin(s.hora);
    return sMin >= ahoraMin - 5 && sMin <= ahoraMin + ventanaMin;
  });
}
