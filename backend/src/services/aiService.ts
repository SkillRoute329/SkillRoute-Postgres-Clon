/**
 * AIService — Backend Multi-Modelo TransformaFacil
 *
 * Modelos Ollama locales (configurables vía env):
 *   FAST   → gemma3:4b          — análisis táctico rápido
 *   CODER  → qwen2.5-coder:7b  — lógica / validación (fallback: 1.5b-base)
 *   HEAVY  → llama3.1:8b        — copiloto con tool-calling
 *   EMBED  → nomic-embed-text   — búsqueda semántica
 *
 * Claude API (Anthropic) solo se usa si ANTHROPIC_API_KEY está configurada
 * y el frontend pide explícitamente /api/ai/cloud.
 */

import fetch from 'node-fetch';

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export type AITask = 'FAST' | 'CODER' | 'HEAVY' | 'EMBED';

const MODEL_MAP: Record<AITask, string> = {
  FAST:  process.env.OLLAMA_MODEL_FAST  || 'gemma3:4b',
  CODER: process.env.OLLAMA_MODEL_CODER || 'qwen2.5-coder:7b',
  HEAVY: process.env.OLLAMA_MODEL_HEAVY || 'llama3.1:8b',
  EMBED: process.env.OLLAMA_MODEL_EMBED || 'nomic-embed-text',
};

export interface AIResult {
  text: string;
  model: string;
  source: 'local' | 'cloud';
  latencyMs: number;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_name?: string;
}

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface ChatResult {
  message: ChatMessage;
  model: string;
  latencyMs: number;
  done: boolean;
}

export class AIService {
  /**
   * Llama a un modelo Ollama local.
   * Fallback automático: FAST → HEAVY si el modelo falla.
   */
  static async generate(
    task: AITask,
    prompt: string,
    opts: { timeoutMs?: number; temperature?: number; maxTokens?: number } = {},
  ): Promise<AIResult> {
    const { timeoutMs = 15000, temperature = 0.5, maxTokens = 200 } = opts;

    try {
      return await this.callOllama(MODEL_MAP[task], prompt, timeoutMs, temperature, maxTokens);
    } catch (err) {
      // Fallback FAST → HEAVY
      if (task === 'FAST') {
        return this.callOllama(MODEL_MAP.HEAVY, prompt, timeoutMs, temperature, maxTokens);
      }
      throw err;
    }
  }

  /**
   * Genera embeddings vectoriales con nomic-embed-text.
   */
  static async embed(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL_MAP.EMBED, prompt: text }),
    });
    if (!res.ok) throw new Error(`[AIService] Embed error: ${res.status}`);
    const json = (await res.json()) as { embedding: number[] };
    return json.embedding;
  }

  /**
   * Llama a Claude API (Anthropic). Solo si ANTHROPIC_API_KEY está configurada.
   * El frontend nunca debe llamar a Claude directamente — siempre via este endpoint.
   */
  static async callClaude(prompt: string, maxTokens = 500): Promise<AIResult> {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('[AIService] ANTHROPIC_API_KEY no configurada.');
    }
    const t0 = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[AIService] Claude API error ${res.status}: ${err}`);
    }
    const json = (await res.json()) as { content: Array<{ text: string }> };
    return {
      text: json.content[0]?.text ?? '',
      model: 'claude-sonnet-4-6',
      source: 'cloud',
      latencyMs: Date.now() - t0,
    };
  }

  /**
   * Chat multi-turno con soporte opcional de tool-calling (Ollama /api/chat).
   * Llama3.1 soporta tools nativos. Si el modelo decide invocar una tool,
   * devuelve `message.tool_calls` y el orquestador debe ejecutarla y re-llamar.
   */
  static async chat(
    task: AITask,
    messages: ChatMessage[],
    opts: {
      tools?: ToolSpec[];
      timeoutMs?: number;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<ChatResult> {
    const { tools, timeoutMs = 60000, temperature = 0.3, maxTokens = 800 } = opts;
    const model = MODEL_MAP[task];
    const t0 = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        })),
        stream: false,
        keep_alive: '30m',
        options: { temperature, num_predict: maxTokens, num_ctx: 4096 },
      };
      if (tools && tools.length > 0) body.tools = tools;

      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal as AbortSignal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`[AIService.chat] HTTP ${res.status}: ${txt}`);
      }

      const json = (await res.json()) as {
        message: {
          role: ChatRole;
          content: string;
          tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
        };
        done: boolean;
      };

      return {
        message: {
          role: json.message.role,
          content: json.message.content ?? '',
          tool_calls: json.message.tool_calls,
        },
        model,
        latencyMs: Date.now() - t0,
        done: json.done,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Pre-carga un modelo en memoria (VRAM) enviando una petición vacía con
   * keep_alive largo. Elimina los ~5s de carga que paga el primer usuario.
   * Fire-and-forget: no bloquea el arranque del server.
   */
  static prewarm(task: AITask = 'HEAVY'): void {
    const model = MODEL_MAP[task];
    fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [],
        stream: false,
        keep_alive: '30m',
      }),
    })
      .then(() => {
        // eslint-disable-next-line no-console
        console.log(`[AIService] Prewarm OK: ${model}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[AIService] Prewarm falló (${model}):`, String(err));
      });
  }

  // ─── Privado ────────────────────────────────────────────────────────────────

  private static async callOllama(
    model: string,
    prompt: string,
    timeoutMs: number,
    temperature: number,
    maxTokens: number,
  ): Promise<AIResult> {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature, num_predict: maxTokens },
        }),
        signal: controller.signal as AbortSignal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { response: string };
      return { text: json.response.trim(), model, source: 'local', latencyMs: Date.now() - t0 };
    } finally {
      clearTimeout(timer);
    }
  }
}
