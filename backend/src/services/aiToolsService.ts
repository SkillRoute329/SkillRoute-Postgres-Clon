/**
 * AIToolsService — herramientas read-only que el copiloto puede invocar.
 *
 * Cada tool tiene dos partes:
 *   1. `spec` → descriptor JSON-Schema que le pasamos al modelo (Ollama).
 *   2. `handler` → función TypeScript que ejecuta la consulta real en Firestore.
 *
 * Para agregar una tool nueva: define su spec en TOOL_SPECS y su handler
 * en TOOL_HANDLERS con el MISMO nombre de `function.name`.
 */

import { getAllVehicles, getVehicleById } from './fleetService';
import type { ToolSpec } from './aiService';
import { createSuggestion } from './aiOrdersService';
import { analizarCompetenciaLinea } from './stmPublicDataScraper';
import axios from 'axios';
import logger from '../config/logger';

type ToolContext = { userId: string; model: string };
type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

// ─── Especificaciones (las que ve el modelo) ──────────────────────────────────
//
// Separadas en READ y WRITE para que el orquestador pueda pasar solo el
// subset apropiado según la ruta (agent especializado).

export const READ_TOOL_SPECS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'get_fleet_status',
      description:
        'Devuelve el estado agregado de la flota UCOT: cantidad total de vehículos y desglose por estado (available, maintenance, service, disabled). Usar cuando el inspector pregunta "cuántos coches tenemos", "cuántos en servicio", "estado general de flota".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_vehicle_by_internal_number',
      description:
        'Busca un coche específico por su número interno (ej: "55", "300", "1042") y devuelve su estado actual, matrícula, modelo, último check y conductor asignado. Usar cuando el inspector menciona un interno específico.',
      parameters: {
        type: 'object',
        properties: {
          internal_number: {
            type: 'string',
            description: 'Número interno del coche (sin prefijos), ej: "55"',
          },
        },
        required: ['internal_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_vehicles_in_service',
      description:
        'Lista los coches UCOT actualmente en servicio (status = service) con su número interno y conductor. Usar cuando el inspector quiere saber quiénes están en la calle ahora mismo.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description:
        'Devuelve la fecha y hora actual del servidor en zona horaria Uruguay. Usar antes de analizar horarios, frecuencias o cualquier cálculo que dependa del momento actual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_positions',
      description:
        'Devuelve las posiciones GPS reales en tiempo real de todos los coches UCOT que están en la calle ahora mismo, obtenido directamente de la API de la Intendencia (STM). Usar cuando el inspector pregunta "¿dónde están los coches?", "¿cuál es el más cercano?", o para ver el estado real del tráfico.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_competition_report',
      description:
        'Genera un análisis profundo de competencia para una línea específica. Compara paradas, frecuencias y detecta "amenazas" de otras empresas (CUTCSA, COETC, COME) que coinciden en el recorrido. Usar cuando el inspector dice "el 300 viene muy cargado" o "la competencia nos está sacando gente".',
      parameters: {
        type: 'object',
        properties: {
          line_id: {
            type: 'string',
            description: 'Número de línea a analizar (ej: "300", "370", "173")',
          },
        },
        required: ['line_id'],
      },
    },
  },
];

export const WRITE_TOOL_SPECS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'suggest_hold_vehicle',
      description:
        'PROPONE (no ejecuta) retener un coche UCOT por X minutos en su próxima parada. La sugerencia queda pendiente de aprobación del inspector humano. Usar cuando la situación táctica justifique cerrar un gap (ej: el siguiente interno está muy cerca, o hay que dejar separación con la competencia).',
      parameters: {
        type: 'object',
        properties: {
          internal_number: { type: 'string', description: 'Interno del coche a retener' },
          minutes: { type: 'number', description: 'Minutos de retención (1-15)' },
          reason: { type: 'string', description: 'Motivo táctico breve' },
        },
        required: ['internal_number', 'minutes', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_advance_vehicle',
      description:
        'PROPONE (no ejecuta) que un coche UCOT adelante el paso (minimice paradas, acelere) para cerrar un gap. Queda pendiente de aprobación humana.',
      parameters: {
        type: 'object',
        properties: {
          internal_number: { type: 'string', description: 'Interno del coche a adelantar' },
          line_id: { type: 'string', description: 'Línea que está cubriendo (ej: "300")' },
          reason: { type: 'string', description: 'Motivo táctico breve' },
        },
        required: ['internal_number', 'reason'],
      },
    },
  },
];

/** Todas las tools juntas — usado por la ruta TACTICAL (8B con read + write). */
export const TOOL_SPECS: ToolSpec[] = [...READ_TOOL_SPECS, ...WRITE_TOOL_SPECS];

// ─── Handlers (ejecutan la consulta real) ─────────────────────────────────────

const handlers: Record<string, ToolHandler> = {
  async get_fleet_status() {
    const vehicles = await getAllVehicles();
    const byStatus: Record<string, number> = {
      available: 0,
      maintenance: 0,
      service: 0,
      disabled: 0,
    };
    for (const v of vehicles) {
      byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
    }
    return { total: vehicles.length, by_status: byStatus };
  },

  async find_vehicle_by_internal_number(args) {
    const internal = String(args.internal_number ?? '').trim();
    if (!internal) return { error: 'internal_number vacío' };

    const vehicles = await getAllVehicles();
    const match = vehicles.find((v) => v.internalNumber === internal);
    if (!match) return { error: `No se encontró coche con interno ${internal}` };

    try {
      const full = await getVehicleById(match.id);
      return {
        internal_number: full.internalNumber,
        plate: full.plate,
        model: full.model,
        status: full.status,
        last_check_status: full.lastCheckStatus ?? 'sin datos',
        last_check_date: full.lastCheckDate ?? null,
        current_driver: full.currentDriver ?? 'sin asignar',
      };
    } catch {
      return { error: `Coche ${internal} encontrado pero no se pudo leer detalle` };
    }
  },

  async list_vehicles_in_service() {
    const vehicles = await getAllVehicles();
    const inService = vehicles
      .filter((v) => v.status === 'service')
      .map((v) => ({
        internal_number: v.internalNumber,
        plate: v.plate,
        driver: v.currentDriver ?? 'sin asignar',
      }));
    return { count: inService.length, vehicles: inService };
  },

  async get_current_datetime() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      uruguay_local: now.toLocaleString('es-UY', { timeZone: 'America/Montevideo' }),
      day_of_week: now.toLocaleDateString('es-UY', {
        weekday: 'long',
        timeZone: 'America/Montevideo',
      }),
    };
  },

  async get_active_positions() {
    // API STM Online — requiere POST (GET devuelve 405). El endpoint ignora el
    // filtro por empresa en el body, así que traemos todo y filtramos UCOT
    // (codigoEmpresa === 70) en memoria. Mapeo: 20=COME, 50=CUTCSA, 70=UCOT.
    try {
      const res = await axios.post(
        'https://www.montevideo.gub.uy/buses/rest/stm-online',
        {},
        {
          timeout: 8000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TransformaFacil-Copiloto/2.0',
          },
        },
      );

      const features = (res.data?.features ?? []) as Array<{
        properties: {
          codigoEmpresa: number;
          codigoBus: number;
          linea: string;
          variante: number;
          sublinea?: string;
          destinoDesc?: string;
          velocidad?: number;
        };
        geometry: { coordinates: [number, number] };
      }>;

      const ucot = features
        .filter((f) => f.properties.codigoEmpresa === 70)
        .map((f) => ({
          interno: f.properties.codigoBus,
          linea: f.properties.linea,
          sublinea: f.properties.sublinea,
          destino: f.properties.destinoDesc,
          velocidad_kmh: f.properties.velocidad,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));

      return {
        count: ucot.length,
        source: 'IMM / STM Real-time (empresa=70 UCOT)',
        vehicles: ucot.slice(0, 30),
      };
    } catch (err) {
      logger.error('[AI-TOOLS] Error fetching STM positions', { error: String(err) });
      return { error: 'No se pudo conectar con la API de la Intendencia en este momento.' };
    }
  },

  async get_competition_report(args) {
    const lineId = String(args.line_id || '').trim();
    if (!lineId) return { error: 'line_id es requerido' };

    try {
      const report = await analizarCompetenciaLinea(lineId);
      return {
        linea: report.linea,
        resumen: report.resumen,
        amenazas_criticas: report.competidores.filter(c => c.amenaza === 'CRITICA' || c.amenaza === 'ALTA'),
        analisis_frecuencia: report.analisisFrequencia
      };
    } catch (err) {
      return { error: `No se pudo analizar la competencia para la línea ${lineId}`, detail: String(err) };
    }
  },

  async suggest_hold_vehicle(args, ctx) {
    const internal = String(args.internal_number ?? '').trim();
    const minutes = Number(args.minutes ?? 0);
    const reason = String(args.reason ?? '').trim();

    if (!internal || !reason) return { error: 'internal_number y reason son requeridos' };
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 15) {
      return { error: 'minutes debe estar entre 1 y 15' };
    }

    const order = await createSuggestion({
      type: 'hold_vehicle',
      targetInternalNumber: internal,
      params: { minutes },
      summary: `Retener interno ${internal} por ${minutes} min. Motivo: ${reason}`,
      createdByModel: ctx.model,
      requestedByUserId: ctx.userId,
      conversationContext: reason,
    });

    return {
      order_id: order.id,
      status: order.status,
      summary: order.summary,
      note: 'Pendiente de aprobación del inspector humano.',
    };
  },

  async suggest_advance_vehicle(args, ctx) {
    const internal = String(args.internal_number ?? '').trim();
    const lineId = args.line_id ? String(args.line_id).trim() : undefined;
    const reason = String(args.reason ?? '').trim();

    if (!internal || !reason) return { error: 'internal_number y reason son requeridos' };

    const order = await createSuggestion({
      type: 'advance_vehicle',
      targetInternalNumber: internal,
      lineId,
      params: {},
      summary: `Adelantar paso del interno ${internal}${lineId ? ` (línea ${lineId})` : ''}. Motivo: ${reason}`,
      createdByModel: ctx.model,
      requestedByUserId: ctx.userId,
      conversationContext: reason,
    });

    return {
      order_id: order.id,
      status: order.status,
      summary: order.summary,
      note: 'Pendiente de aprobación del inspector humano.',
    };
  },
};

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; ok: boolean }> {
  const handler = handlers[name];
  if (!handler) {
    logger.warn(`[AITools] Tool desconocida: ${name}`);
    return { result: { error: `Tool '${name}' no existe` }, ok: false };
  }
  try {
    const result = await handler(args, ctx);
    logger.debug(`[AITools] ${name} ejecutada`, { args });
    return { result, ok: true };
  } catch (err) {
    logger.error(`[AITools] ${name} falló`, { err: String(err) });
    return { result: { error: String(err) }, ok: false };
  }
}
