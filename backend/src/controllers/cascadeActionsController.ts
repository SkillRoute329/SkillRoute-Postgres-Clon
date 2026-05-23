/**
 * cascadeActionsController — Acciones sobre eventos y cooldowns del motor
 * (FASE 5.35, 2026-05-22).
 *
 *   POST /api/cascade/events/:id/atender    → marca el evento como atendido
 *                                              (data_jsonb.atendido + por + ts)
 *                                              y opcionalmente limpia el cooldown
 *                                              relacionado para re-disparo inmediato.
 *
 *   POST /api/cascade/cooldown/clear        → limpia uno o varios cooldowns por
 *                                              { entity_type, entity_id, evento_tipo }.
 *                                              Body acepta array.
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { busEmit } from '../services/socketBus';

interface AtenderBody {
  liberarCooldown?: boolean;
  comentario?: string;
}

export async function atenderEvento(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, error: 'Id inválido' });
      return;
    }
    const body = (req.body ?? {}) as AtenderBody;
    const user = (req as Request & { user?: { id?: string; fullName?: string } }).user;
    const row = await sqlDb('logs_auditoria').where('id', id).andWhere('accion', 'consequencePreview').first();
    if (!row) {
      res.status(404).json({ ok: false, error: 'Evento no encontrado' });
      return;
    }
    const existing = (row.detalles_jsonb ?? {}) as Record<string, unknown>;
    const atencion = {
      atendido: true,
      atendidoPor: user?.fullName ?? user?.id ?? 'desconocido',
      atendidoEn: new Date().toISOString(),
      comentario: body.comentario ?? null,
    };
    const merged = { ...existing, atencion };
    await sqlDb('logs_auditoria').where('id', id).update({ detalles_jsonb: merged });

    // Opcional: liberar el cooldown asociado para que pueda re-disparar.
    let cooldownsLiberados = 0;
    if (body.liberarCooldown) {
      const ev = (existing as { evento?: Record<string, unknown> }).evento ?? {};
      const linea = String((ev.lineaId as string) ?? (ev.linea as string) ?? '');
      const agency = String((ev.agencyId as string) ?? (ev.empresaId as string) ?? '');
      const coche = String((ev.cocheId as string) ?? '');
      if (linea) {
        const key = `${agency || 'NA'}:${linea}`;
        cooldownsLiberados += await sqlDb('cascade_cooldowns')
          .where('entity_id', key)
          .delete();
      }
      if (coche) {
        cooldownsLiberados += await sqlDb('cascade_cooldowns')
          .where('entity_type', 'coche')
          .andWhere('entity_id', coche)
          .delete();
      }
    }

    busEmit('bus:cascade:atendido', { id, atencion, cooldownsLiberados });
    res.json({ ok: true, id, atencion, cooldownsLiberados });
  } catch (err) {
    logger.error('[cascade/atender]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error marcando atendido' });
  }
}

interface CooldownClearBody {
  items?: Array<{ entity_type: string; entity_id: string; evento_tipo?: string }>;
  entity_type?: string;
  entity_id?: string;
  evento_tipo?: string;
}

export async function clearCooldown(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as CooldownClearBody;
    const items = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : body.entity_type && body.entity_id
        ? [{ entity_type: body.entity_type, entity_id: body.entity_id, evento_tipo: body.evento_tipo }]
        : [];
    if (items.length === 0) {
      res.status(400).json({ ok: false, error: 'Falta { entity_type, entity_id [, evento_tipo] } o items[]' });
      return;
    }
    let deleted = 0;
    for (const it of items) {
      let q = sqlDb('cascade_cooldowns')
        .where('entity_type', it.entity_type)
        .andWhere('entity_id', it.entity_id);
      if (it.evento_tipo) q = q.andWhere('evento_tipo', it.evento_tipo);
      deleted += await q.delete();
    }
    busEmit('bus:cascade:cooldown-cleared', { items, deleted });
    res.json({ ok: true, deleted });
  } catch (err) {
    logger.error('[cascade/cooldown/clear]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error limpiando cooldown' });
  }
}
