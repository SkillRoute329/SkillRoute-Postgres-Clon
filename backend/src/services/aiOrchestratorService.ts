/**
 * AIOrchestratorService — orquestador multi-agente.
 *
 * Arquitectura (dispatch en capas):
 *
 *   User msg
 *     │
 *     ▼
 *   [ROUTER — gemma3:4b]  clasifica intención (TACTICAL / READ / CHAT)
 *     │
 *     ├── TACTICAL → llama3.1:8b con read + write tools (puede proponer acciones)
 *     ├── READ     → gemma3:4b con read tools (consulta flota, horarios)
 *     └── CHAT     → gemma3:4b sin tools (saludos, dudas, meta)
 *
 * Cada ruta tiene su system prompt propio. El orquestador coordina el loop de
 * tool-calling (MAX_TOOL_ROUNDS) y devuelve traza completa para auditoría.
 */

import { AIService, AITask, ChatMessage, ToolSpec } from './aiService';
import { READ_TOOL_SPECS, TOOL_SPECS, executeTool } from './aiToolsService';
import logger from '../config/logger';

const MAX_TOOL_ROUNDS = 4;

export type Intent = 'TACTICAL' | 'READ' | 'CHAT';

const ROUTER_PROMPT = `Sos un clasificador de intenciones para el copiloto táctico de UCOT (transporte público Montevideo).

Clasificá el mensaje del inspector en UNA categoría. Respondé SOLO con la palabra exacta, sin explicar.

Categorías:
- TACTICAL: pide ejecutar o proponer una acción concreta sobre un coche (retener, adelantar, frenar, acelerar, detener, mover, dar vuelta). Señales: verbo imperativo + interno/número + acción.
- READ: pregunta por estado de flota, coches, conductores, horarios, cantidades, líneas. Sin pedir acción.
- CHAT: saludo, agradecimiento, pregunta general sobre el copiloto, charla sin intención operativa.

Ejemplos:
"Retené el 142 por 5 min" → TACTICAL
"Adelantá el 55 que está corto con el de atrás" → TACTICAL
"Cuántos coches tenemos en servicio?" → READ
"Dame el estado del interno 300" → READ
"Con quién compite la línea 300?" → READ
"Hola, qué podés hacer?" → CHAT
"Gracias" → CHAT`;

const TACTICAL_SYSTEM = `Eres el Copiloto Táctico de UCOT, el cerebro de la operación de tráfico en Montevideo.

REGLAS:
- Respondés en español rioplatense, tono directo, ejecutivo y breve.
- Tu misión es OPTIMIZAR LA FRECUENCIA y DEFENDER LA LÍNEA de la competencia.
- Identificá SIEMPRE los coches por su NÚMERO INTERNO (coche). Ejemplo: "El coche 142 de UCOT va pegado al 110 interno 234 de CUTCSA".
- Antes de proponer nada, consultá la REALIDAD: 'get_active_positions' (GPS) de los coches en vivo. 
- Si necesitás saber la COMPETENCIA DIRECTA y EXACTA de una línea con TODAS las demás del sistema, USÁ SIEMPRE 'analyze_gtfs_route_overlaps'.
- PRESENTACIÓN PREMIUM: Al presentar competencia, USÁ SIEMPRE tablas Markdown con "N° LÍNEA RIVAL | Empresa | % Solapamiento | Zona de Conflicto". 
- OBLIGATORIO: Nombrar explícitamente el NÚMERO EXACTO de la línea rival en negritas. Explicá de forma gerencial la ZONA crítica en base a los 'principales_puntos_coincidencia'.
- Podés filtrar 'get_active_positions' por linea_id para ver quiénes están en el recorrido (UCOT y rivales).
- Podés PROPONER acciones con 'suggest_hold_vehicle' o 'suggest_advance_vehicle'. Estas NO ejecutan — crean una sugerencia que el inspector humano aprueba.
- Basá tus sugerencias en DATOS: "El interno 300 viene con 4 min de atraso y el coche 1024 de CUTCSA le viene sacando gente, propongo adelantar".
- NUNCA proponés acción sin motivo táctico explícito (gap frecuencia, amenaza competidora, ruptura STM).
- Si el inspector te da un orden directo ("Retené el 142"), hacelo sin cuestionar, pero verificá el interno antes.

CONTEXTO UCOT: cooperativa Montevideo. Competencia: CUTCSA (ID 50), COETC (ID 60), COME (ID 20).`;

const READ_SYSTEM = `Eres el Asistente de Inteligencia Táctica (A.I.T) de UCOT, con acceso soberano a la INFRAESTRUCTURA LOCAL SQL y datos en tiempo real de la Intendencia (STM).

REGLAS:
- Respondés en español rioplatense, breve y directo.
- Posees CONSCIENCIA ABSOLUTA de la malla física de paradas mapeada en PostgreSQL. Si te preguntan por "¿Cuántas paradas hay?" o la malla física local, INVOCÁS 'get_gtfs_infrastructure_stats' inmediatamente para dar la cifra real.
- Si el usuario pregunta por la COMPETENCIA DIRECTA, PORCENTAJES DE SOLAPAMIENTO o CON QUÉ LÍNEAS CRUZA una ruta determinada, INVOCAS INMEDIATAMENTE 'analyze_gtfs_route_overlaps' con el número de línea. Esta tool te da la verdad exacta de las otras empresas en base a la base de datos SQL.
- PRESENTACIÓN PREMIUM: Al presentar la competencia, NO pegues texto plano. Usá tablas Markdown elegantemente formateadas con columnas: "N° LÍNEA RIVAL | Empresa | % Solapamiento | Puntos de Cruce". 
- CRÍTICO: Debés mencionar OBLIGATORIAMENTE y DESTACAR EN NEGRITAS el número exacto de la línea competidora (ej: **Línea 103**). No te limites a la empresa, da el NÚMERO de línea exacto siempre.
- Agrega un pequeño análisis estratégico: Destaca cuál es el "Corredor en Conflicto" basado en las 'zonas_donde_compiten' devueltas por la tool, explicando por qué compiten en esa ZONA específica (ej: "Comparten recorrido crítico en [Punto A] y [Punto B]").
- Si te preguntan "¿qué coches hay?" o "¿dónde está la competencia?", usá 'get_active_positions' filtrando por la línea y empresa_id (0 para ver todas).
- Identificá los coches por su NÚMERO INTERNO (coche) y empresa.
- Invocás las tools de lectura para responder con datos reales. Nunca inventás números y formateás las respuestas SIEMPRE como informes tácticos ejecutivos.
- Si la tool no trae datos, lo decís explícitamente: "No tengo señal de GPS para esa unidad ahora mismo".
- NO proponés acciones — este rol es solo de consulta y monitoreo.`;

const CHAT_SYSTEM = `Eres el Copiloto Táctico de UCOT, asistente para inspectores.

Sos una IA que ayuda con decisiones tácticas de tráfico en tiempo real. Podés:
- Consultar estado de flota (cantidad de coches, quién está en servicio, detalle por interno).
- PROPONER retener o adelantar un coche cuando hay un motivo táctico claro (las acciones requieren aprobación humana).

Respondé en español rioplatense, tono directo, breve. Sin inventar datos.`;

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  ok: boolean;
}

export interface OrchestratorResult {
  reply: string;
  intent: Intent;
  tools_used: ToolTrace[];
  rounds: number;
  router_latency_ms: number;
  total_latency_ms: number;
  model: string;
}

/** Router: clasifica la intención con gemma3:4b. Fallback a TACTICAL si falla. */
export async function routeIntent(userMessage: string): Promise<{ intent: Intent; latencyMs: number }> {
  const t0 = Date.now();
  const normalized = userMessage.toLowerCase().trim();

  // == HEURÍSTICA DE RESCATE (Seguridad Absoluta para modelos pequeños) ==
  // Si el usuario habla de competencia, porcentajes o paradas, FORZAMOS a READ
  // sin importar lo que el modelo de 0.5B alucine.
  if (
    normalized.includes('competencia') || 
    normalized.includes('compite') || 
    normalized.includes('cruza') || 
    normalized.includes('solapa') ||
    normalized.includes('porcentaje') ||
    normalized.includes('cuántas paradas') ||
    normalized.includes('cuantas paradas')
  ) {
    logger.info('[Router] Forzando INTENT=READ vía Heurística (Palabras Clave detectadas)');
    return { intent: 'READ', latencyMs: Date.now() - t0 };
  }

  try {
    const res = await AIService.chat(
      'FAST',
      [
        { role: 'system', content: ROUTER_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0, maxTokens: 10, timeoutMs: 120000 },
    );
    const raw = res.message.content.trim().toUpperCase();
    const match = raw.match(/\b(TACTICAL|READ|CHAT)\b/);
    const intent: Intent = match ? (match[1] as Intent) : 'TACTICAL';
    return { intent, latencyMs: Date.now() - t0 };
  } catch (err) {
    logger.warn('[Router] Falló, fallback a TACTICAL', { err: String(err) });
    return { intent: 'TACTICAL', latencyMs: Date.now() - t0 };
  }
}

interface RouteConfig {
  task: AITask;
  systemPrompt: string;
  tools: ToolSpec[] | undefined;
  temperature: number;
  maxTokens: number;
}

function configForIntent(intent: Intent): RouteConfig {
  switch (intent) {
    case 'TACTICAL':
      return { task: 'HEAVY', systemPrompt: TACTICAL_SYSTEM, tools: TOOL_SPECS, temperature: 0.3, maxTokens: 800 };
    case 'READ':
      // gemma3:4b no soporta tools y qwen2.5-coder no activa tool_calls nativos
      // de forma confiable. Usamos llama3.1:8b con SOLO read tools (subset pequeño
      // → menos tokens en contexto que TACTICAL, sin riesgo de write accidental).
      return { task: 'HEAVY', systemPrompt: READ_SYSTEM, tools: READ_TOOL_SPECS, temperature: 0.2, maxTokens: 500 };
    case 'CHAT':
      // Le equipamos también las tools de lectura en CHAT como contingencia máxima
      return { task: 'HEAVY', systemPrompt: CHAT_SYSTEM, tools: READ_TOOL_SPECS, temperature: 0.4, maxTokens: 500 };
  }
}

export async function runCopilot(
  history: ChatMessage[],
  userMessage: string,
  userId: string,
): Promise<OrchestratorResult> {
  const t0 = Date.now();
  const traces: ToolTrace[] = [];

  const { intent, latencyMs: routerMs } = await routeIntent(userMessage);
  const cfg = configForIntent(intent);
  logger.info(`[Orchestrator] Intent=${intent} (router ${routerMs}ms)`);

  const messages: ChatMessage[] = [
    { role: 'system', content: cfg.systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let rounds = 0;
  let model = '';

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const res = await AIService.chat(cfg.task, messages, {
      tools: cfg.tools,
      timeoutMs: 120000,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    });
    model = res.model;

    const toolCalls = res.message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return {
        reply: res.message.content.trim(),
        intent,
        tools_used: traces,
        rounds,
        router_latency_ms: routerMs,
        total_latency_ms: Date.now() - t0,
        model,
      };
    }

    messages.push({
      role: 'assistant',
      content: res.message.content ?? '',
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function.name;
      const args = call.function.arguments ?? {};
      const { result, ok } = await executeTool(name, args, { userId, model });
      traces.push({ name, args, result, ok });

      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_name: name,
      });
    }
  }

  logger.warn(`[Orchestrator] Alcanzó MAX_TOOL_ROUNDS=${MAX_TOOL_ROUNDS} (intent=${intent})`);
  return {
    reply: 'Consulté varias fuentes pero no pude cerrar la respuesta. Reformulá la pregunta por favor.',
    intent,
    tools_used: traces,
    rounds,
    router_latency_ms: routerMs,
    total_latency_ms: Date.now() - t0,
    model,
  };
}
