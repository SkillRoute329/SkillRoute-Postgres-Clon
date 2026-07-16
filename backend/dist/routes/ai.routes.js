"use strict";
/**
 * Rutas de IA — /api/ai
 *
 * POST /api/ai/generate   — modelo local one-shot (FAST/CODER/HEAVY)
 * POST /api/ai/cloud      — Claude API (requiere ANTHROPIC_API_KEY)
 * POST /api/ai/embed      — embeddings vectoriales
 * POST /api/ai/chat       — copiloto conversacional con tool-calling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiService_1 = require("../services/aiService");
const aiOrchestratorService_1 = require("../services/aiOrchestratorService");
const aiOrdersService_1 = require("../services/aiOrdersService");
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../config/logger"));
const router = (0, express_1.Router)();
const VALID_TASKS = ['FAST', 'CODER', 'HEAVY', 'EMBED'];
/**
 * POST /api/ai/generate
 * Body: { task: 'FAST'|'CODER'|'HEAVY', prompt: string, maxTokens?: number }
 */
router.post('/generate', auth_1.verifyAuth, async (req, res) => {
    const { task, prompt, maxTokens } = req.body;
    if (!prompt || !task || !VALID_TASKS.includes(task)) {
        res.status(400).json({ error: 'Parámetros requeridos: task (FAST|CODER|HEAVY), prompt' });
        return;
    }
    try {
        const result = await aiService_1.AIService.generate(task, prompt, { maxTokens });
        res.json(result);
    }
    catch (err) {
        res.status(503).json({ error: 'Modelos locales offline', detail: String(err) });
    }
});
/**
 * POST /api/ai/cloud
 * Body: { prompt: string, maxTokens?: number }
 * Requiere ANTHROPIC_API_KEY en .env
 */
router.post('/cloud', auth_1.verifyAuth, async (req, res) => {
    const { prompt, maxTokens } = req.body;
    if (!prompt) {
        res.status(400).json({ error: 'Parámetro requerido: prompt' });
        return;
    }
    try {
        const result = await aiService_1.AIService.callClaude(prompt, maxTokens);
        res.json(result);
    }
    catch (err) {
        res.status(503).json({ error: 'Claude API no disponible', detail: String(err) });
    }
});
/**
 * POST /api/ai/embed
 * Body: { text: string }
 */
router.post('/embed', auth_1.verifyAuth, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        res.status(400).json({ error: 'Parámetro requerido: text' });
        return;
    }
    try {
        const embedding = await aiService_1.AIService.embed(text);
        res.json({ embedding, model: 'nomic-embed-text' });
    }
    catch (err) {
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
router.post('/chat', auth_1.verifyAuth, async (req, res) => {
    const { history, message } = req.body;
    const userId = req.user?.id ?? 'anonymous';
    if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Parámetro requerido: message (string)' });
        return;
    }
    const cleanHistory = Array.isArray(history)
        ? history
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .slice(-12)
        : [];
    try {
        const result = await (0, aiOrchestratorService_1.runCopilot)(cleanHistory, message, userId);
        res.json(result);
    }
    catch (err) {
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
router.get('/orders', auth_1.verifyAuth, async (_req, res) => {
    try {
        const orders = await (0, aiOrdersService_1.listPendingOrders)();
        res.json({ orders });
    }
    catch (err) {
        res.status(500).json({ error: 'No se pudo listar sugerencias', detail: String(err) });
    }
});
/**
 * GET /api/ai/orders/:id — detalle de una sugerencia (auditoría).
 */
router.get('/orders/:id', auth_1.verifyAuth, async (req, res) => {
    try {
        const order = await (0, aiOrdersService_1.getOrder)(req.params.id);
        if (!order) {
            res.status(404).json({ error: 'Sugerencia no encontrada' });
            return;
        }
        res.json({ order });
    }
    catch (err) {
        res.status(500).json({ error: 'Error leyendo sugerencia', detail: String(err) });
    }
});
/**
 * POST /api/ai/orders/:id/approve
 * El inspector aprueba. Queda registrado quién y cuándo.
 */
router.post('/orders/:id/approve', auth_1.verifyAuth, async (req, res) => {
    const userId = req.user?.id ?? 'anonymous';
    try {
        const order = await (0, aiOrdersService_1.approveOrder)(req.params.id, userId);
        res.json({ order });
    }
    catch (err) {
        res.status(400).json({ error: String(err) });
    }
});
/**
 * POST /api/ai/orders/:id/reject
 * Body: { reason: string }
 */
router.post('/orders/:id/reject', auth_1.verifyAuth, async (req, res) => {
    const userId = req.user?.id ?? 'anonymous';
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
        res.status(400).json({ error: 'Parámetro requerido: reason' });
        return;
    }
    try {
        const order = await (0, aiOrdersService_1.rejectOrder)(req.params.id, userId, reason);
        res.json({ order });
    }
    catch (err) {
        res.status(400).json({ error: String(err) });
    }
});
/**
 * POST /api/ai/parse-preferences
 * Body: { text: string }
 */
router.post('/parse-preferences', auth_1.verifyAuth, async (req, res) => {
    const { text, provider } = req.body;
    if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Parámetro requerido: text (string)' });
        return;
    }
    const prompt = `Eres un asistente experto en transporte público. Tu tarea es analizar una preferencia o regla de turnos de conductores escrita en español y estructurarla en un formato JSON específico.

Las opciones para "regimen" son únicamente: '15_15', 'semana_semana', 'fijo'.
Las opciones para "patronDescanso" son únicamente: 'fin_de_semana_rotativo', 'sabado', 'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'.

Preferencia escrita: "${text}"

Debes responder ÚNICAMENTE con un objeto JSON (sin markdown, sin bloques de código, sin texto explicativo) con esta estructura exacta:
{
  "nombre": "Nombre corto descriptivo (máx 50 caracteres, ej: Max 9h)",
  "descripcion": "Descripción detallada del comportamiento en español",
  "regimen": "15_15" | "semana_semana" | "fijo",
  "patronDescanso": "fin_de_semana_rotativo" | "sabado" | "domingo" | "lunes" | "martes" | "miercoles" | "jueves" | "viernes",
  "maxHours": número de horas máximas (si se indica, sino null),
  "minBreakMinutes": minutos de descanso mínimo (si se indica, sino null),
  "avoidSplitShifts": true o false (si indica evitar turnos partidos/doble jornada),
  "lineConstraint": "número/nombre de línea" (si indica restricción de línea, sino null)
}`;
    try {
        let aiRes;
        if (provider === 'openai') {
            if (!process.env.OPENAI_API_KEY) {
                res.status(400).json({ error: 'La clave API de OpenAI (OPENAI_API_KEY) no está configurada en el servidor.' });
                return;
            }
            aiRes = await aiService_1.AIService.callOpenAI(prompt, 400);
        }
        else if (provider === 'anthropic') {
            if (!process.env.ANTHROPIC_API_KEY) {
                res.status(400).json({ error: 'La clave API de Anthropic (ANTHROPIC_API_KEY) no está configurada en el servidor.' });
                return;
            }
            aiRes = await aiService_1.AIService.callClaude(prompt, 400);
        }
        else {
            aiRes = await aiService_1.AIService.generate('CODER', prompt, { maxTokens: 400, temperature: 0.1 });
        }
        let reply = aiRes.text.trim();
        if (reply.includes('{')) {
            const start = reply.indexOf('{');
            const end = reply.lastIndexOf('}');
            if (end > start) {
                reply = reply.substring(start, end + 1);
            }
        }
        let parsedRule;
        try {
            parsedRule = JSON.parse(reply);
        }
        catch (parseErr) {
            logger_1.default.warn('[AI] Error parsing JSON reply from model, falling back to regex: ' + String(parseErr));
            const nombre = text.substring(0, 30);
            const desc = text;
            const regimen = text.includes('semana') ? 'semana_semana' : (text.includes('fijo') ? 'fijo' : '15_15');
            const patronDescanso = text.includes('sabado') ? 'sabado' : (text.includes('domingo') ? 'domingo' : 'fin_de_semana_rotativo');
            const maxHours = text.match(/(\d+)\s*hor/i) ? Number(text.match(/(\d+)\s*hor/i)[1]) : null;
            const minBreak = text.match(/(\d+)\s*min/i) ? Number(text.match(/(\d+)\s*min/i)[1]) : null;
            const avoidSplit = text.includes('partido') || text.includes('partida');
            const line = text.match(/l[ií]nea\s*(\w+)/i) ? text.match(/l[ií]nea\s*(\w+)/i)[1] : null;
            parsedRule = {
                nombre,
                descripcion: desc,
                regimen,
                patronDescanso,
                maxHours,
                minBreakMinutes: minBreak,
                avoidSplitShifts: avoidSplit,
                lineConstraint: line,
            };
        }
        const rule = {
            nombre: String(parsedRule.nombre || 'Nueva Regla GenAI'),
            descripcion: String(parsedRule.descripcion || text),
            regimen: ['15_15', 'semana_semana', 'fijo'].includes(parsedRule.regimen) ? parsedRule.regimen : '15_15',
            patronDescanso: ['fin_de_semana_rotativo', 'sabado', 'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'].includes(parsedRule.patronDescanso)
                ? parsedRule.patronDescanso
                : 'fin_de_semana_rotativo',
            maxHours: parsedRule.maxHours != null ? Number(parsedRule.maxHours) : null,
            minBreakMinutes: parsedRule.minBreakMinutes != null ? Number(parsedRule.minBreakMinutes) : null,
            avoidSplitShifts: Boolean(parsedRule.avoidSplitShifts),
            lineConstraint: parsedRule.lineConstraint ? String(parsedRule.lineConstraint) : null,
        };
        res.json({ ok: true, data: rule });
    }
    catch (err) {
        logger_1.default.error('[AI] Parse preferences error', err);
        res.status(500).json({ error: 'No se pudo procesar la regla mediante IA', detail: String(err) });
    }
});
exports.default = router;
