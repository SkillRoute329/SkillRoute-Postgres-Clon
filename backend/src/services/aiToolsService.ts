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
import { gtfsService } from '../modules/gtfs-core';
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
        'Devuelve las posiciones GPS reales en tiempo real de los coches en la calle, obtenido directamente de la API de la Intendencia (STM). Permite filtrar por línea y empresa. Usar para saber qué coches específicos (número interno) están en el recorrido ahora mismo.',
      parameters: {
        type: 'object',
        properties: {
          line_id: {
            type: 'string',
            description: 'Opcional: Filtrar por línea específica (ej: "300")',
          },
          empresa_id: {
            type: 'number',
            description: 'Opcional: ID de empresa (70=UCOT, 50=CUTCSA, 20=COME, 0=TODAS)',
          },
        },
      },
    },
  },
  // ELIMINADO POR OBSOLETO Y LIMITADO SOLO A UCOT:
  // {
  //   type: 'function',
  //   function: {
  //     name: 'get_competition_report',
  //     description:
  //       'Genera un análisis profundo de competencia para una línea específica. Compara paradas, frecuencias y detecta "amenazas" de otras empresas (CUTCSA, COETC, COME) que coinciden en el recorrido. Usar cuando el inspector dice "el 300 viene muy cargado" o "la competencia nos está sacando gente".',
  //     parameters: {
  //       type: 'object',
  //       properties: {
  //         line_id: {
  //           type: 'string',
  //           description: 'Número de línea a analizar (ej: "300", "370", "173")',
  //         },
  //       },
  //       required: ['line_id'],
  //     },
  //   },
  // },
  {
    type: 'function',
    function: {
      name: 'get_gtfs_infrastructure_stats',
      description:
        'Devuelve estadísticas soberanas sobre la infraestructura cargada en la base de datos SQL local. Incluye el total de paradas físicas mapeadas y el total de líneas (routes) configuradas. Usar cuando el inspector pregunte "¿Cuántas paradas hay?", "¿Qué infraestructura tenemos cargada?", o quiera verificar el estado del núcleo de datos.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stop_schedule_intel',
      description:
        'Consulta el Oráculo de horarios teóricos para una parada específica utilizando los calendarios oficiales SQL. Devuelve los próximos ómnibus que pasarán por allí hoy.',
      parameters: {
        type: 'object',
        properties: {
          stop_id: {
            type: 'string',
            description: 'ID de la parada (ej: "3413")',
          },
        },
        required: ['stop_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_gtfs_route_overlaps',
      description:
        'Analiza el solapamiento real y exacto en la base de datos soberana SQL entre la línea consultada y todas las demás líneas del sistema STM (competencia directa). Devuelve porcentaje de coincidencia de recorrido y empresas rivales. Usar para responder preguntas como "¿Con qué líneas compite la 300?", "¿Qué porcentaje compartimos con X?", "Análisis de solapamiento de la línea 76".',
      parameters: {
        type: 'object',
        properties: {
          line_id: {
            type: 'string',
            description: 'Número corto de la línea objetivo (ej: "300", "76")',
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

  async get_active_positions(args) {
    const lineId = args.line_id ? String(args.line_id).trim() : null;
    const targetEmpresa = args.empresa_id !== undefined ? Number(args.empresa_id) : 70; // Por defecto UCOT

    try {
      const res = await axios.post(
        'https://www.montevideo.gub.uy/buses/rest/stm-online',
        {},
        {
          timeout: 10000,
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

      const empresaMap: Record<number, string> = {
        70: 'UCOT',
        50: 'CUTCSA',
        20: 'COME',
        60: 'COETC',
        10: 'RAINCOOP (Ex)',
      };

      const filtered = features
        .filter((f) => {
          const matchEmpresa = targetEmpresa === 0 || f.properties.codigoEmpresa === targetEmpresa;
          const matchLinea = !lineId || f.properties.linea === lineId;
          return matchEmpresa && matchLinea;
        })
        .map((f) => ({
          interno: f.properties.codigoBus,
          empresa: empresaMap[f.properties.codigoEmpresa] || `ID ${f.properties.codigoEmpresa}`,
          linea: f.properties.linea,
          sublinea: f.properties.sublinea,
          destino: f.properties.destinoDesc,
          velocidad_kmh: f.properties.velocidad,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));

      return {
        count: filtered.length,
        empresa_filtrada: targetEmpresa === 0 ? 'TODAS' : empresaMap[targetEmpresa] || targetEmpresa,
        linea_filtrada: lineId || 'TODAS',
        vehicles: filtered.slice(0, 40),
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

  async get_gtfs_infrastructure_stats() {
    try {
      const stats = await gtfsService.getStats();
      return {
        status: 'online',
        database: 'PostgreSQL (Local)',
        total_paradas: stats.stops,
        total_lineas_configuradas: stats.routes,
        timestamp: new Date().toISOString(),
        note: 'Estos datos provienen de la sincronización local directa con la base de datos soberana de la empresa.'
      };
    } catch (err) {
      return { error: 'No se pudo leer estadísticas de base de datos local.', detail: String(err) };
    }
  },

  async get_stop_schedule_intel(args) {
    const stopId = String(args.stop_id || '').trim();
    if (!stopId) return { error: 'stop_id es requerido' };
    try {
      const departures = await gtfsService.getNextDepartures(stopId, 5);
      return {
        stop_id: stopId,
        next_scheduled_departures: departures,
        count: departures.length,
        note: 'Horarios oficiales teóricos cruzados con el calendario de hoy.'
      };
    } catch (err) {
      return { error: `Error al consultar oráculo de horarios para la parada ${stopId}`, detail: String(err) };
    }
  },

  async analyze_gtfs_route_overlaps(args) {
    const lineId = String(args.line_id || '').trim();
    if (!lineId) return { error: 'line_id es requerido' };
    
    try {
      const analysis = await gtfsService.getCompetitiveOverlaps(lineId);
      
      if (!analysis || analysis.length === 0) {
        return {
          status: 'no_data',
          message: `No se encontraron recorridos o cruces para la línea ${lineId} en la base GTFS.`
        };
      }

      const totalStopsOnLine = analysis[0]?.target_total_stops || 0;

      return {
        linea_consultada: lineId,
        total_paradas_linea: totalStopsOnLine,
        rivales_detectados_top: analysis.map((r: any) => ({
          numero_linea_rival: r.rival_route, // Campo explícito para que no lo omita
          nombre_recorrido: r.rival_name,
          empresa: r.inferred_company,
          paradas_compartidas: r.shared_count,
          porcentaje_solapamiento: r.overlap_percentage + '%',
          zonas_donde_compiten: r.principales_puntos_coincidencia
        })),
        resumen_estrategico: `La línea ${lineId} comparte infraestructura con al menos ${analysis.length} rutas rivales. Su mayor competidor por cobertura de paradas es la línea ${analysis[0].rival_route} con un ${analysis[0].overlap_percentage}% de solapamiento.`
      };
    } catch (err) {
      return { error: `Fallo el análisis de solapamiento SQL para ${lineId}`, detail: String(err) };
    }
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
