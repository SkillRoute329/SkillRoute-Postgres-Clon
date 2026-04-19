/**
 * Rutas de IA — /api/ai
 *
 * POST /api/ai/generate   — modelo local one-shot (FAST/CODER/HEAVY)
 * POST /api/ai/cloud      — Claude API (requiere ANTHROPIC_API_KEY)
 * POST /api/ai/embed      — embeddings vectoriales
 * POST /api/ai/chat       — copiloto conversacional con tool-calling
 */

import { Router, Request, Response } from 'express';
import { AIService, AITask, ChatMessage } from '../services/aiService';
import { runCopilot } from '../services/aiOrchestratorService';
import {
  listPendingOrders,
  approveOrder,
  rejectOrder,
  getOrder,
} from '../services/aiOrdersService';
import { verifyAuth } from '../middleware/auth';

const router = Router();

const VALID_TASKS: AITask[] = ['FAST', 'CODER', 'HEAVY', 'EMBED'];

/**
 * POST /api/ai/generate
 * Body: { task: 'FAST'|'CODER'|'HEAVY', prompt: string, maxTokens?: number }
 */
router.post('/generate', verifyAuth, async (req: Request, res: Response) => {
  const { task, prompt, maxTokens } = req.body as {
    task: AITask;
    prompt: string;
    maxTokens?: number;
  };

  if (!prompt || !task || !VALID_TASKS.includes(task)) {
    res.status(400).json({ error: 'Parámetros requeridos: task (FAST|CODER|HEAVY), prompt' });
    return;
  }

  try {
    const result = await AIService.generate(task, prompt, { maxTokens });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Modelos locales offline', detail: String(err) });
  }
});

/**
 * POST /api/ai/cloud
 * Body: { prompt: string, maxTokens?: number }
 * Requiere ANTHROPIC_API_KEY en .env
 */
router.post('/cloud', verifyAuth, async (req: Request, res: Response) => {
  const { prompt, maxTokens } = req.body as { prompt: string; maxTokens?: number };

  if (!prompt) {
    res.status(400).json({ error: 'Parámetro requerido: prompt' });
    return;
  }

  try {
    const result = await AIService.callClaude(prompt, maxTokens);
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Claude API no disponible', detail: String(err) });
  }
});

/**
 * POST /api/ai/embed
 * Body: { text: string }
 */
router.post('/embed', verifyAuth, async (req: Request, res: Response) => {
  const { text } = req.body as { text: string };

  if (!text) {
    res.status(400).json({ error: 'Parámetro requerido: text' });
    return;
  }

  try {
    const embedding = await AIService.embed(text);
    res.json({ embedding, model: 'nomic-embed-text' });
  } catch (err) {
    res.status(503).json({ error: 'Embedding offline', detail: String(err) });
  }
});

/**
 * POST /api/ai/chat
 * Body: { history: ChatMessage[], message: string }
 * Devuelve: { reply, tools_used, rounds, total_latency_ms, model }
 *
 * Copiloto conversacional. El backend se encarga de inyectar el system prompt
 * y manejar el loop de tool-calling (ver aiOrchestratorService.ts).
 */
router.post('/chat', verifyAuth, async (req: Request, res: Response) => {
  const { history, message } = req.body as {
    history?: ChatMessage[];
    message?: string;
  };
  const userId = (req as any).user?.id ?? 'anonymous';

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Parámetro requerido: message (string)' });
    return;
  }

  const cleanHistory: ChatMessage[] = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-12)
    : [];

  try {
    const result = await runCopilot(cleanHistory, message, userId);
    res.json(result);
  } catch (err) {
    res.status(503).json({
      error: 'Copiloto no disponible',
      detail: String(err),
      hint: 'Verificá que Ollama esté corriendo y que el modelo llama3.1:8b esté instalado.',
    });
  }
});

// ─── Sugerencias (ai_orders) ──────────────────────────────────────────────────

/**
 * GET /api/ai/orders?status=suggested
 * Lista sugerencias pendientes del copiloto.
 */
router.get('/orders', verifyAuth, async (_req: Request, res: Response) => {
  try {
    const orders = await listPendingOrders();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo listar sugerencias', detail: String(err) });
  }
});

/**
 * GET /api/ai/orders/:id — detalle de una sugerencia (auditoría).
 */
router.get('/orders/:id', verifyAuth, async (req: Request, res: Response) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Sugerencia no encontrada' });
      return;
    }
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo sugerencia', detail: String(err) });
  }
});

/**
 * POST /api/ai/orders/:id/approve
 * El inspector aprueba. Queda registrado quién y cuándo.
 */
router.post('/orders/:id/approve', verifyAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? 'anonymous';
  try {
    const order = await approveOrder(req.params.id, userId);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

/**
 * POST /api/ai/orders/:id/reject
 * Body: { reason: string }
 */
router.post('/orders/:id/reject', verifyAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? 'anonymous';
  const reason = String((req.body as { reason?: string })?.reason ?? '').trim();
  if (!reason) {
    res.status(400).json({ error: 'Parámetro requerido: reason' });
    return;
  }
  try {
    const order = await rejectOrder(req.params.id, userId, reason);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
