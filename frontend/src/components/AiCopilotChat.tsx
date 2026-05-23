/**
 * AiCopilotChat — interfaz conversacional para el inspector.
 *
 * Habla con POST /api/ai/chat (llama3.1:8b + tool-calling).
 * No necesita saber nada de Ollama: el backend se encarga.
 *
 * Uso:
 *   <AiCopilotChat />                     // full-width, autónomo
 *   <AiCopilotChat className="max-w-2xl" />
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  Loader2,
  Wrench,
  AlertTriangle,
  User,
  Check,
  X,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import clsx from 'clsx';
import { authHeader } from '../utils/tokenStore';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  pendingOrders?: PendingOrder[];
}

interface PendingOrder {
  id: string;
  summary: string;
  status: 'suggested' | 'approved' | 'rejected';
  resolvedBy?: string;
}

interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  ok: boolean;
}

interface CopilotResponse {
  reply: string;
  tools_used: ToolTrace[];
  rounds: number;
  total_latency_ms: number;
  model: string;
}

interface TacticalContext {
  linea: string;
  destino: string;
  rivales: string[];
  puntosCarga: string[];
  estrategia: string;
}

interface Props {
  className?: string;
  placeholder?: string;
  initialContext?: TacticalContext;
}

const SUGGESTED = [
  '¿Cuántos coches tenemos en servicio?',
  '¿Cómo va el interno 55?',
  'Estado general de la flota',
  'Tácticas para la línea actual',
];

export default function AiCopilotChat({ className, placeholder, initialContext }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTools, setLastTools] = useState<ToolTrace[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  // Efecto para inyectar contexto táctico inicial
  useEffect(() => {
    if (initialContext && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `⚡ **Inteligencia Táctica Activada**\n\nLínea: **${initialContext.linea}**\nDestino: **${initialContext.destino}**\n\nRivales detectados: ${initialContext.rivales.join(', ')}\nZonas críticas: ${initialContext.puntosCarga.join(', ')}\n\n*${initialContext.estrategia}*`,
        },
      ]);
    }
  }, [initialContext, messages.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      setInput('');
      setLoading(true);

      try {
        const historyPayload = messages.slice(-12);
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader(),
          },
          body: JSON.stringify({ 
            history: historyPayload, 
            message: trimmed,
            context: initialContext // Inyectamos el mapa de guerra al backend
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.hint || body.error || `HTTP ${res.status}`);
        }

        const data = (await res.json()) as CopilotResponse;

        const pendingOrders: PendingOrder[] = data.tools_used
          .filter((t) => {
            const r = t.result as { order_id?: string; status?: string };
            return t.ok && r?.order_id && r?.status === 'suggested';
          })
          .map((t) => {
            const r = t.result as { order_id: string; summary: string };
            return { id: r.order_id, summary: r.summary, status: 'suggested' as const };
          });

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply, pendingOrders },
        ]);
        setLastTools(data.tools_used);
        setLastLatency(data.total_latency_ms);
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, loading],
  );

  const resolveOrder = useCallback(
    async (orderId: string, action: 'approve' | 'reject') => {
      const body = action === 'reject' ? { reason: 'Rechazado desde copiloto' } : {};
      try {
        const res = await fetch(`/api/ai/orders/${orderId}/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader(),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const { order } = (await res.json()) as {
          order: { id: string; status: PendingOrder['status']; approvedByUserId?: string; rejectedByUserId?: string };
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.pendingOrders
              ? {
                  ...m,
                  pendingOrders: m.pendingOrders.map((p) =>
                    p.id === orderId
                      ? {
                          ...p,
                          status: order.status,
                          resolvedBy: order.approvedByUserId ?? order.rejectedByUserId,
                        }
                      : p,
                  ),
                }
              : m,
          ),
        );
      } catch (err) {
        setError(`No se pudo ${action === 'approve' ? 'aprobar' : 'rechazar'}: ${String(err)}`);
      }
    },
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="p-2 bg-indigo-500/20 rounded-lg">
          <Bot className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Copiloto Táctico SkillRoute</h3>
          <p className="text-xs text-slate-400">llama3.1:8b · local</p>
        </div>
        {lastLatency !== null && (
          <span className="text-xs text-slate-500">{(lastLatency / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 mb-4">
              Preguntale al copiloto por el estado de la flota, coches específicos o sugerencias
              tácticas.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full border border-slate-700 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <div
              className={clsx('flex gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              <div
                className={clsx(
                  'flex-shrink-0 p-2 rounded-lg h-fit',
                  m.role === 'user' ? 'bg-indigo-500/20' : 'bg-slate-700',
                )}
              >
                {m.role === 'user' ? (
                  <User className="w-4 h-4 text-indigo-300" />
                ) : (
                  <Bot className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <div
                className={clsx(
                  'max-w-[80%] px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-100 border border-slate-700',
                )}
              >
                {m.content}
              </div>
            </div>

            {/* Tarjetas de sugerencia pendiente */}
            {m.pendingOrders?.map((order) => (
              <div
                key={order.id}
                className={clsx(
                  'ml-10 p-3 rounded-lg border text-sm',
                  order.status === 'suggested' &&
                    'bg-amber-500/10 border-amber-500/40 text-amber-100',
                  order.status === 'approved' &&
                    'bg-emerald-500/10 border-emerald-500/40 text-emerald-100',
                  order.status === 'rejected' &&
                    'bg-slate-700/40 border-slate-600 text-slate-400 line-through',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {order.status === 'suggested' && <AlertTriangle className="w-4 h-4" />}
                    {order.status === 'approved' && <ShieldCheck className="w-4 h-4" />}
                    {order.status === 'rejected' && <ShieldX className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-xs uppercase tracking-wide mb-1">
                      {order.status === 'suggested' && 'Sugerencia pendiente'}
                      {order.status === 'approved' && 'Aprobada'}
                      {order.status === 'rejected' && 'Rechazada'}
                    </div>
                    <p>{order.summary}</p>
                    <p className="text-[10px] opacity-70 mt-1">ID: {order.id}</p>
                  </div>
                </div>

                {order.status === 'suggested' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => resolveOrder(order.id, 'approve')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md transition"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprobar
                    </button>
                    <button
                      onClick={() => resolveOrder(order.id, 'reject')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-md transition"
                    >
                      <X className="w-3.5 h-3.5" /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 p-2 rounded-lg bg-slate-700 h-fit">
              <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
            </div>
            <div className="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-400">
              Consultando flota...
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No se pudo conectar al copiloto.</p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tools trace (auditoría) */}
      {lastTools.length > 0 && (
        <div className="px-4 py-2 bg-slate-800/50 border-t border-slate-700">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="w-3 h-3 text-slate-500" />
            <span className="text-xs text-slate-500">Datos consultados:</span>
            {lastTools.map((t, i) => (
              <span
                key={i}
                className={clsx(
                  'text-xs px-2 py-0.5 rounded',
                  t.ok
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30',
                )}
                title={JSON.stringify(t.args)}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700 bg-slate-800/50">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Preguntale al copiloto... (Enter para enviar)'}
            rows={1}
            disabled={loading}
            className="flex-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:border-indigo-500 focus:outline-none resize-none disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition"
            aria-label="Enviar"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
