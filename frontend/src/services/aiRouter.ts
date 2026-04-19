/**
 * AIRouter — Enrutador Multi-Modelo TransformaFacil
 *
 * Estrategia de costos:
 *   FAST   → gemma3:4b         (respuestas tácticas en tiempo real, <2s)
 *   CODER  → qwen2.5-coder:7b  (lógica de negocio, análisis de código)
 *   HEAVY  → llama3.1:8b       (razonamiento complejo, reportes ejecutivos)
 *   EMBED  → nomic-embed-text  (búsqueda semántica / RAG)
 *   CLOUD  → Claude API        (solo cuando ningún local es suficiente)
 */

const OLLAMA_BASE = 'http://localhost:11434';

export type AITask = 'FAST' | 'CODER' | 'HEAVY' | 'EMBED' | 'CLOUD';
export type AgentRole = 'ORCHESTRATOR' | 'DISPATCHER' | 'MECHANIC' | 'HR' | 'GEO';

const MODEL_MAP: Record<AITask, string> = {
  FAST: 'gemma3:4b',
  CODER: 'qwen2.5-coder:7b',
  HEAVY: 'llama3.1:8b',
  EMBED: 'nomic-embed-text',
  CLOUD: 'claude-sonnet-4-6', // solo si CLOUD_ENABLED=true
};

const AGENT_PROMPTS: Record<AgentRole, string> = {
  ORCHESTRATOR:
    'Eres el Supervisor Táctico de UCOT. Analiza la situación y decide si necesitas ayuda de los especialistas (Dispatcher, Mecánico, RRHH).',
  DISPATCHER:
    'Eres el Especialista en Tráfico y Líneas UCOT. Tu foco es la frecuencia y la competencia (Shadowing).',
  MECHANIC: 'Eres el Jefe de Talleres UCOT. Evalúa riesgos mecánicos y telemetría de motor.',
  HR: 'Eres el Gestor de Personal. Gestiona relevos, libretas y bienestar del chofer.',
  GEO: 'Eres el Experto Geoespacial. Calcula rutas, desvíos por ferias o cortes de calle.',
};

export interface RouterOptions {
  task: AITask;
  prompt: string;
  role?: AgentRole; // Nuevo: Rol del agente que responde
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface RouterResult {
  text: string;
  model: string;
  source: 'local' | 'cloud';
  latencyMs: number;
  agent?: AgentRole; // Nuevo: El agente que finalmente resolvió
}

export class AIRouter {
  private static readonly CLOUD_ENABLED = false;

  /**
   * Enruta la petición al modelo más barato capaz de resolver la tarea.
   * Si se especifica un rol, inyecta su personalidad de agente.
   */
  static async route(opts: RouterOptions): Promise<RouterResult> {
    const {
      task,
      prompt,
      role = 'ORCHESTRATOR',
      timeoutMs = 5000,
      temperature = 0.7,
      maxTokens = 100,
    } = opts;

    // Inyectar personalidad del agente
    const fullPrompt = `[AGENTE: ${role}] Contexto: ${AGENT_PROMPTS[role]}\n\nInstrucción: ${prompt}`;

    if (task === 'CLOUD') {
      if (!this.CLOUD_ENABLED) {
        throw new Error('[AIRouter] CLOUD desactivado.');
      }
      return this.callCloud(fullPrompt, maxTokens);
    }

    try {
      const res = await this.callOllama({
        model: MODEL_MAP[task],
        prompt: fullPrompt,
        timeoutMs,
        temperature,
        maxTokens,
      });
      return { ...res, agent: role };
    } catch {
      const fallback = this.getFallback(task);
      if (fallback === 'CLOUD' && !this.CLOUD_ENABLED) {
        throw new Error(`[AIRouter] Modelo local ${MODEL_MAP[task]} offline y CLOUD desactivado.`);
      }
      if (fallback) {
        const res = await (fallback === 'CLOUD'
          ? this.callCloud(fullPrompt, maxTokens)
          : this.callOllama({
              model: MODEL_MAP[fallback],
              prompt: fullPrompt,
              timeoutMs,
              temperature,
              maxTokens,
            }));
        return { ...res, agent: role };
      }
      throw new Error(`[AIRouter] Sin fallback para tarea ${task}`);
    }
  }

  /**
   * MÉTODO DE ORQUESTACIÓN: Detecta si un problema requiere delegación.
   */
  static async orchestrate(context: string): Promise<RouterResult> {
    console.log('[AIRouter] Iniciando Orquestación...');

    // 1. Fase de Triaje (usando modelo rápido para clasificar)
    const triagePrompt = `Analiza el siguiente texto y responde SOLO una de estas palabras clave: 
    DISPATCHER, MECHANIC, HR, GEO o GENERAL: "${context}"`;

    const triage = await this.route({
      task: 'FAST',
      prompt: triagePrompt,
      role: 'ORCHESTRATOR',
      maxTokens: 10,
    });
    const targetRole = triage.text.toUpperCase() as AgentRole | 'GENERAL';

    if (targetRole !== 'GENERAL' && AGENT_PROMPTS[targetRole as AgentRole]) {
      console.log(`[AIRouter] Traspaso (Handoff) detectado -> ${targetRole}`);
      return this.route({
        task: 'HEAVY', // Usar modelo pesado para el especialista
        prompt: context,
        role: targetRole as AgentRole,
        maxTokens: 50,
      });
    }

    // Respuesta general del orquestador si no se requiere especialista
    return this.route({ task: 'FAST', prompt: context, role: 'ORCHESTRATOR' });
  }

  // ... (Estructura de callOllama y callCloud se mantiene igual)

  static async embed(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL_MAP.EMBED, prompt: text }),
    });
    if (!res.ok) throw new Error('[AIRouter] Error generando embedding');
    const json = await res.json();
    return json.embedding as number[];
  }

  private static async callOllama(params: {
    model: string;
    prompt: string;
    timeoutMs: number;
    temperature: number;
    maxTokens: number;
  }): Promise<Omit<RouterResult, 'agent'>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    const t0 = Date.now();

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          prompt: params.prompt,
          stream: false,
          options: { temperature: params.temperature, num_predict: params.maxTokens },
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      return {
        text: (json.response as string).trim(),
        model: params.model,
        source: 'local',
        latencyMs: Date.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private static async callCloud(
    prompt: string,
    maxTokens: number,
  ): Promise<Omit<RouterResult, 'agent'>> {
    const t0 = Date.now();
    const res = await fetch('/api/ai/cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens }),
    });
    if (!res.ok) throw new Error('[AIRouter] Error en Cloud endpoint');
    const json = await res.json();
    return {
      text: json.text as string,
      model: MODEL_MAP.CLOUD,
      source: 'cloud',
      latencyMs: Date.now() - t0,
    };
  }

  private static getFallback(task: AITask): AITask | null {
    const chain: Partial<Record<AITask, AITask>> = {
      FAST: 'HEAVY',
      HEAVY: 'CLOUD',
      CODER: 'HEAVY',
    };
    return chain[task] ?? null;
  }
}
